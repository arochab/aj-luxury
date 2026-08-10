import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
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
import { assertVerifiedPaymentEvent } from "../lib/commerce/verified-payment-event.ts";
import { verifyTestPaymentEvent } from "./support/test-payment-event.ts";

const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrationPaths = readdirSync(drizzleDirectory)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => `${drizzleDirectory}${name}`);

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(?:[cm]?js|tsx?)$/.test(entry.name) ? [path] : [];
  });
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

function createFixture() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");

  for (const migrationPath of migrationPaths) {
    const migration = readFileSync(migrationPath, "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      const sql = statement.trim();
      if (sql) database.exec(sql);
    }
  }

  return {
    database,
    store: new D1CommerceStore(new SQLiteD1Database(database)),
  };
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

function insertPendingOrder(database, input) {
  const subtotalCents = input.lines.reduce(
    (total, line) => total + line.quantity * 2999,
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
    `SELECT internal_reference, color_name, size
    FROM variants WHERE id = ?`,
  );
  const insertLine = database.prepare(
    `INSERT INTO order_lines (
      id, order_id, variant_id, internal_reference, product_name, color_name,
      size, quantity, unit_price_cents, line_total_cents, created_at
    ) VALUES (?, ?, ?, ?, 'Apollon', ?, ?, ?, 2999, ?, ?)`,
  );
  input.lines.forEach((line, index) => {
    const variant = variantQuery.get(line.variantId);
    insertLine.run(
      `${input.id}_line_${index}`,
      input.id,
      line.variantId,
      variant.internal_reference,
      variant.color_name,
      variant.size,
      line.quantity,
      line.quantity * 2999,
      input.now,
    );
  });

  return subtotalCents;
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
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  await store.seedLaunchCatalog(now);
  database
    .prepare("DELETE FROM inventory_movements WHERE idempotency_key = ?")
    .run("seed:variant_boxer_pourpre_s");

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
          `UPDATE inventory SET gift_reserve_quantity = physical_quantity + 1
          WHERE variant_id = ?`,
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

  const productionRoots = ["../app/", "../db/", "../lib/", "../worker/"];
  const forbiddenRegistrarConsumers = productionRoots
    .flatMap((relative) =>
      listSourceFiles(fileURLToPath(new URL(relative, import.meta.url))),
    )
    .filter(
      (path) =>
        !path.endsWith("verified-payment-event.ts") &&
        readFileSync(path, "utf8").includes(
          "registerVerifiedPaymentEventFromTrustedAdapter",
        ),
    );
  assert.deepEqual(forbiddenRegistrarConsumers, []);

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
  assert.doesNotMatch(storeCode, /verifyTestPaymentEvent|test_adapter/);

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
  const now = "2026-08-10T12:00:00.000Z";
  const variantId = "variant_boxer_pourpre_s";
  await store.seedLaunchCatalog(now);
  await store.createCart({
    id: "cart_reserve_gate",
    expiresAt: "2026-08-10T14:00:00.000Z",
    now,
  });
  const input = {
    reservationId: "reservation_reserve_gate",
    cartId: "cart_reserve_gate",
    variantId,
    quantity: 1,
    idempotencyKey: "reserve_gate",
    expiresAt: "2026-08-10T13:00:00.000Z",
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

test("concurrent buyers never oversell, including the last unit", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  const expiresAt = "2026-08-10T13:00:00.000Z";
  const variantId = "variant_boxer_lilas-bleu-clair_s";
  await store.seedLaunchCatalog(now);
  validateReserves(database, [variantId]);
  database
    .prepare("UPDATE inventory SET physical_quantity = 1 WHERE variant_id = ?")
    .run(variantId);
  await Promise.all([
    store.createCart({
      id: "cart_buyer_a",
      expiresAt: "2026-08-10T14:00:00.000Z",
      now,
    }),
    store.createCart({
      id: "cart_buyer_b",
      expiresAt: "2026-08-10T14:00:00.000Z",
      now,
    }),
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
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const position = await store.getInventoryPosition(variantId);
  assert.equal(position.activeReservedQuantity, 1);
  assert.equal(availableToSell(position), 0);
  database.close();
});

test("manual release and operational expiration are each idempotent", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  const variantId = "variant_boxer_rose-pale_m";
  await store.seedLaunchCatalog(now);
  validateReserves(database, [variantId]);
  await store.createCart({
    id: "cart_close_reservations",
    expiresAt: "2026-08-10T14:00:00.000Z",
    now,
  });
  for (const suffix of ["release", "expire"]) {
    await store.reserveStock({
      reservationId: `reservation_${suffix}`,
      cartId: "cart_close_reservations",
      variantId,
      quantity: 2,
      idempotencyKey: `reserve_${suffix}`,
      expiresAt: "2026-08-10T13:00:00.000Z",
      now,
    });
  }
  await store.releaseStock({
    reservationId: "reservation_release",
    idempotencyKey: "release_once",
    now: "2026-08-10T12:10:00.000Z",
  });
  await store.releaseStock({
    reservationId: "reservation_release",
    idempotencyKey: "release_once",
    now: "2026-08-10T12:10:00.000Z",
  });
  await assert.rejects(
    () =>
      store.expireReservation({
        reservationId: "reservation_expire",
        idempotencyKey: "expire_once",
        now: "2026-08-10T12:59:59.999Z",
      }),
    (error) =>
      error instanceof CommerceError && error.code === "RESERVATION_NOT_EXPIRED",
  );
  await store.expireReservation({
    reservationId: "reservation_expire",
    idempotencyKey: "expire_once",
    now: "2026-08-10T13:00:00.000Z",
  });
  await store.expireReservation({
    reservationId: "reservation_expire",
    idempotencyKey: "expire_once",
    now: "2026-08-10T13:00:00.000Z",
  });

  const position = await store.getInventoryPosition(variantId);
  assert.equal(position.activeReservedQuantity, 0);
  assert.equal(availableToSell(position), 103);
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM inventory_movements
        WHERE variant_id = ? AND kind = 'release'`,
      )
      .get(variantId).count,
    2,
  );
  database.close();
});

test("verified payment atomically converts every line once and writes outbox plus audit", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  const paidAt = "2026-08-10T12:10:00.000Z";
  const firstVariant = "variant_boxer_pourpre_m";
  const secondVariant = "variant_boxer_rose-pale_l";
  await store.seedLaunchCatalog(now);
  validateReserves(database, [firstVariant, secondVariant]);
  await store.createCart({
    id: "cart_paid",
    email: "client@example.com",
    expiresAt: "2026-08-10T14:00:00.000Z",
    now,
  });
  await Promise.all([
    store.reserveStock({
      reservationId: "reservation_paid_1",
      cartId: "cart_paid",
      variantId: firstVariant,
      quantity: 2,
      idempotencyKey: "reserve_paid_1",
      expiresAt: "2026-08-10T13:00:00.000Z",
      now,
    }),
    store.reserveStock({
      reservationId: "reservation_paid_2",
      cartId: "cart_paid",
      variantId: secondVariant,
      quantity: 1,
      idempotencyKey: "reserve_paid_2",
      expiresAt: "2026-08-10T13:00:00.000Z",
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
    { status: "processed", attempts: 2 },
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

test("payment mismatch rolls back webhook, payment, stock, order, outbox and audit together", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  const variantId = "variant_boxer_pourpre_l";
  await store.seedLaunchCatalog(now);
  validateReserves(database, [variantId]);
  await store.createCart({
    id: "cart_bad_payment",
    expiresAt: "2026-08-10T14:00:00.000Z",
    now,
  });
  await store.reserveStock({
    reservationId: "reservation_bad_payment",
    cartId: "cart_bad_payment",
    variantId,
    quantity: 1,
    idempotencyKey: "reserve_bad_payment",
    expiresAt: "2026-08-10T13:00:00.000Z",
    now,
  });
  insertPendingOrder(database, {
    id: "order_bad_payment",
    number: "AJ-TEST-BAD",
    cartId: "cart_bad_payment",
    now,
    lines: [{ variantId, quantity: 1 }],
  });
  const event = await createVerifiedEvent({
    providerEventId: "event_bad_amount",
    providerPaymentId: "payment_bad_amount",
    orderId: "order_bad_payment",
    amountCents: 1,
    occurredAt: "2026-08-10T12:10:00.000Z",
  });

  await assert.rejects(
    () => store.processPaymentSucceeded(event),
    (error) =>
      error instanceof CommerceError && error.code === "ORDER_PAYMENT_MISMATCH",
  );
  assert.deepEqual(
    {
      ...database
        .prepare("SELECT status FROM orders WHERE id = 'order_bad_payment'")
        .get(),
    },
    { status: "pending_payment" },
  );
  assert.equal((await store.getInventoryPosition(variantId)).activeReservedQuantity, 1);
  assert.equal((await store.getInventoryPosition(variantId)).soldQuantity, 0);
  for (const table of ["webhook_events", "payments", "email_outbox", "audit_log"]) {
    assert.equal(
      database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
      0,
      `${table} must roll back`,
    );
  }
  database.close();
});

test("expired reservations and order-cart mismatches cannot be converted", async () => {
  const { database, store } = createFixture();
  const now = "2026-08-10T12:00:00.000Z";
  const variantId = "variant_boxer_lilas-bleu-clair_l";
  await store.seedLaunchCatalog(now);
  validateReserves(database, [variantId]);
  await store.createCart({
    id: "cart_expired_sale",
    expiresAt: "2026-08-10T14:00:00.000Z",
    now,
  });
  await store.reserveStock({
    reservationId: "reservation_expired_sale",
    cartId: "cart_expired_sale",
    variantId,
    quantity: 1,
    idempotencyKey: "reserve_expired_sale",
    expiresAt: "2026-08-10T12:30:00.000Z",
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
    occurredAt: "2026-08-10T12:30:00.000Z",
  });
  await assert.rejects(
    () => store.processPaymentSucceeded(expiredEvent),
    (error) =>
      error instanceof CommerceError &&
      error.code === "INVALID_RESERVATION_TRANSITION",
  );

  await store.createCart({
    id: "cart_wrong_order",
    expiresAt: "2026-08-10T14:00:00.000Z",
    now,
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
    occurredAt: "2026-08-10T12:10:00.000Z",
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
