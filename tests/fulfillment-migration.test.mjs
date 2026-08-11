import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const workspaceRoot = resolve(projectRoot, "../../../../..");
const migrationRoot = join(projectRoot, "drizzle");
const wranglerCli = join(
  projectRoot,
  "node_modules",
  "wrangler",
  "wrangler-dist",
  "cli.js",
);
const migrationNames = [
  "0000_flimsy_rhino.sql",
  "0001_lock_cart_line_price_provenance.sql",
  "0002_lock_order_line_snapshots.sql",
  "0003_identity_access.sql",
  "0004_email_outbox_data_rights.sql",
  "0005_fulfillment_returns_refunds.sql",
];
const legacyHashes = Object.freeze({
  "0000_flimsy_rhino.sql":
    "6e6262fa635e9808c00493adb1badbf51a1c3d75b2e1112fe567632c526859b4",
  "0001_lock_cart_line_price_provenance.sql":
    "bef3cc80b9201217050dd5e80362927f3c560bb1c239ac8fd08de2f88aaf08de",
  "0002_lock_order_line_snapshots.sql":
    "fe72f739c3459f931830054715b8efc268ab86c42d2479d99b4cedc7fe2196fa",
  "0003_identity_access.sql":
    "21c163102b0bdbdcdf871177667d92338ed4cad9e8ec1a0322025478f0efff09",
  "0004_email_outbox_data_rights.sql":
    "e36dfa8d25f863ab82f2ab3ba784574dd48e5d6d819be50226890a7a867cc91d",
});

function environment(root) {
  const temp = join(root, "temp");
  mkdirSync(temp, { recursive: true });
  const result = {
    CI: "1",
    FORCE_COLOR: "0",
    MINIFLARE_REGISTRY_PATH: join(root, "registry"),
    NO_COLOR: "1",
    NO_UPDATE_NOTIFIER: "1",
    TEMP: temp,
    TMP: temp,
    WRANGLER_HIDE_BANNER: "true",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
  };
  for (const name of ["ComSpec", "Path", "PATH", "SystemRoot", "WINDIR"]) {
    if (process.env[name]) result[name] = process.env[name];
  }
  return result;
}

function createConfig(root, names) {
  const migrations = join(root, "migrations");
  mkdirSync(migrations, { recursive: true });
  for (const name of names) {
    copyFileSync(join(migrationRoot, name), join(migrations, name));
  }
  writeFileSync(
    join(root, "worker.js"),
    "export default { fetch() { return new Response('local'); } };\n",
    "utf8",
  );
  const configPath = join(root, "wrangler.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      name: "aj-luxury-d03-local-proof",
      main: "worker.js",
      compatibility_date: "2026-08-11",
      d1_databases: [
        {
          binding: "DB",
          database_name: "aj-luxury-d03-local",
          database_id: "00000000-0000-4000-8000-000000000000",
          migrations_dir: "migrations",
        },
      ],
    }),
    "utf8",
  );
  return configPath;
}

function run(root, args, expectFailure = false) {
  assert.ok(args.includes("--local"));
  assert.ok(!args.includes("--remote"));
  const result = spawnSync(process.execPath, [wranglerCli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: environment(root),
    timeout: 60_000,
    windowsHide: true,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(
    /\u001b\[[0-?]*[ -/]*[@-~]/g,
    "",
  );
  assert.equal(result.error, undefined, output);
  if (expectFailure) assert.notEqual(result.status, 0, output);
  else assert.equal(result.status, 0, output);
  return output;
}

function apply(root, configPath, state) {
  return run(root, [
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    configPath,
    "--persist-to",
    state,
  ]);
}

function query(root, configPath, state, sql, expectFailure = false) {
  const output = run(
    root,
    [
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      configPath,
      "--persist-to",
      state,
      "--command",
      sql,
      "--json",
    ],
    expectFailure,
  );
  if (expectFailure) return output;
  return JSON.parse(output)[0].results;
}

test("0005 is additive, journaled and leaves 0000 through 0004 byte-identical", () => {
  for (const [name, expected] of Object.entries(legacyHashes)) {
    const normalized = readFileSync(join(migrationRoot, name), "utf8").replaceAll(
      "\r\n",
      "\n",
    );
    assert.equal(createHash("sha256").update(normalized).digest("hex"), expected);
  }
  const migration = readFileSync(
    join(migrationRoot, "0005_fulfillment_returns_refunds.sql"),
    "utf8",
  );
  assert.doesNotMatch(migration, /PRAGMA foreign_keys\s*=\s*OFF|DROP TABLE `orders`/i);
  assert.match(migration, /ALTER TABLE `orders` ADD `shipping_quote_id`/);
  assert.match(migration, /trg_return_requests_apply_restock/);
  assert.match(migration, /'adjustment'.*'physical_increase'/s);
  assert.match(migration, /shipment_tracking_events.*event_type.*handed_over/s);
  assert.match(migration, /CREATE TABLE `carrier_event_receipts`/);
  assert.match(migration, /`carrier_receipt_id` text/);
  assert.match(migration, /trg_tracking_events_consume_receipt/);
  assert.match(migration, /ALTER TABLE `carts` ADD `fulfillment_revision`/);
  assert.match(migration, /`cart_revision` integer NOT NULL/);
  assert.match(migration, /trg_cart_lines_bump_fulfillment_revision_update/);
  const journal = JSON.parse(
    readFileSync(join(migrationRoot, "meta", "_journal.json"), "utf8"),
  );
  assert.equal(journal.entries.at(-1).tag, "0005_fulfillment_returns_refunds");
  const snapshotPath = join(migrationRoot, "meta", "0005_snapshot.json");
  assert.ok(existsSync(snapshotPath));
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  assert.ok(snapshot.tables.carrier_event_receipts);
  assert.ok(snapshot.tables.carts.columns.fulfillment_revision);
  assert.ok(snapshot.tables.shipping_quotes.columns.cart_revision);
  assert.ok(snapshot.tables.shipment_tracking_events.columns.carrier_receipt_id);
  assert.ok(snapshot.tables.shipment_tracking_events.indexes.ux_tracking_events_carrier_receipt);
});

test("real local D1 applies 0000 to 0005, upgrades populated 0004 and replays", (t) => {
  assert.ok(existsSync(wranglerCli), "local Wrangler must be installed");
  // Keep the local Wrangler state inside the governed workspace but outside
  // this deeply nested worktree so Windows does not exceed SQLite path limits.
  const proofParent = join(workspaceRoot, ".aj-luxury-d03-proofs");
  mkdirSync(proofParent, { recursive: true });
  const proofRoot = mkdtempSync(join(proofParent, "migration-"));
  assert.ok(!relative(workspaceRoot, proofRoot).startsWith(".."));
  t.after(() => rmSync(proofRoot, { recursive: true, force: true, maxRetries: 5 }));

  const emptyRoot = join(proofRoot, "empty");
  mkdirSync(emptyRoot);
  const emptyConfig = createConfig(emptyRoot, migrationNames);
  const emptyState = join(emptyRoot, "state");
  mkdirSync(emptyState, { recursive: true });
  apply(emptyRoot, emptyConfig, emptyState);
  assert.deepEqual(
    query(
      emptyRoot,
      emptyConfig,
      emptyState,
      "SELECT name FROM d1_migrations ORDER BY id",
    ).map((row) => row.name),
    migrationNames,
  );
  assert.equal(
    query(
      emptyRoot,
      emptyConfig,
      emptyState,
      "SELECT COUNT(*) AS count FROM shipping_zone_configurations WHERE status='active'",
    )[0].count,
    0,
  );
  assert.deepEqual(
    query(emptyRoot, emptyConfig, emptyState, "PRAGMA foreign_key_check"),
    [],
  );
  apply(emptyRoot, emptyConfig, emptyState);

  const upgradeRoot = join(proofRoot, "upgrade");
  mkdirSync(upgradeRoot);
  const upgradeConfig = createConfig(upgradeRoot, migrationNames.slice(0, 5));
  const upgradeState = join(upgradeRoot, "state");
  mkdirSync(upgradeState, { recursive: true });
  apply(upgradeRoot, upgradeConfig, upgradeState);
  query(
    upgradeRoot,
    upgradeConfig,
    upgradeState,
    `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id,
      idempotency_key, metadata_json, created_at)
    VALUES ('d03_upgrade_sentinel', 'system', 'sentinel', 'migration', '0004',
      'd03:upgrade:sentinel', '{}', '2026-08-11T12:00:00.000Z')`,
  );
  query(
    upgradeRoot,
    upgradeConfig,
    upgradeState,
    `INSERT INTO orders (id, order_number, email, status, currency,
      subtotal_cents, shipping_cents, tax_cents, total_cents,
      shipping_country_code, shipping_address_json, billing_address_json,
      terms_version, privacy_version, paid_at, created_at, updated_at)
    VALUES ('d03_historical_order', 'AJ-D03-HISTORICAL', 'history@example.com',
      'pending_payment', 'EUR', 2999, 0, 0, 2999, 'FR', '{}', '{}',
      'terms-v1', 'privacy-v1', NULL, '2026-08-11T12:00:00.000Z',
      '2026-08-11T12:00:00.000Z')`,
  );
  query(
    upgradeRoot,
    upgradeConfig,
    upgradeState,
    `INSERT INTO email_outbox (
      id, kind, transaction_intent, source_event_id, recipient_email, order_id,
      locale, template_version, payload_json, status, attempts, max_attempts,
      next_attempt_at, idempotency_key, provider_idempotency_key, created_at, updated_at
    ) VALUES ('d03_historical_email', 'withdrawal_acknowledgement', 'withdrawal_received',
      'd03_historical_withdrawal', 'history@example.com', 'd03_historical_order', 'fr',
      'historical-v1', '{}', 'pending', 0, 5, '2026-08-11T12:30:00.000Z',
      'd03:historical:email', 'withdrawal_acknowledgement:d03_historical_withdrawal',
      '2026-08-11T12:00:00.000Z',
      '2026-08-11T12:00:00.000Z')`,
  );
  copyFileSync(
    join(migrationRoot, migrationNames.at(-1)),
    join(upgradeRoot, "migrations", migrationNames.at(-1)),
  );
  apply(upgradeRoot, upgradeConfig, upgradeState);
  apply(upgradeRoot, upgradeConfig, upgradeState);
  assert.deepEqual(
    query(
      upgradeRoot,
      upgradeConfig,
      upgradeState,
      "SELECT name FROM d1_migrations ORDER BY id",
    ).map((row) => row.name),
    migrationNames,
  );
  assert.deepEqual(
    query(
      upgradeRoot,
      upgradeConfig,
      upgradeState,
      `SELECT shipping_quote_id, shipping_address_fingerprint
      FROM orders WHERE id='d03_historical_order'`,
    ),
    [{ shipping_quote_id: null, shipping_address_fingerprint: null }],
  );
  assert.equal(
    query(
      upgradeRoot,
      upgradeConfig,
      upgradeState,
      "SELECT COUNT(*) AS count FROM audit_log WHERE id='d03_upgrade_sentinel'",
    )[0].count,
    1,
  );
  assert.deepEqual(
    query(
      upgradeRoot,
      upgradeConfig,
      upgradeState,
      `SELECT id, kind, transaction_intent, source_event_id, recipient_email,
        order_id, status, attempts, idempotency_key, provider_idempotency_key
      FROM email_outbox WHERE id='d03_historical_email'`,
    ),
    [{
      id: "d03_historical_email",
      kind: "withdrawal_acknowledgement",
      transaction_intent: "withdrawal_received",
      source_event_id: "d03_historical_withdrawal",
      recipient_email: "history@example.com",
      order_id: "d03_historical_order",
      status: "pending",
      attempts: 0,
      idempotency_key: "d03:historical:email",
      provider_idempotency_key:
        "withdrawal_acknowledgement:d03_historical_withdrawal",
    }],
  );
  const outboxSql = query(
    upgradeRoot,
    upgradeConfig,
    upgradeState,
    "SELECT sql FROM sqlite_schema WHERE type='table' AND name='email_outbox'",
  )[0].sql;
  assert.match(outboxSql, /return_acknowledgement/);
  assert.match(outboxSql, /return_received/);
  const outboxIndexes = query(
    upgradeRoot,
    upgradeConfig,
    upgradeState,
    "SELECT name FROM sqlite_schema WHERE type='index' AND tbl_name='email_outbox' AND name IS NOT NULL ORDER BY name",
  ).map((row) => row.name);
  for (const indexName of [
    "idx_email_outbox_claim",
    "idx_email_outbox_stale_lease",
    "ux_email_outbox_account_access_challenge",
    "ux_email_outbox_active_lease",
    "ux_email_outbox_idempotency_key",
    "ux_email_outbox_intent_source",
    "ux_email_outbox_payment_confirmation_order",
    "ux_email_outbox_provider_idempotency_key",
  ]) assert.ok(outboxIndexes.includes(indexName));
  const outboxTriggers = query(
    upgradeRoot,
    upgradeConfig,
    upgradeState,
    "SELECT name FROM sqlite_schema WHERE type='trigger' AND tbl_name='email_outbox' ORDER BY name",
  ).map((row) => row.name);
  for (const triggerName of [
    "trg_email_outbox_account_access_insert_disabled",
    "trg_email_outbox_account_access_lifecycle_disabled",
    "trg_email_outbox_audit_insert",
    "trg_email_outbox_audit_terminal",
    "trg_email_outbox_validate_insert",
    "trg_email_outbox_immutable_identity",
    "trg_email_outbox_normalize_verified_legacy_insert",
    "trg_email_outbox_state_transition",
    "trg_email_outbox_terminal_append_only",
    "trg_email_outbox_retain_delete",
  ]) assert.ok(outboxTriggers.includes(triggerName));
  const schemaRows = query(
    upgradeRoot,
    upgradeConfig,
    upgradeState,
    `SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE name IN (
      'carrier_event_receipts', 'carts', 'shipping_quotes', 'shipments',
      'shipment_tracking_events', 'return_requests',
      'idx_carrier_receipts_shipment_status',
      'ux_carrier_receipts_provider_event', 'ux_carrier_receipts_fingerprint',
      'ux_tracking_events_carrier_receipt',
      'ux_shipments_provider_reference', 'ux_shipments_tracking_reference',
      'ux_refunds_provider_reference',
      'trg_carrier_receipts_validate_insert', 'trg_carrier_receipts_transition',
      'trg_carrier_receipts_retain', 'trg_tracking_events_consume_receipt',
      'trg_carts_validate_fulfillment_revision',
      'trg_cart_lines_bump_fulfillment_revision_insert',
      'trg_cart_lines_bump_fulfillment_revision_update',
      'trg_cart_lines_bump_fulfillment_revision_delete'
    ) ORDER BY name`,
  );
  const schemaByName = new Map(schemaRows.map((row) => [row.name, row]));
  assert.match(schemaByName.get("shipments").sql, /tracking_provider_code/);
  assert.match(schemaByName.get("carts").sql, /fulfillment_revision[^,]*DEFAULT 0[^,]*NOT NULL/i);
  assert.match(schemaByName.get("shipping_quotes").sql, /cart_revision[^,]*NOT NULL/i);
  assert.match(schemaByName.get("carrier_event_receipts").sql, /receipt_fingerprint[^,]*NOT NULL/i);
  assert.match(schemaByName.get("carrier_event_receipts").sql, /status[^,]*DEFAULT 'verified'/i);
  assert.match(
    schemaByName.get("shipment_tracking_events").sql,
    /tracking_reference[^,]*NOT NULL/i,
  );
  assert.match(
    schemaByName.get("shipment_tracking_events").sql,
    /carrier_receipt_id[^,]*REFERENCES `carrier_event_receipts`/i,
  );
  assert.match(
    schemaByName.get("return_requests").sql,
    /declared_line_count[^,]*NOT NULL/i,
  );
  for (const indexName of [
    "ux_shipments_provider_reference",
    "ux_shipments_tracking_reference",
    "ux_refunds_provider_reference",
    "ux_carrier_receipts_provider_event",
    "ux_carrier_receipts_fingerprint",
    "ux_tracking_events_carrier_receipt",
  ]) {
    assert.match(schemaByName.get(indexName).sql, /CREATE UNIQUE INDEX/i);
  }
  assert.match(schemaByName.get("idx_carrier_receipts_shipment_status").sql, /CREATE INDEX/i);
  for (const triggerName of [
    "trg_carrier_receipts_validate_insert",
    "trg_carrier_receipts_transition",
    "trg_carrier_receipts_retain",
    "trg_tracking_events_consume_receipt",
    "trg_carts_validate_fulfillment_revision",
    "trg_cart_lines_bump_fulfillment_revision_insert",
    "trg_cart_lines_bump_fulfillment_revision_update",
    "trg_cart_lines_bump_fulfillment_revision_delete",
  ]) {
    assert.equal(schemaByName.get(triggerName).type, "trigger");
  }
  const ordersSql = query(
    upgradeRoot,
    upgradeConfig,
    upgradeState,
    "SELECT sql FROM sqlite_schema WHERE type='table' AND name='orders'",
  )[0].sql;
  assert.doesNotMatch(ordersSql, /shipping_address_fingerprint[^,]*CHECK/i);
  const failure = query(
    upgradeRoot,
    upgradeConfig,
    upgradeState,
    `INSERT INTO orders (id, order_number, email, status, currency,
      subtotal_cents, shipping_cents, tax_cents, total_cents,
      shipping_country_code, shipping_address_json, billing_address_json,
      terms_version, privacy_version, paid_at, created_at, updated_at)
    VALUES ('d03_new_order_without_quote', 'AJ-D03-NO-QUOTE', 'new@example.com',
      'pending_payment', 'EUR', 2999, 0, 0, 2999, 'FR', '{}', '{}',
      'terms-v1', 'privacy-v1', NULL, '2026-08-11T13:00:00.000Z',
      '2026-08-11T13:00:00.000Z')`,
    true,
  );
  assert.match(failure, /fulfillment_quote_mismatch/);
  assert.deepEqual(
    query(upgradeRoot, upgradeConfig, upgradeState, "PRAGMA foreign_key_check"),
    [],
  );
});
