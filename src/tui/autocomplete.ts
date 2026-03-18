import type { Database } from "bun:sqlite";
import { queryTasks } from "../core/db.js";
import type { TaskPriority, TaskStatus } from "../core/task.js";

export interface Suggestion {
  token: string; // what to insert (e.g. "#work")
  label: string; // display text (e.g. "#work (3 tasks)")
}

const PRIORITIES: TaskPriority[] = ["high", "medium", "low", "none"];
const STATUSES: TaskStatus[] = ["inbox", "next", "waiting", "someday"];
const TIME_HINTS = ["today", "tomorrow", "next week", "next monday", "2h", "4h", "1d", "3d", "1w"];

/**
 * Get autocomplete suggestions based on the current word being typed.
 * Returns up to 5 suggestions.
 */
export function getSuggestions(db: Database, currentWord: string): Suggestion[] {
  if (!currentWord) return getHints();

  const lower = currentWord.toLowerCase();

  // Priority suggestions
  if (lower.startsWith("!")) {
    const prefix = lower.slice(1);
    return PRIORITIES
      .filter((p) => p.startsWith(prefix))
      .map((p) => ({ token: `!${p}`, label: `!${p}` }));
  }

  // Status suggestions
  if (lower.startsWith("@")) {
    const prefix = lower.slice(1);
    return STATUSES
      .filter((s) => s.startsWith(prefix))
      .map((s) => ({ token: `@${s}`, label: `@${s}` }));
  }

  // Tag suggestions from existing tasks
  if (lower.startsWith("#")) {
    const prefix = lower.slice(1);
    const existing = getExistingTags(db);
    return existing
      .filter((t) => t.name.toLowerCase().startsWith(prefix))
      .slice(0, 5)
      .map((t) => ({ token: `#${t.name}`, label: `#${t.name} (${t.count})` }));
  }

  // Due date suggestions
  if (lower.startsWith("due:")) {
    const prefix = lower.slice(4);
    return TIME_HINTS
      .filter((h) => h.startsWith(prefix))
      .slice(0, 5)
      .map((h) => ({ token: `due:${h}`, label: `due:${h}` }));
  }

  // Scheduled suggestions
  if (lower.startsWith("sched:")) {
    const prefix = lower.slice(6);
    return TIME_HINTS
      .filter((h) => h.startsWith(prefix))
      .slice(0, 5)
      .map((h) => ({ token: `sched:${h}`, label: `sched:${h}` }));
  }

  // Area suggestions
  if (lower.startsWith("area:")) {
    const prefix = lower.slice(5);
    const existing = getExistingAreas(db);
    return existing
      .filter((a) => a.toLowerCase().startsWith(prefix))
      .slice(0, 5)
      .map((a) => ({ token: `area:${a}`, label: `area:${a}` }));
  }

  // Project suggestions
  if (lower.startsWith("project:") || lower.startsWith("proj:")) {
    const prefix = lower.startsWith("project:") ? lower.slice(8) : lower.slice(5);
    const short = lower.startsWith("proj:");
    const existing = getExistingProjects(db);
    return existing
      .filter((p) => p.toLowerCase().startsWith(prefix))
      .slice(0, 5)
      .map((p) => ({ token: `${short ? "proj" : "project"}:${p}`, label: `proj:${p}` }));
  }

  // Duration suggestions
  if (lower.startsWith("dur:")) {
    return [
      { token: "dur:15m", label: "dur:15m" },
      { token: "dur:30m", label: "dur:30m" },
      { token: "dur:1h", label: "dur:1h" },
      { token: "dur:2h", label: "dur:2h" },
      { token: "dur:4h", label: "dur:4h" },
    ];
  }

  // No contextual match — show the default hints so they stay visible
  return getHints();
}

/** Show token suggestions when between words */
function getHints(): Suggestion[] {
  return [
    { token: "!high", label: "\x1b[31m!pri\x1b[0m\x1b[2m" },
    { token: "#", label: "\x1b[36m#tag\x1b[0m\x1b[2m" },
    { token: "@next", label: "\x1b[33m@status\x1b[0m\x1b[2m" },
    { token: "due:", label: "\x1b[35mdue:date\x1b[0m\x1b[2m" },
    { token: "area:", label: "\x1b[34marea:\x1b[0m\x1b[2m" },
    { token: "project:", label: "\x1b[34mproj:\x1b[0m\x1b[2m" },
    { token: "dur:", label: "\x1b[34mdur:\x1b[0m\x1b[2m" },
  ];
}

interface TagCount {
  name: string;
  count: number;
}

function getExistingTags(db: Database): TagCount[] {
  const tasks = queryTasks(db);
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.tags) {
      for (const tag of task.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function getExistingAreas(db: Database): string[] {
  const tasks = queryTasks(db);
  const areas = new Set<string>();
  for (const task of tasks) {
    if (task.area) areas.add(task.area);
  }
  return Array.from(areas).sort();
}

function getExistingProjects(db: Database): string[] {
  const tasks = queryTasks(db);
  const projects = new Set<string>();
  for (const task of tasks) {
    if (task.project) projects.add(task.project);
  }
  return Array.from(projects).sort();
}
