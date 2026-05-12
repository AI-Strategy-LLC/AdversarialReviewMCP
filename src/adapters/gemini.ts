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

const BINARY = "gemini";

export const geminiAdapter: Adapter = {
  name: "gemini",
  binary: BINARY,
  supportsReadOnlySandbox: false,
  supportsEphemeralSession: true,
  supportsDisablingMcpServers: false,

  async probe(): Promise<ProbeResult> {
    const r = await execProbe(BINARY, ["--version"]);
    if (r.exitCode === 127) {
      return { installed: false, error: "gemini binary not on PATH" };
    }
    return {
      installed: true,
      binaryPath: BINARY,
      version: parseVersionLine(r.stdout || r.stderr),
    };
  },

  async authCheck(): Promise<AuthState> {
    if (process.env.GEMINI_API_KEY) {
      return { authenticated: true, detail: "GEMINI_API_KEY present" };
    }
    if (process.env.GOOGLE_API_KEY) {
      return { authenticated: true, detail: "GOOGLE_API_KEY present" };
    }
    return {
      authenticated: false,
      detail:
        "No GEMINI_API_KEY / GOOGLE_API_KEY in env. Run `gemini auth login` (OAuth) or export an API key before invoking adversarial_review with reviewer='gemini'.",
    };
  },

  buildCommand(input: BuildCommandInput): BuildCommandResult {
    const argv = ["--yolo", "-p", input.prompt];
    if (input.model) {
      argv.push("-m", input.model);
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
