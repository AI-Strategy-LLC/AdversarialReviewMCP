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

const BINARY = "opencode";

export const opencodeAdapter: Adapter = {
  name: "opencode",
  binary: BINARY,
  supportsReadOnlySandbox: false,
  supportsEphemeralSession: false,
  supportsDisablingMcpServers: false,

  async probe(): Promise<ProbeResult> {
    const r = await execProbe(BINARY, ["--version"]);
    if (r.exitCode === 127) {
      return { installed: false, error: "opencode binary not on PATH" };
    }
    return {
      installed: true,
      binaryPath: BINARY,
      version: parseVersionLine(r.stdout || r.stderr),
    };
  },

  async authCheck(): Promise<AuthState> {
    // OpenCode reads provider credentials from its own config; we cannot
    // probe authoritatively without invoking the binary. Assume yes if the
    // binary is on PATH; surface failure at run-time as a non-zero exit.
    return {
      authenticated: true,
      detail:
        "OpenCode auth is per-provider in its own config; run-time auth failure surfaces in the response if unconfigured.",
    };
  },

  buildCommand(input: BuildCommandInput): BuildCommandResult {
    const argv = ["run", input.prompt];
    if (input.model) {
      argv.push("--model", input.model);
    }
    return {
      argv,
      cwd: input.repoPath,
    };
  },

  parseOutput(input: ParseOutputInput): ParseOutputResult {
    return defaultParseOutput(input);
  },
};
