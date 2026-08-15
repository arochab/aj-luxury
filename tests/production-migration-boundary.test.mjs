import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const releaseSha = "f".repeat(40);

test("production applicator materializes only the reviewed non-synthetic migration chain", () => {
  const result = spawnSync(process.execPath, ["scripts/production-d1-migrations.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, COMMERCE_RELEASE_SHA: releaseSha },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.synthetic0008Included, false);
  const plan = JSON.parse(readFileSync(`${root}drizzle/production-migrations.json`, "utf8"));
  const files = readdirSync(`${root}${report.staging}/migrations`).sort();
  assert.deepEqual(files, [...plan.ordered].sort());
  assert.equal(files.includes("0008_preprod_synthetic_demo_dataset.sql"), false);
});

test("remote production apply refuses missing same-SHA approval before Wrangler", () => {
  const result = spawnSync(process.execPath, ["scripts/production-d1-migrations.mjs", "--apply"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, COMMERCE_RELEASE_SHA: releaseSha, APP_ENV: "production" },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PRODUCTION_MIGRATION_APPROVAL_SHA/);
});
