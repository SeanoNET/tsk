import { createCliRenderer, InputRenderable, BoxRenderable, TextRenderable, t, fg, type KeyEvent } from "@opentui/core";
import type { Database } from "bun:sqlite";
import { removeAllChildren } from "./helpers.js";
import { getTheme } from "./theme.js";
import { createKeyResolver } from "./keybindings.js";
import { pushUndo, performUndo, performRedo } from "./undo.js";
import { parseAddInput } from "./add-parser.js";
import { parseCommand } from "./components/command-bar.js";
import {
  createBoardScreen,
  handleBoardAction,
  getSelectedTask,
} from "./screens/board.js";
import { createTaskRow } from "./components/task-row.js";
import { completeTask, reopenTask, deleteTask, createTask, getTask } from "../core/crud.js";
import type { Task } from "../core/task.js";
import { readConfig } from "../core/config.js";
import { taskFilePath } from "../core/paths.js";
import { suggestScheduledTime } from "../core/scheduler.js";
import { getSuggestions } from "./autocomplete.js";
import { handleTabComplete, resetTabState } from "./tab-complete.js";
import { readTaskFile } from "../core/markdown.js";
import { indexTask } from "../core/db.js";
import { autoCommit, gitRemoteRemove, gitRemoteGetUrl } from "../core/git.js";
import { loadSyncState, formatRelativeTime } from "./components/sync-indicator.js";
import { syncNow } from "../core/sync.js";
import { writeConfig } from "../core/config.js";

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

  let inputMode = false;

  const board = createBoardScreen(renderer, db, theme);

  // Load sync state in background and update header
  function refreshSyncState() {
    loadSyncState()
      .then((syncState) => {
        board.state.syncState = syncState;
        if (!inputMode) {
          board.refresh();
          removeAllChildren(renderer.root);
          renderer.root.add(board.container);
        }
      })
      .catch(() => {}); // Ignore errors
  }

  function refreshBoard() {
    removeAllChildren(renderer.root);
    board.refresh();
    renderer.root.add(board.container);
  }

  function showAddBar() {
    inputMode = true;

    // Full-screen overlay that centers the dialog
    const overlay = new BoxRenderable(renderer, {
      id: "add-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      justifyContent: "center",
      alignItems: "center",
    });

    // Dialog box with border
    const dialog = new BoxRenderable(renderer, {
      id: "add-dialog",
      flexDirection: "column",
      width: "60%",
      backgroundColor: theme.headerBg,
      border: true,
      borderColor: theme.accent,
      borderStyle: "single",
      padding: 1,
    });

    // Title
    dialog.add(new TextRenderable(renderer, {
      id: "add-title",
      content: t`${fg(theme.accent)("New Task")}`,
      width: "100%",
      height: 1,
    }));

    // Input row
    const bar = new BoxRenderable(renderer, {
      id: "add-bar",
      flexDirection: "row",
      width: "100%",
      height: 1,
    });
    bar.add(new TextRenderable(renderer, {
      id: "add-label",
      content: t`${fg(theme.success)("+")} `,
    }));

    // Autocomplete suggestions (dynamic, colored)
    const hintsRow = new BoxRenderable(renderer, {
      id: "add-hints",
      flexDirection: "row",
      width: "100%",
      height: 1,
    });

    function updateHints(value: string) {
      const words = value.split(/\s+/);
      const lastWord = words[words.length - 1] || "";
      const suggestions = getSuggestions(db, lastWord);
      removeAllChildren(hintsRow);
      if (suggestions.length > 0) {
        hintsRow.add(new TextRenderable(renderer, { id: "hint-pad", content: "  " }));
        for (let i = 0; i < suggestions.length; i++) {
          const s = suggestions[i];
          const color = s.colorKey ? theme[s.colorKey] : theme.muted;
          hintsRow.add(new TextRenderable(renderer, {
            id: `hint-${i}`,
            content: t`${fg(color)(s.label)}`,
          }));
          if (i < suggestions.length - 1) {
            hintsRow.add(new TextRenderable(renderer, { id: `hint-sep-${i}`, content: "  " }));
          }
        }
      }
    }

    const input = new InputRenderable(renderer, {
      id: "add-input",
      placeholder: "task title...",
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
          if (key.shift) {
            // Shift+Enter: add another — clear input and stay open
            input.value = "";
            updateHints("");
            return;
          }
          inputMode = false;
          refreshBoard();
        } else if (key.name === "escape") {
          inputMode = false;
          refreshBoard();
        } else {
          setTimeout(() => updateHints(input.value), 0);
        }
      },
    });

    bar.add(input);
    dialog.add(bar);
    dialog.add(hintsRow);
    updateHints("");

    overlay.add(dialog);

    // Render board behind the dialog
    removeAllChildren(renderer.root);
    board.refresh();
    renderer.root.add(board.container);
    renderer.root.add(overlay);
    // Defer focus so the triggering keypress (t) doesn't get typed into the input
    setTimeout(() => input.focus(), 0);
  }

  const COMMANDS = [
    { name: "/done", alias: "/d", desc: "Mark task done" },
    { name: "/delete", alias: "/x", desc: "Delete task" },
    { name: "/edit", alias: "/e", desc: "Edit in editor" },
    { name: "/filter", alias: "/f", desc: "Filter tasks" },
    { name: "/undo", alias: "/u", desc: "Undo" },
    { name: "/redo", alias: null, desc: "Redo" },
    { name: "/quit", alias: "/q", desc: "Quit" },
    { name: "/help", alias: "/?", desc: "Show help" },
  ];

  function getCommandSuggestions(input: string): string[] {
    if (!input.startsWith("/")) return [];
    const partial = input.toLowerCase();
    return COMMANDS
      .filter(c => c.name.startsWith(partial) || (c.alias && c.alias.startsWith(partial)))
      .map(c => `${c.name}  ${c.desc}`)
      .slice(0, 5);
  }

  const commandHistory: string[] = [];
  let historyIndex = -1;

  function showCommandInput(prefill: string) {
    inputMode = true;
    historyIndex = -1;

    // Full-screen overlay positioned 1/3 from top
    const overlay = new BoxRenderable(renderer, {
      id: "cmd-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      flexDirection: "column",
      alignItems: "center",
      paddingTop: 2,
    });

    // Dialog box with border — VS Code-style command palette
    const dialog = new BoxRenderable(renderer, {
      id: "cmd-dialog",
      flexDirection: "column",
      width: "50%",
      backgroundColor: theme.headerBg,
      border: true,
      borderColor: theme.accent,
      borderStyle: "single",
      padding: 1,
    });

    // Input row with prompt
    const inputRow = new BoxRenderable(renderer, {
      id: "cmd-input-row",
      flexDirection: "row",
      width: "100%",
      height: 1,
    });

    const prompt = new TextRenderable(renderer, {
      id: "cmd-prompt",
      content: t`${fg(theme.accent)(">")} ${fg(theme.muted)("/")}`,
    });

    // Suggestion list below input
    const suggestionsBox = new BoxRenderable(renderer, {
      id: "cmd-suggestions",
      flexDirection: "column",
      width: "100%",
    });

    function updateSuggestions(value: string) {
      const suggestions = getCommandSuggestions("/" + value);
      removeAllChildren(suggestionsBox);
      for (let i = 0; i < suggestions.length; i++) {
        suggestionsBox.add(new TextRenderable(renderer, {
          id: `cmd-sug-${i}`,
          content: t`  ${fg(theme.muted)(suggestions[i])}`,
          width: "100%",
          height: 1,
        }));
      }
    }

    const input = new InputRenderable(renderer, {
      id: "cmd-input",
      placeholder: "type a command...",
      backgroundColor: theme.headerBg,
      textColor: theme.fg,
      cursorColor: theme.accent,
      focusedBackgroundColor: theme.headerBg,
      flexGrow: 1,
      onKeyDown: async (key) => {
        if (key.name === "tab") {
          key.preventDefault();
          const partial = "/" + input.value;
          const match = COMMANDS.find(c =>
            c.name.startsWith(partial.toLowerCase()) ||
            (c.alias && c.alias.startsWith(partial.toLowerCase()))
          );
          if (match) {
            input.value = match.name.slice(1);
            if (match.name === "/filter") input.value += " ";
          }
          updateSuggestions(input.value);
          return;
        }
        if (key.name === "up") {
          key.preventDefault();
          if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
            historyIndex++;
            input.value = commandHistory[historyIndex];
            updateSuggestions(input.value);
          }
          return;
        }
        if (key.name === "down") {
          key.preventDefault();
          if (historyIndex > 0) {
            historyIndex--;
            input.value = commandHistory[historyIndex];
          } else {
            historyIndex = -1;
            input.value = "";
          }
          updateSuggestions(input.value);
          return;
        }
        if (key.name === "return") {
          const raw = input.value.trim();
          inputMode = false;
          if (raw) {
            if (commandHistory[0] !== raw) {
              commandHistory.unshift(raw);
            }
            await executeCommand("/" + raw);
          } else {
            refreshBoard();
          }
        } else if (key.name === "escape") {
          inputMode = false;
          refreshBoard();
        } else {
          setTimeout(() => updateSuggestions(input.value), 0);
        }
      },
    });

    if (prefill) {
      input.value = prefill;
    }

    inputRow.add(prompt);
    inputRow.add(input);
    dialog.add(inputRow);
    dialog.add(suggestionsBox);
    updateSuggestions(prefill);

    overlay.add(dialog);

    // Render board behind the overlay
    removeAllChildren(renderer.root);
    board.refresh();
    renderer.root.add(board.container);
    renderer.root.add(overlay);
    setTimeout(() => input.focus(), 0);
  }

  async function executeCommand(raw: string) {
    const result = parseCommand(raw);

    switch (result.type) {
      case "done": {
        const task = getSelectedTask(board.state);
        if (task) {
          try {
            const prevStatus = task.status;
            await completeTask(db, task.id);
            pushUndo({ type: "complete", taskId: task.id, previousStatus: prevStatus });
          } catch { /* ignore */ }
        }
        break;
      }
      case "delete": {
        const task = getSelectedTask(board.state);
        if (task) {
          try {
            const snapshot = await getTask(db, task.id);
            await deleteTask(db, task.id);
            pushUndo({ type: "delete", snapshot });
          } catch { /* ignore */ }
        }
        break;
      }
      case "edit": {
        await editSelectedTask();
        return;
      }
      case "filter":
        board.state.filterText = result.text;
        board.state.selectedIndex = 0;
        break;
      case "undo":
        try { await performUndo(db); } catch { /* ignore */ }
        break;
      case "redo":
        try { await performRedo(db); } catch { /* ignore */ }
        break;
      case "quit":
        renderer.destroy();
        db.close();
        process.exit(0);
        break;
      case "help":
        showHelp();
        return;
      case "unknown":
        break;
    }

    refreshBoard();
  }

  function showHelp() {
    // Full-screen overlay for centering
    const overlay = new BoxRenderable(renderer, {
      id: "help-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      justifyContent: "center",
      alignItems: "center",
    });

    // Dialog box with border
    const dialog = new BoxRenderable(renderer, {
      id: "help-dialog",
      flexDirection: "column",
      width: "60%",
      backgroundColor: theme.headerBg,
      border: true,
      borderColor: theme.accent,
      borderStyle: "single",
      padding: 1,
    });

    let lineIdx = 0;
    function textLine(text: string, color: string) {
      const id = `help-line-${lineIdx++}`;
      dialog.add(new TextRenderable(renderer, { id, content: t`${fg(color)(text)}`, width: "100%", height: 1 }));
    }
    function styledLine(content: any) {
      const id = `help-line-${lineIdx++}`;
      dialog.add(new TextRenderable(renderer, { id, content, width: "100%", height: 1 }));
    }

    textLine("Keyboard Shortcuts", theme.accent);
    textLine("", theme.fg);
    textLine("  j/\u2193     Navigate down", theme.fg);
    textLine("  k/\u2191     Navigate up", theme.fg);
    textLine("  gg       Go to top", theme.fg);
    textLine("  G        Go to bottom", theme.fg);
    textLine("  {n}G     Go to line n", theme.fg);
    textLine("  Ctrl+d   Half page down", theme.fg);
    textLine("  Ctrl+u   Half page up", theme.fg);
    textLine("  Ctrl+f   Page down", theme.fg);
    textLine("  Ctrl+b   Page up", theme.fg);
    textLine("  Tab      Next area group", theme.fg);
    textLine("  S-Tab    Previous area group", theme.fg);
    textLine("  t        Add new task", theme.fg);
    textLine("  Space    Toggle task done/undone", theme.fg);
    textLine("  d        Mark task done", theme.fg);
    textLine("  x        Delete task", theme.fg);
    textLine("  e        Edit in editor", theme.fg);
    textLine("  u        Undo", theme.fg);
    textLine("  U        Redo", theme.fg);
    textLine("  D        Toggle done tasks", theme.fg);
    textLine("  Enter    View task detail", theme.fg);
    textLine("  P        Command palette", theme.fg);
    textLine("  ?        Show this help", theme.fg);
    textLine("  q        Quit", theme.fg);
    textLine("", theme.fg);
    textLine("Commands (type / then command):", theme.accent);
    textLine("", theme.fg);
    textLine("  /done /d       Mark selected task done", theme.fg);
    textLine("  /delete /x     Delete selected task", theme.fg);
    textLine("  /edit /e       Edit in editor", theme.fg);

    // Color-coded filter syntax help
    styledLine(t`${fg(theme.fg)("  /filter /f     Filter: ")}${fg(theme.fieldTag)("#tag")} ${fg(theme.fieldStatus)("@status")} ${fg(theme.priorityHigh)("!pri")} ${fg(theme.fg)("text")}`);

    textLine("  /undo /u       Undo last action", theme.fg);
    textLine("  /redo          Redo", theme.fg);
    textLine("  /quit /q       Quit", theme.fg);
    textLine("  /help /?       Show this help", theme.fg);
    textLine("", theme.fg);

    // Color legend
    textLine("Field Colors:", theme.accent);
    styledLine(t`  ${fg(theme.priorityHigh)("!priority")}  ${fg(theme.fieldTag)("#tag")}  ${fg(theme.fieldStatus)("@status")}  ${fg(theme.fieldDue)("due:date")}`);
    styledLine(t`  ${fg(theme.fieldArea)("area:name")}  ${fg(theme.fieldProject)("proj:name")}  ${fg(theme.fieldDuration)("dur:time")}`);
    textLine("", theme.fg);
    textLine("  Press any key to close", theme.muted);

    overlay.add(dialog);

    // Render board behind the dialog
    removeAllChildren(renderer.root);
    board.refresh();
    renderer.root.add(board.container);
    renderer.root.add(overlay);

    const helpHandler = (_key: KeyEvent) => {
      renderer.keyInput.removeListener("keypress", helpHandler);
      refreshBoard();
    };
    renderer.keyInput.on("keypress", helpHandler);
  }

  async function editSelectedTask() {
    const task = getSelectedTask(board.state);
    if (!task) {
      refreshBoard();
      return;
    }

    const filePath = taskFilePath(task.id);
    const config = await readConfig();
    const editor = config.core.editor ?? resolveEditor();

    renderer.destroy();

    const proc = Bun.spawn([editor, filePath], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    await proc.exited;

    try {
      const updated = await readTaskFile(task.id);
      indexTask(db, updated, filePath);
      await autoCommit("edit", updated.title);
    } catch { /* ignore */ }

    // Re-launch the TUI with the same db
    await launchTui(db);
  }

  async function showSelectedTask() {
    const task = getSelectedTask(board.state);
    if (!task) return;

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

    const detailHandler = (key: KeyEvent) => {
      if (key.name === "escape" || key.name === "return" || key.name === "q") {
        renderer.keyInput.removeListener("keypress", detailHandler);
        refreshBoard();
      }
    };
    renderer.keyInput.on("keypress", detailHandler);
  }

  function showSyncOverlay() {
    const syncState = board.state.syncState;
    if (!syncState || syncState.status === "disabled") {
      // Not configured — show a message briefly
      return;
    }

    const overlay = new BoxRenderable(renderer, {
      id: "sync-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      justifyContent: "center",
      alignItems: "center",
    });

    const dialog = new BoxRenderable(renderer, {
      id: "sync-dialog",
      flexDirection: "column",
      width: 44,
      backgroundColor: theme.headerBg,
      border: true,
      borderColor: theme.fieldSync,
      borderStyle: "single",
      padding: 1,
    });

    let lineIdx = 0;
    function textLine(text: string, color: string) {
      const id = `sync-line-${lineIdx++}`;
      dialog.add(new TextRenderable(renderer, { id, content: t`${fg(color)(text)}`, width: "100%", height: 1 }));
    }

    textLine("Sync Status", theme.fieldSync);
    textLine("", theme.fg);
    textLine(`  Remote:  ${syncState.remoteUrl}`, theme.fg);
    textLine(`  Branch:  ${syncState.branch}`, theme.fg);
    textLine(`  Last:    ${formatRelativeTime(syncState.lastSync)}`, theme.fg);
    textLine(`  Local:   ${syncState.localPending} pending`, theme.fg);
    textLine(`  Remote:  ${syncState.remotePending} pending`, theme.fg);
    if (syncState.error) {
      textLine(`  Error:   ${syncState.error}`, theme.error);
    } else {
      textLine(`  Status:  ok`, theme.success);
    }
    textLine("", theme.fg);
    textLine("  [Enter] Sync now  [d] Disconnect  [Esc] Close", theme.muted);

    overlay.add(dialog);

    removeAllChildren(renderer.root);
    board.refresh();
    renderer.root.add(board.container);
    renderer.root.add(overlay);

    const syncHandler = async (key: KeyEvent) => {
      if (key.name === "escape") {
        renderer.keyInput.removeListener("keypress", syncHandler);
        refreshBoard();
      } else if (key.name === "return") {
        renderer.keyInput.removeListener("keypress", syncHandler);
        // Trigger manual sync
        board.state.syncState = { ...syncState, status: "syncing" };
        refreshBoard();
        try {
          await syncNow(db);
        } catch { /* ignore */ }
        refreshSyncState();
      } else if (key.name === "d") {
        renderer.keyInput.removeListener("keypress", syncHandler);
        try {
          const config = await readConfig();
          const remote = config.sync.remote ?? "origin";
          await gitRemoteRemove(remote);
          config.sync.enabled = false;
          config.sync.remoteUrl = undefined;
          config.sync.autoSync = false;
          await writeConfig(config);
          board.state.syncState = { ...syncState, status: "disabled" };
        } catch { /* ignore */ }
        refreshBoard();
      }
    };
    renderer.keyInput.on("keypress", syncHandler);
  }

  let animating = false;

  async function animateToggleDone(task: Task, markingDone: boolean): Promise<void> {
    animating = true;
    const title = task.title;
    const totalChars = title.length;
    const TOTAL_DURATION = 300; // ms
    const FRAME_MS = Math.max(16, Math.floor(TOTAL_DURATION / Math.max(totalChars, 1)));

    const idx = board.state.flatTasks.findIndex(t => t.id === task.id);

    for (let i = 1; i <= totalChars; i++) {
      const stChars = markingDone ? i : totalChars - i;

      // Find the task row's text renderable in the content area and replace it
      const children = board.container.getChildren();
      const contentBox = children[1]; // content area
      if (contentBox && idx >= 0) {
        const rowChildren = contentBox.getChildren();
        // Find the task row by id
        const oldRowIdx = rowChildren.findIndex(c => c.id === `task-${task.id}`);
        if (oldRowIdx >= 0) {
          const oldRow = rowChildren[oldRowIdx];
          const newRow = createTaskRow(renderer, task, theme, {
            selected: idx === board.state.selectedIndex,
            displayId: idx + 1,
            strikethroughChars: stChars,
          });
          contentBox.insertBefore(newRow, oldRow);
          contentBox.remove(oldRow.id);
        }
      }

      await new Promise(resolve => setTimeout(resolve, FRAME_MS));
    }

    animating = false;
  }

  const keyResolver = createKeyResolver();

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    if (inputMode || animating) return;

    const result = keyResolver.resolve(key);
    if (!result) return;
    const { action } = result;

    switch (action) {
      case "quit":
        renderer.destroy();
        db.close();
        process.exit(0);
        break;

      case "add_task":
        showAddBar();
        break;

      case "command":
        showCommandInput("");
        break;

      case "help":
        showHelp();
        break;

      case "redo": {
        try {
          await performRedo(db);
          refreshBoard();
        } catch { /* ignore */ }
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
          refreshBoard();
        } catch { /* ignore */ }
        break;
      }

      case "mark_done": {
        const task = getSelectedTask(board.state);
        if (task) {
          try {
            const prevStatus = task.status;
            await completeTask(db, task.id);
            pushUndo({ type: "complete", taskId: task.id, previousStatus: prevStatus });
            refreshBoard();
          } catch { /* ignore */ }
        }
        break;
      }

      case "toggle_task_done": {
        if (animating) break;
        const task = getSelectedTask(board.state);
        if (!task) break;
        const isDone = task.status === "done";
        try {
          // Animate first, then persist
          await animateToggleDone(task, !isDone);
          const prevStatus = task.status;
          if (isDone) {
            await reopenTask(db, task.id);
            pushUndo({ type: "complete", taskId: task.id, previousStatus: prevStatus });
          } else {
            await completeTask(db, task.id);
            pushUndo({ type: "complete", taskId: task.id, previousStatus: prevStatus });
          }
          refreshBoard();
        } catch { /* ignore */ }
        break;
      }

      case "delete_task": {
        const task = getSelectedTask(board.state);
        if (task) {
          try {
            const snapshot = await getTask(db, task.id);
            await deleteTask(db, task.id);
            pushUndo({ type: "delete", snapshot });
            refreshBoard();
          } catch { /* ignore */ }
        }
        break;
      }

      case "sync_status":
        showSyncOverlay();
        break;

      case "toggle_done":
        board.state.showDone = !board.state.showDone;
        refreshBoard();
        break;

      case "escape":
        if (board.state.filterText) {
          board.state.filterText = "";
          board.state.selectedIndex = 0;
          refreshBoard();
        }
        break;

      default: {
        const needsRefresh = handleBoardAction(board.state, result);
        if (needsRefresh) refreshBoard();
      }
    }
  });

  process.on("uncaughtException", (error) => {
    renderer.destroy();
    console.error("Uncaught exception:", error);
    process.exit(1);
  });

  refreshBoard();
  refreshSyncState();
}
