import { defineCommand } from "citty";
import { ensureInitialized } from "../../core/ensure.js";
import { readConfig } from "../../core/config.js";
import { isAuthenticated } from "../../core/graph/auth.js";
import { syncAll, syncTask } from "../../core/graph/sync.js";
import { getTask } from "../../core/crud.js";
import { failure, printResult } from "../output.js";

export const syncCommand = defineCommand({
  meta: { name: "sync", description: "Sync tasks to Microsoft Graph (To Do / Calendar)" },
  args: {
    id: { type: "positional", description: "Task ID or prefix (optional, syncs all if omitted)", required: false },
    dry: { type: "boolean", description: "Show what would be synced without calling Graph", default: false },
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    try {
      const config = await readConfig();
      if (!config.sync.enabled) {
        console.error("Sync is disabled. Enable it in ~/.tsk/config.toml: [sync] enabled = true");
        process.exit(1);
      }

      const authed = await isAuthenticated();
      if (!authed) {
        console.error("Not signed in. Run `tsk auth` first.");
        process.exit(1);
      }

      const db = await ensureInitialized();

      if (args.id) {
        // Sync single task
        const task = await getTask(db, args.id as string);
        if (args.dry) {
          const target = task.due ? "Calendar Event" : "To Do Task";
          const action = task.due
            ? task.graphEventId ? "update" : "create"
            : task.graphTaskId ? "update" : "create";
          console.log(`Would ${action} ${target}: ${task.title}`);
        } else {
          const synced = await syncTask(db, task);
          const target = synced.due ? "Calendar Event" : "To Do Task";
          console.log(`Synced as ${target}: ${synced.title}`);
        }
      } else {
        // Sync all
        if (args.dry) {
          const { queryTasks } = await import("../../core/db.js");
          const tasks = queryTasks(db).filter((t) => t.status !== "cancelled");
          console.log(`Would sync ${tasks.length} tasks:`);
          for (const t of tasks) {
            const target = t.due ? "Event" : "To Do";
            const action = t.due
              ? t.graphEventId ? "update" : "create"
              : t.graphTaskId ? "update" : "create";
            console.log(`  ${action} ${target}: ${t.title}`);
          }
        } else {
          const result = await syncAll(db);
          console.log(`Synced: ${result.synced}, Failed: ${result.failed}, Skipped: ${result.skipped}`);
          if (result.errors.length > 0) {
            console.error("Errors:");
            for (const err of result.errors) {
              console.error(`  ${err}`);
            }
          }
        }
      }

      db.close();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});
