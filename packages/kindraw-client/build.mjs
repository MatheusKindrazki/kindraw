// Bundles @kindraw/client for Node. Two entrypoints:
//   index.js    — HTTP client + auth (light)
//   generate.js — Mermaid→Excalidraw (bundles @excalidraw/* element transform)
//
// @excalidraw/* workspace packages are bundled (resolved via alias to source)
// so the published package runs on a user's machine without the monorepo.
// jsdom/canvas/mermaid stay external (real npm deps, installed by the consumer).

import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

// Map @excalidraw/<pkg> and @excalidraw/<pkg>/<subpath> to workspace source,
// mirroring the regex aliases in vitest.config.mts (exact-match `alias` can't
// handle subpath imports the element transform relies on).
const PKG_ROOTS = {
  common: path.resolve(repoRoot, "packages/common/src"),
  element: path.resolve(repoRoot, "packages/element/src"),
  math: path.resolve(repoRoot, "packages/math/src"),
  utils: path.resolve(repoRoot, "packages/utils/src"),
  excalidraw: path.resolve(repoRoot, "packages/excalidraw"),
};

const resolveExisting = (base) => {
  for (const ext of [".ts", ".tsx", ".js", "/index.ts", "/index.tsx"]) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  if (fs.existsSync(base) && fs.statSync(base).isFile()) {
    return base;
  }
  return null;
};

const excalidrawResolver = {
  name: "excalidraw-workspace-resolver",
  setup(buildApi) {
    buildApi.onResolve({ filter: /^@excalidraw\// }, (args) => {
      if (args.path === "@excalidraw/mermaid-to-excalidraw") {
        return; // external
      }
      const rest = args.path.slice("@excalidraw/".length);
      const [pkg, ...subParts] = rest.split("/");
      const root = PKG_ROOTS[pkg];
      if (!root) {
        return;
      }
      if (subParts.length === 0) {
        const entry =
          pkg === "excalidraw"
            ? path.join(root, "index.tsx")
            : path.join(root, "index.ts");
        return { path: entry };
      }
      const resolved = resolveExisting(path.join(root, subParts.join("/")));
      return resolved ? { path: resolved } : undefined;
    });
  },
};

const shared = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  outdir: "dist",
  plugins: [excalidrawResolver],
  // Keep native/heavy runtime deps external (installed at the consumer).
  external: ["jsdom", "canvas", "@excalidraw/mermaid-to-excalidraw"],
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
    "import.meta.env.MODE": '"production"',
  },
  loader: { ".woff2": "dataurl", ".ttf": "dataurl", ".svg": "text" },
  logLevel: "info",
};

await build({
  ...shared,
  entryPoints: {
    index: path.resolve(__dirname, "src/index.ts"),
    generate: path.resolve(__dirname, "src/generate.ts"),
  },
});

// Emit type declarations for consumers (CLI, MCP) via tsc.
const { execSync } = await import("node:child_process");
execSync(
  "npx tsc --emitDeclarationOnly --declaration --outDir dist " +
    "--module ESNext --moduleResolution Bundler --target ES2022 " +
    "--skipLibCheck --types node src/index.ts src/client.ts src/auth.ts src/generate.ts src/dom.ts",
  { cwd: __dirname, stdio: "inherit" },
);

// eslint-disable-next-line no-console
console.log("@kindraw/client built → dist/index.js, dist/generate.js (+ .d.ts)");
