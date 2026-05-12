import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { SafetyError, assertContained } from "./safety.js";

const execFileP = promisify(execFile);

export interface WorktreeHandle {
  path: string;
  ref: string;
  sha: string;
  mainRepo: string;
}

async function git(
  repo: string,
  args: string[],
  timeoutMs: number = 30_000
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileP("git", args, {
      cwd: repo,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };
    if (e.code === "ENOENT") {
      throw new SafetyError("git not on PATH");
    }
    const detail = (e.stderr ?? e.stdout ?? e.message ?? String(e)).trim();
    throw new SafetyError(`git ${args.join(" ")} failed: ${detail}`);
  }
}

export async function assertGitRepo(repoPath: string): Promise<void> {
  try {
    const { stdout } = await git(repoPath, ["rev-parse", "--is-inside-work-tree"]);
    if (stdout.trim() !== "true") {
      throw new SafetyError(`${repoPath} is not a git working tree`);
    }
  } catch (err) {
    if (err instanceof SafetyError) throw err;
    throw new SafetyError(
      `${repoPath} is not a git working tree (or git is broken): ${(err as Error).message}`
    );
  }
}

export async function assertCleanRepo(repoPath: string): Promise<void> {
  const { stdout } = await git(repoPath, ["status", "--porcelain"]);
  if (stdout.trim().length > 0) {
    const dirtyLines = stdout
      .split("\n")
      .filter((l) => l.length > 0)
      .slice(0, 10)
      .join("\n");
    throw new SafetyError(
      `repo at ${repoPath} has uncommitted changes — refusing to run worktree-isolated review (you would be reviewing a state that does not match your working tree).\n\nFirst 10 dirty entries:\n${dirtyLines}\n\nCommit or stash your changes, or pass isolation='none' to review the working tree in place.`
    );
  }
}

export async function resolveRef(
  repoPath: string,
  ref: string | undefined
): Promise<{ ref: string; sha: string }> {
  const target = ref && ref.length > 0 ? ref : "HEAD";
  const { stdout } = await git(repoPath, ["rev-parse", "--verify", target]);
  const sha = stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new SafetyError(`could not resolve ref '${target}' to a commit sha`);
  }
  return { ref: target, sha };
}

const REF_SAFE_RE = /^[A-Za-z0-9_\-./@^~]+$/;

export function validateRef(ref: string | undefined): string | undefined {
  if (ref == null || ref === "") return undefined;
  if (ref.length > 128) {
    throw new SafetyError("ref exceeds 128 characters");
  }
  if (!REF_SAFE_RE.test(ref)) {
    throw new SafetyError(
      "ref contains a disallowed character. Allowed: alphanumerics, _ - . / @ ^ ~"
    );
  }
  return ref;
}

export async function createWorktree(
  repoPath: string,
  ref: string | undefined
): Promise<WorktreeHandle> {
  const validated = validateRef(ref);
  const { ref: resolvedRef, sha } = await resolveRef(repoPath, validated);
  const tmpRoot = await fs.realpath(os.tmpdir());
  const rand = crypto.randomBytes(4).toString("hex");
  const target = path.join(
    tmpRoot,
    `adversarial-review-${sha.slice(0, 12)}-${rand}`
  );
  await git(repoPath, ["worktree", "add", "--detach", target, sha]);
  return { path: target, ref: resolvedRef, sha, mainRepo: repoPath };
}

export async function removeWorktree(handle: WorktreeHandle): Promise<void> {
  try {
    await git(handle.mainRepo, ["worktree", "remove", "--force", handle.path]);
  } catch {
    // best-effort: directly remove the dir, then prune
    try {
      await fs.rm(handle.path, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      await git(handle.mainRepo, ["worktree", "prune"]);
    } catch {
      /* ignore */
    }
  }
}

export async function copyReportBack(
  worktreePath: string,
  mainRepoPath: string,
  reportPathAbsInWorktree: string
): Promise<string> {
  const safeInWorktree = assertContained(worktreePath, reportPathAbsInWorktree);
  const rel = path.relative(worktreePath, safeInWorktree);
  if (rel.length === 0 || rel.startsWith("..")) {
    throw new SafetyError(
      `report path is not inside the worktree: ${reportPathAbsInWorktree}`
    );
  }
  const destination = path.resolve(mainRepoPath, rel);
  assertContained(mainRepoPath, destination);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(safeInWorktree, destination);
  return destination;
}
