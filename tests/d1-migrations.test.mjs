import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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

test("Wrangler applies 0000+0001 on empty and journaled D1 databases, then replays as a no-op", async (t) => {
  assert.ok(existsSync(canonicalConfigPath), "npm run build must create Wrangler config");
  assert.ok(existsSync(wranglerCliPath), "local Wrangler must be installed");

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
        'trg_carts_lock_currency_with_lines',
        'trg_orders_validate_paid_transition'
      ) ORDER BY name`,
    configPath: canonicalConfigPath,
    environment,
    statePath: emptyState,
  });
  assert.equal(triggerRows.length, 5);
  const paidTransition = triggerRows.find(
    (trigger) => trigger.name === "trg_orders_validate_paid_transition",
  );
  assert.match(paidTransition.sql, /internal_reference/);
  assert.match(paidTransition.sql, /FROM `cart_lines`/);

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
  const legacyMigrations = join(legacyRoot, "m");
  mkdirSync(legacyMigrations, { recursive: true });
  copyFileSync(
    baselineMigrationPath,
    join(legacyMigrations, expectedMigrationNames[0]),
  );
  const legacyConfigPath = join(legacyRoot, "wrangler.json");
  writeFileSync(
    legacyConfigPath,
    JSON.stringify({
      name: "aj-luxury-d1-upgrade-proof",
      main: relative(legacyRoot, join(projectRoot, "dist", "server", "index.js")).replaceAll(
        "\\",
        "/",
      ),
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
    expectedLastMigration: expectedMigrationNames[1],
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
});
