import assert from "node:assert/strict";
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
const allowedSourceBranch = "codex/lot2-preprod-synthetic-demo-20260813";

assert.equal(marker.production_promotion, "forbidden");
assert.equal(marker.dataset_kind, SYNTHETIC_DEMO_DATASET_KIND);
assert.equal(marker.fixture_version, SYNTHETIC_DEMO_FIXTURE_VERSION);
assert.equal(marker.expires_at, SYNTHETIC_DEMO_EXPIRES_AT);
assert.equal(marker.project_id, hosting.project_id);
assert.match(migration, /PREPRODUCTION-ONLY SYNTHETIC DATASET/);
assert.match(migration, new RegExp(SYNTHETIC_DEMO_MIGRATION.replace(".sql", "")));
assert.match(migration, new RegExp(SYNTHETIC_DEMO_DATASET_KIND, "g"));
assert.match(migration, new RegExp(SYNTHETIC_DEMO_FIXTURE_VERSION, "g"));
assert.match(migration, new RegExp(SYNTHETIC_DEMO_EXPIRES_AT.replaceAll(".", "\\."), "g"));
assert.doesNotMatch(migration, /DHL/i);

if (
  process.env.APP_ENV !== "preproduction" ||
  process.env.PREPROD_TARGET_PROJECT_ID !== hosting.project_id
) {
  throw new Error(
    "Synthetic migration 0008 requires the exact preproduction environment and target project.",
  );
}
if (process.env.GITHUB_ACTIONS === "true") {
  const sourceBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (sourceBranch !== allowedSourceBranch) {
    throw new Error(
      `Synthetic migration 0008 CI is restricted to ${allowedSourceBranch}.`,
    );
  }
}
if (
  process.env.GITHUB_REF_NAME === "main" ||
  process.env.GITHUB_BASE_REF === "main"
) {
  throw new Error(
    "Synthetic migration 0008 cannot be built from or proposed to the production main branch.",
  );
}
