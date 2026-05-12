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
}

export const CANONICAL_REPORT_PATH: Record<SkillName, string> = {
  "deep-review": "docs/reviews/DEEP_REVIEW_{YYYY-MM-DD}.md",
  "branch-review": "CHANGES.md",
  "bdd-audit": "docs/bdd-audit/REPORT.md",
  "honesty-audit": "docs/honesty-audit/REPORT.md",
  "counter-patterns": "docs/counter-patterns/REPORT.md",
  "coverage-audit": "docs/coverage-audit/REPORT.md",
};
