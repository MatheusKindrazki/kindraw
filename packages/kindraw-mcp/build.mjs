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
  external: [
    "@kindraw/client",
    "@kindraw/client/generate",
    "@kindraw/client/scene",
    "@kindraw/client/boards",
    "@modelcontextprotocol/sdk",
    "zod",
  ],
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});

// eslint-disable-next-line no-console
console.log("@kindraw/mcp built → dist/index.js");
