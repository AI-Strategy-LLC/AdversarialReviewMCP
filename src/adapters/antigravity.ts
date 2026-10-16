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
  parseModelListing,
  parseVersionLine,
} from "./_helpers.js";

// Google Antigravity CLI — successor to Gemini CLI (which stopped serving
// Google AI Pro/Ultra on 2026-06-18). Binary is `agy`.
const BINARY = "agy";

// Antigravity can route Gemini, Claude and GPT-OSS models. The default is a
// Gemini model so that, from a Claude Code host, the reviewer is a different
// model family. Override with ADVERSARIAL_REVIEW_ANTIGRAVITY_MODEL or `model`.
export const DEFAULT_ANTIGRAVITY_MODEL =
  process.env.ADVERSARIAL_REVIEW_ANTIGRAVITY_MODEL || "gemini-4-argon-high";

/**
 * `agy models` is the only honest auth probe: Antigravity keeps its login in
 * the OS keyring (no file to inspect) and `agy models` round-trips to the
 * service, so a non-empty listing proves both a session and reachability.
 */
async function listAntigravityModels(): Promise<ModelList> {
  const r = await execProbe(BINARY, ["models"], 45_000);
  if (r.exitCode === 127) {
    return { models: [], note: "agy binary not on PATH" };
  }
  const models = parseModelListing(r.stdout);
  if (r.exitCode !== 0 || models.length === 0) {
    return {
      models,
      note: `agy models exited ${r.exitCode}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`,
    };
  }
  return { models };
}

export const antigravityAdapter: Adapter = {
  name: "antigravity",
  binary: BINARY,
  // `--sandbox` exists but only restricts shell commands (project dir stays
  // read-write), so it is not a read-only sandbox in this server's sense.
  supportsReadOnlySandbox: false,
  // Conversations are persisted under ~/.gemini/antigravity-cli/; no
  // ephemeral flag is documented.
  supportsEphemeralSession: false,
  supportsDisablingMcpServers: false,
  verifiesAuth: true,

  async probe(): Promise<ProbeResult> {
    const r = await execProbe(BINARY, ["--version"]);
    if (r.exitCode === 127) {
      return {
        installed: false,
        error:
          "agy binary not on PATH — install Antigravity CLI (https://antigravity.google/docs/cli/overview)",
      };
    }
    return {
      installed: true,
      binaryPath: BINARY,
      version: parseVersionLine(r.stdout || r.stderr),
    };
  },

  async authCheck(): Promise<AuthState> {
    const listing = await listAntigravityModels();
    if (listing.models.length > 0) {
      return {
        authenticated: true,
        detail: `agy session valid (${listing.models.length} models routable)`,
      };
    }
    return {
      authenticated: false,
      detail:
        `No usable Antigravity session (${listing.note ?? "agy models returned nothing"}). ` +
        "Run `agy` once interactively and sign in; the login is kept in the OS keyring.",
    };
  },

  buildCommand(input: BuildCommandInput): BuildCommandResult {
    // -p/--print: single non-interactive turn, response on stdout.
    // --dangerously-skip-permissions: in print mode any tool that would
    //   need approval is otherwise *soft-denied* (exit 0, notice on stderr),
    //   which would silently hollow out the review.
    // --print-timeout 0: wait for the turn to finish; the server enforces
    //   its own timeout. (The CLI default is 5 minutes — too short for a
    //   deep review.)
    const argv = [
      "-p",
      input.prompt,
      "--dangerously-skip-permissions",
      "--output-format",
      "text",
      "--print-timeout",
      "0",
      "--model",
      input.model || DEFAULT_ANTIGRAVITY_MODEL,
    ];
    return { argv, cwd: input.repoPath };
  },

  parseOutput(input: ParseOutputInput): ParseOutputResult {
    return defaultParseOutput(input);
  },

  listModels: listAntigravityModels,
};
