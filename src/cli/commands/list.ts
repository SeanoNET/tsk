import { defineCommand } from "citty";
import { DateTime } from "luxon";
import { ensureInitialized } from "../../core/ensure.js";
import { listTasks } from "../../core/crud.js";
import type { TaskFilter } from "../../core/db.js";
import type { TaskStatus, TaskPriority } from "../../core/task.js";
import { success, printResult } from "../output.js";

const STATUS_SYMBOLS: Record<string, string> = {
  inbox: "[ ]",
  next: "[>]",
  waiting: "[~]",
  someday: "[?]",
  done: "[x]",
  cancelled: "[-]",
};

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[90m",
  red: "\x1b[91m",
  yellow: "\x1b[93m",
  green: "\x1b[92m",
  cyan: "\x1b[96m",
  blue: "\x1b[94m",
  magenta: "\x1b[95m",
};

function colorize(text: string, color: string): string {
  const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  if (!useColor || !text) return text;
  return `${color}${text}${ANSI.reset}`;
}

function formatAge(created: string): string {
  const createdDt = DateTime.fromISO(created);
  const now = DateTime.now();
  const hours = Math.floor(now.diff(createdDt, "hours").hours);
  const days = Math.floor(now.diff(createdDt, "days").days);
  const weeks = Math.floor(now.diff(createdDt, "weeks").weeks);
  const months = Math.floor(now.diff(createdDt, "months").months);

  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  if (days <= 6) return `${days}d`;
  if (weeks <= 4) return `${weeks}w`;
  return `${months}mo`;
}

function formatDue(due?: string): string {
  if (!due) return "";

  const dueDt = DateTime.fromISO(due);
  if (!dueDt.isValid) return "";

  const now = DateTime.now();
  if (dueDt < now.startOf("day")) return "overdue";
  if (dueDt.hasSame(now, "day")) return "today";
  if (dueDt.hasSame(now.plus({ days: 1 }), "day")) return "tomorrow";
  if (dueDt.year === now.year) return dueDt.toFormat("d LLL");
  return dueDt.toFormat("d LLL yyyy");
}

function truncateText(value: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength === 1) return "…";
  return `${value.slice(0, maxLength - 1)}…`;
}

export const listCommand = defineCommand({
  meta: { name: "list", description: "List tasks" },
  args: {
    status: { type: "string", description: "Filter by status", alias: "s" },
    area: { type: "string", description: "Filter by area", alias: "a" },
    project: { type: "string", description: "Filter by project" },
    tag: { type: "string", description: "Filter by tag", alias: "t" },
    priority: { type: "string", description: "Filter by priority", alias: "p" },
    "due-before": { type: "string", description: "Due before date (ISO)" },
    "due-after": { type: "string", description: "Due after date (ISO)" },
    done: { type: "boolean", description: "Include done tasks", default: false },
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    const db = await ensureInitialized();
    const filter: TaskFilter = {};
    if (args.status) filter.status = args.status as TaskStatus;
    else if (!args.done) filter.excludeStatus = ["done", "cancelled"];
    if (args.area) filter.area = args.area as string;
    if (args.project) filter.project = args.project as string;
    if (args.tag) filter.tag = args.tag as string;
    if (args.priority) filter.priority = args.priority as TaskPriority;
    if (args["due-before"]) filter.dueBefore = args["due-before"] as string;
    if (args["due-after"]) filter.dueAfter = args["due-after"] as string;

    const tasks = listTasks(db, filter);
    db.close();

    if (args.json) {
      printResult(success(tasks), true);
      return;
    }

    if (tasks.length === 0) {
      console.log("No tasks found.");
      return;
    }

    for (const task of tasks) {
      const status = STATUS_SYMBOLS[task.status] ?? "[ ]";
      const id = task.id.slice(0, 8);
      const priority = task.priority !== "none" ? `!${task.priority}` : "";
      const tags = task.tags?.length ? task.tags.map(tag => `#${tag}`).join(" ") : "";
      const due = task.status === "done" || task.status === "cancelled" ? "" : formatDue(task.due);
      const age = formatAge(task.created);
      const priorityColored = priority
        ? colorize(
          priority,
          task.priority === "high"
            ? ANSI.red
            : task.priority === "medium"
              ? ANSI.yellow
              : ANSI.green
        )
        : "";
      const tagsColored = tags ? colorize(tags, ANSI.magenta) : "";
      const dueColored = due
        ? colorize(due, due === "overdue" ? ANSI.red : ANSI.yellow)
        : "";
      const ageColored = colorize(age, ANSI.dim);
      const metadata = [priorityColored, tagsColored, dueColored, ageColored].filter(Boolean).join("  ");
      const terminalWidth = process.stdout.columns ?? 80;
      const prefix = `${status} ${id}  `;
      const plainMetadata = [priority, tags, due, age].filter(Boolean).join("  ");
      const titleMax = Math.max(12, terminalWidth - prefix.length - plainMetadata.length - (plainMetadata ? 2 : 0));
      const title = truncateText(task.title, titleMax);
      const suffix = metadata ? `  ${metadata}` : "";
      console.log(`${prefix}${title}${suffix}`);
    }
  },
});
