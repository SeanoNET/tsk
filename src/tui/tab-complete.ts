import type { Database } from "bun:sqlite";
import type { InputRenderable } from "@opentui/core";
import { getSuggestions, type Suggestion } from "./autocomplete.js";

interface TabState {
  /** The word being completed */
  prefix: string;
  /** All suggestions for current prefix */
  suggestions: Suggestion[];
  /** Current index in suggestions (cycles on repeated Tab) */
  index: number;
}

let tabState: TabState | null = null;

/**
 * Handle Tab press on an input. Completes the current word with the first
 * matching suggestion. Repeated Tab presses cycle through suggestions.
 *
 * Returns true if a completion was applied.
 */
export function handleTabComplete(
  input: InputRenderable,
  db: Database
): boolean {
  const value = input.value;
  const words = value.split(/\s+/);
  const lastWord = words[words.length - 1] || "";

  // If Tab was just pressed and we have active suggestions, cycle to next
  if (tabState && tabState.prefix === lastWord && tabState.suggestions.length > 0) {
    tabState.index = (tabState.index + 1) % tabState.suggestions.length;
    const completion = tabState.suggestions[tabState.index].token;
    words[words.length - 1] = completion;
    input.value = words.join(" ") + " ";
    return true;
  }

  // New tab press -- get suggestions for current word
  const suggestions = getSuggestions(db, lastWord).filter((s) => s.token !== "");
  if (suggestions.length === 0) {
    tabState = null;
    return false;
  }

  tabState = { prefix: lastWord, suggestions, index: 0 };
  const completion = suggestions[0].token;
  words[words.length - 1] = completion;
  input.value = words.join(" ") + " ";
  return true;
}

/** Reset tab state (call when any non-Tab key is pressed) */
export function resetTabState(): void {
  tabState = null;
}
