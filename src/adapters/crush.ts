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

const BINARY = "crush";

/**
 * Detect a configured Crush install. Crush resolves global config from
 * `$XDG_CONFIG_HOME/crush/crush.json` (default `~/.config/crush/crush.json`);
 * a non-empty `providers` block means the user has wired up at least one
 * provider (with its key / base URL) without relying on env vars. Returns
 * the configured provider names when present.
 */
async function detectCrushConfig(): Promise<string[] | undefined> {
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const configPath = path.join(configHome, "crush", "crush.json");
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      providers?: Record<string, unknown>;
    };
    const providers = parsed.providers ? Object.keys(parsed.providers) : [];
    return providers.length > 0 ? providers : undefined;
  } catch {
    return undefined;
  }
}

export const crushAdapter: Adapter = {
  name: "crush",
  binary: BINARY,
  supportsReadOnlySandbox: false,
  supportsEphemeralSession: true,
  supportsDisablingMcpServers: false,
  verifiesAuth: true,

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
    const providers = await detectCrushConfig();
    if (providers) {
      return {
        authenticated: true,
        detail: `crush.json configured (providers: ${providers.join(", ")})`,
      };
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
