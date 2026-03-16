import { BoxRenderable, TextRenderable, t, bold, fg, type RenderContext } from "@opentui/core";
import type { Task } from "../../core/task.js";
import type { TskTheme } from "../theme.js";

const STATUS_SYMBOLS: Record<string, string> = {
  inbox: "[ ]",
  next: "[>]",
  waiting: "[~]",
  someday: "[?]",
  done: "[x]",
  cancelled: "[-]",
};

const PRIORITY_SYMBOLS: Record<string, string> = {
  high: "!!!",
  medium: "!! ",
  low: "!  ",
  none: "   ",
};

function formatDue(due: string): string {
  return due.slice(0, 10);
}

export function createTaskRow(
  renderer: RenderContext,
  task: Task,
  theme: TskTheme,
  opts: { selected?: boolean } = {}
): BoxRenderable {
  const row = new BoxRenderable(renderer, {
    id: `task-${task.id}`,
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: opts.selected ? theme.selectedBg : undefined,
  });

  const status = STATUS_SYMBOLS[task.status] ?? "[ ]";
  const prioritySym = PRIORITY_SYMBOLS[task.priority] ?? "   ";
  const priorityColor =
    task.priority === "high"
      ? theme.priorityHigh
      : task.priority === "medium"
        ? theme.priorityMedium
        : task.priority === "low"
          ? theme.priorityLow
          : theme.muted;

  const id = task.id.slice(0, 8);
  const titleColor = opts.selected ? theme.selectedFg : theme.fg;

  // Build metadata chips
  const chips: string[] = [];
  if (task.due) chips.push(`due:${formatDue(task.due)}`);
  if (task.area) chips.push(`[${task.area}]`);
  if (task.project) chips.push(`{${task.project}}`);
  if (task.tags?.length) chips.push(task.tags.map((t) => `#${t}`).join(" "));
  const meta = chips.length > 0 ? `  ${chips.join(" ")}` : "";

  const content = t`${fg(theme.muted)(status)} ${fg(priorityColor)(bold(prioritySym))} ${fg(theme.muted)(id)}  ${fg(titleColor)(task.title)}${fg(theme.warning)(meta)}`;

  row.add(
    new TextRenderable(renderer, {
      id: `task-text-${task.id}`,
      content,
      flexGrow: 1,
    })
  );

  return row;
}
