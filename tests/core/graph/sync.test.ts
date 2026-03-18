import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp } from "fs/promises";
import { join } from "path";
import { DateTime } from "luxon";

const TMPDIR = "/tmp/claude-1000";

import { initSchema, getMeta, setMeta, indexTask } from "../../../src/core/db.js";
import { writeTaskFile } from "../../../src/core/markdown.js";
import type { Task } from "../../../src/core/task.js";
import { createTaskDefaults } from "../../../src/core/task.js";

// Mock auth module (must be before importing sync which imports client which imports auth)
mock.module("../../../src/core/graph/auth.js", () => ({
  isAuthenticated: () => Promise.resolve(true),
  getAccessToken: () => Promise.resolve("fake-token"),
}));

// We mock global fetch to intercept Graph API calls (the client module uses fetch internally)
const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; method: string; body?: unknown }[];
let fetchResponses: { status: number; body: unknown }[];

function setupFetchMock() {
  fetchCalls = [];
  fetchResponses = [];
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    fetchCalls.push({ url: String(url), method, body });

    const response = fetchResponses.shift();
    if (!response) {
      return Promise.resolve(new Response(JSON.stringify({ id: "default-id", value: [] }), { status: 200 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(response.body), { status: response.status })
    );
  }) as typeof fetch;
}

function queueResponse(status: number, body: unknown) {
  fetchResponses.push({ status, body });
}

// Import sync after mocks are set up
const { syncTask, syncAll, ensureTodoList, syncTaskDeleted } = await import(
  "../../../src/core/graph/sync.js"
);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    ...createTaskDefaults("Test task"),
    ...overrides,
  };
}

describe("graph/sync", () => {
  let db: Database;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(TMPDIR, "tsk-sync-test-"));
    process.env.TSK_DIR = tempDir;
    await Bun.write(join(tempDir, "tasks", ".gitkeep"), "");

    db = new Database(":memory:");
    initSchema(db);

    setupFetchMock();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("routing logic", () => {
    it("skips task without due date (no sync)", async () => {
      const task = makeTask({ title: "No due date task" });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      const result = await syncTask(db, task);

      // No API calls — tasks without due are not synced
      expect(fetchCalls).toHaveLength(0);
      expect(result.graphTaskId).toBeUndefined();
      expect(result.graphEventId).toBeUndefined();
    });

    it("routes task with due to Calendar Event", async () => {
      const task = makeTask({
        title: "Has due date",
        due: "2026-03-20T10:00:00.000Z",
      });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      queueResponse(201, { id: "new-event-id" });

      const result = await syncTask(db, task);

      expect(result.graphEventId).toBe("new-event-id");
      expect(result.graphTaskId).toBeUndefined();
      const eventCalls = fetchCalls.filter((c) => c.url.includes("/me/events"));
      expect(eventCalls).toHaveLength(1);
      expect(eventCalls[0].method).toBe("POST");
    });
  });

  describe("Calendar Event sync", () => {
    it("creates an event with datetime due", async () => {
      const task = makeTask({
        title: "Team standup",
        due: "2026-03-20T09:30:00.000-05:00",
      });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      queueResponse(201, { id: "new-event-id" });

      const result = await syncTask(db, task);

      const eventPost = fetchCalls.find(
        (c) => c.method === "POST" && c.url.includes("/me/events")
      );
      expect(eventPost).toBeDefined();
      expect((eventPost!.body as any).subject).toBe("Team standup");
      expect((eventPost!.body as any).showAs).toBe("free");
      expect((eventPost!.body as any).isReminderOn).toBe(true);
      expect((eventPost!.body as any).reminderMinutesBeforeStart).toBe(15);
      expect((eventPost!.body as any).categories).toEqual(["tsk"]);
      // start and end should be equal (zero-duration)
      expect((eventPost!.body as any).start).toEqual((eventPost!.body as any).end);
      expect(result.graphEventId).toBe("new-event-id");
    });

    it("creates an event with date-only due (uses scheduler)", async () => {
      const task = makeTask({
        title: "Date only event",
        due: "2026-03-20",
      });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      queueResponse(201, { id: "scheduled-event-id" });

      const result = await syncTask(db, task);

      const eventPost = fetchCalls.find(
        (c) => c.method === "POST" && c.url.includes("/me/events")
      );
      // Should have a time component (from findNextSlot)
      expect((eventPost!.body as any).start.dateTime).toContain("T");
      expect(result.graphEventId).toBe("scheduled-event-id");
    });

    it("updates an existing event", async () => {
      const task = makeTask({
        title: "Updated event",
        due: "2026-03-20T10:00:00.000Z",
        graphEventId: "existing-event-id",
      });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      queueResponse(200, {}); // PATCH

      await syncTask(db, task);

      const patchCalls = fetchCalls.filter((c) => c.method === "PATCH");
      expect(patchCalls).toHaveLength(1);
      expect(patchCalls[0].url).toContain("existing-event-id");
    });
  });

  describe("state transitions", () => {
    it("cleans up old To Do when task has due date and graphTaskId", async () => {
      setMeta(db, "graph_todo_list_id", "list-id-abc");

      const task = makeTask({
        title: "Migrating task",
        due: "2026-03-25T14:00:00.000Z",
        graphTaskId: "old-todo-id",
      });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      queueResponse(204, ""); // DELETE old todo
      queueResponse(201, { id: "new-event-id" }); // POST new event

      const result = await syncTask(db, task);

      const deleteCalls = fetchCalls.filter((c) => c.method === "DELETE");
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].url).toContain("old-todo-id");

      const postCalls = fetchCalls.filter((c) => c.method === "POST");
      expect(postCalls).toHaveLength(1);
      expect(postCalls[0].url).toContain("/me/events");

      expect(result.graphEventId).toBe("new-event-id");
      expect(result.graphTaskId).toBeUndefined();
    });
  });

  describe("cancelled tasks", () => {
    it("deletes Event for cancelled task with graphEventId", async () => {
      const task = makeTask({
        title: "Cancelled with event",
        status: "cancelled",
        due: "2026-03-20T10:00:00.000Z",
        graphEventId: "event-to-delete",
      });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      queueResponse(204, ""); // DELETE

      const result = await syncTask(db, task);

      const deleteCalls = fetchCalls.filter((c) => c.method === "DELETE");
      expect(deleteCalls).toHaveLength(1);
      expect(result.graphEventId).toBeUndefined();
    });

    it("does nothing for cancelled task without graph IDs", async () => {
      const task = makeTask({
        title: "Cancelled never synced",
        status: "cancelled",
        due: "2026-03-20T10:00:00.000Z",
      });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      await syncTask(db, task);

      expect(fetchCalls).toHaveLength(0);
    });

    it("skips cancelled task without due", async () => {
      const task = makeTask({
        title: "Cancelled no due",
        status: "cancelled",
      });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      const result = await syncTask(db, task);

      expect(fetchCalls).toHaveLength(0);
      expect(result.graphEventId).toBeUndefined();
    });
  });

  describe("ensureTodoList", () => {
    it("returns cached list ID from meta", async () => {
      setMeta(db, "graph_todo_list_id", "cached-id");
      const id = await ensureTodoList(db);
      expect(id).toBe("cached-id");
      expect(fetchCalls).toHaveLength(0);
    });

    it("finds existing list by name", async () => {
      queueResponse(200, {
        value: [
          { id: "other-list", displayName: "Shopping" },
          { id: "tsk-list-id", displayName: "tsk" },
        ],
      });

      const id = await ensureTodoList(db);
      expect(id).toBe("tsk-list-id");
      expect(getMeta(db, "graph_todo_list_id")).toBe("tsk-list-id");
    });

    it("creates new list if not found", async () => {
      queueResponse(200, { value: [] });
      queueResponse(201, { id: "new-list-id", displayName: "tsk" });

      const id = await ensureTodoList(db);
      expect(id).toBe("new-list-id");

      const postCalls = fetchCalls.filter((c) => c.method === "POST");
      expect(postCalls).toHaveLength(1);
      expect((postCalls[0].body as any).displayName).toBe("tsk");
    });
  });

  describe("syncAll", () => {
    it("syncs only tasks with due dates", async () => {
      const task1 = makeTask({ title: "No due" });
      const task2 = makeTask({ title: "Has due", due: "2026-03-20T10:00:00.000Z" });
      for (const t of [task1, task2]) {
        await writeTaskFile(t);
        indexTask(db, t, join(tempDir, "tasks", `${t.id}.md`));
      }

      queueResponse(201, { id: "event-1" });

      const result = await syncAll(db);
      // Only task2 (with due) should be synced
      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);
    });

    it("counts failures without stopping", async () => {
      const task1 = makeTask({ title: "Fail task", due: "2026-03-20T10:00:00.000Z" });
      await writeTaskFile(task1);
      indexTask(db, task1, join(tempDir, "tasks", `${task1.id}.md`));

      queueResponse(500, { error: "Server Error" });

      const result = await syncAll(db);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it("skips cancelled tasks", async () => {
      const task = makeTask({ title: "Cancelled", status: "cancelled", due: "2026-03-20T10:00:00.000Z" });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      const result = await syncAll(db);
      expect(result.synced).toBe(0);
      expect(fetchCalls).toHaveLength(0);
    });

    it("skips tasks without due", async () => {
      const task = makeTask({ title: "No due" });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      const result = await syncAll(db);
      expect(result.synced).toBe(0);
      expect(fetchCalls).toHaveLength(0);
    });
  });

  describe("syncTaskDeleted", () => {
    it("deletes event for task with graphEventId", async () => {
      queueResponse(204, "");
      const task = makeTask({ graphEventId: "event-123" });
      await syncTaskDeleted(db, task);
      const deleteCalls = fetchCalls.filter((c) => c.method === "DELETE");
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].url).toContain("event-123");
    });

    it("does nothing for task with only graphTaskId (no To Do sync)", async () => {
      const task = makeTask({ graphTaskId: "todo-456" });
      await syncTaskDeleted(db, task);
      expect(fetchCalls).toHaveLength(0);
    });

    it("only deletes event if task has both IDs", async () => {
      queueResponse(204, "");
      const task = makeTask({ graphEventId: "event-789", graphTaskId: "todo-789" });
      await syncTaskDeleted(db, task);
      const deleteCalls = fetchCalls.filter((c) => c.method === "DELETE");
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].url).toContain("event-789");
    });

    it("does nothing for task with no graph IDs", async () => {
      const task = makeTask({});
      await syncTaskDeleted(db, task);
      expect(fetchCalls).toHaveLength(0);
    });
  });

  describe("sync log", () => {
    it("logs successful event sync", async () => {
      const task = makeTask({ title: "Logged task", due: "2026-03-20T10:00:00.000Z" });
      await writeTaskFile(task);
      indexTask(db, task, join(tempDir, "tasks", `${task.id}.md`));

      queueResponse(201, { id: "new-id" });
      await syncTask(db, task);

      const logs = db
        .query("SELECT * FROM sync_log WHERE task_id = $id")
        .all({ $id: task.id }) as Record<string, unknown>[];
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].status).toBe("success");
      expect(logs[0].operation).toBe("create");
      expect(logs[0].graph_resource).toBe("event");
    });
  });
});
