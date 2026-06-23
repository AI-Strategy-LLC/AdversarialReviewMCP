import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

/**
 * Detect a `gemini auth login` OAuth session. The CLI writes credentials to
 * `~/.gemini/oauth_creds.json` (holding `access_token` / `refresh_token`).
 * Returns true when a usable credential is present.
 */
async function detectGeminiLogin(): Promise<boolean> {
  const credPath = path.join(os.homedir(), ".gemini", "oauth_creds.json");
  try {
    const raw = await readFile(credPath, "utf8");
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      refresh_token?: string;
    };
    return Boolean(parsed.access_token || parsed.refresh_token);
  } catch {
    return false;
  }
}

export const geminiAdapter: Adapter = {
  name: "gemini",
  binary: BINARY,
  supportsReadOnlySandbox: false,
  supportsEphemeralSession: true,
  supportsDisablingMcpServers: false,
  verifiesAuth: true,

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
    if (await detectGeminiLogin()) {
      return {
        authenticated: true,
        detail: "gemini auth login session present (~/.gemini/oauth_creds.json)",
      };
    }
    return {
      authenticated: false,
      detail:
        "No gemini credentials found. Run `gemini auth login` (OAuth) or export GEMINI_API_KEY / GOOGLE_API_KEY before invoking adversarial_review with reviewer='gemini'.",
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
