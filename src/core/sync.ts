import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdir, open, rename, unlink } from "fs/promises";
import { tskDir, tskLocalStateDir } from "./paths.js";
import { readConfig } from "./config.js";
import { rebuildIndex } from "./reindex.js";
import { parseTaskFile } from "./markdown.js";
import {
  gitFetch,
  gitPullRebase,
  gitPush,
  gitConflictedFiles,
  gitShowRef,
  gitAdd,
  gitRebaseContinue,
  gitRebaseAbort,
  gitRemoteGetUrl,
  gitLocalAheadCount,
  gitRemoteAheadCount,
} from "./git.js";

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: string[];
  errors: string[];
}

export interface SyncStatus {
  lastSync: string;
  remoteUrl: string;
  lastRemoteCommit: string;
}

const LOCK_FILE = ".sync-lock";
const STATUS_FILE = ".sync-status.json";

function lockPath(): string {
  return join(tskDir(), LOCK_FILE);
}

function statusPath(): string {
  return join(tskDir(), STATUS_FILE);
}

function lockData(): string {
  return JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() });
}

async function migrateLegacyLocalFiles(): Promise<void> {
  const legacyUpdateCache = join(tskDir(), "update-check.json");
  const localUpdateCache = join(tskLocalStateDir(), "update-check.json");

  try {
    if (!(await Bun.file(legacyUpdateCache).exists())) return;
    await mkdir(tskLocalStateDir(), { recursive: true });
    await Bun.write(localUpdateCache, await Bun.file(legacyUpdateCache).text());
    await unlink(legacyUpdateCache);
  } catch {
    try {
      await rename(legacyUpdateCache, `${legacyUpdateCache}.bak`);
    } catch {
      // Ignore migration failures; git will surface any remaining problem
    }
  }
}

async function acquireLock(): Promise<boolean> {
  const path = lockPath();

  // Try atomic exclusive create
  try {
    const fh = await open(path, "wx");
    await fh.writeFile(lockData());
    await fh.close();
    return true;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }

  // Lock file exists — check if it's stale or held by a dead process
  try {
    const content = await Bun.file(path).text();
    const { pid, timestamp } = JSON.parse(content);
    const age = Date.now() - new Date(timestamp).getTime();
    const isStale = age > 5 * 60 * 1000;

    let isDead = false;
    if (!isStale) {
      try {
        process.kill(pid, 0);
      } catch {
        isDead = true; // Process no longer running
      }
    }

    if (isStale || isDead) {
      // Remove stale lock and retry atomically
      await unlink(path);
      try {
        const fh = await open(path, "wx");
        await fh.writeFile(lockData());
        await fh.close();
        return true;
      } catch {
        return false; // Another process beat us to it
      }
    }

    return false; // Lock is actively held
  } catch {
    // Malformed lock — remove and retry
    try { await unlink(path); } catch { /* ignore */ }
    try {
      const fh = await open(path, "wx");
      await fh.writeFile(lockData());
      await fh.close();
      return true;
    } catch {
      return false;
    }
  }
}

async function releaseLock(): Promise<void> {
  try {
    await unlink(lockPath());
  } catch {
    // Ignore — lock may already be gone
  }
}

export async function readSyncStatus(): Promise<SyncStatus | null> {
  const file = Bun.file(statusPath());
  if (!(await file.exists())) return null;
  try {
    return JSON.parse(await file.text()) as SyncStatus;
  } catch {
    return null;
  }
}

export async function writeSyncStatus(status: SyncStatus): Promise<void> {
  await Bun.write(statusPath(), JSON.stringify(status, null, 2));
}

interface ConflictResult {
  resolved: string[];
  aborted: boolean;
}

async function resolveConflicts(strategy: "last-write-wins" | "keep-both"): Promise<ConflictResult> {
  const conflicted = await gitConflictedFiles();
  if (conflicted.length === 0) return { resolved: [], aborted: false };

  const resolved: string[] = [];

  for (const file of conflicted) {
    if (strategy === "last-write-wins") {
      try {
        const oursContent = await gitShowRef(":2", file);
        const theirsContent = await gitShowRef(":3", file);

        if (oursContent && theirsContent) {
          const ours = parseTaskFile(oursContent);
          const theirs = parseTaskFile(theirsContent);

          const oursModified = ours.modified ?? "";
          const theirsModified = theirs.modified ?? "";

          // Keep the more recently modified version
          const winner = theirsModified > oursModified ? theirsContent : oursContent;
          await Bun.write(join(tskDir(), file), winner);
        } else {
          // Can't parse both — keep ours
          if (oursContent) {
            await Bun.write(join(tskDir(), file), oursContent);
          }
        }
      } catch {
        // If resolution fails, keep ours
        const oursContent = await gitShowRef(":2", file);
        if (oursContent) {
          await Bun.write(join(tskDir(), file), oursContent);
        }
      }
    } else {
      // keep-both: write ours to original path, theirs to a conflict copy
      const oursContent = await gitShowRef(":2", file);
      const theirsContent = await gitShowRef(":3", file);
      if (oursContent) {
        await Bun.write(join(tskDir(), file), oursContent);
      }
      if (theirsContent) {
        const conflictPath = file.replace(/\.md$/, "-conflict.md");
        await Bun.write(join(tskDir(), conflictPath), theirsContent);
        await gitAdd(conflictPath);
      }
    }

    await gitAdd(file);
    resolved.push(file);
  }

  if (resolved.length > 0) {
    const continueResult = await gitRebaseContinue();
    if (!continueResult.ok) {
      const moreConflicts = await gitConflictedFiles();
      if (moreConflicts.length > 0) {
        const more = await resolveConflicts(strategy);
        resolved.push(...more.resolved);
        if (more.aborted) return { resolved, aborted: true };
      } else {
        await gitRebaseAbort();
        return { resolved, aborted: true };
      }
    }
  }

  return { resolved, aborted: false };
}

export async function syncNow(db: Database): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, conflicts: [], errors: [] };

  const config = await readConfig();
  if (!config.sync.enabled) {
    result.errors.push("Sync is not enabled");
    return result;
  }

  const remote = config.sync.remote ?? "origin";
  const branch = config.sync.branch ?? "main";
  const strategy = config.sync.conflictStrategy ?? "last-write-wins";

  const remoteUrl = await gitRemoteGetUrl(remote);
  if (!remoteUrl) {
    result.errors.push(`No remote '${remote}' configured. Run 'tsk git setup' first.`);
    return result;
  }

  const locked = await acquireLock();
  if (!locked) {
    result.errors.push("Another sync is in progress");
    return result;
  }

  try {
    await migrateLegacyLocalFiles();

    // Fetch
    const fetchResult = await gitFetch(remote);
    if (!fetchResult.ok) {
      result.errors.push(`Fetch failed: ${fetchResult.error}`);
      return result;
    }

    // Pull if remote is ahead
    const remoteAhead = await gitRemoteAheadCount(remote, branch);
    if (remoteAhead > 0) {
      const pullResult = await gitPullRebase(remote, branch);

      if (pullResult.ok) {
        result.pulled = remoteAhead;
      } else if (pullResult.conflicts) {
        const conflictResult = await resolveConflicts(strategy);
        result.conflicts = conflictResult.resolved;
        if (conflictResult.aborted) {
          result.errors.push("Rebase aborted after unresolvable conflicts");
          return result;
        }
        result.pulled = remoteAhead;
      } else {
        result.errors.push(`Pull failed: ${pullResult.error}`);
        return result;
      }

      // Rebuild index after pulling
      await rebuildIndex(db);
    }

    // Push if local is ahead
    const localAhead = await gitLocalAheadCount(remote, branch);
    if (localAhead > 0) {
      const pushResult = await gitPush(remote, branch);
      if (pushResult.ok) {
        result.pushed = localAhead;
      } else {
        result.errors.push(`Push failed: ${pushResult.error}`);
      }
    }

    // Update sync status
    await writeSyncStatus({
      lastSync: new Date().toISOString(),
      remoteUrl,
      lastRemoteCommit: "",
    });
  } finally {
    await releaseLock();
  }

  return result;
}

// Throttled auto-sync, fire-and-forget
let lastAutoSync = 0;
let autoSyncInProgress = false;

export function triggerAutoSync(db: Database): void {
  readConfig()
    .then((config) => {
      if (!config.sync.enabled || config.sync.autoSync === false) return;
      const interval = (config.sync.intervalSeconds ?? 60) * 1000;
      const now = Date.now();
      if (now - lastAutoSync < interval) return;
      if (autoSyncInProgress) return;

      lastAutoSync = now;
      autoSyncInProgress = true;

      syncNow(db)
        .catch(() => {}) // Errors logged silently
        .finally(() => {
          autoSyncInProgress = false;
        });
    })
    .catch(() => {}); // Config read failure — ignore
}
