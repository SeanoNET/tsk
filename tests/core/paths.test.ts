import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tskDir, tasksDir, dbPath, configPath, taskFilePath } from "../../src/core/paths.js";
import { join } from "path";
import { homedir } from "os";

describe("paths", () => {
  const originalTskDir = process.env.TSK_DIR;

  afterEach(() => {
    if (originalTskDir) {
      process.env.TSK_DIR = originalTskDir;
    } else {
      delete process.env.TSK_DIR;
    }
  });

  it("uses TSK_DIR env override", () => {
    process.env.TSK_DIR = "/tmp/test-tsk";
    expect(tskDir()).toBe("/tmp/test-tsk");
  });

  it("defaults to ~/.tsk on POSIX", () => {
    delete process.env.TSK_DIR;
    if (process.platform !== "win32") {
      expect(tskDir()).toBe(join(homedir(), ".tsk"));
    }
  });

  it("tasksDir is inside tskDir", () => {
    process.env.TSK_DIR = "/tmp/test-tsk";
    expect(tasksDir()).toBe("/tmp/test-tsk/tasks");
  });

  it("dbPath is inside tskDir", () => {
    process.env.TSK_DIR = "/tmp/test-tsk";
    expect(dbPath()).toBe("/tmp/test-tsk/index.db");
  });

  it("configPath is inside tskDir", () => {
    process.env.TSK_DIR = "/tmp/test-tsk";
    expect(configPath()).toBe("/tmp/test-tsk/config.toml");
  });

  it("taskFilePath builds correct path", () => {
    process.env.TSK_DIR = "/tmp/test-tsk";
    expect(taskFilePath("abc123")).toBe("/tmp/test-tsk/tasks/abc123.md");
  });
});
