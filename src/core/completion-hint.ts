import { join } from "path";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { tskLocalStateDir } from "./paths.js";

const HINT_DISMISSED_FILE = "completions-hinted";

export function checkCompletionHint(): void {
  // Only hint on zsh
  const shell = process.env.SHELL || "";
  if (!shell.includes("zsh")) return;

  // Don't hint if already dismissed
  const flagPath = join(tskLocalStateDir(), HINT_DISMISSED_FILE);
  if (existsSync(flagPath)) return;

  // Check if completions are already installed
  const completionFile = join(homedir(), ".zsh", "completions", "_tsk");
  if (existsSync(completionFile)) {
    dismissHint(flagPath);
    return;
  }

  console.error(
    "Tip: Tab completions are available for zsh. Run 'tsk completions zsh' to install."
  );
  dismissHint(flagPath);
}

function dismissHint(flagPath: string): void {
  try {
    mkdirSync(tskLocalStateDir(), { recursive: true });
    writeFileSync(flagPath, "", "utf-8");
  } catch {
    // Ignore
  }
}
