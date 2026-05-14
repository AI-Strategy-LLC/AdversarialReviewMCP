import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadArchitectureContext } from "../src/guidance.js";

async function tmpRepo(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "advrev-guidance-test-"));
}

async function rm(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true });
}

describe("loadArchitectureContext", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await tmpRepo();
  });

  afterEach(async () => {
    await rm(repo);
  });

  it("loads ARCHITECTURE_GUIDELINES from src/guidance when present", async () => {
    const ctx = await loadArchitectureContext(repo);
    // The repo's own src/guidance/ has been synced from DevTeamSwarmControl
    // during dev. In CI / clean checkout it may be absent — accept either.
    if (ctx.guidelinesPresent) {
      expect(ctx.guidelines.length).toBeGreaterThan(100);
      expect(ctx.warnings).not.toContain(
        expect.stringMatching(/ARCHITECTURE_GUIDELINES\.md not vendored/)
      );
    } else {
      expect(ctx.guidelines).toMatch(/No architectural guidance loaded/);
      expect(
        ctx.warnings.some((w) => w.includes("not vendored"))
      ).toBe(true);
    }
  });

  it("returns empty repo context when no .adversarial-review/architecture.json exists", async () => {
    const ctx = await loadArchitectureContext(repo);
    expect(ctx.repoContext).toBe("");
    expect(ctx.loadedSlices).toEqual({});
    expect(ctx.repoConfigPath).toBeUndefined();
  });

  it("warns and ignores when architecture.json is malformed JSON", async () => {
    await fs.mkdir(path.join(repo, ".adversarial-review"), { recursive: true });
    await fs.writeFile(
      path.join(repo, ".adversarial-review", "architecture.json"),
      "{not json",
      "utf8"
    );
    const ctx = await loadArchitectureContext(repo);
    expect(ctx.repoContext).toBe("");
    expect(
      ctx.warnings.some((w) => w.includes("failed to parse"))
    ).toBe(true);
  });

  it("warns and ignores when architecture.json is not an object", async () => {
    await fs.mkdir(path.join(repo, ".adversarial-review"), { recursive: true });
    await fs.writeFile(
      path.join(repo, ".adversarial-review", "architecture.json"),
      JSON.stringify(["not", "an", "object"]),
      "utf8"
    );
    const ctx = await loadArchitectureContext(repo);
    expect(ctx.repoContext).toBe("");
    expect(
      ctx.warnings.some((w) => w.includes("not a JSON object"))
    ).toBe(true);
  });

  it("warns and ignores values that fail the name allowlist", async () => {
    await fs.mkdir(path.join(repo, ".adversarial-review"), { recursive: true });
    await fs.writeFile(
      path.join(repo, ".adversarial-review", "architecture.json"),
      JSON.stringify({ pattern: "../../etc/passwd" }),
      "utf8"
    );
    const ctx = await loadArchitectureContext(repo);
    expect(ctx.loadedSlices.pattern).toBeUndefined();
    expect(
      ctx.warnings.some((w) =>
        w.includes("disallowed characters") && w.includes("pattern")
      )
    ).toBe(true);
  });

  it("warns and ignores non-string values", async () => {
    await fs.mkdir(path.join(repo, ".adversarial-review"), { recursive: true });
    await fs.writeFile(
      path.join(repo, ".adversarial-review", "architecture.json"),
      JSON.stringify({ domain: 42 }),
      "utf8"
    );
    const ctx = await loadArchitectureContext(repo);
    expect(ctx.loadedSlices.domain).toBeUndefined();
    expect(
      ctx.warnings.some(
        (w) => w.includes("'domain'") && w.includes("must be a string")
      )
    ).toBe(true);
  });

  it("warns when a referenced slice has no guidance file", async () => {
    await fs.mkdir(path.join(repo, ".adversarial-review"), { recursive: true });
    await fs.writeFile(
      path.join(repo, ".adversarial-review", "architecture.json"),
      JSON.stringify({ domain: "does-not-exist-anywhere" }),
      "utf8"
    );
    const ctx = await loadArchitectureContext(repo);
    expect(ctx.loadedSlices.domain).toBeUndefined();
    expect(
      ctx.warnings.some(
        (w) =>
          w.includes("does-not-exist-anywhere") &&
          w.includes("no guidance file")
      )
    ).toBe(true);
  });

  it("emits repo context when a valid slice is referenced and present", async () => {
    await fs.mkdir(path.join(repo, ".adversarial-review"), { recursive: true });
    // 'cli-tool' is a real domain file shipped with DevTeamSwarmControl.
    // Skip this assertion if the guidance dir is empty (CI without sync).
    const fixtureCheck = await fs
      .stat(
        path.join(
          new URL("../src/guidance/domains/cli-tool.md", import.meta.url)
            .pathname
        )
      )
      .catch(() => undefined);
    if (!fixtureCheck) return;

    await fs.writeFile(
      path.join(repo, ".adversarial-review", "architecture.json"),
      JSON.stringify({ domain: "cli-tool" }),
      "utf8"
    );
    const ctx = await loadArchitectureContext(repo);
    expect(ctx.loadedSlices.domain).toBeDefined();
    expect(ctx.repoContext).toContain("Domain: `cli-tool`");
    expect(ctx.repoConfigPath).toBe(
      path.join(repo, ".adversarial-review", "architecture.json")
    );
  });
});
