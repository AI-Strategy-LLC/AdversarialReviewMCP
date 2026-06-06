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

const BINARY = "codex";

/**
 * Detect a `codex login` OAuth session. The CLI writes credentials to
 * `$CODEX_HOME/auth.json` (default `~/.codex/auth.json`) — for ChatGPT
 * sign-in this holds `tokens`, for API-key mode it holds `OPENAI_API_KEY`.
 * Returns the auth mode string when a usable credential is present.
 */
async function detectCodexLogin(): Promise<string | undefined> {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  try {
    const raw = await readFile(path.join(home, "auth.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      auth_mode?: string;
      OPENAI_API_KEY?: string | null;
      tokens?: unknown;
    };
    const hasCredential =
      parsed.tokens != null ||
      (typeof parsed.OPENAI_API_KEY === "string" &&
        parsed.OPENAI_API_KEY.length > 0);
    if (!hasCredential) return undefined;
    return parsed.auth_mode || "codex login";
  } catch {
    return undefined;
  }
}

export const codexAdapter: Adapter = {
  name: "codex",
  binary: BINARY,
  supportsReadOnlySandbox: true,
  supportsEphemeralSession: true,
  supportsDisablingMcpServers: false,
  verifiesAuth: true,

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
    const loginMode = await detectCodexLogin();
    if (loginMode) {
      return {
        authenticated: true,
        detail: `codex login session present (auth_mode: ${loginMode})`,
      };
    }
    return {
      authenticated: false,
      detail:
        "No codex credentials found. Run `codex login` (OAuth) or export OPENAI_API_KEY before invoking adversarial_review with reviewer='codex'.",
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
