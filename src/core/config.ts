import { parse, stringify } from "smol-toml";
import { configPath } from "./paths.js";

export interface TskConfig {
  core: {
    timezone: string;
    editor?: string;
    defaultPriority: string;
    defaultStatus: string;
  };
  sync: {
    enabled: boolean;
    intervalSeconds: number;
    clientId?: string;
    todoListName?: string;
    remote?: string;
    remoteUrl?: string;
    branch?: string;
    autoSync?: boolean;
    conflictStrategy?: "last-write-wins" | "keep-both";
  };
}

export const DEFAULT_CONFIG: TskConfig = {
  core: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    defaultPriority: "none",
    defaultStatus: "inbox",
  },
  sync: {
    enabled: false,
    intervalSeconds: 60,
  },
};

export async function readConfig(): Promise<TskConfig> {
  const file = Bun.file(configPath());
  if (!(await file.exists())) return structuredClone(DEFAULT_CONFIG);
  const text = await file.text();
  const parsed = parse(text) as Record<string, unknown>;
  // Deep merge with defaults so missing sections (e.g. [sync]) don't crash
  return {
    core: { ...DEFAULT_CONFIG.core, ...(parsed.core as Record<string, unknown> ?? {}) },
    sync: { ...DEFAULT_CONFIG.sync, ...(parsed.sync as Record<string, unknown> ?? {}) },
  } as TskConfig;
}

export async function writeConfig(config: TskConfig): Promise<void> {
  await Bun.write(configPath(), stringify(config as unknown as Record<string, unknown>));
}
