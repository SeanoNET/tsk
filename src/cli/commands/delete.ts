import { defineCommand } from "citty";
import { ensureInitialized } from "../../core/ensure.js";
import { deleteTask, getTask } from "../../core/crud.js";
import { success, failure, printResult } from "../output.js";

export const deleteCommand = defineCommand({
  meta: { name: "delete", description: "Delete a task" },
  args: {
    id: { type: "positional", description: "Task ID or prefix", required: true },
    force: { type: "boolean", description: "Skip confirmation", default: false, alias: "f" },
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    try {
      const db = await ensureInitialized();
      const id = args.id as string;

      if (!args.force) {
        const task = await getTask(db, id);
        process.stdout.write(`Delete task '${task.title}'? [y/N] `);
        const reader = Bun.stdin.stream().getReader();
        const { value } = await reader.read();
        reader.releaseLock();
        const answer = value ? new TextDecoder().decode(value).trim().toLowerCase() : "";
        if (answer !== "y" && answer !== "yes") {
          console.log("Cancelled.");
          db.close();
          return;
        }
      }

      const task = await deleteTask(db, id);
      db.close();

      if (args.json) {
        printResult(success(task), true);
      } else {
        console.log(`Deleted task ${task.id}: ${task.title}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});
