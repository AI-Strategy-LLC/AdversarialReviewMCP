import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKILL_NAMES } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_DIR = path.join(__dirname, "..", "src", "prompts");

describe("prompt templates honor the review-mode write contract", () => {
  for (const skill of SKILL_NAMES) {
    it(`${skill}.txt includes the {{ARTIFACT_CONTRACT}} slot`, async () => {
      const body = await fs.readFile(
        path.join(PROMPT_DIR, `${skill}.txt`),
        "utf8"
      );
      expect(body).toContain("{{ARTIFACT_CONTRACT}}");
    });

    it(`${skill}.txt does not instruct the reviewer to write the report itself`, async () => {
      const body = await fs.readFile(
        path.join(PROMPT_DIR, `${skill}.txt`),
        "utf8"
      );
      // Heuristic: scan for the old "Write `path/to/REPORT.md`" or
      // "Write the full report to" wording that the contract supersedes.
      // The new wording says "Emit ... per the ARTIFACT EMISSION CONTRACT".
      expect(body).not.toMatch(/^Write `/m);
      expect(body).not.toMatch(/^Write the full report to/m);
      expect(body).not.toMatch(/^Write the two artefacts/m);
    });
  }
});
