import { startLoopbackLogin, DEFAULT_API_BASE_URL } from "@kindraw/client";

import { loadConfig, saveConfig, clearConfig } from "../config.js";

export const login = async (args: { baseUrl?: string }): Promise<void> => {
  const baseUrl =
    args.baseUrl || loadConfig().baseUrl || DEFAULT_API_BASE_URL;
  console.log("Connecting Kindraw with your GitHub account…");
  const { secret, prefix } = await startLoopbackLogin({
    apiBaseUrl: baseUrl,
    tokenName: "kindraw CLI",
  });
  saveConfig({ token: secret, baseUrl });
  console.log(`\n✅ Logged in. Token ${prefix || "(saved)"} stored in ~/.config/kindraw/config.json`);
};

export const logout = async (): Promise<void> => {
  clearConfig();
  console.log("Logged out. Local credentials removed.");
};
