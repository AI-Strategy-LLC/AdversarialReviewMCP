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
  "gemini",
  "opencode",
  "crush",
  "kilo",
] as const;

export type ReviewerName = (typeof REVIEWER_NAMES)[number];
export type ReviewerSelector = ReviewerName | "auto";

export const ISOLATION_MODES = ["worktree", "none"] as const;
export type IsolationMode = (typeof ISOLATION_MODES)[number];
export const DEFAULT_ISOLATION: IsolationMode = "worktree";

export const AUTO_FALLBACK_ORDER: ReviewerName[] = [
  "codex",
  "gemini",
  "crush",
  "opencode",
  "kilo",
];

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

  probe(): Promise<ProbeResult>;
  authCheck(): Promise<AuthState>;
  buildCommand(input: BuildCommandInput): BuildCommandResult;
  parseOutput(input: ParseOutputInput): ParseOutputResult;
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
  isolation: IsolationMode;
  reviewedRef?: string;
  reviewedSha?: string;
  worktreePath?: string;
  /**
   * Per-artifact capture from the reviewer's stdout. Each entry corresponds
   * to a CANONICAL_ARTIFACTS[skill] spec, in declaration order.
   *
   * Contract: the reviewer runs in a read-only sandbox and is instructed to
   * emit each artifact wrapped in skill-specific BEGIN/END delimiters. The
   * server captures the body and returns it here. The CALLING AGENT is
   * responsible for writing each artifact's `content` to its `canonicalPath`
   * inside `repo_path` (unless `write_artifacts` was true on the request, in
   * which case the server already wrote them — `reportPath` will be
   * populated for back-compat).
   *
   * `delimiterFound: false` means the reviewer did not emit the delimited
   * block — the caller should fall back to parsing `rawStdout` / `summary`.
   */
  artifacts: CapturedArtifactSummary[];
  /**
   * Explicit marker telling the caller what they need to do with `artifacts`.
   * Always `"caller_should_write"` for review-mode results — even when
   * `write_artifacts` was true and the server already wrote them, the caller
   * may want to re-write or relocate.
   */
  writeIntent: "caller_should_write";
  /**
   * Subset of `artifacts` warnings — e.g. `format=json` artifact that failed
   * to parse. Empty array when no warnings.
   */
  artifactWarnings: string[];
}

/**
 * Wire-shape of a captured artifact returned to the MCP caller. Mirrors
 * `CapturedArtifact` in `src/artifacts.ts` but lives here so callers can
 * type-check against `ReviewResult` without importing the implementation
 * module.
 */
export interface CapturedArtifactSummary {
  id: string;
  canonicalPath: string;
  format: "markdown" | "json" | "text";
  content: string;
  sizeBytes: number;
  delimiterFound: boolean;
  truncated: boolean;
}

export const CANONICAL_REPORT_PATH: Record<SkillName, string> = {
  "deep-review": "docs/reviews/DEEP_REVIEW_{YYYY-MM-DD}.md",
  "branch-review": "CHANGES.md",
  "bdd-audit": "docs/bdd-audit/REPORT.md",
  "honesty-audit": "docs/honesty-audit/REPORT.md",
  "counter-patterns": "docs/counter-patterns/REPORT.md",
  "coverage-audit": "docs/coverage-audit/REPORT.md",
};
