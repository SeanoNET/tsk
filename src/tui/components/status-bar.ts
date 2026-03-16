import { BoxRenderable, TextRenderable, t, bold, fg, type RenderContext } from "@opentui/core";
import type { TskTheme } from "../theme.js";

export function createStatusBar(
  renderer: RenderContext,
  theme: TskTheme,
  opts: { screen: string; taskCount: number; hints?: string }
): BoxRenderable {
  const bar = new BoxRenderable(renderer, {
    id: "status-bar",
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: theme.headerBg,
    justifyContent: "space-between",
  });

  const left = new TextRenderable(renderer, {
    id: "status-left",
    content: t` ${bold(fg(theme.headerFg)("tsk"))} ${fg(theme.muted)("|")} ${fg(theme.fg)(opts.screen)} ${fg(theme.muted)(`(${opts.taskCount} tasks)`)}`,
  });

  const hints = opts.hints ?? "j/k:nav  d:done  a:add  u:undo  1:dash  2:list  q:quit";
  const right = new TextRenderable(renderer, {
    id: "status-right",
    content: t`${fg(theme.muted)(hints)} `,
  });

  bar.add(left);
  bar.add(right);
  return bar;
}
