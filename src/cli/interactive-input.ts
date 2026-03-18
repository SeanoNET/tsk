import type { Database } from "bun:sqlite";
import { getSuggestions } from "../tui/autocomplete.js";

/**
 * Interactive readline with tab completion for CLI add/edit.
 *
 * Platform-specific "add another" keybinding:
 *   - Unix (kitty protocol): Shift+Enter sends CSI 13;2u
 *   - Windows Terminal:      Ctrl+Enter sends LF (0x0A) vs Enter sends CR (0x0D)
 */
export interface InputResult {
  value: string | null;
  addAnother: boolean;
}

const IS_WINDOWS = process.platform === "win32";

// Kitty keyboard protocol (Unix only)
const KITTY_ENABLE = "\x1b[>1u";
const KITTY_DISABLE = "\x1b[<u";

// Windows: enable Virtual Terminal Input for CSI sequence support
const WIN_VT_ENABLE = "\x1b[?9001h";
const WIN_VT_DISABLE = "\x1b[?9001l";

const ADD_ANOTHER_HINT = IS_WINDOWS
  ? "Ctrl+Enter: add another"
  : "Shift+Enter: add another";

export async function interactiveInput(
  db: Database,
  prompt: string,
  initialValue: string = "",
  allowMulti: boolean = false
): Promise<InputResult> {
  process.stdout.write(prompt);

  let buffer = initialValue;
  let tabSuggestions: string[] = [];
  let tabIndex = -1;
  let tabPrefix = "";

  if (initialValue) {
    process.stdout.write(initialValue);
  }

  // Show hint lines (suggestions + keybinding help)
  function showHints() {
    const words = buffer.split(/\s+/);
    const lastWord = words[words.length - 1] || "";
    const suggestions = getSuggestions(db, lastWord);
    // Clear current line and two lines below, then rewrite
    process.stdout.write(`\r\x1b[K${prompt}${buffer}`);
    // Line 1: suggestions
    process.stdout.write(`\n\x1b[K`);
    if (suggestions.length > 0) {
      const hintText = suggestions.map((s) => s.label).join("  ");
      process.stdout.write(`\x1b[2m  ${hintText}\x1b[0m`);
    }
    // Line 2: keybinding help (dim italic)
    process.stdout.write(`\n\x1b[K`);
    if (allowMulti) {
      process.stdout.write(`\x1b[2;3m  ${ADD_ANOTHER_HINT}\x1b[0m`);
    }
    // Move cursor back up to input line
    process.stdout.write(`\x1b[2A`);
    process.stdout.write(`\r\x1b[${prompt.length + buffer.length}C`);
  }

  function applyTabCompletion(): boolean {
    const words = buffer.split(/\s+/);
    const lastWord = words[words.length - 1] || "";

    if (tabPrefix === lastWord && tabSuggestions.length > 0) {
      tabIndex = (tabIndex + 1) % tabSuggestions.length;
    } else {
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
    process.stdout.write(`\n\x1b[K\x1b[A`);
    process.stdout.write(`\r\x1b[K${prompt}${buffer}`);
    return true;
  }

  function resetTab() {
    tabSuggestions = [];
    tabIndex = -1;
    tabPrefix = "";
  }

  function enableProtocol() {
    if (IS_WINDOWS) {
      process.stdout.write(WIN_VT_ENABLE);
    } else {
      process.stdout.write(KITTY_ENABLE);
    }
  }

  function disableProtocol() {
    if (IS_WINDOWS) {
      process.stdout.write(WIN_VT_DISABLE);
    } else {
      process.stdout.write(KITTY_DISABLE);
    }
  }

  function cleanup() {
    // Clear the two hint lines below the input
    process.stdout.write(`\n\x1b[K\n\x1b[K\x1b[2A`);
    disableProtocol();
    process.stdin.setRawMode(false);
  }

  function finish(handler: (data: Buffer) => void, value: string | null, addAnother: boolean) {
    process.stdin.removeListener("data", handler);
    process.stdin.pause();
    cleanup();
    process.stdout.write(`\n\x1b[K`);
    return { value, addAnother };
  }

  return new Promise<InputResult>((resolve) => {
    if (!process.stdin.isTTY) {
      const reader = Bun.stdin.stream().getReader();
      reader.read().then(({ value }) => {
        reader.releaseLock();
        resolve({ value: value ? new TextDecoder().decode(value).trim() : null, addAnother: false });
      });
      return;
    }

    process.stdin.setRawMode(true);
    enableProtocol();

    // Buffer for collecting escape sequences
    let escBuf = "";
    let inEsc = false;

    const handler = (data: Buffer) => {
      const str = data.toString();

      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        const code = str.charCodeAt(i);

        // --- CSI escape sequence handling (both platforms) ---
        if (inEsc) {
          escBuf += ch;
          if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || ch === "~") {
            const seq = escBuf;
            inEsc = false;
            escBuf = "";

            // Kitty format: CSI codepoint ; modifiers u
            if (seq.endsWith("u")) {
              const parts = seq.slice(0, -1).split(";");
              const codepoint = parseInt(parts[0], 10);
              const modifiers = parseInt(parts[1] || "1", 10);
              const shift = (modifiers - 1) & 1;
              const ctrl = (modifiers - 1) & 4;

              // Shift+Enter (Unix kitty) or Ctrl+Enter (Windows VT)
              if (codepoint === 13 && (shift || ctrl) && allowMulti) {
                resolve(finish(handler, buffer.trim() || null, true));
                return;
              }
              if (codepoint === 13) {
                resolve(finish(handler, buffer.trim() || null, false));
                return;
              }
              if (codepoint === 9) { applyTabCompletion(); continue; }
              if (codepoint === 27) { resolve(finish(handler, null, false)); return; }
              if (codepoint === 127) {
                resetTab();
                if (buffer.length > 0) { buffer = buffer.slice(0, -1); showHints(); }
                continue;
              }
            }
            continue;
          }
          continue;
        }

        // Start of ESC sequence
        if (code === 27) {
          if (i + 1 < str.length && str[i + 1] === "[") {
            inEsc = true;
            escBuf = "";
            i++;
            continue;
          }
          // Bare escape
          resolve(finish(handler, null, false));
          return;
        }

        // Ctrl+C
        if (code === 3) {
          resolve(finish(handler, null, false));
          return;
        }

        // --- Enter handling (platform-specific) ---
        if (IS_WINDOWS) {
          // Windows Terminal: Ctrl+Enter sends LF (0x0A), Enter sends CR (0x0D)
          if (code === 10 && allowMulti) {
            // Ctrl+Enter: add another
            resolve(finish(handler, buffer.trim() || null, true));
            return;
          }
          if (code === 13) {
            resolve(finish(handler, buffer.trim() || null, false));
            return;
          }
        } else {
          // Unix fallback (non-kitty terminals): Enter sends CR or LF
          if (code === 13 || code === 10) {
            resolve(finish(handler, buffer.trim() || null, false));
            return;
          }
        }

        // Tab
        if (code === 9) { applyTabCompletion(); continue; }

        // Backspace
        if (code === 127 || code === 8) {
          resetTab();
          if (buffer.length > 0) { buffer = buffer.slice(0, -1); showHints(); }
          continue;
        }

        // Ctrl+U - clear line
        if (code === 21) { resetTab(); buffer = ""; showHints(); continue; }

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
