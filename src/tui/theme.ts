import type { ThemeMode } from "@opentui/core";

export interface TskTheme {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  error: string;
  warning: string;
  success: string;
  border: string;
  headerBg: string;
  headerFg: string;
  selectedBg: string;
  selectedFg: string;
  priorityHigh: string;
  priorityMedium: string;
  priorityLow: string;
  // Semantic field colors — consistent across the entire app
  fieldTag: string;       // #tag
  fieldStatus: string;    // @status
  fieldDue: string;       // due: / sched:
  fieldArea: string;      // area:
  fieldProject: string;   // project:
  fieldDuration: string;  // dur:
}

const darkTheme: TskTheme = {
  bg: "#1a1b26",
  fg: "#c0caf5",
  accent: "#7aa2f7",
  muted: "#565f89",
  error: "#f7768e",
  warning: "#e0af68",
  success: "#9ece6a",
  border: "#3b4261",
  headerBg: "#24283b",
  headerFg: "#7aa2f7",
  selectedBg: "#283457",
  selectedFg: "#c0caf5",
  priorityHigh: "#f7768e",
  priorityMedium: "#e0af68",
  priorityLow: "#9ece6a",
  fieldTag: "#bb9af7",       // purple
  fieldStatus: "#7dcfff",    // cyan
  fieldDue: "#ff9e64",       // orange
  fieldArea: "#2ac3de",      // teal
  fieldProject: "#9ece6a",   // green
  fieldDuration: "#e0af68",  // yellow
};

const lightTheme: TskTheme = {
  bg: "#d5d6db",
  fg: "#343b58",
  accent: "#34548a",
  muted: "#9699a3",
  error: "#8c4351",
  warning: "#8f5e15",
  success: "#33635c",
  border: "#9699a3",
  headerBg: "#c4c5cb",
  headerFg: "#34548a",
  selectedBg: "#99a0c4",
  selectedFg: "#343b58",
  priorityHigh: "#8c4351",
  priorityMedium: "#8f5e15",
  priorityLow: "#33635c",
  fieldTag: "#5a4a78",
  fieldStatus: "#166775",
  fieldDue: "#965027",
  fieldArea: "#0f7b8a",
  fieldProject: "#33635c",
  fieldDuration: "#8f5e15",
};

export function getTheme(mode: ThemeMode | null): TskTheme {
  return mode === "light" ? lightTheme : darkTheme;
}
