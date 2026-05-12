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

const BINARY = "kilo";

export const kiloAdapter: Adapter = {
  name: "kilo",
  binary: BINARY,
  supportsReadOnlySandbox: false,
  supportsEphemeralSession: false,
  supportsDisablingMcpServers: false,

  async probe(): Promise<ProbeResult> {
    const r = await execProbe(BINARY, ["--version"]);
    if (r.exitCode === 127) {
      return { installed: false, error: "kilo binary not on PATH" };
    }
    return {
      installed: true,
      binaryPath: BINARY,
      version: parseVersionLine(r.stdout || r.stderr),
    };
  },

  async authCheck(): Promise<AuthState> {
    // Kilo Code's headless auth is not yet first-class; trust ambient
    // session and surface failure at run-time.
    return {
      authenticated: true,
      detail:
        "Kilo auth is per-config; run-time auth failure surfaces in the response if unconfigured.",
    };
  },

  buildCommand(input: BuildCommandInput): BuildCommandResult {
    const argv = ["--workspace", input.repoPath];
    if (input.model) {
      argv.push("--model", input.model);
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
