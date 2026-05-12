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

const BINARY = "codex";

export const codexAdapter: Adapter = {
  name: "codex",
  binary: BINARY,
  supportsReadOnlySandbox: true,
  supportsEphemeralSession: true,
  supportsDisablingMcpServers: false,

  async probe(): Promise<ProbeResult> {
    const r = await execProbe(BINARY, ["--version"]);
    if (r.exitCode === 127) {
      return { installed: false, error: "codex binary not on PATH" };
    }
    return {
      installed: true,
      binaryPath: BINARY,
      version: parseVersionLine(r.stdout || r.stderr),
    };
  },

  async authCheck(): Promise<AuthState> {
    if (process.env.OPENAI_API_KEY) {
      return { authenticated: true, detail: "OPENAI_API_KEY present" };
    }
    return {
      authenticated: false,
      detail:
        "No OPENAI_API_KEY in env. Run `codex login` or export OPENAI_API_KEY before invoking adversarial_review with reviewer='codex'.",
    };
  },

  buildCommand(input: BuildCommandInput): BuildCommandResult {
    const argv = [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--cd",
      input.repoPath,
    ];
    if (input.model) {
      argv.push("--model", input.model);
    }
    argv.push("--", input.prompt);
    return {
      argv,
      cwd: input.repoPath,
    };
  },

  parseOutput(input: ParseOutputInput): ParseOutputResult {
    return defaultParseOutput(input);
  },
};
