import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  CANONICAL_ARTIFACTS,
  expandPathDate,
  extractArtifacts,
  renderArtifactContract,
  validateArtifactFormat,
  writeArtifacts,
  type ArtifactSpec,
} from "../src/artifacts.js";
import { SafetyError } from "../src/safety.js";
import { SKILL_NAMES } from "../src/types.js";

const SPEC_REPORT: ArtifactSpec = {
  id: "report",
  canonicalPath: "docs/test/REPORT.md",
  format: "markdown",
  begin: "<<<ARTIFACT:test:report BEGIN>>>",
  end: "<<<ARTIFACT:test:report END>>>",
};

const SPEC_FINDINGS: ArtifactSpec = {
  id: "findings",
  canonicalPath: "docs/test/findings.json",
  format: "json",
  begin: "<<<ARTIFACT:test:findings BEGIN>>>",
  end: "<<<ARTIFACT:test:findings END>>>",
};

describe("CANONICAL_ARTIFACTS", () => {
  it("has at least one artifact for every built-in skill", () => {
    for (const s of SKILL_NAMES) {
      expect(CANONICAL_ARTIFACTS[s]).toBeDefined();
      expect(CANONICAL_ARTIFACTS[s].length).toBeGreaterThan(0);
    }
  });
  it("uses the documented delimiter format per artifact", () => {
    for (const s of SKILL_NAMES) {
      for (const a of CANONICAL_ARTIFACTS[s]) {
        expect(a.begin).toBe(`<<<ARTIFACT:${s}:${a.id} BEGIN>>>`);
        expect(a.end).toBe(`<<<ARTIFACT:${s}:${a.id} END>>>`);
      }
    }
  });
  it("honesty-audit declares both report and findings artifacts", () => {
    const ids = CANONICAL_ARTIFACTS["honesty-audit"].map((a) => a.id);
    expect(ids).toContain("report");
    expect(ids).toContain("findings");
  });
});

describe("expandPathDate", () => {
  it("substitutes {YYYY-MM-DD} with a UTC date string", () => {
    const fixed = new Date(Date.UTC(2026, 4, 16)); // May = month index 4
    expect(
      expandPathDate("docs/reviews/DEEP_REVIEW_{YYYY-MM-DD}.md", fixed)
    ).toBe("docs/reviews/DEEP_REVIEW_2026-05-16.md");
  });
  it("leaves paths without the placeholder unchanged", () => {
    expect(expandPathDate("CHANGES.md")).toBe("CHANGES.md");
  });
});

describe("extractArtifacts", () => {
  it("extracts a well-formed delimited block", () => {
    const body = "# the report body\n\nfindings galore";
    const stdout = `chatter before\n${SPEC_REPORT.begin}\n${body}\n${SPEC_REPORT.end}\nchatter after`;
    const [a] = extractArtifacts(stdout, [SPEC_REPORT]);
    expect(a.delimiterFound).toBe(true);
    expect(a.content).toBe(body);
    expect(a.sizeBytes).toBe(Buffer.byteLength(body, "utf8"));
    expect(a.truncated).toBe(false);
  });

  it("returns delimiterFound: false when BEGIN is missing", () => {
    const stdout = `nothing structured here`;
    const [a] = extractArtifacts(stdout, [SPEC_REPORT]);
    expect(a.delimiterFound).toBe(false);
    expect(a.content).toBe("");
    expect(a.sizeBytes).toBe(0);
  });

  it("returns delimiterFound: false when END is missing", () => {
    const stdout = `${SPEC_REPORT.begin}\ncontent without a closing marker`;
    const [a] = extractArtifacts(stdout, [SPEC_REPORT]);
    expect(a.delimiterFound).toBe(false);
  });

  it("extracts multiple artifacts from a single stdout", () => {
    const report = "# r";
    const findings = '{"findings":[{"id":"x"}]}';
    const stdout = [
      "top chatter",
      SPEC_REPORT.begin,
      report,
      SPEC_REPORT.end,
      "middle chatter",
      SPEC_FINDINGS.begin,
      findings,
      SPEC_FINDINGS.end,
      "tail chatter",
    ].join("\n");
    const captured = extractArtifacts(stdout, [SPEC_REPORT, SPEC_FINDINGS]);
    expect(captured).toHaveLength(2);
    expect(captured[0].content).toBe(report);
    expect(captured[1].content).toBe(findings);
  });

  it("truncates oversized artifacts at the byte cap", () => {
    const big = "x".repeat(5000);
    const stdout = `${SPEC_REPORT.begin}\n${big}\n${SPEC_REPORT.end}`;
    const [a] = extractArtifacts(stdout, [SPEC_REPORT], 1024);
    expect(a.truncated).toBe(true);
    expect(a.sizeBytes).toBeLessThanOrEqual(1024);
    expect(a.content.length).toBeLessThanOrEqual(1024);
  });

  it("does not truncate mid-UTF-8 codepoint", () => {
    // Each emoji is 4 UTF-8 bytes. With a 10-byte cap we fit 2 emojis (8B).
    const emoji = "💥".repeat(100);
    const stdout = `${SPEC_REPORT.begin}\n${emoji}\n${SPEC_REPORT.end}`;
    const [a] = extractArtifacts(stdout, [SPEC_REPORT], 10);
    expect(a.truncated).toBe(true);
    // Decoded content must be a valid string with no replacement chars.
    expect(a.content).not.toContain("�");
    expect(Buffer.byteLength(a.content, "utf8")).toBeLessThanOrEqual(10);
  });

  it("expands {YYYY-MM-DD} in canonicalPath", () => {
    const spec: ArtifactSpec = {
      ...SPEC_REPORT,
      canonicalPath: "docs/reviews/REPORT_{YYYY-MM-DD}.md",
    };
    const [a] = extractArtifacts(
      `${spec.begin}\nhi\n${spec.end}`,
      [spec]
    );
    expect(a.canonicalPath).toMatch(/^docs\/reviews\/REPORT_\d{4}-\d{2}-\d{2}\.md$/);
  });
});

describe("validateArtifactFormat", () => {
  it("passes well-formed JSON", () => {
    const a = extractArtifacts(
      `${SPEC_FINDINGS.begin}\n{"findings":[]}\n${SPEC_FINDINGS.end}`,
      [SPEC_FINDINGS]
    )[0];
    expect(validateArtifactFormat(a)).toBeUndefined();
  });
  it("reports a warning on malformed JSON", () => {
    const a = extractArtifacts(
      `${SPEC_FINDINGS.begin}\nnot json{\n${SPEC_FINDINGS.end}`,
      [SPEC_FINDINGS]
    )[0];
    const w = validateArtifactFormat(a);
    expect(w).toBeDefined();
    expect(w).toContain("findings");
    expect(w).toContain("did not parse");
  });
  it("ignores markdown artifacts", () => {
    const a = extractArtifacts(
      `${SPEC_REPORT.begin}\n# anything\n${SPEC_REPORT.end}`,
      [SPEC_REPORT]
    )[0];
    expect(validateArtifactFormat(a)).toBeUndefined();
  });
  it("ignores artifacts with delimiterFound: false", () => {
    const a = extractArtifacts("nothing", [SPEC_FINDINGS])[0];
    expect(validateArtifactFormat(a)).toBeUndefined();
  });
});

describe("writeArtifacts", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), "advrev-artifacts-test-"));
  });

  afterEach(async () => {
    await fs.rm(repo, { recursive: true, force: true });
  });

  it("writes captured artifacts under repo_path and creates intermediate dirs", async () => {
    const captured = extractArtifacts(
      `${SPEC_REPORT.begin}\n# hello\n${SPEC_REPORT.end}`,
      [SPEC_REPORT]
    );
    const written = await writeArtifacts(repo, captured);
    expect(written).toHaveLength(1);
    expect(written[0]).toBe(path.join(repo, "docs/test/REPORT.md"));
    const back = await fs.readFile(written[0], "utf8");
    expect(back).toBe("# hello");
  });

  it("skips artifacts whose delimiters were not found", async () => {
    const captured = extractArtifacts("nothing structured", [SPEC_REPORT]);
    const written = await writeArtifacts(repo, captured);
    expect(written).toHaveLength(0);
  });

  it("rejects a canonical path that escapes repo_path", async () => {
    const escape: ArtifactSpec = {
      ...SPEC_REPORT,
      canonicalPath: "../../etc/passwd",
    };
    const captured = extractArtifacts(
      `${escape.begin}\npayload\n${escape.end}`,
      [escape]
    );
    await expect(writeArtifacts(repo, captured)).rejects.toBeInstanceOf(
      SafetyError
    );
  });
});

describe("renderArtifactContract", () => {
  it("includes the no-write instruction", () => {
    const out = renderArtifactContract("deep-review");
    expect(out).toContain("MUST NOT attempt to write files");
  });
  it("lists every artifact's begin and end markers", () => {
    const out = renderArtifactContract("honesty-audit");
    for (const a of CANONICAL_ARTIFACTS["honesty-audit"]) {
      expect(out).toContain(a.begin);
      expect(out).toContain(a.end);
      expect(out).toContain(a.canonicalPath);
    }
  });
  it("renders for every built-in skill", () => {
    for (const s of SKILL_NAMES) {
      const out = renderArtifactContract(s);
      expect(out).toContain("ARTIFACT EMISSION CONTRACT");
      expect(out.length).toBeGreaterThan(100);
    }
  });
});
