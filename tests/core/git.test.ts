import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";

const TMPDIR = "/tmp/claude-1000";
import { gitInit, isGitRepo, gitAdd, gitCommit } from "../../src/core/git.js";

describe("git", () => {
  let tempDir: string;
  const originalTskDir = process.env.TSK_DIR;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(TMPDIR, "tsk-git-test-"));
    process.env.TSK_DIR = tempDir;
  });

  it("initializes a git repo", async () => {
    await gitInit(tempDir);
    expect(await isGitRepo(tempDir)).toBe(true);
  });

  it("reports non-repo correctly", async () => {
    expect(await isGitRepo(tempDir)).toBe(false);
  });

  it("commits files with tsk author", async () => {
    await gitInit(tempDir);
    await Bun.write(join(tempDir, "test.txt"), "hello");
    await gitAdd(["test.txt"]);
    await gitCommit("test: initial commit");

    const proc = Bun.spawn(["git", "log", "--format=%an", "-1"], {
      cwd: tempDir,
      stdout: "pipe",
    });
    const author = await new Response(proc.stdout).text();
    expect(author.trim()).toBe("tsk");
  });
});
