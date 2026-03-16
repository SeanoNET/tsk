import { defineCommand } from "citty";
import { ensureInitialized } from "../../core/ensure.js";
import { launchTui } from "../../tui/app.js";

export const uiCommand = defineCommand({
  meta: { name: "ui", description: "Launch the TUI dashboard" },
  args: {},
  async run() {
    const db = await ensureInitialized();
    await launchTui(db);
  },
});
