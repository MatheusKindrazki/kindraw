import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.resolve(__dirname, "src/index.ts")],
  outfile: path.resolve(__dirname, "dist/index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  // @kindraw/client (and its heavy deps) are resolved from node_modules at run
  // time; keep them external so the CLI bundle stays tiny.
  external: ["@kindraw/client", "@kindraw/client/generate"],
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});

// eslint-disable-next-line no-console
console.log("@kindraw/cli built → dist/index.js");
