import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const plan = JSON.parse(readFileSync(`${root}drizzle/production-migrations.json`, "utf8"));
const journal = JSON.parse(readFileSync(`${root}drizzle/meta/_journal.json`, "utf8"));
const synthetic = "0008_preprod_synthetic_demo_dataset.sql";

assert.equal(plan.protocol, "ajl-production-migrations-v1");
assert.deepEqual(plan.excluded, [synthetic]);
assert.ok(Array.isArray(plan.ordered) && plan.ordered.length > 0);
assert.equal(new Set(plan.ordered).size, plan.ordered.length);
assert.equal(plan.ordered.includes(synthetic), false);
assert.ok(plan.ordered.every((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)));
assert.ok(plan.ordered.every((name) => existsSync(`${root}drizzle/${name}`)));

const expected = journal.entries
  .map((entry) => `${entry.tag}.sql`)
  .filter((name) => name !== synthetic);
assert.deepEqual(
  plan.ordered,
  expected,
  "Production D1 must use the explicit journal order with only migration 0008 excluded.",
);
assert.match(
  readFileSync(`${root}drizzle/${synthetic}`, "utf8"),
  /PREPRODUCTION-ONLY SYNTHETIC DATASET/,
);

if (process.argv.includes("--print")) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}
