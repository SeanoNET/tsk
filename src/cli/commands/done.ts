import { defineCommand } from "citty";
import { ensureInitialized } from "../../core/ensure.js";
import { completeTask } from "../../core/crud.js";
import { success, failure, printResult } from "../output.js";

export const doneCommand = defineCommand({
  meta: { name: "done", description: "Mark a task as complete" },
  args: {
    id: { type: "positional", description: "Task ID or prefix", required: true },
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    try {
      const db = await ensureInitialized();
      const task = await completeTask(db, args.id as string);
      db.close();

      if (args.json) {
        printResult(success(task), true);
      } else {
        console.log(`Completed task ${task.id}: ${task.title}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});
