import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "fs/promises";
import { join } from "path";
import { Database } from "bun:sqlite";
import { rebuildIndex } from "../../src/core/reindex.js";
import { initSchema, openDb, queryTasks, indexTask } from "../../src/core/db.js";
import { serializeTask } from "../../src/core/markdown.js";
import type { Task } from "../../src/core/task.js";
const TMPDIR = "/tmp/claude-1000";

function makeTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title,
    status: "inbox",
    priority: "none",
    created: "2026-01-01T00:00:00.000Z",
    modified: "2026-01-01T00:00:00.000Z",
    body: "",
    ...overrides,
  };
}

describe("rebuildIndex", () => {
  let tempDir: string;
  let db: Database;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(TMPDIR, "tsk-reindex-test-"));
    await mkdir(join(tempDir, "tasks"), { recursive: true });
    process.env.TSK_DIR = tempDir;
    db = openDb(join(tempDir, "index.db"));
    initSchema(db);
  });

  afterEach(async () => {
    db.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("indexes markdown files from tasks dir", async () => {
    const task = makeTask("abc123", "Test task");
    await Bun.write(join(tempDir, "tasks", "abc123.md"), serializeTask(task));

    const result = await rebuildIndex(db);
    expect(result.indexed).toBe(1);
    expect(result.removed).toBe(0);

    const tasks = queryTasks(db);
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe("Test task");
  });

  it("removes DB rows for deleted files", async () => {
    // Index a task first
    const task = makeTask("del001", "Will be deleted");
    indexTask(db, task, join(tempDir, "tasks", "del001.md"));

    // Don't write the file — simulates it being deleted
    const result = await rebuildIndex(db);
    expect(result.removed).toBe(1);

    const tasks = queryTasks(db);
    expect(tasks.length).toBe(0);
  });

  it("skips malformed files without breaking", async () => {
    // Write a valid task
    const valid = makeTask("good01", "Valid task");
    await Bun.write(join(tempDir, "tasks", "good01.md"), serializeTask(valid));

    // Write a malformed file
    await Bun.write(join(tempDir, "tasks", "bad001.md"), "this is not valid frontmatter {{{{");

    const result = await rebuildIndex(db);
    // The valid one gets indexed, the bad one is skipped
    expect(result.indexed).toBeGreaterThanOrEqual(1);
  });

  it("handles empty tasks directory", async () => {
    const result = await rebuildIndex(db);
    expect(result.indexed).toBe(0);
    expect(result.removed).toBe(0);
  });

  it("upserts existing tasks", async () => {
    // Index initial version
    const task = makeTask("upd001", "Version 1");
    await Bun.write(join(tempDir, "tasks", "upd001.md"), serializeTask(task));
    await rebuildIndex(db);

    // Update the file
    const updated = makeTask("upd001", "Version 2");
    await Bun.write(join(tempDir, "tasks", "upd001.md"), serializeTask(updated));
    const result = await rebuildIndex(db);

    expect(result.indexed).toBe(1);
    const tasks = queryTasks(db);
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe("Version 2");
  });
});
