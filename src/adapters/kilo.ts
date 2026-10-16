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

const BINARY = "kilo";

/**
 * Kilo Code CLI is an OpenCode fork, so credentials from `kilo auth` land in
 * `$XDG_DATA_HOME/kilo/auth.json` and self-hosted providers in
 * `~/.config/kilo/kilo.json` (`provider` map). Both locations are inferred
 * from the fork, not documented, so a miss is reported as "unverified"
 * rather than "unauthenticated".
 */
async function detectKiloProviders(): Promise<string[]> {
  const dataHome =
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const found: string[] = [];
  try {
    const raw = await readFile(path.join(dataHome, "kilo", "auth.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    found.push(...Object.keys(parsed).filter((k) => parsed[k] != null));
  } catch {
    // absent
  }
  for (const name of ["kilo.json", "kilo.jsonc"]) {
    try {
      const raw = await readFile(path.join(configHome, "kilo", name), "utf8");
      const parsed = JSON.parse(raw) as { provider?: Record<string, unknown> };
      if (parsed.provider) found.push(...Object.keys(parsed.provider));
      break;
    } catch {
      // try next
    }
  }
  return [...new Set(found)];
}

export const kiloAdapter: Adapter = {
  name: "kilo",
  binary: BINARY,
  supportsReadOnlySandbox: false,
  supportsEphemeralSession: false,
  supportsDisablingMcpServers: false,
  verifiesAuth: false,

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
    const providers = await detectKiloProviders();
    if (providers.length > 0) {
      return {
        authenticated: true,
        detail: `kilo providers configured (${providers.join(", ")})`,
      };
    }
    // Trust the ambient session; a real credential failure surfaces at run
    // time as a non-zero exit.
    return {
      authenticated: true,
      detail:
        "No kilo auth.json / kilo.json provider found; assuming an ambient login (`kilo auth`). Run-time auth failure surfaces in the response if unconfigured.",
    };
  },

  buildCommand(input: BuildCommandInput): BuildCommandResult {
    // kilo run --dir <path> --auto [-m <model>] <message>
    // --dir  sets the working directory for the session
    // --auto auto-approves all permissions (required for pipeline/non-interactive use)
    const argv = ["run", "--dir", input.repoPath, "--auto"];
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
