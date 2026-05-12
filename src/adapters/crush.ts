import type {
  Adapter,
  AuthState,
  BuildCommandInput,
  BuildCommandResult,
  ParseOutputInput,
  ParseOutputResult,
  ProbeResult,
} from "../types.js";
import {
  defaultParseOutput,
  execProbe,
  parseVersionLine,
} from "./_helpers.js";

const BINARY = "crush";

export const crushAdapter: Adapter = {
  name: "crush",
  binary: BINARY,
  supportsReadOnlySandbox: false,
  supportsEphemeralSession: true,
  supportsDisablingMcpServers: false,

  async probe(): Promise<ProbeResult> {
    const r = await execProbe(BINARY, ["--version"]);
    if (r.exitCode === 127) {
      return { installed: false, error: "crush binary not on PATH" };
    }
    return {
      installed: true,
      binaryPath: BINARY,
      version: parseVersionLine(r.stdout || r.stderr),
    };
  },

  async authCheck(): Promise<AuthState> {
    // Crush is multi-provider; auth is per-provider via env / config file.
    // Best-effort: any common provider key suffices.
    const keys = [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GROQ_API_KEY",
      "OPENROUTER_API_KEY",
    ];
    for (const k of keys) {
      if (process.env[k]) {
        return { authenticated: true, detail: `${k} present` };
      }
    }
    return {
      authenticated: false,
      detail:
        "Crush needs a provider API key. Export OPENAI_API_KEY / ANTHROPIC_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY, or configure ~/.config/crush/crush.json.",
    };
  },

  buildCommand(input: BuildCommandInput): BuildCommandResult {
    const argv = ["run", "--cwd", input.repoPath, "-q"];
    if (input.model) {
      argv.push("-m", input.model);
    }
    argv.push(input.prompt);
    return {
      argv,
      cwd: input.repoPath,
    };
  },

  parseOutput(input: ParseOutputInput): ParseOutputResult {
    return defaultParseOutput(input);
  },
};
