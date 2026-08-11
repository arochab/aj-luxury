import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";

import {
  ANALYTICS_CLIENT_BOUNDARY_ERROR,
  analyticsServerBoundaryPlugin,
  findAnalyticsServerArtifactMarker,
} from "../lib/build/analytics-server-boundary.ts";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? listFiles(path) : [path];
      }),
    )
  ).flat();
}

if (process.argv.includes("--artifacts")) {
  const clientRoot = join(projectRoot, "dist", "client");
  for (const path of await listFiles(clientRoot)) {
    const contents = await readFile(path);
    const marker = findAnalyticsServerArtifactMarker(contents);
    if (marker) {
      throw new Error(
        `${ANALYTICS_CLIENT_BOUNDARY_ERROR}: ${path.slice(clientRoot.length + 1)} emitted-artifact ${JSON.stringify(marker)}`,
      );
    }
  }
  console.log("Analytics final client artifacts: passed.");
} else {
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
}
