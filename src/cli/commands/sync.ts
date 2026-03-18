import { defineCommand } from "citty";
import { ensureInitialized } from "../../core/ensure.js";
import { readConfig, writeConfig } from "../../core/config.js";
import { syncNow, readSyncStatus } from "../../core/sync.js";
import {
  gitRemoteAdd,
  gitRemoteRemove,
  gitRemoteGetUrl,
  gitLsRemote,
  gitFetch,
  gitPullRebase,
  gitPush,
  gitBranchName,
  gitLocalAheadCount,
  gitRemoteAheadCount,
} from "../../core/git.js";
import { rebuildIndex } from "../../core/reindex.js";
import { success, failure, printResult } from "../output.js";
import { createInterface } from "readline";

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const setupCommand = defineCommand({
  meta: { name: "setup", description: "Configure git remote for syncing tasks across machines" },
  args: {
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    try {
      const db = await ensureInitialized();
      const config = await readConfig();
      const remote = config.sync.remote ?? "origin";

      // Check if already configured
      const existingUrl = await gitRemoteGetUrl(remote);
      if (existingUrl) {
        const answer = await prompt(`Remote '${remote}' is already configured (${existingUrl}). Reconfigure? [y/N] `);
        if (answer.toLowerCase() !== "y") {
          console.log("Aborted.");
          db.close();
          return;
        }
        await gitRemoteRemove(remote);
      }

      // Prompt for URL
      const url = await prompt("Git remote URL: ");
      if (!url) {
        console.error("No URL provided. Aborted.");
        db.close();
        process.exit(1);
      }

      // Test connectivity
      console.log("Testing connectivity...");
      const lsResult = await gitLsRemote(url);
      if (!lsResult.ok) {
        console.error(`Cannot reach remote: ${lsResult.error}`);
        db.close();
        process.exit(1);
      }

      // Add remote
      await gitRemoteAdd(remote, url);

      // Fetch to see what's on the remote
      const fetchResult = await gitFetch(remote);
      if (!fetchResult.ok) {
        console.error(`Fetch failed: ${fetchResult.error}`);
        db.close();
        process.exit(1);
      }

      const branch = config.sync.branch ?? await gitBranchName();

      // Check if remote has content
      const remoteAhead = await gitRemoteAheadCount(remote, branch);
      if (remoteAhead > 0) {
        // Remote has tasks — pull them
        console.log(`Pulling ${remoteAhead} commits from remote...`);
        const pullResult = await gitPullRebase(remote, branch);
        if (!pullResult.ok && !pullResult.conflicts) {
          console.error(`Pull failed: ${pullResult.error}`);
          db.close();
          process.exit(1);
        }
        const { indexed } = await rebuildIndex(db);
        console.log(`Rebuilt index: ${indexed} tasks indexed.`);
      }

      // Push local changes
      console.log("Pushing to remote...");
      const pushResult = await gitPush(remote, branch, true);
      if (!pushResult.ok) {
        console.error(`Push failed: ${pushResult.error}`);
        db.close();
        process.exit(1);
      }

      // Update config
      config.sync.enabled = true;
      config.sync.remoteUrl = url;
      config.sync.remote = remote;
      config.sync.branch = branch;
      config.sync.autoSync = true;
      config.sync.conflictStrategy = "last-write-wins";
      await writeConfig(config);

      // Write initial sync status
      const { writeSyncStatus } = await import("../../core/sync.js");
      await writeSyncStatus({
        lastSync: new Date().toISOString(),
        remoteUrl: url,
        lastRemoteCommit: "",
      });

      if (args.json) {
        printResult(success({ remote, url, branch }), true);
      } else {
        console.log(`\nSync configured successfully!`);
        console.log(`  Remote: ${remote} → ${url}`);
        console.log(`  Branch: ${branch}`);
        console.log(`  Auto-sync: enabled (every ${config.sync.intervalSeconds ?? 60}s)`);
        console.log(`\nTasks will sync automatically. Run 'tsk git' to sync manually.`);
      }

      db.close();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});

const statusCommand = defineCommand({
  meta: { name: "status", description: "Show sync status" },
  args: {
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    try {
      const db = await ensureInitialized();
      const config = await readConfig();
      const remote = config.sync.remote ?? "origin";
      const branch = config.sync.branch ?? "main";

      const remoteUrl = await gitRemoteGetUrl(remote);
      const syncStatus = await readSyncStatus();

      if (!remoteUrl) {
        if (args.json) {
          printResult(success({ configured: false }), true);
        } else {
          console.log("Sync is not configured. Run 'tsk git setup' to get started.");
        }
        db.close();
        return;
      }

      // Fetch to get latest counts
      await gitFetch(remote);
      const localPending = await gitLocalAheadCount(remote, branch);
      const remotePending = await gitRemoteAheadCount(remote, branch);

      const info = {
        configured: true,
        enabled: config.sync.enabled,
        remote,
        remoteUrl,
        branch,
        autoSync: config.sync.autoSync ?? true,
        conflictStrategy: config.sync.conflictStrategy ?? "last-write-wins",
        lastSync: syncStatus?.lastSync ?? "never",
        localPending,
        remotePending,
      };

      if (args.json) {
        printResult(success(info), true);
      } else {
        console.log(`Sync Status`);
        console.log(`  Enabled:     ${info.enabled ? "yes" : "no"}`);
        console.log(`  Remote:      ${info.remote} → ${info.remoteUrl}`);
        console.log(`  Branch:      ${info.branch}`);
        console.log(`  Auto-sync:   ${info.autoSync ? "yes" : "no"}`);
        console.log(`  Strategy:    ${info.conflictStrategy}`);
        console.log(`  Last sync:   ${info.lastSync}`);
        console.log(`  Local ahead: ${info.localPending} commit(s)`);
        console.log(`  Remote ahead:${info.remotePending} commit(s)`);
      }

      db.close();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});

const disconnectCommand = defineCommand({
  meta: { name: "disconnect", description: "Remove sync remote and disable sync" },
  args: {
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  async run({ args }) {
    try {
      const db = await ensureInitialized();
      const config = await readConfig();
      const remote = config.sync.remote ?? "origin";

      const remoteUrl = await gitRemoteGetUrl(remote);
      if (!remoteUrl) {
        console.log("No sync remote configured.");
        db.close();
        return;
      }

      await gitRemoteRemove(remote);
      config.sync.enabled = false;
      config.sync.remoteUrl = undefined;
      config.sync.autoSync = false;
      await writeConfig(config);

      if (args.json) {
        printResult(success({ disconnected: true }), true);
      } else {
        console.log(`Sync disconnected. Remote '${remote}' (${remoteUrl}) removed.`);
        console.log("Your local tasks are unchanged.");
      }

      db.close();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});

export const gitCommand = defineCommand({
  meta: { name: "git", description: "Sync tasks via git remote" },
  args: {
    json: { type: "boolean", description: "Output JSON", default: false },
  },
  subCommands: {
    setup: setupCommand,
    status: statusCommand,
    disconnect: disconnectCommand,
  },
  async run({ args }) {
    try {
      const db = await ensureInitialized();
      const config = await readConfig();

      if (!config.sync.enabled) {
        console.error("Sync is not configured. Run 'tsk git setup' to get started.");
        process.exit(1);
      }

      console.log("Syncing...");
      const result = await syncNow(db);

      if (args.json) {
        printResult(success(result), true);
      } else {
        const parts: string[] = [];
        if (result.pulled > 0) parts.push(`${result.pulled} pulled`);
        if (result.pushed > 0) parts.push(`${result.pushed} pushed`);
        if (result.conflicts.length > 0) parts.push(`${result.conflicts.length} conflicts resolved`);
        if (parts.length === 0) parts.push("already up to date");
        console.log(`Sync complete: ${parts.join(", ")}.`);

        if (result.errors.length > 0) {
          for (const err of result.errors) {
            console.error(`  Error: ${err}`);
          }
        }
      }

      db.close();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(failure(msg), args.json);
      process.exit(1);
    }
  },
});
