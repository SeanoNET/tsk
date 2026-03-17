import { BoxRenderable, TextRenderable, t, fg, type RenderContext } from "@opentui/core";
import type { TskTheme } from "../theme.js";

export interface ParsedFilter {
  text?: string;
  tag?: string;
  status?: string;
  priority?: string;
}

export function parseFilterString(raw: string): ParsedFilter {
  const filter: ParsedFilter = {};
  const parts = raw.trim().split(/\s+/);
  const textParts: string[] = [];

  for (const part of parts) {
    if (part.startsWith("#")) {
      filter.tag = part.slice(1);
    } else if (part.startsWith("@")) {
      filter.status = part.slice(1);
    } else if (part.startsWith("!")) {
      filter.priority = part.slice(1);
    } else {
      textParts.push(part);
    }
  }

  if (textParts.length > 0) {
    filter.text = textParts.join(" ");
  }
  return filter;
}

export type CommandResult =
  | { type: "done" }
  | { type: "delete" }
  | { type: "edit" }
  | { type: "filter"; text: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "quit" }
  | { type: "help" }
  | { type: "unknown"; raw: string };

export function parseCommand(raw: string): CommandResult {
  const trimmed = raw.trim();
  const cmd = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const parts = cmd.split(/\s+/);
  const name = parts[0]?.toLowerCase() ?? "";
  const rest = parts.slice(1).join(" ");

  switch (name) {
    case "done":
    case "d":
      return { type: "done" };
    case "delete":
    case "x":
      return { type: "delete" };
    case "edit":
    case "e":
      return { type: "edit" };
    case "filter":
    case "f":
      return { type: "filter", text: rest };
    case "undo":
    case "u":
      return { type: "undo" };
    case "redo":
      return { type: "redo" };
    case "quit":
    case "q":
      return { type: "quit" };
    case "help":
    case "?":
      return { type: "help" };
    default:
      return { type: "unknown", raw: trimmed };
  }
}

export interface CommandBarResult {
  container: BoxRenderable;
}

export function createCommandBar(
  renderer: RenderContext,
  theme: TskTheme
): CommandBarResult {
  const container = new BoxRenderable(renderer, {
    id: "command-bar",
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: theme.bg,
  });

  const prompt = new TextRenderable(renderer, {
    id: "command-prompt",
    content: t`${fg(theme.accent)(">")} ${fg(theme.muted)("Type / or Tab for commands, ? for help")}`,
    flexGrow: 1,
  });

  container.add(prompt);
  return { container };
}
