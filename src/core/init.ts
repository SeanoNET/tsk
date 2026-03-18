import { mkdir } from "fs/promises";
import { tskDir, tasksDir, dbPath } from "./paths.js";
import { writeConfig, DEFAULT_CONFIG } from "./config.js";
import { openDb, initSchema } from "./db.js";
import { gitInit, gitAdd, gitCommit, ensureGitInstalled } from "./git.js";

export async function initTsk(force = false): Promise<void> {
  // 1. Ensure git is installed
  const hasGit = await ensureGitInstalled();
  if (!hasGit) throw new Error("git is not installed or not in PATH");

  const dir = tskDir();

  // 2. Check if already initialized
  const dirExists = await Bun.file(`${dir}/config.toml`).exists();
  if (dirExists && !force) {
    throw new Error(`tsk is already initialized at ${dir}. Use --force to re-initialize.`);
  }

  // 3. Create directories
  await mkdir(dir, { recursive: true });
  await mkdir(tasksDir(), { recursive: true });

  // 4. Write default config with auto-detected timezone
  const config = structuredClone(DEFAULT_CONFIG);
  config.core.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await writeConfig(config);

  // 5. Initialize git repo
  await gitInit();

  // 6. Write .gitattributes inside tsk dir
  await Bun.write(`${dir}/.gitattributes`, "* text=auto eol=lf\n");

  // 7. Write .gitignore inside tsk dir
  await Bun.write(
    `${dir}/.gitignore`,
    [
      "index.db",
      "index.db-wal",
      "index.db-shm",
      ".daemon.pid",
      ".sync-status.json",
      ".sync-mapping.json",
      ".sync-lock",
    ].join("\n") + "\n"
  );

  // 8. Initialize SQLite
  const db = openDb(dbPath());
  initSchema(db);
  db.close();

  // 9. Initial commit
  await gitAdd(["."]);
  await gitCommit("feat(init): initialize tsk repository");
}
