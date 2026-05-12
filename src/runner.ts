import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getAdapter } from "./adapters/index.js";
import {
  AUTO_FALLBACK_ORDER,
  DEFAULT_ISOLATION,
  ISOLATION_MODES,
  REVIEWER_NAMES,
  SKILL_NAMES,
  type IsolationMode,
  type ReviewResult,
  type ReviewerName,
  type SkillName,
} from "./types.js";
import {
  SafetyError,
  assertContained,
  loadAllowlist,
  truncateStdout,
  validateArgs,
  validateModel,
  validateRepoPath,
} from "./safety.js";
import {
  assertCleanRepo,
  assertGitRepo,
  copyReportBack,
  createWorktree,
  removeWorktree,
  resolveRef,
  validateRef,
  type WorktreeHandle,
} from "./worktree.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_DIR = path.join(__dirname, "prompts");

export const ReviewInputSchema = z.object({
  skill: z.enum(SKILL_NAMES),
  reviewer: z.enum([...REVIEWER_NAMES, "auto"] as const),
  repo_path: z.string(),
  args: z.string().optional(),
  model: z.string().optional(),
  timeout_s: z.number().int().positive().max(3600).optional(),
  ref: z.string().optional(),
  isolation: z.enum(ISOLATION_MODES).optional(),
});

export type ReviewInput = z.infer<typeof ReviewInputSchema>;

async function loadPromptTemplate(skill: SkillName): Promise<string> {
  const p = path.join(PROMPT_DIR, `${skill}.txt`);
  return fs.readFile(p, "utf8");
}

function renderPrompt(
  template: string,
  vars: { REPO_PATH: string; ARGS: string }
): string {
  return template
    .replace(/\{\{REPO_PATH\}\}/g, vars.REPO_PATH)
    .replace(/\{\{ARGS\}\}/g, vars.ARGS || "(none)");
}

async function selectReviewer(
  selector: ReviewerName | "auto"
): Promise<ReviewerName> {
  if (selector !== "auto") return selector;
  for (const candidate of AUTO_FALLBACK_ORDER) {
    const adapter = getAdapter(candidate);
    const probe = await adapter.probe();
    if (!probe.installed) continue;
    const auth = await adapter.authCheck();
    if (!auth.authenticated) continue;
    return candidate;
  }
  throw new SafetyError(
    "No reviewer CLI is both installed and authenticated. Install at least one of: codex, gemini, crush, opencode, kilo."
  );
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationS: number;
}

function runSubprocess(
  argv: string[],
  cwd: string,
  env: Record<string, string> | undefined,
  stdinPayload: string | undefined,
  timeoutMs: number
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const [cmd, ...rest] = argv;
    if (!cmd) {
      resolve({
        stdout: "",
        stderr: "empty argv",
        exitCode: 2,
        timedOut: false,
        durationS: 0,
      });
      return;
    }
    const child = spawn(cmd, rest, {
      cwd,
      env: { ...process.env, ...(env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr + `\nspawn error: ${err.message}`,
        exitCode: 127,
        timedOut: false,
        durationS: (Date.now() - startedAt) / 1000,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? (timedOut ? 124 : 1),
        timedOut,
        durationS: (Date.now() - startedAt) / 1000,
      });
    });

    if (stdinPayload != null) {
      child.stdin?.write(stdinPayload);
    }
    child.stdin?.end();
  });
}

async function countFindings(
  repoPath: string,
  skill: SkillName
): Promise<number | undefined> {
  if (skill !== "honesty-audit") return undefined;
  const findingsPath = path.join(repoPath, "docs/honesty-audit/findings.json");
  try {
    const raw = await fs.readFile(findingsPath, "utf8");
    const parsed = JSON.parse(raw) as { findings?: unknown[] };
    return Array.isArray(parsed.findings) ? parsed.findings.length : undefined;
  } catch {
    return undefined;
  }
}

export async function runReview(input: ReviewInput): Promise<ReviewResult> {
  const allowlist = await loadAllowlist();
  const repoPath = await validateRepoPath(input.repo_path, allowlist);
  const args = validateArgs(input.args);
  const model = validateModel(input.model);
  const ref = validateRef(input.ref);
  const isolation: IsolationMode = input.isolation ?? DEFAULT_ISOLATION;

  if (ref && isolation === "none") {
    throw new SafetyError(
      "ref is only meaningful with isolation='worktree'. Either remove ref or set isolation='worktree'."
    );
  }

  const reviewer = await selectReviewer(input.reviewer);
  const adapter = getAdapter(reviewer);

  const probe = await adapter.probe();
  if (!probe.installed) {
    throw new SafetyError(
      `Reviewer '${reviewer}' is not installed: ${probe.error ?? "binary not found"}`
    );
  }
  const auth = await adapter.authCheck();
  if (!auth.authenticated) {
    throw new SafetyError(
      `Reviewer '${reviewer}' is not authenticated: ${auth.detail ?? "no detail"}`
    );
  }

  let worktree: WorktreeHandle | undefined;
  let reviewerCwd = repoPath;
  let reviewedRef: string | undefined;
  let reviewedSha: string | undefined;

  if (isolation === "worktree") {
    await assertGitRepo(repoPath);
    if (!ref) {
      // implicit HEAD: still require clean tree so the reviewer sees what's committed
      await assertCleanRepo(repoPath);
    }
    worktree = await createWorktree(repoPath, ref);
    reviewerCwd = worktree.path;
    reviewedRef = worktree.ref;
    reviewedSha = worktree.sha;
  } else {
    const resolved = await resolveRef(repoPath, "HEAD").catch(() => undefined);
    if (resolved) {
      reviewedRef = "(working tree)";
      reviewedSha = resolved.sha;
    }
  }

  try {
    const template = await loadPromptTemplate(input.skill);
    const prompt = renderPrompt(template, {
      REPO_PATH: reviewerCwd,
      ARGS: args,
    });

    const cmd = adapter.buildCommand({
      skill: input.skill,
      repoPath: reviewerCwd,
      prompt,
      args,
      model,
    });

    const timeoutMs = (input.timeout_s ?? 900) * 1000;
    const spawned = await runSubprocess(
      [adapter.binary, ...cmd.argv],
      cmd.cwd,
      cmd.env,
      cmd.stdin,
      timeoutMs
    );

    const parsed = adapter.parseOutput({
      stdout: spawned.stdout,
      stderr: spawned.stderr,
      exitCode: spawned.exitCode,
      repoPath: reviewerCwd,
      skill: input.skill,
    });

    let reportPath: string | undefined;
    if (parsed.reportPath) {
      try {
        const inSpawnDir = assertContained(reviewerCwd, parsed.reportPath);
        await fs.access(inSpawnDir);
        if (worktree) {
          // copy from worktree back to the developer's repo
          reportPath = await copyReportBack(
            worktree.path,
            repoPath,
            inSpawnDir
          );
        } else {
          reportPath = inSpawnDir;
        }
      } catch {
        reportPath = undefined;
      }
    }

    const findingsCount = await countFindings(repoPath, input.skill);

    return {
      provider: reviewer,
      model: parsed.modelUsed ?? model ?? "(default)",
      exitCode: spawned.timedOut ? 124 : spawned.exitCode,
      reportPath,
      summary: spawned.timedOut
        ? `(timeout after ${input.timeout_s ?? 900}s)\n${parsed.summary}`
        : parsed.summary,
      rawStdout: truncateStdout(spawned.stdout),
      rawStderr: truncateStdout(spawned.stderr),
      durationS: spawned.durationS,
      findingsCount,
      isolation,
      reviewedRef,
      reviewedSha,
      worktreePath: worktree?.path,
    };
  } finally {
    if (worktree) {
      await removeWorktree(worktree);
    }
  }
}
