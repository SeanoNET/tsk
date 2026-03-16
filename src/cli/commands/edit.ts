import { defineCommand } from "citty";
import { ensureInitialized } from "../../core/ensure.js";
import { getTask, updateTask } from "../../core/crud.js";
import { readConfig } from "../../core/config.js";
import { taskFilePath } from "../../core/paths.js";
import { readTaskFile } from "../../core/markdown.js";
import { indexTask } from "../../core/db.js";
import { autoCommit } from "../../core/git.js";
import type { TaskPriority, TaskStatus } from "../../core/task.js";
import { success, failure, printResult } from "../output.js";

function resolveEditor(): string {
  if (process.env.VISUAL) return process.env.VISUAL;
  if (process.env.EDITOR) return process.env.EDITOR;
  return process.platform === "win32" ? "notepad" : "nano";
}

export const editCommand = defineCommand({
  meta: { name: "edit", description: "Edit a task" },
  args: {
    id: { type: "positional", description: "Task ID or prefix", required: true },
    title: { type: "string", description: "New title" },
    status: { type: "string", description: "New status", alias: "s" },
    priority: { type: "string", description: "New priority", alias: "p" },
    area: { type: "string", description: "New area", alias: "a" },
    project: { type: "string", description: "New project" },
    tags: { type: "string", description: "New tags (comma-separated)", alias: "t" },
    due: { type: "string", description: "New due date", alias: "d" },
    duration: { type: "string", description: "New duration" },
    editor: { type: "string", description: "Editor command" },
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    try {
      const db = await ensureInitialized();
      const id = args.id as string;

      // If inline flags provided, update directly
      const hasInlineEdit =
        args.title || args.status || args.priority || args.area || args.project || args.tags || args.due || args.duration;

      if (hasInlineEdit) {
        const updates: Record<string, unknown> = {};
        if (args.title) updates.title = args.title;
        if (args.status) updates.status = args.status as TaskStatus;
        if (args.priority) updates.priority = args.priority as TaskPriority;
        if (args.area) updates.area = args.area;
        if (args.project) updates.project = args.project;
        if (args.tags) updates.tags = (args.tags as string).split(",").map((t) => t.trim());
        if (args.due) updates.due = args.due;
        if (args.duration) updates.duration = args.duration;

        const task = await updateTask(db, id, updates);
        db.close();

        if (args.json) {
          printResult(success(task), true);
        } else {
          console.log(`Updated task ${task.id}: ${task.title}`);
        }
        return;
      }

      // Otherwise open in editor
      const task = await getTask(db, id);
      const filePath = taskFilePath(task.id);

      const config = await readConfig();
      const editor = args.editor ?? config.core.editor ?? resolveEditor();

      const proc = Bun.spawn([editor, filePath], {
        stdio: ["inherit", "inherit", "inherit"],
      });
      await proc.exited;

      // Re-read the file after editing
      const updated = await readTaskFile(task.id);
      indexTask(db, updated, filePath);
      await autoCommit("edit", updated.title);
      db.close();

      if (args.json) {
        printResult(success(updated), true);
      } else {
        console.log(`Updated task ${updated.id}: ${updated.title}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});
