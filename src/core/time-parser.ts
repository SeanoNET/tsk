import { DateTime } from "luxon";

export interface WorkHours {
  start: number; // hour (0-23), default 9
  end: number; // hour (0-23), default 17
}

const DEFAULT_WORK_HOURS: WorkHours = { start: 9, end: 17 };

/** Clamp a datetime to work hours -- if outside, move to next work-hour start */
export function clampToWorkHours(dt: DateTime, work: WorkHours = DEFAULT_WORK_HOURS): DateTime {
  const hour = dt.hour;
  if (hour < work.start) {
    return dt.set({ hour: work.start, minute: 0, second: 0, millisecond: 0 });
  }
  if (hour >= work.end) {
    // Move to next day's start
    return dt.plus({ days: 1 }).set({ hour: work.start, minute: 0, second: 0, millisecond: 0 });
  }
  return dt;
}

/** Move to next weekday if on a weekend */
function skipWeekend(dt: DateTime): DateTime {
  // weekday: 1=Monday ... 7=Sunday
  if (dt.weekday === 6) return dt.plus({ days: 2 }); // Saturday -> Monday
  if (dt.weekday === 7) return dt.plus({ days: 1 }); // Sunday -> Monday
  return dt;
}

/** Get next occurrence of a weekday (1=Monday ... 7=Sunday) */
function nextWeekday(from: DateTime, targetDay: number): DateTime {
  let dt = from.plus({ days: 1 });
  while (dt.weekday !== targetDay) {
    dt = dt.plus({ days: 1 });
  }
  return dt;
}

const WEEKDAY_MAP: Record<string, number> = {
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 7, sun: 7,
};

/**
 * Parse a relative or natural-language time string into an ISO datetime.
 *
 * Supported formats:
 *   - ISO date/datetime: "2026-03-20", "2026-03-20T14:00"
 *   - Relative short: "4h", "3d", "2w", "30m"
 *   - Relative long: "4 hours", "3 days", "2 weeks", "30 minutes"
 *   - Named: "now", "today", "tomorrow", "tonight", "eod" (end of day)
 *   - Next: "next week", "next monday", "next month"
 *   - Weekday: "monday", "tuesday", etc. (next occurrence)
 *   - "in X hours/days/weeks"
 *
 * Returns ISO string or null if unparseable.
 */
export function parseTime(
  input: string,
  work: WorkHours = DEFAULT_WORK_HOURS
): string | null {
  const raw = input.trim().toLowerCase();
  const now = DateTime.now();

  // Try ISO date/datetime first
  const isoDate = DateTime.fromISO(input.trim());
  if (isoDate.isValid) {
    // If just a date (no time component), set to work start
    if (!input.includes("T")) {
      return skipWeekend(isoDate.set({ hour: work.start, minute: 0, second: 0 })).toISO()!;
    }
    return isoDate.toISO()!;
  }

  // Named times
  switch (raw) {
    case "now":
      return now.toISO()!;
    case "today":
      return clampToWorkHours(now, work).toISO()!;
    case "tonight":
      return now.set({ hour: work.end, minute: 0, second: 0 }).toISO()!;
    case "eod":
    case "end of day":
      return now.set({ hour: work.end, minute: 0, second: 0 }).toISO()!;
    case "tomorrow":
      return skipWeekend(now.plus({ days: 1 })).set({ hour: work.start, minute: 0, second: 0 }).toISO()!;
    case "next week": {
      const monday = nextWeekday(now, 1);
      return monday.set({ hour: work.start, minute: 0, second: 0 }).toISO()!;
    }
    case "next month":
      return skipWeekend(now.plus({ months: 1 }).startOf("month"))
        .set({ hour: work.start, minute: 0, second: 0 }).toISO()!;
  }

  // "next <weekday>"
  const nextMatch = raw.match(/^next\s+(\w+)$/);
  if (nextMatch) {
    const day = WEEKDAY_MAP[nextMatch[1]];
    if (day) {
      return nextWeekday(now, day).set({ hour: work.start, minute: 0, second: 0 }).toISO()!;
    }
  }

  // Bare weekday name: "monday", "friday" etc.
  if (WEEKDAY_MAP[raw]) {
    return nextWeekday(now, WEEKDAY_MAP[raw]).set({ hour: work.start, minute: 0, second: 0 }).toISO()!;
  }

  // "in X <unit>" pattern
  const inMatch = raw.match(/^in\s+(\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wk|wks|weeks?)$/);
  if (inMatch) {
    return applyDuration(now, parseInt(inMatch[1]), inMatch[2], work);
  }

  // Short form: "4h", "3d", "2w", "30m"
  const shortMatch = raw.match(/^(\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wk|wks|weeks?)$/);
  if (shortMatch) {
    return applyDuration(now, parseInt(shortMatch[1]), shortMatch[2], work);
  }

  return null;
}

function applyDuration(
  from: DateTime,
  amount: number,
  unit: string,
  work: WorkHours
): string {
  const u = unit.charAt(0);
  let result: DateTime;

  switch (u) {
    case "m":
      result = from.plus({ minutes: amount });
      return result.toISO()!;
    case "h":
      result = from.plus({ hours: amount });
      return result.toISO()!;
    case "d":
      result = from.plus({ days: amount });
      result = skipWeekend(result);
      return result.set({ hour: work.start, minute: 0, second: 0 }).toISO()!;
    case "w":
      result = from.plus({ weeks: amount });
      result = skipWeekend(result);
      return result.set({ hour: work.start, minute: 0, second: 0 }).toISO()!;
    default:
      return clampToWorkHours(from, work).toISO()!;
  }
}
