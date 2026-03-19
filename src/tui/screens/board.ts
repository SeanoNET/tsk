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
import { parseFilterString } from "../components/command-bar.js";
import type { TskTheme } from "../theme.js";
import type { Action, ActionResult } from "../keybindings.js";
import { createSyncIndicator, type SyncState } from "../components/sync-indicator.js";

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
  syncState?: SyncState;
  showDone: boolean;
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

    // Tasks with due dates come first, sorted by earliest due
    const dueA = a.due ?? "";
    const dueB = b.due ?? "";
    if (dueA && !dueB) return -1;
    if (!dueA && dueB) return 1;
    if (dueA && dueB && dueA !== dueB) return dueA.localeCompare(dueB);

    return (a.created ?? "").localeCompare(b.created ?? "");
  });
}

function buildGroups(db: Database, filterText: string, expandDone: boolean): { groups: AreaGroup[]; flatTasks: Task[]; doneCount: number } {
  const filter: TaskFilter = {};
  if (filterText) {
    const parsed = parseFilterString(filterText);
    if (parsed.status) filter.status = parsed.status as TaskStatus;
    if (parsed.priority) filter.priority = parsed.priority as TaskPriority;
    if (parsed.tag) filter.tag = parsed.tag;
    if (parsed.text) filter.search = parsed.text;
  }

  const showDone = expandDone || filter.status === "done";
  const allTasks = queryTasks(db, filter).filter(
    (task) => task.status !== "cancelled"
  );

  // Separate done tasks unless explicitly filtering for them
  const activeTasks: Task[] = [];
  const doneTasks: Task[] = [];
  for (const task of allTasks) {
    if (!showDone && task.status === "done") {
      doneTasks.push(task);
    } else {
      activeTasks.push(task);
    }
  }

  // Group active tasks by area
  const areaMap = new Map<string, Task[]>();
  for (const task of activeTasks) {
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
    const totalForArea = tasks.length + doneTasks.filter((t) => (t.area || "Uncategorized") === name).length;
    const doneForArea = doneTasks.filter((t) => (t.area || "Uncategorized") === name).length;
    groups.push({ name, tasks, doneCount: doneForArea });
    flatTasks.push(...tasks);
  }

  return { groups, flatTasks, doneCount: doneTasks.length };
}

export function createBoardScreen(
  renderer: RenderContext,
  db: Database,
  theme: TskTheme
): { container: BoxRenderable; state: BoardState; refresh: () => void } {
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
    showDone: false,
  };

  const header = new BoxRenderable(renderer, {
    id: "board-header",
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: theme.headerBg,
  });

  const content = new BoxRenderable(renderer, {
    id: "board-content",
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    padding: 1,
  });

  function refresh() {
    const { groups, flatTasks, doneCount } = buildGroups(db, state.filterText, state.showDone);
    state.groups = groups;
    state.flatTasks = flatTasks;

    // Clamp selected index
    if (state.selectedIndex >= flatTasks.length) {
      state.selectedIndex = Math.max(0, flatTasks.length - 1);
    }

    // Rebuild header
    removeAllChildren(header);
    if (state.filterText) {
      header.add(new TextRenderable(renderer, {
        id: "header-text",
        content: t` ${bold(fg(theme.headerFg)("tsk"))}  ${fg(theme.warning)(`filter: ${state.filterText}`)}  ${fg(theme.muted)("(Esc to clear)")}`,
        flexGrow: 1,
      }));
    } else {
      header.add(new TextRenderable(renderer, {
        id: "header-text",
        content: t` ${bold(fg(theme.headerFg)("tsk"))}  ${fg(theme.muted)("Board View")}`,
        flexGrow: 1,
      }));
    }

    // Sync indicator (right-aligned in header)
    if (state.syncState && state.syncState.status !== "disabled") {
      header.add(createSyncIndicator(renderer, theme, state.syncState));
    }

    // Rebuild content
    removeAllChildren(content);

    if (flatTasks.length === 0 && doneCount === 0) {
      const emptyMsg = state.filterText
        ? "No tasks match the current filter."
        : "No tasks yet. Press t to add your first task.";
      content.add(new TextRenderable(renderer, {
        id: "empty-state",
        content: t`  ${fg(theme.muted)(emptyMsg)}`,
        width: "100%",
        height: 1,
      }));
    } else {
      let displayId = 1;
      for (const group of groups) {
        // Area header
        content.add(new TextRenderable(renderer, {
          id: `area-header-${group.name}`,
          content: t`  ${bold(fg(theme.fieldArea)(`@${group.name}`))} ${fg(theme.muted)(`[${group.doneCount}/${group.tasks.length}]`)}`,
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

      // Done section summary
      if (doneCount > 0) {
        const arrow = state.showDone ? "\u25BC" : "\u25B6";
        const label = `${arrow} \u2714 ${doneCount} done task${doneCount === 1 ? "" : "s"} (D to ${state.showDone ? "collapse" : "expand"})`;
        content.add(new TextRenderable(renderer, {
          id: "done-section",
          content: t`  ${fg(theme.muted)(label)}`,
          width: "100%",
          height: 1,
        }));
      }
    }

    // Compute stats (include collapsed done tasks)
    const stats: BoardStats = { total: flatTasks.length + doneCount, done: doneCount, inProgress: 0, pending: 0 };
    for (const task of flatTasks) {
      if (task.status === "done") stats.done++;
      else if (task.status === "next") stats.inProgress++;
      else stats.pending++;
    }

    const statusBar = createStatusBar(renderer, theme, stats);

    // Rebuild container
    removeAllChildren(container);
    container.add(header);
    container.add(content);
    container.add(statusBar);
  }

  refresh();
  return { container, state, refresh };
}

export function getSelectedTask(state: BoardState): Task | null {
  if (state.flatTasks.length === 0) return null;
  return state.flatTasks[state.selectedIndex] ?? null;
}

const PAGE_SIZE = 20;
const HALF_PAGE = 10;

export function handleBoardAction(state: BoardState, result: ActionResult): boolean {
  const { action, count } = result;
  const max = state.flatTasks.length - 1;

  switch (action) {
    case "navigate_down": {
      const steps = count ?? 1;
      if (state.selectedIndex < max) {
        state.selectedIndex = Math.min(state.selectedIndex + steps, max);
        return true;
      }
      return false;
    }

    case "navigate_up": {
      const steps = count ?? 1;
      if (state.selectedIndex > 0) {
        state.selectedIndex = Math.max(state.selectedIndex - steps, 0);
        return true;
      }
      return false;
    }

    case "goto_top":
      if (state.selectedIndex !== 0) {
        state.selectedIndex = 0;
        return true;
      }
      return false;

    case "goto_bottom":
      if (state.selectedIndex !== max) {
        state.selectedIndex = max;
        return true;
      }
      return false;

    case "goto_line": {
      const target = Math.min((count ?? 1) - 1, max);
      if (target >= 0 && target !== state.selectedIndex) {
        state.selectedIndex = target;
        return true;
      }
      return false;
    }

    case "half_page_down": {
      const steps = (count ?? 1) * HALF_PAGE;
      if (state.selectedIndex < max) {
        state.selectedIndex = Math.min(state.selectedIndex + steps, max);
        return true;
      }
      return false;
    }

    case "half_page_up": {
      const steps = (count ?? 1) * HALF_PAGE;
      if (state.selectedIndex > 0) {
        state.selectedIndex = Math.max(state.selectedIndex - steps, 0);
        return true;
      }
      return false;
    }

    case "page_down": {
      const steps = (count ?? 1) * PAGE_SIZE;
      if (state.selectedIndex < max) {
        state.selectedIndex = Math.min(state.selectedIndex + steps, max);
        return true;
      }
      return false;
    }

    case "page_up": {
      const steps = (count ?? 1) * PAGE_SIZE;
      if (state.selectedIndex > 0) {
        state.selectedIndex = Math.max(state.selectedIndex - steps, 0);
        return true;
      }
      return false;
    }

    case "next_section": {
      // Jump to first task of next area group
      let cumulative = 0;
      for (let i = 0; i < state.groups.length; i++) {
        cumulative += state.groups[i].tasks.length;
        if (cumulative > state.selectedIndex) {
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
      // Jump to first task of current or previous area group
      let cumulative = 0;
      for (let i = 0; i < state.groups.length; i++) {
        const groupEnd = cumulative + state.groups[i].tasks.length;
        if (groupEnd > state.selectedIndex) {
          if (state.selectedIndex > cumulative) {
            // Jump to start of current group
            state.selectedIndex = cumulative;
            return true;
          }
          if (i > 0) {
            // Jump to start of previous group
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
