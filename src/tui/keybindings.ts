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
  | "sync_status"
  | "toggle_done"
  | "toggle_task_done"
  | "goto_top"
  | "goto_bottom"
  | "goto_line"
  | "page_down"
  | "page_up"
  | "half_page_down"
  | "half_page_up"
  | "escape";

export interface ActionResult {
  action: Action;
  count?: number;
}

/** Stateful vim motion resolver — handles number prefixes and multi-key sequences */
export function createKeyResolver() {
  let countBuf = "";
  let pendingG = false;

  function reset() {
    countBuf = "";
    pendingG = false;
  }

  function resolve(key: KeyEvent): ActionResult | null {
    // Ctrl+C always quits
    if (key.ctrl && key.name === "c") { reset(); return { action: "quit" }; }

    // Shift+P — command palette
    if (key.shift && key.name === "p") { reset(); return { action: "command" }; }

    // Ctrl+d / Ctrl+u — page movement
    if (key.ctrl && key.name === "d") { const c = consumeCount(); return { action: "half_page_down", count: c }; }
    if (key.ctrl && key.name === "u") { const c = consumeCount(); return { action: "half_page_up", count: c }; }
    if (key.ctrl && key.name === "f") { const c = consumeCount(); return { action: "page_down", count: c }; }
    if (key.ctrl && key.name === "b") { const c = consumeCount(); return { action: "page_up", count: c }; }

    // Accumulate digit prefix (0 only counts if we already have digits)
    if (!key.ctrl && !key.shift && key.name >= "0" && key.name <= "9") {
      if (key.name === "0" && countBuf === "") {
        // 0 without prefix is not a count — ignore
      } else {
        countBuf += key.name;
        pendingG = false;
        return null;
      }
    }

    // gg = goto top
    if (key.name === "g" && !key.shift) {
      if (pendingG) {
        // gg
        reset();
        return { action: "goto_top" };
      }
      pendingG = true;
      return null;
    }

    // {n}G = goto line, G = goto bottom
    if (key.name === "g" && key.shift) {
      pendingG = false;
      const c = consumeCount();
      if (c !== undefined) {
        return { action: "goto_line", count: c };
      }
      return { action: "goto_bottom" };
    }

    // Any other key after pending g — discard the g and process normally
    if (pendingG) {
      pendingG = false;
      countBuf = "";
    }

    const count = consumeCount();

    // Navigation with optional count
    if (key.name === "j" || key.name === "down") return { action: "navigate_down", count };
    if (key.name === "k" || key.name === "up") return { action: "navigate_up", count };

    // Actions — check shift variants first
    if (key.name === "q") return { action: "quit" };
    if (key.name === "return") return { action: "select" };
    if (key.name === "t") return { action: "add_task" };
    if (key.name === "s" && key.shift) return { action: "sync_status" };
    if (key.name === "d" && key.shift) return { action: "toggle_done" };
    if (key.name === "d") return { action: "mark_done" };
    if (key.name === "space") return { action: "toggle_task_done" };
    if (key.name === "x") return { action: "delete_task" };
    if (key.name === "e") return { action: "edit_task" };
    if (key.name === "u" && key.shift) return { action: "redo" };
    if (key.name === "u") return { action: "undo" };
    // / removed — use Shift+P for command palette
    if (key.name === "?") return { action: "help" };
    if (key.name === "escape") { reset(); return { action: "escape" }; }

    // Section cycling
    if (key.name === "tab") return { action: key.shift ? "prev_section" : "next_section" };

    reset();
    return null;
  }

  function consumeCount(): number | undefined {
    if (countBuf === "") return undefined;
    const n = parseInt(countBuf, 10);
    countBuf = "";
    return n;
  }

  return { resolve };
}
