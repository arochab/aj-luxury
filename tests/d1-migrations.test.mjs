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
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const canonicalConfigPath = join(projectRoot, "dist", "server", "wrangler.json");
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
];
const expectedBaselineSha256 =
  "6e6262fa635e9808c00493adb1badbf51a1c3d75b2e1112fe567632c526859b4";
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
  const payload = JSON.parse(output);
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

test("Wrangler applies 0000+0001+0002 on empty and journaled D1 databases, then replays as a no-op", async (t) => {
  assert.ok(existsSync(canonicalConfigPath), "npm run build must create Wrangler config");
  assert.ok(existsSync(wranglerCliPath), "local Wrangler must be installed");
  assert.deepEqual(
    readdirSync(migrationDirectory)
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort(),
    expectedMigrationNames,
  );

  const canonicalConfig = JSON.parse(readFileSync(canonicalConfigPath, "utf8"));
  assert.equal(canonicalConfig.d1_databases[0].migrations_dir, "../../drizzle");

  const baseline = readFileSync(baselineMigrationPath, "utf8").replaceAll(
    "\r\n",
    "\n",
  );
  assert.equal(
    createHash("sha256").update(baseline).digest("hex"),
    expectedBaselineSha256,
  );
  assert.doesNotMatch(baseline, /trg_cart_lines_validate_catalog_insert/);

  const proofParent = join(projectRoot, ".wrangler");
  mkdirSync(proofParent, { recursive: true });
  const proofRoot = mkdtempSync(join(proofParent, "m"));
  assertProjectLocal(proofRoot);
  const environment = createWranglerEnvironment(proofRoot);
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
        'trg_cart_lines_validate_catalog_insert',
        'trg_cart_lines_immutable_snapshot',
        'trg_cart_lines_validate_quantity_update',
        'trg_cart_lines_validate_delete',
        'trg_carts_lock_currency_with_lines',
        'trg_carts_require_empty_delete',
        'trg_order_lines_validate_pending_insert',
        'trg_order_lines_immutable_update',
        'trg_order_lines_retain_snapshot',
        'trg_orders_guard_payment_state',
        'trg_orders_guard_paid_at',
        'trg_orders_require_paid_at_transition',
        'trg_orders_lock_snapshot_update',
        'trg_payments_lock_identity_update',
        'trg_payments_require_verified_event_update',
        'trg_payments_lock_succeeded_update',
        'trg_payments_retain_succeeded_delete',
        'trg_orders_validate_paid_transition'
      ) ORDER BY name`,
    configPath: canonicalConfigPath,
    environment,
    statePath: emptyState,
  });
  assert.equal(triggerRows.length, 18);
  const paidTransition = triggerRows.find(
    (trigger) => trigger.name === "trg_orders_validate_paid_transition",
  );
  assert.match(paidTransition.sql, /internal_reference/);
  assert.match(paidTransition.sql, /FROM `cart_lines`/);
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
    expectedLastMigration: expectedMigrationNames[2],
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
    command: `INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES (
        'order_pending_snapshot', 'AJ-MIG-PENDING-0002', NULL, NULL,
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
        'Snapshot Proof', 'Proof', 'S', 1, 2999, 2999,
        '2099-08-11T11:00:00.000Z'
      ),
      (
        'order_line_pending_snapshot_2', 'order_pending_snapshot',
        'variant_snapshot_proof_s', 'AJ-SNAPSHOT-PROOF-S',
        'Snapshot Proof', 'Proof', 'S', 1, 2999, 2999,
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
        line_total_cents: 2999,
      },
      {
        id: "order_line_pending_snapshot_2",
        product_name: "Snapshot Proof",
        unit_price_cents: 2999,
        line_total_cents: 2999,
      },
    ],
  );

  executeD1({
    command: `INSERT INTO inventory (
        variant_id, physical_quantity, gift_reserve_quantity,
        safety_reserve_quantity, active_reserved_quantity, sold_quantity,
        reserves_validated, version, updated_at
      ) VALUES (
        'variant_snapshot_proof_s', 20, 0, 0, 0, 0, 1, 0,
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
        'variant_snapshot_proof_s', 1, 'released',
        'reservation:delete-guard', 'release:delete-guard',
        '2099-08-11T13:00:00.000Z', NULL,
        '2099-08-11T12:00:00.000Z', '2099-08-11T12:01:00.000Z'
      );
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
      ) VALUES (
        'cart_line_parent_guard', 'cart_parent_line',
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
        'variant_snapshot_proof_s', 1, 'released',
        'reservation:parent-released', 'release:parent-released',
        '2099-08-11T15:00:00.000Z', NULL,
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:01:00.000Z'
      ),
      (
        'reservation_parent_converted', 'cart_parent_converted',
        'variant_snapshot_proof_s', 1, 'converted',
        'reservation:parent-converted', 'sale:parent-converted',
        '2099-08-11T15:00:00.000Z', NULL,
        '2099-08-11T13:00:00.000Z', '2099-08-11T13:01:00.000Z'
      );
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
    [{ active_reserved_quantity: 1, sold_quantity: 0, version: 1 }],
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

  executeD1({
    command: `INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, paid_at, created_at, updated_at
      ) VALUES
      ('order_state_cancelled', 'AJ-STATE-CANCELLED', NULL, NULL,
        'cancelled@example.com', 'cancelled', 'EUR', 0, 0, 0, 0, 'FR',
        '{}', '{}', 'terms-v1', 'privacy-v1', NULL,
        '2099-08-11T14:00:00.000Z', '2099-08-11T14:00:00.000Z'),
      ('order_state_refunded', 'AJ-STATE-REFUNDED', NULL, NULL,
        'refunded@example.com', 'refunded', 'EUR', 0, 0, 0, 0, 'FR',
        '{}', '{}', 'terms-v1', 'privacy-v1',
        '2099-08-11T14:01:00.000Z', '2099-08-11T14:00:00.000Z',
        '2099-08-11T14:01:00.000Z'),
      ('order_state_preparing', 'AJ-STATE-PREPARING', NULL, NULL,
        'preparing@example.com', 'preparing', 'EUR', 0, 0, 0, 0, 'FR',
        '{}', '{}', 'terms-v1', 'privacy-v1',
        '2099-08-11T14:01:00.000Z', '2099-08-11T14:00:00.000Z',
        '2099-08-11T14:01:00.000Z'),
      ('order_state_shipped', 'AJ-STATE-SHIPPED', NULL, NULL,
        'shipped@example.com', 'shipped', 'EUR', 0, 0, 0, 0, 'FR',
        '{}', '{}', 'terms-v1', 'privacy-v1',
        '2099-08-11T14:01:00.000Z', '2099-08-11T14:00:00.000Z',
        '2099-08-11T14:01:00.000Z'),
      ('order_state_paid', 'AJ-STATE-PAID', NULL, NULL,
        'paid-state@example.com', 'paid', 'EUR', 0, 0, 0, 0, 'FR',
        '{}', '{}', 'terms-v1', 'privacy-v1',
        '2099-08-11T14:01:00.000Z', '2099-08-11T14:00:00.000Z',
        '2099-08-11T14:01:00.000Z'),
      ('order_state_pending_legit', 'AJ-STATE-PENDING', NULL, NULL,
        'pending-state@example.com', 'pending_payment', 'EUR',
        0, 0, 0, 0, 'FR', '{}', '{}', 'terms-v1', 'privacy-v1', NULL,
        '2099-08-11T14:00:00.000Z', '2099-08-11T14:00:00.000Z')`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });

  const forbiddenPaidSources = [
    ["order_state_cancelled", "cancelled"],
    ["order_state_refunded", "refunded"],
    ["order_state_preparing", "preparing"],
    ["order_state_shipped", "shipped"],
    ["order_state_paid", "paid"],
  ];
  for (const [orderId] of forbiddenPaidSources) {
    const paidEntryOutput = executeD1({
      command: `UPDATE orders SET status = 'paid'
        WHERE id = '${orderId}'`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(
      paidEntryOutput,
      /commerce_order_payment_state_transition_not_allowed/,
    );
  }
  for (const [orderId] of forbiddenPaidSources) {
    const pendingReturnOutput = executeD1({
      command: `UPDATE orders SET status = 'pending_payment'
        WHERE id = '${orderId}'`,
      configPath: canonicalConfigPath,
      environment,
      expectFailure: true,
      statePath: pre0002State,
    });
    assert.match(
      pendingReturnOutput,
      /commerce_order_payment_state_transition_not_allowed/,
    );
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
    command: `UPDATE orders SET status = 'pending_payment'
      WHERE id = 'order_state_pending_legit'`,
    configPath: canonicalConfigPath,
    environment,
    expectFailure: true,
    statePath: pre0002State,
  });
  assert.match(
    reopenedCancelledOutput,
    /commerce_order_payment_state_transition_not_allowed/,
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
        'provider_failed_attack', 'failed', 2999, 'EUR',
        'payment:failed-attack', 'declined', '2099-08-11T15:00:00.000Z',
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
          inventory.active_reserved_quantity, inventory.sold_quantity,
          inventory.version
        FROM orders AS customer_order
        INNER JOIN carts AS cart ON cart.id = customer_order.cart_id
        INNER JOIN payments AS payment ON payment.order_id = customer_order.id
        INNER JOIN stock_reservations AS reservation
          ON reservation.converted_order_id = customer_order.id
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
        active_reserved_quantity: 1,
        sold_quantity: 1,
        version: 3,
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
    /commerce_succeeded_payment_is_immutable/,
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
    /commerce_succeeded_payment_is_immutable/,
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
  executeD1({
    command: `UPDATE orders
        SET status = 'preparing', updated_at = '2099-08-11T16:03:00.000Z'
        WHERE id = 'order_payment_flow';
      UPDATE orders
        SET status = 'shipped', updated_at = '2099-08-11T16:04:00.000Z'
        WHERE id = 'order_payment_flow'`,
    configPath: canonicalConfigPath,
    environment,
    statePath: pre0002State,
  });
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
        status: "shipped",
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
