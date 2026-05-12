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

export async function execProbe(binary: string, args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileP(binary, args, {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
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
