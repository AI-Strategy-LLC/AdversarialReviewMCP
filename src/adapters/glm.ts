import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  Adapter,
  AuthState,
  BuildCommandInput,
  BuildCommandResult,
  ParseOutputInput,
  ProbeResult,
  ParseOutputResult,
} from "../types.js";
import {
  defaultParseOutput,
  execProbe,
  parseVersionLine,
} from "./_helpers.js";

// GLM (Z.ai) is a *model*, not a CLI — the review skills only run inside a
// skill-equipped harness. This reviewer hosts GLM inside the OpenCode CLI,
// which has first-class Z.AI support. opencode references models as
// "<provider>/<model>"; Z.AI exposes three provider ids:
//   zai-coding-plan/*  — GLM Coding Plan subscription (api.z.ai/api/coding/paas/v4)
//   zai/*              — pay-as-you-go            (api.z.ai/api/paas/v4)
//   zhipuai/*          — China-mainland           (open.bigmodel.cn/api/paas/v4)
const BINARY = "opencode";

// Applied whenever the caller does not pass an explicit `model`. Coding-plan
// users keep the default; PAYG users export ADVERSARIAL_REVIEW_GLM_MODEL
// (e.g. "zai/glm-4.6") or pass `model` per call.
const DEFAULT_GLM_MODEL =
  process.env.ADVERSARIAL_REVIEW_GLM_MODEL || "zai-coding-plan/glm-4.6";

// Provider ids opencode may store for a Z.AI login, newest naming first.
const ZAI_PROVIDER_IDS = ["zai-coding-plan", "zai", "z-ai", "zhipuai"];

/**
 * Detect a Z.AI credential configured in OpenCode. `opencode auth login`
 * writes provider credentials to `$XDG_DATA_HOME/opencode/auth.json` (default
 * `~/.local/share/opencode/auth.json`). Returns the matching provider id(s)
 * when a Z.AI entry is present so authCheck can verify rather than assume.
 */
async function detectZaiAuth(): Promise<string | undefined> {
  const dataHome =
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const authPath = path.join(dataHome, "opencode", "auth.json");
  try {
    const raw = await readFile(authPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const found = ZAI_PROVIDER_IDS.filter((id) => parsed[id] != null);
    return found.length > 0 ? found.join(", ") : undefined;
  } catch {
    return undefined;
  }
}

export const glmAdapter: Adapter = {
  name: "glm",
  binary: BINARY,
  // Inherits OpenCode's posture: no read-only sandbox / ephemeral flag. The
  // server's default worktree isolation still contains any reviewer writes.
  supportsReadOnlySandbox: false,
  supportsEphemeralSession: false,
  supportsDisablingMcpServers: false,
  verifiesAuth: true,

  async probe(): Promise<ProbeResult> {
    const r = await execProbe(BINARY, ["--version"]);
    if (r.exitCode === 127) {
      return {
        installed: false,
        error:
          "opencode binary not on PATH — GLM runs inside the OpenCode harness (npm i -g opencode-ai)",
      };
    }
    return {
      installed: true,
      binaryPath: BINARY,
      version: parseVersionLine(r.stdout || r.stderr),
    };
  },

  async authCheck(): Promise<AuthState> {
    const providers = await detectZaiAuth();
    if (providers) {
      return {
        authenticated: true,
        detail: `opencode Z.AI provider configured (${providers})`,
      };
    }
    return {
      authenticated: false,
      detail:
        "No Z.AI credential found in OpenCode. Run `opencode auth login`, choose 'Z.AI' (or 'Z.AI Coding Plan'), and paste your API key from the Z.AI console.",
    };
  },

  buildCommand(input: BuildCommandInput): BuildCommandResult {
    // GLM always needs an explicit provider/model reference — passing a bare
    // model id fails because opencode cannot route it. Fall back to the
    // configured default when the caller omits `model`.
    const model = input.model || DEFAULT_GLM_MODEL;
    const argv = ["run", "--model", model, input.prompt];
    return {
      argv,
      cwd: input.repoPath,
    };
  },

  parseOutput(input: ParseOutputInput): ParseOutputResult {
    return defaultParseOutput(input);
  },
};
