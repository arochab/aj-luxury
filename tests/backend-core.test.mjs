import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  LAUNCH_PHYSICAL_QUANTITY,
  LAUNCH_VARIANT_COUNT,
  launchVariantSeed,
} from "../db/seed.ts";
import {
  CommerceError,
  availableToSell,
} from "../lib/commerce/backend-domain.ts";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";

const migrationPath = fileURLToPath(
  new URL("../drizzle/0000_awesome_owl.sql", import.meta.url),
);

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

function createFixture() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");

  const migration = readFileSync(migrationPath, "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    const sql = statement.trim();
    if (sql) {
      database.exec(sql);
    }
  }

  const adapter = new SQLiteD1Database(database);
  return {
    database,
    store: new D1CommerceStore(adapter),
  };
}

function insertPendingOrder(database, { id, number, cartId, now }) {
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
    .run(id, number, cartId, "client@example.com", 2999, 2999, now, now);
}

test("generated migration applies to an empty database and seed replay is idempotent", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";

  await store.seedLaunchCatalog(now);
  await store.seedLaunchCatalog(now);

  const tableCount = database
    .prepare(
      `SELECT COUNT(*) AS count
      FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .get().count;
  const totals = database
    .prepare(
      `SELECT
        COUNT(*) AS variants,
        SUM(physical_quantity) AS physical,
        SUM(gift_reserve_quantity) AS gifts,
        SUM(safety_reserve_quantity) AS safety,
        SUM(reserves_validated) AS validated
      FROM inventory`,
    )
    .get();
  const seedMovements = database
    .prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE kind = 'seed'")
    .get().count;
  const references = database
    .prepare("SELECT internal_reference FROM variants ORDER BY sort_order")
    .all()
    .map((row) => row.internal_reference);

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
  assert.equal(seedMovements, 12, "replaying the seed must not duplicate movements");
  assert.deepEqual(
    references,
    launchVariantSeed.map((variant) => variant.internalReference),
  );
  assert.ok(references.every((reference) => /^AJ-APO-(POU|ROS|LIL)-(S|M|L|XL)$/.test(reference)));

  const plan = database
    .prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at",
    )
    .all("customer_test");
  assert.ok(
    plan.some((row) => String(row.detail).includes("idx_orders_customer_created_at")),
    "customer order history must use its composite index",
  );

  database.close();
});

test("database constraints reject impossible money, quantity and inventory states", async () => {
  const { database, store } = createFixture();
  await store.seedLaunchCatalog("2026-08-10T12:00:00.000Z");

  assert.throws(
    () =>
      database
        .prepare(
          `UPDATE inventory
          SET gift_reserve_quantity = physical_quantity + 1
          WHERE variant_id = ?`,
        )
        .run("variant_boxer_pourpre_s"),
    /ck_inventory_allocation_within_physical/,
  );

  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO carts (
            id, status, currency, expires_at, created_at, updated_at
          ) VALUES ('cart_bad_currency', 'open', 'USD', ?, ?, ?)`,
        )
        .run(
          "2026-08-10T14:00:00.000Z",
          "2026-08-10T12:00:00.000Z",
          "2026-08-10T12:00:00.000Z",
        ),
    /ck_carts_currency_eur/,
  );

  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO products (
            id, slug, name, status, price_cents, currency
          ) VALUES ('product_bad', 'bad', 'Bad', 'active', -1, 'EUR')`,
        )
        .run(),
    /ck_products_price_non_negative/,
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
            'other', 'Other', 'S', '#000000', '/other.webp', 1, 99, ?, ?
          )`,
        )
        .run("2026-08-10T12:00:00.000Z", "2026-08-10T12:00:00.000Z"),
    /UNIQUE constraint failed: variants.internal_reference/,
  );

  database.close();
});

test("concurrent reservations are atomic, capped by stock and idempotent", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  const expiresAt = "2026-08-10T13:00:00.000Z";
  const cartExpiresAt = "2026-08-10T14:00:00.000Z";
  const variantId = "variant_boxer_pourpre_s";

  await store.seedLaunchCatalog(now);
  await store.createCart({
    id: "cart_concurrency",
    expiresAt: cartExpiresAt,
    now,
  });

  const attempts = Array.from({ length: 40 }, (_, index) => ({
    reservationId: `reservation_${index}`,
    cartId: "cart_concurrency",
    variantId,
    quantity: 1,
    idempotencyKey: `reserve_${index}`,
    expiresAt,
    now,
  }));
  const results = await Promise.allSettled(
    attempts.map((input) => store.reserveStock(input)),
  );
  const successes = results.filter((result) => result.status === "fulfilled");
  const failures = results.filter((result) => result.status === "rejected");

  assert.equal(successes.length, 26);
  assert.equal(failures.length, 14);
  assert.ok(
    failures.every(
      (result) =>
        result.reason instanceof CommerceError &&
        result.reason.code === "INSUFFICIENT_STOCK_OR_CART_CLOSED",
    ),
  );

  const fullPosition = await store.getInventoryPosition(variantId);
  assert.ok(fullPosition);
  assert.equal(fullPosition.activeReservedQuantity, 26);
  assert.equal(availableToSell(fullPosition), 0);

  const first = await store.reserveStock(attempts[0]);
  assert.equal(first.id, attempts[0].reservationId);
  const afterRetry = await store.getInventoryPosition(variantId);
  assert.equal(afterRetry.activeReservedQuantity, 26);

  await assert.rejects(
    () => store.reserveStock({ ...attempts[0], quantity: 2 }),
    (error) =>
      error instanceof CommerceError && error.code === "IDEMPOTENCY_CONFLICT",
  );

  const reserveMovementCount = database
    .prepare(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE kind = 'reserve'",
    )
    .get().count;
  assert.equal(reserveMovementCount, 26);

  database.close();
});

test("two buyers competing for the last unit produce exactly one reservation", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  const expiresAt = "2026-08-10T13:00:00.000Z";
  const cartExpiresAt = "2026-08-10T14:00:00.000Z";
  const variantId = "variant_boxer_lilas-bleu-clair_s";

  await store.seedLaunchCatalog(now);
  database
    .prepare(
      `UPDATE inventory
      SET physical_quantity = 1
      WHERE variant_id = ?`,
    )
    .run(variantId);
  await Promise.all([
    store.createCart({ id: "cart_buyer_a", expiresAt: cartExpiresAt, now }),
    store.createCart({ id: "cart_buyer_b", expiresAt: cartExpiresAt, now }),
  ]);

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

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  const position = await store.getInventoryPosition(variantId);
  assert.equal(position.activeReservedQuantity, 1);
  assert.equal(availableToSell(position), 0);

  database.close();
});

test("release and sale transitions update stock once and keep an audit trail", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  const transitionTime = "2026-08-10T12:10:00.000Z";
  const expiresAt = "2026-08-10T13:00:00.000Z";
  const cartExpiresAt = "2026-08-10T14:00:00.000Z";
  const variantId = "variant_boxer_rose-pale_m";

  await store.seedLaunchCatalog(now);
  await store.createCart({ id: "cart_transition", expiresAt: cartExpiresAt, now });

  await store.reserveStock({
    reservationId: "reservation_release",
    cartId: "cart_transition",
    variantId,
    quantity: 2,
    idempotencyKey: "reserve_release",
    expiresAt,
    now,
  });
  await store.releaseStock({
    reservationId: "reservation_release",
    idempotencyKey: "release_once",
    now: transitionTime,
  });
  await store.releaseStock({
    reservationId: "reservation_release",
    idempotencyKey: "release_once",
    now: transitionTime,
  });

  let position = await store.getInventoryPosition(variantId);
  assert.equal(position.activeReservedQuantity, 0);
  assert.equal(position.soldQuantity, 0);
  assert.equal(availableToSell(position), 103);

  await assert.rejects(
    () =>
      store.releaseStock({
        reservationId: "reservation_release",
        idempotencyKey: "release_different",
        now: transitionTime,
      }),
    (error) =>
      error instanceof CommerceError &&
      error.code === "INVALID_RESERVATION_TRANSITION",
  );

  await store.reserveStock({
    reservationId: "reservation_sale",
    cartId: "cart_transition",
    variantId,
    quantity: 3,
    idempotencyKey: "reserve_sale",
    expiresAt,
    now,
  });
  insertPendingOrder(database, {
    id: "order_sale",
    number: "AJ-TEST-0001",
    cartId: "cart_transition",
    now: transitionTime,
  });
  await store.convertStockToSale({
    reservationId: "reservation_sale",
    orderId: "order_sale",
    idempotencyKey: "sale_once",
    now: transitionTime,
  });
  await store.convertStockToSale({
    reservationId: "reservation_sale",
    orderId: "order_sale",
    idempotencyKey: "sale_once",
    now: transitionTime,
  });

  position = await store.getInventoryPosition(variantId);
  assert.equal(position.activeReservedQuantity, 0);
  assert.equal(position.soldQuantity, 3);
  assert.equal(availableToSell(position), 100);

  const movements = database
    .prepare(
      `SELECT kind, COUNT(*) AS count
      FROM inventory_movements
      WHERE variant_id = ? AND kind IN ('reserve', 'release', 'sale')
      GROUP BY kind
      ORDER BY kind`,
    )
    .all(variantId);
  assert.deepEqual(movements.map((movement) => ({ ...movement })), [
    { kind: "release", count: 1 },
    { kind: "reserve", count: 2 },
    { kind: "sale", count: 1 },
  ]);

  database.close();
});

test("duplicate payment webhook converts stock once and retains no raw payload", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  const processedAt = "2026-08-10T12:10:00.000Z";
  const variantId = "variant_boxer_lilas-bleu-clair_m";
  await store.seedLaunchCatalog(now);
  await store.createCart({
    id: "cart_webhook",
    expiresAt: "2026-08-10T14:00:00.000Z",
    now,
  });
  await store.reserveStock({
    reservationId: "reservation_webhook",
    cartId: "cart_webhook",
    variantId,
    quantity: 1,
    idempotencyKey: "reserve_webhook",
    expiresAt: "2026-08-10T13:00:00.000Z",
    now,
  });
  insertPendingOrder(database, {
    id: "order_webhook",
    number: "AJ-TEST-0002",
    cartId: "cart_webhook",
    now,
  });

  const input = {
    id: "webhook_1",
    provider: "test",
    providerEventId: "event_1",
    eventType: "payment.succeeded",
    payloadHash: "sha256:0123456789abcdef",
    receivedAt: now,
    processedAt,
    reservationId: "reservation_webhook",
    orderId: "order_webhook",
  };

  const first = await store.processPaymentSucceeded(input);
  const retry = await store.processPaymentSucceeded({
    ...input,
    id: "webhook_retry",
  });
  assert.equal(first.id, retry.id);
  const position = await store.getInventoryPosition(variantId);
  assert.equal(position.activeReservedQuantity, 0);
  assert.equal(position.soldQuantity, 1);
  assert.equal(availableToSell(position), 101);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM webhook_events").get().count,
    1,
  );
  assert.deepEqual(
    database.prepare("PRAGMA table_info(webhook_events)").all().map((row) => row.name),
    [
      "id",
      "provider",
      "provider_event_id",
      "event_type",
      "payload_hash",
      "status",
      "attempts",
      "last_error_code",
      "received_at",
      "processed_at",
    ],
    "raw webhook payloads must not be retained",
  );

  await assert.rejects(
    () =>
      store.processPaymentSucceeded({
        ...input,
        payloadHash: "sha256:different",
      }),
    (error) =>
      error instanceof CommerceError && error.code === "IDEMPOTENCY_CONFLICT",
  );

  database.close();
});
