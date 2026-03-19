import { defineCommand } from "citty";
import { ensureInitialized } from "../../core/ensure.js";
import { listTasks } from "../../core/crud.js";
import type { TaskFilter } from "../../core/db.js";
import type { TaskStatus, TaskPriority } from "../../core/task.js";
import { success, printResult } from "../output.js";

const PRIORITY_SYMBOLS: Record<string, string> = {
  high: "!!!",
  medium: "!!",
  low: "!",
  none: " ",
};

const STATUS_SYMBOLS: Record<string, string> = {
  inbox: "[ ]",
  next: "[>]",
  waiting: "[~]",
  someday: "[?]",
  done: "[x]",
  cancelled: "[-]",
};

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
      const priority = PRIORITY_SYMBOLS[task.priority] ?? " ";
      const due = task.due ? ` (due: ${task.due.slice(0, 10)})` : "";
      const id = task.id.slice(0, 8);
      console.log(`${status} ${priority.padEnd(3)} ${id}  ${task.title}${due}`);
    }
  },
});
