import matter from "gray-matter";
import type { Task, TaskFrontmatter } from "./task.js";
import { taskFilePath } from "./paths.js";

/** gray-matter's js-yaml coerces ISO date strings to Date objects -- convert back */
function normalizeData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      result[key] = value.toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function parseTaskFile(content: string): Task {
  const { data, content: body } = matter(content);
  const normalized = normalizeData(data) as unknown as TaskFrontmatter;
  return { ...normalized, body: body.trim() };
}

export function serializeTask(task: Task): string {
  const { body, ...frontmatter } = task;
  // Remove undefined values
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (v !== undefined) clean[k] = v;
  }
  return matter.stringify(body ? `\n${body}\n` : "\n", clean);
}

export async function readTaskFile(id: string): Promise<Task> {
  const file = Bun.file(taskFilePath(id));
  const content = await file.text();
  return parseTaskFile(content);
}

export async function writeTaskFile(task: Task): Promise<void> {
  const content = serializeTask(task);
  await Bun.write(taskFilePath(task.id), content);
}
