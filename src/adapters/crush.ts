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
 * Detect a configured Crush install. Crush (>= 0.9x) prefers a bash-style
 * `$XDG_CONFIG_HOME/crush/crushrc` (`provider add <id> …` lines) and still
 * reads the legacy JSON `crush.json`. A `providers` block in the JSON, or a
 * `provider add` line in crushrc, means the user has wired up at least one
 * provider without relying on env vars. Returns the configured provider
 * names when present.
 */
async function detectCrushConfig(): Promise<string[] | undefined> {
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const dir = path.join(configHome, "crush");
  try {
    const rc = await readFile(path.join(dir, "crushrc"), "utf8");
    const ids = [...rc.matchAll(/^\s*provider\s+add\s+([A-Za-z0-9_-]+)/gm)].map(
      (m) => m[1] as string
    );
    if (ids.length > 0) return ids;
  } catch {
    // no crushrc — fall through to legacy JSON
  }
  try {
    const raw = await readFile(path.join(dir, "crush.json"), "utf8");
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
        "Crush needs a provider API key. Export OPENAI_API_KEY / ANTHROPIC_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY, or configure ~/.config/crush/crushrc (or legacy crush.json).",
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
