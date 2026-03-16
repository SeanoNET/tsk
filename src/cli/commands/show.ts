import { defineCommand } from "citty";
import { ensureInitialized } from "../../core/ensure.js";
import { getTask } from "../../core/crud.js";
import { success, failure, printResult } from "../output.js";

export const showCommand = defineCommand({
  meta: { name: "show", description: "Show task details" },
  args: {
    id: { type: "positional", description: "Task ID or prefix", required: true },
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    try {
      const db = await ensureInitialized();
      const task = await getTask(db, args.id as string);
      db.close();

      if (args.json) {
        printResult(success(task), true);
        return;
      }

      console.log(`ID:        ${task.id}`);
      console.log(`Title:     ${task.title}`);
      console.log(`Status:    ${task.status}`);
      console.log(`Priority:  ${task.priority}`);
      console.log(`Created:   ${task.created}`);
      console.log(`Modified:  ${task.modified}`);
      if (task.due) console.log(`Due:       ${task.due}`);
      if (task.scheduled) console.log(`Scheduled: ${task.scheduled}`);
      if (task.completed) console.log(`Completed: ${task.completed}`);
      if (task.area) console.log(`Area:      ${task.area}`);
      if (task.project) console.log(`Project:   ${task.project}`);
      if (task.tags?.length) console.log(`Tags:      ${task.tags.join(", ")}`);
      if (task.duration) console.log(`Duration:  ${task.duration}`);
      if (task.recurrence) console.log(`Recurrence:${task.recurrence}`);
      if (task.waitingOn) console.log(`Waiting on:${task.waitingOn}`);
      if (task.body) {
        console.log(`\n${task.body}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});
