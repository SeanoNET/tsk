import { DateTime } from "luxon";
import type { Database } from "bun:sqlite";
import { queryTasks } from "./db.js";
import type { WorkHours } from "./time-parser.js";
import { clampToWorkHours } from "./time-parser.js";

const DEFAULT_WORK: WorkHours = { start: 9, end: 17 };
const DEFAULT_TASK_MINUTES = 30;

interface TimeSlot {
  start: DateTime;
  end: DateTime;
}

/**
 * Find the next available time slot on a given day, clustering near existing tasks.
 * Looks at tasks already scheduled/due on that day and finds a gap.
 * Falls back to work-hours start if the day is empty.
 */
export function findNextSlot(
  db: Database,
  targetDate: DateTime,
  durationMinutes: number = DEFAULT_TASK_MINUTES,
  work: WorkHours = DEFAULT_WORK
): DateTime {
  const dayStart = targetDate.startOf("day");
  const dayEnd = dayStart.endOf("day");

  // Get all tasks on this day that have a due or scheduled time
  const allTasks = queryTasks(db).filter((t) => {
    if (t.status === "done" || t.status === "cancelled") return false;
    const dt = t.scheduled || t.due;
    if (!dt) return false;
    const parsed = DateTime.fromISO(dt);
    return parsed.isValid && parsed >= dayStart && parsed <= dayEnd;
  });

  if (allTasks.length === 0) {
    // Empty day -- start at work hours
    return dayStart.set({ hour: work.start, minute: 0, second: 0 });
  }

  // Build occupied slots (assume each task takes its duration or 30min default)
  const occupied: TimeSlot[] = allTasks
    .map((t) => {
      const start = DateTime.fromISO(t.scheduled || t.due!);
      const dur = parseDurationMinutes(t.duration) || DEFAULT_TASK_MINUTES;
      return { start, end: start.plus({ minutes: dur }) };
    })
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());

  // Find first gap during work hours
  const workStart = dayStart.set({ hour: work.start, minute: 0, second: 0 });
  const workEnd = dayStart.set({ hour: work.end, minute: 0, second: 0 });

  let cursor = workStart;

  for (const slot of occupied) {
    if (cursor.plus({ minutes: durationMinutes }) <= slot.start) {
      // Found a gap before this task
      return cursor;
    }
    // Move cursor past this task
    if (slot.end > cursor) {
      cursor = slot.end;
    }
  }

  // After all tasks -- check if there's still time before work end
  if (cursor.plus({ minutes: durationMinutes }) <= workEnd) {
    return cursor;
  }

  // Day is full -- cluster right after last task anyway
  return occupied[occupied.length - 1].end;
}

/**
 * Suggest a smart scheduled time for a new task.
 * If due date is set, schedule on that day in a gap.
 * If no due date, schedule today or tomorrow in a gap.
 */
export function suggestScheduledTime(
  db: Database,
  dueDate?: string,
  durationMinutes: number = DEFAULT_TASK_MINUTES,
  work: WorkHours = DEFAULT_WORK
): string {
  const now = DateTime.now();

  if (dueDate) {
    const due = DateTime.fromISO(dueDate);
    if (due.isValid) {
      return findNextSlot(db, due, durationMinutes, work).toISO()!;
    }
  }

  // No due date -- try today first
  const todaySlot = findNextSlot(db, now, durationMinutes, work);
  const workEnd = now.startOf("day").set({ hour: work.end, minute: 0 });

  if (todaySlot.plus({ minutes: durationMinutes }) <= workEnd && todaySlot >= now) {
    return clampToWorkHours(todaySlot, work).toISO()!;
  }

  // Today is full or past work hours -- try tomorrow
  const tomorrow = now.plus({ days: 1 });
  return findNextSlot(db, tomorrow, durationMinutes, work).toISO()!;
}

function parseDurationMinutes(duration?: string): number | null {
  if (!duration) return null;
  const hourMatch = duration.match(/(\d+)H/i);
  const minMatch = duration.match(/(\d+)M/i);
  let total = 0;
  if (hourMatch) total += parseInt(hourMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);
  return total > 0 ? total : null;
}
