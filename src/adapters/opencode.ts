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
import {
  OPENCODE_BINARY,
  listOpencodeModels,
  localProviderConfig,
  localProviderInjection,
  opencodeAuthProviders,
  opencodeConfigProviders,
  opencodeRunArgv,
} from "./_opencode.js";

// OpenCode (opencode.ai) — multi-provider harness. Models are addressed as
// `<provider>/<model>[#variant]`; see `list_models(reviewer='opencode')` for
// what is routable on this machine, including the injected local provider.
const BINARY = OPENCODE_BINARY;

export const opencodeAdapter: Adapter = {
  name: "opencode",
  binary: BINARY,
  supportsReadOnlySandbox: false,
  supportsEphemeralSession: false,
  supportsDisablingMcpServers: false,
  verifiesAuth: true,

  async probe(): Promise<ProbeResult> {
    const r = await execProbe(BINARY, ["--version"]);
    if (r.exitCode === 127) {
      return { installed: false, error: "opencode binary not on PATH" };
    }
    return {
      installed: true,
      binaryPath: BINARY,
      version: parseVersionLine(r.stdout || r.stderr),
    };
  },

  async authCheck(): Promise<AuthState> {
    const [logged, declared] = await Promise.all([
      opencodeAuthProviders(),
      opencodeConfigProviders(),
    ]);
    const local = localProviderConfig();
    const parts: string[] = [];
    if (logged.length > 0) parts.push(`auth.json: ${logged.join(", ")}`);
    if (declared.length > 0) parts.push(`opencode.json: ${declared.join(", ")}`);
    if (local) parts.push(`injected local provider '${local.id}' -> ${local.baseURL}`);
    if (parts.length > 0) {
      return { authenticated: true, detail: `providers available (${parts.join("; ")})` };
    }
    return {
      authenticated: false,
      detail:
        "No OpenCode provider found. Run `opencode auth login`, declare a provider in ~/.config/opencode/opencode.json, or set ADVERSARIAL_REVIEW_LOCAL_OPENAI_BASE_URL for a local OpenAI-compatible server.",
    };
  },

  buildCommand(input: BuildCommandInput): BuildCommandResult {
    return {
      argv: opencodeRunArgv(input.prompt, input.model),
      env: localProviderInjection(input.model),
      cwd: input.repoPath,
    };
  },

  parseOutput(input: ParseOutputInput): ParseOutputResult {
    return defaultParseOutput(input);
  },

  listModels: listOpencodeModels,
};
