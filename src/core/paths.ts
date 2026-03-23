import { join } from "path";
import { homedir } from "os";

function baseTskDir(): string {
  if (process.env.TSK_DIR) return process.env.TSK_DIR;
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA;
    if (appdata) return join(appdata, "tsk");
  }
  return join(homedir(), ".tsk");
}

export function tskDir(): string {
  return baseTskDir();
}

function baseLocalStateDir(): string {
  if (process.env.TSK_LOCAL_STATE_DIR) return process.env.TSK_LOCAL_STATE_DIR;
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) return join(localAppData, "tsk");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "tsk");
  }
  const xdgStateHome = process.env.XDG_STATE_HOME;
  if (xdgStateHome) return join(xdgStateHome, "tsk");
  return join(homedir(), ".local", "state", "tsk");
}

export function tskLocalStateDir(): string {
  return baseLocalStateDir();
}

export function tasksDir(): string {
  return join(tskDir(), "tasks");
}

export function dbPath(): string {
  return join(tskDir(), "index.db");
}

export function configPath(): string {
  return join(tskDir(), "config.toml");
}

export function taskFilePath(id: string): string {
  return join(tasksDir(), `${id}.md`);
}
