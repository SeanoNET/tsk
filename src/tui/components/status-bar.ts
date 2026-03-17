import { BoxRenderable, TextRenderable, t, bold, fg, type RenderContext } from "@opentui/core";
import type { TskTheme } from "../theme.js";

export interface BoardStats {
  total: number;
  done: number;
  inProgress: number;
  pending: number;
}

export function createStatusBar(
  renderer: RenderContext,
  theme: TskTheme,
  stats: BoardStats
): BoxRenderable {
  const bar = new BoxRenderable(renderer, {
    id: "status-bar",
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: theme.headerBg,
    justifyContent: "space-between",
  });

  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const left = new TextRenderable(renderer, {
    id: "status-left",
    content: t`${fg(theme.success)(`${pct}% done`)} ${fg(theme.muted)("|")} ${fg(theme.success)(`${stats.done} done`)} ${fg(theme.muted)("\u00B7")} ${fg(theme.accent)(`${stats.inProgress} in-progress`)} ${fg(theme.muted)("\u00B7")} ${fg(theme.warning)(`${stats.pending} pending`)}`,
  });

  const right = new TextRenderable(renderer, {
    id: "status-right",
    content: t`${bold(fg(theme.fg)("?"))} ${fg(theme.muted)("Help")} ${fg(theme.muted)("|")} ${bold(fg(theme.fg)("/"))} ${fg(theme.muted)("Command")} ${fg(theme.muted)("|")} ${bold(fg(theme.fg)("t"))} ${fg(theme.muted)("Task")} `,
  });

  bar.add(left);
  bar.add(right);
  return bar;
}
