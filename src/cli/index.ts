import { defineCommand, showUsage } from "citty";
import { initCommand } from "./commands/init.js";
import { addCommand } from "./commands/add.js";
import { listCommand } from "./commands/list.js";
import { showCommand } from "./commands/show.js";
import { doneCommand } from "./commands/done.js";
import { editCommand } from "./commands/edit.js";
import { deleteCommand } from "./commands/delete.js";
import { processCommand } from "./commands/process.js";
import { uiCommand } from "./commands/ui.js";

export const mainCommand = defineCommand({
  meta: {
    name: "tsk",
    version: "0.1.0",
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
  },
  run({ rawArgs }) {
    // Only show usage if no subcommand was provided
    const hasSubCommand = rawArgs.some((arg: string) => !arg.startsWith("-"));
    if (!hasSubCommand) {
      showUsage(mainCommand);
    }
  },
});
