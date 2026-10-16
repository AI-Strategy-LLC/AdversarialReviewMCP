import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_LOCAL_PROVIDER_ID,
  LOCAL_API_KEY_ENV,
  LOCAL_BASE_URL_ENV,
  LOCAL_PROVIDER_ID_ENV,
  OPENCODE_CONFIG_CONTENT_ENV,
  localProviderConfig,
  localProviderInjection,
  splitModelRef,
} from "../../src/adapters/_opencode.js";
import { parseModelListing } from "../../src/adapters/_helpers.js";
import { ADAPTERS } from "../../src/adapters/index.js";

describe("splitModelRef — provider/model[#variant]", () => {
  it("splits at the first slash only (model may contain slashes)", () => {
    expect(splitModelRef("local/openai/gpt-5.6-cyber")).toEqual({
      provider: "local",
      model: "openai/gpt-5.6-cyber",
      variant: undefined,
    });
  });
  it("peels off a #variant suffix", () => {
    expect(splitModelRef("anthropic/claude-opus-5-5#max")).toEqual({
      provider: "anthropic",
      model: "claude-opus-5-5",
      variant: "max",
    });
  });
  it("rejects refs without a provider", () => {
    expect(splitModelRef("gpt-5")).toBeUndefined();
    expect(splitModelRef("/gpt-5")).toBeUndefined();
    expect(splitModelRef("local/")).toBeUndefined();
  });
});

describe("localProviderConfig — env-driven", () => {
  it("is undefined when the base URL is not set", () => {
    expect(localProviderConfig({})).toBeUndefined();
  });
  it("rejects non-http URLs and unsafe provider ids", () => {
    expect(localProviderConfig({ [LOCAL_BASE_URL_ENV]: "ftp://x" })).toBeUndefined();
    expect(
      localProviderConfig({
        [LOCAL_BASE_URL_ENV]: "http://aivas-a.local:4000/v1",
        [LOCAL_PROVIDER_ID_ENV]: "bad id/with slash",
      })
    ).toBeUndefined();
  });
  it("defaults the provider id and api key, trims trailing slashes", () => {
    const cfg = localProviderConfig({
      [LOCAL_BASE_URL_ENV]: "http://aivas-a.local:4000/v1/",
    });
    expect(cfg).toEqual({
      id: DEFAULT_LOCAL_PROVIDER_ID,
      baseURL: "http://aivas-a.local:4000/v1",
      apiKey: "adversarial-review",
    });
  });
  it("honours explicit id and key", () => {
    const cfg = localProviderConfig({
      [LOCAL_BASE_URL_ENV]: "http://aivas-a.local:4000/v1",
      [LOCAL_PROVIDER_ID_ENV]: "aivas",
      [LOCAL_API_KEY_ENV]: "sk-spark-local",
    });
    expect(cfg?.id).toBe("aivas");
    expect(cfg?.apiKey).toBe("sk-spark-local");
  });
});

describe("localProviderInjection — OPENCODE_CONFIG_CONTENT", () => {
  const env = {
    [LOCAL_BASE_URL_ENV]: "http://aivas-a.local:4000/v1",
    [LOCAL_API_KEY_ENV]: "sk-spark-local",
  };
  it("injects an openai-compatible provider declaring exactly the requested model", () => {
    const out = localProviderInjection("local/qwen3.6-35b-nvfp4#high", env);
    expect(out).toBeDefined();
    const json = JSON.parse(out![OPENCODE_CONFIG_CONTENT_ENV]!) as {
      provider: Record<string, { npm: string; options: { baseURL: string; apiKey: string }; models: Record<string, unknown> }>;
    };
    const local = json.provider.local!;
    expect(local.npm).toBe("@ai-sdk/openai-compatible");
    expect(local.options.baseURL).toBe("http://aivas-a.local:4000/v1");
    expect(local.options.apiKey).toBe("sk-spark-local");
    // variant stripped from the models key
    expect(Object.keys(local.models)).toEqual(["qwen3.6-35b-nvfp4"]);
  });
  it("does nothing for models on other providers", () => {
    expect(localProviderInjection("aivas/qwen3.6-35b-nvfp4", env)).toBeUndefined();
    expect(localProviderInjection("zai-coding-plan/glm-5.3", env)).toBeUndefined();
    expect(localProviderInjection(undefined, env)).toBeUndefined();
  });
  it("does nothing when the local provider is not configured", () => {
    expect(localProviderInjection("local/x", {})).toBeUndefined();
  });
});

describe("opencode adapter — env injection wiring", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of [LOCAL_BASE_URL_ENV, LOCAL_API_KEY_ENV, LOCAL_PROVIDER_ID_ENV]) {
      if (saved[k] == null) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  it("buildCommand carries OPENCODE_CONFIG_CONTENT when model targets the local provider", () => {
    process.env[LOCAL_BASE_URL_ENV] = "http://aivas-a.local:4000/v1";
    process.env[LOCAL_PROVIDER_ID_ENV] = "spark";
    const cmd = ADAPTERS.opencode.buildCommand({
      skill: "deep-review",
      repoPath: "/tmp/fake-repo",
      prompt: "hi",
      model: "spark/nemotron-nano-30b-fp8",
    });
    expect(cmd.env?.[OPENCODE_CONFIG_CONTENT_ENV]).toContain("nemotron-nano-30b-fp8");
    expect(cmd.argv[cmd.argv.indexOf("--model") + 1]).toBe("spark/nemotron-nano-30b-fp8");
  });
});

describe("parseModelListing", () => {
  it("extracts ids from `agy models` tab-separated output, skipping banners", () => {
    const out = [
      "Fetching available models...",
      "gemini-4-argon-high\tGemini 4 Argon (High)",
      "claude-opus-5-5-high\tClaude Opus 5.5 (High)",
      "",
    ].join("\n");
    expect(parseModelListing(out)).toEqual(["gemini-4-argon-high", "claude-opus-5-5-high"]);
  });
  it("extracts provider/model ids from `opencode models` output and dedupes", () => {
    const out = "aivas/qwen3.6-35b-nvfp4\nzai-coding-plan/glm-5.3\naivas/qwen3.6-35b-nvfp4\n";
    expect(parseModelListing(out)).toEqual(["aivas/qwen3.6-35b-nvfp4", "zai-coding-plan/glm-5.3"]);
  });
  it("strips ANSI color codes", () => {
    expect(parseModelListing("\x1b[32mopencode/big-pickle\x1b[0m\n")).toEqual(["opencode/big-pickle"]);
  });
});
