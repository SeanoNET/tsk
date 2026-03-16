import { createCliRenderer, InputRenderable, BoxRenderable, TextRenderable, type KeyEvent } from "@opentui/core";
import type { Database } from "bun:sqlite";
import { removeAllChildren } from "./helpers.js";
import { getTheme } from "./theme.js";
import { resolveAction } from "./keybindings.js";
import { pushUndo, performUndo, performRedo } from "./undo.js";
import { parseAddInput } from "./add-parser.js";
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
import { completeTask, deleteTask, createTask, getTask } from "../core/crud.js";
import { readConfig } from "../core/config.js";
import { taskFilePath } from "../core/paths.js";
import { suggestScheduledTime } from "../core/scheduler.js";
import { getSuggestions } from "./autocomplete.js";
import { handleTabComplete, resetTabState } from "./tab-complete.js";
import { readTaskFile } from "../core/markdown.js";
import { indexTask } from "../core/db.js";
import { autoCommit } from "../core/git.js";

type Screen = "dashboard" | "list";

function parseDurMinutes(dur?: string): number {
  if (!dur) return 30;
  const h = dur.match(/(\d+)H/i);
  const m = dur.match(/(\d+)M/i);
  let total = 0;
  if (h) total += parseInt(h[1]) * 60;
  if (m) total += parseInt(m[1]);
  return total > 0 ? total : 30;
}

function resolveEditor(): string {
  if (process.env.VISUAL) return process.env.VISUAL;
  if (process.env.EDITOR) return process.env.EDITOR;
  return process.platform === "win32" ? "notepad" : "nano";
}

export async function launchTui(db: Database): Promise<void> {
  const renderer = await createCliRenderer();
  const theme = getTheme(renderer.themeMode);

  let currentScreen: Screen = "dashboard";
  let inputMode = false; // true when add bar or filter bar has focus

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
    // Clear root first, then rebuild, to avoid flicker from stale children
    removeAllChildren(renderer.root);
    if (currentScreen === "dashboard") {
      dashboard.refresh();
      renderer.root.add(dashboard.container);
    } else {
      list.refresh();
      renderer.root.add(list.container);
    }
  }

  function showAddBar() {
    inputMode = true;

    const addContainer = new BoxRenderable(renderer, {
      id: "add-container",
      flexDirection: "column",
      width: "100%",
    });

    const bar = new BoxRenderable(renderer, {
      id: "add-bar",
      flexDirection: "row",
      width: "100%",
      height: 1,
      backgroundColor: theme.headerBg,
    });
    bar.add(new TextRenderable(renderer, {
      id: "add-label",
      content: " + ",
      fg: theme.success,
    }));

    const hintsRow = new TextRenderable(renderer, {
      id: "add-hints",
      content: "",
      fg: theme.muted,
      width: "100%",
      height: 1,
    });

    function updateHints(value: string) {
      const words = value.split(/\s+/);
      const lastWord = words[words.length - 1] || "";
      const suggestions = getSuggestions(db, lastWord);
      if (suggestions.length > 0) {
        hintsRow.content = `   ${suggestions.map((s) => s.label).join("  ")}`;
      } else {
        hintsRow.content = "";
      }
    }

    const input = new InputRenderable(renderer, {
      id: "add-input",
      placeholder: "title !pri #tag @status due:tomorrow area: project: dur:1h",
      backgroundColor: theme.headerBg,
      textColor: theme.fg,
      cursorColor: theme.accent,
      focusedBackgroundColor: theme.headerBg,
      flexGrow: 1,
      onKeyDown: async (key) => {
        if (key.name === "tab") {
          key.preventDefault();
          if (handleTabComplete(input, db)) {
            updateHints(input.value);
          }
          return;
        }
        resetTabState();
        if (key.name === "return") {
          const raw = input.value.trim();
          if (raw) {
            try {
              const { title, overrides } = parseAddInput(raw);
              if (title) {
                if (overrides.due && !overrides.scheduled) {
                  const durMin = parseDurMinutes(overrides.duration);
                  overrides.scheduled = suggestScheduledTime(db, overrides.due, durMin);
                }
                const task = await createTask(db, title, overrides);
                pushUndo({ type: "create", taskId: task.id });
              }
            } catch {
              // ignore
            }
          }
          inputMode = false;
          refreshCurrent();
        } else if (key.name === "escape") {
          inputMode = false;
          refreshCurrent();
        } else {
          // Update suggestions on next tick so input value is current
          setTimeout(() => updateHints(input.value), 0);
        }
      },
    });

    bar.add(input);
    addContainer.add(bar);
    addContainer.add(hintsRow);
    updateHints("");

    removeAllChildren(renderer.root);
    renderer.root.add(addContainer);
    if (currentScreen === "dashboard") {
      renderer.root.add(dashboard.container);
    } else {
      renderer.root.add(list.container);
    }
    input.focus();
  }

  function showFilterBar() {
    inputMode = true;
    list.state.filterVisible = true;

    // Clear and recreate the filter input to reset its value
    removeAllChildren(list.filterBar.container);
    const label = new TextRenderable(renderer, {
      id: "filter-label",
      content: ` / `,
      fg: theme.accent,
    });
    const input = new InputRenderable(renderer, {
      id: "filter-input",
      placeholder: "filter: text, #tag, @status, !priority",
      backgroundColor: theme.headerBg,
      textColor: theme.fg,
      cursorColor: theme.accent,
      focusedBackgroundColor: theme.headerBg,
      flexGrow: 1,
      onKeyDown: (key) => {
        if (key.name === "tab") {
          key.preventDefault();
          handleTabComplete(input, db);
          return;
        }
        resetTabState();
        if (key.name === "return") {
          list.state.filterText = input.value;
          list.state.selectedIndex = 0;
          list.state.filterVisible = false;
          inputMode = false;
          refreshCurrent();
        } else if (key.name === "escape") {
          list.state.filterVisible = false;
          inputMode = false;
          refreshCurrent();
        }
      },
    });
    list.filterBar.container.add(label);
    list.filterBar.container.add(input);
    list.filterBar.input = input;

    refreshCurrent();
    input.focus();
  }

  async function editSelectedTask() {
    const task =
      currentScreen === "dashboard"
        ? getDashboardSelected(dashboard.state)
        : getListSelected(list.state);
    if (!task) return;

    const filePath = taskFilePath(task.id);
    const config = await readConfig();
    const editor = config.core.editor ?? resolveEditor();

    // Temporarily exit TUI, launch editor, then restore
    renderer.destroy();

    const proc = Bun.spawn([editor, filePath], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    await proc.exited;

    // Re-read and re-index the edited file
    try {
      const updated = await readTaskFile(task.id);
      indexTask(db, updated, filePath);
      await autoCommit("edit", updated.title);
    } catch {
      // ignore
    }

    // Restart TUI
    const newRenderer = await createCliRenderer();
    // Can't reassign renderer (const), so we exit and let the user relaunch
    // This is a known limitation -- for now just exit cleanly
    newRenderer.destroy();
    db.close();
    console.log("Task edited. TUI exited -- run `tsk ui` to relaunch.");
    process.exit(0);
  }

  async function showSelectedTask() {
    const task =
      currentScreen === "dashboard"
        ? getDashboardSelected(dashboard.state)
        : getListSelected(list.state);
    if (!task) return;

    // Show task detail as an overlay
    const detail = new BoxRenderable(renderer, {
      id: "task-detail",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: theme.bg,
      padding: 2,
    });

    const lines = [
      `ID:        ${task.id}`,
      `Title:     ${task.title}`,
      `Status:    ${task.status}`,
      `Priority:  ${task.priority}`,
      `Created:   ${task.created}`,
      `Modified:  ${task.modified}`,
    ];
    if (task.due) lines.push(`Due:       ${task.due}`);
    if (task.scheduled) lines.push(`Scheduled: ${task.scheduled}`);
    if (task.completed) lines.push(`Completed: ${task.completed}`);
    if (task.area) lines.push(`Area:      ${task.area}`);
    if (task.project) lines.push(`Project:   ${task.project}`);
    if (task.tags?.length) lines.push(`Tags:      ${task.tags.join(", ")}`);
    if (task.duration) lines.push(`Duration:  ${task.duration}`);
    if (task.body) {
      lines.push("");
      lines.push(task.body);
    }
    lines.push("");
    lines.push("Press Escape or Enter to go back");

    for (let i = 0; i < lines.length; i++) {
      detail.add(new TextRenderable(renderer, {
        id: `detail-line-${i}`,
        content: lines[i],
        fg: i === lines.length - 1 ? theme.muted : theme.fg,
        width: "100%",
        height: 1,
      }));
    }

    removeAllChildren(renderer.root);
    renderer.root.add(detail);

    // Wait for dismiss key
    const detailHandler = (key: KeyEvent) => {
      if (key.name === "escape" || key.name === "return" || key.name === "q") {
        renderer.keyInput.removeListener("keypress", detailHandler);
        refreshCurrent();
      }
    };
    renderer.keyInput.on("keypress", detailHandler);
  }

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    // When in input mode (add bar or filter bar), don't process global keys
    if (inputMode) return;

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

      case "add_task":
        showAddBar();
        break;

      case "filter":
        if (currentScreen !== "list") {
          showScreen("list");
        }
        showFilterBar();
        break;

      case "redo": {
        try {
          await performRedo(db);
          refreshCurrent();
        } catch {
          // ignore
        }
        break;
      }

      case "select":
        await showSelectedTask();
        break;

      case "edit_task":
        await editSelectedTask();
        break;

      case "undo": {
        try {
          await performUndo(db);
          refreshCurrent();
        } catch {
          // ignore
        }
        break;
      }

      case "mark_done": {
        const task =
          currentScreen === "dashboard"
            ? getDashboardSelected(dashboard.state)
            : getListSelected(list.state);
        if (task) {
          try {
            const prevStatus = task.status;
            await completeTask(db, task.id);
            pushUndo({ type: "complete", taskId: task.id, previousStatus: prevStatus });
            refreshCurrent();
          } catch {
            // ignore
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
            const snapshot = await getTask(db, task.id);
            await deleteTask(db, task.id);
            pushUndo({ type: "delete", snapshot });
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

  process.on("uncaughtException", (error) => {
    renderer.destroy();
    console.error("Uncaught exception:", error);
    process.exit(1);
  });

  showScreen("dashboard");
}
