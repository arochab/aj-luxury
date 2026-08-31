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
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
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
  "0006_allow_bounded_expired_cart_purge.sql",
  "0007_transactional_preprod_order_payment.sql",
  "0008_preprod_synthetic_demo_dataset.sql",
  "0009_shipping_quote_parcel_snapshots.sql",
  "0010_multicarrier_delivery_foundation.sql",
  "0011_service_point_reference_vault.sql",
  "0012_provider_priced_delivery_quotes.sql",
  "0013_provider_priced_delivery_orders.sql",
  "0014_late_payment_refund_compensation.sql",
  "0015_production_release_attestation.sql",
  "0016_return_operator_state_machine.sql",
  "0017_rich_dreadnoughts.sql",
  "0018_volatile_blob.sql",
  "0019_provider_configuration_attestation.sql",
  "0020_launch_stock_current_grid.sql",
  "0021_paid_order_confirmations.sql",
  "0022_customer_password_accounts.sql",
  "0023_controlled_order_runtime_provenance.sql",
  "0024_customer_password_runtime_profile.sql",
  "0025_customer_password_scrypt_profile.sql",
  "0026_international_shipping.sql",
  "0027_puzzling_war_machine.sql",
];
const legacyMigrationNames = migrationNames.slice(0, 8);
// Hosted D1 bootstrap version 1 succeeded with exactly these LF-normalized
// bytes. From this point onward, every schema change must be additive in a new
// migration; rewriting 0000 through 0005 is forbidden.
const bootstrapHashes = Object.freeze({
  "0000_flimsy_rhino.sql":
    "64ec5b38a5c5e33b235f65ba6f5524fa26961a50af33a01c219af4080807435b",
  "0001_lock_cart_line_price_provenance.sql":
    "a28fe428ba0aeb12bd6eb254082f49fc0735541cbc315a28e5cd137ee57da045",
  "0002_lock_order_line_snapshots.sql":
    "7a7498959ef379096f5f2aec132a80ab30645186bd2add4b09634cf9599ef566",
  "0003_identity_access.sql":
    "97497dbef41179a669b2ff58286ae9e0986cd8fcb2c76e97ae696f7fd7b1fc5a",
  "0004_email_outbox_data_rights.sql":
    "fdf9c27b57d24c931d234bf8651e83599d10c0e8adfc28b188d165f01c9b59ef",
  "0005_fulfillment_returns_refunds.sql":
    "2eff61c2caa307e094f9cf64885816beff5f476dbbfe52a9988560a57faa1008",
});
const retentionMigrationSha256 =
  "3cbd7390bb8834305b11f6d791583a86f3c6fe7ba9be23fc91e1e1ea98203a52";
const transactionalCheckoutMigrationSha256 =
  "3b58d9e49e5154c855c2620fea80e733c8953ec713e75a2e8c5b31432840d838";
const syntheticDemoMigrationSha256 =
  "794e1c67471427ba3d92e979e79e07a8393244794d7d98b827db6b0fda07b5b5";

test("the exact Drizzle D1 splitter emits no blank statements", () => {
  const migrations = readMigrationFiles({ migrationsFolder: migrationRoot });
  assert.equal(migrations.length, migrationNames.length);
  assert.equal(
    migrations.reduce((total, migration) => total + migration.sql.length, 0),
    604,
  );
  for (const [migrationIndex, migration] of migrations.entries()) {
    for (const [statementIndex, statement] of migration.sql.entries()) {
      assert.ok(
        statement.trim().length > 0,
        `${migrationNames[migrationIndex]} emitted blank statement ${statementIndex + 1}`,
      );
    }
  }

  const fulfillmentMigration = readFileSync(
    join(migrationRoot, "0005_fulfillment_returns_refunds.sql"),
    "utf8",
  );
  assert.doesNotMatch(fulfillmentMigration, /--> statement-breakpoint\s*$/);
  const transactionalMigration = migrations[migrationNames.indexOf(
    "0007_transactional_preprod_order_payment.sql",
  )];
  assert.match(transactionalMigration.sql.at(-1), /trg_orders_lock_shipping_snapshot/);
  assert.match(transactionalMigration.sql.at(-1), /END;\s*$/);
});

test("every trigger is compatible with the Sites D1 statement ingester", () => {
  const migrations = readMigrationFiles({ migrationsFolder: migrationRoot });
  const triggerStatements = migrations.flatMap((migration) =>
    migration.sql.filter((statement) => /^\s*CREATE\s+TRIGGER\b/i.test(statement)),
  );

  assert.ok(triggerStatements.length > 0);
  for (const statement of triggerStatements) {
    const triggerName = statement.match(/CREATE\s+TRIGGER\s+`?([^`\s]+)`?/i)?.[1];
    assert.equal(
      statement.match(/\bEND;/gi)?.length,
      1,
      `${triggerName ?? "unnamed trigger"} contains an internal END; that Sites D1 can split prematurely`,
    );
    assert.match(
      statement,
      /\bEND;\s*$/i,
      `${triggerName ?? "unnamed trigger"} must end with the sole END; terminator`,
    );
  }
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
    timeout: 120_000,
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

function parseFirstJsonArray(output) {
  for (let start = output.indexOf("["); start !== -1; start = output.indexOf("[", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < output.length; index += 1) {
      const character = output[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "[") depth += 1;
      else if (character === "]") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(output.slice(start, index + 1));
            if (Array.isArray(parsed)) return parsed;
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new SyntaxError("Wrangler output did not contain a valid JSON array.");
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
  return parseFirstJsonArray(output)[0].results;
}

test("0005 stays frozen; 0006 through 0009 remain additive", () => {
  for (const [name, expected] of Object.entries(bootstrapHashes)) {
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
  assert.equal(journal.entries[5].tag, "0005_fulfillment_returns_refunds");
  assert.equal(
    journal.entries[6].tag,
    "0006_allow_bounded_expired_cart_purge",
  );
  assert.equal(
    journal.entries[7].tag,
    "0007_transactional_preprod_order_payment",
  );
  assert.equal(
    journal.entries[8].tag,
    "0008_preprod_synthetic_demo_dataset",
  );
  assert.equal(
    journal.entries[9].tag,
    "0009_shipping_quote_parcel_snapshots",
  );
  const retentionMigration = readFileSync(
    join(migrationRoot, "0006_allow_bounded_expired_cart_purge.sql"),
    "utf8",
  );
  assert.equal(
    createHash("sha256")
      .update(retentionMigration.replaceAll("\r\n", "\n"))
      .digest("hex"),
    retentionMigrationSha256,
  );
  assert.doesNotMatch(retentionMigration, /ALTER TABLE|DROP TABLE|DELETE FROM/i);
  assert.match(retentionMigration, /length\(cart\.`id`\) = 69/);
  assert.match(retentionMigration, /datetime\('now', '-30 days'\)/);
  assert.match(retentionMigration, /cart\.`customer_id` IS NULL/);
  assert.match(retentionMigration, /cart\.`email` IS NULL/);
  assert.match(retentionMigration, /stock_reservations/);
  const transactionalCheckoutMigration = readFileSync(
    join(migrationRoot, "0007_transactional_preprod_order_payment.sql"),
    "utf8",
  );
  assert.equal(
    createHash("sha256")
      .update(transactionalCheckoutMigration.replaceAll("\r\n", "\n"))
      .digest("hex"),
    transactionalCheckoutMigrationSha256,
  );
  const syntheticDemoMigration = readFileSync(
    join(migrationRoot, "0008_preprod_synthetic_demo_dataset.sql"),
    "utf8",
  );
  assert.equal(
    createHash("sha256")
      .update(syntheticDemoMigration.replaceAll("\r\n", "\n"))
      .digest("hex"),
    syntheticDemoMigrationSha256,
  );
  const parcelMigration = readFileSync(
    join(migrationRoot, "0009_shipping_quote_parcel_snapshots.sql"),
    "utf8",
  );
  assert.match(parcelMigration, /shipping_quote_parcel_snapshots/);
  assert.match(parcelMigration, /client-validated-2026-08-13/);
  assert.match(parcelMigration, /weight_grams.*150/s);
  assert.match(parcelMigration, /weight_grams.*250/s);
  assert.match(parcelMigration, /weight_grams.*350/s);
  assert.match(parcelMigration, /length_mm.*400/s);
  assert.match(parcelMigration, /width_mm.*320/s);
  assert.match(parcelMigration, /height_mm.*40/s);
  assert.match(parcelMigration, /shipping_quote_parcel_snapshot_matches_cart/);
  assert.match(parcelMigration, /shipping_quote_parcel_snapshot_immutable/);
  assert.match(retentionMigration, /orders/);
  assert.match(retentionMigration, /shipping_quotes/);
  const snapshotPath = join(migrationRoot, "meta", "0005_snapshot.json");
  assert.ok(existsSync(snapshotPath));
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  assert.ok(snapshot.tables.carrier_event_receipts);
  assert.ok(snapshot.tables.carts.columns.fulfillment_revision);
  assert.ok(snapshot.tables.shipping_quotes.columns.cart_revision);
  assert.ok(snapshot.tables.shipment_tracking_events.columns.carrier_receipt_id);
  assert.ok(snapshot.tables.shipment_tracking_events.indexes.ux_tracking_events_carrier_receipt);
});

test("real local D1 applies the governed chain, upgrades populated 0004 and replays", (t) => {
  assert.ok(existsSync(wranglerCli), "local Wrangler must be installed");
  // Keep Wrangler's disposable proof state inside this governed worktree.
  // The workspace-level legacy junction can resolve outside the authorized
  // root, so it must never be used as a canonical test destination.
  const proofParent = join(projectRoot, ".test-proofs");
  mkdirSync(proofParent, { recursive: true });
  const proofRoot = mkdtempSync(join(proofParent, "migration-"));
  assert.ok(!relative(projectRoot, proofRoot).startsWith(".."));
  t.after(() => rmSync(proofRoot, { recursive: true, force: true, maxRetries: 5 }));

  const emptyRoot = join(proofRoot, "empty");
  mkdirSync(emptyRoot);
  const emptyConfig = createConfig(emptyRoot, legacyMigrationNames);
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
    legacyMigrationNames,
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
  for (const migrationName of legacyMigrationNames.slice(5)) {
    copyFileSync(
      join(migrationRoot, migrationName),
      join(upgradeRoot, "migrations", migrationName),
    );
  }
  apply(upgradeRoot, upgradeConfig, upgradeState);
  apply(upgradeRoot, upgradeConfig, upgradeState);
  assert.deepEqual(
    query(
      upgradeRoot,
      upgradeConfig,
      upgradeState,
      "SELECT name FROM d1_migrations ORDER BY id",
    ).map((row) => row.name),
    legacyMigrationNames,
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
  ]) assert.ok(
    outboxIndexes.includes(indexName),
    `${indexName} missing from email_outbox indexes: ${outboxIndexes.join(", ")}`,
  );
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

  const retentionRoot = join(proofRoot, "retention");
  mkdirSync(retentionRoot);
  const retentionConfig = createConfig(retentionRoot, migrationNames.slice(0, 6));
  const retentionState = join(retentionRoot, "state");
  mkdirSync(retentionState, { recursive: true });
  apply(retentionRoot, retentionConfig, retentionState);
  const retainedCartId = `cart_${"a".repeat(64)}`;
  query(
    retentionRoot,
    retentionConfig,
    retentionState,
    `INSERT INTO products (
      id, slug, name, status, price_cents, currency, created_at, updated_at
    ) VALUES (
      'product_retention', 'retention', 'Retention', 'active', 2999, 'EUR',
      '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'
    )`,
  );
  query(
    retentionRoot,
    retentionConfig,
    retentionState,
    `INSERT INTO variants (
      id, product_id, internal_reference, color_key, color_name, size,
      swatch, image_url, active, sort_order, created_at, updated_at
    ) VALUES (
      'variant_retention_s', 'product_retention', 'AJ-RETENTION-S',
      'retention', 'Retention', 'S', '#000000', '/retention.webp', 1, 0,
      '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'
    )`,
  );
  query(
    retentionRoot,
    retentionConfig,
    retentionState,
    `INSERT INTO inventory (
      variant_id, physical_quantity, gift_reserve_quantity,
      safety_reserve_quantity, active_reserved_quantity, sold_quantity,
      reserves_validated, version, updated_at
    ) VALUES (
      'variant_retention_s', 10, 0, 0, 0, 0, 1, 0,
      '2026-08-13T00:00:00.000Z'
    )`,
  );
  query(
    retentionRoot,
    retentionConfig,
    retentionState,
    `INSERT INTO carts (
      id, status, currency, expires_at, created_at, updated_at
    ) VALUES (
      '${retainedCartId}', 'open', 'EUR', '2099-08-13T01:00:00.000Z',
      '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'
    )`,
  );
  query(
    retentionRoot,
    retentionConfig,
    retentionState,
    `INSERT INTO cart_lines (
      id, cart_id, variant_id, quantity, unit_price_cents, created_at, updated_at
    ) VALUES (
      'line_retention', '${retainedCartId}', 'variant_retention_s', 1, 2999,
      '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'
    )`,
  );
  query(
    retentionRoot,
    retentionConfig,
    retentionState,
    `UPDATE carts SET status='expired', expires_at='2000-01-01T00:00:00.000Z'
      WHERE id='${retainedCartId}'`,
  );
  for (const migrationName of legacyMigrationNames.slice(6)) {
    copyFileSync(
      join(migrationRoot, migrationName),
      join(retentionRoot, "migrations", migrationName),
    );
  }
  apply(retentionRoot, retentionConfig, retentionState);
  apply(retentionRoot, retentionConfig, retentionState);
  assert.deepEqual(
    query(
      retentionRoot,
      retentionConfig,
      retentionState,
      "SELECT name FROM d1_migrations ORDER BY id",
    ).map((row) => row.name),
    legacyMigrationNames,
  );
  query(
    retentionRoot,
    retentionConfig,
    retentionState,
    "DELETE FROM cart_lines WHERE id='line_retention'",
  );
  assert.equal(
    query(
      retentionRoot,
      retentionConfig,
      retentionState,
      "SELECT COUNT(*) AS count FROM cart_lines WHERE id='line_retention'",
    )[0].count,
    0,
  );
  assert.deepEqual(
    query(retentionRoot, retentionConfig, retentionState, "PRAGMA foreign_key_check"),
    [],
  );
});
