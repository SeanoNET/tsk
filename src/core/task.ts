import { DateTime } from "luxon";
import { generateId } from "./id.js";

export type TaskStatus = "inbox" | "next" | "waiting" | "someday" | "done" | "cancelled";
export type TaskPriority = "high" | "medium" | "low" | "none";

export interface TaskFrontmatter {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  created: string;
  modified: string;
  due?: string;
  scheduled?: string;
  completed?: string;
  area?: string;
  project?: string;
  tags?: string[];
  duration?: string;
  recurrence?: string;
  waitingOn?: string;
  graphTaskId?: string;
  graphEventId?: string;
}

export interface Task extends TaskFrontmatter {
  body: string;
}

const VALID_STATUSES: TaskStatus[] = ["inbox", "next", "waiting", "someday", "done", "cancelled"];
const VALID_PRIORITIES: TaskPriority[] = ["high", "medium", "low", "none"];

export function validateTask(data: Partial<TaskFrontmatter>): string[] {
  const errors: string[] = [];
  if (!data.id) errors.push("id is required");
  if (!data.title) errors.push("title is required");
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    errors.push(`invalid status: ${data.status}`);
  }
  if (data.priority && !VALID_PRIORITIES.includes(data.priority)) {
    errors.push(`invalid priority: ${data.priority}`);
  }
  if (data.due && !DateTime.fromISO(data.due).isValid) {
    errors.push(`invalid due date: ${data.due}`);
  }
  if (data.scheduled && !DateTime.fromISO(data.scheduled).isValid) {
    errors.push(`invalid scheduled date: ${data.scheduled}`);
  }
  return errors;
}

export function createTaskDefaults(
  title: string,
  overrides: Partial<TaskFrontmatter> = {}
): Task {
  const now = DateTime.now().toISO()!;
  return {
    id: generateId(),
    title,
    status: "inbox",
    priority: "none",
    created: now,
    modified: now,
    body: "",
    ...overrides,
  };
}
