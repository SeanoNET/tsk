import { DateTime } from "luxon";
import { Database } from "bun:sqlite";
import { type Task, type TaskFrontmatter, createTaskDefaults, validateTask } from "./task.js";
import { readTaskFile, writeTaskFile } from "./markdown.js";
import { indexTask, removeTask, queryTasks, findTaskByPrefix, type TaskFilter } from "./db.js";
import { autoCommit } from "./git.js";
import { taskFilePath, tasksDir } from "./paths.js";
import { unlink } from "fs/promises";
import { triggerAutoSync } from "./sync.js";

export async function createTask(
  db: Database,
  title: string,
  overrides: Partial<TaskFrontmatter> = {}
): Promise<Task> {
  const task = createTaskDefaults(title, overrides);
  const errors = validateTask(task);
  if (errors.length > 0) throw new Error(`Invalid task: ${errors.join(", ")}`);

  const filePath = taskFilePath(task.id);
  await writeTaskFile(task);
  indexTask(db, task, filePath);
  await autoCommit("create", task.title);
  triggerAutoSync(db);
  return task;
}

export async function getTask(db: Database, idOrPrefix: string): Promise<Task> {
  const matches = findTaskByPrefix(db, idOrPrefix);
  if (matches.length === 0) throw new Error(`No task found matching: ${idOrPrefix}`);
  if (matches.length > 1) {
    const ids = matches.map((t) => t.id).join(", ");
    throw new Error(`Ambiguous ID prefix '${idOrPrefix}' matches: ${ids}`);
  }
  return readTaskFile(matches[0].id);
}

export async function updateTask(
  db: Database,
  idOrPrefix: string,
  updates: Partial<TaskFrontmatter>
): Promise<Task> {
  const task = await getTask(db, idOrPrefix);
  const updated: Task = {
    ...task,
    ...updates,
    id: task.id, // never change id
    modified: DateTime.now().toISO()!,
  };

  const errors = validateTask(updated);
  if (errors.length > 0) throw new Error(`Invalid update: ${errors.join(", ")}`);

  await writeTaskFile(updated);
  indexTask(db, updated, taskFilePath(updated.id));
  await autoCommit("edit", updated.title);
  triggerAutoSync(db);
  return updated;
}

export async function deleteTask(db: Database, idOrPrefix: string): Promise<Task> {
  const task = await getTask(db, idOrPrefix);
  const filePath = taskFilePath(task.id);
  await unlink(filePath);
  removeTask(db, task.id);
  await autoCommit("delete", task.title);
  triggerAutoSync(db);
  return task;
}

export async function completeTask(db: Database, idOrPrefix: string): Promise<Task> {
  return updateTask(db, idOrPrefix, {
    status: "done",
    completed: DateTime.now().toISO()!,
  });
}

export async function reopenTask(db: Database, idOrPrefix: string): Promise<Task> {
  return updateTask(db, idOrPrefix, {
    status: "inbox",
    completed: undefined,
  });
}

export function listTasks(db: Database, filter: TaskFilter = {}): Task[] {
  return queryTasks(db, filter);
}
