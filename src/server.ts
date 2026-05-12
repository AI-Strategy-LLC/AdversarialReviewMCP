#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getAdapter } from "./adapters/index.js";
import { runReview, ReviewInputSchema } from "./runner.js";
import {
  REVIEWER_NAMES,
  SKILL_NAMES,
  type ReviewerName,
  type ReviewerStatus,
  type SkillName,
} from "./types.js";
import { SafetyError } from "./safety.js";

const SERVER_NAME = "adversarial-review";
const SERVER_VERSION = "0.1.0";

const ALL_SKILLS: SkillName[] = [...SKILL_NAMES];

function statusNoteFor(adapterName: ReviewerName, installed: boolean): string | undefined {
  const adapter = getAdapter(adapterName);
  const notes: string[] = [];
  if (!installed) {
    notes.push(`${adapter.binary} not on PATH`);
  }
  if (!adapter.supportsReadOnlySandbox) {
    notes.push("no read-only sandbox flag — reviewer runs with whatever permissions the CLI grants");
  }
  if (!adapter.supportsEphemeralSession) {
    notes.push("no ephemeral-session flag — review may persist in CLI history");
  }
  return notes.length > 0 ? notes.join("; ") : undefined;
}

async function listReviewersImpl(): Promise<ReviewerStatus[]> {
  const results: ReviewerStatus[] = [];
  for (const name of REVIEWER_NAMES) {
    const adapter = getAdapter(name);
    const probe = await adapter.probe();
    const auth = probe.installed
      ? await adapter.authCheck()
      : { authenticated: false, detail: "not installed" };
    results.push({
      cli: name,
      installed: probe.installed,
      binaryPath: probe.binaryPath,
      version: probe.version,
      authenticated: auth.authenticated,
      supportedSkills: ALL_SKILLS,
      notes: statusNoteFor(name, probe.installed),
    });
  }
  return results;
}

function formatReviewResult(result: Awaited<ReturnType<typeof runReview>>): string {
  const lines: string[] = [];
  lines.push(`provider: ${result.provider}`);
  lines.push(`model: ${result.model}`);
  lines.push(`exit_code: ${result.exitCode}`);
  lines.push(`duration_s: ${result.durationS.toFixed(2)}`);
  if (result.reportPath) {
    lines.push(`report_path: ${result.reportPath}`);
  } else {
    lines.push("report_path: (none — reviewer did not emit a canonical-location report path)");
  }
  if (result.findingsCount != null) {
    lines.push(`findings_count: ${result.findingsCount}`);
  }
  lines.push("");
  lines.push("--- summary (tail of reviewer stdout) ---");
  lines.push(result.summary || "(empty)");
  if (result.rawStderr && result.rawStderr.trim().length > 0) {
    lines.push("");
    lines.push("--- stderr ---");
    lines.push(result.rawStderr);
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "list_reviewers",
    {
      title: "List reviewer CLIs",
      description:
        "Probe each external CLI (codex, gemini, opencode, crush, kilo) for installation, version, and ambient authentication. Returns one entry per reviewer.",
      inputSchema: {},
    },
    async () => {
      const reviewers = await listReviewersImpl();
      const json = JSON.stringify(reviewers, null, 2);
      return {
        content: [{ type: "text", text: json }],
      };
    }
  );

  const reviewerEnum = z.enum([...REVIEWER_NAMES, "auto"] as const);
  const skillEnum = z.enum(SKILL_NAMES);

  const adversarialReviewSchema = {
    skill: skillEnum.describe(
      "Which review skill to run on the reviewer side. Must already be installed in the chosen CLI via `bash install.sh --for <cli>`."
    ),
    reviewer: reviewerEnum.describe(
      "Which CLI runs the review. 'auto' picks the first installed + authenticated CLI in order: codex, gemini, crush, opencode, kilo."
    ),
    repo_path: z
      .string()
      .describe("Absolute path to the repository to review. Validated against the server's allowlist if one is configured."),
    args: z
      .string()
      .optional()
      .describe("Optional args forwarded to the skill (e.g. '--no-spec-to-code'). Whitelist-validated."),
    model: z
      .string()
      .optional()
      .describe("Optional model override for CLIs that accept one."),
    timeout_s: z
      .number()
      .int()
      .positive()
      .max(3600)
      .optional()
      .describe("Per-run timeout in seconds. Default 900."),
  };

  server.registerTool(
    "adversarial_review",
    {
      title: "Adversarial review (generic dispatch)",
      description:
        "Dispatch a review skill to an external CLI running a different model. Returns provider, model, exit code, the path of the report the skill wrote, and a brief summary. The report itself stays on disk; the caller reads it via the filesystem.",
      inputSchema: adversarialReviewSchema,
    },
    async (input) => {
      const parsed = ReviewInputSchema.parse(input);
      try {
        const result = await runReview(parsed);
        return {
          content: [{ type: "text", text: formatReviewResult(result) }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        if (err instanceof SafetyError) {
          return {
            isError: true,
            content: [{ type: "text", text: `SafetyError: ${err.message}` }],
          };
        }
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${message}` }],
        };
      }
    }
  );

  for (const skill of ALL_SKILLS) {
    const toolName = skill.replace(/-/g, "_");
    server.registerTool(
      toolName,
      {
        title: `Run ${skill} via an external CLI`,
        description: `Adversarial-review convenience wrapper: dispatches the '${skill}' skill to an external CLI. Same semantics as adversarial_review with skill='${skill}'.`,
        inputSchema: {
          reviewer: reviewerEnum,
          repo_path: z.string(),
          args: z.string().optional(),
          model: z.string().optional(),
          timeout_s: z.number().int().positive().max(3600).optional(),
        },
      },
      async (input) => {
        const parsed = ReviewInputSchema.parse({ ...input, skill });
        try {
          const result = await runReview(parsed);
          return {
            content: [{ type: "text", text: formatReviewResult(result) }],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        } catch (err) {
          if (err instanceof SafetyError) {
            return {
              isError: true,
              content: [{ type: "text", text: `SafetyError: ${err.message}` }],
            };
          }
          const message = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [{ type: "text", text: `Error: ${message}` }],
          };
        }
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("adversarial-review MCP server failed:", err);
  process.exit(1);
});
