import { describe, it, expect } from "bun:test";
import { validateTask, createTaskDefaults } from "../../src/core/task.js";

describe("validateTask", () => {
  it("returns errors for missing id and title", () => {
    const errors = validateTask({});
    expect(errors).toContain("id is required");
    expect(errors).toContain("title is required");
  });

  it("returns empty array for valid task", () => {
    const errors = validateTask({ id: "abc", title: "test", status: "inbox", priority: "high" });
    expect(errors).toHaveLength(0);
  });

  it("rejects invalid status", () => {
    const errors = validateTask({ id: "abc", title: "test", status: "bogus" as any });
    expect(errors).toContain("invalid status: bogus");
  });

  it("rejects invalid priority", () => {
    const errors = validateTask({ id: "abc", title: "test", priority: "ultra" as any });
    expect(errors).toContain("invalid priority: ultra");
  });

  it("rejects invalid due date", () => {
    const errors = validateTask({ id: "abc", title: "test", due: "not-a-date" });
    expect(errors.some((e) => e.includes("invalid due date"))).toBe(true);
  });
});

describe("createTaskDefaults", () => {
  it("creates a task with defaults", () => {
    const task = createTaskDefaults("My task");
    expect(task.title).toBe("My task");
    expect(task.status).toBe("inbox");
    expect(task.priority).toBe("none");
    expect(task.id).toHaveLength(12);
    expect(task.created).toBeTruthy();
    expect(task.modified).toBeTruthy();
    expect(task.body).toBe("");
  });

  it("applies overrides", () => {
    const task = createTaskDefaults("My task", { priority: "high", area: "work" });
    expect(task.priority).toBe("high");
    expect(task.area).toBe("work");
  });
});
