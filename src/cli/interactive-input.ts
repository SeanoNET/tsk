import type { Database } from "bun:sqlite";
import { getSuggestions } from "../tui/autocomplete.js";

/**
 * Interactive readline with tab completion for CLI add/edit.
 * Uses raw stdin for tab handling since standard readline doesn't support custom completers in Bun.
 */
export async function interactiveInput(
  db: Database,
  prompt: string,
  initialValue: string = ""
): Promise<string | null> {
  process.stdout.write(prompt);

  let buffer = initialValue;
  let tabSuggestions: string[] = [];
  let tabIndex = -1;
  let tabPrefix = "";

  if (initialValue) {
    process.stdout.write(initialValue);
  }

  // Show hint line
  function showHints() {
    const words = buffer.split(/\s+/);
    const lastWord = words[words.length - 1] || "";
    const suggestions = getSuggestions(db, lastWord);
    // Clear current hint line and rewrite
    process.stdout.write(`\r\x1b[K${prompt}${buffer}`);
    if (suggestions.length > 0) {
      const hintText = suggestions.map((s) => s.label).join("  ");
      process.stdout.write(`\n\x1b[2m  ${hintText}\x1b[0m\x1b[A`);
      // Move cursor back to end of input
      process.stdout.write(`\r\x1b[${prompt.length + buffer.length}C`);
    }
  }

  function applyTabCompletion(): boolean {
    const words = buffer.split(/\s+/);
    const lastWord = words[words.length - 1] || "";

    if (tabPrefix === lastWord && tabSuggestions.length > 0) {
      // Cycle to next
      tabIndex = (tabIndex + 1) % tabSuggestions.length;
    } else {
      // New tab press
      const suggestions = getSuggestions(db, lastWord).filter((s) => s.token !== "");
      if (suggestions.length === 0) {
        tabSuggestions = [];
        tabIndex = -1;
        tabPrefix = "";
        return false;
      }
      tabSuggestions = suggestions.map((s) => s.token);
      tabIndex = 0;
      tabPrefix = lastWord;
    }

    words[words.length - 1] = tabSuggestions[tabIndex];
    buffer = words.join(" ") + " ";
    // Clear hint line if visible, rewrite
    process.stdout.write(`\n\x1b[K\x1b[A`);
    process.stdout.write(`\r\x1b[K${prompt}${buffer}`);
    return true;
  }

  function resetTab() {
    tabSuggestions = [];
    tabIndex = -1;
    tabPrefix = "";
  }

  return new Promise<string | null>((resolve) => {
    if (!process.stdin.isTTY) {
      // Non-interactive: read from pipe
      const reader = Bun.stdin.stream().getReader();
      reader.read().then(({ value }) => {
        reader.releaseLock();
        resolve(value ? new TextDecoder().decode(value).trim() : null);
      });
      return;
    }

    process.stdin.setRawMode(true);

    const handler = (data: Buffer) => {
      const str = data.toString();

      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        const code = str.charCodeAt(i);

        // Enter
        if (code === 13 || code === 10) {
          process.stdin.setRawMode(false);
          process.stdin.removeListener("data", handler);
          process.stdin.pause();
          process.stdout.write(`\n\x1b[K`);
          resolve(buffer.trim() || null);
          return;
        }

        // Escape or Ctrl+C
        if (code === 27 || code === 3) {
          process.stdin.setRawMode(false);
          process.stdin.removeListener("data", handler);
          process.stdin.pause();
          process.stdout.write(`\n\x1b[K`);
          resolve(null);
          return;
        }

        // Tab
        if (code === 9) {
          applyTabCompletion();
          continue;
        }

        // Backspace
        if (code === 127 || code === 8) {
          resetTab();
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            showHints();
          }
          continue;
        }

        // Ctrl+U - clear line
        if (code === 21) {
          resetTab();
          buffer = "";
          showHints();
          continue;
        }

        // Ctrl+W - delete last word
        if (code === 23) {
          resetTab();
          buffer = buffer.trimEnd().replace(/\S+$/, "");
          showHints();
          continue;
        }

        // Regular printable character
        if (code >= 32 && code < 127) {
          resetTab();
          buffer += ch;
          showHints();
        }
      }
    };

    process.stdin.on("data", handler);
    showHints();
  });
}
