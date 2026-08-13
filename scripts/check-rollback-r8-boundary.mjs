import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const hosting = JSON.parse(readFileSync(`${root}.openai/hosting.json`, "utf8"));
const markerBytes = readFileSync(`${root}.openai/preprod-demo-only.json`);
const marker = JSON.parse(markerBytes.toString("utf8"));
const migration = readFileSync(
  `${root}drizzle/0008_preprod_synthetic_demo_dataset.sql`,
);
const allowedSourceBranch = "codex/aj-luxury-rollback-r8-20260813";

assert.deepEqual(marker, {
  project_id: "appgprj_6a7d223ffdec8191b360551446150216",
  dataset_kind: "synthetic-demo",
  fixture_version: "aj-demo-v1",
  expires_at: "2026-09-30T23:59:59.999Z",
  runtime_mode: "post-0008-rollback",
  production_promotion: "forbidden",
});
assert.equal(marker.project_id, hosting.project_id);
assert.equal(
  createHash("sha256").update(migration).digest("hex"),
  "794e1c67471427ba3d92e979e79e07a8393244794d7d98b827db6b0fda07b5b5",
);
assert.deepEqual(
  readdirSync(`${root}drizzle`)
    .filter((name) => /^\d{4}.*\.sql$/.test(name))
    .sort(),
  [
    "0000_flimsy_rhino.sql",
    "0001_lock_cart_line_price_provenance.sql",
    "0002_lock_order_line_snapshots.sql",
    "0003_identity_access.sql",
    "0004_email_outbox_data_rights.sql",
    "0005_fulfillment_returns_refunds.sql",
    "0006_allow_bounded_expired_cart_purge.sql",
    "0007_transactional_preprod_order_payment.sql",
    "0008_preprod_synthetic_demo_dataset.sql",
  ],
);

if (
  process.env.APP_ENV !== "preproduction" ||
  process.env.PREPROD_TARGET_PROJECT_ID !== hosting.project_id
) {
  throw new Error(
    "Rollback R8 requires the exact private-preproduction environment and target project.",
  );
}
if (process.env.GITHUB_ACTIONS === "true") {
  const sourceBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (sourceBranch !== allowedSourceBranch) {
    throw new Error(`Rollback R8 CI is restricted to ${allowedSourceBranch}.`);
  }
}
if (
  process.env.GITHUB_REF_NAME === "main" ||
  process.env.GITHUB_BASE_REF === "main"
) {
  throw new Error(
    "Rollback R8 cannot be built from or proposed to the production main branch.",
  );
}
