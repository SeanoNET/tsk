import { describe, it, expect } from "bun:test";
import { parseTaskFile, serializeTask } from "../../src/core/markdown.js";
import type { Task } from "../../src/core/task.js";

describe("parseTaskFile", () => {
  it("parses frontmatter and body", () => {
    const content = `---
id: abc123456789
title: Test task
status: inbox
priority: high
created: "2026-03-16T12:00:00.000Z"
modified: "2026-03-16T12:00:00.000Z"
---

Some notes here.`;

    const task = parseTaskFile(content);
    expect(task.id).toBe("abc123456789");
    expect(task.title).toBe("Test task");
    expect(task.status).toBe("inbox");
    expect(task.priority).toBe("high");
    expect(task.body).toBe("Some notes here.");
  });

  it("handles date coercion from js-yaml", () => {
    // js-yaml will parse bare ISO dates as Date objects
    const content = `---
id: abc123456789
title: Date test
status: inbox
priority: none
created: 2026-03-16
modified: 2026-03-16
---
`;
    const task = parseTaskFile(content);
    // Should be string, not Date object
    expect(typeof task.created).toBe("string");
    expect(typeof task.modified).toBe("string");
  });
});

describe("serializeTask", () => {
  it("roundtrips correctly", () => {
    const task: Task = {
      id: "abc123456789",
      title: "Roundtrip test",
      status: "next",
      priority: "medium",
      created: "2026-03-16T12:00:00.000Z",
      modified: "2026-03-16T12:00:00.000Z",
      body: "Test body content.",
    };

    const serialized = serializeTask(task);
    const parsed = parseTaskFile(serialized);

    expect(parsed.id).toBe(task.id);
    expect(parsed.title).toBe(task.title);
    expect(parsed.status).toBe(task.status);
    expect(parsed.priority).toBe(task.priority);
    expect(parsed.body).toBe(task.body);
  });

  it("omits undefined fields", () => {
    const task: Task = {
      id: "abc123456789",
      title: "Minimal",
      status: "inbox",
      priority: "none",
      created: "2026-03-16T12:00:00.000Z",
      modified: "2026-03-16T12:00:00.000Z",
      body: "",
    };

    const serialized = serializeTask(task);
    expect(serialized).not.toContain("due:");
    expect(serialized).not.toContain("area:");
    expect(serialized).not.toContain("tags:");
  });
});
