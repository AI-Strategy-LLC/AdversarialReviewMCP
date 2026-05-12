import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  SafetyError,
  assertContained,
} from "../src/safety.js";
import {
  assertCleanRepo,
  assertGitRepo,
  copyReportBack,
  createWorktree,
  removeWorktree,
  resolveRef,
  validateRef,
} from "../src/worktree.js";

const execFileP = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileP("git", args, { cwd });
}

let tmpRepo: string;

beforeAll(async () => {
  const root = await fs.realpath(os.tmpdir());
  tmpRepo = await fs.mkdtemp(path.join(root, "ar-worktree-test-"));
  await git(tmpRepo, ["init", "-q", "-b", "main"]);
  await git(tmpRepo, ["config", "user.email", "test@example.com"]);
  await git(tmpRepo, ["config", "user.name", "Test"]);
  await fs.writeFile(path.join(tmpRepo, "README.md"), "hello\n");
  await git(tmpRepo, ["add", "README.md"]);
  await git(tmpRepo, ["commit", "-q", "-m", "first"]);
});

afterAll(async () => {
  if (tmpRepo) {
    await fs.rm(tmpRepo, { recursive: true, force: true });
  }
});

describe("validateRef", () => {
  it("accepts common ref shapes", () => {
    expect(validateRef("main")).toBe("main");
    expect(validateRef("feature/foo")).toBe("feature/foo");
    expect(validateRef("v1.2.3")).toBe("v1.2.3");
    expect(validateRef("abc123")).toBe("abc123");
    expect(validateRef("HEAD~3")).toBe("HEAD~3");
    expect(validateRef("origin/main")).toBe("origin/main");
  });
  it("rejects shell-meta and whitespace", () => {
    expect(() => validateRef("foo; rm")).toThrow(SafetyError);
    expect(() => validateRef("foo`bar`")).toThrow(SafetyError);
    expect(() => validateRef("foo bar")).toThrow(SafetyError);
  });
  it("undefined / empty returns undefined", () => {
    expect(validateRef(undefined)).toBeUndefined();
    expect(validateRef("")).toBeUndefined();
  });
});

describe("assertGitRepo", () => {
  it("passes on a real git repo", async () => {
    await expect(assertGitRepo(tmpRepo)).resolves.toBeUndefined();
  });
  it("fails on a non-git directory", async () => {
    const notGit = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "ar-nongit-")
    );
    try {
      await expect(assertGitRepo(notGit)).rejects.toBeInstanceOf(SafetyError);
    } finally {
      await fs.rm(notGit, { recursive: true, force: true });
    }
  });
});

describe("assertCleanRepo", () => {
  it("passes on a clean repo", async () => {
    await expect(assertCleanRepo(tmpRepo)).resolves.toBeUndefined();
  });
  it("fails when there are uncommitted changes", async () => {
    const dirty = path.join(tmpRepo, "dirty.txt");
    await fs.writeFile(dirty, "uncommitted\n");
    try {
      await expect(assertCleanRepo(tmpRepo)).rejects.toBeInstanceOf(SafetyError);
    } finally {
      await fs.rm(dirty);
    }
  });
});

describe("resolveRef", () => {
  it("resolves HEAD to a 40-char sha", async () => {
    const r = await resolveRef(tmpRepo, undefined);
    expect(r.ref).toBe("HEAD");
    expect(r.sha).toMatch(/^[0-9a-f]{40}$/);
  });
  it("resolves a branch name", async () => {
    const r = await resolveRef(tmpRepo, "main");
    expect(r.ref).toBe("main");
    expect(r.sha).toMatch(/^[0-9a-f]{40}$/);
  });
  it("fails on a non-existent ref", async () => {
    await expect(
      resolveRef(tmpRepo, "no-such-branch-123abc")
    ).rejects.toBeInstanceOf(SafetyError);
  });
});

describe("createWorktree / removeWorktree", () => {
  it("creates a detached worktree at the requested sha and cleans up", async () => {
    const handle = await createWorktree(tmpRepo, undefined);
    try {
      const stat = await fs.stat(handle.path);
      expect(stat.isDirectory()).toBe(true);
      const readme = await fs.readFile(
        path.join(handle.path, "README.md"),
        "utf8"
      );
      expect(readme).toBe("hello\n");
      expect(handle.sha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      await removeWorktree(handle);
    }
    await expect(fs.access(handle.path)).rejects.toBeTruthy();
  });
});

describe("copyReportBack", () => {
  it("copies a file from the worktree into the main repo and creates intermediate dirs", async () => {
    const handle = await createWorktree(tmpRepo, undefined);
    try {
      const sub = path.join(handle.path, "docs/honesty-audit");
      await fs.mkdir(sub, { recursive: true });
      const src = path.join(sub, "REPORT.md");
      await fs.writeFile(src, "# fake report\n");
      const destination = await copyReportBack(handle.path, tmpRepo, src);
      expect(destination).toBe(path.join(tmpRepo, "docs/honesty-audit/REPORT.md"));
      const back = await fs.readFile(destination, "utf8");
      expect(back).toBe("# fake report\n");
      await fs.rm(path.join(tmpRepo, "docs"), { recursive: true, force: true });
    } finally {
      await removeWorktree(handle);
    }
  });

  it("refuses a report path outside the worktree", async () => {
    const handle = await createWorktree(tmpRepo, undefined);
    try {
      await expect(
        copyReportBack(handle.path, tmpRepo, "/etc/hosts")
      ).rejects.toBeInstanceOf(SafetyError);
    } finally {
      await removeWorktree(handle);
    }
  });
});

describe("assertContained — sanity", () => {
  it("accepts a worktree child of /tmp", async () => {
    const handle = await createWorktree(tmpRepo, undefined);
    try {
      expect(() =>
        assertContained(handle.path, path.join(handle.path, "x"))
      ).not.toThrow();
    } finally {
      await removeWorktree(handle);
    }
  });
});
