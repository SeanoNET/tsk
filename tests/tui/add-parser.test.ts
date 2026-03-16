import { describe, it, expect } from "bun:test";
import { parseAddInput } from "../../src/tui/add-parser.js";

describe("parseAddInput", () => {
  it("parses plain title", () => {
    const result = parseAddInput("Buy groceries");
    expect(result.title).toBe("Buy groceries");
    expect(result.overrides).toEqual({});
  });

  it("parses priority", () => {
    const result = parseAddInput("Fix bug !high");
    expect(result.title).toBe("Fix bug");
    expect(result.overrides.priority).toBe("high");
  });

  it("parses tags", () => {
    const result = parseAddInput("Deploy app #work #urgent");
    expect(result.title).toBe("Deploy app");
    expect(result.overrides.tags).toEqual(["work", "urgent"]);
  });

  it("parses status", () => {
    const result = parseAddInput("Review PR @next");
    expect(result.title).toBe("Review PR");
    expect(result.overrides.status).toBe("next");
  });

  it("parses due date (ISO enriched with work hours)", () => {
    const result = parseAddInput("Submit report due:2026-03-20");
    expect(result.title).toBe("Submit report");
    expect(result.overrides.due).toContain("2026-03-20");
    expect(result.overrides.due).toBeTruthy();
  });

  it("parses area and project", () => {
    const result = parseAddInput("Write tests area:work project:tsk");
    expect(result.title).toBe("Write tests");
    expect(result.overrides.area).toBe("work");
    expect(result.overrides.project).toBe("tsk");
  });

  it("parses all tokens together", () => {
    const result = parseAddInput("Big task !medium #dev @next due:2026-04-01 area:eng");
    expect(result.title).toBe("Big task");
    expect(result.overrides.priority).toBe("medium");
    expect(result.overrides.tags).toEqual(["dev"]);
    expect(result.overrides.status).toBe("next");
    expect(result.overrides.due).toContain("2026-04-01");
    expect(result.overrides.area).toBe("eng");
  });

  it("ignores invalid priority", () => {
    const result = parseAddInput("Task !ultra");
    expect(result.title).toBe("Task !ultra");
    expect(result.overrides.priority).toBeUndefined();
  });

  it("parses @tomorrow as due date shorthand", () => {
    const result = parseAddInput("Meeting @tomorrow");
    expect(result.title).toBe("Meeting");
    expect(result.overrides.due).toBeTruthy();
  });

  it("parses relative time due:4h", () => {
    const result = parseAddInput("Quick fix due:4h");
    expect(result.title).toBe("Quick fix");
    expect(result.overrides.due).toBeTruthy();
  });

  it("parses duration shorthand dur:2h", () => {
    const result = parseAddInput("Long task dur:2h");
    expect(result.title).toBe("Long task");
    expect(result.overrides.duration).toBe("PT2H");
  });

  it("parses dur:30m", () => {
    const result = parseAddInput("Short task dur:30m");
    expect(result.overrides.duration).toBe("PT30M");
  });
});
