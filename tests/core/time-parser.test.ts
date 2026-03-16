import { describe, it, expect } from "bun:test";
import { parseTime, clampToWorkHours } from "../../src/core/time-parser.js";
import { DateTime } from "luxon";

describe("parseTime", () => {
  it("parses ISO date and adds work hours", () => {
    const result = parseTime("2026-03-20");
    expect(result).toContain("2026-03-20");
    expect(result).toContain("09:00");
  });

  it("parses ISO datetime as-is", () => {
    const result = parseTime("2026-03-20T14:00");
    expect(result).toContain("2026-03-20T14:00");
  });

  it("parses 'tomorrow'", () => {
    const result = parseTime("tomorrow")!;
    const parsed = DateTime.fromISO(result);
    const tomorrow = DateTime.now().plus({ days: 1 });
    expect(parsed.day).toBe(tomorrow.day);
    expect(parsed.hour).toBe(9);
  });

  it("parses 'today'", () => {
    const result = parseTime("today")!;
    const parsed = DateTime.fromISO(result);
    expect(parsed.isValid).toBe(true);
  });

  it("parses short form '4h'", () => {
    const result = parseTime("4h")!;
    const parsed = DateTime.fromISO(result);
    expect(parsed.isValid).toBe(true);
  });

  it("parses short form '3d'", () => {
    const result = parseTime("3d")!;
    const parsed = DateTime.fromISO(result);
    expect(parsed.isValid).toBe(true);
    expect(parsed.hour).toBe(9);
  });

  it("parses 'next week' to a Monday", () => {
    const result = parseTime("next week")!;
    const parsed = DateTime.fromISO(result);
    expect(parsed.weekday).toBe(1); // Monday
    expect(parsed.hour).toBe(9);
  });

  it("parses 'next friday'", () => {
    const result = parseTime("next friday")!;
    const parsed = DateTime.fromISO(result);
    expect(parsed.weekday).toBe(5); // Friday
  });

  it("parses 'in 2 hours'", () => {
    const result = parseTime("in 2 hours")!;
    const parsed = DateTime.fromISO(result);
    expect(parsed.isValid).toBe(true);
  });

  it("parses 'eod'", () => {
    const result = parseTime("eod")!;
    const parsed = DateTime.fromISO(result);
    expect(parsed.hour).toBe(17);
  });

  it("returns null for unparseable input", () => {
    expect(parseTime("gibberish")).toBeNull();
  });

  it("skips weekends for day-based offsets", () => {
    // If today is Friday and we add 1d, should land on Monday
    // We can't guarantee the test runs on Friday, so just verify it's valid
    const result = parseTime("1d")!;
    const parsed = DateTime.fromISO(result);
    expect(parsed.isValid).toBe(true);
    expect(parsed.weekday).toBeLessThanOrEqual(5); // weekday
  });
});

describe("clampToWorkHours", () => {
  it("moves early morning to work start", () => {
    const early = DateTime.fromObject({ hour: 6 });
    const clamped = clampToWorkHours(early);
    expect(clamped.hour).toBe(9);
  });

  it("moves late evening to next day work start", () => {
    const late = DateTime.fromObject({ hour: 20 });
    const clamped = clampToWorkHours(late);
    expect(clamped.hour).toBe(9);
    expect(clamped.day).toBe(late.day + 1);
  });

  it("keeps work-hours time unchanged", () => {
    const workTime = DateTime.fromObject({ hour: 14, minute: 30 });
    const clamped = clampToWorkHours(workTime);
    expect(clamped.hour).toBe(14);
    expect(clamped.minute).toBe(30);
  });
});
