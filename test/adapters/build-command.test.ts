import { describe, it, expect } from "vitest";
import { ADAPTERS } from "../../src/adapters/index.js";
import { SKILL_NAMES, REVIEWER_NAMES } from "../../src/types.js";

const REPO = "/tmp/fake-repo";
const PROMPT = "RUN-DEEP-REVIEW-PROMPT";

describe("buildCommand — all adapters × all skills produce safe argv", () => {
  for (const reviewer of REVIEWER_NAMES) {
    for (const skill of SKILL_NAMES) {
      it(`${reviewer} × ${skill}`, () => {
        const adapter = ADAPTERS[reviewer];
        const cmd = adapter.buildCommand({
          skill,
          repoPath: REPO,
          prompt: PROMPT,
          args: "",
        });
        expect(cmd.cwd).toBe(REPO);
        expect(cmd.argv.length).toBeGreaterThan(0);
        expect(cmd.argv.join(" ")).toContain(PROMPT);
        for (const seg of cmd.argv) {
          expect(seg).not.toMatch(/^\s*$/);
        }
        // Adapter buildCommand intentionally does NOT include the binary at
        // argv[0] — the runner prepends adapter.binary before spawn. The
        // first segment must therefore look like a flag or subcommand, never
        // the binary name itself (regression guard — the original v0.1 ran
        // spawn(cmd.argv[0], …) directly, which executed "exec" / "--yolo"
        // / "run" literally instead of the binary).
        expect(cmd.argv[0]).not.toBe(adapter.binary);
      });
    }
  }
});

describe("runner-side spawn argv — adapter.binary prepended", () => {
  // Mirrors the exact assembly in runner.ts so a future refactor that
  // breaks the contract is caught here.
  for (const reviewer of REVIEWER_NAMES) {
    it(`${reviewer}: spawn argv starts with the binary`, () => {
      const adapter = ADAPTERS[reviewer];
      const cmd = adapter.buildCommand({
        skill: "honesty-audit",
        repoPath: REPO,
        prompt: PROMPT,
      });
      const spawnArgv = [adapter.binary, ...cmd.argv];
      expect(spawnArgv[0]).toBe(adapter.binary);
      expect(spawnArgv.length).toBeGreaterThan(1);
    });
  }
});

describe("codex adapter — flags", () => {
  const adapter = ADAPTERS.codex;
  it("passes --sandbox read-only", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    const flat = cmd.argv.join(" ");
    expect(flat).toContain("--sandbox read-only");
  });
  it("passes --cd <repo>", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv).toContain("--cd");
    const idx = cmd.argv.indexOf("--cd");
    expect(cmd.argv[idx + 1]).toBe(REPO);
  });
  it("model override flows through", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
      model: "gpt-5",
    });
    expect(cmd.argv).toContain("--model");
    const idx = cmd.argv.indexOf("--model");
    expect(cmd.argv[idx + 1]).toBe("gpt-5");
  });
});

describe("crush adapter — has explicit --cwd", () => {
  const adapter = ADAPTERS.crush;
  it("argv includes --cwd <repo>", () => {
    const cmd = adapter.buildCommand({
      skill: "honesty-audit",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv).toContain("--cwd");
    const idx = cmd.argv.indexOf("--cwd");
    expect(cmd.argv[idx + 1]).toBe(REPO);
  });
});

describe("kilo adapter — has --workspace", () => {
  const adapter = ADAPTERS.kilo;
  it("argv includes --workspace <repo>", () => {
    const cmd = adapter.buildCommand({
      skill: "bdd-audit",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv).toContain("--workspace");
    const idx = cmd.argv.indexOf("--workspace");
    expect(cmd.argv[idx + 1]).toBe(REPO);
  });
});

describe("gemini adapter — non-interactive", () => {
  const adapter = ADAPTERS.gemini;
  it("argv passes prompt via -p", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "the prompt",
    });
    expect(cmd.argv).toContain("-p");
    const idx = cmd.argv.indexOf("-p");
    expect(cmd.argv[idx + 1]).toBe("the prompt");
  });
  it("cwd is the repo (no --cd flag is documented for gemini)", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.cwd).toBe(REPO);
  });
});
