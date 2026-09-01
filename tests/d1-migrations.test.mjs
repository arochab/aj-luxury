import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import test from "node:test";

import { parseFirstJsonDocument } from "./helpers/parse-json-document.mjs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const builtConfigPath = join(projectRoot, "dist", "server", "wrangler.json");
const migrationDirectory = join(projectRoot, "drizzle");
const baselineMigrationPath = join(
  migrationDirectory,
  "0000_flimsy_rhino.sql",
);
const wranglerCliPath = join(
  projectRoot,
  "node_modules",
  "wrangler",
  "wrangler-dist",
  "cli.js",
);
const expectedMigrationNames = [
  "0000_flimsy_rhino.sql",
  "0001_lock_cart_line_price_provenance.sql",
  "0002_lock_order_line_snapshots.sql",
  "0003_identity_access.sql",
  "0004_email_outbox_data_rights.sql",
];
const expectedHardeningTriggerNames = [
  "trg_audit_log_immutable_update",
  "trg_audit_log_retain_delete",
  "trg_audit_log_validate_insert_timestamp",
  "trg_cart_lines_immutable_snapshot",
  "trg_cart_lines_validate_catalog_insert",
  "trg_cart_lines_validate_delete",
  "trg_cart_lines_validate_quantity_update",
  "trg_carts_lock_currency_with_lines",
  "trg_carts_require_empty_delete",
  "trg_inventory_movements_immutable_update",
  "trg_inventory_movements_apply_stock_transition",
  "trg_inventory_movements_retain_delete",
  "trg_inventory_movements_validate_stock_transition",
  "trg_inventory_movements_validate_insert_timestamp",
  "trg_inventory_require_zero_lifecycle_insert",
  "trg_inventory_retain_delete",
  "trg_inventory_seed_ledger",
  "trg_inventory_validate_reservation_counters",
  "trg_inventory_validate_stock_movement_update",
  "trg_inventory_validate_insert_timestamp",
  "trg_inventory_validate_update_timestamp",
  "trg_order_lines_immutable_update",
  "trg_order_lines_retain_snapshot",
  "trg_order_lines_validate_pending_insert",
  "trg_orders_guard_paid_at",
  "trg_orders_guard_payment_state",
  "trg_orders_lock_snapshot_update",
  "trg_orders_lock_updated_at_without_transition",
  "trg_orders_require_paid_at_transition",
  "trg_orders_require_pending_insert",
  "trg_orders_validate_insert_timestamp",
  "trg_orders_validate_paid_transition",
  "trg_orders_validate_status_timestamp",
  "trg_payments_lock_fields_without_transition",
  "trg_payments_lock_identity_update",
  "trg_payments_lock_terminal_update",
  "trg_payments_require_verified_event_insert",
  "trg_payments_require_verified_event_update",
  "trg_payments_retain_delete",
  "trg_payments_validate_insert_state",
  "trg_payments_validate_insert_timestamp",
  "trg_payments_validate_transition",
  "trg_payments_validate_transition_payload",
  "trg_payments_validate_transition_timestamp",
  "trg_stock_reservations_lock_identity_update",
  "trg_stock_reservations_lock_terminal_update",
  "trg_stock_reservations_require_active_insert",
  "trg_stock_reservations_require_transition_update",
  "trg_stock_reservations_retain_delete",
  "trg_stock_reservations_validate_cart_line_insert",
  "trg_stock_reservations_validate_insert_timestamp",
  "trg_stock_reservations_validate_transition_payload",
  "trg_stock_reservations_validate_transition_timestamp",
  "trg_webhook_events_lock_fields_without_transition",
  "trg_webhook_events_lock_identity_update",
  "trg_webhook_events_lock_terminal_update",
  "trg_webhook_events_retain_delete",
  "trg_webhook_events_validate_insert_state",
  "trg_webhook_events_validate_insert_timestamp",
  "trg_webhook_events_validate_processed_timestamp",
  "trg_webhook_events_validate_processing_update",
  "trg_webhook_events_validate_transition",
].sort();
const expectedMigrationSha256 = {
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
  "0006_allow_bounded_expired_cart_purge.sql":
    "3cbd7390bb8834305b11f6d791583a86f3c6fe7ba9be23fc91e1e1ea98203a52",
  "0007_transactional_preprod_order_payment.sql":
    "3b58d9e49e5154c855c2620fea80e733c8953ec713e75a2e8c5b31432840d838",
};
const ansiPattern = /\u001B\[[0-?]*[ -/]*[@-~]/g;

function assertProjectLocal(candidatePath) {
  const localPath = relative(projectRoot, candidatePath);
  assert.ok(
    localPath && !localPath.startsWith("..") && !isAbsolute(localPath),
    `D1 proof path escaped the project: ${candidatePath}`,
  );
}

function createWranglerEnvironment(proofRoot) {
  const environment = {
    CI: "1",
    FORCE_COLOR: "0",
    MINIFLARE_REGISTRY_PATH: join(proofRoot, "registry"),
    NO_COLOR: "1",
    NO_UPDATE_NOTIFIER: "1",
    TEMP: join(proofRoot, "temp"),
    TMP: join(proofRoot, "temp"),
    WRANGLER_HIDE_BANNER: "true",
    WRANGLER_LOG_PATH: join(proofRoot, "logs"),
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
  };

  for (const name of ["ComSpec", "Path", "PATH", "SystemRoot", "WINDIR"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }

  mkdirSync(environment.TEMP, { recursive: true });
  return environment;
}

function createMigrationSubsetConfig({
  canonicalConfig,
  migrationNames,
  root,
  workerName,
}) {
  const migrations = join(root, "m");
  mkdirSync(migrations, { recursive: true });
  for (const migrationName of migrationNames) {
    copyFileSync(
      join(migrationDirectory, migrationName),
      join(migrations, migrationName),
    );
  }

  const configPath = join(root, "wrangler.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      name: workerName,
      main: relative(
        root,
        join(projectRoot, "dist", "server", "index.js"),
      ).replaceAll("\\", "/"),
      compatibility_date: canonicalConfig.compatibility_date,
      d1_databases: [
        {
          binding: "DB",
          database_name: "site-creator-d1",
          database_id: "00000000-0000-4000-8000-000000000000",
          migrations_dir: "m",
        },
      ],
    }),
    "utf8",
  );
  return configPath;
}

function stripAnsi(output) {
  return output.replace(ansiPattern, "");
}

function assertLocalD1Arguments(arguments_) {
  assert.ok(arguments_.includes("--local"));
  assert.ok(!arguments_.includes("--remote"));
  assert.ok(!arguments_.includes("--preview"));
}

function runWrangler(arguments_, environment, { expectFailure = false } = {}) {
  assertLocalD1Arguments(arguments_);
  const result = spawnSync(process.execPath, [wranglerCliPath, ...arguments_], {
    cwd: projectRoot,
    encoding: "utf8",
    env: environment,
    timeout: 60_000,
    windowsHide: true,
  });
  const output = stripAnsi(`${result.stdout ?? ""}${result.stderr ?? ""}`);

  assert.equal(result.error?.code, undefined, output || result.error?.message);
  if (expectFailure) {
    assert.notEqual(result.status, 0, output);
  } else {
    assert.equal(result.status, 0, output);
  }
  return output;
}

async function applyMigrations({
  configPath,
  environment,
  expectedLastMigration,
  noOp = false,
  statePath,
}) {
  const arguments_ = [
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    configPath,
    "--persist-to",
    statePath,
  ];
  assertLocalD1Arguments(arguments_);

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [wranglerCliPath, ...arguments_], {
      cwd: projectRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let completed = false;
    let stopAfterCompletion;

    const completionObserved = () => {
      const cleanOutput = stripAnsi(output);
      if (noOp) return cleanOutput.includes("No migrations to apply!");
      const escapedName = expectedLastMigration.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      return new RegExp(`${escapedName}\\s*│\\s*✅`).test(cleanOutput);
    };

    const scheduleStop = () => {
      if (completed || !completionObserved()) return;
      completed = true;
      stopAfterCompletion = setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 250);
    };

    child.stdout.on("data", (chunk) => {
      output += chunk;
      scheduleStop();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
      scheduleStop();
    });

    const timeout = setTimeout(() => {
      child.kill();
      rejectPromise(
        new Error(`Wrangler migration timed out:\n${stripAnsi(output)}`),
      );
    }, 60_000);

    child.on("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(stopAfterCompletion);
      rejectPromise(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(stopAfterCompletion);
      const cleanOutput = stripAnsi(output);
      if (completionObserved() && (code === 0 || completed || signal)) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `Wrangler migration failed (code=${code}, signal=${signal}):\n${cleanOutput}`,
        ),
      );
    });
  });
}

function executeD1({
  command,
  configPath,
  environment,
  expectFailure = false,
  json = false,
  statePath,
}) {
  const arguments_ = [
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    configPath,
    "--persist-to",
    statePath,
    "--command",
    command,
  ];
  if (json) arguments_.push("--json");
  return runWrangler(arguments_, environment, { expectFailure });
}

function queryD1(input) {
  const output = executeD1({ ...input, json: true });
  const payload = parseFirstJsonDocument(output);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].success, true);
  return payload[0].results;
}

function migrationRows(input) {
  return queryD1({
    ...input,
    command: "SELECT id, name, applied_at FROM d1_migrations ORDER BY id",
  });
}

test("detached Sites build keeps migrations out of the frontend while Wrangler applies the governed chain", async (t) => {
  assert.ok(existsSync(builtConfigPath), "npm run build must create Wrangler config");
  assert.ok(existsSync(wranglerCliPath), "local Wrangler must be installed");
  const migrationNames = readdirSync(migrationDirectory)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  assert.deepEqual(
    migrationNames.filter((name) => expectedMigrationNames.includes(name)),
    expectedMigrationNames,
  );
  assert.deepEqual(
    migrationNames.filter((name) => !expectedMigrationNames.includes(name)),
    [
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
      "0028_even_fallen_one.sql",
      "0029_slippery_ironclad.sql",
      "0030_striped_skin.sql",
      "0031_failed_shipment_admin_retry.sql",
    ],
  );

  const canonicalConfig = JSON.parse(readFileSync(builtConfigPath, "utf8"));
  assert.deepEqual(canonicalConfig.d1_databases, []);

  const baseline = readFileSync(baselineMigrationPath, "utf8").replaceAll(
    "\r\n",
    "\n",
  );
  for (const migrationName of expectedMigrationNames) {
    const normalizedMigration = readFileSync(
      join(migrationDirectory, migrationName),
      "utf8",
    ).replaceAll("\r\n", "\n");
    assert.equal(
      createHash("sha256").update(normalizedMigration).digest("hex"),
      expectedMigrationSha256[migrationName],
      `${migrationName} differs from its reviewed LF-normalized bytes`,
    );
  }
  const normalizedFulfillmentMigration = readFileSync(
    join(migrationDirectory, "0005_fulfillment_returns_refunds.sql"),
    "utf8",
  ).replaceAll("\r\n", "\n");
  assert.equal(
    createHash("sha256").update(normalizedFulfillmentMigration).digest("hex"),
    expectedMigrationSha256["0005_fulfillment_returns_refunds.sql"],
    "Hosted bootstrap v1 froze 0005; every later migration must be additive",
  );
  const normalizedRetentionMigration = readFileSync(
    join(migrationDirectory, "0006_allow_bounded_expired_cart_purge.sql"),
    "utf8",
  ).replaceAll("\r\n", "\n");
  assert.equal(
    createHash("sha256").update(normalizedRetentionMigration).digest("hex"),
    expectedMigrationSha256["0006_allow_bounded_expired_cart_purge.sql"],
    "0006 differs from its reviewed LF-normalized bytes",
  );
  assert.doesNotMatch(baseline, /trg_cart_lines_validate_catalog_insert/);

  const proofParent = join(projectRoot, ".wrangler");
  mkdirSync(proofParent, { recursive: true });
  const proofRoot = mkdtempSync(join(proofParent, "m"));
  assertProjectLocal(proofRoot);
  const environment = createWranglerEnvironment(proofRoot);
  const canonicalConfigPath = createMigrationSubsetConfig({
    canonicalConfig,
    migrationNames: expectedMigrationNames,
    root: join(proofRoot, "c"),
    workerName: "aj-luxury-d1-legacy-chain-proof",
  });
  t.after(() => {
    assertProjectLocal(proofRoot);
    rmSync(proofRoot, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
  });

  const emptyState = join(proofRoot, "e");
  await applyMigrations({
    configPath: canonicalConfigPath,
    environment,
    expectedLastMigration: expectedMigrationNames.at(-1),
    statePath: emptyState,
  });
  const emptyRows = migrationRows({
    configPath: canonicalConfigPath,
    environment,
    statePath: emptyState,
  });
  assert.deepEqual(
    emptyRows.map((migration) => migration.name),
    expectedMigrationNames,
  );

  const triggerRows = queryD1({
    command: `SELECT name, sql FROM sqlite_schema
      WHERE type = 'trigger' AND name IN (
        ${expectedHardeningTriggerNames.map((name) => `'${name}'`).join(",\n        ")}
      ) ORDER BY name`,
    configPath: canonicalConfigPath,
    environment,
    statePath: emptyState,
  });
  assert.deepEqual(
    triggerRows.map((trigger) => trigger.name),
    expectedHardeningTriggerNames,
  );
  const paidTransition = triggerRows.find(
    (trigger) => trigger.name === "trg_orders_validate_paid_transition",
  );
  assert.match(paidTransition.sql, /FROM `cart_lines`/);
  assert.doesNotMatch(
    paidTransition.sql,
    /internal_reference|product_name|color_name|FROM `products`/,
  );
  const orderLineInsert = triggerRows.find(
    (trigger) => trigger.name === "trg_order_lines_validate_pending_insert",
  );
  assert.match(orderLineInsert.sql, /internal_reference/);
  assert.match(orderLineInsert.sql, /product_name/);
  assert.match(orderLineInsert.sql, /FROM `orders` AS customer_order/);
  const cartLineInsert = triggerRows.find(
    (trigger) => trigger.name === "trg_cart_lines_validate_catalog_insert",
  );
  assert.match(cartLineInsert.sql, /stock_reservations/);
  assert.match(cartLineInsert.sql, /orders/);

  await applyMigrations({
    configPath: canonicalConfigPath,
    environment,
    noOp: true,
    statePath: emptyState,
  });
  assert.deepEqual(
    migrationRows({
      configPath: canonicalConfigPath,
      environment,
      statePath: emptyState,
    }),
    emptyRows,
  );

  const legacyRoot = join(proofRoot, "l");
  const legacyConfigPath = createMigrationSubsetConfig({
    canonicalConfig,
    migrationNames: [expectedMigrationNames[0]],
    root: legacyRoot,
    workerName: "aj-luxury-d1-0000-upgrade-proof",
  });

  const upgradeState = join(proofRoot, "u");
  await applyMigrations({
    configPath: legacyConfigPath,
    environment,
    expectedLastMigration: expectedMigrationNames[0],
    statePath: upgradeState,
  });
  executeD1({
    command: `INSERT INTO customers (
      id, email, accepts_marketing, created_at, updated_at
    ) VALUES (
      'customer_migration_sentinel', 'migration@example.com', 0,
      '2099-08-10T12:00:00.000Z', '2099-08-10T12:00:00.000Z'
    )`,
    configPath: legacyConfigPath,
    environment,
    statePath: upgradeState,
  });
  const journaledRows = migrationRows({
    configPath: legacyConfigPath,
    environment,
    statePath: upgradeState,
  });
  assert.deepEqual(
    journaledRows.map((migration) => migration.name),
    [expectedMigrationNames[0]],
  );

  await applyMigrations({
    configPath: canonicalConfigPath,
    environment,
    expectedLastMigration: expectedMigrationNames.at(-1),
    statePath: upgradeState,
  });
  const upgradedRows = migrationRows({
    configPath: canonicalConfigPath,
    environment,
    statePath: upgradeState,
  });
  assert.deepEqual(
    upgradedRows.map((migration) => migration.name),
    expectedMigrationNames,
  );
  assert.deepEqual(upgradedRows[0], journaledRows[0]);
  assert.deepEqual(
    queryD1({
      command: `SELECT id, email FROM customers
        WHERE id = 'customer_migration_sentinel'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: upgradeState,
    }),
    [
      {
        id: "customer_migration_sentinel",
        email: "migration@example.com",
      },
    ],
  );

  await applyMigrations({
    configPath: canonicalConfigPath,
    environment,
    noOp: true,
    statePath: upgradeState,
  });
  assert.deepEqual(
    migrationRows({
      configPath: canonicalConfigPath,
      environment,
      statePath: upgradeState,
    }),
    upgradedRows,
  );

  executeD1({
    command: `INSERT INTO products (
        id, slug, name, status, price_cents, currency, created_at, updated_at
      ) VALUES (
        'product_apollon', 'apollon', 'Apollon', 'active', 2999, 'EUR',
        '2099-08-10T12:00:00.000Z', '2099-08-10T12:00:00.000Z'
      );
      INSERT INTO variants (
        id, product_id, internal_reference, color_key, color_name, size,
        swatch, image_url, active, sort_order, created_at, updated_at
      ) VALUES (
        'variant_boxer_pourpre_s', 'product_apollon', 'AJ-APO-POU-S',
        'pourpre', 'Pourpre Impérial', 'S', '#7d0f52', '/pourpre.webp', 1, 0,
        '2099-08-10T12:00:00.000Z', '2099-08-10T12:00:00.000Z'
      );
      INSERT INTO carts (
        id, status, currency, expires_at, created_at, updated_at
      ) VALUES (
        'cart_d1_price_proof', 'open', 'EUR', '2099-08-10T14:00:00.000Z',
        '2099-08-10T12:00:00.000Z', '2099-08-10T12:00:00.000Z'
      );
      INSERT INTO cart_lines (
        id, cart_id, variant_id, quantity, unit_price_cents,
        created_at, updated_at
      ) VALUES (
        'cart_line_d1_price_proof', 'cart_d1_price_proof',
        'variant_boxer_pourpre_s', 1, 2999,
        '2099-08-10T12:00:00.000Z', '2099-08-10T12:00:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: upgradeState,
  });
  const tamperOutput = executeD1({
    command: `UPDATE cart_lines SET unit_price_cents = 1
      WHERE id = 'cart_line_d1_price_proof'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: upgradeState,
  });
  assert.match(tamperOutput, /commerce_cart_line_snapshot_is_immutable/);

  executeD1({
    command: `UPDATE cart_lines
        SET quantity = 2, updated_at = '2099-08-10T12:01:00.000Z'
        WHERE id = 'cart_line_d1_price_proof';
      UPDATE products SET price_cents = 3499
        WHERE id = 'product_apollon'`,
    configPath: canonicalConfigPath,
    environment,
    statePath: upgradeState,
  });
  assert.deepEqual(
    queryD1({
      command: `SELECT product.price_cents AS current_catalog_price,
          cart.currency, line.quantity,
          line.unit_price_cents AS cart_snapshot_price
        FROM cart_lines AS line
        INNER JOIN carts AS cart ON cart.id = line.cart_id
        INNER JOIN variants AS variant ON variant.id = line.variant_id
        INNER JOIN products AS product ON product.id = variant.product_id
        WHERE line.id = 'cart_line_d1_price_proof'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: upgradeState,
    }),
    [
      {
        current_catalog_price: 3499,
        currency: "EUR",
        quantity: 2,
        cart_snapshot_price: 2999,
      },
    ],
  );

  const pre0002Root = join(proofRoot, "p");
  const pre0002ConfigPath = createMigrationSubsetConfig({
    canonicalConfig,
    migrationNames: expectedMigrationNames.slice(0, 2),
    root: pre0002Root,
    workerName: "aj-luxury-d1-0001-upgrade-proof",
  });
  const pre0002State = join(proofRoot, "v");
  await applyMigrations({
    configPath: pre0002ConfigPath,
    environment,
    expectedLastMigration: expectedMigrationNames[1],
    statePath: pre0002State,
  });
  executeD1({
    command: `INSERT INTO customers (
        id, email, accepts_marketing, created_at, updated_at
      ) VALUES (
        'customer_0001_sentinel', 'migration-0001@example.com', 0,
        '2099-08-11T10:00:00.000Z', '2099-08-11T10:00:00.000Z'
      );
      INSERT INTO products (
        id, slug, name, status, price_cents, currency, created_at, updated_at
      ) VALUES (
        'product_snapshot_proof', 'snapshot-proof', 'Snapshot Proof',
        'active', 2999, 'EUR', '2099-08-11T10:00:00.000Z',
        '2099-08-11T10:00:00.000Z'
      );
      INSERT INTO variants (
        id, product_id, internal_reference, color_key, color_name, size,
        swatch, image_url, active, sort_order, created_at, updated_at
      ) VALUES (
        'variant_snapshot_proof_s', 'product_snapshot_proof',
        'AJ-SNAPSHOT-PROOF-S', 'proof', 'Proof', 'S', '#111111',
        '/snapshot-proof.webp', 1, 0, '2099-08-11T10:00:00.000Z',
        '2099-08-11T10:00:00.000Z'
      );
      INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES (
        'order_paid_snapshot', 'AJ-MIG-PAID-0001', NULL, NULL,
        'paid-snapshot@example.com', 'paid', 'EUR', 2999, 0, 0, 2999,
        'FR', '{}', '{}', 'terms-v1', 'privacy-v1',
        '2099-08-11T10:01:00.000Z', '2099-08-11T10:00:00.000Z',
        '2099-08-11T10:01:00.000Z'
      );
      INSERT INTO order_lines (
        id, order_id, variant_id, internal_reference, product_name,
        color_name, size, quantity, unit_price_cents, line_total_cents,
        created_at
      ) VALUES (
        'order_line_paid_snapshot', 'order_paid_snapshot',
        'variant_snapshot_proof_s', 'AJ-SNAPSHOT-PROOF-S',
        'Snapshot Proof', 'Proof', 'S', 1, 2999, 2999,
        '2099-08-11T10:00:00.000Z'
      );
      INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES
      ('order_state_cancelled', 'AJ-STATE-CANCELLED', NULL, NULL,
        'cancelled@example.com', 'cancelled', 'EUR', 0, 0, 0, 0, 'FR',
        '{}', '{}', 'terms-v1', 'privacy-v1', NULL,
        '2099-08-11T10:00:00.000Z', '2099-08-11T10:00:00.000Z'),
      ('order_state_refunded', 'AJ-STATE-REFUNDED', NULL, NULL,
        'refunded@example.com', 'refunded', 'EUR', 0, 0, 0, 0, 'FR',
        '{}', '{}', 'terms-v1', 'privacy-v1',
        '2099-08-11T10:01:00.000Z', '2099-08-11T10:00:00.000Z',
        '2099-08-11T10:01:00.000Z'),
      ('order_state_preparing', 'AJ-STATE-PREPARING', NULL, NULL,
        'preparing@example.com', 'preparing', 'EUR', 0, 0, 0, 0, 'FR',
        '{}', '{}', 'terms-v1', 'privacy-v1',
        '2099-08-11T10:01:00.000Z', '2099-08-11T10:00:00.000Z',
        '2099-08-11T10:01:00.000Z'),
      ('order_state_shipped', 'AJ-STATE-SHIPPED', NULL, NULL,
        'shipped@example.com', 'shipped', 'EUR', 0, 0, 0, 0, 'FR',
        '{}', '{}', 'terms-v1', 'privacy-v1',
        '2099-08-11T10:01:00.000Z', '2099-08-11T10:00:00.000Z',
        '2099-08-11T10:01:00.000Z'),
      ('order_state_paid', 'AJ-STATE-PAID', NULL, NULL,
        'paid-state@example.com', 'paid', 'EUR', 0, 0, 0, 0, 'FR',
        '{}', '{}', 'terms-v1', 'privacy-v1',
        '2099-08-11T10:01:00.000Z', '2099-08-11T10:00:00.000Z',
        '2099-08-11T10:01:00.000Z');
      INSERT INTO webhook_events (
        id, provider, provider_event_id, event_type, payload_fingerprint,
        verification_method, verified_at, order_id, provider_payment_id,
        amount_cents, currency, status, attempts, last_error_code, received_at,
        processed_at
      ) VALUES (
        'webhook_processed_sentinel', 'test', 'event_processed_sentinel',
        'payment.succeeded', 'fingerprint_processed_sentinel', 'test_adapter',
        '2099-08-11T10:01:00.000Z', 'order_state_paid',
        'provider_processed_sentinel', 1, 'EUR', 'processed', 1, NULL,
        '2099-08-11T10:00:00.000Z', '2099-08-11T10:02:00.000Z'
      )`,
    configPath: pre0002ConfigPath,
    environment,
    statePath: pre0002State,
  });
  const pre0002Rows = migrationRows({
    configPath: pre0002ConfigPath,
    environment,
    statePath: pre0002State,
  });
  assert.deepEqual(
    pre0002Rows.map((migration) => migration.name),
    expectedMigrationNames.slice(0, 2),
  );

  await applyMigrations({
    configPath: canonicalConfigPath,
    environment,
    expectedLastMigration: expectedMigrationNames.at(-1),
    statePath: pre0002State,
  });
  const upgradedFrom0001Rows = migrationRows({
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  assert.deepEqual(
    upgradedFrom0001Rows.map((migration) => migration.name),
    expectedMigrationNames,
  );
  assert.deepEqual(upgradedFrom0001Rows.slice(0, 2), pre0002Rows);
  assert.deepEqual(
    queryD1({
      command: `SELECT id, email FROM customers
        WHERE id = 'customer_0001_sentinel'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      {
        id: "customer_0001_sentinel",
        email: "migration-0001@example.com",
      },
    ],
  );
  await applyMigrations({
    configPath: canonicalConfigPath,
    environment,
    noOp: true,
    statePath: pre0002State,
  });
  assert.deepEqual(
    migrationRows({
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    upgradedFrom0001Rows,
  );
  const terminalWebhookMutationOutput = executeD1({
    command: `UPDATE webhook_events SET attempts = attempts + 1
      WHERE id = 'webhook_processed_sentinel'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    terminalWebhookMutationOutput,
    /commerce_terminal_webhook_is_immutable/,
  );
  assert.deepEqual(
    queryD1({
      command: `SELECT status, attempts, processed_at FROM webhook_events
        WHERE id = 'webhook_processed_sentinel'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      {
        status: "processed",
        attempts: 1,
        processed_at: "2099-08-11T10:02:00.000Z",
      },
    ],
  );

  const paidUpdateOutput = executeD1({
    command: `UPDATE order_lines
      SET product_name = 'Forged', unit_price_cents = 1, line_total_cents = 1
      WHERE id = 'order_line_paid_snapshot'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(paidUpdateOutput, /commerce_order_line_snapshot_is_immutable/);
  const paidDeleteOutput = executeD1({
    command: `DELETE FROM order_lines
      WHERE id = 'order_line_paid_snapshot'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(paidDeleteOutput, /commerce_order_line_snapshot_is_immutable/);
  const paidAddOutput = executeD1({
    command: `INSERT INTO order_lines (
        id, order_id, variant_id, internal_reference, product_name,
        color_name, size, quantity, unit_price_cents, line_total_cents,
        created_at
      ) VALUES (
        'order_line_paid_attack', 'order_paid_snapshot',
        'variant_snapshot_proof_s', 'AJ-SNAPSHOT-PROOF-S',
        'Snapshot Proof', 'Proof', 'S', 1, 1, 1,
        '2099-08-11T10:02:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(paidAddOutput, /commerce_order_line_insert_not_allowed/);
  const paidCascadeOutput = executeD1({
    command: `DELETE FROM orders WHERE id = 'order_paid_snapshot'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(paidCascadeOutput, /commerce_order_line_snapshot_is_immutable/);
  assert.deepEqual(
    queryD1({
      command: `SELECT product_name, quantity, unit_price_cents,
          line_total_cents
        FROM order_lines WHERE id = 'order_line_paid_snapshot'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      {
        product_name: "Snapshot Proof",
        quantity: 1,
        unit_price_cents: 2999,
        line_total_cents: 2999,
      },
    ],
  );

  executeD1({
    command: `INSERT INTO carts (
        id, status, currency, expires_at, created_at, updated_at
      ) VALUES (
        'cart_pending_snapshot', 'open', 'EUR',
        '2099-08-11T13:00:00.000Z', '2099-08-11T11:00:00.000Z',
        '2099-08-11T11:00:00.000Z'
      );
      INSERT INTO cart_lines (
        id, cart_id, variant_id, quantity, unit_price_cents,
        created_at, updated_at
      ) VALUES (
        'cart_line_pending_snapshot', 'cart_pending_snapshot',
        'variant_snapshot_proof_s', 2, 2999,
        '2099-08-11T11:00:00.000Z', '2099-08-11T11:00:00.000Z'
      );
      INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES (
        'order_pending_snapshot', 'AJ-MIG-PENDING-0002',
        'cart_pending_snapshot', NULL,
        'pending-snapshot@example.com', 'pending_payment', 'EUR',
        5998, 0, 0, 5998, 'FR', '{}', '{}', 'terms-v1', 'privacy-v1', NULL,
        '2099-08-11T11:00:00.000Z', '2099-08-11T11:00:00.000Z'
      );
      INSERT INTO order_lines (
        id, order_id, variant_id, internal_reference, product_name,
        color_name, size, quantity, unit_price_cents, line_total_cents,
        created_at
      ) VALUES
      (
        'order_line_pending_snapshot_1', 'order_pending_snapshot',
        'variant_snapshot_proof_s', 'AJ-SNAPSHOT-PROOF-S',
        'Snapshot Proof', 'Proof', 'S', 2, 2999, 5998,
        '2099-08-11T11:00:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  const pendingUpdateOutput = executeD1({
    command: `UPDATE order_lines
      SET product_name = 'Forged', unit_price_cents = 1, line_total_cents = 1
      WHERE id = 'order_line_pending_snapshot_1'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(pendingUpdateOutput, /commerce_order_line_snapshot_is_immutable/);
  const pendingDeleteOutput = executeD1({
    command: `DELETE FROM order_lines
      WHERE id = 'order_line_pending_snapshot_1'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(pendingDeleteOutput, /commerce_order_line_snapshot_is_immutable/);
  const pendingCascadeOutput = executeD1({
    command: `DELETE FROM orders WHERE id = 'order_pending_snapshot'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(pendingCascadeOutput, /commerce_order_line_snapshot_is_immutable/);
  assert.deepEqual(
    queryD1({
      command: `SELECT id, product_name, unit_price_cents, line_total_cents
        FROM order_lines WHERE order_id = 'order_pending_snapshot'
        ORDER BY id`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      {
        id: "order_line_pending_snapshot_1",
        product_name: "Snapshot Proof",
        unit_price_cents: 2999,
        line_total_cents: 5998,
      },
    ],
  );

  executeD1({
    command: `INSERT INTO variants (
        id, product_id, internal_reference, color_key, color_name, size,
        swatch, image_url, active, sort_order, created_at, updated_at
      ) VALUES (
        'variant_zero_stock_m', 'product_snapshot_proof',
        'AJ-SNAPSHOT-ZERO-M', 'zero', 'Zero', 'M', '#222222',
        '/snapshot-zero.webp', 1, 1, '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      );
      INSERT INTO inventory (
        variant_id, physical_quantity, gift_reserve_quantity,
        safety_reserve_quantity, active_reserved_quantity, sold_quantity,
        reserves_validated, version, updated_at
      ) VALUES (
        'variant_snapshot_proof_s', 20, 0, 0, 0, 0, 1, 0,
        '2099-08-11T12:00:00.000Z'
      );
      INSERT INTO inventory (
        variant_id, physical_quantity, gift_reserve_quantity,
        safety_reserve_quantity, active_reserved_quantity, sold_quantity,
        reserves_validated, version, updated_at
      ) VALUES (
        'variant_zero_stock_m', 0, 0, 0, 0, 0, 1, 0,
        '2099-08-11T12:00:00.000Z'
      );
      INSERT INTO carts (
        id, status, currency, expires_at, created_at, updated_at
      ) VALUES
      (
        'cart_delete_legitimate', 'open', 'EUR',
        '2099-08-11T14:00:00.000Z', '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      ),
      (
        'cart_delete_reserved', 'open', 'EUR',
        '2099-08-11T14:00:00.000Z', '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      ),
      (
        'cart_delete_ordered', 'open', 'EUR',
        '2099-08-11T14:00:00.000Z', '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      ),
      (
        'cart_delete_converted', 'open', 'EUR',
        '2099-08-11T14:00:00.000Z', '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      ),
      (
        'cart_delete_expired', 'open', 'EUR',
        '2099-08-11T14:00:00.000Z', '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      );
      INSERT INTO cart_lines (
        id, cart_id, variant_id, quantity, unit_price_cents,
        created_at, updated_at
      ) VALUES
      (
        'cart_line_delete_legitimate', 'cart_delete_legitimate',
        'variant_snapshot_proof_s', 1, 2999, '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      ),
      (
        'cart_line_delete_reserved', 'cart_delete_reserved',
        'variant_snapshot_proof_s', 1, 2999, '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      ),
      (
        'cart_line_delete_ordered', 'cart_delete_ordered',
        'variant_snapshot_proof_s', 1, 2999, '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      ),
      (
        'cart_line_delete_converted', 'cart_delete_converted',
        'variant_snapshot_proof_s', 1, 2999, '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      ),
      (
        'cart_line_delete_expired', 'cart_delete_expired',
        'variant_snapshot_proof_s', 1, 2999, '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      );
      INSERT INTO stock_reservations (
        id, cart_id, variant_id, quantity, status, idempotency_key,
        last_transition_key, expires_at, converted_order_id, created_at,
        updated_at
      ) VALUES (
        'reservation_delete_guard', 'cart_delete_reserved',
        'variant_snapshot_proof_s', 1, 'active',
        'reservation:delete-guard', NULL,
        '2099-08-11T13:00:00.000Z', NULL,
        '2099-08-11T12:00:00.000Z', '2099-08-11T12:00:00.000Z'
      );
      UPDATE stock_reservations
      SET status = 'released', last_transition_key = 'release:delete-guard',
        updated_at = '2099-08-11T12:01:00.000Z'
      WHERE id = 'reservation_delete_guard';
      INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES (
        'order_cart_delete_guard', 'AJ-MIG-CART-GUARD',
        'cart_delete_ordered', NULL, 'cart-guard@example.com',
        'pending_payment', 'EUR', 2999, 0, 0, 2999, 'FR', '{}', '{}',
        'terms-v1', 'privacy-v1', NULL, '2099-08-11T12:00:00.000Z',
        '2099-08-11T12:00:00.000Z'
      );
      UPDATE carts SET status = 'converted'
        WHERE id = 'cart_delete_converted';
      UPDATE carts SET expires_at = '2000-01-01T00:00:00.000Z'
        WHERE id = 'cart_delete_expired'`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  for (const frozenCart of ["cart_delete_reserved", "cart_delete_ordered"]) {
    const addOutput = executeD1({
      command: `INSERT INTO cart_lines (
          id, cart_id, variant_id, quantity, unit_price_cents,
          created_at, updated_at
        ) VALUES (
          'cart_line_add_attack_${frozenCart}', '${frozenCart}',
          'variant_snapshot_proof_s', 1, 2999,
          '2099-08-11T12:02:00.000Z', '2099-08-11T12:02:00.000Z'
        )`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(addOutput, /commerce_cart_line_catalog_mismatch/);
  }
  executeD1({
    command: `UPDATE cart_lines
      SET quantity = 2, updated_at = '2099-08-11T12:02:00.000Z'
      WHERE id = 'cart_line_delete_legitimate';
      DELETE FROM cart_lines WHERE id = 'cart_line_delete_legitimate'`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  assert.deepEqual(
    queryD1({
      command: `SELECT COUNT(*) AS count FROM cart_lines
        WHERE id = 'cart_line_delete_legitimate'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [{ count: 0 }],
  );

  for (const guardedCartLine of [
    "cart_line_delete_reserved",
    "cart_line_delete_ordered",
    "cart_line_delete_converted",
    "cart_line_delete_expired",
  ]) {
    const deleteOutput = executeD1({
      command: `DELETE FROM cart_lines WHERE id = '${guardedCartLine}'`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(deleteOutput, /commerce_cart_line_delete_not_allowed/);
  }
  const orderedQuantityOutput = executeD1({
    command: `UPDATE cart_lines
      SET quantity = 2, updated_at = '2099-08-11T12:03:00.000Z'
      WHERE id = 'cart_line_delete_ordered'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    orderedQuantityOutput,
    /commerce_cart_line_quantity_update_not_allowed/,
  );
  const releasedQuantityOutput = executeD1({
    command: `UPDATE cart_lines
      SET quantity = 2, updated_at = '2099-08-11T12:03:00.000Z'
      WHERE id = 'cart_line_delete_reserved'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    releasedQuantityOutput,
    /commerce_cart_line_quantity_update_not_allowed/,
  );
  assert.deepEqual(
    queryD1({
      command: `SELECT id, quantity FROM cart_lines
        WHERE id IN (
          'cart_line_delete_reserved', 'cart_line_delete_ordered',
          'cart_line_delete_converted', 'cart_line_delete_expired'
        ) ORDER BY id`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      { id: "cart_line_delete_converted", quantity: 1 },
      { id: "cart_line_delete_expired", quantity: 1 },
      { id: "cart_line_delete_ordered", quantity: 1 },
      { id: "cart_line_delete_reserved", quantity: 1 },
    ],
  );

  executeD1({
    command: `INSERT INTO carts (
        id, status, currency, expires_at, created_at, updated_at
      ) VALUES
      ('cart_reservation_without_line', 'open', 'EUR',
        '2099-08-11T14:00:00.000Z', '2099-08-11T12:10:00.000Z',
        '2099-08-11T12:10:00.000Z'),
      ('cart_reservation_over_line', 'open', 'EUR',
        '2099-08-11T14:00:00.000Z', '2099-08-11T12:10:00.000Z',
        '2099-08-11T12:10:00.000Z');
      INSERT INTO cart_lines (
        id, cart_id, variant_id, quantity, unit_price_cents,
        created_at, updated_at
      ) VALUES (
        'cart_line_reservation_over', 'cart_reservation_over_line',
        'variant_snapshot_proof_s', 1, 2999,
        '2099-08-11T12:10:00.000Z', '2099-08-11T12:10:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  const reservationGuardInventoryBefore = queryD1({
    command: `SELECT active_reserved_quantity, sold_quantity, version
      FROM inventory WHERE variant_id = 'variant_snapshot_proof_s'`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  for (const [reservationId, cartId, quantity] of [
    ["reservation_without_line_attack", "cart_reservation_without_line", 1],
    ["reservation_over_line_attack", "cart_reservation_over_line", 2],
  ]) {
    const mismatchOutput = executeD1({
      command: `INSERT INTO stock_reservations (
          id, cart_id, variant_id, quantity, status, idempotency_key,
          last_transition_key, expires_at, converted_order_id, created_at,
          updated_at
        ) VALUES (
          '${reservationId}', '${cartId}', 'variant_snapshot_proof_s',
          ${quantity}, 'active', 'reserve:${reservationId}', NULL,
          '2099-08-11T13:00:00.000Z', NULL,
          '2099-08-11T12:10:00.000Z', '2099-08-11T12:10:00.000Z'
        )`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(mismatchOutput, /commerce_reservation_cart_line_mismatch/);
  }
  assert.deepEqual(
    queryD1({
      command: `SELECT active_reserved_quantity, sold_quantity, version
        FROM inventory WHERE variant_id = 'variant_snapshot_proof_s'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    reservationGuardInventoryBefore,
  );
  assert.deepEqual(
    queryD1({
      command: `SELECT COUNT(*) AS count FROM stock_reservations
        WHERE id IN (
          'reservation_without_line_attack', 'reservation_over_line_attack'
        )`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [{ count: 0 }],
  );

  executeD1({
    command: `INSERT INTO carts (
        id, status, currency, expires_at, created_at, updated_at
      ) VALUES
      ('cart_parent_line', 'open', 'EUR', '2099-08-11T16:00:00.000Z',
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'),
      ('cart_parent_active', 'open', 'EUR', '2099-08-11T16:00:00.000Z',
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'),
      ('cart_parent_released', 'open', 'EUR', '2099-08-11T16:00:00.000Z',
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'),
      ('cart_parent_converted', 'open', 'EUR', '2099-08-11T16:00:00.000Z',
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'),
      ('cart_parent_order', 'open', 'EUR', '2099-08-11T16:00:00.000Z',
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'),
      ('cart_parent_empty', 'open', 'EUR', '2099-08-11T16:00:00.000Z',
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z');
      INSERT INTO cart_lines (
        id, cart_id, variant_id, quantity, unit_price_cents,
        created_at, updated_at
      ) VALUES
      (
        'cart_line_parent_guard', 'cart_parent_line',
        'variant_snapshot_proof_s', 1, 2999,
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'
      ),
      (
        'cart_line_parent_active', 'cart_parent_active',
        'variant_snapshot_proof_s', 1, 2999,
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'
      ),
      (
        'cart_line_parent_released', 'cart_parent_released',
        'variant_snapshot_proof_s', 1, 2999,
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'
      ),
      (
        'cart_line_parent_converted', 'cart_parent_converted',
        'variant_snapshot_proof_s', 1, 2999,
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'
      );
      INSERT INTO stock_reservations (
        id, cart_id, variant_id, quantity, status, idempotency_key,
        last_transition_key, expires_at, converted_order_id, created_at,
        updated_at
      ) VALUES
      (
        'reservation_parent_active', 'cart_parent_active',
        'variant_snapshot_proof_s', 1, 'active',
        'reservation:parent-active', NULL, '2099-08-11T15:00:00.000Z',
        NULL, '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'
      ),
      (
        'reservation_parent_released', 'cart_parent_released',
        'variant_snapshot_proof_s', 1, 'active',
        'reservation:parent-released', NULL,
        '2099-08-11T15:00:00.000Z', NULL,
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'
      ),
      (
        'reservation_parent_converted', 'cart_parent_converted',
        'variant_snapshot_proof_s', 1, 'active',
        'reservation:parent-converted', NULL,
        '2099-08-11T15:00:00.000Z', NULL,
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:00:00.000Z'
      );
      UPDATE stock_reservations
      SET status = 'released', last_transition_key = 'release:parent-released',
        updated_at = '2099-08-11T13:01:00.000Z'
      WHERE id = 'reservation_parent_released';
      UPDATE stock_reservations
      SET status = 'released', last_transition_key = 'release:parent-converted',
        updated_at = '2099-08-11T13:02:00.000Z'
      WHERE id = 'reservation_parent_converted';
      INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES (
        'order_parent_cart_guard', 'AJ-MIG-PARENT-GUARD',
        'cart_parent_order', NULL, 'parent-guard@example.com',
        'pending_payment', 'EUR', 2999, 0, 0, 2999, 'FR', '{}', '{}',
        'terms-v1', 'privacy-v1', NULL, '2099-08-11T13:00:00.000Z',
        '2099-08-11T13:00:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });

  for (const frozenCart of [
    "cart_parent_active",
    "cart_parent_released",
    "cart_parent_converted",
    "cart_parent_order",
  ]) {
    const addOutput = executeD1({
      command: `INSERT INTO cart_lines (
          id, cart_id, variant_id, quantity, unit_price_cents,
          created_at, updated_at
        ) VALUES (
          'cart_line_parent_add_${frozenCart}', '${frozenCart}',
          'variant_snapshot_proof_s', 1, 2999,
          '2099-08-11T13:02:00.000Z', '2099-08-11T13:02:00.000Z'
        )`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(addOutput, /commerce_cart_line_catalog_mismatch/);
  }

  executeD1({
    command: `DELETE FROM carts WHERE id = 'cart_parent_empty'`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  for (const guardedParent of [
    "cart_parent_line",
    "cart_parent_active",
    "cart_parent_released",
    "cart_parent_converted",
    "cart_parent_order",
  ]) {
    const parentDeleteOutput = executeD1({
      command: `DELETE FROM carts WHERE id = '${guardedParent}'`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(
      parentDeleteOutput,
      /commerce_cart_delete_requires_empty_cart/,
    );
  }
  assert.deepEqual(
    queryD1({
      command: `SELECT active_reserved_quantity, sold_quantity, version
        FROM inventory WHERE variant_id = 'variant_snapshot_proof_s'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [{ active_reserved_quantity: 1, sold_quantity: 0, version: 7 }],
  );
  const directConvertedReservationOutput = executeD1({
    command: `INSERT INTO stock_reservations (
        id, cart_id, variant_id, quantity, status, idempotency_key,
        last_transition_key, expires_at, converted_order_id, created_at,
        updated_at
      ) VALUES (
        'reservation_direct_converted_attack', 'cart_parent_active',
        'variant_snapshot_proof_s', 1, 'converted',
        'reservation:direct-converted-attack', 'sale:forged',
        '2099-08-11T15:00:00.000Z', 'order_parent_cart_guard',
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:01:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    directConvertedReservationOutput,
    /commerce_reservation_(insert_must_be_active|cart_line_mismatch)/,
  );
  const activeReservationDeleteOutput = executeD1({
    command: `DELETE FROM stock_reservations
      WHERE id = 'reservation_parent_active'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(activeReservationDeleteOutput, /commerce_reservation_is_immutable/);
  const inventoryDeleteOutput = executeD1({
    command: `DELETE FROM inventory
      WHERE variant_id = 'variant_snapshot_proof_s'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(inventoryDeleteOutput, /commerce_inventory_is_immutable/);
  assert.deepEqual(
    queryD1({
      command: `SELECT
          (SELECT COUNT(*) FROM stock_reservations
            WHERE id = 'reservation_parent_active' AND status = 'active') AS rows,
          active_reserved_quantity, sold_quantity, version
        FROM inventory WHERE variant_id = 'variant_snapshot_proof_s'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [{ rows: 1, active_reserved_quantity: 1, sold_quantity: 0, version: 7 }],
  );
  assert.deepEqual(
    queryD1({
      command: `SELECT
          (SELECT COUNT(*) FROM carts
            WHERE id LIKE 'cart_parent_%') AS retained_carts,
          (SELECT COUNT(*) FROM stock_reservations
            WHERE id LIKE 'reservation_parent_%') AS retained_reservations,
          (SELECT COUNT(*) FROM cart_lines
            WHERE id = 'cart_line_parent_guard') AS retained_lines,
          (SELECT COUNT(*) FROM orders
            WHERE id = 'order_parent_cart_guard') AS retained_orders`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      {
        retained_carts: 5,
        retained_reservations: 3,
        retained_lines: 1,
        retained_orders: 1,
      },
    ],
  );

  const directPaidInsertOutput = executeD1({
    command: `INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES (
        'order_direct_paid_attack', 'AJ-DIRECT-PAID', NULL, NULL,
        'direct-paid@example.com', 'paid', 'EUR', 0, 0, 0, 0, 'FR',
        '{}', '{}', 'terms-v1', 'privacy-v1',
        '2099-08-11T14:00:00.000Z', '2099-08-11T14:00:00.000Z',
        '2099-08-11T14:00:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.deepEqual(
    queryD1({
      command: `SELECT stock.physical_quantity,
          COUNT(movement.id) AS seed_movements
        FROM inventory AS stock
        LEFT JOIN inventory_movements AS movement
          ON movement.variant_id = stock.variant_id AND movement.kind = 'seed'
        WHERE stock.variant_id = 'variant_zero_stock_m'
        GROUP BY stock.variant_id, stock.physical_quantity`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [{ physical_quantity: 0, seed_movements: 0 }],
  );
  assert.match(directPaidInsertOutput, /commerce_order_insert_must_be_pending/);
  executeD1({
    command: `INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES (
        'order_state_pending_legit', 'AJ-STATE-PENDING', NULL, NULL,
        'pending-state@example.com', 'pending_payment', 'EUR',
        0, 0, 0, 0, 'FR', '{}', '{}', 'terms-v1', 'privacy-v1', NULL,
        '2099-08-11T14:00:00.000Z', '2099-08-11T14:00:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });

  const impossibleOrderTransitions = [
    ["order_state_cancelled", "shipped"],
    ["order_state_refunded", "preparing"],
    ["order_state_preparing", "paid"],
    ["order_state_preparing", "shipped"],
    ["order_state_shipped", "paid"],
    ["order_state_paid", "cancelled"],
  ];
  for (const [orderId, nextStatus] of impossibleOrderTransitions) {
    const transitionOutput = executeD1({
      command: `UPDATE orders SET status = '${nextStatus}',
          updated_at = '2099-08-11T14:01:00.000Z'
        WHERE id = '${orderId}'`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(transitionOutput, /commerce_invalid_order_transition/);
  }
  for (const orderId of [
    "order_state_cancelled",
    "order_state_refunded",
    "order_state_preparing",
    "order_state_shipped",
    "order_state_paid",
  ]) {
    const pendingReturnOutput = executeD1({
      command: `UPDATE orders SET status = 'pending_payment',
          updated_at = '2099-08-11T14:01:00.000Z'
        WHERE id = '${orderId}'`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(pendingReturnOutput, /commerce_invalid_order_transition/);
  }
  executeD1({
    command: `UPDATE orders
      SET status = 'cancelled', updated_at = '2099-08-11T14:02:00.000Z'
      WHERE id = 'order_state_pending_legit'`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  const reopenedCancelledOutput = executeD1({
    command: `UPDATE orders SET status = 'pending_payment',
        updated_at = '2099-08-11T14:03:00.000Z'
      WHERE id = 'order_state_pending_legit'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    reopenedCancelledOutput,
    /commerce_invalid_order_transition/,
  );
  assert.deepEqual(
    queryD1({
      command: `SELECT id, status FROM orders
        WHERE id LIKE 'order_state_%' ORDER BY id`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      { id: "order_state_cancelled", status: "cancelled" },
      { id: "order_state_paid", status: "paid" },
      { id: "order_state_pending_legit", status: "cancelled" },
      { id: "order_state_preparing", status: "preparing" },
      { id: "order_state_refunded", status: "refunded" },
      { id: "order_state_shipped", status: "shipped" },
    ],
  );

  const pendingHeaderOutput = executeD1({
    command: `UPDATE orders SET email = 'forged@example.com',
        subtotal_cents = 1, total_cents = 1,
        shipping_address_json = '{"forged":true}', terms_version = 'forged'
      WHERE id = 'order_pending_snapshot'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(pendingHeaderOutput, /commerce_order_snapshot_is_immutable/);
  const atomicPaidHeaderOutput = executeD1({
    command: `UPDATE orders
      SET status = 'paid', paid_at = '2099-08-11T14:03:00.000Z',
        updated_at = '2099-08-11T14:03:00.000Z',
        email = 'forged-on-payment@example.com'
      WHERE id = 'order_pending_snapshot'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(atomicPaidHeaderOutput, /commerce_order_snapshot_is_immutable/);
  const invalidPaidAtOutput = executeD1({
    command: `UPDATE orders SET paid_at = '2099-08-11T14:03:00.000Z'
      WHERE id = 'order_pending_snapshot'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    invalidPaidAtOutput,
    /commerce_order_paid_at_transition_not_allowed/,
  );
  const missingPaidAtOutput = executeD1({
    command: `UPDATE orders
      SET status = 'paid', updated_at = '2099-08-11T14:03:00.000Z'
      WHERE id = 'order_pending_snapshot'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(missingPaidAtOutput, /commerce_order_paid_at_required/);
  const unpaidPaidEntryOutput = executeD1({
    command: `UPDATE orders
      SET status = 'paid', paid_at = '2099-08-11T14:03:00.000Z',
        updated_at = '2099-08-11T14:03:00.000Z'
      WHERE id = 'order_pending_snapshot'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(unpaidPaidEntryOutput, /commerce_order_payment_mismatch/);
  const paidHeaderOutput = executeD1({
    command: `UPDATE orders SET email = 'forged@example.com',
        subtotal_cents = 1, total_cents = 1,
        billing_address_json = '{"forged":true}', privacy_version = 'forged'
      WHERE id = 'order_paid_snapshot'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(paidHeaderOutput, /commerce_order_snapshot_is_immutable/);
  const paidAtRewriteOutput = executeD1({
    command: `UPDATE orders SET paid_at = '2099-08-11T14:04:00.000Z'
      WHERE id = 'order_paid_snapshot'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    paidAtRewriteOutput,
    /commerce_order_paid_at_transition_not_allowed/,
  );
  assert.deepEqual(
    queryD1({
      command: `SELECT email, status, subtotal_cents, total_cents,
          shipping_address_json, terms_version, paid_at
        FROM orders WHERE id = 'order_pending_snapshot'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      {
        email: "pending-snapshot@example.com",
        status: "pending_payment",
        subtotal_cents: 5998,
        total_cents: 5998,
        shipping_address_json: "{}",
        terms_version: "terms-v1",
        paid_at: null,
      },
    ],
  );

  executeD1({
    command: `INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES
      ('order_payment_created_attack', 'AJ-PAY-CREATED', NULL, NULL,
        'pay-created@example.com', 'pending_payment', 'EUR', 2999, 0, 0,
        2999, 'FR', '{}', '{}', 'terms-v1', 'privacy-v1', NULL,
        '2099-08-11T15:00:00.000Z', '2099-08-11T15:00:00.000Z'),
      ('order_payment_failed_attack', 'AJ-PAY-FAILED', NULL, NULL,
        'pay-failed@example.com', 'pending_payment', 'EUR', 2999, 0, 0,
        2999, 'FR', '{}', '{}', 'terms-v1', 'privacy-v1', NULL,
        '2099-08-11T15:00:00.000Z', '2099-08-11T15:00:00.000Z'),
      ('order_payment_identity_source', 'AJ-PAY-ID-SOURCE', NULL, NULL,
        'pay-id-source@example.com', 'pending_payment', 'EUR', 2999, 0, 0,
        2999, 'FR', '{}', '{}', 'terms-v1', 'privacy-v1', NULL,
        '2099-08-11T15:00:00.000Z', '2099-08-11T15:00:00.000Z'),
      ('order_payment_identity_target', 'AJ-PAY-ID-TARGET', NULL, NULL,
        'pay-id-target@example.com', 'pending_payment', 'EUR', 2999, 0, 0,
        2999, 'FR', '{}', '{}', 'terms-v1', 'privacy-v1', NULL,
        '2099-08-11T15:00:00.000Z', '2099-08-11T15:00:00.000Z');
      INSERT INTO payments (
        id, order_id, provider, provider_session_id, status, amount_cents,
        currency, idempotency_key, failure_code, created_at, updated_at
      ) VALUES
      ('payment_created_attack', 'order_payment_created_attack', 'test',
        'provider_created_attack', 'created', 2999, 'EUR',
        'payment:created-attack', NULL, '2099-08-11T15:00:00.000Z',
        '2099-08-11T15:00:00.000Z'),
      ('payment_failed_attack', 'order_payment_failed_attack', 'test',
        'provider_failed_attack', 'created', 2999, 'EUR',
        'payment:failed-attack', NULL, '2099-08-11T15:00:00.000Z',
        '2099-08-11T15:00:00.000Z'),
      ('payment_identity_source', 'order_payment_identity_source', 'test',
        'provider_identity_source', 'created', 2999, 'EUR',
        'payment:identity-source', NULL, '2099-08-11T15:00:00.000Z',
        '2099-08-11T15:00:00.000Z');
      INSERT INTO webhook_events (
        id, provider, provider_event_id, event_type, payload_fingerprint,
        verification_method, verified_at, order_id, provider_payment_id,
        amount_cents, currency, status, attempts, received_at
      ) VALUES (
        'webhook_identity_target', 'test', 'event_identity_target',
        'payment.succeeded', 'fingerprint_identity_target', 'test_adapter',
        '2099-08-11T15:01:00.000Z', 'order_payment_identity_target',
        'provider_identity_target', 2999, 'EUR', 'verified', 0,
        '2099-08-11T15:01:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  for (const paymentId of [
    "payment_created_attack",
    "payment_failed_attack",
  ]) {
    const unverifiableSuccessOutput = executeD1({
      command: `UPDATE payments
        SET status = 'succeeded', updated_at = '2099-08-11T15:02:00.000Z'
        WHERE id = '${paymentId}'`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(
      unverifiableSuccessOutput,
      /commerce_payment_requires_verified_event/,
    );
  }
  for (const [status, failureCode] of [
    ["requires_action", "NULL"],
    ["failed", "'declined'"],
    ["expired", "NULL"],
    ["refunded", "NULL"],
  ]) {
    const directTerminalPaymentOutput = executeD1({
      command: `INSERT INTO payments (
          id, order_id, provider, provider_session_id, status, amount_cents,
          currency, idempotency_key, failure_code, created_at, updated_at
        ) VALUES (
          'payment_direct_${status}', 'order_payment_created_attack', 'test',
          'provider_direct_${status}', '${status}', 2999, 'EUR',
          'payment:direct-${status}', ${failureCode},
          '2099-08-11T15:00:00.000Z', '2099-08-11T15:00:00.000Z'
        )`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(
      directTerminalPaymentOutput,
      /commerce_payment_insert_state_not_allowed/,
    );
  }
  const directSucceededWithoutProofOutput = executeD1({
    command: `INSERT INTO payments (
        id, order_id, provider, provider_session_id, status, amount_cents,
        currency, idempotency_key, failure_code, created_at, updated_at
      ) VALUES (
        'payment_direct_succeeded', 'order_payment_created_attack', 'test',
        'provider_direct_succeeded', 'succeeded', 2999, 'EUR',
        'payment:direct-succeeded', NULL, '2099-08-11T15:00:00.000Z',
        '2099-08-11T15:00:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    directSucceededWithoutProofOutput,
    /commerce_payment_requires_verified_event/,
  );
  const createdFailureCodeOutput = executeD1({
    command: `INSERT INTO payments (
        id, order_id, provider, provider_session_id, status, amount_cents,
        currency, idempotency_key, failure_code, created_at, updated_at
      ) VALUES (
        'payment_created_failure_code', 'order_payment_created_attack', 'test',
        'provider_created_failure_code', 'created', 2999, 'EUR',
        'payment:created-failure-code', 'forged',
        '2099-08-11T15:00:00.000Z', '2099-08-11T15:00:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    createdFailureCodeOutput,
    /commerce_payment_insert_state_not_allowed/,
  );
  const fakeRefundOutput = executeD1({
    command: `UPDATE payments
      SET status = 'refunded', updated_at = '2099-08-11T15:02:00.000Z'
      WHERE id = 'payment_created_attack'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(fakeRefundOutput, /commerce_invalid_payment_transition/);
  executeD1({
    command: `INSERT INTO webhook_events (
        id, provider, provider_event_id, event_type, payload_fingerprint,
        verification_method, verified_at, order_id, provider_payment_id,
        amount_cents, currency, status, attempts, received_at
      ) VALUES (
        'webhook_wrong_event_type', 'test', 'event_wrong_event_type',
        'payment.failed', 'fingerprint_wrong_event_type', 'test_adapter',
        '2099-08-11T15:02:00.000Z', 'order_payment_created_attack',
        'provider_created_attack', 2999, 'EUR', 'verified', 0,
        '2099-08-11T15:02:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  const wrongEventTypeOutput = executeD1({
    command: `UPDATE payments
      SET status = 'succeeded', updated_at = '2099-08-11T15:03:00.000Z'
      WHERE id = 'payment_created_attack'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(wrongEventTypeOutput, /commerce_payment_requires_verified_event/);
  const deletedProofOutput = executeD1({
    command: `DELETE FROM webhook_events WHERE id = 'webhook_wrong_event_type'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(deletedProofOutput, /commerce_webhook_is_immutable/);
  const forgedRequiresActionOutput = executeD1({
    command: `UPDATE payments
      SET status = 'requires_action', failure_code = 'forged',
        updated_at = '2099-08-11T15:02:00.000Z'
      WHERE id = 'payment_failed_attack'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    forgedRequiresActionOutput,
    /commerce_payment_transition_payload_invalid/,
  );
  executeD1({
    command: `UPDATE payments
        SET status = 'requires_action', updated_at = '2099-08-11T15:02:00.000Z'
        WHERE id = 'payment_failed_attack';
      INSERT INTO webhook_events (
        id, provider, provider_event_id, event_type, payload_fingerprint,
        verification_method, verified_at, order_id, provider_payment_id,
        amount_cents, currency, status, attempts, received_at
      ) VALUES (
        'webhook_failed_attack', 'test', 'event_failed_attack',
        'payment.failed', 'fingerprint_failed_attack', 'test_adapter',
        '2099-08-11T15:03:00.000Z', 'order_payment_failed_attack',
        'provider_failed_attack', 2999, 'EUR', 'verified', 0,
        '2099-08-11T15:03:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  const missingFailureCodeOutput = executeD1({
    command: `UPDATE payments
      SET status = 'failed', updated_at = '2099-08-11T15:04:00.000Z'
      WHERE id = 'payment_failed_attack'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    missingFailureCodeOutput,
    /commerce_payment_transition_payload_invalid/,
  );
  executeD1({
    command: `UPDATE payments
      SET status = 'failed', failure_code = 'declined',
        updated_at = '2099-08-11T15:04:00.000Z'
      WHERE id = 'payment_failed_attack'`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  const paymentIdentityOutput = executeD1({
    command: `UPDATE payments
      SET order_id = 'order_payment_identity_target',
        provider_session_id = 'provider_identity_target',
        idempotency_key = 'payment:identity-target-forged',
        status = 'succeeded', updated_at = '2099-08-11T15:02:00.000Z'
      WHERE id = 'payment_identity_source'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(paymentIdentityOutput, /commerce_payment_snapshot_is_immutable/);
  assert.deepEqual(
    queryD1({
      command: `SELECT id, order_id, provider_session_id, status,
          amount_cents, idempotency_key
        FROM payments WHERE id IN (
          'payment_created_attack', 'payment_failed_attack',
          'payment_identity_source'
        ) ORDER BY id`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      {
        id: "payment_created_attack",
        order_id: "order_payment_created_attack",
        provider_session_id: "provider_created_attack",
        status: "created",
        amount_cents: 2999,
        idempotency_key: "payment:created-attack",
      },
      {
        id: "payment_failed_attack",
        order_id: "order_payment_failed_attack",
        provider_session_id: "provider_failed_attack",
        status: "failed",
        amount_cents: 2999,
        idempotency_key: "payment:failed-attack",
      },
      {
        id: "payment_identity_source",
        order_id: "order_payment_identity_source",
        provider_session_id: "provider_identity_source",
        status: "created",
        amount_cents: 2999,
        idempotency_key: "payment:identity-source",
      },
    ],
  );

  executeD1({
    command: `INSERT INTO carts (
        id, status, currency, expires_at, created_at, updated_at
      ) VALUES (
        'cart_payment_flow', 'open', 'EUR', '2099-08-11T18:00:00.000Z',
        '2099-08-11T16:00:00.000Z', '2099-08-11T16:00:00.000Z'
      );
      INSERT INTO cart_lines (
        id, cart_id, variant_id, quantity, unit_price_cents,
        created_at, updated_at
      ) VALUES (
        'cart_line_payment_flow', 'cart_payment_flow',
        'variant_snapshot_proof_s', 1, 2999,
        '2099-08-11T16:00:00.000Z', '2099-08-11T16:00:00.000Z'
      );
      INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES (
        'order_payment_flow', 'AJ-PAY-FLOW', 'cart_payment_flow', NULL,
        'payment-flow@example.com', 'pending_payment', 'EUR', 2999, 0, 0,
        2999, 'FR', '{"country":"FR"}', '{"country":"FR"}',
        'terms-v1', 'privacy-v1', NULL, '2099-08-11T16:00:00.000Z',
        '2099-08-11T16:00:00.000Z'
      );
      INSERT INTO order_lines (
        id, order_id, variant_id, internal_reference, product_name,
        color_name, size, quantity, unit_price_cents, line_total_cents,
        created_at
      ) VALUES (
        'order_line_payment_flow', 'order_payment_flow',
        'variant_snapshot_proof_s', 'AJ-SNAPSHOT-PROOF-S',
        'Snapshot Proof', 'Proof', 'S', 1, 2999, 2999,
        '2099-08-11T16:00:00.000Z'
      );
      UPDATE products SET name = 'Snapshot Proof Renamed'
        WHERE id = 'product_snapshot_proof';
      INSERT INTO stock_reservations (
        id, cart_id, variant_id, quantity, status, idempotency_key,
        last_transition_key, expires_at, converted_order_id, created_at,
        updated_at
      ) VALUES (
        'reservation_payment_flow', 'cart_payment_flow',
        'variant_snapshot_proof_s', 1, 'active',
        'reservation:payment-flow', NULL, '2099-08-11T18:00:00.000Z', NULL,
        '2099-08-11T16:00:00.000Z', '2099-08-11T16:00:00.000Z'
      );
      INSERT INTO webhook_events (
        id, provider, provider_event_id, event_type, payload_fingerprint,
        verification_method, verified_at, order_id, provider_payment_id,
        amount_cents, currency, status, attempts, received_at
      ) VALUES (
        'webhook_payment_flow', 'test', 'event_payment_flow',
        'payment.succeeded', 'fingerprint_payment_flow', 'test_adapter',
        '2099-08-11T16:01:00.000Z', 'order_payment_flow',
        'provider_payment_flow', 2999, 'EUR', 'verified', 0,
        '2099-08-11T16:01:00.000Z'
      );
      INSERT INTO payments (
        id, order_id, provider, provider_session_id, status, amount_cents,
        currency, idempotency_key, failure_code, created_at, updated_at
      ) VALUES (
        'payment_flow', 'order_payment_flow', 'test',
        'provider_payment_flow', 'succeeded', 2999, 'EUR',
        'payment:flow', NULL, '2099-08-11T16:01:00.000Z',
        '2099-08-11T16:01:00.000Z'
      );
      UPDATE stock_reservations
      SET status = 'converted', converted_order_id = 'order_payment_flow',
        last_transition_key = 'sale:payment-flow',
        updated_at = '2099-08-11T16:02:00.000Z'
      WHERE id = 'reservation_payment_flow';
      UPDATE orders
      SET status = 'paid', paid_at = '2099-08-11T16:02:00.000Z',
        updated_at = '2099-08-11T16:02:00.000Z'
      WHERE id = 'order_payment_flow';
      UPDATE carts
      SET status = 'converted', updated_at = '2099-08-11T16:02:00.000Z'
      WHERE id = 'cart_payment_flow'`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  assert.deepEqual(
    queryD1({
      command: `SELECT customer_order.status AS order_status,
          customer_order.paid_at, cart.status AS cart_status,
          payment.status AS payment_status,
          reservation.status AS reservation_status,
          order_line.product_name AS order_line_product_name,
          product.name AS catalog_product_name,
          inventory.active_reserved_quantity, inventory.sold_quantity,
          inventory.version
        FROM orders AS customer_order
        INNER JOIN carts AS cart ON cart.id = customer_order.cart_id
        INNER JOIN payments AS payment ON payment.order_id = customer_order.id
        INNER JOIN stock_reservations AS reservation
          ON reservation.converted_order_id = customer_order.id
        INNER JOIN order_lines AS order_line
          ON order_line.order_id = customer_order.id
        INNER JOIN variants AS variant ON variant.id = order_line.variant_id
        INNER JOIN products AS product ON product.id = variant.product_id
        INNER JOIN inventory
          ON inventory.variant_id = reservation.variant_id
        WHERE customer_order.id = 'order_payment_flow'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      {
        order_status: "paid",
        paid_at: "2099-08-11T16:02:00.000Z",
        cart_status: "converted",
        payment_status: "succeeded",
        reservation_status: "converted",
        order_line_product_name: "Snapshot Proof",
        catalog_product_name: "Snapshot Proof Renamed",
        active_reserved_quantity: 1,
        sold_quantity: 1,
        version: 9,
      },
    ],
  );

  for (const [label, command, expectedError] of [
    [
      "order",
      `INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES (
        'order_bad_timestamp', 'AJ-BAD-TIME', NULL, NULL,
        'bad-time@example.com', 'pending_payment', 'EUR', 0, 0, 0, 0,
        'FR', '{}', '{}', 'terms-v1', 'privacy-v1', NULL,
        '2099-08-11 15:00:00', '2099-08-11 15:00:00'
      )`,
      /commerce_order_timestamp_invalid/,
    ],
    [
      "payment",
      `INSERT INTO payments (
        id, order_id, provider, provider_session_id, status, amount_cents,
        currency, idempotency_key, failure_code, created_at, updated_at
      ) VALUES (
        'payment_bad_timestamp', 'order_payment_created_attack', 'test',
        'provider_bad_timestamp', 'created', 2999, 'EUR',
        'payment:bad-timestamp', NULL, '2099-08-11 15:00:00',
        '2099-08-11 15:00:00'
      )`,
      /commerce_payment_timestamp_invalid/,
    ],
    [
      "reservation",
      `INSERT INTO stock_reservations (
        id, cart_id, variant_id, quantity, status, idempotency_key,
        last_transition_key, expires_at, converted_order_id, created_at,
        updated_at
      ) VALUES (
        'reservation_bad_timestamp', 'cart_parent_line',
        'variant_snapshot_proof_s', 1, 'active',
        'reservation:bad-timestamp', NULL, '2099-08-11T15:00:00.000Z',
        NULL, '2099-08-11 13:00:00', '2099-08-11 13:00:00'
      )`,
      /commerce_reservation_timestamp_invalid/,
    ],
    [
      "audit",
      `INSERT INTO audit_log (
        id, actor_type, actor_id, action, entity_type, entity_id,
        idempotency_key, metadata_json, created_at
      ) VALUES (
        'audit_bad_timestamp', 'system', NULL, 'test', 'order',
        'order_payment_created_attack', 'audit:bad-timestamp', '{}',
        '2099-08-11 15:00:00'
      )`,
      /commerce_audit_timestamp_invalid/,
    ],
    [
      "movement",
      `INSERT INTO inventory_movements (
        id, variant_id, kind, quantity, reference_type, reference_id,
        actor_type, actor_id, idempotency_key, created_at
      ) VALUES (
        'movement_bad_timestamp', 'variant_snapshot_proof_s', 'reserve', 1,
        'test', 'timestamp', 'system', NULL, 'movement:bad-timestamp',
        '2099-08-11 15:00:00'
      )`,
      /commerce_inventory_movement_timestamp_invalid/,
    ],
  ]) {
    const invalidTimestampOutput = executeD1({
      command,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(invalidTimestampOutput, expectedError, label);
  }
  for (const [command, expectedError] of [
    [
      `UPDATE orders SET updated_at = '2099-08-11T15:05:00.000Z'
        WHERE id = 'order_payment_created_attack'`,
      /commerce_order_timestamp_requires_transition/,
    ],
    [
      `UPDATE payments SET updated_at = '2099-08-11T15:05:00.000Z'
        WHERE id = 'payment_created_attack'`,
      /commerce_payment_update_requires_transition/,
    ],
    [
      `UPDATE stock_reservations
        SET updated_at = '2099-08-11T15:05:00.000Z'
        WHERE id = 'reservation_parent_active'`,
      /commerce_reservation_update_requires_transition/,
    ],
    [
      `UPDATE webhook_events
        SET processed_at = '2099-08-11T15:05:00.000Z'
        WHERE id = 'webhook_wrong_event_type'`,
      /commerce_webhook_(timestamp_invalid|update_requires_transition)/,
    ],
    [
      `UPDATE inventory SET updated_at = '2099-08-11 15:05:00'
        WHERE variant_id = 'variant_zero_stock_m'`,
      /commerce_inventory_timestamp_invalid/,
    ],
  ]) {
    const falsifiedTimestampOutput = executeD1({
      command,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(falsifiedTimestampOutput, expectedError);
  }
  executeD1({
    command: `INSERT INTO audit_log (
        id, actor_type, actor_id, action, entity_type, entity_id,
        idempotency_key, metadata_json, created_at
      ) VALUES (
        'audit_append_only_proof', 'system', NULL, 'test', 'order',
        'order_payment_created_attack', 'audit:append-only-proof', '{}',
        '2099-08-11T15:05:00.000Z'
      );
      INSERT INTO inventory_movements (
        id, variant_id, kind, quantity, reference_type, reference_id,
        actor_type, actor_id, idempotency_key, created_at
      ) VALUES (
        'movement_append_only_proof', 'variant_snapshot_proof_s',
        'reserve', 1, 'test', 'append-only', 'system', NULL,
        'movement:append-only-proof', '2099-08-11T15:05:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  for (const [command, expectedError] of [
    [
      `UPDATE audit_log SET metadata_json = '{"forged":true}'
        WHERE id = 'audit_append_only_proof'`,
      /commerce_audit_log_is_immutable/,
    ],
    [
      `DELETE FROM audit_log WHERE id = 'audit_append_only_proof'`,
      /commerce_audit_log_is_immutable/,
    ],
    [
      `UPDATE inventory_movements SET quantity = 2
        WHERE id = 'movement_append_only_proof'`,
      /commerce_inventory_movement_is_immutable/,
    ],
    [
      `DELETE FROM inventory_movements WHERE id = 'movement_append_only_proof'`,
      /commerce_inventory_movement_is_immutable/,
    ],
  ]) {
    const appendOnlyOutput = executeD1({
      command,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(appendOnlyOutput, expectedError);
  }
  const forgedCountersOutput = executeD1({
    command: `UPDATE inventory
      SET sold_quantity = 2, version = version + 1,
        updated_at = '2099-08-11T15:05:00.000Z'
      WHERE variant_id = 'variant_snapshot_proof_s'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    forgedCountersOutput,
    /commerce_inventory_reservation_counters_mismatch/,
  );
  const zeroStockBeforeMovement = queryD1({
    command: `SELECT physical_quantity, gift_reserve_quantity,
        safety_reserve_quantity, version, updated_at
      FROM inventory WHERE variant_id = 'variant_zero_stock_m'`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  for (const assignment of [
    "physical_quantity = physical_quantity + 1",
    "gift_reserve_quantity = gift_reserve_quantity + 1",
    "safety_reserve_quantity = safety_reserve_quantity + 1",
  ]) {
    const orphanStockOutput = executeD1({
      command: `UPDATE inventory SET ${assignment}, version = version + 1,
          updated_at = '2099-08-11T15:06:00.000Z'
        WHERE variant_id = 'variant_zero_stock_m'`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(
      orphanStockOutput,
      /commerce_inventory_stock_movement_required/,
    );
  }
  assert.deepEqual(
    queryD1({
      command: `SELECT physical_quantity, gift_reserve_quantity,
          safety_reserve_quantity, version, updated_at
        FROM inventory WHERE variant_id = 'variant_zero_stock_m'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    zeroStockBeforeMovement,
  );
  executeD1({
    command: `INSERT INTO inventory_movements (
        id, variant_id, kind, quantity, reference_type, reference_id,
        actor_type, actor_id, idempotency_key, created_at
      ) VALUES (
        'movement_zero_stock_increase', 'variant_zero_stock_m', 'adjustment', 2,
        'physical_increase', 'zero-stock-proof', 'admin', NULL,
        'stock:zero-stock-proof', '2099-08-11T15:06:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  executeD1({
    command: `INSERT INTO inventory_movements (
        id, variant_id, kind, quantity, reference_type, reference_id,
        actor_type, actor_id, idempotency_key, created_at
      ) VALUES (
        'movement_zero_stock_retry', 'variant_zero_stock_m', 'adjustment', 2,
        'physical_increase', 'zero-stock-proof', 'admin', NULL,
        'stock:zero-stock-proof', '2099-08-11T15:06:00.000Z'
      ) ON CONFLICT(idempotency_key) DO NOTHING`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  assert.deepEqual(
    queryD1({
      command: `SELECT inventory.physical_quantity, inventory.version,
          inventory.updated_at, COUNT(movement.id) AS movement_count
        FROM inventory
        LEFT JOIN inventory_movements AS movement
          ON movement.variant_id = inventory.variant_id
          AND movement.idempotency_key = 'stock:zero-stock-proof'
        WHERE inventory.variant_id = 'variant_zero_stock_m'
        GROUP BY inventory.variant_id`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      {
        physical_quantity: 2,
        version: 1,
        updated_at: "2099-08-11T15:06:00.000Z",
        movement_count: 1,
      },
    ],
  );

  executeD1({
    command: `INSERT INTO carts (
        id, status, currency, expires_at, created_at, updated_at
      ) VALUES (
        'cart_order_line_provenance', 'open', 'EUR',
        '2099-08-11T13:00:00.000Z', '2099-08-11T11:10:00.000Z',
        '2099-08-11T11:10:00.000Z'
      );
      INSERT INTO cart_lines (
        id, cart_id, variant_id, quantity, unit_price_cents,
        created_at, updated_at
      ) VALUES (
        'cart_line_order_line_provenance', 'cart_order_line_provenance',
        'variant_snapshot_proof_s', 1, 2999,
        '2099-08-11T11:10:00.000Z', '2099-08-11T11:10:00.000Z'
      );
      INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES (
        'order_line_provenance', 'AJ-LINE-PROVENANCE',
        'cart_order_line_provenance', NULL, 'line-provenance@example.com',
        'pending_payment', 'EUR', 2999, 0, 0, 2999, 'FR', '{}', '{}',
        'terms-v1', 'privacy-v1', NULL, '2099-08-11T11:10:00.000Z',
        '2099-08-11T11:10:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  const forgedOrderLineInsertOutput = executeD1({
    command: `INSERT INTO order_lines (
        id, order_id, variant_id, internal_reference, product_name,
        color_name, size, quantity, unit_price_cents, line_total_cents,
        created_at
      ) VALUES (
        'order_line_forged_provenance', 'order_line_provenance',
        'variant_snapshot_proof_s', 'AJ-SNAPSHOT-PROOF-S', 'Forged name',
        'Proof', 'S', 1, 2999, 2999, '2099-08-11T11:10:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    forgedOrderLineInsertOutput,
    /commerce_order_line_insert_not_allowed/,
  );
  executeD1({
    command: `INSERT INTO order_lines (
        id, order_id, variant_id, internal_reference, product_name,
        color_name, size, quantity, unit_price_cents, line_total_cents,
        created_at
      ) VALUES (
        'order_line_valid_provenance', 'order_line_provenance',
        'variant_snapshot_proof_s', 'AJ-SNAPSHOT-PROOF-S',
        'Snapshot Proof Renamed',
        'Proof', 'S', 1, 2999, 2999, '2099-08-11T11:10:00.000Z'
      )`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
  const reservationReassignmentOutput = executeD1({
    command: `UPDATE stock_reservations
      SET converted_order_id = 'order_payment_identity_target',
        updated_at = '2099-08-11T16:03:00.000Z'
      WHERE id = 'reservation_payment_flow'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    reservationReassignmentOutput,
    /commerce_terminal_reservation_is_immutable/,
  );
  assert.deepEqual(
    queryD1({
      command: `SELECT reservation.converted_order_id,
          inventory.active_reserved_quantity, inventory.sold_quantity,
          inventory.version
        FROM stock_reservations AS reservation
        INNER JOIN inventory ON inventory.variant_id = reservation.variant_id
        WHERE reservation.id = 'reservation_payment_flow'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      {
        converted_order_id: "order_payment_flow",
        active_reserved_quantity: 1,
        sold_quantity: 1,
        version: 9,
      },
    ],
  );
  const succeededPaymentUpdateOutput = executeD1({
    command: `UPDATE payments SET status = 'refunded', failure_code = 'forged',
        updated_at = '2099-08-11T16:03:00.000Z'
      WHERE id = 'payment_flow'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    succeededPaymentUpdateOutput,
    /commerce_terminal_payment_is_immutable/,
  );
  const succeededPaymentDeleteOutput = executeD1({
    command: `DELETE FROM payments WHERE id = 'payment_flow'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    succeededPaymentDeleteOutput,
    /commerce_payment_is_immutable/,
  );
  const paidFlowHeaderOutput = executeD1({
    command: `UPDATE orders SET email = 'forged-flow@example.com',
        subtotal_cents = 1, total_cents = 1,
        shipping_address_json = '{"country":"XX"}', terms_version = 'forged'
      WHERE id = 'order_payment_flow'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(paidFlowHeaderOutput, /commerce_order_snapshot_is_immutable/);
  for (const [status, timestamp] of [
    ["preparing", "2099-08-11T16:03:00.000Z"],
    ["shipped", "2099-08-11T16:04:00.000Z"],
  ]) {
    const preFulfillmentOutput = executeD1({
      command: `UPDATE orders SET status = '${status}',
          updated_at = '${timestamp}'
        WHERE id = 'order_payment_flow'`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(preFulfillmentOutput, /commerce_invalid_order_transition/);
  }
  assert.deepEqual(
    queryD1({
      command: `SELECT customer_order.status, customer_order.email,
          customer_order.subtotal_cents, customer_order.total_cents,
          payment.status AS payment_status,
          inventory.active_reserved_quantity, inventory.sold_quantity
        FROM orders AS customer_order
        INNER JOIN payments AS payment ON payment.order_id = customer_order.id
        INNER JOIN stock_reservations AS reservation
          ON reservation.converted_order_id = customer_order.id
        INNER JOIN inventory ON inventory.variant_id = reservation.variant_id
        WHERE customer_order.id = 'order_payment_flow'`,
      configPath: canonicalConfigPath,
      environment,
      statePath: pre0002State,
    }),
    [
      {
        status: "paid",
        email: "payment-flow@example.com",
        subtotal_cents: 2999,
        total_cents: 2999,
        payment_status: "succeeded",
        active_reserved_quantity: 1,
        sold_quantity: 1,
      },
    ],
  );
});
