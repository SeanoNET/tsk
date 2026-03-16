import { tskDir, dbPath, configPath } from "./paths.js";
import { openDb, initSchema } from "./db.js";
import { readConfig } from "./config.js";
import { Database } from "bun:sqlite";

export async function ensureInitialized(): Promise<Database> {
  const dir = tskDir();

  const configExists = await Bun.file(configPath()).exists();
  if (!configExists) {
    throw new Error(
      `tsk is not initialized. Run 'tsk init' first.\n(Expected config at ${dir})`
    );
  }

  // Validate config is readable
  await readConfig();

  // Open and ensure db schema
  const db = openDb(dbPath());
  initSchema(db);
  return db;
}
