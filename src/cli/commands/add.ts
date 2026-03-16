import { defineCommand } from "citty";
import { ensureInitialized } from "../../core/ensure.js";
import { createTask } from "../../core/crud.js";
import { parseAddInput } from "../../tui/add-parser.js";
import { suggestScheduledTime } from "../../core/scheduler.js";
import { interactiveInput } from "../interactive-input.js";
import type { TaskPriority } from "../../core/task.js";
import { success, failure, printResult } from "../output.js";

function parseDurMinutes(dur?: string): number {
  if (!dur) return 30;
  const h = dur.match(/(\d+)H/i);
  const m = dur.match(/(\d+)M/i);
  let total = 0;
  if (h) total += parseInt(h[1]) * 60;
  if (m) total += parseInt(m[1]);
  return total > 0 ? total : 30;
}

export const addCommand = defineCommand({
  meta: { name: "add", description: "Create a new task" },
  args: {
    title: { type: "positional", description: "Task title (supports inline syntax: !pri #tag @status due:time)", required: false },
    priority: { type: "string", description: "Priority: high, medium, low, none", alias: "p" },
    area: { type: "string", description: "Area of responsibility", alias: "a" },
    project: { type: "string", description: "Project name" },
    tags: { type: "string", description: "Comma-separated tags", alias: "t" },
    due: { type: "string", description: "Due date (ISO, relative: tomorrow, 3d, next week)", alias: "d" },
    duration: { type: "string", description: "Duration (e.g. 30m, 1h, PT30M)" },
    status: { type: "string", description: "Initial status (default: inbox)", alias: "s" },
    interactive: { type: "boolean", description: "Interactive mode with tab completion", alias: "i", default: false },
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    try {
      const db = await ensureInitialized();
      let raw = args.title as string | undefined;

      // Interactive mode: prompt with tab completion
      if (!raw || args.interactive) {
        const initial = raw || "";
        raw = await interactiveInput(db, "tsk add> ", initial) ?? undefined;
        if (!raw) {
          console.log("Cancelled.");
          db.close();
          return;
        }
      }

      // Parse inline syntax from the title string
      const { title, overrides } = parseAddInput(raw);
      if (!title) {
        printResult(failure("Title is required"), args.json);
        process.exit(1);
      }

      // CLI flags override inline syntax
      if (args.priority) overrides.priority = args.priority as TaskPriority;
      if (args.area) overrides.area = args.area as string;
      if (args.project) overrides.project = args.project as string;
      if (args.tags) overrides.tags = (args.tags as string).split(",").map((t) => t.trim());
      if (args.due) overrides.due = args.due as string;
      if (args.duration) overrides.duration = args.duration as string;
      if (args.status) overrides.status = args.status as string as any;

      // Smart schedule
      if (overrides.due && !overrides.scheduled) {
        const durMin = parseDurMinutes(overrides.duration);
        overrides.scheduled = suggestScheduledTime(db, overrides.due, durMin);
      }

      const task = await createTask(db, title, overrides);
      db.close();

      if (args.json) {
        printResult(success(task), true);
      } else {
        const parts = [`Created task ${task.id}: ${task.title}`];
        if (task.due) parts.push(`  due: ${task.due.slice(0, 10)}`);
        if (task.area) parts.push(`  area: ${task.area}`);
        if (task.tags?.length) parts.push(`  tags: ${task.tags.join(", ")}`);
        console.log(parts.join("\n"));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});
