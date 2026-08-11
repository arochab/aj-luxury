import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";

import { analyticsServerBoundaryPlugin } from "../lib/build/analytics-server-boundary.ts";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

await viteBuild({
  configFile: false,
  root: projectRoot,
  publicDir: false,
  cacheDir: join(projectRoot, "node_modules", ".vite-analytics-check"),
  logLevel: "silent",
  plugins: [analyticsServerBoundaryPlugin(projectRoot)],
  build: {
    write: false,
    minify: false,
    rollupOptions: {
      input: join(projectRoot, "lib", "analytics", "index.ts"),
    },
  },
});

console.log("Analytics public client boundary: real Vite build passed.");
