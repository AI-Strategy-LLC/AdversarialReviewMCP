import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { ParseOutputInput, ParseOutputResult, SkillName } from "../types.js";
import { CANONICAL_REPORT_PATH } from "../types.js";
import { assertContained } from "../safety.js";

const execFileP = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function execProbe(
  binary: string,
  args: string[],
  timeoutMs: number = 5000
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileP(binary, args, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: string | number;
    };
    if (e.code === "ENOENT") {
      return { stdout: "", stderr: "binary not found", exitCode: 127 };
    }
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(e.message ?? e),
      exitCode: typeof e.code === "number" ? e.code : 1,
    };
  }
}

export function parseVersionLine(s: string): string | undefined {
  const m = s.match(/(\d+\.\d+(?:\.\d+)?(?:[\w.+-]*)?)/);
  return m ? m[1] : undefined;
}

export function reportPathRegex(skill: SkillName): RegExp {
  const template = CANONICAL_REPORT_PATH[skill];
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withDate = escaped.replace(
    "\\{YYYY-MM-DD\\}",
    "\\d{4}-\\d{2}-\\d{2}"
  );
  return new RegExp(withDate);
}

export function findReportPath(
  skill: SkillName,
  stdout: string,
  repoPath: string
): string | undefined {
  const re = reportPathRegex(skill);
  const match = stdout.match(re);
  if (!match) return undefined;
  const relative = match[0];
  const absolute = path.resolve(repoPath, relative);
  try {
    return assertContained(repoPath, absolute);
  } catch {
    return undefined;
  }
}

export function tailLines(s: string, n: number = 20): string {
  const lines = s.split(/\r?\n/);
  return lines.slice(-n).join("\n").trim();
}

export function defaultParseOutput(input: ParseOutputInput): ParseOutputResult {
  const reportPath = findReportPath(input.skill, input.stdout, input.repoPath);
  const summary = tailLines(input.stdout, 30);
  return { reportPath, summary };
}

/**
 * Pull model identifiers out of a CLI's model-listing output. Each line is
 * expected to start with the id (the rest — display names, tabs, columns —
 * is ignored). Lines that don't look like an identifier (banners, "Fetching
 * available models...", blank lines) are dropped.
 */
export function parseModelListing(output: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, "").trim();
    if (!line) continue;
    if (/\.\.\.$/.test(line)) continue; // "Fetching available models..."
    const first = line.split(/[\s\t]+/)[0] ?? "";
    if (!/^[A-Za-z0-9][A-Za-z0-9_\-./:@#]*$/.test(first)) continue;
    // A bare word ("Fetching", "Models:") is prose; every real model id
    // carries a digit or a separator (gemini-4-argon-high, aivas/qwen3.6-…).
    if (!/[0-9\-/._:@#]/.test(first)) continue;
    if (seen.has(first)) continue;
    seen.add(first);
    out.push(first);
  }
  return out;
}
