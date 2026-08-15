import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const plan = JSON.parse(readFileSync(join(root, "drizzle", "production-migrations.json"), "utf8"));
const apply = process.argv.includes("--apply");
const releaseSha = process.env.COMMERCE_RELEASE_SHA ?? "";
assert.match(releaseSha, /^[0-9a-f]{40}$/, "COMMERCE_RELEASE_SHA must be the exact immutable release SHA.");

const staging = resolve(root, "migration-staging", `production-${releaseSha}`);
assert.ok(staging.startsWith(`${root}${sep}`), "Production migration staging escaped the project.");
const migrations = join(staging, "migrations");
mkdirSync(migrations, { recursive: true });

const wanted = new Set(plan.ordered);
assert.equal(wanted.has("0008_preprod_synthetic_demo_dataset.sql"), false);
for (const present of readdirSync(migrations)) {
  assert.ok(wanted.has(present), `Unexpected production migration artifact: ${present}`);
}
for (const name of plan.ordered) {
  assert.equal(basename(name), name);
  const source = join(root, "drizzle", name);
  const destination = join(migrations, name);
  if (!existsSync(destination)) copyFileSync(source, destination, constants.COPYFILE_EXCL);
  const sourceHash = createHash("sha256").update(readFileSync(source)).digest("hex");
  const destinationHash = createHash("sha256").update(readFileSync(destination)).digest("hex");
  assert.equal(destinationHash, sourceHash, `${name} staging bytes drifted from the reviewed source.`);
}
assert.deepEqual(readdirSync(migrations).sort(), [...wanted].sort());

if (!apply) {
  process.stdout.write(`${JSON.stringify({ releaseSha, staging: relative(root, staging), migrationCount: wanted.size, synthetic0008Included: false })}\n`);
  process.exit(0);
}

assert.equal(process.env.APP_ENV, "production");
assert.equal(process.env.PREPROD_DEMO_DATASET, undefined);
assert.equal(
  process.env.PRODUCTION_MIGRATION_APPROVAL_SHA,
  releaseSha,
  "PRODUCTION_MIGRATION_APPROVAL_SHA must match the exact release SHA.",
);
assert.equal(
  process.env.PRODUCTION_MIGRATION_APPLY_CONFIRMATION,
  "APPLY_PRODUCTION_D1_WITHOUT_SYNTHETIC_0008",
);
assert.match(process.env.PRODUCTION_D1_DATABASE_ID ?? "", /^[0-9a-f-]{32,36}$/i);
assert.match(process.env.PRODUCTION_D1_DATABASE_NAME ?? "", /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,127}$/);
const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
assert.equal(status.status, 0);
assert.equal(status.stdout, "", "Production migration apply requires a clean exact-SHA worktree.");
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
assert.equal(head.status, 0);
assert.equal(head.stdout.trim(), releaseSha);

const configuration = {
  $schema: "../../node_modules/wrangler/config-schema.json",
  name: "aj-luxury-production-d1-migrations",
  compatibility_date: "2026-08-15",
  d1_databases: [{
    binding: "DB",
    database_name: process.env.PRODUCTION_D1_DATABASE_NAME,
    database_id: process.env.PRODUCTION_D1_DATABASE_ID,
    migrations_dir: "migrations",
  }],
};
const configurationPath = join(staging, "wrangler.production.json");
writeFileSync(configurationPath, `${JSON.stringify(configuration, null, 2)}\n`, { flag: "wx" });
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["wrangler", "d1", "migrations", "apply", "DB", "--remote", "--config", configurationPath],
  { cwd: staging, stdio: "inherit", shell: false },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
