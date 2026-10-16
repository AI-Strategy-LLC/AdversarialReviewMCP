import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  Adapter,
  AuthState,
  BuildCommandInput,
  BuildCommandResult,
  ModelList,
  ParseOutputInput,
  ParseOutputResult,
  ProbeResult,
} from "../types.js";
import {
  defaultParseOutput,
  execProbe,
  parseVersionLine,
} from "./_helpers.js";

// Claude Code as a *reviewer*. Only meaningful when the host agent is not
// Claude (Codex, Antigravity, Copilot, …) — reviewer='auto' skips it when the
// CLAUDECODE env var marks a Claude Code host.
const BINARY = "claude";

// Aliases Claude Code resolves to the latest model of each tier. Full ids
// (claude-opus-5-5, …) are accepted too; there is no listing command.
const CLAUDE_MODEL_ALIASES = ["fable", "opus", "sonnet", "haiku"];

async function claudeCredentialsFile(): Promise<string | undefined> {
  const p = path.join(os.homedir(), ".claude", ".credentials.json");
  try {
    await access(p);
    return p;
  } catch {
    return undefined;
  }
}

export const claudeAdapter: Adapter = {
  name: "claude",
  binary: BINARY,
  // Edit/Write tools are denied but Bash can still write.
  supportsReadOnlySandbox: false,
  // --no-session-persistence
  supportsEphemeralSession: true,
  // --strict-mcp-config with an empty --mcp-config disables every MCP server.
  supportsDisablingMcpServers: true,
  // macOS keeps the login in Keychain; only env vars / the Linux credentials
  // file can be verified from here.
  verifiesAuth: false,

  async probe(): Promise<ProbeResult> {
    const r = await execProbe(BINARY, ["--version"]);
    if (r.exitCode === 127) {
      return { installed: false, error: "claude binary not on PATH" };
    }
    return {
      installed: true,
      binaryPath: BINARY,
      version: parseVersionLine(r.stdout || r.stderr),
    };
  },

  async authCheck(): Promise<AuthState> {
    if (process.env.ANTHROPIC_API_KEY) {
      return { authenticated: true, detail: "ANTHROPIC_API_KEY present" };
    }
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      return { authenticated: true, detail: "CLAUDE_CODE_OAUTH_TOKEN present" };
    }
    const creds = await claudeCredentialsFile();
    if (creds) {
      return { authenticated: true, detail: `claude login present (${creds})` };
    }
    return {
      authenticated: true,
      detail:
        "No env credential or ~/.claude/.credentials.json; assuming an OS-keychain login (`claude auth login`). A real auth failure surfaces at run time.",
    };
  },

  buildCommand(input: BuildCommandInput): BuildCommandResult {
    // -p <prompt>                        non-interactive print mode
    // --dangerously-skip-permissions     no approval prompts in print mode
    // --disallowedTools Edit,Write,…     the artifact contract forbids writes
    // --no-session-persistence           ephemeral
    // --mcp-config {} --strict-mcp-config  no MCP servers during the review
    const argv = [
      "-p",
      input.prompt,
      "--output-format",
      "text",
      "--dangerously-skip-permissions",
      "--disallowedTools",
      "Edit,Write,MultiEdit,NotebookEdit",
      "--no-session-persistence",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--strict-mcp-config",
    ];
    if (input.model) {
      argv.push("--model", input.model);
    }
    return { argv, cwd: input.repoPath };
  },

  parseOutput(input: ParseOutputInput): ParseOutputResult {
    return defaultParseOutput(input);
  },

  async listModels(): Promise<ModelList> {
    return {
      models: [...CLAUDE_MODEL_ALIASES],
      note: "claude has no model-listing command; these aliases resolve to the latest model of each tier. Full ids (e.g. claude-opus-5-5) are also accepted.",
    };
  },
};
