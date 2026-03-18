import { TextRenderable, t, fg, type RenderContext } from "@opentui/core";
import type { TskTheme } from "../theme.js";
import { readSyncStatus } from "../../core/sync.js";
import { readConfig } from "../../core/config.js";
import { gitRemoteGetUrl, gitFetch, gitLocalAheadCount, gitRemoteAheadCount } from "../../core/git.js";

export type SyncDisplayStatus = "idle" | "syncing" | "error" | "offline" | "disabled";

export interface SyncState {
  status: SyncDisplayStatus;
  localPending: number;
  remotePending: number;
  lastSync: string;
  remoteUrl: string;
  branch: string;
  error?: string;
}

export function createSyncIndicator(
  renderer: RenderContext,
  theme: TskTheme,
  state: SyncState
): TextRenderable {
  if (state.status === "disabled") {
    return new TextRenderable(renderer, {
      id: "sync-indicator",
      content: "",
    });
  }

  const arrow = "\u2191\u2193";
  let text: string;
  let color: string;

  switch (state.status) {
    case "syncing":
      text = `${arrow} syncing\u2026`;
      color = theme.fieldSync;
      break;
    case "error":
      text = `${arrow} error`;
      color = theme.error;
      break;
    case "offline":
      text = `${arrow} offline`;
      color = theme.muted;
      break;
    case "idle":
    default:
      if (state.localPending > 0 || state.remotePending > 0) {
        const parts: string[] = [];
        if (state.localPending > 0) parts.push(`${state.localPending}\u2191`);
        if (state.remotePending > 0) parts.push(`${state.remotePending}\u2193`);
        text = `${arrow} ${parts.join(" ")}`;
        color = theme.warning;
      } else {
        text = `${arrow} synced`;
        color = theme.success;
      }
      break;
  }

  return new TextRenderable(renderer, {
    id: "sync-indicator",
    content: t`${fg(color)(text)} `,
  });
}

export async function loadSyncState(): Promise<SyncState> {
  const defaultState: SyncState = {
    status: "disabled",
    localPending: 0,
    remotePending: 0,
    lastSync: "never",
    remoteUrl: "",
    branch: "main",
  };

  try {
    const config = await readConfig();
    if (!config.sync.enabled) return defaultState;

    const remote = config.sync.remote ?? "origin";
    const branch = config.sync.branch ?? "main";
    const remoteUrl = await gitRemoteGetUrl(remote);

    if (!remoteUrl) return defaultState;

    const syncStatus = await readSyncStatus();

    // Fetch to get accurate remote-tracking refs
    const fetchResult = await gitFetch(remote);
    const localPending = await gitLocalAheadCount(remote, branch);
    const remotePending = await gitRemoteAheadCount(remote, branch);

    return {
      status: fetchResult?.ok === false ? "offline" : "idle",
      localPending,
      remotePending,
      lastSync: syncStatus?.lastSync ?? "never",
      remoteUrl,
      branch,
    };
  } catch {
    return { ...defaultState, status: "offline" };
  }
}

export function formatRelativeTime(iso: string): string {
  if (iso === "never") return "never";
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return iso;
  }
}
