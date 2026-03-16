import { defineCommand } from "citty";
import { initTsk } from "../../core/init.js";
import { tskDir } from "../../core/paths.js";
import { success, failure, printResult } from "../output.js";

export const initCommand = defineCommand({
  meta: { name: "init", description: "Initialize tsk in ~/.tsk" },
  args: {
    force: { type: "boolean", description: "Force re-initialization", default: false },
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    try {
      await initTsk(args.force);
      const result = success({ path: tskDir() });
      if (args.json) {
        printResult(result, true);
      } else {
        console.log(`Initialized tsk at ${tskDir()}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});
