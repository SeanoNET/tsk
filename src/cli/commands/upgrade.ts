import { defineCommand } from "citty";
import { writeFileSync, renameSync, unlinkSync, chmodSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import pkg from "../../../package.json";
import { compareVersions } from "../../core/update-check.js";
import { tskDir } from "../../core/paths.js";

const PLATFORM_MAP: Record<string, string> = {
  "linux-x64": "tsk-linux-x64",
  "linux-arm64": "tsk-linux-arm64",
  "darwin-x64": "tsk-darwin-x64",
  "darwin-arm64": "tsk-darwin-arm64",
  "win32-x64": "tsk-windows-x64.exe",
};

export const upgradeCommand = defineCommand({
  meta: { name: "upgrade", description: "Upgrade tsk to the latest version" },
  async run() {
    const currentVersion = pkg.version;
    console.log(`Current version: v${currentVersion}`);
    console.log("Checking for updates...");

    const res = await fetch("https://api.github.com/repos/SeanoNET/tsk/releases/latest", {
      headers: { Accept: "application/vnd.github.v3+json" },
    });

    if (!res.ok) {
      console.error(`Failed to check for updates: HTTP ${res.status}`);
      process.exit(1);
    }

    const data = (await res.json()) as any;
    const latestVersion = (data.tag_name as string).replace(/^v/, "");

    if (compareVersions(latestVersion, currentVersion) <= 0) {
      console.log(`Already up to date (v${currentVersion}).`);
      return;
    }

    const key = `${process.platform}-${process.arch}`;
    const artifactName = PLATFORM_MAP[key];
    if (!artifactName) {
      console.error(`Unsupported platform: ${key}`);
      process.exit(1);
    }

    const downloadUrl = `https://github.com/SeanoNET/tsk/releases/download/${latestVersion}/${artifactName}`;
    console.log(`Downloading v${latestVersion}...`);

    const dlRes = await fetch(downloadUrl);
    if (!dlRes.ok) {
      console.error(`Failed to download: HTTP ${dlRes.status}`);
      process.exit(1);
    }

    const binary = new Uint8Array(await dlRes.arrayBuffer());
    const execPath = process.execPath;
    const tempPath = join(dirname(execPath), `.tsk-upgrade-${Date.now()}`);

    try {
      writeFileSync(tempPath, binary);

      if (process.platform === "win32") {
        const oldPath = execPath + ".old";
        try { unlinkSync(oldPath); } catch {}
        renameSync(execPath, oldPath);
        renameSync(tempPath, execPath);
        try { unlinkSync(oldPath); } catch {}
      } else {
        chmodSync(tempPath, 0o755);
        renameSync(tempPath, execPath);
      }
    } catch (e: unknown) {
      try { unlinkSync(tempPath); } catch {}
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to replace binary: ${msg}`);
      process.exit(1);
    }

    // Update the cache with previousVersion so next run shows "just upgraded" message
    try {
      mkdirSync(tskDir(), { recursive: true });
      writeFileSync(
        join(tskDir(), "update-check.json"),
        JSON.stringify({
          lastCheck: new Date().toISOString(),
          latestVersion,
          previousVersion: currentVersion,
        }, null, 2)
      );
    } catch {}

    console.log(`Upgraded tsk: v${currentVersion} → v${latestVersion}`);
  },
});
