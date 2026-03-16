import type { TaskFrontmatter, TaskPriority, TaskStatus } from "../core/task.js";
import { parseTime } from "../core/time-parser.js";

export interface ParsedAdd {
  title: string;
  overrides: Partial<TaskFrontmatter>;
}

const VALID_PRIORITIES = new Set(["high", "medium", "low", "none"]);
const VALID_STATUSES = new Set(["inbox", "next", "waiting", "someday"]);

/**
 * Parse inline add syntax:
 *   "Buy groceries !high #shopping @next due:tomorrow area:personal"
 *
 * Supported tokens:
 *   !priority      - high, medium, low, none
 *   #tag           - multiple allowed
 *   @status        - inbox, next, waiting, someday
 *   due:<time>     - due date (ISO, relative, or natural language)
 *   sched:<time>   - scheduled date
 *   area:<name>    - area of responsibility
 *   project:<name> - project
 *   dur:<duration> - duration (e.g. PT30M, PT1H, 30m, 1h)
 *
 * Time formats: ISO date, tomorrow, next week, 4h, 3d, 2w, next monday, etc.
 * Everything else becomes the title.
 */
export function parseAddInput(raw: string): ParsedAdd {
  const overrides: Partial<TaskFrontmatter> = {};
  const titleParts: string[] = [];
  const tags: string[] = [];

  // Handle multi-word time values by pre-processing "due:next week" style tokens
  // We need to handle "due:next week" as a single token
  const preprocessed = raw.trim()
    .replace(/\b(due|sched):(\w+)\s+(week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi,
      (_, prefix, word1, word2) => `${prefix}:${word1}_${word2}`);

  const parts = preprocessed.split(/\s+/);

  for (const part of parts) {
    if (part.startsWith("!") && VALID_PRIORITIES.has(part.slice(1).toLowerCase())) {
      overrides.priority = part.slice(1).toLowerCase() as TaskPriority;
    } else if (part.startsWith("#") && part.length > 1) {
      tags.push(part.slice(1));
    } else if (part.startsWith("@") && part.length > 1) {
      const val = part.slice(1).toLowerCase();
      if (VALID_STATUSES.has(val)) {
        overrides.status = val as TaskStatus;
      } else {
        // Try as a time shorthand: @tomorrow, @next_week, etc.
        const timeStr = val.replace(/_/g, " ");
        const parsed = parseTime(timeStr);
        if (parsed) {
          overrides.due = parsed;
        } else {
          titleParts.push(part);
        }
      }
    } else if (/^due:/i.test(part) && part.length > 4) {
      const timeStr = part.slice(4).replace(/_/g, " ");
      const parsed = parseTime(timeStr);
      if (parsed) overrides.due = parsed;
      else titleParts.push(part); // if unparseable, keep as title
    } else if (/^sched:/i.test(part) && part.length > 6) {
      const timeStr = part.slice(6).replace(/_/g, " ");
      const parsed = parseTime(timeStr);
      if (parsed) overrides.scheduled = parsed;
      else titleParts.push(part);
    } else if (/^area:/i.test(part) && part.length > 5) {
      overrides.area = part.slice(5);
    } else if (/^project:/i.test(part) && part.length > 8) {
      overrides.project = part.slice(8);
    } else if (/^dur:/i.test(part) && part.length > 4) {
      const durStr = part.slice(4);
      overrides.duration = normalizeDuration(durStr);
    } else {
      titleParts.push(part);
    }
  }

  if (tags.length > 0) overrides.tags = tags;

  return { title: titleParts.join(" "), overrides };
}

/** Convert shorthand durations (30m, 1h, 2h30m) to ISO 8601 duration */
function normalizeDuration(input: string): string {
  // Already ISO format
  if (input.startsWith("PT") || input.startsWith("P")) return input;

  const hourMatch = input.match(/(\d+)h/);
  const minMatch = input.match(/(\d+)m/);

  if (hourMatch || minMatch) {
    let iso = "PT";
    if (hourMatch) iso += `${hourMatch[1]}H`;
    if (minMatch) iso += `${minMatch[1]}M`;
    return iso;
  }

  // Assume minutes if bare number
  if (/^\d+$/.test(input)) return `PT${input}M`;

  return input;
}
