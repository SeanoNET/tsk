import { DateTime } from "luxon";
import type { Database } from "bun:sqlite";
import type { Task, TaskPriority } from "../task.js";
import { readConfig } from "../config.js";
import { openDb, indexTask, queryTasks, getMeta, setMeta } from "../db.js";
import { dbPath, taskFilePath } from "../paths.js";
import { readTaskFile, writeTaskFile } from "../markdown.js";
import { findNextSlot } from "../scheduler.js";
import { graphGet, graphPost, graphPatch, graphDelete } from "./client.js";
import { isAuthenticated } from "./auth.js";

interface GraphTodoTask {
  id: string;
  title: string;
  status: string;
  importance: string;
  body?: { content: string; contentType: string };
  categories?: string[];
}

interface GraphEvent {
  id: string;
  subject: string;
  body?: { content: string; contentType: string };
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  showAs?: string;
  categories?: string[];
}

interface GraphList {
  id: string;
  displayName: string;
}

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// --- To Do list management ---

const TODO_LIST_META_KEY = "graph_todo_list_id";

export async function ensureTodoList(db: Database, clientId?: string): Promise<string> {
  // Check cached list ID
  const cached = getMeta(db, TODO_LIST_META_KEY);
  if (cached) return cached;

  const config = await readConfig();
  const listName = config.sync.todoListName ?? "tsk";

  // Search existing lists
  const lists = await graphGet<{ value: GraphList[] }>("/me/todo/lists", clientId);
  const existing = lists.value.find((l) => l.displayName === listName);
  if (existing) {
    setMeta(db, TODO_LIST_META_KEY, existing.id);
    return existing.id;
  }

  // Create new list
  const created = await graphPost<GraphList>("/me/todo/lists", { displayName: listName }, clientId);
  setMeta(db, TODO_LIST_META_KEY, created.id);
  return created.id;
}

// --- Payload builders ---

function mapPriority(priority: TaskPriority): string {
  switch (priority) {
    case "high":
      return "high";
    case "medium":
      return "normal";
    case "low":
      return "low";
    default:
      return "normal";
  }
}

function buildTodoPayload(task: Task): Record<string, unknown> {
  return {
    title: task.title,
    body: { contentType: "text", content: task.body || "" },
    importance: mapPriority(task.priority),
    status: task.status === "done" ? "completed" : "notStarted",
    categories: ["tsk"],
  };
}

async function resolveEventDateTime(db: Database, task: Task): Promise<string> {
  const due = task.due!;
  const config = await readConfig();
  const tz = config.core.timezone;

  let dt: DateTime;
  if (due.includes("T")) {
    // Has time component — convert to the configured timezone
    dt = DateTime.fromISO(due).setZone(tz);
  } else {
    // Date-only: use findNextSlot to pick a smart time within work hours
    const durationMinutes = parseDurationMinutes(task.duration) || 30;
    dt = findNextSlot(db, DateTime.fromISO(due), durationMinutes).setZone(tz);
  }

  // Graph API requires offset-free local datetime; timezone is sent separately
  return dt.toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS");
}

function parseDurationMinutes(duration?: string): number | null {
  if (!duration) return null;
  const hourMatch = duration.match(/(\d+)H/i);
  const minMatch = duration.match(/(\d+)M/i);
  let total = 0;
  if (hourMatch) total += parseInt(hourMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);
  return total > 0 ? total : null;
}

async function buildEventPayload(
  db: Database,
  task: Task
): Promise<Record<string, unknown>> {
  const config = await readConfig();
  const dateTime = await resolveEventDateTime(db, task);
  return {
    subject: task.title,
    body: { contentType: "text", content: task.body || "" },
    start: { dateTime, timeZone: config.core.timezone },
    end: { dateTime, timeZone: config.core.timezone },
    showAs: "free",
    categories: ["tsk"],
    isReminderOn: true,
    reminderMinutesBeforeStart: 15,
  };
}

// --- Sync log ---

function logSync(
  db: Database,
  operation: string,
  taskId: string,
  resource: string,
  status: string,
  detail?: string
): void {
  db.query(
    `INSERT INTO sync_log (timestamp, operation, task_id, graph_resource, status, detail)
     VALUES ($ts, $op, $taskId, $resource, $status, $detail)`
  ).run({
    $ts: DateTime.now().toISO()!,
    $op: operation,
    $taskId: taskId,
    $resource: resource,
    $status: status,
    $detail: detail ?? null,
  });
}

// --- Core sync functions ---

export async function syncTask(
  db: Database,
  task: Task,
  clientId?: string
): Promise<Task> {
  // Only sync tasks with due dates (as calendar events)
  // Tasks without due dates stay local — no To Do sync
  if (!task.due) return task;

  const isTerminal = task.status === "cancelled";
  return syncAsEvent(db, task, isTerminal, clientId);
}

async function syncAsEvent(
  db: Database,
  task: Task,
  isTerminal: boolean,
  clientId?: string
): Promise<Task> {
  // If task previously had a To Do (gained a due date), delete it
  if (task.graphTaskId) {
    await deleteTodoTask(db, task, clientId);
    task = { ...task, graphTaskId: undefined };
  }

  if (isTerminal) {
    // Cancelled — delete from calendar if it exists, otherwise nothing to do
    if (task.graphEventId) {
      await deleteEvent(db, task, clientId);
      task = { ...task, graphEventId: undefined };
      return await persistGraphIds(db, task);
    }
    return task;
  }

  const payload = await buildEventPayload(db, task);

  if (task.graphEventId) {
    // Update existing event
    await graphPatch(`/me/events/${task.graphEventId}`, payload, clientId);
    logSync(db, "update", task.id, "event", "success");
  } else {
    // Create new event
    const created = await graphPost<GraphEvent>("/me/events", payload, clientId);
    task = { ...task, graphEventId: created.id };
    logSync(db, "create", task.id, "event", "success");
  }

  return await persistGraphIds(db, task);
}

async function syncAsTodo(
  db: Database,
  task: Task,
  isTerminal: boolean,
  clientId?: string
): Promise<Task> {
  // If task previously had an Event (lost a due date), delete it
  if (task.graphEventId) {
    await deleteEvent(db, task, clientId);
    task = { ...task, graphEventId: undefined };
  }

  if (isTerminal) {
    // Cancelled — delete from To Do if it exists, otherwise nothing to do
    if (task.graphTaskId) {
      await deleteTodoTask(db, task, clientId);
      task = { ...task, graphTaskId: undefined };
      return await persistGraphIds(db, task);
    }
    return task;
  }

  const listId = await ensureTodoList(db, clientId);
  const payload = buildTodoPayload(task);

  if (task.graphTaskId) {
    // Update existing todo
    await graphPatch(`/me/todo/lists/${listId}/tasks/${task.graphTaskId}`, payload, clientId);
    logSync(db, "update", task.id, "task", "success");
  } else {
    // Create new todo
    const created = await graphPost<GraphTodoTask>(
      `/me/todo/lists/${listId}/tasks`,
      payload,
      clientId
    );
    task = { ...task, graphTaskId: created.id };
    logSync(db, "create", task.id, "task", "success");
  }

  return await persistGraphIds(db, task);
}

async function deleteEvent(db: Database, task: Task, clientId?: string): Promise<void> {
  if (!task.graphEventId) return;
  try {
    await graphDelete(`/me/events/${task.graphEventId}`, clientId);
    logSync(db, "delete", task.id, "event", "success");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logSync(db, "delete", task.id, "event", "failed", msg);
  }
}

async function deleteTodoTask(db: Database, task: Task, clientId?: string): Promise<void> {
  if (!task.graphTaskId) return;
  try {
    const listId = await ensureTodoList(db, clientId);
    await graphDelete(`/me/todo/lists/${listId}/tasks/${task.graphTaskId}`, clientId);
    logSync(db, "delete", task.id, "task", "success");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logSync(db, "delete", task.id, "task", "failed", msg);
  }
}

async function persistGraphIds(db: Database, task: Task): Promise<Task> {
  // Re-read the current file to avoid overwriting concurrent changes,
  // then merge only the graph IDs onto whatever is on disk now
  let current: Task;
  try {
    current = await readTaskFile(task.id);
  } catch {
    // File may not exist (deleted task) — fall back to writing the task as-is
    current = task;
  }
  const merged: Task = {
    ...current,
    graphTaskId: task.graphTaskId,
    graphEventId: task.graphEventId,
  };
  await writeTaskFile(merged);
  indexTask(db, merged, taskFilePath(merged.id));
  return merged;
}

// --- Bulk sync ---

export async function syncAll(db: Database, clientId?: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, skipped: 0, errors: [] };

  const tasks = queryTasks(db).filter(
    (t) => t.status !== "cancelled" && t.due
  );

  for (const task of tasks) {
    try {
      // Re-read from file to get latest state
      const fresh = await readTaskFile(task.id);
      await syncTask(db, fresh, clientId);
      result.synced++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.failed++;
      result.errors.push(`${task.id}: ${msg}`);
      logSync(db, "sync", task.id, task.due ? "event" : "task", "failed", msg);
    }
  }

  return result;
}

// --- Background sync (fire-and-forget) ---

export function syncTaskBackground(_db: Database, task: Task, clientId?: string): void {
  // Open a fresh DB connection so caller can close theirs independently
  const bgDb = openDb(dbPath());
  syncTask(bgDb, task, clientId)
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      logSync(bgDb, "sync", task.id, task.due ? "event" : "task", "failed", msg);
    })
    .finally(() => {
      bgDb.close();
    });
}

export async function syncTaskDeleted(
  db: Database,
  task: Task,
  clientId?: string
): Promise<void> {
  if (task.graphEventId) {
    await deleteEvent(db, task, clientId);
  }
}

// --- Background delete helper ---

export function syncTaskDeletedBackground(task: Task, clientId?: string): void {
  const bgDb = openDb(dbPath());
  syncTaskDeleted(bgDb, task, clientId)
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      logSync(bgDb, "delete", task.id, task.due ? "event" : "task", "failed", msg);
    })
    .finally(() => {
      bgDb.close();
    });
}
