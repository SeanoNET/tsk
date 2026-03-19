import { BoxRenderable, TextRenderable, t, fg, strikethrough, type RenderContext } from "@opentui/core";
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

function statusColor(status: string, theme: TskTheme): string {
  if (status === "next") return theme.accent;
  if (status === "done") return theme.success;
  if (status === "cancelled") return theme.error;
  return theme.muted;
}

function formatAge(created: string): string {
  const createdDt = DateTime.fromISO(created);
  const now = DateTime.now();
  const hours = Math.floor(now.diff(createdDt, "hours").hours);
  const days = Math.floor(now.diff(createdDt, "days").days);
  const weeks = Math.floor(now.diff(createdDt, "weeks").weeks);
  const months = Math.floor(now.diff(createdDt, "months").months);

  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  if (days <= 6) return `${days}d`;
  if (weeks <= 4) return `${weeks}w`;
  return `${months}mo`;
}

export function createTaskRow(
  renderer: RenderContext,
  task: Task,
  theme: TskTheme,
  opts: { selected?: boolean; displayId: number; strikethroughChars?: number }
): BoxRenderable {
  const row = new BoxRenderable(renderer, {
    id: `task-${task.id}`,
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: opts.selected ? theme.selectedBg : undefined,
  });

  const isDone = task.status === "done" || task.status === "cancelled";
  const stChars = opts.strikethroughChars;
  const isAnimating = stChars !== undefined;
  const sym = STATUS_SYMBOLS[task.status] ?? "\u25A1";
  const symColor = statusColor(task.status, theme);
  // During animation, override the symbol based on direction
  const displaySym = isAnimating && stChars > 0 ? "\u2714" : sym;
  const displaySymColor = isAnimating && stChars > 0 ? theme.success : symColor;

  // Display ID: right-aligned in 3-char column, with > prefix when selected
  const idStr = String(opts.displayId);
  const idPadded = opts.selected
    ? `>${idStr.padStart(2)}`
    : ` ${idStr.padStart(2)}`;

  const titleColor = opts.selected ? theme.selectedFg : theme.fg;

  // Priority indicator — uses priorityHigh (red) and priorityMedium (yellow)
  const priStr = task.priority === "high" ? " (!!) " : task.priority === "medium" ? " (!) " : " ";
  const priColor = task.priority === "high" ? theme.priorityHigh : task.priority === "medium" ? theme.priorityMedium : theme.muted;
  // Tags — uses fieldTag color (purple), consistent with #tag in add dialog
  const tagStr = task.tags?.length
    ? task.tags.map(tag => `#${tag}`).join(" ")
    : "";

  // Due date indicator
  const now = DateTime.now();
  const isOverdue = !isDone && task.due && DateTime.fromISO(task.due) < now.startOf("day");
  const dueStr = isOverdue ? " OVERDUE" : "";

  // Age
  const age = formatAge(task.created);

  // Assemble: id sym title priority tags due age
  const idPart = fg(opts.selected ? theme.selectedFg : theme.muted)(idPadded);
  const symPart = fg(displaySymColor)(displaySym);
  const priPart = fg(priColor)(priStr);
  const duePart = dueStr ? fg(theme.error)(dueStr + " ") : "";
  const agePart = fg(theme.muted)(age);

  // Build title part — partial strikethrough for animation, full for done, plain otherwise
  let content: any;
  if (stChars !== undefined && stChars >= 0) {
    const struckPart = fg(theme.muted)(strikethrough(task.title.slice(0, stChars)));
    const restPart = fg(titleColor)(task.title.slice(stChars));
    content = tagStr
      ? t`${idPart} ${symPart} ${struckPart}${restPart}${priPart}${fg(theme.fieldTag)(tagStr)} ${duePart}${agePart}`
      : t`${idPart} ${symPart} ${struckPart}${restPart}${priPart}${duePart}${agePart}`;
  } else {
    const titlePart = isDone
      ? fg(theme.muted)(strikethrough(task.title))
      : fg(titleColor)(task.title);
    content = tagStr
      ? t`${idPart} ${symPart} ${titlePart}${priPart}${fg(theme.fieldTag)(tagStr)} ${duePart}${agePart}`
      : t`${idPart} ${symPart} ${titlePart}${priPart}${duePart}${agePart}`;
  }

  row.add(
    new TextRenderable(renderer, {
      id: `task-text-${task.id}`,
      content,
      flexGrow: 1,
    })
  );

  return row;
}
