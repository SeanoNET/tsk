import { join } from "path";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { tskLocalStateDir } from "./paths.js";

const HINT_DISMISSED_FILE = "completions-hinted";

export function checkCompletionHint(): void {
  // Don't hint if already dismissed
  const flagPath = join(tskLocalStateDir(), HINT_DISMISSED_FILE);
  if (existsSync(flagPath)) return;

  const home = homedir();
  let shell: string;
  let completionFile: string;

  if (process.platform === "win32") {
    shell = "powershell";
    completionFile = join(home, ".config", "tsk", "completions.ps1");
  } else {
    const shellEnv = process.env.SHELL || "";
    if (shellEnv.includes("zsh")) {
      shell = "zsh";
      completionFile = join(home, ".zsh", "completions", "_tsk");
    } else if (shellEnv.includes("bash")) {
      shell = "bash";
      completionFile = join(
        home,
        ".local",
        "share",
        "bash-completion",
        "completions",
        "tsk"
      );
    } else {
      return;
    }
  }

  // Check if completions are already installed
  if (existsSync(completionFile)) {
    dismissHint(flagPath);
    return;
  }

  console.error(
    `Tip: Tab completions are available. Run 'tsk completions ${shell}' to install.`
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
