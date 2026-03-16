import type { KeyEvent } from "@opentui/core";

export type Action =
  | "quit"
  | "navigate_up"
  | "navigate_down"
  | "navigate_left"
  | "navigate_right"
  | "select"
  | "add_task"
  | "mark_done"
  | "delete_task"
  | "edit_task"
  | "filter"
  | "screen_dashboard"
  | "screen_list"
  | "next_section"
  | "prev_section"
  | "escape";

export function resolveAction(key: KeyEvent): Action | null {
  // Ctrl+C / q to quit
  if (key.ctrl && key.name === "c") return "quit";
  if (key.name === "q") return "quit";

  // Navigation
  if (key.name === "j" || key.name === "down") return "navigate_down";
  if (key.name === "k" || key.name === "up") return "navigate_up";
  if (key.name === "h" || key.name === "left") return "navigate_left";
  if (key.name === "l" || key.name === "right") return "navigate_right";

  // Actions
  if (key.name === "return") return "select";
  if (key.name === "a") return "add_task";
  if (key.name === "d") return "mark_done";
  if (key.name === "x") return "delete_task";
  if (key.name === "e") return "edit_task";
  if (key.name === "/") return "filter";
  if (key.name === "escape") return "escape";

  // Screen switching
  if (key.name === "1") return "screen_dashboard";
  if (key.name === "2") return "screen_list";

  // Section cycling
  if (key.name === "tab") return key.shift ? "prev_section" : "next_section";

  return null;
}
