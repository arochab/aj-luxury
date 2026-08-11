import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { cwd, env, exit } from "node:process";

const root = cwd();
const demoRoots = ["lib/demo", "app/components/demo"];
const sourceRoots = ["app", "lib", "worker"];
const sourceExtensions = new Set([".ts", ".tsx", ".mjs"]);

function walk(relativeRoot) {
  const absoluteRoot = join(root, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];

  return readdirSync(absoluteRoot, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(absoluteRoot, entry.name);
    const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
    return entry.isDirectory() ? walk(relativePath) : [relativePath];
  });
}

const isAuthorizedDemoBuild =
  env.AJ_RUNTIME === "demo" && env.AJ_ENVIRONMENT === "preproduction";

if (isAuthorizedDemoBuild) {
  console.log("AJ Luxury demo boundary: authorized preproduction build.");
  exit(0);
}

const violations = [];
for (const demoRoot of demoRoots) {
  if (existsSync(join(root, demoRoot))) violations.push(demoRoot);
}

for (const sourceRoot of sourceRoots) {
  for (const file of walk(sourceRoot)) {
    if (!sourceExtensions.has(extname(file))) continue;
    if (readFileSync(join(root, file), "utf8").includes("DEMO-DHL")) {
      violations.push(`${file}:DEMO-DHL`);
    }
  }
}

if (violations.length > 0) {
  console.error(
    [
      "AJ Luxury production build blocked: private demo material is present.",
      "Required gate: AJ_RUNTIME=demo and AJ_ENVIRONMENT=preproduction.",
      ...[...new Set(violations)].sort().map((item) => `- ${item}`),
    ].join("\n"),
  );
  exit(1);
}

console.log("AJ Luxury demo boundary: no private demo material detected.");
