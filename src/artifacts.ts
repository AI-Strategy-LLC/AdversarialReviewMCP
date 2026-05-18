import { promises as fs } from "node:fs";
import path from "node:path";
import { assertContained, SafetyError } from "./safety.js";
import type { SkillName } from "./types.js";

export type ArtifactFormat = "markdown" | "json" | "text";

export interface ArtifactSpec {
  id: string;
  /** May contain `{YYYY-MM-DD}` — expanded at extraction time. */
  canonicalPath: string;
  format: ArtifactFormat;
  begin: string;
  end: string;
}

export interface CapturedArtifact {
  id: string;
  canonicalPath: string;
  format: ArtifactFormat;
  content: string;
  sizeBytes: number;
  delimiterFound: boolean;
  truncated: boolean;
}

const MAX_BYTES_PER_ARTIFACT_DEFAULT = 1024 * 1024;

function makeSpec(
  skill: SkillName,
  id: string,
  canonicalPath: string,
  format: ArtifactFormat
): ArtifactSpec {
  return {
    id,
    canonicalPath,
    format,
    begin: `<<<ARTIFACT:${skill}:${id} BEGIN>>>`,
    end: `<<<ARTIFACT:${skill}:${id} END>>>`,
  };
}

/**
 * The canonical artifact specs for each built-in review skill. This is the
 * single source of truth that drives:
 *   1. the `{{ARTIFACT_CONTRACT}}` block rendered into the reviewer's prompt
 *   2. the runner-side extractor that pulls the artifact bodies back out of
 *      stdout
 *   3. the server-side write step (when `write_artifacts: true`)
 *
 * Order matters — `artifacts[0]` is treated as the "primary" artifact when
 * back-compat code asks for a single `reportPath`.
 */
export const CANONICAL_ARTIFACTS: Record<SkillName, ArtifactSpec[]> = {
  "deep-review": [
    makeSpec(
      "deep-review",
      "report",
      "docs/reviews/DEEP_REVIEW_{YYYY-MM-DD}.md",
      "markdown"
    ),
  ],
  "branch-review": [
    makeSpec("branch-review", "report", "CHANGES.md", "markdown"),
  ],
  "bdd-audit": [
    makeSpec("bdd-audit", "report", "docs/bdd-audit/REPORT.md", "markdown"),
  ],
  "honesty-audit": [
    makeSpec(
      "honesty-audit",
      "report",
      "docs/honesty-audit/REPORT.md",
      "markdown"
    ),
    makeSpec(
      "honesty-audit",
      "findings",
      "docs/honesty-audit/findings.json",
      "json"
    ),
  ],
  "counter-patterns": [
    makeSpec(
      "counter-patterns",
      "report",
      "docs/counter-patterns/REPORT.md",
      "markdown"
    ),
  ],
  "coverage-audit": [
    makeSpec(
      "coverage-audit",
      "report",
      "docs/coverage-audit/REPORT.md",
      "markdown"
    ),
  ],
};

export function expandPathDate(p: string, now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear().toString().padStart(4, "0");
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = now.getUTCDate().toString().padStart(2, "0");
  return p.replace(/\{YYYY-MM-DD\}/g, `${yyyy}-${mm}-${dd}`);
}

/**
 * Largest UTF-8 prefix of `s` that fits within `maxBytes`. Used to cap captured
 * artifact bodies without truncating mid-codepoint.
 */
function truncateToBytes(
  s: string,
  maxBytes: number
): { value: string; truncated: boolean } {
  if (Buffer.byteLength(s, "utf8") <= maxBytes) {
    return { value: s, truncated: false };
  }
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (Buffer.byteLength(s.slice(0, mid), "utf8") <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  return { value: s.slice(0, lo), truncated: true };
}

/**
 * Scan `stdout` for each spec's BEGIN/END pair and return the captured body.
 * When a pair is missing the artifact is returned with `delimiterFound: false`
 * and empty content — the caller can fall back to other recovery strategies.
 *
 * Captures use the FIRST occurrence of BEGIN and the FIRST END after it.
 * Repeated BEGINs / nested markers are not supported; the reviewer is
 * instructed to emit each artifact exactly once in its prompt.
 */
export function extractArtifacts(
  stdout: string,
  specs: ArtifactSpec[],
  maxBytesPerArtifact: number = MAX_BYTES_PER_ARTIFACT_DEFAULT
): CapturedArtifact[] {
  return specs.map((spec) => {
    const canonicalPath = expandPathDate(spec.canonicalPath);
    const beginIdx = stdout.indexOf(spec.begin);
    if (beginIdx === -1) {
      return {
        id: spec.id,
        canonicalPath,
        format: spec.format,
        content: "",
        sizeBytes: 0,
        delimiterFound: false,
        truncated: false,
      };
    }
    const contentStart = beginIdx + spec.begin.length;
    const endIdx = stdout.indexOf(spec.end, contentStart);
    if (endIdx === -1) {
      return {
        id: spec.id,
        canonicalPath,
        format: spec.format,
        content: "",
        sizeBytes: 0,
        delimiterFound: false,
        truncated: false,
      };
    }
    // Trim a single leading and trailing newline. The prompt instructs the
    // reviewer to put each delimiter on its own line; stripping those bracketing
    // newlines gives the caller the bare artifact body.
    let body = stdout.slice(contentStart, endIdx);
    body = body.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    const { value, truncated } = truncateToBytes(body, maxBytesPerArtifact);
    return {
      id: spec.id,
      canonicalPath,
      format: spec.format,
      content: value,
      sizeBytes: Buffer.byteLength(value, "utf8"),
      delimiterFound: true,
      truncated,
    };
  });
}

/**
 * Write each captured artifact (that had its delimiters found) to its canonical
 * path inside `repoPath`. Returns the list of absolute paths written. Skips
 * artifacts with `delimiterFound: false`. Containment-checked.
 */
export async function writeArtifacts(
  repoPath: string,
  artifacts: CapturedArtifact[]
): Promise<string[]> {
  const written: string[] = [];
  for (const a of artifacts) {
    if (!a.delimiterFound) continue;
    const target = path.resolve(repoPath, a.canonicalPath);
    const safe = assertContained(repoPath, target);
    await fs.mkdir(path.dirname(safe), { recursive: true });
    await fs.writeFile(safe, a.content, "utf8");
    written.push(safe);
  }
  return written;
}

/**
 * Render the "ARTIFACT EMISSION CONTRACT" block that gets substituted into
 * each prompt template's `{{ARTIFACT_CONTRACT}}` slot. Single source of truth
 * for the contract wording — the per-skill variation is only the delimiter
 * names + canonical paths.
 */
export function renderArtifactContract(skill: SkillName): string {
  const artifacts = CANONICAL_ARTIFACTS[skill];
  if (!artifacts || artifacts.length === 0) {
    return "ARTIFACT EMISSION CONTRACT: this skill declares no artifacts.";
  }
  const lines: string[] = [];
  lines.push("# ARTIFACT EMISSION CONTRACT — MANDATORY");
  lines.push("");
  lines.push(
    "You are running inside a read-only sandbox. You MUST NOT attempt to write files —"
  );
  lines.push(
    "any such attempt will fail silently. Instead, emit each artifact on stdout"
  );
  lines.push(
    "wrapped in the delimiters listed below. The MCP server captures them between the"
  );
  lines.push(
    "delimiter pairs and returns them to the calling agent, which writes the files."
  );
  lines.push("");
  lines.push("Rules:");
  lines.push(
    "  - Each delimiter must appear on its OWN LINE, exact byte-for-byte match."
  );
  lines.push(
    "  - Emit the BEGIN marker, then the artifact content verbatim, then the END marker."
  );
  lines.push(
    "  - Do NOT wrap the content in extra code fences or quoting — emit the raw bytes."
  );
  lines.push(
    "  - Anything outside the delimiter pairs is treated as ordinary stdout summary."
  );
  lines.push(
    "  - Each artifact must be emitted exactly once. Repeated BEGIN markers are unsupported."
  );
  lines.push("");
  lines.push("Artifacts for this skill:");
  lines.push("");
  for (const a of artifacts) {
    lines.push(`  - id:             ${a.id}`);
    lines.push(`    canonical_path: ${a.canonicalPath}`);
    lines.push(`    format:         ${a.format}`);
    lines.push(`    begin marker:   ${a.begin}`);
    lines.push(`    end marker:     ${a.end}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Validate that a CapturedArtifact whose declared format is `json` actually
 * parses as JSON. Returns `undefined` on success, a short error string on
 * failure. Used by the runner to attach a per-artifact warning without
 * failing the whole run.
 */
export function validateArtifactFormat(a: CapturedArtifact): string | undefined {
  if (!a.delimiterFound) return undefined;
  if (a.format !== "json") return undefined;
  try {
    JSON.parse(a.content);
    return undefined;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `artifact '${a.id}' declared format=json but did not parse: ${msg}`;
  }
}

// Re-export SafetyError so callers that import only from this module can
// handle the containment-violation error without a second import path.
export { SafetyError };
