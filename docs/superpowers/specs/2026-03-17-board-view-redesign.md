# Board View TUI Redesign

## Overview

Replace the existing dual-screen TUI (dashboard + list) with a single board view inspired by taskbook. Tasks are grouped by `area` field, displayed with rich status indicators, completion counts, and a command bar at the bottom. Also fix the crash when `tsk` is not initialized by auto-initializing.

## Layout

Top to bottom:

```
tsk  Board View                                          <- header (bold "tsk" in headerFg, "Board View" in muted)
                                                         <- blank line
  @Bugs [0/2]                                            <- area group header
  8  □ Fix memory leak in WebSocket handler (!!)  2d     <- pending task
  9  □ Resolve incorrect date formatting (!)  1d         <- pending task
                                                         <- blank line
  @Design [2/3]                                          <- area group header
  5  ✔ Design landing page mockups (!) 1d                <- done (strikethrough)
  6  ✔ Create color palette guide 1d                     <- done (strikethrough)
  7  … Implement dark mode theme (!) 1d                  <- in-progress
                                                         <- blank line
  @Development [1/5]                                     <- area group header
  1  ✔ Set up CI/CD pipeline (!!) 2d                     <- done (strikethrough)
  2  … Write integration tests (!) 2d                    <- in-progress
 >3  □ Refactor auth middleware (!!) 2d                   <- pending (selected/highlighted)
  ...
                                                         <- spacer (flexGrow)
> Type / or Tab for commands, ? for help                 <- command input
33% done | 4 done · 3 in-progress · 5 pending   ? Help | / Command | t Task
```

## Header

Rendered as a single row with `headerBg` background:
- `tsk` in bold, `headerFg` color
- `Board View` in `muted` color (changes to `Board View (filtered: ...)` when a filter is active)

## Task Row Format

```
{display_id}  {status_sym}  {title}  {priority}  {tags}  {age}
```

### Display ID

A sequential display index (1, 2, 3...) assigned per-render based on the task's position in the flat list. This is a display-only number — not the task's actual nanoid. Right-aligned in a fixed-width column. When selected, prefixed with `>` replacing the leading space.

### Status Symbols and Display

| Task Status | Symbol | Title Style | Stats Category |
|------------|--------|-------------|----------------|
| `next` | `…` | normal | in-progress |
| `inbox` | `□` | normal | pending |
| `waiting` | `□` | normal | pending |
| `someday` | `□` | normal | pending |
| `done` | `✔` | strikethrough | done |
| `cancelled` | `✘` | strikethrough | excluded from display |

Cancelled tasks are **hidden** from the board entirely.

### Priority Indicators

This is a deliberate change from the existing `!!!`/`!!`/`!` format to match the taskbook style.

| Priority | Display |
|----------|---------|
| `high` | `(!!)` in `priorityHigh` (red) |
| `medium` | `(!)` in `priorityMedium` (yellow) |
| `low` | nothing |
| `none` | nothing |

### Due Date

Due dates are **not shown** in the task row. The age field provides temporal context. Due dates remain visible in the task detail overlay (Enter key).

### Age Display

Time since task was created, calculated using `luxon` (already a project dependency via `DateTime.fromISO`).

- `< 1 hour` → `<1h`
- `1-23 hours` → `Nh`
- `1-6 days` → `Nd`
- `1-4 weeks` → `Nw`
- `> 4 weeks` → `Nmo`

Displayed in `muted` color.

### Tags

Displayed inline after title, before age. Each tag shown as the tag text in `warning` theme color.

### Selected Row

The currently selected task row gets:
- `>` prefix before the display ID (replacing leading space)
- `selectedBg` background highlight
- `selectedFg` text color for title

## Area Group Headers

Format: `@{AreaName} [{done_count}/{total_count}]`

- `@` and area name styled with `accent` color, bold
- `[done/total]` in `muted` color — counts include done tasks in total, done_count is tasks with `status === "done"` within that area
- Tasks with no `area` field grouped under `@Uncategorized`
- Areas with 0 non-cancelled tasks are hidden
- Areas sorted alphabetically, `@Uncategorized` last

## Task Query and Visibility

The board queries all tasks and excludes only `cancelled` tasks. Both pending and done tasks are shown together under their area groups. Done tasks appear with a `✔` and strikethrough title.

### Sort Order Within Areas

Tasks within each area are sorted by:
1. Status priority: pending (`inbox`/`waiting`/`someday`) first, then `next` (in-progress), then `done`
2. Within same status: by `priority` (high → medium → low → none)
3. Within same priority: by `created` ascending (oldest first)

### Filter Behavior

When a `/filter` command is active, only matching tasks are shown. Area groups with no matching tasks are hidden. The header updates to show `Board View (filtered: {text})`. Pressing `Escape` clears the filter.

## Empty State

When there are zero tasks (e.g., fresh init), the board content area shows:

```
  No tasks yet. Press t to add your first task.
```

Displayed in `muted` color, centered in the content area.

## Scrolling

No scrolling implemented in this version. Tasks that overflow the terminal height are simply not rendered. This matches the existing behavior. Future improvement.

## Command Bar

A persistent input at the bottom of the screen, above the status bar. Two states:

### Inactive State
Displays: `> Type / or Tab for commands, ? for help`
- `>` in `accent` color
- Placeholder text in `muted` color

### Active State (focused)
User types commands. Supports:

- **`/done`** or **`/d`** — mark selected task done
- **`/delete`** or **`/x`** — delete selected task
- **`/edit`** or **`/e`** — open selected task in editor (note: this exits the TUI due to renderer limitation — same as current behavior, displays "Task edited. Run `tsk ui` to relaunch.")
- **`/filter {text}`** or **`/f {text}`** — filter tasks using existing `parseFilterString` logic from `filter-bar.ts`: `#tag @status !priority text`
- **`/undo`** or **`/u`** — undo last action
- **`/redo`** — redo
- **`/quit`** or **`/q`** — quit
- **`/help`** or **`/?`** — show help overlay

Unknown commands show a brief error flash in the command bar area.

### Activation
- Pressing `/` focuses the command bar with `/` pre-filled
- Pressing `?` is detected as key `name: "?"` (distinct from `/` which is `name: "/"` — these are different characters). It focuses the command bar with `/help` pre-filled.
- Pressing `t` opens the add-task input (reuses existing add bar with autocomplete, tab-complete, full add-parser syntax)
- Pressing `Escape` while command bar is focused returns to task navigation without executing

## Keyboard Shortcuts (Navigation Mode)

These work when the command bar is NOT focused:

| Key | Action |
|-----|--------|
| `j` / `↓` | Navigate down |
| `k` / `↑` | Navigate up |
| `Tab` | Next area group |
| `Shift+Tab` | Previous area group |
| `t` | Open add-task bar (replaces `a` — `a` is removed) |
| `/` | Focus command bar |
| `?` | Show help (via command bar) |
| `d` | Mark done |
| `x` | Delete task |
| `e` | Edit in editor |
| `u` | Undo |
| `U` (Shift+u) | Redo |
| `Enter` | Show task detail overlay |
| `q` / `Ctrl+C` | Quit |

The `a` key binding for add-task is **removed** — replaced by `t` to match the taskbook convention shown in the status bar hints.

## Status Bar

Bottom line showing aggregate stats and shortcut hints.

Format:
```
{pct}% done | {done} done · {in_progress} in-progress · {pending} pending   ? Help | / Command | t Task
```

- Percentage in `success` color
- `done` count in `success` color
- `in-progress` count in `accent` color
- `pending` count in `warning` color
- Shortcut key letters in bold, labels in `muted`
- Stats exclude cancelled tasks

## Auto-Init Fix

When `tsk ui` is run and `~/.tsk` doesn't exist:
1. Automatically run `initTsk()` (same as `tsk init`)
2. If `initTsk()` throws (e.g., git not installed), catch the error and print a user-friendly message: `"Could not auto-initialize tsk: {error.message}\nRun 'tsk init' manually to set up."` then exit with code 1.
3. On success, continue to launch the TUI with empty state.

Implementation: modify `ensureInitialized()` in `src/core/ensure.ts` to try `initTsk()` instead of throwing when config is missing. The error handling for `initTsk()` failures stays in `ensureInitialized()`.

## File Changes

### Remove
- `src/tui/screens/dashboard.ts` — replaced by board.ts
- `src/tui/screens/list.ts` — replaced by board.ts
- `src/tui/components/filter-bar.ts` — filter logic (`parseFilterString`) moves into board.ts or command-bar.ts; the FilterBar UI component is no longer needed

### Create
- `src/tui/screens/board.ts` — main board view with area grouping, task rendering, navigation
- `src/tui/components/command-bar.ts` — command input component with command parsing and execution

### Modify
- `src/tui/app.ts` — remove multi-screen logic, wire single board view + command bar + add-task bar
- `src/tui/components/task-row.ts` — new format (display ID, status sym, priority indicator, age, strikethrough, tags)
- `src/tui/components/status-bar.ts` — new stats format with counts and shortcut hints
- `src/tui/keybindings.ts` — remove `a` binding, add `t` for add_task, add `?` for help, add `command` action type
- `src/core/ensure.ts` — auto-init instead of throwing

### Keep Unchanged
- `src/tui/theme.ts` — existing theme works well
- `src/tui/undo.ts` — undo/redo system unchanged
- `src/tui/autocomplete.ts` — reused in add-task bar
- `src/tui/add-parser.ts` — reused in add-task bar
- `src/tui/tab-complete.ts` — reused in add-task bar
- `src/tui/helpers.ts` — utility unchanged
- All `src/core/` files except `ensure.ts` — data layer unchanged

### Relocated Logic
- `parseFilterString` from `src/tui/components/filter-bar.ts` — moved to `src/tui/components/command-bar.ts` (or kept as a standalone util and imported)

## Data Model

No changes to the task data model. The board view uses existing fields:
- `area` for grouping
- `status` for display symbols and stats
- `priority` for priority indicators
- `created` for age calculation (via luxon)
- `tags` for inline tag display
