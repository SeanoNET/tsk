import { tskDir, dbPath, configPath } from "./paths.js";
import { openDb, initSchema } from "./db.js";
import { readConfig } from "./config.js";
import { initTsk } from "./init.js";
import { Database } from "bun:sqlite";

export async function ensureInitialized(): Promise<Database> {
  const dir = tskDir();

  const configExists = await Bun.file(configPath()).exists();
  if (!configExists) {
    try {
      await initTsk();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Could not auto-initialize tsk: ${msg}`);
      console.error("Run 'tsk init' manually to set up.");
      process.exit(1);
    }
  }

  // Validate config is readable
  await readConfig();

  // Open and ensure db schema
  const db = openDb(dbPath());
  initSchema(db);
  return db;
}
