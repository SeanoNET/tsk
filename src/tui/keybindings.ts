import type { KeyEvent } from "@opentui/core";

export type Action =
  | "quit"
  | "navigate_up"
  | "navigate_down"
  | "select"
  | "add_task"
  | "mark_done"
  | "delete_task"
  | "edit_task"
  | "undo"
  | "redo"
  | "command"
  | "help"
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

  // Actions
  if (key.name === "return") return "select";
  if (key.name === "t") return "add_task";
  if (key.name === "d") return "mark_done";
  if (key.name === "x") return "delete_task";
  if (key.name === "e") return "edit_task";
  if (key.name === "u" && key.shift) return "redo";
  if (key.name === "u") return "undo";
  if (key.name === "/") return "command";
  if (key.name === "?") return "help";
  if (key.name === "escape") return "escape";

  // Section cycling
  if (key.name === "tab") return key.shift ? "prev_section" : "next_section";

  return null;
}
