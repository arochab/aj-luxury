import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAnalyticsClientBoundary } from "../lib/build/analytics-server-boundary.ts";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const checked = assertAnalyticsClientBoundary(projectRoot);

console.log(
  `Analytics client boundary: ${checked.roots} roots and ${checked.modules} modules checked.`,
);
