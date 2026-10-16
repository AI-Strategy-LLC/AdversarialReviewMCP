import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ModelList } from "../types.js";
import { execProbe, parseModelListing } from "./_helpers.js";

/**
 * Shared plumbing for every reviewer hosted on the OpenCode binary
 * (`opencode` itself and `glm`).
 *
 * OpenCode references models as `<provider>/<model>[#variant]`. Providers are
 * either logged in via `opencode auth login` (stored in
 * `$XDG_DATA_HOME/opencode/auth.json`) or declared in
 * `~/.config/opencode/opencode.json` under `provider.<id>` — the latter is how
 * self-hosted OpenAI-compatible endpoints are wired in.
 *
 * The server can also inject such a provider itself, without touching the
 * user's config, via `OPENCODE_CONFIG_CONTENT` (an inline JSON document that
 * OpenCode merges on top of its file-based config). That is what the three
 * ADVERSARIAL_REVIEW_LOCAL_* variables below drive: point them at an
 * OpenAI-compatible server and any `model` of the form
 * `<local-provider-id>/<model-id>` is routed there.
 */

export const OPENCODE_BINARY = "opencode";

export const LOCAL_BASE_URL_ENV = "ADVERSARIAL_REVIEW_LOCAL_OPENAI_BASE_URL";
export const LOCAL_API_KEY_ENV = "ADVERSARIAL_REVIEW_LOCAL_OPENAI_API_KEY";
export const LOCAL_PROVIDER_ID_ENV = "ADVERSARIAL_REVIEW_LOCAL_PROVIDER_ID";
export const DEFAULT_LOCAL_PROVIDER_ID = "local";

/** Name of the env var OpenCode reads inline JSON config from. */
export const OPENCODE_CONFIG_CONTENT_ENV = "OPENCODE_CONFIG_CONTENT";

export interface LocalProviderConfig {
  id: string;
  baseURL: string;
  apiKey: string;
}

export interface ModelRef {
  provider: string;
  /** Model id without the `#variant` suffix. */
  model: string;
  variant?: string;
}

/**
 * Split `provider/model#variant` at the FIRST slash. The model part may itself
 * contain slashes (e.g. `local/openai/gpt-5` when a LiteLLM-style proxy
 * namespaces upstream models) — OpenCode documents that shape.
 */
export function splitModelRef(ref: string): ModelRef | undefined {
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash === ref.length - 1) return undefined;
  const provider = ref.slice(0, slash);
  let rest = ref.slice(slash + 1);
  let variant: string | undefined;
  const hash = rest.indexOf("#");
  if (hash >= 0) {
    variant = rest.slice(hash + 1) || undefined;
    rest = rest.slice(0, hash);
  }
  if (!rest) return undefined;
  return { provider, model: rest, variant };
}

/** Read the local-provider settings from env; undefined when not configured. */
export function localProviderConfig(
  env: NodeJS.ProcessEnv = process.env
): LocalProviderConfig | undefined {
  const baseURL = env[LOCAL_BASE_URL_ENV]?.trim();
  if (!baseURL) return undefined;
  if (!/^https?:\/\//.test(baseURL)) return undefined;
  const id = (env[LOCAL_PROVIDER_ID_ENV] || DEFAULT_LOCAL_PROVIDER_ID).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return undefined;
  // openai-compatible SDK insists on *some* key; local servers ignore it.
  const apiKey = env[LOCAL_API_KEY_ENV] || "adversarial-review";
  return { id, baseURL: baseURL.replace(/\/+$/, ""), apiKey };
}

/**
 * Build the inline OpenCode config that declares the local provider with
 * exactly the one model the caller asked for. Returns undefined when the
 * model does not target the local provider (or none is configured), in which
 * case OpenCode's own config is left to route it.
 */
export function localProviderInjection(
  model: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> | undefined {
  if (!model) return undefined;
  const local = localProviderConfig(env);
  if (!local) return undefined;
  const ref = splitModelRef(model);
  if (!ref || ref.provider !== local.id) return undefined;
  const config = {
    $schema: "https://opencode.ai/config.json",
    provider: {
      [local.id]: {
        npm: "@ai-sdk/openai-compatible",
        name: `${local.id} (OpenAI-compatible, injected by adversarial-review)`,
        options: { baseURL: local.baseURL, apiKey: local.apiKey },
        models: {
          [ref.model]: { name: ref.model, tool_call: true },
        },
      },
    },
  };
  return { [OPENCODE_CONFIG_CONTENT_ENV]: JSON.stringify(config) };
}

/**
 * Provider ids with a stored credential in OpenCode's auth.json
 * (`opencode auth login`). Empty when the file is absent or unreadable.
 */
export async function opencodeAuthProviders(): Promise<string[]> {
  const dataHome =
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const authPath = path.join(dataHome, "opencode", "auth.json");
  try {
    const raw = await readFile(authPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.keys(parsed).filter((k) => parsed[k] != null);
  } catch {
    return [];
  }
}

/**
 * Provider ids declared in the user's global opencode.json (`provider` map).
 * Self-hosted endpoints live here rather than in auth.json. The file may
 * carry a leading `//` comment line (OpenCode tolerates JSONC), so strip
 * comment lines before parsing.
 */
export async function opencodeConfigProviders(): Promise<string[]> {
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const candidates = [
    path.join(configHome, "opencode", "opencode.json"),
    path.join(configHome, "opencode", "opencode.jsonc"),
  ];
  for (const p of candidates) {
    try {
      const raw = await readFile(p, "utf8");
      const stripped = raw
        .split(/\r?\n/)
        .filter((l) => !/^\s*\/\//.test(l))
        .join("\n");
      const parsed = JSON.parse(stripped) as { provider?: Record<string, unknown> };
      return parsed.provider ? Object.keys(parsed.provider) : [];
    } catch {
      // try next candidate
    }
  }
  return [];
}

/** `opencode models` — every provider/model OpenCode can route right now. */
export async function listOpencodeModels(): Promise<ModelList> {
  const r = await execProbe(OPENCODE_BINARY, ["models"], 60_000);
  if (r.exitCode === 127) {
    return { models: [], note: "opencode binary not on PATH" };
  }
  const models = parseModelListing(r.stdout).filter((m) => m.includes("/"));
  const local = localProviderConfig();
  if (local) {
    const extra = await listLocalModels(local);
    for (const m of extra.models) if (!models.includes(m)) models.push(m);
    if (extra.note) {
      return { models, note: extra.note };
    }
  }
  if (r.exitCode !== 0 && models.length === 0) {
    return { models, note: `opencode models exited ${r.exitCode}: ${r.stderr.trim()}` };
  }
  return { models };
}

/**
 * GET {baseURL}/models on the configured local OpenAI-compatible server and
 * return `<local-id>/<model-id>` references. Network failures are reported in
 * `note`, never thrown — list_models is a discovery aid, not a gate.
 */
export async function listLocalModels(
  local: LocalProviderConfig
): Promise<ModelList> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${local.baseURL}/models`, {
      headers: { Authorization: `Bearer ${local.apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        models: [],
        note: `${local.baseURL}/models returned HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .filter((id) => /^[A-Za-z0-9_\-./:@]+$/.test(id));
    return { models: ids.map((id) => `${local.id}/${id}`) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { models: [], note: `${local.baseURL}/models unreachable: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Shared `opencode run` argv assembly used by both opencode-hosted reviewers. */
export function opencodeRunArgv(prompt: string, model: string | undefined): string[] {
  // --auto: approve permission asks that are not explicitly denied — without
  //         it a headless run blocks or auto-rejects on the first ask
  //         (`external_directory`, `doom_loop`, …).
  // --standalone: private server for this run instead of the user's shared
  //         background service, so a review never shares state with an
  //         interactive OpenCode session.
  const argv = ["run", "--auto", "--standalone"];
  if (model) argv.push("--model", model);
  argv.push(prompt);
  return argv;
}
