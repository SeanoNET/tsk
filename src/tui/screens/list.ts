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
import { createStatusBar } from "../components/status-bar.js";
import { createFilterBar, parseFilterString, type FilterBarResult } from "../components/filter-bar.js";
import type { TskTheme } from "../theme.js";
import type { Action } from "../keybindings.js";

export interface ListState {
  tasks: Task[];
  selectedIndex: number;
  filterText: string;
  filterVisible: boolean;
}

function buildQuery(filterText: string): TaskFilter {
  if (!filterText) return {};
  const parsed = parseFilterString(filterText);
  const filter: TaskFilter = {};
  if (parsed.status) filter.status = parsed.status as TaskStatus;
  if (parsed.priority) filter.priority = parsed.priority as TaskPriority;
  if (parsed.tag) filter.tag = parsed.tag;
  if (parsed.text) filter.search = parsed.text;
  return filter;
}

export function createListScreen(
  renderer: RenderContext,
  db: Database,
  theme: TskTheme
): {
  container: BoxRenderable;
  state: ListState;
  filterBar: FilterBarResult;
  refresh: () => void;
} {
  const container = new BoxRenderable(renderer, {
    id: "list-screen",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundColor: theme.bg,
  });

  const state: ListState = {
    tasks: [],
    selectedIndex: 0,
    filterText: "",
    filterVisible: false,
  };

  const content = new BoxRenderable(renderer, {
    id: "list-content",
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    padding: 1,
  });

  const filterBar = createFilterBar(renderer, theme, {
    onSubmit: (value) => {
      state.filterText = value;
      state.selectedIndex = 0;
      state.filterVisible = false;
      refresh();
    },
  });

  function refresh() {
    removeAllChildren(content);

    const filter = buildQuery(state.filterText);
    state.tasks = queryTasks(db, filter);

    // Clamp selected index
    if (state.selectedIndex >= state.tasks.length) {
      state.selectedIndex = Math.max(0, state.tasks.length - 1);
    }

    // Header
    const headerText = state.filterText
      ? `Tasks (filtered: ${state.filterText})`
      : "All Tasks";

    content.add(
      new TextRenderable(renderer, {
        id: "list-header",
        content: t`${bold(fg(theme.accent)(headerText))}`,
        width: "100%",
        height: 1,
      })
    );

    content.add(
      new BoxRenderable(renderer, {
        id: "list-divider",
        width: "100%",
        height: 1,
      })
    );

    if (state.tasks.length === 0) {
      content.add(
        new TextRenderable(renderer, {
          id: "list-empty",
          content: t`  ${fg(theme.muted)("No tasks found.")}`,
          width: "100%",
          height: 1,
        })
      );
    }

    for (let i = 0; i < state.tasks.length; i++) {
      const selected = i === state.selectedIndex;
      content.add(createTaskRow(renderer, state.tasks[i], theme, { selected }));
    }

    // Rebuild container
    removeAllChildren(container);
    if (state.filterVisible) {
      container.add(filterBar.container);
    }
    container.add(content);

    const statusBar = createStatusBar(renderer, theme, {
      screen: "List",
      taskCount: state.tasks.length,
      hints: "j/k:nav  d:done  x:del  e:edit  /:filter  1:dash  q:quit",
    });
    container.add(statusBar);
  }

  refresh();
  return { container, state, filterBar, refresh };
}

export function getSelectedTask(state: ListState): Task | null {
  if (state.tasks.length === 0) return null;
  return state.tasks[state.selectedIndex] ?? null;
}

export function handleListAction(state: ListState, action: Action): boolean {
  switch (action) {
    case "navigate_down":
      if (state.selectedIndex < state.tasks.length - 1) {
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
    default:
      return false;
  }
}
