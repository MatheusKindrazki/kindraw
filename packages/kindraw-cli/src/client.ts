import { KindrawClient, DEFAULT_API_BASE_URL } from "@kindraw/client";

import { loadConfig } from "./config.js";

// Builds a KindrawClient from saved credentials, with a friendly error if the
// user hasn't logged in yet.
export const requireClient = (): KindrawClient => {
  const config = loadConfig();
  if (!config.token) {
    throw new Error('Not logged in. Run "kindraw login" first.');
  }
  return new KindrawClient({
    token: config.token,
    baseUrl: config.baseUrl || DEFAULT_API_BASE_URL,
  });
};
