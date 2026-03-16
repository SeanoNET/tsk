import { BoxRenderable, InputRenderable, TextRenderable, fg, type RenderContext } from "@opentui/core";
import type { TskTheme } from "../theme.js";

export interface FilterBarResult {
  container: BoxRenderable;
  input: InputRenderable; // mutable -- app.ts may replace this on each filter open
}

export function createFilterBar(
  renderer: RenderContext,
  theme: TskTheme,
  opts: { onSubmit: (value: string) => void }
): FilterBarResult {
  const container = new BoxRenderable(renderer, {
    id: "filter-bar",
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: theme.headerBg,
  });

  const label = new TextRenderable(renderer, {
    id: "filter-label",
    content: ` / `,
    fg: theme.accent,
  });

  const input = new InputRenderable(renderer, {
    id: "filter-input",
    placeholder: "filter: text, #tag, @status, !priority",
    backgroundColor: theme.headerBg,
    textColor: theme.fg,
    cursorColor: theme.accent,
    focusedBackgroundColor: theme.headerBg,
    flexGrow: 1,
    onKeyDown: (key) => {
      if (key.name === "return") {
        opts.onSubmit(input.value);
      }
    },
  });

  container.add(label);
  container.add(input);
  return { container, input };
}

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
