import { Database } from "bun:sqlite";
import { dbPath } from "./paths.js";
import type { Task, TaskStatus, TaskPriority } from "./task.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inbox',
  priority TEXT NOT NULL DEFAULT 'none',
  created TEXT NOT NULL,
  modified TEXT NOT NULL,
  due TEXT,
  scheduled TEXT,
  completed TEXT,
  area TEXT,
  project TEXT,
  tags TEXT DEFAULT '[]',
  duration TEXT,
  recurrence TEXT,
  waiting_on TEXT,
  graph_task_id TEXT,
  graph_event_id TEXT,
  file_path TEXT NOT NULL,
  body TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  operation TEXT NOT NULL,
  task_id TEXT,
  graph_resource TEXT,
  status TEXT NOT NULL,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due);
CREATE INDEX IF NOT EXISTS idx_tasks_area ON tasks(area);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
`;

export function openDb(path?: string): Database {
  const db = new Database(path ?? dbPath());
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  return db;
}

export function initSchema(db: Database): void {
  db.run(SCHEMA);
}

export function indexTask(db: Database, task: Task, filePath: string): void {
  db.query(`
    INSERT OR REPLACE INTO tasks
    (id, title, status, priority, created, modified, due, scheduled, completed,
     area, project, tags, duration, recurrence, waiting_on, graph_task_id, graph_event_id, file_path, body)
    VALUES
    ($id, $title, $status, $priority, $created, $modified, $due, $scheduled, $completed,
     $area, $project, $tags, $duration, $recurrence, $waitingOn, $graphTaskId, $graphEventId, $filePath, $body)
  `).run({
    $id: task.id,
    $title: task.title,
    $status: task.status,
    $priority: task.priority,
    $created: task.created,
    $modified: task.modified,
    $due: task.due ?? null,
    $scheduled: task.scheduled ?? null,
    $completed: task.completed ?? null,
    $area: task.area ?? null,
    $project: task.project ?? null,
    $tags: JSON.stringify(task.tags ?? []),
    $duration: task.duration ?? null,
    $recurrence: task.recurrence ?? null,
    $waitingOn: task.waitingOn ?? null,
    $graphTaskId: task.graphTaskId ?? null,
    $graphEventId: task.graphEventId ?? null,
    $filePath: filePath,
    $body: task.body ?? "",
  });
}

export function removeTask(db: Database, id: string): void {
  db.query("DELETE FROM tasks WHERE id = $id").run({ $id: id });
}

export interface TaskFilter {
  status?: TaskStatus;
  priority?: TaskPriority;
  area?: string;
  project?: string;
  tag?: string;
  dueBefore?: string;
  dueAfter?: string;
  search?: string;
}

export function queryTasks(db: Database, filter: TaskFilter = {}): Task[] {
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (filter.status) {
    conditions.push("status = $status");
    params.$status = filter.status;
  }
  if (filter.priority) {
    conditions.push("priority = $priority");
    params.$priority = filter.priority;
  }
  if (filter.area) {
    conditions.push("area = $area");
    params.$area = filter.area;
  }
  if (filter.project) {
    conditions.push("project = $project");
    params.$project = filter.project;
  }
  if (filter.tag) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(tags) WHERE json_each.value = $tag)");
    params.$tag = filter.tag;
  }
  if (filter.dueBefore) {
    conditions.push("due IS NOT NULL AND due <= $dueBefore");
    params.$dueBefore = filter.dueBefore;
  }
  if (filter.dueAfter) {
    conditions.push("due IS NOT NULL AND due >= $dueAfter");
    params.$dueAfter = filter.dueAfter;
  }
  if (filter.search) {
    conditions.push("(title LIKE $search OR body LIKE $search)");
    params.$search = `%${filter.search}%`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.query(`SELECT * FROM tasks ${where} ORDER BY created DESC`).all(params) as Record<string, unknown>[];

  return rows.map(rowToTask);
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    created: row.created as string,
    modified: row.modified as string,
    due: (row.due as string) ?? undefined,
    scheduled: (row.scheduled as string) ?? undefined,
    completed: (row.completed as string) ?? undefined,
    area: (row.area as string) ?? undefined,
    project: (row.project as string) ?? undefined,
    tags: JSON.parse((row.tags as string) || "[]"),
    duration: (row.duration as string) ?? undefined,
    recurrence: (row.recurrence as string) ?? undefined,
    waitingOn: (row.waiting_on as string) ?? undefined,
    graphTaskId: (row.graph_task_id as string) ?? undefined,
    graphEventId: (row.graph_event_id as string) ?? undefined,
    body: (row.body as string) ?? "",
  };
}

export function findTaskByPrefix(db: Database, prefix: string): Task[] {
  const rows = db.query("SELECT * FROM tasks WHERE id LIKE $prefix").all({
    $prefix: `${prefix}%`,
  }) as Record<string, unknown>[];
  return rows.map(rowToTask);
}

export function getMeta(db: Database, key: string): string | null {
  const row = db.query("SELECT value FROM meta WHERE key = $key").get({ $key: key }) as { value: string } | null;
  return row?.value ?? null;
}

export function setMeta(db: Database, key: string, value: string): void {
  db.query("INSERT OR REPLACE INTO meta (key, value) VALUES ($key, $value)").run({
    $key: key,
    $value: value,
  });
}
