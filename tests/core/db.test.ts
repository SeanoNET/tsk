import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { openDb, initSchema, indexTask, removeTask, queryTasks, findTaskByPrefix, getMeta, setMeta } from "../../src/core/db.js";
import type { Task } from "../../src/core/task.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "test12345678",
    title: "Test task",
    status: "inbox",
    priority: "none",
    created: "2026-03-16T12:00:00.000Z",
    modified: "2026-03-16T12:00:00.000Z",
    body: "",
    ...overrides,
  };
}

describe("db", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
  });

  it("indexes and queries a task", () => {
    const task = makeTask();
    indexTask(db, task, "/tmp/test.md");
    const results = queryTasks(db);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("test12345678");
    expect(results[0].title).toBe("Test task");
  });

  it("removes a task", () => {
    indexTask(db, makeTask(), "/tmp/test.md");
    removeTask(db, "test12345678");
    expect(queryTasks(db)).toHaveLength(0);
  });

  it("filters by status", () => {
    indexTask(db, makeTask({ id: "a111111111aa", status: "inbox" }), "/tmp/a.md");
    indexTask(db, makeTask({ id: "b222222222bb", status: "next" }), "/tmp/b.md");
    const inbox = queryTasks(db, { status: "inbox" });
    expect(inbox).toHaveLength(1);
    expect(inbox[0].id).toBe("a111111111aa");
  });

  it("filters by tag using json_each", () => {
    indexTask(db, makeTask({ id: "tag111111111", tags: ["work", "urgent"] }), "/tmp/a.md");
    indexTask(db, makeTask({ id: "tag222222222", tags: ["personal"] }), "/tmp/b.md");
    const urgent = queryTasks(db, { tag: "urgent" });
    expect(urgent).toHaveLength(1);
    expect(urgent[0].id).toBe("tag111111111");
  });

  it("filters by due date range", () => {
    indexTask(db, makeTask({ id: "due111111111", due: "2026-03-15" }), "/tmp/a.md");
    indexTask(db, makeTask({ id: "due222222222", due: "2026-03-20" }), "/tmp/b.md");
    const before = queryTasks(db, { dueBefore: "2026-03-17" });
    expect(before).toHaveLength(1);
    expect(before[0].id).toBe("due111111111");
  });

  it("finds by prefix", () => {
    indexTask(db, makeTask({ id: "abc123456789" }), "/tmp/a.md");
    indexTask(db, makeTask({ id: "xyz987654321" }), "/tmp/b.md");
    const matches = findTaskByPrefix(db, "abc");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("abc123456789");
  });

  it("stores and retrieves meta", () => {
    setMeta(db, "last_sync_ref", "abc123");
    expect(getMeta(db, "last_sync_ref")).toBe("abc123");
    expect(getMeta(db, "nonexistent")).toBeNull();
  });

  it("upserts task on re-index", () => {
    indexTask(db, makeTask(), "/tmp/test.md");
    indexTask(db, makeTask({ title: "Updated" }), "/tmp/test.md");
    const results = queryTasks(db);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Updated");
  });
});
