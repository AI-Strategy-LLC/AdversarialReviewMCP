import { describe, it, expect } from "vitest";
import {
  SafetyError,
  assertContained,
  truncateStdout,
  validateArgs,
  validateModel,
  validateRepoPath,
} from "../src/safety.js";

describe("validateArgs", () => {
  it("accepts empty / undefined", () => {
    expect(validateArgs(undefined)).toBe("");
    expect(validateArgs("")).toBe("");
  });
  it("accepts safe args", () => {
    expect(validateArgs("--no-spec-to-code")).toBe("--no-spec-to-code");
    expect(validateArgs("--mode=check,verbose")).toBe("--mode=check,verbose");
    expect(validateArgs("a/b.txt:42")).toBe("a/b.txt:42");
  });
  it("rejects shell metacharacters", () => {
    expect(() => validateArgs("--foo; rm -rf /")).toThrow(SafetyError);
    expect(() => validateArgs("--foo `whoami`")).toThrow(SafetyError);
    expect(() => validateArgs("--foo$(whoami)")).toThrow(SafetyError);
    expect(() => validateArgs("a|b")).toThrow(SafetyError);
    expect(() => validateArgs("a\nb")).toThrow(SafetyError);
  });
  it("rejects over-long input", () => {
    expect(() => validateArgs("a".repeat(513))).toThrow(SafetyError);
  });
});

describe("validateModel", () => {
  it("accepts known shapes", () => {
    expect(validateModel("gpt-4o")).toBe("gpt-4o");
    expect(validateModel("anthropic/claude-sonnet-4-6")).toBe(
      "anthropic/claude-sonnet-4-6"
    );
    expect(validateModel("gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });
  it("rejects whitespace and shell metacharacters", () => {
    expect(() => validateModel("foo bar")).toThrow(SafetyError);
    expect(() => validateModel("foo;bar")).toThrow(SafetyError);
    expect(() => validateModel("foo`bar`")).toThrow(SafetyError);
  });
  it("returns undefined for empty", () => {
    expect(validateModel(undefined)).toBeUndefined();
    expect(validateModel("")).toBeUndefined();
  });
});

describe("assertContained", () => {
  it("accepts a path inside the parent", () => {
    expect(assertContained("/a/b", "/a/b/c")).toBe("/a/b/c");
    expect(assertContained("/a/b", "/a/b")).toBe("/a/b");
  });
  it("rejects parent escape", () => {
    expect(() => assertContained("/a/b", "/a/c")).toThrow(SafetyError);
    expect(() => assertContained("/a/b", "/")).toThrow(SafetyError);
    expect(() => assertContained("/a/b", "/a/b/../c")).toThrow(SafetyError);
  });
});

describe("truncateStdout", () => {
  it("preserves short input", () => {
    expect(truncateStdout("hello", 100)).toBe("hello");
  });
  it("truncates long input with marker", () => {
    const long = "x".repeat(200);
    const out = truncateStdout(long, 100);
    expect(out.startsWith("x".repeat(100))).toBe(true);
    expect(out).toContain("truncated");
  });
});

describe("validateRepoPath", () => {
  it("rejects relative paths", async () => {
    await expect(validateRepoPath("foo/bar", null)).rejects.toBeInstanceOf(
      SafetyError
    );
  });
  it("rejects non-existent paths", async () => {
    await expect(
      validateRepoPath("/tmp/this-definitely-does-not-exist-xyz123", null)
    ).rejects.toBeInstanceOf(SafetyError);
  });
  it("accepts an existing directory when no allowlist", async () => {
    const p = await validateRepoPath("/tmp", null);
    expect(p).toBe("/tmp");
  });
  it("enforces an allowlist when configured", async () => {
    await expect(
      validateRepoPath("/tmp", ["/usr/local"])
    ).rejects.toBeInstanceOf(SafetyError);
    const p = await validateRepoPath("/tmp", ["/tmp"]);
    expect(p).toBe("/tmp");
  });
});
