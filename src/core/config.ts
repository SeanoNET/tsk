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
  if (!(await file.exists())) return { ...DEFAULT_CONFIG };
  const text = await file.text();
  return parse(text) as unknown as TskConfig;
}

export async function writeConfig(config: TskConfig): Promise<void> {
  await Bun.write(configPath(), stringify(config as unknown as Record<string, unknown>));
}
