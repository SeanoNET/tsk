import {
  BoxRenderable,
  TextRenderable,
  t,
  bold,
  fg,
  type RenderContext,
} from "@opentui/core";
import { removeAllChildren } from "../helpers.js";
import { DateTime } from "luxon";
import type { Database } from "bun:sqlite";
import { queryTasks } from "../../core/db.js";
import type { Task } from "../../core/task.js";
import { createTaskRow } from "../components/task-row.js";
import { createStatusBar } from "../components/status-bar.js";
import type { TskTheme } from "../theme.js";
import type { Action } from "../keybindings.js";

interface Section {
  label: string;
  tasks: Task[];
}

export interface DashboardState {
  sections: Section[];
  sectionIndex: number;
  taskIndex: number;
}

function buildSections(db: Database): Section[] {
  const today = DateTime.now().startOf("day");
  const weekEnd = today.plus({ days: 7 }).endOf("day");

  const allTasks = queryTasks(db).filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );

  const overdue: Task[] = [];
  const todayTasks: Task[] = [];
  const upcoming: Task[] = [];

  for (const task of allTasks) {
    if (!task.due) continue;
    const due = DateTime.fromISO(task.due).startOf("day");
    if (due < today) {
      overdue.push(task);
    } else if (due.hasSame(today, "day")) {
      todayTasks.push(task);
    } else if (due <= weekEnd) {
      upcoming.push(task);
    }
  }

  // Also show inbox tasks with no due date in "Today"
  const inbox = allTasks.filter((t) => t.status === "inbox" && !t.due);

  return [
    { label: "Overdue", tasks: overdue },
    { label: "Today", tasks: [...todayTasks, ...inbox] },
    { label: "Upcoming (7 days)", tasks: upcoming },
  ];
}

export function createDashboardScreen(
  renderer: RenderContext,
  db: Database,
  theme: TskTheme
): { container: BoxRenderable; state: DashboardState; refresh: () => void } {
  const container = new BoxRenderable(renderer, {
    id: "dashboard",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundColor: theme.bg,
  });

  const state: DashboardState = {
    sections: [],
    sectionIndex: 0,
    taskIndex: 0,
  };

  const content = new BoxRenderable(renderer, {
    id: "dashboard-content",
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    padding: 1,
  });

  function refresh() {
    // Remove old children
    removeAllChildren(content);

    state.sections = buildSections(db);

    // Find first non-empty section
    if (state.sections[state.sectionIndex]?.tasks.length === 0) {
      const nonEmpty = state.sections.findIndex((s) => s.tasks.length > 0);
      if (nonEmpty >= 0) {
        state.sectionIndex = nonEmpty;
        state.taskIndex = 0;
      }
    }

    let globalIdx = 0;
    const flatIndex = getFlatIndex(state);

    for (let si = 0; si < state.sections.length; si++) {
      const section = state.sections[si];
      const isActiveSection = si === state.sectionIndex;
      const headerColor = isActiveSection ? theme.accent : theme.muted;

      content.add(
        new TextRenderable(renderer, {
          id: `section-header-${si}`,
          content: t`${bold(fg(headerColor)(`── ${section.label} (${section.tasks.length}) ──`))}`,
          width: "100%",
          height: 1,
        })
      );

      if (section.tasks.length === 0) {
        content.add(
          new TextRenderable(renderer, {
            id: `section-empty-${si}`,
            content: t`  ${fg(theme.muted)("No tasks")}`,
            width: "100%",
            height: 1,
          })
        );
      }

      for (let ti = 0; ti < section.tasks.length; ti++) {
        const selected = globalIdx === flatIndex;
        content.add(createTaskRow(renderer, section.tasks[ti], theme, { selected }));
        globalIdx++;
      }

      // Spacing between sections
      content.add(
        new BoxRenderable(renderer, {
          id: `section-spacer-${si}`,
          width: "100%",
          height: 1,
        })
      );
    }

    // Status bar
    const totalTasks = state.sections.reduce((sum, s) => sum + s.tasks.length, 0);
    const statusBar = createStatusBar(renderer, theme, {
      screen: "Dashboard",
      taskCount: totalTasks,
    });

    // Rebuild container
    removeAllChildren(container);
    container.add(content);
    container.add(statusBar);
  }

  refresh();
  return { container, state, refresh };
}

function getFlatIndex(state: DashboardState): number {
  let idx = 0;
  for (let si = 0; si < state.sectionIndex; si++) {
    idx += state.sections[si].tasks.length;
  }
  return idx + state.taskIndex;
}

export function getSelectedTask(state: DashboardState): Task | null {
  const section = state.sections[state.sectionIndex];
  if (!section || section.tasks.length === 0) return null;
  return section.tasks[state.taskIndex] ?? null;
}

export function handleDashboardAction(state: DashboardState, action: Action): boolean {
  const section = state.sections[state.sectionIndex];

  switch (action) {
    case "navigate_down": {
      if (!section || section.tasks.length === 0) return false;
      if (state.taskIndex < section.tasks.length - 1) {
        state.taskIndex++;
      } else {
        // Move to next non-empty section
        for (let i = state.sectionIndex + 1; i < state.sections.length; i++) {
          if (state.sections[i].tasks.length > 0) {
            state.sectionIndex = i;
            state.taskIndex = 0;
            break;
          }
        }
      }
      return true;
    }
    case "navigate_up": {
      if (!section || section.tasks.length === 0) return false;
      if (state.taskIndex > 0) {
        state.taskIndex--;
      } else {
        // Move to previous non-empty section
        for (let i = state.sectionIndex - 1; i >= 0; i--) {
          if (state.sections[i].tasks.length > 0) {
            state.sectionIndex = i;
            state.taskIndex = state.sections[i].tasks.length - 1;
            break;
          }
        }
      }
      return true;
    }
    case "next_section": {
      for (let i = state.sectionIndex + 1; i < state.sections.length; i++) {
        if (state.sections[i].tasks.length > 0) {
          state.sectionIndex = i;
          state.taskIndex = 0;
          return true;
        }
      }
      // Wrap around
      for (let i = 0; i < state.sectionIndex; i++) {
        if (state.sections[i].tasks.length > 0) {
          state.sectionIndex = i;
          state.taskIndex = 0;
          return true;
        }
      }
      return false;
    }
    case "prev_section": {
      for (let i = state.sectionIndex - 1; i >= 0; i--) {
        if (state.sections[i].tasks.length > 0) {
          state.sectionIndex = i;
          state.taskIndex = 0;
          return true;
        }
      }
      // Wrap around
      for (let i = state.sections.length - 1; i > state.sectionIndex; i--) {
        if (state.sections[i].tasks.length > 0) {
          state.sectionIndex = i;
          state.taskIndex = 0;
          return true;
        }
      }
      return false;
    }
    default:
      return false;
  }
}
