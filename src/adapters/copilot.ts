import { access } from "node:fs/promises";
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

// GitHub Copilot CLI (`npm i -g @github/copilot` / `brew install --cask
// copilot-cli`). Routes GPT and Claude models through the user's Copilot
// subscription, or any OpenAI-compatible / Anthropic endpoint via
// COPILOT_PROVIDER_BASE_URL + COPILOT_PROVIDER_TYPE + COPILOT_MODEL (BYOK).
const BINARY = "copilot";

const TOKEN_ENV_VARS = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];

async function copilotHomeExists(): Promise<string | undefined> {
  const home = process.env.COPILOT_HOME || path.join(os.homedir(), ".copilot");
  try {
    await access(path.join(home, "config.json"));
    return home;
  } catch {
    return undefined;
  }
}

export const copilotAdapter: Adapter = {
  name: "copilot",
  binary: BINARY,
  // `--deny-tool write` blocks the file-write tool but `shell` can still
  // write, so this is not a read-only sandbox.
  supportsReadOnlySandbox: false,
  supportsEphemeralSession: false,
  // `--disable-builtin-mcps` drops the bundled GitHub MCP server, but servers
  // from ~/.copilot/mcp-config.json still load.
  supportsDisablingMcpServers: false,
  // Login tokens live in the OS credential store; only an env token can be
  // verified from here.
  verifiesAuth: false,

  async probe(): Promise<ProbeResult> {
    const r = await execProbe(BINARY, ["--version"]);
    if (r.exitCode === 127) {
      return { installed: false, error: "copilot binary not on PATH (npm i -g @github/copilot)" };
    }
    return {
      installed: true,
      binaryPath: BINARY,
      version: parseVersionLine(r.stdout || r.stderr),
    };
  },

  async authCheck(): Promise<AuthState> {
    for (const k of TOKEN_ENV_VARS) {
      if (process.env[k]) {
        return { authenticated: true, detail: `${k} present` };
      }
    }
    const home = await copilotHomeExists();
    if (home) {
      return {
        authenticated: true,
        detail: `${home}/config.json present — login token assumed in the OS credential store (not verifiable here)`,
      };
    }
    return {
      authenticated: false,
      detail:
        "No Copilot login found. Run `copilot login`, or export COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN (fine-grained PAT with Copilot Requests).",
    };
  },

  buildCommand(input: BuildCommandInput): BuildCommandResult {
    // -p <prompt>          non-interactive, exits after completion
    // --allow-all-tools    required for non-interactive mode
    // --allow-all-paths    the worktree lives in a tmpdir outside cwd's parent
    // --no-ask-user        never pause for human input
    // --deny-tool write    reviewer must emit artifacts on stdout, not write
    // -s                   agent response only, no stats banner
    // --disable-builtin-mcps  no GitHub MCP round-trips during a review
    // -C <repo>            working directory
    const argv = [
      "-p",
      input.prompt,
      "--allow-all-tools",
      "--allow-all-paths",
      "--no-ask-user",
      "--deny-tool",
      "write",
      "-s",
      "--output-format",
      "text",
      "--disable-builtin-mcps",
      "-C",
      input.repoPath,
    ];
    if (input.model) {
      argv.push("--model", input.model);
    }
    return { argv, cwd: input.repoPath };
  },

  parseOutput(input: ParseOutputInput): ParseOutputResult {
    return defaultParseOutput(input);
  },
};
