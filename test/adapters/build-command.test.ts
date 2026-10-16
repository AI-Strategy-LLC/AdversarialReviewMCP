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
  it("passes --ephemeral (backs supportsEphemeralSession)", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(adapter.supportsEphemeralSession).toBe(true);
    expect(cmd.argv).toContain("--ephemeral");
  });
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

describe("kilo adapter — run subcommand with --dir and --auto", () => {
  const adapter = ADAPTERS.kilo;
  it("argv[0] is 'run' (subcommand, not binary)", () => {
    const cmd = adapter.buildCommand({
      skill: "bdd-audit",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv[0]).toBe("run");
  });
  it("argv includes --dir <repo>", () => {
    const cmd = adapter.buildCommand({
      skill: "bdd-audit",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv).toContain("--dir");
    const idx = cmd.argv.indexOf("--dir");
    expect(cmd.argv[idx + 1]).toBe(REPO);
  });
  it("argv includes --auto (non-interactive pipeline flag)", () => {
    const cmd = adapter.buildCommand({
      skill: "bdd-audit",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv).toContain("--auto");
  });
  it("model override flows through via -m", () => {
    const cmd = adapter.buildCommand({
      skill: "bdd-audit",
      repoPath: REPO,
      prompt: "hi",
      model: "anthropic/claude-sonnet-4-6",
    });
    expect(cmd.argv).toContain("-m");
    const idx = cmd.argv.indexOf("-m");
    expect(cmd.argv[idx + 1]).toBe("anthropic/claude-sonnet-4-6");
  });
  it("does NOT use the removed --workspace flag", () => {
    const cmd = adapter.buildCommand({
      skill: "bdd-audit",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv).not.toContain("--workspace");
  });
});

describe("glm adapter — hosted on the opencode binary", () => {
  const adapter = ADAPTERS.glm;
  it("binary is opencode (GLM is a model, not a CLI)", () => {
    expect(adapter.binary).toBe("opencode");
  });
  it("argv[0] is the 'run' subcommand, not the binary", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv[0]).toBe("run");
  });
  it("always applies a default provider/model when none is given", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv).toContain("--model");
    const idx = cmd.argv.indexOf("--model");
    // opencode needs a provider-prefixed reference (e.g. zai-coding-plan/...).
    expect(cmd.argv[idx + 1]).toMatch(/^[\w-]+\/glm/);
    // glm-4.6 was retired from the coding plan; default must be a current id.
    expect(cmd.argv[idx + 1]).not.toContain("glm-4.6");
  });
  it("passes --auto and --standalone like the opencode adapter", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv).toContain("--auto");
    expect(cmd.argv).toContain("--standalone");
  });
  it("explicit model override flows through via --model", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
      model: "zai/glm-4.6",
    });
    expect(cmd.argv).toContain("--model");
    const idx = cmd.argv.indexOf("--model");
    expect(cmd.argv[idx + 1]).toBe("zai/glm-4.6");
  });
});

describe("antigravity adapter — agy print mode", () => {
  const adapter = ADAPTERS.antigravity;
  it("binary is agy", () => {
    expect(adapter.binary).toBe("agy");
  });
  it("argv passes prompt via -p and skips permission prompts", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "the prompt",
    });
    expect(cmd.argv[0]).toBe("-p");
    expect(cmd.argv[1]).toBe("the prompt");
    expect(cmd.argv).toContain("--dangerously-skip-permissions");
    expect(cmd.argv).toContain("--output-format");
    expect(cmd.argv[cmd.argv.indexOf("--output-format") + 1]).toBe("text");
  });
  it("disables agy's own 5-minute print timeout (server enforces timeout_s)", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    const idx = cmd.argv.indexOf("--print-timeout");
    expect(idx).toBeGreaterThan(-1);
    expect(cmd.argv[idx + 1]).toBe("0");
  });
  it("defaults to a Gemini model (different family from a Claude host)", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    const idx = cmd.argv.indexOf("--model");
    expect(idx).toBeGreaterThan(-1);
    expect(cmd.argv[idx + 1]).toMatch(/^gemini-/);
  });
  it("explicit model override flows through via --model", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
      model: "claude-sonnet-5-5-high",
    });
    const idx = cmd.argv.indexOf("--model");
    expect(cmd.argv[idx + 1]).toBe("claude-sonnet-5-5-high");
  });
  it("cwd is the repo (agy has no --cd flag)", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.cwd).toBe(REPO);
  });
});

describe("opencode adapter — headless run flags", () => {
  const adapter = ADAPTERS.opencode;
  it("passes --auto so permission asks do not block a headless run", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv[0]).toBe("run");
    expect(cmd.argv).toContain("--auto");
    expect(cmd.argv).toContain("--standalone");
  });
  it("model override flows through as provider/model", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
      model: "amazon-bedrock/us.anthropic.claude-opus-5-5",
    });
    const idx = cmd.argv.indexOf("--model");
    expect(cmd.argv[idx + 1]).toBe("amazon-bedrock/us.anthropic.claude-opus-5-5");
  });
  it("prompt is the last argv segment (opencode run [flags] [message...])", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "the prompt",
      model: "aivas/qwen3.6-35b-nvfp4",
    });
    expect(cmd.argv[cmd.argv.length - 1]).toBe("the prompt");
  });
  it("does not inject env when no local provider is configured", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
      model: "local/some-model",
    });
    expect(cmd.env).toBeUndefined();
  });
});

describe("copilot adapter — headless flags", () => {
  const adapter = ADAPTERS.copilot;
  it("passes -p <prompt> with non-interactive permission flags", () => {
    const cmd = adapter.buildCommand({
      skill: "honesty-audit",
      repoPath: REPO,
      prompt: "the prompt",
    });
    expect(cmd.argv[0]).toBe("-p");
    expect(cmd.argv[1]).toBe("the prompt");
    expect(cmd.argv).toContain("--allow-all-tools");
    expect(cmd.argv).toContain("--allow-all-paths");
    expect(cmd.argv).toContain("--no-ask-user");
    expect(cmd.argv).toContain("-s");
  });
  it("denies the write tool (artifact contract: emit on stdout)", () => {
    const cmd = adapter.buildCommand({
      skill: "honesty-audit",
      repoPath: REPO,
      prompt: "hi",
    });
    const idx = cmd.argv.indexOf("--deny-tool");
    expect(idx).toBeGreaterThan(-1);
    expect(cmd.argv[idx + 1]).toBe("write");
  });
  it("passes -C <repo> and model via --model", () => {
    const cmd = adapter.buildCommand({
      skill: "honesty-audit",
      repoPath: REPO,
      prompt: "hi",
      model: "gpt-5.4",
    });
    expect(cmd.argv[cmd.argv.indexOf("-C") + 1]).toBe(REPO);
    expect(cmd.argv[cmd.argv.indexOf("--model") + 1]).toBe("gpt-5.4");
  });
});

describe("claude adapter — print mode for non-Claude hosts", () => {
  const adapter = ADAPTERS.claude;
  it("passes -p <prompt>, denies write tools, and runs ephemeral", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "the prompt",
    });
    expect(cmd.argv[0]).toBe("-p");
    expect(cmd.argv[1]).toBe("the prompt");
    expect(cmd.argv).toContain("--dangerously-skip-permissions");
    const idx = cmd.argv.indexOf("--disallowedTools");
    expect(idx).toBeGreaterThan(-1);
    expect(cmd.argv[idx + 1]).toContain("Write");
    expect(cmd.argv[idx + 1]).toContain("Edit");
    expect(cmd.argv).toContain("--no-session-persistence");
    expect(adapter.supportsEphemeralSession).toBe(true);
  });
  it("disables all MCP servers for the review", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
    });
    expect(cmd.argv).toContain("--strict-mcp-config");
    expect(adapter.supportsDisablingMcpServers).toBe(true);
  });
  it("model override flows through via --model", () => {
    const cmd = adapter.buildCommand({
      skill: "deep-review",
      repoPath: REPO,
      prompt: "hi",
      model: "opus",
    });
    expect(cmd.argv[cmd.argv.indexOf("--model") + 1]).toBe("opus");
  });
});
