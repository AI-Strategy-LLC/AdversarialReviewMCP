export const SKILL_NAMES = [
  "deep-review",
  "branch-review",
  "bdd-audit",
  "honesty-audit",
  "counter-patterns",
  "coverage-audit",
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

export const REVIEWER_NAMES = [
  "codex",
  "antigravity",
  "opencode",
  "crush",
  "kilo",
  "glm",
  "copilot",
  "claude",
] as const;

export type ReviewerName = (typeof REVIEWER_NAMES)[number];
export type ReviewerSelector = ReviewerName | "auto";

export const ISOLATION_MODES = ["worktree", "none"] as const;
export type IsolationMode = (typeof ISOLATION_MODES)[number];
export const DEFAULT_ISOLATION: IsolationMode = "worktree";

/**
 * Order tried by reviewer='auto'. `claude` is last and is skipped entirely
 * when the host is Claude Code (CLAUDECODE env var set) — the whole point of
 * adversarial review is a *different* model than the one that did the work.
 */
export const AUTO_FALLBACK_ORDER: ReviewerName[] = [
  "codex",
  "antigravity",
  "copilot",
  "crush",
  "opencode",
  "kilo",
  "glm",
  "claude",
];

/** Env var Claude Code sets in every child process (incl. MCP servers). */
export const CLAUDE_HOST_ENV = "CLAUDECODE";

export interface ModelList {
  /** Model references in the exact form the CLI's model flag accepts. */
  models: string[];
  /** Human-readable caveat (e.g. "static aliases only"). */
  note?: string;
}

export interface ProbeResult {
  installed: boolean;
  binaryPath?: string;
  version?: string;
  error?: string;
}

export interface AuthState {
  authenticated: boolean;
  detail?: string;
}

export interface BuildCommandInput {
  skill: SkillName;
  repoPath: string;
  prompt: string;
  args?: string;
  model?: string;
}

export interface BuildCommandResult {
  argv: string[];
  stdin?: string;
  env?: Record<string, string>;
  cwd: string;
}

export interface ParseOutputInput {
  stdout: string;
  stderr: string;
  exitCode: number;
  repoPath: string;
  skill: SkillName;
}

export interface ParseOutputResult {
  reportPath?: string;
  summary: string;
  findingsCount?: number;
  modelUsed?: string;
}

export interface Adapter {
  name: ReviewerName;
  binary: string;
  supportsReadOnlySandbox: boolean;
  supportsEphemeralSession: boolean;
  supportsDisablingMcpServers: boolean;
  /**
   * Whether `authCheck()` actually verifies a credential (env var / config /
   * login session) vs. optimistically assuming the ambient session is valid.
   * When false, `authenticated: true` means "binary present, not verified" and
   * a real auth failure only surfaces at run time. Surfaced in list_reviewers
   * notes so the distinction is visible at the tool surface.
   */
  verifiesAuth: boolean;

  probe(): Promise<ProbeResult>;
  authCheck(): Promise<AuthState>;
  buildCommand(input: BuildCommandInput): BuildCommandResult;
  parseOutput(input: ParseOutputInput): ParseOutputResult;
  /**
   * Enumerate model references the CLI can route right now, in the exact
   * form `buildCommand({ model })` expects. Optional: CLIs with no model
   * listing command omit it and `list_models` says so.
   */
  listModels?(): Promise<ModelList>;
}

export interface ReviewerStatus {
  cli: ReviewerName;
  installed: boolean;
  binaryPath?: string;
  version?: string;
  authenticated: boolean;
  supportedSkills: SkillName[];
  notes?: string;
}

export interface ReviewResult {
  provider: ReviewerName;
  model: string;
  exitCode: number;
  reportPath?: string;
  summary: string;
  rawStdout: string;
  rawStderr: string;
  durationS: number;
  findingsCount?: number;
  /** Absolute paths of artifacts captured from reviewer stdout and written. */
  writtenArtifacts?: string[];
  isolation: IsolationMode;
  reviewedRef?: string;
  reviewedSha?: string;
  worktreePath?: string;
}

export const CANONICAL_REPORT_PATH: Record<SkillName, string> = {
  "deep-review": "docs/reviews/DEEP_REVIEW_{YYYY-MM-DD}.md",
  "branch-review": "CHANGES.md",
  "bdd-audit": "docs/bdd-audit/REPORT.md",
  "honesty-audit": "docs/honesty-audit/REPORT.md",
  "counter-patterns": "docs/counter-patterns/REPORT.md",
  "coverage-audit": "docs/coverage-audit/REPORT.md",
};
