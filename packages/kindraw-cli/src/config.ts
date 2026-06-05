// Persists the CLI credentials (PAT + base URL) at ~/.config/kindraw/config.json
// with 0600 perms. KINDRAW_TOKEN / KINDRAW_API_BASE_URL env vars override (CI).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type KindrawConfig = {
  token?: string;
  baseUrl?: string;
};

const configDir = () =>
  process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "kindraw")
    : path.join(os.homedir(), ".config", "kindraw");

const configPath = () => path.join(configDir(), "config.json");

export const loadConfig = (): KindrawConfig => {
  const fromEnv: KindrawConfig = {};
  if (process.env.KINDRAW_TOKEN) {
    fromEnv.token = process.env.KINDRAW_TOKEN;
  }
  if (process.env.KINDRAW_API_BASE_URL) {
    fromEnv.baseUrl = process.env.KINDRAW_API_BASE_URL;
  }

  let fromFile: KindrawConfig = {};
  try {
    fromFile = JSON.parse(fs.readFileSync(configPath(), "utf8")) as KindrawConfig;
  } catch {
    // no config file yet
  }

  // env wins over file
  return { ...fromFile, ...fromEnv };
};

export const saveConfig = (config: KindrawConfig): void => {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = configPath();
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best effort on platforms without chmod
  }
};

export const clearConfig = (): void => {
  try {
    fs.rmSync(configPath());
  } catch {
    // already gone
  }
};
