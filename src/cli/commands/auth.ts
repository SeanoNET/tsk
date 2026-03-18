import { defineCommand } from "citty";
import { login, getAccountInfo, logout } from "../../core/graph/auth.js";
import { failure, printResult } from "../output.js";

export const authCommand = defineCommand({
  meta: { name: "auth", description: "Manage Microsoft Graph authentication" },
  args: {
    action: {
      type: "positional",
      description: "Action: login, status, or logout",
      required: false,
      default: "login",
    },
  },
  async run({ args }) {
    const action = (args.action as string) || "login";

    try {
      switch (action) {
        case "login": {
          const result = await login();
          console.log(`Signed in as ${result.account?.name ?? result.account?.username}`);
          break;
        }
        case "status": {
          const info = await getAccountInfo();
          if (info) {
            console.log(`Signed in as ${info.name} (${info.email})`);
          } else {
            console.log("Not signed in. Run `tsk auth` to sign in.");
          }
          break;
        }
        case "logout": {
          await logout();
          console.log("Signed out. Cached tokens removed.");
          break;
        }
        default:
          console.error(`Unknown action: ${action}. Use login, status, or logout.`);
          process.exit(1);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), false);
      process.exit(1);
    }
  },
});
