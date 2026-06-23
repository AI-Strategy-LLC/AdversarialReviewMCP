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

// Each space-separated token must look like a CLI flag (starts with -)
// or a path/key (contains one of / . : = ,). This blocks prose sentences
// like "ignore all previous instructions" from reaching reviewer prompts.
const FLAG_SHAPED_RE = /^(-|[A-Za-z0-9]+[/.:=,])/;

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
  // Guard against natural-language prompt injection: every token must be
  // flag-shaped (e.g. --no-spec-to-code) or path-shaped (e.g. src/foo.ts:42).
  const tokens = args.split(/\s+/).filter(Boolean);
  if (tokens.length > 10) {
    throw new SafetyError(
      "args must not exceed 10 space-separated tokens"
    );
  }
  for (const tok of tokens) {
    if (!FLAG_SHAPED_RE.test(tok)) {
      throw new SafetyError(
        `args token "${tok}" does not look like a CLI flag or path. ` +
          "args must be flag-style overrides (e.g. --no-spec-to-code) or file paths (e.g. src/foo.ts:42)."
      );
    }
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

/**
 * Hardcoded refusal for credential stores and filesystem roots. Pure (no fs),
 * so it can be unit-tested directly. Enforced in validateRepoPath regardless of
 * allowlist configuration: the server will never point a reviewer — sandboxed or
 * not — at a known secret store or at the whole home/filesystem root. Returns a
 * human-readable reason when the path is protected, otherwise undefined.
 */
export function protectedPathRefusal(resolved: string): string | undefined {
  const home = os.homedir();
  // Exact-match refusals: the entire home dir or the filesystem root is never a
  // legitimate "repo" (subdirectories like ~/code/foo remain allowed).
  const exact = [home, path.parse(resolved).root];
  for (const e of exact) {
    if (e && resolved === e) {
      return `repo_path ${resolved} is a protected location (home directory or filesystem root) and cannot be reviewed.`;
    }
  }
  // Subtree refusals: credential / secret stores. The dir itself and anything
  // under it is refused.
  const trees = [
    ".ssh",
    ".aws",
    ".gnupg",
    ".kube",
    ".docker",
    ".azure",
    path.join(".config", "gcloud"),
  ]
    .map((d) => path.join(home, d))
    .concat(["/etc", "/private/etc", "/root", "/var/root"]);
  for (const t of trees) {
    if (resolved === t || resolved.startsWith(t + path.sep)) {
      return `repo_path ${resolved} is inside a protected credential store (${t}) and cannot be reviewed — this is a hardcoded denylist that even an allowlist cannot override.`;
    }
  }
  return undefined;
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
  // Credential-store denylist — enforced before (and independent of) the
  // allowlist, so even an explicitly-allowlisted secret dir is refused.
  const refusal = protectedPathRefusal(resolved);
  if (refusal) {
    throw new SafetyError(refusal);
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
  } else {
    // No allowlist configured — any existing directory is accepted.
    // This is intentional for local dev ergonomics, but means any
    // directory (including ~/.ssh, ~/) can be passed as repo_path.
    // Set ADVERSARIAL_REVIEW_ALLOWLIST or configure the allowlist file
    // to restrict which repositories this server will review.
    process.stderr.write(
      "[adversarial-review] WARNING: no allowlist configured — any directory will be accepted as repo_path. " +
        "Configure ADVERSARIAL_REVIEW_ALLOWLIST or ~/.config/agent-skills/adversarial-review/allowlist.txt to restrict access.\n"
    );
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
