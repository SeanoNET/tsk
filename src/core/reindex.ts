import { Database } from "bun:sqlite";
import { readdir } from "fs/promises";
import { join } from "path";
import { tasksDir, taskFilePath } from "./paths.js";
import { parseTaskFile } from "./markdown.js";
import { indexTask, removeTask, queryTasks } from "./db.js";

export async function rebuildIndex(db: Database): Promise<{ indexed: number; removed: number }> {
  const dir = tasksDir();
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    return { indexed: 0, removed: 0 };
  }

  const fileIds = new Set<string>();
  let indexed = 0;

  for (const file of files) {
    try {
      const content = await Bun.file(join(dir, file)).text();
      const task = parseTaskFile(content);
      // Use the frontmatter ID as the canonical ID
      fileIds.add(task.id);
      indexTask(db, task, taskFilePath(task.id));
      indexed++;
    } catch {
      // Skip malformed files — still track filename ID for removal logic
      const filenameId = file.replace(/\.md$/, "");
      fileIds.add(filenameId);
    }
  }

  // Remove DB rows for tasks that no longer have files on disk
  const existing = queryTasks(db);
  let removed = 0;
  for (const task of existing) {
    if (!fileIds.has(task.id)) {
      removeTask(db, task.id);
      removed++;
    }
  }

  return { indexed, removed };
}
