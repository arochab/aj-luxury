import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import ts from "typescript";
import {
  LAUNCH_PHYSICAL_QUANTITY,
  LAUNCH_VARIANT_COUNT,
  launchVariantSeed,
} from "../db/seed.ts";
import { launchVariants } from "../lib/commerce/catalog.ts";
import {
  CommerceError,
  availableToSell,
} from "../lib/commerce/backend-domain.ts";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import * as paymentAuthority from "../lib/commerce/verified-payment-event.ts";
import { assertVerifiedPaymentEvent } from "../lib/commerce/verified-payment-event.ts";
import { verifyTestPaymentEvent } from "./support/test-payment-event.ts";

const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const paymentRegistrationPath = fileURLToPath(
  new URL(
    "../lib/commerce/payment-event-registration.internal.ts",
    import.meta.url,
  ),
);
const migrationPaths = readdirSync(drizzleDirectory)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => `${drizzleDirectory}${name}`);

const expectedLaunchVariantIdentity = [
  { id: "variant_boxer_pourpre_s", productId: "product_apollon", sku: "AJ-APO-POU-S" },
  { id: "variant_boxer_pourpre_m", productId: "product_apollon", sku: "AJ-APO-POU-M" },
  { id: "variant_boxer_pourpre_l", productId: "product_apollon", sku: "AJ-APO-POU-L" },
  { id: "variant_boxer_pourpre_xl", productId: "product_apollon", sku: "AJ-APO-POU-XL" },
  { id: "variant_boxer_rose-pale_s", productId: "product_apollon", sku: "AJ-APO-ROS-S" },
  { id: "variant_boxer_rose-pale_m", productId: "product_apollon", sku: "AJ-APO-ROS-M" },
  { id: "variant_boxer_rose-pale_l", productId: "product_apollon", sku: "AJ-APO-ROS-L" },
  { id: "variant_boxer_rose-pale_xl", productId: "product_apollon", sku: "AJ-APO-ROS-XL" },
  { id: "variant_boxer_lilas-bleu-clair_s", productId: "product_apollon", sku: "AJ-APO-LIL-S" },
  { id: "variant_boxer_lilas-bleu-clair_m", productId: "product_apollon", sku: "AJ-APO-LIL-M" },
  { id: "variant_boxer_lilas-bleu-clair_l", productId: "product_apollon", sku: "AJ-APO-LIL-L" },
  { id: "variant_boxer_lilas-bleu-clair_xl", productId: "product_apollon", sku: "AJ-APO-LIL-XL" },
];

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(?:[cm]?js|tsx?)$/.test(entry.name) ? [path] : [];
  });
}

function evaluateStaticString(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) {
    return evaluateStaticString(node.expression);
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = evaluateStaticString(node.left);
    const right = evaluateStaticString(node.right);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function resolveLocalModule(importerPath, specifier) {
  let unresolved;
  if (specifier.startsWith("@/")) {
    unresolved = resolve(projectRoot, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    unresolved = resolve(dirname(importerPath), specifier);
  } else {
    return null;
  }

  const candidates = /\.[cm]?[jt]sx?$/i.test(unresolved)
    ? [unresolved]
    : [
        unresolved,
        ...[".ts", ".tsx", ".js", ".mjs", ".mts"].map(
          (extension) => unresolved + extension,
        ),
        ...[".ts", ".tsx", ".js", ".mjs", ".mts"].map((extension) =>
          join(unresolved, `index${extension}`),
        ),
      ];

  return candidates.find((candidate) => existsSync(candidate)) ?? unresolved;
}

function collectResolvedLocalImports(sourceText, importerPath) {
  const sourceFile = ts.createSourceFile(
    importerPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const resolvedImports = [];

  function record(moduleNode) {
    if (!moduleNode) return;
    const specifier = evaluateStaticString(moduleNode);
    if (specifier === null) return;
    const target = resolveLocalModule(importerPath, specifier);
    if (target) resolvedImports.push(target);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      record(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      record(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return resolvedImports;
}

class SQLiteD1Statement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }

  bind(...values) {
    return new SQLiteD1Statement(this.database, this.query, values);
  }

  async first() {
    return this.database.prepare(this.query).get(...this.values) ?? null;
  }

  async all() {
    const results = this.database.prepare(this.query).all(...this.values);
    return { success: true, results, meta: { changes: 0 } };
  }

  async run() {
    const result = this.database.prepare(this.query).run(...this.values);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}

class SQLiteD1Database {
  #tail = Promise.resolve();

  constructor(database) {
    this.database = database;
  }

  prepare(query) {
    return new SQLiteD1Statement(this.database, query);
  }

  batch(statements) {
    const execute = () => this.#runBatch(statements);
    const result = this.#tail.then(execute, execute);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #runBatch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function applyMigration(database, migrationPath) {
  const migration = readFileSync(migrationPath, "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    const sql = statement.trim();
    if (sql) database.exec(sql);
  }
}

function createFixture({ migrationCount = migrationPaths.length } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");

  for (const migrationPath of migrationPaths.slice(0, migrationCount)) {
    applyMigration(database, migrationPath);
  }

  return {
    database,
    store: new D1CommerceStore(new SQLiteD1Database(database)),
  };
}

function insertCartLines(database, input) {
  const insertCartLine = database.prepare(
    `INSERT INTO cart_lines (
      id, cart_id, variant_id, quantity, unit_price_cents, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  input.lines.forEach((line, index) => {
    insertCartLine.run(
      `${input.cartId}_line_${index}`,
      input.cartId,
      line.variantId,
      line.quantity,
      line.unitPriceCents ?? 2_999,
      input.now,
      input.now,
    );
  });
}

function validateReserves(database, variantIds = null) {
  if (variantIds) {
    const update = database.prepare(
      "UPDATE inventory SET reserves_validated = 1 WHERE variant_id = ?",
    );
    for (const variantId of variantIds) update.run(variantId);
    return;
  }
  database.exec("UPDATE inventory SET reserves_validated = 1");
}

function adjustPhysicalStock(database, input) {
  const current = database
    .prepare("SELECT physical_quantity FROM inventory WHERE variant_id = ?")
    .get(input.variantId).physical_quantity;
  assert.notEqual(current, input.targetQuantity);
  const increase = input.targetQuantity > current;
  database
    .prepare(
      `INSERT INTO inventory_movements (
        id, variant_id, kind, quantity, reference_type, reference_id,
        actor_type, actor_id, idempotency_key, created_at
      ) VALUES (?, ?, 'adjustment', ?, ?, ?, 'admin', NULL, ?, ?)`,
    )
    .run(
      input.id,
      input.variantId,
      Math.abs(input.targetQuantity - current),
      increase ? "physical_increase" : "physical_decrease",
      input.id,
      `stock:${input.id}`,
      input.now,
    );
}

function insertPendingOrder(database, input) {
  const subtotalCents = input.lines.reduce(
    (total, line) =>
      total + line.quantity * (line.unitPriceCents ?? 2_999),
    0,
  );
  database
    .prepare(
      `INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, ?, 'pending_payment', 'EUR', ?, 0, 0, ?,
        'FR', '{}', '{}', 'test-terms-v1', 'test-privacy-v1', ?, ?)`,
    )
    .run(
      input.id,
      input.number,
      input.cartId,
      "client@example.com",
      subtotalCents,
      subtotalCents,
      input.now,
      input.now,
    );

  const variantQuery = database.prepare(
    `SELECT variant.internal_reference, variant.color_name, variant.size,
      product.name AS product_name
    FROM variants AS variant
    INNER JOIN products AS product ON product.id = variant.product_id
    WHERE variant.id = ?`,
  );
  const insertLine = database.prepare(
    `INSERT INTO order_lines (
      id, order_id, variant_id, internal_reference, product_name, color_name,
      size, quantity, unit_price_cents, line_total_cents, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  input.lines.forEach((line, index) => {
    const variant = variantQuery.get(line.variantId);
    const unitPriceCents = line.unitPriceCents ?? 2_999;
    insertLine.run(
      `${input.id}_line_${index}`,
      input.id,
      line.variantId,
      variant.internal_reference,
      variant.product_name,
      variant.color_name,
      variant.size,
      line.quantity,
      unitPriceCents,
      line.quantity * unitPriceCents,
      input.now,
    );
  });

  return subtotalCents;
}

function insertVerifiedPaymentPrerequisite(database, input) {
  database
    .prepare(
      `INSERT INTO webhook_events (
        id, provider, provider_event_id, event_type, payload_fingerprint,
        verification_method, verified_at, order_id, provider_payment_id,
        amount_cents, currency, status, attempts, received_at
      ) VALUES (?, 'test', ?, 'payment.succeeded', ?, 'test_adapter', ?, ?, ?,
        ?, 'EUR', 'verified', 0, ?)`,
    )
    .run(
      `webhook_${input.providerEventId}`,
      input.providerEventId,
      `sha256:${input.providerEventId}`,
      input.now,
      input.orderId,
      input.providerPaymentId,
      input.amountCents,
      input.now,
    );
  database
    .prepare(
      `INSERT INTO payments (
        id, order_id, provider, provider_session_id, status, amount_cents,
        currency, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, 'test', ?, 'succeeded', ?, 'EUR', ?, ?, ?)`,
    )
    .run(
      `payment_${input.providerPaymentId}`,
      input.orderId,
      input.providerPaymentId,
      input.amountCents,
      `payment:test:${input.providerPaymentId}`,
      input.now,
      input.now,
    );
}

async function createVerifiedEvent(input) {
  return verifyTestPaymentEvent({
    providerEventId: input.providerEventId,
    providerPaymentId: input.providerPaymentId,
    orderId: input.orderId,
    amountCents: input.amountCents,
    currency: "EUR",
    occurredAt: input.occurredAt,
    verifiedAt: input.verifiedAt ?? input.occurredAt,
  });
}

test("migration applies locally and launch seed replay keeps inventory and ledger aligned", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  await store.seedLaunchCatalog(now);
  await store.seedLaunchCatalog(now);

  const tableCount = database
    .prepare(
      `SELECT COUNT(*) AS count FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .get().count;
  const totals = database
    .prepare(
      `SELECT COUNT(*) AS variants, SUM(physical_quantity) AS physical,
        SUM(gift_reserve_quantity) AS gifts,
        SUM(safety_reserve_quantity) AS safety,
        SUM(reserves_validated) AS validated
      FROM inventory`,
    )
    .get();
  const seedLedger = database
    .prepare(
      `SELECT COUNT(*) AS count, SUM(movement.quantity) AS quantity
      FROM inventory_movements AS movement
      INNER JOIN inventory AS stock ON stock.variant_id = movement.variant_id
      WHERE movement.kind = 'seed'
        AND movement.quantity = stock.physical_quantity`,
    )
    .get();
  const references = database
    .prepare("SELECT internal_reference FROM variants ORDER BY sort_order")
    .all()
    .map((row) => row.internal_reference);
  const catalogIdentity = launchVariants.map(({ id, productId, sku }) => ({
    id,
    productId,
    sku,
  }));
  const seedIdentity = launchVariantSeed.map(
    ({ id, productId, internalReference }) => ({
      id,
      productId,
      sku: internalReference,
    }),
  );
  const databaseIdentity = database
    .prepare(
      `SELECT id, product_id, internal_reference
      FROM variants ORDER BY sort_order`,
    )
    .all()
    .map((variant) => ({
      id: variant.id,
      productId: variant.product_id,
      sku: variant.internal_reference,
    }));

  assert.equal(tableCount, 15);
  assert.equal(LAUNCH_VARIANT_COUNT, 12);
  assert.equal(LAUNCH_PHYSICAL_QUANTITY, 756);
  assert.deepEqual({ ...totals }, {
    variants: 12,
    physical: 756,
    gifts: 0,
    safety: 0,
    validated: 0,
  });
  assert.deepEqual({ ...seedLedger }, { count: 12, quantity: 756 });
  assert.deepEqual(catalogIdentity, expectedLaunchVariantIdentity);
  assert.deepEqual(seedIdentity, expectedLaunchVariantIdentity);
  assert.deepEqual(databaseIdentity, expectedLaunchVariantIdentity);
  assert.deepEqual(
    references,
    launchVariantSeed.map((variant) => variant.internalReference),
  );
  assert.ok(
    references.every((reference) =>
      /^AJ-APO-(POU|ROS|LIL)-(S|M|L|XL)$/.test(reference),
    ),
  );

  const catalogSource = readFileSync(
    fileURLToPath(new URL("../lib/commerce/catalog.ts", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(catalogSource, /AJ-BOX/);
  assert.match(catalogSource, /createApollonInternalReference/);

  const plan = database
    .prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at",
    )
    .all("customer_test");
  assert.ok(
    plan.some((row) =>
      String(row.detail).includes("idx_orders_customer_created_at"),
    ),
  );
  database.close();
});

test("seed replay detects a broken ledger instead of silently inventing stock history", async () => {
  const { database, store } = createFixture({ migrationCount: 2 });
  const now = "2026-08-10T12:00:00.000Z";
  await store.seedLaunchCatalog(now);
  database
    .prepare("DELETE FROM inventory_movements WHERE idempotency_key = ?")
    .run("seed:variant_boxer_pourpre_s");
  applyMigration(database, migrationPaths[2]);

  await assert.rejects(
    () => store.seedLaunchCatalog(now),
    (error) =>
      error instanceof CommerceError && error.code === "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM inventory").get().count,
    12,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE kind = 'seed'")
      .get().count,
    11,
  );
  database.close();
});

test("foreign keys, unique constraints and checks reject impossible states", async () => {
  const { database, store } = createFixture();
  await store.seedLaunchCatalog("2026-08-10T12:00:00.000Z");

  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO inventory_movements (
            id, variant_id, kind, quantity, reference_type, reference_id,
            actor_type, actor_id, idempotency_key, created_at
          ) SELECT 'movement_invalid_gift', variant_id, 'gift_allocation',
              physical_quantity + 1, 'gift_reserve_increase', 'invalid-gift',
              'admin', NULL, 'stock:invalid-gift', '2026-08-10T12:00:01.000Z'
            FROM inventory WHERE variant_id = ?`,
        )
        .run("variant_boxer_pourpre_s"),
    /ck_inventory_allocation_within_physical/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO inventory (
            variant_id, physical_quantity, gift_reserve_quantity,
            safety_reserve_quantity, active_reserved_quantity, sold_quantity,
            reserves_validated, version, updated_at
          ) VALUES ('variant_missing', 1, 0, 0, 0, 0, 0, 0, ?)`,
        )
        .run("2026-08-10T12:00:00.000Z"),
    /FOREIGN KEY constraint failed/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO variants (
            id, product_id, internal_reference, color_key, color_name, size,
            swatch, image_url, active, sort_order, created_at, updated_at
          ) VALUES (
            'variant_duplicate_reference', 'product_apollon', 'AJ-APO-POU-S',
            'other', 'Other', 'S', '#000', '/other.webp', 1, 99, ?, ?
          )`,
        )
        .run("2026-08-10T12:00:00.000Z", "2026-08-10T12:00:00.000Z"),
    /UNIQUE constraint failed: variants.internal_reference/,
  );
  database.close();
});

test("stock availability changes are driven by exact immutable movements", async () => {
  const { database, store } = createFixture();
  const variantId = "variant_boxer_pourpre_s";
  await store.seedLaunchCatalog("2099-08-10T12:00:00.000Z");
  const initial = await store.getInventoryPosition(variantId);

  for (const assignment of [
    "physical_quantity = physical_quantity + 1",
    "gift_reserve_quantity = gift_reserve_quantity + 1",
    "safety_reserve_quantity = safety_reserve_quantity + 1",
  ]) {
    assert.throws(
      () =>
        database.exec(
          `UPDATE inventory SET ${assignment}, version = version + 1,
            updated_at = '2099-08-10T12:01:00.000Z'
          WHERE variant_id = '${variantId}'`,
        ),
      /commerce_inventory_stock_movement_required/,
    );
  }
  assert.deepEqual(await store.getInventoryPosition(variantId), initial);

  adjustPhysicalStock(database, {
    id: "movement_physical_increase_proof",
    variantId,
    targetQuantity: initial.physicalQuantity + 2,
    now: "2099-08-10T12:01:00.000Z",
  });
  const adjusted = await store.getInventoryPosition(variantId);
  assert.equal(adjusted.physicalQuantity, initial.physicalQuantity + 2);
  assert.equal(adjusted.version, initial.version + 1);

  database.exec(`INSERT INTO inventory_movements (
      id, variant_id, kind, quantity, reference_type, reference_id,
      actor_type, actor_id, idempotency_key, created_at
    ) VALUES (
      'movement_physical_retry', '${variantId}', 'adjustment', 2,
      'physical_increase', 'movement_physical_increase_proof', 'admin', NULL,
      'stock:movement_physical_increase_proof',
      '2099-08-10T12:01:00.000Z'
    ) ON CONFLICT(idempotency_key) DO NOTHING`);
  assert.deepEqual(await store.getInventoryPosition(variantId), adjusted);
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM inventory_movements
        WHERE idempotency_key = 'stock:movement_physical_increase_proof'`,
      )
      .get().count,
    1,
  );

  assert.throws(
    () =>
      database.exec(`INSERT INTO inventory_movements (
          id, variant_id, kind, quantity, reference_type, reference_id,
          actor_type, actor_id, idempotency_key, created_at
        ) VALUES (
          'movement_impossible_decrease', '${variantId}', 'adjustment', 9999,
          'physical_decrease', 'impossible', 'admin', NULL,
          'stock:impossible-decrease', '2099-08-10T12:02:00.000Z'
        )`),
    /ck_inventory_(quantities_non_negative|allocation_within_physical)/,
  );
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM inventory_movements
        WHERE idempotency_key = 'stock:impossible-decrease'`,
      )
      .get().count,
    0,
  );
  assert.deepEqual(await store.getInventoryPosition(variantId), adjusted);
  database.close();
});

test("cart price snapshots must originate from the active server catalog", async () => {
  const { database, store } = createFixture();
  const now = "2099-08-10T12:00:00.000Z";
  const cartId = "cart_catalog_price";
  const otherCartId = "cart_catalog_price_other";
  const variantId = "variant_boxer_pourpre_s";
  await store.seedLaunchCatalog(now);
  await store.createCart({
    id: cartId,
    expiresAt: "2099-08-10T14:00:00.000Z",
    now,
  });
  await store.createCart({
    id: otherCartId,
    expiresAt: "2099-08-10T14:00:00.000Z",
    now,
  });

  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO cart_lines (
            id, cart_id, variant_id, quantity, unit_price_cents,
            created_at, updated_at
          ) VALUES ('cart_line_tampered', ?, ?, 1, 1, ?, ?)`,
        )
        .run(cartId, variantId, now, now),
    /commerce_cart_line_catalog_mismatch/,
  );
  database
    .prepare(
      `INSERT INTO cart_lines (
        id, cart_id, variant_id, quantity, unit_price_cents,
        created_at, updated_at
      ) VALUES ('cart_line_catalog_snapshot', ?, ?, 1, 2999, ?, ?)`,
    )
    .run(cartId, variantId, now, now);

  const protectedMutations = [
    "UPDATE cart_lines SET unit_price_cents = 1 WHERE id = 'cart_line_catalog_snapshot'",
    `UPDATE cart_lines SET cart_id = '${otherCartId}' WHERE id = 'cart_line_catalog_snapshot'`,
    "UPDATE cart_lines SET variant_id = 'variant_boxer_rose-pale_s' WHERE id = 'cart_line_catalog_snapshot'",
    "UPDATE cart_lines SET id = 'cart_line_rekeyed' WHERE id = 'cart_line_catalog_snapshot'",
    "UPDATE cart_lines SET created_at = '2099-08-10T12:01:00.000Z' WHERE id = 'cart_line_catalog_snapshot'",
  ];
  for (const mutation of protectedMutations) {
    assert.throws(
      () => database.prepare(mutation).run(),
      /commerce_cart_line_snapshot_is_immutable/,
    );
  }
  assert.throws(
    () =>
      database
        .prepare("UPDATE carts SET currency = 'USD' WHERE id = ?")
        .run(cartId),
    /commerce_cart_currency_is_immutable/,
  );
  assert.deepEqual(
    {
      ...database
        .prepare(
          `SELECT id, cart_id, variant_id, quantity, unit_price_cents,
            created_at, updated_at
          FROM cart_lines WHERE id = 'cart_line_catalog_snapshot'`,
        )
        .get(),
    },
    {
      id: "cart_line_catalog_snapshot",
      cart_id: cartId,
      variant_id: variantId,
      quantity: 1,
      unit_price_cents: 2_999,
      created_at: now,
      updated_at: now,
    },
  );
  assert.equal(
    database.prepare("SELECT currency FROM carts WHERE id = ?").get(cartId)
      .currency,
    "EUR",
  );

  const quantityUpdate = database
    .prepare(
      `UPDATE cart_lines SET quantity = 2, updated_at = ?
      WHERE id = 'cart_line_catalog_snapshot'`,
    )
    .run("2099-08-10T12:01:00.000Z");
  assert.equal(quantityUpdate.changes, 1);
  database
    .prepare("UPDATE carts SET status = 'converted' WHERE id = ?")
    .run(cartId);
  assert.throws(
    () =>
      database
        .prepare(
          `UPDATE cart_lines SET quantity = 3, updated_at = ?
          WHERE id = 'cart_line_catalog_snapshot'`,
        )
        .run("2099-08-10T12:02:00.000Z"),
    /commerce_cart_line_quantity_update_not_allowed/,
  );
  database
    .prepare("UPDATE products SET price_cents = 3499 WHERE id = 'product_apollon'")
    .run();
  assert.deepEqual(
    {
      ...database
        .prepare(
          `SELECT quantity, unit_price_cents
          FROM cart_lines WHERE id = 'cart_line_catalog_snapshot'`,
        )
        .get(),
    },
    { quantity: 2, unit_price_cents: 2_999 },
  );
  database.close();
});

test("timestamps are strict UTC and cart id collisions cannot alias different carts", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  await store.createCart({
    id: "cart_collision",
    email: "Client@Example.com",
    expiresAt: "2026-08-10T14:00:00.000Z",
    now,
  });
  await store.createCart({
    id: "cart_collision",
    email: "client@example.com",
    expiresAt: "2026-08-10T14:00:00.000Z",
    now,
  });
  await assert.rejects(
    () =>
      store.createCart({
        id: "cart_collision",
        email: "other@example.com",
        expiresAt: "2026-08-10T14:00:00.000Z",
        now,
      }),
    (error) =>
      error instanceof CommerceError && error.code === "CART_ID_CONFLICT",
  );
  await assert.rejects(
    () =>
      store.createCart({
        id: "cart_bad_date",
        expiresAt: "2026-02-30T14:00:00.000Z",
        now,
      }),
    (error) => error instanceof CommerceError && error.code === "INVALID_INPUT",
  );
  await assert.rejects(
    () =>
      store.createCart({
        id: "cart_bad_zone",
        expiresAt: "2026-08-10T14:00:00+02:00",
        now,
      }),
    (error) => error instanceof CommerceError && error.code === "INVALID_INPUT",
  );
  database.close();
});

test("payment authority is non-forgeable and the local verifier stays outside production code", async () => {
  const verified = await verifyTestPaymentEvent({
    providerEventId: "event_authority",
    providerPaymentId: "payment_authority",
    orderId: "order_authority",
    amountCents: 2_999,
    currency: "EUR",
    occurredAt: "2026-08-10T12:00:00.000Z",
    verifiedAt: "2026-08-10T12:00:01.000Z",
  });
  assert.doesNotThrow(() => assertVerifiedPaymentEvent(verified));
  assert.equal(Object.getOwnPropertySymbols(verified).length, 0);

  const forged = Object.freeze({
    ...verified,
    provider: "stripe",
    verificationMethod: "stripe_signature",
  });
  assert.throws(
    () => assertVerifiedPaymentEvent(forged),
    (error) =>
      error instanceof CommerceError &&
      error.code === "PAYMENT_VERIFICATION_REQUIRED",
  );
  assert.throws(
    () => assertVerifiedPaymentEvent(null),
    (error) =>
      error instanceof CommerceError &&
      error.code === "PAYMENT_VERIFICATION_REQUIRED",
  );
  for (const registrarName of [
    "registerVerifiedPaymentEventFromTrustedAdapter",
    "registerVerifiedPaymentEventForNodeTest",
  ]) {
    assert.equal(paymentAuthority[registrarName], undefined);
  }

  const productionRoots = ["../app/", "../db/", "../lib/", "../worker/"];
  const productionFiles = productionRoots
    .flatMap((relative) =>
      listSourceFiles(fileURLToPath(new URL(relative, import.meta.url))),
    );
  const internalRegistrationConsumers = productionFiles.filter((path) =>
    collectResolvedLocalImports(readFileSync(path, "utf8"), path).includes(
      paymentRegistrationPath,
    ),
  );
  assert.deepEqual(
    internalRegistrationConsumers.map((path) => path.replaceAll("\\", "/")),
    [
      fileURLToPath(
        new URL("../lib/commerce/verified-payment-event.ts", import.meta.url),
      ).replaceAll("\\", "/"),
    ],
  );
  const testVerifierPath = fileURLToPath(
    new URL("./support/test-payment-event.ts", import.meta.url),
  );
  assert.deepEqual(
    productionFiles.filter((path) =>
      collectResolvedLocalImports(readFileSync(path, "utf8"), path).includes(
        testVerifierPath,
      ),
    ),
    [],
  );

  const adversarialImporter = join(projectRoot, "app/payment-authority-attack.ts");
  const adversarialImports = collectResolvedLocalImports(
    `
      import * as namespaceAuthority from
        "../lib/commerce/payment-event-registration.internal.ts";
      void namespaceAuthority;
      void import(
        "../lib/commerce/" + "payment-event-registration.internal.ts"
      );
      export { registerVerifiedPaymentEventForNodeTest } from
        "@/lib/commerce/payment-event-registration.internal";
    `,
    adversarialImporter,
  ).filter((path) => path === paymentRegistrationPath);
  assert.equal(adversarialImports.length, 3);

  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const deepRuntimeAttack = `
    const authority = await import(${JSON.stringify(pathToFileURL(paymentRegistrationPath).href)});
    const register = authority[
      "registerVerified" + "PaymentEventForNodeTest"
    ];
    try {
      register({});
      process.exitCode = 2;
    } catch (error) {
      if (error?.code !== "PAYMENT_VERIFICATION_REQUIRED") throw error;
    }
  `;
  const childResult = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      deepRuntimeAttack,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: childEnvironment,
    },
  );
  assert.equal(
    childResult.status,
    0,
    `deep registrar import escaped its Node-test-only guard:\n${childResult.stderr}`,
  );

  const storeBundle = await build({
    entryPoints: [
      fileURLToPath(
        new URL("../lib/commerce/d1-commerce-store.ts", import.meta.url),
      ),
    ],
    bundle: true,
    format: "esm",
    platform: "browser",
    treeShaking: true,
    write: false,
  });
  const storeCode = storeBundle.outputFiles[0].text;
  assert.doesNotMatch(
    storeCode,
    /verifyTestPaymentEvent|registerVerifiedPaymentEventForNodeTest|NODE_TEST_CONTEXT/,
  );

  for (const platform of ["browser", "neutral"]) {
    const attackBundle = await build({
      stdin: {
        contents: `
          import * as deepAuthority from
            "./lib/commerce/payment-event-registration.internal.ts";
          globalThis.attemptPaymentForgery = () =>
            deepAuthority[
              "registerVerified" + "PaymentEventForNodeTest"
            ]({
              provider: "test",
              providerEventId: "event_browser_attack",
              providerPaymentId: "payment_browser_attack",
              eventType: "payment.succeeded",
              orderId: "order_browser_attack",
              amountCents: 2999,
              currency: "EUR",
              occurredAt: "2026-08-10T12:00:00.000Z",
              verifiedAt: "2026-08-10T12:00:01.000Z",
              verificationMethod: "test_adapter",
              payloadFingerprint: "sha256:browser-attack",
            });
        `,
        loader: "ts",
        resolveDir: projectRoot,
        sourcefile: `${platform}-payment-authority-attack.ts`,
      },
      bundle: true,
      format: "iife",
      logLevel: "silent",
      platform,
      treeShaking: true,
      write: false,
    });
    const sandbox = {};
    runInNewContext(attackBundle.outputFiles[0].text, sandbox);
    assert.throws(
      () => sandbox.attemptPaymentForgery(),
      (error) => error?.code === "PAYMENT_VERIFICATION_REQUIRED",
      `${platform} bundle must not mint a verified payment event`,
    );
  }

  await assert.rejects(
    () =>
      build({
        entryPoints: [
          fileURLToPath(
            new URL("./support/test-payment-event.ts", import.meta.url),
          ),
        ],
        bundle: true,
        format: "esm",
        logLevel: "silent",
        platform: "browser",
        write: false,
      }),
    /Could not resolve "node:crypto"/,
  );
});

test("reservations are blocked until gift and safety reserves are explicitly validated", async () => {
  const { database, store } = createFixture();
  const now = "2099-08-10T12:00:00.000Z";
  const variantId = "variant_boxer_pourpre_s";
  await store.seedLaunchCatalog(now);
  await store.createCart({
    id: "cart_reserve_gate",
    expiresAt: "2099-08-10T14:00:00.000Z",
    now,
  });
  insertCartLines(database, {
    cartId: "cart_reserve_gate",
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  const input = {
    reservationId: "reservation_reserve_gate",
    cartId: "cart_reserve_gate",
    variantId,
    quantity: 1,
    idempotencyKey: "reserve_gate",
    expiresAt: "2099-08-10T13:00:00.000Z",
    now,
  };

  await assert.rejects(
    () => store.reserveStock(input),
    (error) =>
      error instanceof CommerceError && error.code === "RESERVES_NOT_VALIDATED",
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM stock_reservations").get().count,
    0,
  );
  assert.equal((await store.getInventoryPosition(variantId)).activeReservedQuantity, 0);

  validateReserves(database, [variantId]);
  await store.reserveStock(input);
  assert.equal((await store.getInventoryPosition(variantId)).activeReservedQuantity, 1);
  database.close();
});

test("reservations cannot exceed or exist outside their cart lines", async () => {
  const { database, store } = createFixture();
  const now = "2099-08-10T12:00:00.000Z";
  const variantId = "variant_boxer_pourpre_s";
  const cartId = "cart_reservation_line_guard";
  await store.seedLaunchCatalog(now);
  validateReserves(database, [variantId]);
  await store.createCart({
    id: cartId,
    expiresAt: "2099-08-10T14:00:00.000Z",
    now,
  });
  const baseInput = {
    reservationId: "reservation_line_guard",
    cartId,
    variantId,
    quantity: 1,
    idempotencyKey: "reserve_line_guard",
    expiresAt: "2099-08-10T13:00:00.000Z",
    now,
  };

  await assert.rejects(
    () => store.reserveStock(baseInput),
    (error) =>
      error instanceof CommerceError &&
      error.code === "INSUFFICIENT_STOCK_OR_CART_CLOSED",
  );
  insertCartLines(database, {
    cartId,
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  await assert.rejects(
    () =>
      store.reserveStock({
        ...baseInput,
        reservationId: "reservation_line_guard_over",
        quantity: 2,
        idempotencyKey: "reserve_line_guard_over",
      }),
    (error) =>
      error instanceof CommerceError &&
      error.code === "INSUFFICIENT_STOCK_OR_CART_CLOSED",
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM stock_reservations").get()
      .count,
    0,
  );

  const first = await store.reserveStock(baseInput);
  const retry = await store.reserveStock(baseInput);
  assert.deepEqual(retry, first);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM stock_reservations").get()
      .count,
    1,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE kind = 'reserve'")
      .get().count,
    1,
  );
  await store.releaseStock({
    reservationId: baseInput.reservationId,
    idempotencyKey: "release_line_guard",
    now: "2099-08-10T12:10:00.000Z",
  });
  assert.throws(
    () =>
      database.exec(`UPDATE cart_lines SET quantity = 2,
        updated_at = '2099-08-10T12:11:00.000Z'
        WHERE cart_id = '${cartId}' AND variant_id = '${variantId}'`),
    /commerce_cart_line_quantity_update_not_allowed/,
  );
  assert.equal(
    database
      .prepare("SELECT quantity FROM cart_lines WHERE cart_id = ? AND variant_id = ?")
      .get(cartId, variantId).quantity,
    1,
  );
  database.close();
});

test("known reservation keys win before changed-state cart and capacity guards", async () => {
  const { database, store } = createFixture();
  const now = "2099-08-10T12:00:00.000Z";
  const variantId = "variant_boxer_pourpre_s";
  const cartId = "cart_reservation_known_key";
  await store.seedLaunchCatalog(now);
  validateReserves(database, [variantId]);
  await store.createCart({
    id: cartId,
    expiresAt: "2099-08-10T14:00:00.000Z",
    now,
  });
  insertCartLines(database, {
    cartId,
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  const input = {
    reservationId: "reservation_known_key",
    cartId,
    variantId,
    quantity: 1,
    idempotencyKey: "reserve_known_key",
    expiresAt: "2099-08-10T13:00:00.000Z",
    now,
  };
  await store.reserveStock(input);
  adjustPhysicalStock(database, {
    id: "known_key_capacity_closed",
    variantId,
    targetQuantity: 1,
    now: "2099-08-10T12:05:00.000Z",
  });
  database.prepare(
    `UPDATE carts SET status = 'expired', updated_at = ? WHERE id = ?`,
  ).run("2099-08-10T12:06:00.000Z", cartId);

  const snapshot = () => ({
    cart: { ...database.prepare(
      "SELECT status, updated_at FROM carts WHERE id = ?",
    ).get(cartId) },
    inventory: { ...database.prepare(
      `SELECT physical_quantity, active_reserved_quantity, sold_quantity,
        version, updated_at FROM inventory WHERE variant_id = ?`,
    ).get(variantId) },
    movements: database.prepare(
      `SELECT id, kind, quantity, reference_type, reference_id,
        idempotency_key, created_at FROM inventory_movements
      WHERE variant_id = ? ORDER BY id`,
    ).all(variantId).map((row) => ({ ...row })),
    reservations: database.prepare(
      `SELECT id, cart_id, variant_id, quantity, status, idempotency_key,
        last_transition_key, expires_at, converted_order_id, created_at,
        updated_at FROM stock_reservations
      WHERE idempotency_key = ? ORDER BY id`,
    ).all(input.idempotencyKey).map((row) => ({ ...row })),
  });
  const closedCapacitySnapshot = snapshot();

  const exactWhileClosed = await store.reserveStock({
    ...input,
    now: "2099-08-10T12:07:00.000Z",
  });
  assert.equal(exactWhileClosed.status, "active");
  assert.deepEqual(snapshot(), closedCapacitySnapshot);
  await assert.rejects(
    () => store.reserveStock({
      ...input,
      quantity: 2,
      now: "2099-08-10T12:08:00.000Z",
    }),
    (error) =>
      error instanceof CommerceError &&
      error.code === "IDEMPOTENCY_CONFLICT" &&
      error.message ===
        "The reservation idempotency key was already used for different input.",
  );
  assert.deepEqual(snapshot(), closedCapacitySnapshot);

  await store.releaseStock({
    reservationId: input.reservationId,
    idempotencyKey: "release_known_key",
    now: "2099-08-10T12:09:00.000Z",
  });
  const releasedSnapshot = snapshot();
  const exactAfterStateChange = await store.reserveStock({
    ...input,
    now: "2099-08-10T12:10:00.000Z",
  });
  assert.equal(exactAfterStateChange.status, "released");
  assert.deepEqual(snapshot(), releasedSnapshot);
  await assert.rejects(
    () => store.reserveStock({
      ...input,
      reservationId: "reservation_known_key_divergent",
      now: "2099-08-10T12:11:00.000Z",
    }),
    (error) =>
      error instanceof CommerceError &&
      error.code === "IDEMPOTENCY_CONFLICT" &&
      error.message ===
        "The reservation idempotency key was already used for different input.",
  );
  assert.deepEqual(snapshot(), releasedSnapshot);
  database.close();
});

test("concurrent buyers never oversell, including the last unit", async () => {
  const { database, store } = createFixture();
  const now = "2099-08-10T12:01:00.000Z";
  const expiresAt = "2099-08-10T13:00:00.000Z";
  const variantId = "variant_boxer_lilas-bleu-clair_s";
  await store.seedLaunchCatalog("2099-08-10T12:00:00.000Z");
  validateReserves(database, [variantId]);
  adjustPhysicalStock(database, {
    id: "last-unit-proof",
    variantId,
    targetQuantity: 1,
    now: "2099-08-10T12:00:30.000Z",
  });
  await Promise.all([
    store.createCart({
      id: "cart_buyer_a",
      expiresAt: "2099-08-10T14:00:00.000Z",
      now,
    }),
    store.createCart({
      id: "cart_buyer_b",
      expiresAt: "2099-08-10T14:00:00.000Z",
      now,
    }),
  ]);
  insertCartLines(database, {
    cartId: "cart_buyer_a",
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  insertCartLines(database, {
    cartId: "cart_buyer_b",
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  const results = await Promise.allSettled([
    store.reserveStock({
      reservationId: "reservation_buyer_a",
      cartId: "cart_buyer_a",
      variantId,
      quantity: 1,
      idempotencyKey: "last_unit_buyer_a",
      expiresAt,
      now,
    }),
    store.reserveStock({
      reservationId: "reservation_buyer_b",
      cartId: "cart_buyer_b",
      variantId,
      quantity: 1,
      idempotencyKey: "last_unit_buyer_b",
      expiresAt,
      now,
    }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const position = await store.getInventoryPosition(variantId);
  assert.equal(position.activeReservedQuantity, 1);
  assert.equal(availableToSell(position), 0);
  database.close();
});

test("shared transition keys stay reservation-scoped across release, expiration and sale retries", async () => {
  const { database, store } = createFixture();
  const now = "2099-08-10T12:00:00.000Z";
  const releaseVariant = "variant_boxer_pourpre_s";
  const expireVariant = "variant_boxer_rose-pale_m";
  const saleVariants = [
    "variant_boxer_lilas-bleu-clair_l",
    "variant_boxer_lilas-bleu-clair_xl",
  ];
  await store.seedLaunchCatalog(now);
  validateReserves(database, [releaseVariant, expireVariant, ...saleVariants]);

  for (const cartId of [
    "cart_shared_release",
    "cart_shared_expire",
    "cart_shared_convert",
  ]) {
    await store.createCart({
      id: cartId,
      expiresAt: "2099-08-10T14:00:00.000Z",
      now,
    });
  }
  insertCartLines(database, {
    cartId: "cart_shared_release",
    now,
    lines: [{ variantId: releaseVariant, quantity: 3 }],
  });
  insertCartLines(database, {
    cartId: "cart_shared_expire",
    now,
    lines: [{ variantId: expireVariant, quantity: 3 }],
  });
  insertCartLines(database, {
    cartId: "cart_shared_convert",
    now,
    lines: [
      { variantId: saleVariants[0], quantity: 1 },
      { variantId: saleVariants[1], quantity: 2 },
    ],
  });

  const reservationSpecs = [
    ["release_a", "cart_shared_release", releaseVariant, 1],
    ["release_b", "cart_shared_release", releaseVariant, 2],
    ["expire_a", "cart_shared_expire", expireVariant, 1],
    ["expire_b", "cart_shared_expire", expireVariant, 2],
    ["convert_a", "cart_shared_convert", saleVariants[0], 1],
    ["convert_b", "cart_shared_convert", saleVariants[1], 2],
  ];
  for (const [suffix, cartId, variantId, quantity] of reservationSpecs) {
    const reservationId = `reservation_shared_${suffix}`;
    await store.reserveStock({
      reservationId,
      cartId,
      variantId,
      quantity,
      idempotencyKey: `reserve_${reservationId}`,
      expiresAt: "2099-08-10T13:00:00.000Z",
      now,
    });
  }

  for (const reservationId of [
    "reservation_shared_release_a",
    "reservation_shared_release_b",
  ]) {
    await store.releaseStock({
      reservationId,
      idempotencyKey: "shared_release_request",
      now: "2099-08-10T12:10:00.000Z",
    });
    await store.releaseStock({
      reservationId,
      idempotencyKey: "shared_release_request",
      now: "2099-08-10T12:11:00.000Z",
    });
  }

  await assert.rejects(
    () =>
      store.expireReservation({
        reservationId: "reservation_shared_expire_a",
        idempotencyKey: "shared_expire_request",
        now: "2099-08-10T12:59:59.999Z",
      }),
    (error) =>
      error instanceof CommerceError && error.code === "RESERVATION_NOT_EXPIRED",
  );
  for (const reservationId of [
    "reservation_shared_expire_a",
    "reservation_shared_expire_b",
  ]) {
    await store.expireReservation({
      reservationId,
      idempotencyKey: "shared_expire_request",
      now: "2099-08-10T13:00:00.000Z",
    });
    await store.expireReservation({
      reservationId,
      idempotencyKey: "shared_expire_request",
      now: "2099-08-10T13:01:00.000Z",
    });
  }

  const orderTotal = insertPendingOrder(database, {
    id: "order_shared_convert",
    number: "AJ-TEST-SHARED-CONVERT",
    cartId: "cart_shared_convert",
    now,
    lines: [
      { variantId: saleVariants[0], quantity: 1 },
      { variantId: saleVariants[1], quantity: 2 },
    ],
  });
  insertVerifiedPaymentPrerequisite(database, {
    providerEventId: "event_shared_convert",
    providerPaymentId: "payment_shared_convert",
    orderId: "order_shared_convert",
    amountCents: orderTotal,
    now: "2099-08-10T12:20:00.000Z",
  });
  for (const reservationId of [
    "reservation_shared_convert_a",
    "reservation_shared_convert_b",
  ]) {
    await store.convertStockToSale({
      reservationId,
      orderId: "order_shared_convert",
      idempotencyKey: "shared_convert_request",
      now: "2099-08-10T12:20:00.000Z",
    });
    await store.convertStockToSale({
      reservationId,
      orderId: "order_shared_convert",
      idempotencyKey: "shared_convert_request",
      now: "2099-08-10T12:21:00.000Z",
    });
  }

  const transitionRows = database
    .prepare(
      `SELECT kind, quantity, reference_type, reference_id, idempotency_key
      FROM inventory_movements
      WHERE idempotency_key LIKE 'release:shared_release_request:%'
        OR idempotency_key LIKE 'expire:shared_expire_request:%'
        OR idempotency_key LIKE 'sale:shared_convert_request:%'
      ORDER BY idempotency_key`,
    )
    .all()
    .map(
      (row) =>
        `${row.kind}|${row.quantity}|${row.reference_type}|${row.reference_id}|${row.idempotency_key}`,
    );
  assert.deepEqual(transitionRows, [
    "release|1|expiration|reservation_shared_expire_a|expire:shared_expire_request:reservation_shared_expire_a",
    "release|2|expiration|reservation_shared_expire_b|expire:shared_expire_request:reservation_shared_expire_b",
    "release|1|reservation|reservation_shared_release_a|release:shared_release_request:reservation_shared_release_a",
    "release|2|reservation|reservation_shared_release_b|release:shared_release_request:reservation_shared_release_b",
    "sale|1|order|order_shared_convert|sale:shared_convert_request:reservation_shared_convert_a",
    "sale|2|order|order_shared_convert|sale:shared_convert_request:reservation_shared_convert_b",
  ]);

  assert.deepEqual(
    database
      .prepare(
        `SELECT id, status, last_transition_key FROM stock_reservations
        WHERE id LIKE 'reservation_shared_%' ORDER BY id`,
      )
      .all()
      .map((row) => `${row.id}|${row.status}|${row.last_transition_key}`),
    [
      "reservation_shared_convert_a|converted|shared_convert_request",
      "reservation_shared_convert_b|converted|shared_convert_request",
      "reservation_shared_expire_a|expired|shared_expire_request",
      "reservation_shared_expire_b|expired|shared_expire_request",
      "reservation_shared_release_a|released|shared_release_request",
      "reservation_shared_release_b|released|shared_release_request",
    ],
  );
  assert.equal(
    (await store.getInventoryPosition(releaseVariant)).activeReservedQuantity,
    0,
  );
  assert.equal(
    (await store.getInventoryPosition(expireVariant)).activeReservedQuantity,
    0,
  );
  assert.equal(
    (await store.getInventoryPosition(saleVariants[0])).soldQuantity,
    1,
  );
  assert.equal(
    (await store.getInventoryPosition(saleVariants[1])).soldQuantity,
    2,
  );
  database.close();
});

test("verified payment atomically converts every line once and writes outbox plus audit", async () => {
  const { database, store } = createFixture();
  const now = "2099-08-10T12:00:00.000Z";
  const paidAt = "2099-08-10T12:10:00.000Z";
  const firstVariant = "variant_boxer_pourpre_m";
  const secondVariant = "variant_boxer_rose-pale_l";
  await store.seedLaunchCatalog(now);
  validateReserves(database, [firstVariant, secondVariant]);
  await store.createCart({
    id: "cart_paid",
    email: "client@example.com",
    expiresAt: "2099-08-10T14:00:00.000Z",
    now,
  });
  insertCartLines(database, {
    cartId: "cart_paid",
    now,
    lines: [
      { variantId: firstVariant, quantity: 2 },
      { variantId: secondVariant, quantity: 1 },
    ],
  });
  await Promise.all([
    store.reserveStock({
      reservationId: "reservation_paid_1",
      cartId: "cart_paid",
      variantId: firstVariant,
      quantity: 2,
      idempotencyKey: "reserve_paid_1",
      expiresAt: "2099-08-10T13:00:00.000Z",
      now,
    }),
    store.reserveStock({
      reservationId: "reservation_paid_2",
      cartId: "cart_paid",
      variantId: secondVariant,
      quantity: 1,
      idempotencyKey: "reserve_paid_2",
      expiresAt: "2099-08-10T13:00:00.000Z",
      now,
    }),
  ]);
  const total = insertPendingOrder(database, {
    id: "order_paid",
    number: "AJ-TEST-PAID",
    cartId: "cart_paid",
    now,
    lines: [
      { variantId: firstVariant, quantity: 2 },
      { variantId: secondVariant, quantity: 1 },
    ],
  });
  const event = await createVerifiedEvent({
    providerEventId: "event_paid",
    providerPaymentId: "payment_paid",
    orderId: "order_paid",
    amountCents: total,
    occurredAt: paidAt,
  });

  database
    .prepare("UPDATE products SET price_cents = 3499 WHERE id = 'product_apollon'")
    .run();

  const first = await store.processPaymentSucceeded(event);
  const retry = await store.processPaymentSucceeded(event);
  assert.deepEqual(first, { orderId: "order_paid", convertedReservations: 2 });
  assert.deepEqual(retry, first);
  assert.deepEqual(
    {
      ...database
      .prepare(
        `SELECT orders.status AS order_status, carts.status AS cart_status
        FROM orders INNER JOIN carts ON carts.id = orders.cart_id
        WHERE orders.id = ?`,
      )
      .get("order_paid"),
    },
    { order_status: "paid", cart_status: "converted" },
  );
  assert.equal((await store.getInventoryPosition(firstVariant)).soldQuantity, 2);
  assert.equal((await store.getInventoryPosition(secondVariant)).soldQuantity, 1);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM payments").get().count,
    1,
  );
  assert.deepEqual(
    {
      ...database
        .prepare("SELECT status, attempts FROM webhook_events")
        .get(),
    },
    { status: "processed", attempts: 1 },
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM email_outbox").get().count,
    1,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM audit_log").get().count,
    1,
  );
  const audit = database
    .prepare("SELECT action, metadata_json FROM audit_log")
    .get();
  assert.equal(audit.action, "payment_succeeded");
  assert.doesNotMatch(audit.metadata_json, /payload|fingerprint|hash|raw/i);
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE kind = 'sale'")
      .get().count,
    2,
  );
  assert.deepEqual(
    database
      .prepare(
        `SELECT idempotency_key FROM inventory_movements
        WHERE kind = 'sale' ORDER BY idempotency_key`,
      )
      .all()
      .map((row) => row.idempotency_key),
    [
      "sale:webhook:test:event_paid:reservation_paid_1",
      "sale:webhook:test:event_paid:reservation_paid_2",
    ],
  );
  assert.deepEqual(
    {
      ...database
        .prepare(
          `SELECT product.price_cents AS current_catalog_price,
            cart_line.unit_price_cents AS cart_snapshot_price,
            order_line.unit_price_cents AS order_snapshot_price
          FROM products AS product
          INNER JOIN variants AS variant ON variant.product_id = product.id
          INNER JOIN cart_lines AS cart_line ON cart_line.variant_id = variant.id
          INNER JOIN order_lines AS order_line
            ON order_line.variant_id = variant.id
          WHERE product.id = 'product_apollon'
          LIMIT 1`,
        )
        .get(),
    },
    {
      current_catalog_price: 3_499,
      cart_snapshot_price: 2_999,
      order_snapshot_price: 2_999,
    },
  );

  const conflictingReplay = await createVerifiedEvent({
    providerEventId: "event_paid",
    providerPaymentId: "payment_paid",
    orderId: "order_paid",
    amountCents: total + 1,
    occurredAt: paidAt,
  });
  await assert.rejects(
    () => store.processPaymentSucceeded(conflictingReplay),
    (error) =>
      error instanceof CommerceError && error.code === "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM payments").get().count,
    1,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE kind = 'sale'")
      .get().count,
    2,
  );

  const webhookColumns = database
    .prepare("PRAGMA table_info(webhook_events)")
    .all()
    .map((row) => row.name);
  assert.ok(webhookColumns.includes("payload_fingerprint"));
  assert.ok(!webhookColumns.some((name) => /raw|payload_json|payload_body/i.test(name)));
  const storeSource = readFileSync(
    fileURLToPath(
      new URL("../lib/commerce/d1-commerce-store.ts", import.meta.url),
    ),
    "utf8",
  );
  assert.doesNotMatch(storeSource, /console\.(?:log|info|warn|error)/);

  await assert.rejects(
    () =>
      store.processPaymentSucceeded({
        provider: "test",
        providerEventId: "forged",
        providerPaymentId: "forged",
        eventType: "payment.succeeded",
        orderId: "order_paid",
        amountCents: total,
        currency: "EUR",
        occurredAt: paidAt,
        verifiedAt: paidAt,
        verificationMethod: "test_adapter",
        payloadFingerprint: "sha256:forged",
      }),
    (error) =>
      error instanceof CommerceError &&
      error.code === "PAYMENT_VERIFICATION_REQUIRED",
  );
  database.close();
});

test("every payment line mismatch rolls back webhook, payment, stock, order, outbox and audit", async (t) => {
  const scenarios = [
    {
      name: "missing order line",
      mutate(database, context) {
        database
          .prepare("DELETE FROM order_lines WHERE order_id = ?")
          .run(context.orderId);
        return 2_999;
      },
    },
    {
      name: "extra order line",
      mutate(database, context) {
        database
          .prepare(
            `INSERT INTO order_lines (
              id, order_id, variant_id, internal_reference, product_name,
              color_name, size, quantity, unit_price_cents, line_total_cents,
              created_at
            )
            SELECT ?, ?, variant.id, variant.internal_reference, product.name,
              variant.color_name, variant.size, 1, 0, 0, ?
            FROM variants AS variant
            INNER JOIN products AS product ON product.id = variant.product_id
            WHERE variant.id = ?`,
          )
          .run(
            `${context.orderId}_extra_line`,
            context.orderId,
            context.now,
            context.alternateVariantId,
          );
        return 2_999;
      },
    },
    {
      name: "quantity divergence",
      mutate(database, context) {
        database
          .prepare(
            `UPDATE order_lines
            SET quantity = 2, line_total_cents = 5998
            WHERE order_id = ?`,
          )
          .run(context.orderId);
        database
          .prepare(
            `UPDATE orders SET subtotal_cents = 5998, total_cents = 5998
            WHERE id = ?`,
          )
          .run(context.orderId);
        return 5_998;
      },
    },
    {
      name: "unit-price and amount divergence",
      mutate(database, context) {
        database
          .prepare(
            `UPDATE order_lines
            SET unit_price_cents = 3099, line_total_cents = 3099
            WHERE order_id = ?`,
          )
          .run(context.orderId);
        database
          .prepare(
            `UPDATE orders SET subtotal_cents = 3099, total_cents = 3099
            WHERE id = ?`,
          )
          .run(context.orderId);
        return 3_099;
      },
    },
    {
      name: "variant divergence",
      mutate(database, context) {
        const alternate = database
          .prepare(
            `SELECT variant.id, variant.internal_reference, variant.color_name,
              variant.size, product.name AS product_name
            FROM variants AS variant
            INNER JOIN products AS product ON product.id = variant.product_id
            WHERE variant.id = ?`,
          )
          .get(context.alternateVariantId);
        database
          .prepare(
            `UPDATE order_lines SET variant_id = ?, internal_reference = ?,
              product_name = ?, color_name = ?, size = ?
            WHERE order_id = ?`,
          )
          .run(
            alternate.id,
            alternate.internal_reference,
            alternate.product_name,
            alternate.color_name,
            alternate.size,
            context.orderId,
          );
        return 2_999;
      },
    },
    {
      name: "provider amount divergence",
      mutate() {
        return 1;
      },
    },
  ];

  for (const [index, scenario] of scenarios.entries()) {
    await t.test(scenario.name, async () => {
      const { database, store } = createFixture({ migrationCount: 2 });
      const now = "2099-08-10T12:00:00.000Z";
      const variantId = "variant_boxer_pourpre_l";
      const alternateVariantId = "variant_boxer_rose-pale_l";
      const suffix = `mismatch_${index}`;
      const cartId = `cart_${suffix}`;
      const orderId = `order_${suffix}`;
      const reservationId = `reservation_${suffix}`;
      await store.seedLaunchCatalog(now);
      validateReserves(database, [variantId]);
      await store.createCart({
        id: cartId,
        expiresAt: "2099-08-10T14:00:00.000Z",
        now,
      });
      insertCartLines(database, {
        cartId,
        now,
        lines: [{ variantId, quantity: 1 }],
      });
      await store.reserveStock({
        reservationId,
        cartId,
        variantId,
        quantity: 1,
        idempotencyKey: `reserve_${suffix}`,
        expiresAt: "2099-08-10T13:00:00.000Z",
        now,
      });
      insertPendingOrder(database, {
        id: orderId,
        number: `AJ-TEST-MISMATCH-${index}`,
        cartId,
        now,
        lines: [{ variantId, quantity: 1 }],
      });
      const amountCents = scenario.mutate(database, {
        alternateVariantId,
        now,
        orderId,
      });
      applyMigration(database, migrationPaths[2]);
      const event = await createVerifiedEvent({
        providerEventId: `event_${suffix}`,
        providerPaymentId: `payment_${suffix}`,
        orderId,
        amountCents,
        occurredAt: "2099-08-10T12:10:00.000Z",
      });

      await assert.rejects(
        () => store.processPaymentSucceeded(event),
        (error) =>
          error instanceof CommerceError &&
          error.code === "ORDER_PAYMENT_MISMATCH",
      );
      assert.deepEqual(
        {
          ...database
            .prepare(
              `SELECT orders.status AS order_status,
                carts.status AS cart_status
              FROM orders
              INNER JOIN carts ON carts.id = orders.cart_id
              WHERE orders.id = ?`,
            )
            .get(orderId),
        },
        { order_status: "pending_payment", cart_status: "open" },
      );
      assert.deepEqual(
        {
          ...database
            .prepare(
              `SELECT status, last_transition_key, converted_order_id
              FROM stock_reservations WHERE id = ?`,
            )
            .get(reservationId),
        },
        {
          status: "active",
          last_transition_key: null,
          converted_order_id: null,
        },
      );
      const inventory = await store.getInventoryPosition(variantId);
      assert.equal(inventory.activeReservedQuantity, 1);
      assert.equal(inventory.soldQuantity, 0);
      assert.equal(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM inventory_movements WHERE kind = 'sale'",
          )
          .get().count,
        0,
      );
      for (const table of [
        "webhook_events",
        "payments",
        "email_outbox",
        "audit_log",
      ]) {
        assert.equal(
          database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()
            .count,
          0,
          `${scenario.name}: ${table} must roll back`,
        );
      }
      database.close();
    });
  }
});

test("catalog labels are validated at snapshot creation and may change before payment", async () => {
  const { database, store } = createFixture();
  const now = "2099-08-10T12:00:00.000Z";
  const variantId = "variant_boxer_pourpre_l";
  const cartId = "cart_catalog_rename";
  const orderId = "order_catalog_rename";
  await store.seedLaunchCatalog(now);
  validateReserves(database, [variantId]);
  await store.createCart({
    id: cartId,
    expiresAt: "2099-08-10T14:00:00.000Z",
    now,
  });
  insertCartLines(database, {
    cartId,
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  await store.reserveStock({
    reservationId: "reservation_catalog_rename",
    cartId,
    variantId,
    quantity: 1,
    idempotencyKey: "reserve_catalog_rename",
    expiresAt: "2099-08-10T13:00:00.000Z",
    now,
  });
  const total = insertPendingOrder(database, {
    id: orderId,
    number: "AJ-TEST-CATALOG-RENAME",
    cartId,
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  const snapshotName = database
    .prepare("SELECT product_name FROM order_lines WHERE order_id = ?")
    .get(orderId).product_name;
  database
    .prepare("UPDATE products SET name = ? WHERE id = ?")
    .run("Apollon Renommé", "product_apollon");

  const result = await store.processPaymentSucceeded(
    await createVerifiedEvent({
      providerEventId: "event_catalog_rename",
      providerPaymentId: "payment_catalog_rename",
      orderId,
      amountCents: total,
      occurredAt: "2099-08-10T12:10:00.000Z",
    }),
  );

  assert.deepEqual(result, { orderId, convertedReservations: 1 });
  assert.deepEqual(
    {
      ...database
        .prepare(
          `SELECT line.product_name AS snapshot_name,
            product.name AS current_catalog_name, orders.status
          FROM order_lines AS line
          INNER JOIN orders ON orders.id = line.order_id
          INNER JOIN variants AS variant ON variant.id = line.variant_id
          INNER JOIN products AS product ON product.id = variant.product_id
          WHERE line.order_id = ?`,
        )
        .get(orderId),
    },
    {
      snapshot_name: snapshotName,
      current_catalog_name: "Apollon Renommé",
      status: "paid",
    },
  );
  database.close();
});

test("expired reservations and order-cart mismatches cannot be converted", async () => {
  const { database, store } = createFixture();
  const now = "2099-08-10T12:00:00.000Z";
  const variantId = "variant_boxer_lilas-bleu-clair_l";
  await store.seedLaunchCatalog(now);
  validateReserves(database, [variantId]);
  await store.createCart({
    id: "cart_expired_sale",
    expiresAt: "2099-08-10T14:00:00.000Z",
    now,
  });
  insertCartLines(database, {
    cartId: "cart_expired_sale",
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  await store.reserveStock({
    reservationId: "reservation_expired_sale",
    cartId: "cart_expired_sale",
    variantId,
    quantity: 1,
    idempotencyKey: "reserve_expired_sale",
    expiresAt: "2099-08-10T12:30:00.000Z",
    now,
  });
  insertPendingOrder(database, {
    id: "order_expired_sale",
    number: "AJ-TEST-EXPIRED",
    cartId: "cart_expired_sale",
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  const expiredEvent = await createVerifiedEvent({
    providerEventId: "event_expired_sale",
    providerPaymentId: "payment_expired_sale",
    orderId: "order_expired_sale",
    amountCents: 2999,
    occurredAt: "2099-08-10T12:30:00.000Z",
  });
  await assert.rejects(
    () => store.processPaymentSucceeded(expiredEvent),
    (error) =>
      error instanceof CommerceError &&
      error.code === "INVALID_RESERVATION_TRANSITION",
  );

  await store.createCart({
    id: "cart_wrong_order",
    expiresAt: "2099-08-10T14:00:00.000Z",
    now,
  });
  insertCartLines(database, {
    cartId: "cart_wrong_order",
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  insertPendingOrder(database, {
    id: "order_wrong_cart",
    number: "AJ-TEST-WRONG-CART",
    cartId: "cart_wrong_order",
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  const wrongCartEvent = await createVerifiedEvent({
    providerEventId: "event_wrong_cart",
    providerPaymentId: "payment_wrong_cart",
    orderId: "order_wrong_cart",
    amountCents: 2999,
    occurredAt: "2099-08-10T12:10:00.000Z",
  });
  await assert.rejects(
    () => store.processPaymentSucceeded(wrongCartEvent),
    (error) =>
      error instanceof CommerceError && error.code === "ORDER_PAYMENT_MISMATCH",
  );
  assert.equal((await store.getInventoryPosition(variantId)).activeReservedQuantity, 1);
  assert.equal((await store.getInventoryPosition(variantId)).soldQuantity, 0);
  database.close();
});
