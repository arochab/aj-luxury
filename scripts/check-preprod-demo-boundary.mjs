import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SYNTHETIC_DEMO_DATASET_KIND,
  SYNTHETIC_DEMO_EXPIRES_AT,
  SYNTHETIC_DEMO_FIXTURE_VERSION,
  SYNTHETIC_DEMO_MIGRATION,
} from "../lib/preprod/synthetic-demo.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const hosting = JSON.parse(readFileSync(`${root}.openai/hosting.json`, "utf8"));
const marker = JSON.parse(
  readFileSync(`${root}.openai/preprod-demo-only.json`, "utf8"),
);
const migration = readFileSync(
  `${root}drizzle/0008_preprod_synthetic_demo_dataset.sql`,
  "utf8",
);
const journal = JSON.parse(readFileSync(`${root}drizzle/meta/_journal.json`, "utf8"));
const expectedSourceBranches = [
  "codex/lot2-preprod-synthetic-demo-20260813",
  "codex/lot2-preprod-owner-account-tracking-20260813",
  "codex/ajl-ship-profiles-20260813",
  "codex/ajl-private-preview-final-20260813",
  "codex/ajl-multicarrier-fulfillment-20260813",
];
const releaseBuildEpoch = 1786622400000;
const frozenMigrationHash =
  "794e1c67471427ba3d92e979e79e07a8393244794d7d98b827db6b0fda07b5b5";
const productionFrontendProjectIds = new Set([
  "appgprj_6a81995167048191b50b37833695f3dc",
  "appgprj_6a63835f347c819187cdbb7ee16641cc",
]);

assert.equal(marker.production_promotion, "forbidden");
assert.equal(marker.dataset_kind, SYNTHETIC_DEMO_DATASET_KIND);
assert.equal(marker.fixture_version, SYNTHETIC_DEMO_FIXTURE_VERSION);
assert.equal(marker.expires_at, SYNTHETIC_DEMO_EXPIRES_AT);
assert.deepEqual(marker.allowed_source_branches, expectedSourceBranches);
assert.match(migration, /PREPRODUCTION-ONLY SYNTHETIC DATASET/);
assert.match(migration, new RegExp(SYNTHETIC_DEMO_MIGRATION.replace(".sql", "")));
assert.match(migration, new RegExp(SYNTHETIC_DEMO_DATASET_KIND, "g"));
assert.match(migration, new RegExp(SYNTHETIC_DEMO_FIXTURE_VERSION, "g"));
assert.match(migration, new RegExp(SYNTHETIC_DEMO_EXPIRES_AT.replaceAll(".", "\\."), "g"));
assert.doesNotMatch(migration, /DHL/i);
assert.equal(
  createHash("sha256").update(migration).digest("hex"),
  frozenMigrationHash,
  "0008 SQL must remain byte-identical",
);
assert.ok(
  journal.entries.every((entry, index, entries) =>
    index === 0 || entry.when > entries[index - 1].when
  ),
  "D1 migration journal timestamps must be strictly monotone",
);
const syntheticMigration = journal.entries.find(
  (entry) => entry.tag === "0008_preprod_synthetic_demo_dataset",
);
assert.ok(syntheticMigration);
assert.equal(syntheticMigration.when, releaseBuildEpoch);
const terminalMigration = journal.entries.at(-1);
assert.equal(terminalMigration.tag, "0020_launch_stock_current_grid");
assert.ok(
  terminalMigration.when > releaseBuildEpoch,
  "the additive current-stock migration must follow the frozen synthetic release",
);

const preproductionBuild = process.env.APP_ENV === "preproduction" &&
  process.env.PREPROD_TARGET_PROJECT_ID === marker.project_id;
const productionFrontendBuild = process.env.APP_ENV === "production" &&
  !process.env.PREPROD_TARGET_PROJECT_ID &&
  productionFrontendProjectIds.has(hosting.project_id) &&
  hosting.d1 === null;
if (!preproductionBuild && !productionFrontendBuild) {
  throw new Error(
    "Build target must be the exact synthetic preproduction project or a D1-detached production frontend.",
  );
}
if (preproductionBuild && process.env.GITHUB_ACTIONS === "true") {
  const sourceBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (!marker.allowed_source_branches.includes(sourceBranch)) {
    throw new Error(
      "Synthetic migration 0008 CI is restricted to governed preproduction branches.",
    );
  }
}
if (preproductionBuild && (
  process.env.GITHUB_REF_NAME === "main" ||
  process.env.GITHUB_BASE_REF === "main"
)) {
  throw new Error(
    "Synthetic migration 0008 cannot be built from or proposed to the production main branch.",
  );
}
