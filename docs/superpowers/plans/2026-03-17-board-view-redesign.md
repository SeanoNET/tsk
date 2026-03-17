# Board View TUI Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual-screen TUI with a single taskbook-style board view grouped by area, with a command bar and auto-init.

**Architecture:** Single board screen renders tasks grouped by `area` field with status symbols, priority indicators, and age. A command bar at the bottom handles `/commands`. The add-task bar is reused from the existing implementation. Auto-init catches missing config and runs `initTsk()` transparently.

**Tech Stack:** TypeScript, Bun, @opentui/core, luxon, bun:sqlite

**Spec:** `docs/superpowers/specs/2026-03-17-board-view-redesign.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/ensure.ts` | Modify | Auto-init when config missing |
| `src/tui/keybindings.ts` | Modify | New action types, `t` replaces `a`, add `?`/`help` |
| `src/tui/components/task-row.ts` | Rewrite | New format: display ID, status sym, strikethrough, priority, tags, age |
| `src/tui/components/status-bar.ts` | Rewrite | Stats counts + shortcut hints |
| `src/tui/components/command-bar.ts` | Create | Command input with `/command` parsing |
| `src/tui/screens/board.ts` | Create | Board view: area grouping, sorting, navigation, filter state |
| `src/tui/app.ts` | Rewrite | Single-screen wiring, command execution, add-task bar |
| `src/tui/screens/dashboard.ts` | Delete | Replaced by board.ts |
| `src/tui/screens/list.ts` | Delete | Replaced by board.ts |
| `src/tui/components/filter-bar.ts` | Delete | parseFilterString relocated to command-bar.ts |

---

## Chunk 1: Foundation (auto-init, keybindings, task-row, status-bar)

### Task 1: Auto-init in ensure.ts

**Files:**
- Modify: `src/core/ensure.ts`

- [ ] **Step 1: Update ensureInitialized to auto-init**

Replace the throw with a try/catch around `initTsk()`:

```typescript
import { tskDir, dbPath, configPath } from "./paths.js";
import { openDb, initSchema } from "./db.js";
import { readConfig } from "./config.js";
import { initTsk } from "./init.js";
import { Database } from "bun:sqlite";

export async function ensureInitialized(): Promise<Database> {
  const dir = tskDir();

  const configExists = await Bun.file(configPath()).exists();
  if (!configExists) {
    try {
      await initTsk();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Could not auto-initialize tsk: ${msg}`);
      console.error("Run 'tsk init' manually to set up.");
      process.exit(1);
    }
  }

  // Validate config is readable
  await readConfig();

  // Open and ensure db schema
  const db = openDb(dbPath());
  initSchema(db);
  return db;
}
```

- [ ] **Step 2: Test auto-init**

Run: `TSK_DIR=/tmp/claude/tsk-test-$$ bun run src/tsk.ts ui`
Expected: TUI launches with empty board (no crash). Then `Ctrl+C` to exit.
Clean up: `rm -rf /tmp/claude/tsk-test-*`

- [ ] **Step 3: Commit**

```bash
git add src/core/ensure.ts
git commit -m "feat: auto-initialize tsk when config missing"
```

---

### Task 2: Update keybindings

**Files:**
- Modify: `src/tui/keybindings.ts`

- [ ] **Step 1: Update Action type and resolveAction**

```typescript
import type { KeyEvent } from "@opentui/core";

export type Action =
  | "quit"
  | "navigate_up"
  | "navigate_down"
  | "select"
  | "add_task"
  | "mark_done"
  | "delete_task"
  | "edit_task"
  | "undo"
  | "redo"
  | "filter"
  | "command"
  | "help"
  | "next_section"
  | "prev_section"
  | "escape";

export function resolveAction(key: KeyEvent): Action | null {
  // Ctrl+C / q to quit
  if (key.ctrl && key.name === "c") return "quit";
  if (key.name === "q") return "quit";

  // Navigation
  if (key.name === "j" || key.name === "down") return "navigate_down";
  if (key.name === "k" || key.name === "up") return "navigate_up";

  // Actions
  if (key.name === "return") return "select";
  if (key.name === "t") return "add_task";
  if (key.name === "d") return "mark_done";
  if (key.name === "x") return "delete_task";
  if (key.name === "e") return "edit_task";
  if (key.name === "u" && key.shift) return "redo";
  if (key.name === "u") return "undo";
  if (key.name === "/") return "command";
  if (key.name === "?") return "help";
  if (key.name === "escape") return "escape";

  // Section cycling
  if (key.name === "tab") return key.shift ? "prev_section" : "next_section";

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tui/keybindings.ts
git commit -m "feat: update keybindings for board view (t=add, /=command, ?=help)"
```

---

### Task 3: Rewrite task-row component

**Files:**
- Rewrite: `src/tui/components/task-row.ts`

- [ ] **Step 1: Write new task-row.ts**

```typescript
import { BoxRenderable, TextRenderable, t, bold, fg, strikethrough, type RenderContext } from "@opentui/core";
import { DateTime } from "luxon";
import type { Task } from "../../core/task.js";
import type { TskTheme } from "../theme.js";

const STATUS_SYMBOLS: Record<string, string> = {
  inbox: "\u25A1",     // □
  next: "\u2026",      // …
  waiting: "\u25A1",   // □
  someday: "\u25A1",   // □
  done: "\u2714",      // ✔
  cancelled: "\u2718", // ✘
};

const STATUS_COLORS: Record<string, (theme: TskTheme) => string> = {
  inbox: (theme) => theme.muted,
  next: (theme) => theme.accent,
  waiting: (theme) => theme.muted,
  someday: (theme) => theme.muted,
  done: (theme) => theme.success,
  cancelled: (theme) => theme.error,
};

function formatAge(created: string): string {
  const createdDt = DateTime.fromISO(created);
  const now = DateTime.now();
  const diff = now.diff(createdDt, ["days", "hours", "weeks", "months"]);
  const hours = Math.floor(diff.as("hours"));
  const days = Math.floor(diff.as("days"));
  const weeks = Math.floor(diff.as("weeks"));
  const months = Math.floor(diff.as("months"));

  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  if (days <= 6) return `${days}d`;
  if (weeks <= 4) return `${weeks}w`;
  return `${months}mo`;
}

function formatPriority(priority: string): string {
  if (priority === "high") return "(!!)";
  if (priority === "medium") return "(!)";
  return "";
}

export function createTaskRow(
  renderer: RenderContext,
  task: Task,
  theme: TskTheme,
  opts: { selected?: boolean; displayId: number }
): BoxRenderable {
  const row = new BoxRenderable(renderer, {
    id: `task-${task.id}`,
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: opts.selected ? theme.selectedBg : undefined,
  });

  const isDone = task.status === "done" || task.status === "cancelled";
  const statusSym = STATUS_SYMBOLS[task.status] ?? "\u25A1";
  const statusColor = (STATUS_COLORS[task.status] ?? ((th: TskTheme) => th.muted))(theme);

  // Display ID: right-aligned in 3-char column, with > prefix when selected
  const idStr = String(opts.displayId);
  const idPadded = opts.selected
    ? `>${idStr.padStart(2)}`
    : ` ${idStr.padStart(2)}`;

  const titleColor = opts.selected ? theme.selectedFg : theme.fg;

  // Priority
  const priStr = formatPriority(task.priority);
  const priColor =
    task.priority === "high" ? theme.priorityHigh
    : task.priority === "medium" ? theme.priorityMedium
    : theme.muted;

  // Tags
  const tagStr = task.tags?.length
    ? " " + task.tags.join(" ")
    : "";

  // Age
  const age = formatAge(task.created);

  // Build the line
  let titlePart;
  if (isDone) {
    titlePart = fg(theme.muted)(strikethrough(task.title));
  } else {
    titlePart = fg(titleColor)(task.title);
  }

  const parts = [
    fg(opts.selected ? theme.selectedFg : theme.muted)(idPadded),
    " ",
    fg(statusColor)(statusSym),
    " ",
    titlePart,
  ];

  if (priStr) {
    parts.push(" ", fg(priColor)(priStr));
  }

  if (tagStr) {
    parts.push(fg(theme.warning)(tagStr));
  }

  parts.push(" ", fg(theme.muted)(age));

  const content = t`${parts.map(p => typeof p === "string" ? p : p).join("")}`;

  row.add(
    new TextRenderable(renderer, {
      id: `task-text-${task.id}`,
      content,
      flexGrow: 1,
    })
  );

  return row;
}
```

**Note:** The `strikethrough` import from `@opentui/core` may or may not exist. If it doesn't, we'll use ANSI escape `\x1b[9m...\x1b[29m` manually. Verify the import exists in the framework first. If not, define a local helper:

```typescript
function strikeText(text: string): string {
  return `\x1b[9m${text}\x1b[29m`;
}
```

- [ ] **Step 2: Verify the @opentui/core exports**

Run: `grep -r "strikethrough" node_modules/@opentui/core/dist/ 2>/dev/null | head -5`

If `strikethrough` is not exported, use the ANSI escape helper instead.

- [ ] **Step 3: Commit**

```bash
git add src/tui/components/task-row.ts
git commit -m "feat: rewrite task-row with display ID, status symbols, age, strikethrough"
```

---

### Task 4: Rewrite status-bar component

**Files:**
- Rewrite: `src/tui/components/status-bar.ts`

- [ ] **Step 1: Write new status-bar.ts**

```typescript
import { BoxRenderable, TextRenderable, t, bold, fg, type RenderContext } from "@opentui/core";
import type { TskTheme } from "../theme.js";

export interface BoardStats {
  total: number;
  done: number;
  inProgress: number;
  pending: number;
}

export function createStatusBar(
  renderer: RenderContext,
  theme: TskTheme,
  stats: BoardStats
): BoxRenderable {
  const bar = new BoxRenderable(renderer, {
    id: "status-bar",
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: theme.headerBg,
    justifyContent: "space-between",
  });

  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const left = new TextRenderable(renderer, {
    id: "status-left",
    content: t`${fg(theme.success)(`${pct}% done`)} ${fg(theme.muted)("|")} ${fg(theme.success)(`${stats.done} done`)} ${fg(theme.muted)("\u00B7")} ${fg(theme.accent)(`${stats.inProgress} in-progress`)} ${fg(theme.muted)("\u00B7")} ${fg(theme.warning)(`${stats.pending} pending`)}`,
  });

  const right = new TextRenderable(renderer, {
    id: "status-right",
    content: t`${bold(fg(theme.fg)("?"))} ${fg(theme.muted)("Help")} ${fg(theme.muted)("|")} ${bold(fg(theme.fg)("/"))} ${fg(theme.muted)("Command")} ${fg(theme.muted)("|")} ${bold(fg(theme.fg)("t"))} ${fg(theme.muted)("Task")} `,
  });

  bar.add(left);
  bar.add(right);
  return bar;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tui/components/status-bar.ts
git commit -m "feat: rewrite status-bar with board stats and shortcut hints"
```

---

## Chunk 2: Board Screen and Command Bar

### Task 5: Create command-bar component

**Files:**
- Create: `src/tui/components/command-bar.ts`

- [ ] **Step 1: Write command-bar.ts with parseFilterString relocated**

```typescript
import { BoxRenderable, InputRenderable, TextRenderable, t, fg, type RenderContext } from "@opentui/core";
import type { TskTheme } from "../theme.js";

export interface ParsedFilter {
  text?: string;
  tag?: string;
  status?: string;
  priority?: string;
}

export function parseFilterString(raw: string): ParsedFilter {
  const filter: ParsedFilter = {};
  const parts = raw.trim().split(/\s+/);
  const textParts: string[] = [];

  for (const part of parts) {
    if (part.startsWith("#")) {
      filter.tag = part.slice(1);
    } else if (part.startsWith("@")) {
      filter.status = part.slice(1);
    } else if (part.startsWith("!")) {
      filter.priority = part.slice(1);
    } else {
      textParts.push(part);
    }
  }

  if (textParts.length > 0) {
    filter.text = textParts.join(" ");
  }
  return filter;
}

export type CommandResult =
  | { type: "done" }
  | { type: "delete" }
  | { type: "edit" }
  | { type: "filter"; text: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "quit" }
  | { type: "help" }
  | { type: "unknown"; raw: string };

export function parseCommand(raw: string): CommandResult {
  const trimmed = raw.trim();
  // Strip leading / if present
  const cmd = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const parts = cmd.split(/\s+/);
  const name = parts[0]?.toLowerCase() ?? "";
  const rest = parts.slice(1).join(" ");

  switch (name) {
    case "done":
    case "d":
      return { type: "done" };
    case "delete":
    case "x":
      return { type: "delete" };
    case "edit":
    case "e":
      return { type: "edit" };
    case "filter":
    case "f":
      return { type: "filter", text: rest };
    case "undo":
    case "u":
      return { type: "undo" };
    case "redo":
      return { type: "redo" };
    case "quit":
    case "q":
      return { type: "quit" };
    case "help":
    case "?":
      return { type: "help" };
    default:
      return { type: "unknown", raw: trimmed };
  }
}

export interface CommandBarResult {
  container: BoxRenderable;
}

export function createCommandBar(
  renderer: RenderContext,
  theme: TskTheme
): CommandBarResult {
  const container = new BoxRenderable(renderer, {
    id: "command-bar",
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: theme.bg,
  });

  const prompt = new TextRenderable(renderer, {
    id: "command-prompt",
    content: t`${fg(theme.accent)(">")} ${fg(theme.muted)("Type / or Tab for commands, ? for help")}`,
    flexGrow: 1,
  });

  container.add(prompt);
  return { container };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tui/components/command-bar.ts
git commit -m "feat: add command-bar component with command parsing and filter logic"
```

---

### Task 6: Create board screen

**Files:**
- Create: `src/tui/screens/board.ts`

- [ ] **Step 1: Write board.ts**

```typescript
import {
  BoxRenderable,
  TextRenderable,
  t,
  bold,
  fg,
  type RenderContext,
} from "@opentui/core";
import { removeAllChildren } from "../helpers.js";
import type { Database } from "bun:sqlite";
import { queryTasks, type TaskFilter } from "../../core/db.js";
import type { Task, TaskStatus, TaskPriority } from "../../core/task.js";
import { createTaskRow } from "../components/task-row.js";
import { createStatusBar, type BoardStats } from "../components/status-bar.js";
import { createCommandBar } from "../components/command-bar.js";
import { parseFilterString } from "../components/command-bar.js";
import type { TskTheme } from "../theme.js";
import type { Action } from "../keybindings.js";

interface AreaGroup {
  name: string;
  tasks: Task[];
  doneCount: number;
}

export interface BoardState {
  groups: AreaGroup[];
  flatTasks: Task[];
  selectedIndex: number;
  filterText: string;
}

const STATUS_SORT_ORDER: Record<string, number> = {
  inbox: 0,
  waiting: 1,
  someday: 2,
  next: 3,
  done: 4,
};

const PRIORITY_SORT_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const statusA = STATUS_SORT_ORDER[a.status] ?? 5;
    const statusB = STATUS_SORT_ORDER[b.status] ?? 5;
    if (statusA !== statusB) return statusA - statusB;

    const priA = PRIORITY_SORT_ORDER[a.priority] ?? 3;
    const priB = PRIORITY_SORT_ORDER[b.priority] ?? 3;
    if (priA !== priB) return priA - priB;

    return (a.created ?? "").localeCompare(b.created ?? "");
  });
}

function buildGroups(db: Database, filterText: string): { groups: AreaGroup[]; flatTasks: Task[] } {
  // Build query filter
  const filter: TaskFilter = {};
  if (filterText) {
    const parsed = parseFilterString(filterText);
    if (parsed.status) filter.status = parsed.status as TaskStatus;
    if (parsed.priority) filter.priority = parsed.priority as TaskPriority;
    if (parsed.tag) filter.tag = parsed.tag;
    if (parsed.text) filter.search = parsed.text;
  }

  const allTasks = queryTasks(db, filter).filter(
    (t) => t.status !== "cancelled"
  );

  // Group by area
  const areaMap = new Map<string, Task[]>();
  for (const task of allTasks) {
    const area = task.area || "Uncategorized";
    if (!areaMap.has(area)) areaMap.set(area, []);
    areaMap.get(area)!.push(task);
  }

  // Sort areas alphabetically, Uncategorized last
  const areaNames = [...areaMap.keys()].sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  });

  const groups: AreaGroup[] = [];
  const flatTasks: Task[] = [];

  for (const name of areaNames) {
    const tasks = sortTasks(areaMap.get(name)!);
    const doneCount = tasks.filter((t) => t.status === "done").length;
    groups.push({ name, tasks, doneCount });
    flatTasks.push(...tasks);
  }

  return { groups, flatTasks };
}

export function createBoardScreen(
  renderer: RenderContext,
  db: Database,
  theme: TskTheme
): { container: BoxRenderable; state: BoardState; commandBar: ReturnType<typeof createCommandBar>; refresh: () => void } {
  const container = new BoxRenderable(renderer, {
    id: "board",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundColor: theme.bg,
  });

  const state: BoardState = {
    groups: [],
    flatTasks: [],
    selectedIndex: 0,
    filterText: "",
  };

  // Header
  const header = new BoxRenderable(renderer, {
    id: "board-header",
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: theme.headerBg,
  });

  // Content area
  const content = new BoxRenderable(renderer, {
    id: "board-content",
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    padding: 1,
  });

  // Command bar
  const commandBar = createCommandBar(renderer, theme);

  function refresh() {
    const { groups, flatTasks } = buildGroups(db, state.filterText);
    state.groups = groups;
    state.flatTasks = flatTasks;

    // Clamp selected index
    if (state.selectedIndex >= flatTasks.length) {
      state.selectedIndex = Math.max(0, flatTasks.length - 1);
    }

    // Rebuild header
    removeAllChildren(header);
    const filterLabel = state.filterText
      ? `Board View (filtered: ${state.filterText})`
      : "Board View";
    header.add(new TextRenderable(renderer, {
      id: "header-text",
      content: t` ${bold(fg(theme.headerFg)("tsk"))}  ${fg(theme.muted)(filterLabel)}`,
      flexGrow: 1,
    }));

    // Rebuild content
    removeAllChildren(content);

    if (flatTasks.length === 0) {
      content.add(new TextRenderable(renderer, {
        id: "empty-state",
        content: t`  ${fg(theme.muted)("No tasks yet. Press t to add your first task.")}`,
        width: "100%",
        height: 1,
      }));
    } else {
      let displayId = 1;
      for (const group of groups) {
        // Area header
        const doneCount = group.doneCount;
        const totalCount = group.tasks.length;
        content.add(new TextRenderable(renderer, {
          id: `area-header-${group.name}`,
          content: t`  ${bold(fg(theme.accent)(`@${group.name}`))} ${fg(theme.muted)(`[${doneCount}/${totalCount}]`)}`,
          width: "100%",
          height: 1,
        }));

        for (const task of group.tasks) {
          const globalIdx = displayId - 1;
          const selected = globalIdx === state.selectedIndex;
          content.add(createTaskRow(renderer, task, theme, { selected, displayId }));
          displayId++;
        }

        // Spacer between groups
        content.add(new BoxRenderable(renderer, {
          id: `area-spacer-${group.name}`,
          width: "100%",
          height: 1,
        }));
      }
    }

    // Compute stats
    const stats: BoardStats = { total: 0, done: 0, inProgress: 0, pending: 0 };
    for (const task of flatTasks) {
      stats.total++;
      if (task.status === "done") stats.done++;
      else if (task.status === "next") stats.inProgress++;
      else stats.pending++;
    }

    const statusBar = createStatusBar(renderer, theme, stats);

    // Rebuild container
    removeAllChildren(container);
    container.add(header);
    container.add(content);
    container.add(commandBar.container);
    container.add(statusBar);
  }

  refresh();
  return { container, state, commandBar, refresh };
}

export function getSelectedTask(state: BoardState): Task | null {
  if (state.flatTasks.length === 0) return null;
  return state.flatTasks[state.selectedIndex] ?? null;
}

export function handleBoardAction(state: BoardState, action: Action): boolean {
  switch (action) {
    case "navigate_down":
      if (state.selectedIndex < state.flatTasks.length - 1) {
        state.selectedIndex++;
        return true;
      }
      return false;

    case "navigate_up":
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        return true;
      }
      return false;

    case "next_section": {
      // Jump to first task of next area group
      let cumulative = 0;
      for (let i = 0; i < state.groups.length; i++) {
        cumulative += state.groups[i].tasks.length;
        if (cumulative > state.selectedIndex) {
          // Current group is i, jump to start of i+1
          if (i + 1 < state.groups.length) {
            state.selectedIndex = cumulative;
            return true;
          }
          // Wrap to first group
          state.selectedIndex = 0;
          return true;
        }
      }
      return false;
    }

    case "prev_section": {
      // Jump to first task of previous area group
      let cumulative = 0;
      for (let i = 0; i < state.groups.length; i++) {
        const groupEnd = cumulative + state.groups[i].tasks.length;
        if (groupEnd > state.selectedIndex) {
          // Current group is i
          if (state.selectedIndex > cumulative) {
            // Jump to start of current group
            state.selectedIndex = cumulative;
            return true;
          }
          // Jump to start of previous group
          if (i > 0) {
            let prevStart = 0;
            for (let j = 0; j < i - 1; j++) {
              prevStart += state.groups[j].tasks.length;
            }
            state.selectedIndex = prevStart;
            return true;
          }
          // Wrap to last group
          const lastGroupStart = state.flatTasks.length - state.groups[state.groups.length - 1].tasks.length;
          state.selectedIndex = lastGroupStart;
          return true;
        }
        cumulative = groupEnd;
      }
      return false;
    }

    default:
      return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tui/screens/board.ts
git commit -m "feat: add board screen with area grouping, sorting, and navigation"
```

---

### Task 7: Rewrite app.ts

**Files:**
- Rewrite: `src/tui/app.ts`

- [ ] **Step 1: Write new app.ts**

```typescript
import { createCliRenderer, InputRenderable, BoxRenderable, TextRenderable, t, fg, type KeyEvent } from "@opentui/core";
import type { Database } from "bun:sqlite";
import { removeAllChildren } from "./helpers.js";
import { getTheme } from "./theme.js";
import { resolveAction } from "./keybindings.js";
import { pushUndo, performUndo, performRedo } from "./undo.js";
import { parseAddInput } from "./add-parser.js";
import { parseCommand } from "./components/command-bar.js";
import {
  createBoardScreen,
  handleBoardAction,
  getSelectedTask,
} from "./screens/board.js";
import { completeTask, deleteTask, createTask, getTask } from "../core/crud.js";
import { readConfig } from "../core/config.js";
import { taskFilePath } from "../core/paths.js";
import { suggestScheduledTime } from "../core/scheduler.js";
import { getSuggestions } from "./autocomplete.js";
import { handleTabComplete, resetTabState } from "./tab-complete.js";
import { readTaskFile } from "../core/markdown.js";
import { indexTask } from "../core/db.js";
import { autoCommit } from "../core/git.js";

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

  let inputMode = false; // true when add bar or command bar has focus

  const board = createBoardScreen(renderer, db, theme);

  function refreshBoard() {
    removeAllChildren(renderer.root);
    board.refresh();
    renderer.root.add(board.container);
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
    addContainer.add(bar);
    addContainer.add(hintsRow);
    updateHints("");

    removeAllChildren(renderer.root);
    renderer.root.add(addContainer);
    renderer.root.add(board.container);
    input.focus();
  }

  function showCommandInput(prefill: string) {
    inputMode = true;

    const cmdContainer = new BoxRenderable(renderer, {
      id: "cmd-input-container",
      flexDirection: "row",
      width: "100%",
      height: 1,
      backgroundColor: theme.bg,
    });

    const prompt = new TextRenderable(renderer, {
      id: "cmd-prompt",
      content: t`${fg(theme.accent)(">")} `,
    });

    const input = new InputRenderable(renderer, {
      id: "cmd-input",
      placeholder: "",
      backgroundColor: theme.bg,
      textColor: theme.fg,
      cursorColor: theme.accent,
      focusedBackgroundColor: theme.bg,
      flexGrow: 1,
      onKeyDown: async (key) => {
        if (key.name === "return") {
          const raw = input.value.trim();
          inputMode = false;
          if (raw) {
            await executeCommand(raw);
          } else {
            refreshBoard();
          }
        } else if (key.name === "escape") {
          inputMode = false;
          refreshBoard();
        }
      },
    });

    // Set prefill value
    if (prefill) {
      input.value = prefill;
    }

    cmdContainer.add(prompt);
    cmdContainer.add(input);

    // Replace the command bar in the board with the active input
    removeAllChildren(renderer.root);
    board.refresh();

    // Remove the inactive command bar from board container, insert active one
    // We rebuild: header + content + active command input + status bar
    renderer.root.add(board.container);

    // Swap the command bar: remove board container's command bar placeholder and add input
    // Actually, simpler approach: overlay the input at the bottom
    // For simplicity, reconstruct the view with the active command input
    removeAllChildren(renderer.root);

    // Get board children (header, content, commandBar, statusBar)
    // We need to rebuild board without its command bar and insert ours
    // Easier: just put the active input below the board
    board.refresh();
    renderer.root.add(board.container);

    // The command bar within board.container will be overwritten on next refresh.
    // For now, just overlay the input. The user types, presses Enter/Escape, and we refresh.
    // A simpler approach: don't mess with board container, just show a fullscreen overlay-style input
    removeAllChildren(renderer.root);
    renderer.root.add(board.container);

    // Focus the input by replacing board's command bar
    const boardChildren = board.container.getChildren();
    // command bar is the 3rd child (index 2): header(0), content(1), commandBar(2), statusBar(3)
    if (boardChildren.length >= 3) {
      board.container.remove(boardChildren[2].id);
      // Insert the active command input at position 2
      // @opentui/core may not support insert-at-index, so we rebuild
      removeAllChildren(board.container);
      board.container.add(boardChildren[0]); // header
      board.container.add(boardChildren[1]); // content
      board.container.add(cmdContainer);      // active command input
      if (boardChildren[3]) {
        board.container.add(boardChildren[3]); // status bar
      }
    }

    input.focus();
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
        return; // editSelectedTask exits the process
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
        // Just refresh, ignore unknown commands
        break;
    }

    refreshBoard();
  }

  function showHelp() {
    const helpBox = new BoxRenderable(renderer, {
      id: "help-overlay",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: theme.bg,
      padding: 2,
    });

    const lines = [
      "Keyboard Shortcuts",
      "",
      "  j/\u2193     Navigate down",
      "  k/\u2191     Navigate up",
      "  Tab      Next area group",
      "  S-Tab    Previous area group",
      "  t        Add new task",
      "  d        Mark task done",
      "  x        Delete task",
      "  e        Edit in editor",
      "  u        Undo",
      "  U        Redo",
      "  Enter    View task detail",
      "  /        Open command bar",
      "  ?        Show this help",
      "  q        Quit",
      "",
      "Commands (type / then command):",
      "",
      "  /done /d       Mark selected task done",
      "  /delete /x     Delete selected task",
      "  /edit /e       Edit in editor",
      "  /filter /f     Filter tasks (#tag @status !pri text)",
      "  /undo /u       Undo last action",
      "  /redo          Redo",
      "  /quit /q       Quit",
      "  /help /?       Show this help",
      "",
      "Press any key to close",
    ];

    for (let i = 0; i < lines.length; i++) {
      helpBox.add(new TextRenderable(renderer, {
        id: `help-line-${i}`,
        content: t`${fg(i === 0 ? theme.accent : theme.fg)(lines[i])}`,
        width: "100%",
        height: 1,
      }));
    }

    removeAllChildren(renderer.root);
    renderer.root.add(helpBox);

    const helpHandler = (key: KeyEvent) => {
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

    const newRenderer = await createCliRenderer();
    newRenderer.destroy();
    db.close();
    console.log("Task edited. TUI exited -- run `tsk ui` to relaunch.");
    process.exit(0);
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

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    if (inputMode) return;

    const action = resolveAction(key);
    if (!action) return;

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
        showCommandInput("/");
        break;

      case "help":
        showCommandInput("/help");
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

      case "escape":
        if (board.state.filterText) {
          board.state.filterText = "";
          board.state.selectedIndex = 0;
          refreshBoard();
        }
        break;

      default: {
        const needsRefresh = handleBoardAction(board.state, action);
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
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tui/app.ts
git commit -m "feat: rewrite app.ts for single board view with command bar"
```

---

## Chunk 3: Cleanup and Verification

### Task 8: Delete old screens and filter-bar

**Files:**
- Delete: `src/tui/screens/dashboard.ts`
- Delete: `src/tui/screens/list.ts`
- Delete: `src/tui/components/filter-bar.ts`

- [ ] **Step 1: Remove the old files**

```bash
rm src/tui/screens/dashboard.ts src/tui/screens/list.ts src/tui/components/filter-bar.ts
```

- [ ] **Step 2: Verify no remaining imports reference deleted files**

```bash
grep -r "dashboard\|list\.js\|filter-bar" src/tui/ --include="*.ts"
```

Expected: no results (all references removed in app.ts rewrite).

- [ ] **Step 3: Commit**

```bash
git add -u src/tui/screens/dashboard.ts src/tui/screens/list.ts src/tui/components/filter-bar.ts
git commit -m "chore: remove old dashboard, list, and filter-bar screens"
```

---

### Task 9: Build and manual test

- [ ] **Step 1: Type-check**

```bash
cd /home/seano/source/tsk && npx tsc --noEmit
```

Fix any type errors that surface. Common issues:
- `strikethrough` may not be exported from `@opentui/core` — use ANSI escape helper
- `t` tagged template may need adjustment for string concatenation in task-row

- [ ] **Step 2: Run the TUI**

```bash
bun run src/tsk.ts ui
```

Verify:
- Board view renders with area groups
- Tasks show status symbols, priority indicators, age
- Navigation with j/k works
- Tab/Shift+Tab jumps between area groups
- `t` opens add-task bar with autocomplete
- `/` opens command bar
- `?` opens help
- `d` marks task done (strikethrough appears)
- `Escape` clears filter
- Status bar shows correct stats
- Empty board shows "No tasks yet" message

- [ ] **Step 3: Test auto-init with fresh directory**

```bash
TSK_DIR=/tmp/claude/tsk-fresh-test bun run src/tsk.ts ui
```

Expected: initializes and shows empty board.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build issues from board view implementation"
```
