import { defineCommand, showUsage } from "citty";
import pkg from "../../package.json";
import { initCommand } from "./commands/init.js";
import { addCommand } from "./commands/add.js";
import { listCommand } from "./commands/list.js";
import { showCommand } from "./commands/show.js";
import { doneCommand } from "./commands/done.js";
import { editCommand } from "./commands/edit.js";
import { deleteCommand } from "./commands/delete.js";
import { processCommand } from "./commands/process.js";
import { uiCommand } from "./commands/ui.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { gitCommand } from "./commands/sync.js";
import { authCommand } from "./commands/auth.js";
import { syncCommand } from "./commands/graph-sync.js";
import { checkForUpdate } from "../core/update-check.js";

export const mainCommand = defineCommand({
  meta: {
    name: "tsk",
    version: pkg.version,
    description: "Developer-first task manager with Git + Microsoft Graph sync",
  },
  subCommands: {
    init: initCommand,
    add: addCommand,
    list: listCommand,
    show: showCommand,
    done: doneCommand,
    edit: editCommand,
    delete: deleteCommand,
    process: processCommand,
    ui: uiCommand,
    upgrade: upgradeCommand,
    git: gitCommand,
    auth: authCommand,
    sync: syncCommand,
  },
  run({ rawArgs }) {
    const hasSubCommand = rawArgs.some((arg: string) => !arg.startsWith("-"));
    if (!hasSubCommand) {
      checkForUpdate(pkg.version);
      showUsage(mainCommand);
    }
  },
});
