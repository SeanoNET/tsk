import { defineCommand } from "citty";
import { ensureInitialized } from "../../core/ensure.js";
import { createTask } from "../../core/crud.js";
import type { TaskPriority } from "../../core/task.js";
import { success, failure, printResult } from "../output.js";

export const addCommand = defineCommand({
  meta: { name: "add", description: "Create a new task" },
  args: {
    title: { type: "positional", description: "Task title", required: true },
    priority: { type: "string", description: "Priority: high, medium, low, none", alias: "p" },
    area: { type: "string", description: "Area of responsibility", alias: "a" },
    project: { type: "string", description: "Project name" },
    tags: { type: "string", description: "Comma-separated tags", alias: "t" },
    due: { type: "string", description: "Due date (ISO format)", alias: "d" },
    duration: { type: "string", description: "Duration (e.g. PT30M, PT1H)" },
    status: { type: "string", description: "Initial status (default: inbox)", alias: "s" },
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    try {
      const db = await ensureInitialized();
      const overrides: Record<string, unknown> = {};
      if (args.priority) overrides.priority = args.priority as TaskPriority;
      if (args.area) overrides.area = args.area;
      if (args.project) overrides.project = args.project;
      if (args.tags) overrides.tags = (args.tags as string).split(",").map((t) => t.trim());
      if (args.due) overrides.due = args.due;
      if (args.duration) overrides.duration = args.duration;
      if (args.status) overrides.status = args.status;

      const task = await createTask(db, args.title as string, overrides);
      db.close();

      if (args.json) {
        printResult(success(task), true);
      } else {
        console.log(`Created task ${task.id}: ${task.title}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});
