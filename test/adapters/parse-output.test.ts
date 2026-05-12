import { describe, it, expect } from "vitest";
import {
  defaultParseOutput,
  findReportPath,
  reportPathRegex,
} from "../../src/adapters/_helpers.js";
import { SKILL_NAMES } from "../../src/types.js";

describe("reportPathRegex", () => {
  it("matches deep-review dated path", () => {
    const re = reportPathRegex("deep-review");
    expect("docs/reviews/DEEP_REVIEW_2026-05-12.md").toMatch(re);
    expect("docs/reviews/DEEP_REVIEW_NOT_A_DATE.md").not.toMatch(re);
  });
  it("matches honesty-audit fixed path", () => {
    const re = reportPathRegex("honesty-audit");
    expect("docs/honesty-audit/REPORT.md").toMatch(re);
  });
  it("compiles for every skill", () => {
    for (const s of SKILL_NAMES) {
      expect(() => reportPathRegex(s)).not.toThrow();
    }
  });
});

describe("findReportPath", () => {
  it("returns absolute path inside repo", () => {
    const stdout =
      "...\nReport written to docs/honesty-audit/REPORT.md\nDone.";
    const out = findReportPath("honesty-audit", stdout, "/tmp/repo");
    expect(out).toBe("/tmp/repo/docs/honesty-audit/REPORT.md");
  });
  it("returns undefined when no path mentioned", () => {
    const stdout = "no path here, just summary text";
    expect(findReportPath("honesty-audit", stdout, "/tmp/repo")).toBeUndefined();
  });
});

describe("defaultParseOutput", () => {
  it("returns the tail of stdout as summary", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const out = defaultParseOutput({
      stdout: lines.join("\n"),
      stderr: "",
      exitCode: 0,
      repoPath: "/tmp/repo",
      skill: "honesty-audit",
    });
    expect(out.summary).toContain("line 99");
    expect(out.summary).not.toContain("line 0");
  });
});
