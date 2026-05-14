import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// `dist/guidance/` after build; `src/guidance/` during tsx dev.
const GUIDANCE_DIR = path.join(__dirname, "guidance");

const FALLBACK_STUB =
  "(No architectural guidance loaded. Install DevTeamSwarm.app — or set " +
  "$DEVTEAMSWARM_GUIDANCE_PATH to a guidance directory — and re-run " +
  "`bash bin/sync-guidance.sh` in the MCP server's directory to populate " +
  "src/guidance/. The review is proceeding with no architectural-intent " +
  "context.)";

export type ArchitectureSlice = "domain" | "pattern" | "scale";

const SLICE_DIR: Record<ArchitectureSlice, string> = {
  domain: "domains",
  pattern: "patterns",
  scale: "scale",
};

const NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;

export interface RepoArchitectureConfig {
  domain?: string;
  pattern?: string;
  scale?: string;
}

export interface ArchitectureContext {
  guidelines: string;
  guidelinesPresent: boolean;
  repoContext: string;
  repoConfigPath?: string;
  loadedSlices: Partial<Record<ArchitectureSlice, string>>;
  warnings: string[];
}

async function readIfPresent(p: string): Promise<string | undefined> {
  try {
    return await fs.readFile(p, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

export async function loadArchitectureGuidelines(): Promise<{
  body: string;
  present: boolean;
}> {
  const body = await readIfPresent(
    path.join(GUIDANCE_DIR, "ARCHITECTURE_GUIDELINES.md")
  );
  if (body == null) {
    return { body: FALLBACK_STUB, present: false };
  }
  return { body: body.trim(), present: true };
}

async function loadRepoArchitectureConfig(
  repoPath: string
): Promise<{
  config?: RepoArchitectureConfig;
  configPath?: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const configPath = path.join(repoPath, ".adversarial-review", "architecture.json");
  const raw = await readIfPresent(configPath);
  if (raw == null) {
    return { warnings };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    warnings.push(
      `failed to parse ${configPath}: ${(err as Error).message} — ignoring`
    );
    return { configPath, warnings };
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    warnings.push(`${configPath} is not a JSON object — ignoring`);
    return { configPath, warnings };
  }
  const obj = parsed as Record<string, unknown>;
  const out: RepoArchitectureConfig = {};
  for (const key of ["domain", "pattern", "scale"] as const) {
    const v = obj[key];
    if (v == null) continue;
    if (typeof v !== "string") {
      warnings.push(`${configPath}: '${key}' must be a string — ignoring`);
      continue;
    }
    if (!NAME_RE.test(v)) {
      warnings.push(
        `${configPath}: '${key}' value '${v}' has disallowed characters (allowed: [a-z0-9_-], starts with letter) — ignoring`
      );
      continue;
    }
    out[key] = v;
  }
  return { config: out, configPath, warnings };
}

async function loadSlice(
  slice: ArchitectureSlice,
  value: string
): Promise<{ body?: string; warning?: string }> {
  const dir = SLICE_DIR[slice];
  const filePath = path.join(GUIDANCE_DIR, dir, `${value}.md`);
  const body = await readIfPresent(filePath);
  if (body == null) {
    return {
      warning: `${slice}='${value}' has no guidance file at src/guidance/${dir}/${value}.md (sync the guidance dir, or remove the key from .adversarial-review/architecture.json)`,
    };
  }
  return { body: body.trim() };
}

function formatRepoContext(
  configPath: string | undefined,
  loaded: Partial<Record<ArchitectureSlice, string>>,
  values: RepoArchitectureConfig
): string {
  const lines: string[] = [];
  lines.push("## Repo-asserted architectural context");
  lines.push("");
  if (configPath) {
    lines.push(
      `The repository declares its intended architecture in \`${path.relative(
        process.cwd(),
        configPath
      )}\` (or the absolute equivalent). The reviewer should treat the declaration as the author's *intent* and flag every place the code disagrees with it.`
    );
    lines.push("");
  }
  for (const slice of ["domain", "pattern", "scale"] as const) {
    const v = values[slice];
    const body = loaded[slice];
    if (!v || !body) continue;
    const sliceLabel =
      slice === "domain" ? "Domain" : slice === "pattern" ? "Pattern" : "Scale";
    lines.push(`### ${sliceLabel}: \`${v}\``);
    lines.push("");
    lines.push(body);
    lines.push("");
  }
  return lines.join("\n").trim();
}

export async function loadArchitectureContext(
  repoPath: string
): Promise<ArchitectureContext> {
  const warnings: string[] = [];
  const guidelines = await loadArchitectureGuidelines();
  if (!guidelines.present) {
    warnings.push(
      "ARCHITECTURE_GUIDELINES.md not vendored — falling back to stub. Run `bash bin/sync-guidance.sh` in the MCP server's directory."
    );
  }

  const { config, configPath, warnings: cfgWarnings } =
    await loadRepoArchitectureConfig(repoPath);
  warnings.push(...cfgWarnings);

  const loaded: Partial<Record<ArchitectureSlice, string>> = {};
  if (config) {
    for (const slice of ["domain", "pattern", "scale"] as const) {
      const value = config[slice];
      if (!value) continue;
      const r = await loadSlice(slice, value);
      if (r.warning) warnings.push(r.warning);
      if (r.body) loaded[slice] = r.body;
    }
  }

  const repoContext =
    config && Object.keys(loaded).length > 0
      ? formatRepoContext(configPath, loaded, config)
      : "";

  return {
    guidelines: guidelines.body,
    guidelinesPresent: guidelines.present,
    repoContext,
    repoConfigPath: configPath,
    loadedSlices: loaded,
    warnings,
  };
}
