import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { mkdir } from "fs/promises";

const TMPDIR = tmpdir();
await mkdir(TMPDIR, { recursive: true });
import { initSchema } from "../../src/core/db.js";
import { gitInit } from "../../src/core/git.js";
import { createTask, getTask, updateTask, deleteTask, completeTask, listTasks } from "../../src/core/crud.js";

describe("crud", () => {
  let db: Database;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(TMPDIR, "tsk-crud-test-"));
    process.env.TSK_DIR = tempDir;

    // Create tasks directory and init git
    await Bun.write(join(tempDir, "tasks", ".gitkeep"), "");
    await gitInit(tempDir);

    db = new Database(":memory:");
    initSchema(db);
  });

  it("creates a task with file, index, and commit", async () => {
    const task = await createTask(db, "Test task", { priority: "high" });
    expect(task.title).toBe("Test task");
    expect(task.priority).toBe("high");
    expect(task.status).toBe("inbox");

    // Verify file exists
    const file = Bun.file(join(tempDir, "tasks", `${task.id}.md`));
    expect(await file.exists()).toBe(true);

    // Verify indexed
    const tasks = listTasks(db);
    expect(tasks).toHaveLength(1);
  });

  it("gets a task by prefix", async () => {
    const created = await createTask(db, "Prefix test");
    const found = await getTask(db, created.id.slice(0, 4));
    expect(found.id).toBe(created.id);
  });

  it("updates a task", async () => {
    const task = await createTask(db, "Update me");
    const updated = await updateTask(db, task.id, { priority: "high", area: "work" });
    expect(updated.priority).toBe("high");
    expect(updated.area).toBe("work");
    expect(updated.id).toBe(task.id);
  });

  it("completes a task", async () => {
    const task = await createTask(db, "Complete me");
    const done = await completeTask(db, task.id);
    expect(done.status).toBe("done");
    expect(done.completed).toBeTruthy();
  });

  it("deletes a task", async () => {
    const task = await createTask(db, "Delete me");
    await deleteTask(db, task.id);
    expect(listTasks(db)).toHaveLength(0);
    const file = Bun.file(join(tempDir, "tasks", `${task.id}.md`));
    expect(await file.exists()).toBe(false);
  });

  it("throws on ambiguous prefix", async () => {
    // Create two tasks and try a very short prefix
    const t1 = await createTask(db, "Task 1");
    const t2 = await createTask(db, "Task 2");
    // Using empty string should match both
    expect(getTask(db, "")).rejects.toThrow(/Ambiguous|No task/);
  });
});
