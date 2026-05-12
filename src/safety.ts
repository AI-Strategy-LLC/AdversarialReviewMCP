import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const MAX_STDOUT_BYTES = 16 * 1024;

const ARGS_SAFE_RE = /^[A-Za-z0-9 _\-./=,:]*$/;
const MODEL_SAFE_RE = /^[A-Za-z0-9_\-./:@]+$/;

export class SafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafetyError";
  }
}

export function validateArgs(args: string | undefined): string {
  if (args == null || args === "") return "";
  if (args.length > 512) {
    throw new SafetyError("args exceeds 512 characters");
  }
  if (!ARGS_SAFE_RE.test(args)) {
    throw new SafetyError(
      "args contains a disallowed character. Allowed: alphanumerics, space, _ - . / = , :"
    );
  }
  return args;
}

export function validateModel(model: string | undefined): string | undefined {
  if (model == null || model === "") return undefined;
  if (model.length > 128) {
    throw new SafetyError("model name exceeds 128 characters");
  }
  if (!MODEL_SAFE_RE.test(model)) {
    throw new SafetyError(
      "model name contains a disallowed character. Allowed: alphanumerics, _ - . / : @"
    );
  }
  return model;
}

export async function loadAllowlist(): Promise<string[] | null> {
  const fromEnv = process.env.ADVERSARIAL_REVIEW_ALLOWLIST;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.split(":").map((p) => path.resolve(p));
  }
  const cfgPath = path.join(
    os.homedir(),
    ".config",
    "agent-skills",
    "adversarial-review",
    "allowlist.txt"
  );
  try {
    const raw = await fs.readFile(cfgPath, "utf8");
    const entries = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => path.resolve(line));
    return entries.length > 0 ? entries : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function validateRepoPath(
  repoPath: string,
  allowlist: string[] | null
): Promise<string> {
  if (!repoPath || typeof repoPath !== "string") {
    throw new SafetyError("repo_path is required");
  }
  if (!path.isAbsolute(repoPath)) {
    throw new SafetyError(`repo_path must be absolute: ${repoPath}`);
  }
  const resolved = path.resolve(repoPath);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new SafetyError(`repo_path does not exist: ${resolved}`);
  }
  if (!stat.isDirectory()) {
    throw new SafetyError(`repo_path is not a directory: ${resolved}`);
  }
  if (allowlist && allowlist.length > 0) {
    const allowed = allowlist.some(
      (entry) =>
        resolved === entry || resolved.startsWith(entry + path.sep)
    );
    if (!allowed) {
      throw new SafetyError(
        `repo_path ${resolved} is not on the allowlist. Configure ADVERSARIAL_REVIEW_ALLOWLIST or ~/.config/agent-skills/adversarial-review/allowlist.txt to permit it.`
      );
    }
  }
  return resolved;
}

export function assertContained(parentDir: string, childPath: string): string {
  const parent = path.resolve(parentDir);
  const child = path.resolve(childPath);
  if (child !== parent && !child.startsWith(parent + path.sep)) {
    throw new SafetyError(
      `path ${child} is outside repo ${parent} (containment violation)`
    );
  }
  return child;
}

export function truncateStdout(s: string, max: number = MAX_STDOUT_BYTES): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const omitted = s.length - max;
  return `${head}\n…\n[truncated ${omitted} bytes — full stream available in server log]`;
}
