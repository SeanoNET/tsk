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

function formatDue(due?: string): string {
  if (!due) return "";

  const dueDt = DateTime.fromISO(due);
  if (!dueDt.isValid) return "";

  const now = DateTime.now();
  if (dueDt < now.startOf("day")) return "overdue";
  if (dueDt.hasSame(now, "day")) return "today";
  if (dueDt.hasSame(now.plus({ days: 1 }), "day")) return "tomorrow";
  if (dueDt.year === now.year) return dueDt.toFormat("d LLL");
  return dueDt.toFormat("d LLL yyyy");
}

function truncateText(value: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength === 1) return "…";
  return `${value.slice(0, maxLength - 1)}…`;
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

  const priorityLabel = task.priority !== "none" ? `!${task.priority}` : "";
  const tagLabel = task.tags?.length ? task.tags.map(tag => `#${tag}`).join(" ") : "";
  const dueLabel = !isDone ? formatDue(task.due) : "";
  const age = formatAge(task.created);

  const metadataParts = [priorityLabel, tagLabel, dueLabel, age].filter(Boolean);
  const metadataText = metadataParts.join("  ");
  const terminalWidth = process.stdout.columns ?? 80;
  const prefixWidth = 6; // "  1 □ "
  const suffixWidth = metadataText ? metadataText.length + 2 : age.length;
  const titleMax = Math.max(12, terminalWidth - prefixWidth - suffixWidth);
  const titleText = truncateText(task.title, titleMax);

  const idPart = fg(opts.selected ? theme.selectedFg : theme.muted)(idPadded);
  const symPart = fg(displaySymColor)(displaySym);
  const titlePartBase = isDone
    ? fg(theme.muted)(strikethrough(titleText))
    : fg(titleColor)(titleText);
  const priPart = priorityLabel
    ? fg(
      task.priority === "high"
        ? theme.priorityHigh
        : task.priority === "medium"
          ? theme.priorityMedium
          : theme.priorityLow
    )(`  ${priorityLabel}`)
    : "";
  const tagPart = tagLabel ? fg(theme.fieldTag)(`  ${tagLabel}`) : "";
  const duePart = dueLabel
    ? fg(dueLabel === "overdue" ? theme.error : theme.fieldDue)(`  ${dueLabel}`)
    : "";
  const agePart = fg(theme.muted)(`  ${age}`);

  let content: any;
  if (stChars !== undefined && stChars >= 0) {
    const animatedTitle = truncateText(task.title, titleMax);
    const struckPart = fg(theme.muted)(strikethrough(animatedTitle.slice(0, stChars)));
    const restPart = fg(titleColor)(animatedTitle.slice(stChars));
    content = t`${idPart} ${symPart} ${struckPart}${restPart}${priPart}${tagPart}${duePart}${agePart}`;
  } else {
    content = t`${idPart} ${symPart} ${titlePartBase}${priPart}${tagPart}${duePart}${agePart}`;
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
