import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "fs/promises";
import { join } from "path";
import { Database } from "bun:sqlite";
import { initSchema, openDb, queryTasks } from "../../src/core/db.js";
import { serializeTask } from "../../src/core/markdown.js";
import { syncNow, readSyncStatus } from "../../src/core/sync.js";
import { readConfig, writeConfig, DEFAULT_CONFIG, type TskConfig } from "../../src/core/config.js";
import {
  gitInit,
  gitAdd,
  gitCommit,
  gitRemoteAdd,
  gitRemoteGetUrl,
} from "../../src/core/git.js";
import type { Task } from "../../src/core/task.js";
import { tmpdir } from "os";
const TMPDIR = tmpdir();
await mkdir(TMPDIR, { recursive: true });

function makeTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title,
    status: "inbox",
    priority: "none",
    created: "2026-01-01T00:00:00.000Z",
    modified: "2026-01-01T00:00:00.000Z",
    body: "",
    ...overrides,
  };
}

async function initRepo(dir: string): Promise<void> {
  await mkdir(join(dir, "tasks"), { recursive: true });
  await gitInit(dir);
  // Set default branch to main
  const branchProc = Bun.spawn(["git", "checkout", "-b", "main"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  await branchProc.exited;
  // Write config
  const config = structuredClone(DEFAULT_CONFIG);
  config.sync.enabled = true;
  config.sync.remote = "origin";
  config.sync.branch = "main";
  config.sync.autoSync = false;
  await Bun.write(join(dir, "config.toml"), "");
  await writeConfig(config);
  // Write gitignore
  await Bun.write(
    join(dir, ".gitignore"),
    ["index.db", "index.db-wal", "index.db-shm", ".sync-status.json", ".sync-lock"].join("\n") + "\n"
  );
  await gitAdd(["."]);
  await gitCommit("init");
}

describe("sync", () => {
  let localDir: string;
  let remoteDir: string;
  let db: Database;
  const originalTskDir = process.env.TSK_DIR;

  beforeEach(async () => {
    localDir = await mkdtemp(join(TMPDIR, "tsk-sync-local-"));
    remoteDir = await mkdtemp(join(TMPDIR, "tsk-sync-remote-"));

    // Create a bare remote
    const proc = Bun.spawn(["git", "init", "--bare", remoteDir], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;

    // Initialize local repo
    process.env.TSK_DIR = localDir;
    await initRepo(localDir);

    // Add remote
    await gitRemoteAdd("origin", remoteDir);

    // Push initial commit
    const pushProc = Bun.spawn(["git", "push", "-u", "origin", "main"], {
      cwd: localDir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "tsk",
        GIT_AUTHOR_EMAIL: "tsk@localhost",
        GIT_COMMITTER_NAME: "tsk",
        GIT_COMMITTER_EMAIL: "tsk@localhost",
      },
    });
    await pushProc.exited;

    db = openDb(join(localDir, "index.db"));
    initSchema(db);
  });

  afterEach(async () => {
    db.close();
    process.env.TSK_DIR = originalTskDir;
    await rm(localDir, { recursive: true, force: true });
    await rm(remoteDir, { recursive: true, force: true });
  });

  it("syncs local commits to remote", async () => {
    // Create a task file and commit
    const task = makeTask("task01", "Sync test task");
    await Bun.write(join(localDir, "tasks", "task01.md"), serializeTask(task));
    await gitAdd(["tasks/task01.md"]);
    await gitCommit("add task");

    const result = await syncNow(db);
    expect(result.errors).toEqual([]);
    expect(result.pushed).toBeGreaterThan(0);
  });

  it("pulls remote commits and rebuilds index", async () => {
    // Simulate remote changes by cloning and pushing from a second "client"
    const client2Dir = await mkdtemp(join(TMPDIR, "tsk-sync-client2-"));
    // Clone and check out the main branch
    const cloneProc = Bun.spawn(["git", "clone", "-b", "main", remoteDir, client2Dir], { stdout: "pipe", stderr: "pipe" });
    await cloneProc.exited;

    // Create a task in client2
    await mkdir(join(client2Dir, "tasks"), { recursive: true });
    const task = makeTask("remote1", "Remote task");
    await Bun.write(join(client2Dir, "tasks", "remote1.md"), serializeTask(task));

    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "tsk",
      GIT_AUTHOR_EMAIL: "tsk@localhost",
      GIT_COMMITTER_NAME: "tsk",
      GIT_COMMITTER_EMAIL: "tsk@localhost",
    };

    const addProc = Bun.spawn(["git", "add", "tasks/remote1.md"], { cwd: client2Dir, stdout: "pipe", stderr: "pipe", env: gitEnv });
    await addProc.exited;
    const commitProc = Bun.spawn(["git", "commit", "-m", "add remote task"], { cwd: client2Dir, stdout: "pipe", stderr: "pipe", env: gitEnv });
    await commitProc.exited;
    const pushProc = Bun.spawn(["git", "push", "origin", "main"], { cwd: client2Dir, stdout: "pipe", stderr: "pipe", env: gitEnv });
    await pushProc.exited;

    // Now sync from our local
    const result = await syncNow(db);
    expect(result.errors).toEqual([]);
    expect(result.pulled).toBeGreaterThan(0);

    // Verify the task was indexed
    const tasks = queryTasks(db);
    expect(tasks.some((t) => t.id === "remote1")).toBe(true);

    await rm(client2Dir, { recursive: true, force: true });
  });

  it("writes sync status after successful sync", async () => {
    const result = await syncNow(db);
    expect(result.errors).toEqual([]);

    const status = await readSyncStatus();
    expect(status).not.toBeNull();
    expect(status!.lastSync).toBeTruthy();
  });

  it("returns error when sync is disabled", async () => {
    const config = await readConfig();
    config.sync.enabled = false;
    await writeConfig(config);

    const result = await syncNow(db);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("not enabled");
  });

  it("returns error when no remote is configured", async () => {
    // Remove the remote
    const proc = Bun.spawn(["git", "remote", "remove", "origin"], {
      cwd: localDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    const result = await syncNow(db);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("No remote");
  });
});
