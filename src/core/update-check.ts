import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { tskDir } from "./paths.js";

interface UpdateCache {
  lastCheck: string;
  latestVersion: string;
}

const CACHE_FILE = "update-check.json";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cachePath(): string {
  return join(tskDir(), CACHE_FILE);
}

function readCache(): UpdateCache | null {
  try {
    const raw = readFileSync(cachePath(), "utf-8");
    return JSON.parse(raw) as UpdateCache;
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCache): void {
  try {
    mkdirSync(tskDir(), { recursive: true });
    writeFileSync(cachePath(), JSON.stringify(cache, null, 2));
  } catch {
    // Silently ignore write failures
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function checkForUpdate(currentVersion: string): void {
  if (process.env.TSK_NO_UPDATE_CHECK === "1") return;

  const cache = readCache();

  if (cache) {
    const elapsed = Date.now() - new Date(cache.lastCheck).getTime();
    if (elapsed < CHECK_INTERVAL_MS) {
      // Use cached result
      if (compareVersions(cache.latestVersion, currentVersion) > 0) {
        console.error(
          `A new version of tsk is available (v${cache.latestVersion}). Run 'tsk upgrade' to update.`
        );
      }
      return;
    }
  }

  // Fire-and-forget background check
  fetch("https://api.github.com/repos/SeanoNET/tsk/releases/latest", {
    headers: { Accept: "application/vnd.github.v3+json" },
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => res.json())
    .then((data: any) => {
      const latest = (data.tag_name as string || "").replace(/^v/, "");
      if (latest) {
        writeCache({ lastCheck: new Date().toISOString(), latestVersion: latest });
      }
    })
    .catch(() => {
      // Silently ignore network errors
    });
}

export { compareVersions };
