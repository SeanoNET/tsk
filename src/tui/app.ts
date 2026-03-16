import { createCliRenderer, type KeyEvent } from "@opentui/core";
import type { Database } from "bun:sqlite";
import { removeAllChildren } from "./helpers.js";
import { getTheme } from "./theme.js";
import { resolveAction } from "./keybindings.js";
import {
  createDashboardScreen,
  handleDashboardAction,
  getSelectedTask as getDashboardSelected,
} from "./screens/dashboard.js";
import {
  createListScreen,
  handleListAction,
  getSelectedTask as getListSelected,
} from "./screens/list.js";
import { completeTask, deleteTask } from "../core/crud.js";

type Screen = "dashboard" | "list";

export async function launchTui(db: Database): Promise<void> {
  const renderer = await createCliRenderer();
  const theme = getTheme(renderer.themeMode);

  let currentScreen: Screen = "dashboard";

  const dashboard = createDashboardScreen(renderer, db, theme);
  const list = createListScreen(renderer, db, theme);

  function showScreen(screen: Screen) {
    removeAllChildren(renderer.root);
    currentScreen = screen;
    if (screen === "dashboard") {
      dashboard.refresh();
      renderer.root.add(dashboard.container);
    } else {
      list.refresh();
      renderer.root.add(list.container);
    }
  }

  function refreshCurrent() {
    if (currentScreen === "dashboard") {
      dashboard.refresh();
      removeAllChildren(renderer.root);
      renderer.root.add(dashboard.container);
    } else {
      list.refresh();
      removeAllChildren(renderer.root);
      renderer.root.add(list.container);
    }
  }

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    // When filter bar is visible in list mode, let it handle input
    if (currentScreen === "list" && list.state.filterVisible) {
      if (key.name === "escape") {
        list.state.filterVisible = false;
        refreshCurrent();
      }
      return;
    }

    const action = resolveAction(key);
    if (!action) return;

    switch (action) {
      case "quit":
        renderer.destroy();
        db.close();
        process.exit(0);
        break;

      case "screen_dashboard":
        showScreen("dashboard");
        break;

      case "screen_list":
        showScreen("list");
        break;

      case "filter":
        if (currentScreen === "list") {
          list.state.filterVisible = true;
          refreshCurrent();
          list.filterBar.input.focus();
        }
        break;

      case "mark_done": {
        const task =
          currentScreen === "dashboard"
            ? getDashboardSelected(dashboard.state)
            : getListSelected(list.state);
        if (task) {
          try {
            await completeTask(db, task.id);
            refreshCurrent();
          } catch {
            // ignore errors silently in TUI
          }
        }
        break;
      }

      case "delete_task": {
        const task =
          currentScreen === "dashboard"
            ? getDashboardSelected(dashboard.state)
            : getListSelected(list.state);
        if (task) {
          try {
            await deleteTask(db, task.id);
            refreshCurrent();
          } catch {
            // ignore
          }
        }
        break;
      }

      case "escape":
        if (currentScreen === "list" && list.state.filterText) {
          list.state.filterText = "";
          list.state.selectedIndex = 0;
          refreshCurrent();
        }
        break;

      default: {
        let needsRefresh = false;
        if (currentScreen === "dashboard") {
          needsRefresh = handleDashboardAction(dashboard.state, action);
        } else {
          needsRefresh = handleListAction(list.state, action);
        }
        if (needsRefresh) refreshCurrent();
      }
    }
  });

  // Handle cleanup
  process.on("uncaughtException", (error) => {
    renderer.destroy();
    console.error("Uncaught exception:", error);
    process.exit(1);
  });

  // Show initial screen
  showScreen("dashboard");
}
