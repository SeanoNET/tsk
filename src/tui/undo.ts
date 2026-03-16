import type { Database } from "bun:sqlite";
import type { Task } from "../core/task.js";
import { updateTask, deleteTask, completeTask } from "../core/crud.js";
import { writeTaskFile, readTaskFile } from "../core/markdown.js";
import { indexTask } from "../core/db.js";
import { taskFilePath } from "../core/paths.js";
import { autoCommit } from "../core/git.js";

export type UndoEntry =
  | { type: "complete"; taskId: string; previousStatus: string }
  | { type: "delete"; snapshot: Task }
  | { type: "create"; taskId: string; snapshot?: Task };

const MAX_STACK = 50;
const undoStack: UndoEntry[] = [];
const redoStack: UndoEntry[] = [];

export function pushUndo(entry: UndoEntry): void {
  if (undoStack.length >= MAX_STACK) undoStack.shift();
  undoStack.push(entry);
  redoStack.length = 0;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

export async function performUndo(db: Database): Promise<string | null> {
  const entry = undoStack.pop();
  if (!entry) return null;

  switch (entry.type) {
    case "complete": {
      await updateTask(db, entry.taskId, {
        status: entry.previousStatus as Task["status"],
        completed: undefined,
      });
      redoStack.push(entry);
      return `Restored task to ${entry.previousStatus}`;
    }
    case "delete": {
      const task = entry.snapshot;
      await writeTaskFile(task);
      indexTask(db, task, taskFilePath(task.id));
      await autoCommit("create", task.title);
      redoStack.push(entry);
      return `Restored deleted task: ${task.title}`;
    }
    case "create": {
      // Snapshot before deleting so redo can restore it
      try {
        const snapshot = await readTaskFile(entry.taskId);
        await deleteTask(db, entry.taskId);
        redoStack.push({ ...entry, snapshot });
      } catch {
        return null;
      }
      return `Removed newly created task`;
    }
  }
}

export async function performRedo(db: Database): Promise<string | null> {
  const entry = redoStack.pop();
  if (!entry) return null;

  switch (entry.type) {
    case "complete": {
      await completeTask(db, entry.taskId);
      undoStack.push(entry);
      return `Re-completed task`;
    }
    case "delete": {
      try {
        await deleteTask(db, entry.snapshot.id);
      } catch {
        return null;
      }
      undoStack.push(entry);
      return `Re-deleted task: ${entry.snapshot.title}`;
    }
    case "create": {
      // Restore from snapshot captured during undo
      if (!entry.snapshot) return null;
      const task = entry.snapshot;
      await writeTaskFile(task);
      indexTask(db, task, taskFilePath(task.id));
      await autoCommit("create", task.title);
      undoStack.push({ type: "create", taskId: task.id });
      return `Re-created task: ${task.title}`;
    }
  }
}
