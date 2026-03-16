import { defineCommand } from "citty";
import { ensureInitialized } from "../../core/ensure.js";
import { listTasks, updateTask, deleteTask } from "../../core/crud.js";
import type { TaskStatus } from "../../core/task.js";

async function readline(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const reader = Bun.stdin.stream().getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  return value ? new TextDecoder().decode(value).trim() : "";
}

export const processCommand = defineCommand({
  meta: { name: "process", description: "Process inbox tasks (GTD workflow)" },
  args: {
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    const db = await ensureInitialized();
    const inbox = listTasks(db, { status: "inbox" });

    if (inbox.length === 0) {
      console.log("Inbox is empty. Nothing to process.");
      db.close();
      return;
    }

    console.log(`\nProcessing ${inbox.length} inbox task(s)...\n`);

    for (const task of inbox) {
      console.log(`--- ${task.title} ---`);
      console.log(`  ID: ${task.id}`);
      if (task.due) console.log(`  Due: ${task.due}`);
      if (task.tags?.length) console.log(`  Tags: ${task.tags.join(", ")}`);

      const action = await readline(
        "\n  [n]ext / [w]aiting / [s]omeday / [d]one / [x] delete / [enter] skip: "
      );

      let status: TaskStatus | null = null;
      switch (action.toLowerCase()) {
        case "n":
          status = "next";
          break;
        case "w":
          status = "waiting";
          break;
        case "s":
          status = "someday";
          break;
        case "d":
          status = "done";
          break;
        case "x":
          await deleteTask(db, task.id);
          console.log(`  Deleted.`);
          continue;
        default:
          console.log(`  Skipped.`);
          continue;
      }

      if (status) {
        await updateTask(db, task.id, { status });
        console.log(`  Moved to ${status}.`);
      }
    }

    console.log("\nInbox processing complete.");
    db.close();
  },
});
