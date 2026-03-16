import { describe, it, expect } from "bun:test";
import { generateId } from "../../src/core/id.js";

describe("generateId", () => {
  it("returns a 12-character string", () => {
    const id = generateId();
    expect(id).toHaveLength(12);
  });

  it("returns unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it("contains only URL-safe characters", () => {
    const id = generateId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
