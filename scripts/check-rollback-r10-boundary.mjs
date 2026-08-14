import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const hosting = JSON.parse(readFileSync(`${root}.openai/hosting.json`, "utf8"));
const marker = JSON.parse(
  readFileSync(`${root}.openai/preprod-demo-only.json`, "utf8"),
);
const expectedSourceBranch = "codex/aj-luxury-rollback-r10-20260814";
const expectedMigrations = [
  "0000_flimsy_rhino.sql",
  "0001_lock_cart_line_price_provenance.sql",
  "0002_lock_order_line_snapshots.sql",
  "0003_identity_access.sql",
  "0004_email_outbox_data_rights.sql",
  "0005_fulfillment_returns_refunds.sql",
  "0006_allow_bounded_expired_cart_purge.sql",
  "0007_transactional_preprod_order_payment.sql",
  "0008_preprod_synthetic_demo_dataset.sql",
  "0009_shipping_quote_parcel_snapshots.sql",
  "0010_multicarrier_delivery_foundation.sql",
];
const expectedSha256 = Object.freeze({
  "drizzle/0008_preprod_synthetic_demo_dataset.sql":
    "794e1c67471427ba3d92e979e79e07a8393244794d7d98b827db6b0fda07b5b5",
  "drizzle/0009_shipping_quote_parcel_snapshots.sql":
    "5c880df646f8d9274e768b6895c46715de3cfe74632eeebb643fe27da655e0ed",
  "drizzle/0010_multicarrier_delivery_foundation.sql":
    "12cfa7e31139229408601c6fa63a9e0c1dbb0e369c69ab7b8fa7a97472488975",
  "drizzle/meta/_journal.json":
    "61f1fb917e9e764e00e052e8ca9fa97e866ab38f739e9af6eccd1b83e4711591",
  "drizzle/meta/0010_snapshot.json":
    "618fc41c68f41ce059101b14ff39bb761ea2a502cd17a766d1bfb6a648562250",
  "db/schema.ts":
    "81a829e8c591137301897f7f2e5fe75fa9b14f2e75164eee45cdb0ad14e6d4d8",
});

assert.deepEqual(marker, {
  project_id: "appgprj_6a7d223ffdec8191b360551446150216",
  dataset_kind: "synthetic-demo",
  fixture_version: "aj-demo-v1",
  expires_at: "2026-09-30T23:59:59.999Z",
  runtime_mode: "post-0010-rollback",
  production_promotion: "forbidden",
  allowed_source_branch: expectedSourceBranch,
});
assert.equal(marker.project_id, hosting.project_id);
assert.deepEqual(
  readdirSync(`${root}drizzle`)
    .filter((name) => /^\d{4}.*\.sql$/.test(name))
    .sort(),
  expectedMigrations,
);

for (const [relativePath, expectedHash] of Object.entries(expectedSha256)) {
  const bytes = readFileSync(`${root}${relativePath}`);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    expectedHash,
    `${relativePath} must stay byte-identical to the reviewed R10 input`,
  );
}

const journal = JSON.parse(
  readFileSync(`${root}drizzle/meta/_journal.json`, "utf8"),
);
assert.deepEqual(
  journal.entries.map(({ idx, tag }) => ({ idx, tag })),
  expectedMigrations.map((name, idx) => ({
    idx,
    tag: name.replace(/\.sql$/, ""),
  })),
);
assert.ok(
  journal.entries.every((entry, index, entries) =>
    index === 0 || entry.when > entries[index - 1].when
  ),
  "D1 migration journal timestamps must be strictly monotone",
);

const snapshot = JSON.parse(
  readFileSync(`${root}drizzle/meta/0010_snapshot.json`, "utf8"),
);
const previousSnapshot = JSON.parse(
  readFileSync(`${root}drizzle/meta/0009_snapshot.json`, "utf8"),
);
assert.equal(snapshot.prevId, previousSnapshot.id);
for (const tableName of [
  "delivery_option_snapshots",
  "delivery_service_point_snapshots",
  "shipping_document_metadata",
]) {
  assert.ok(snapshot.tables[tableName], `${tableName} missing from 0010 snapshot`);
}

const migration = readFileSync(
  `${root}drizzle/0010_multicarrier_delivery_foundation.sql`,
  "utf8",
);
const executableMigration = migration.replace(/^--.*$/gm, "");
assert.doesNotMatch(executableMigration, /ALTER TABLE|DROP TABLE|DROP TRIGGER/i);
assert.doesNotMatch(
  executableMigration,
  /https?:|api[_-]?key|secret|authorization|label_url|barcode/i,
);

if (
  process.env.APP_ENV !== "preproduction" ||
  process.env.PREPROD_TARGET_PROJECT_ID !== hosting.project_id
) {
  throw new Error(
    "Rollback R10 requires the exact private-preproduction environment and target project.",
  );
}
if (process.env.GITHUB_ACTIONS === "true") {
  const sourceBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (sourceBranch !== expectedSourceBranch) {
    throw new Error(
      `Rollback R10 CI is restricted to ${expectedSourceBranch}.`,
    );
  }
}
if (
  process.env.GITHUB_REF_NAME === "main" ||
  process.env.GITHUB_BASE_REF === "main"
) {
  throw new Error(
    "Rollback R10 cannot be built from or proposed to the production main branch.",
  );
}
