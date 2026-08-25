import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { launchVariantSeed } from "../db/seed.ts";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import {
  CLIENT_VALIDATED_PARCEL_MIGRATION,
} from "../lib/commerce/parcel-profiles.ts";
import {
  SYNTHETIC_DEMO_ADDRESS_FIXTURES,
  SYNTHETIC_DEMO_EMAIL,
  SYNTHETIC_DEMO_FIXTURE_VERSION,
  SYNTHETIC_DEMO_MIGRATION,
} from "../lib/preprod/synthetic-demo.ts";

const ORIGIN = "https://aj-luxury-preprod.example";
const drizzle = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrations = readdirSync(drizzle)
  .filter((name) => /^(?:000\d|0010|0011|0012|0013|0014)_.+\.sql$/.test(name))
  .sort();
const MULTICARRIER_FOUNDATION_MIGRATION = "0010_multicarrier_delivery_foundation.sql";
const SERVICE_POINT_REFERENCE_VAULT_MIGRATION = "0011_service_point_reference_vault.sql";
const PROVIDER_PRICED_DELIVERY_MIGRATION = "0012_provider_priced_delivery_quotes.sql";
const PROVIDER_PRICED_ORDER_MIGRATION = "0013_provider_priced_delivery_orders.sql";
const LATE_PAYMENT_REFUND_MIGRATION = "0014_late_payment_refund_compensation.sql";
const FROZEN_SYNTHETIC_STOCK = Object.freeze({
  variant_boxer_pourpre_s: 26,
  variant_boxer_pourpre_m: 103,
  variant_boxer_pourpre_l: 87,
  variant_boxer_pourpre_xl: 36,
  "variant_boxer_rose-pale_s": 26,
  "variant_boxer_rose-pale_m": 103,
  "variant_boxer_rose-pale_l": 87,
  "variant_boxer_rose-pale_xl": 36,
  "variant_boxer_lilas-bleu-clair_s": 26,
  "variant_boxer_lilas-bleu-clair_m": 102,
  "variant_boxer_lilas-bleu-clair_l": 88,
  "variant_boxer_lilas-bleu-clair_xl": 36,
});

class Statement {
  constructor(database, query, values = []) { this.database = database; this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.database, this.query, values); }
  async first() { return this.database.prepare(this.query).get(...this.values) ?? null; }
  async all() { return { success: true, results: this.database.prepare(this.query).all(...this.values), meta: { changes: 0 } }; }
  async run() {
    if (/^\s*(?:SELECT|WITH)\b/i.test(this.query)) return this.all();
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

class D1 {
  #tail = Promise.resolve();
  constructor(database) { this.database = database; this.queries = []; }
  prepare(query) {
    this.queries.push(query);
    return new Statement(this.database, query);
  }
  batch(statements) {
    const execute = () => this.#execute(statements);
    const result = this.#tail.then(execute, execute);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }
  async #execute(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class HostedLikeD1 extends D1 {
  prepare(query) {
    assert.doesNotMatch(
      query,
      /\bd1_migrations\b/,
      "the hosted Worker cannot inspect the Sites migration ledger",
    );
    return super.prepare(query);
  }
}

function applySql(database, name) {
  const source = readFileSync(`${drizzle}${name}`, "utf8");
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const statement of source.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function applyThrough(database, lastName) {
  for (const name of migrations) {
    applySql(database, name);
    if (name === lastName) break;
  }
}

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  return sqlite;
}

function recordMigration(sqlite) {
  sqlite.exec("CREATE TABLE d1_migrations (name TEXT PRIMARY KEY NOT NULL)");
  sqlite.prepare("INSERT INTO d1_migrations(name) VALUES (?)").run(SYNTHETIC_DEMO_MIGRATION);
}

function seedFrozenSyntheticCatalog(sqlite) {
  const variant = sqlite.prepare(
    `INSERT INTO variants (
      id,product_id,internal_reference,color_key,color_name,size,swatch,
      image_url,active,sort_order,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)`,
  );
  const inventory = sqlite.prepare(
    `INSERT INTO inventory (
      variant_id,physical_quantity,gift_reserve_quantity,
      safety_reserve_quantity,active_reserved_quantity,sold_quantity,
      reserves_validated,version,updated_at
    ) VALUES (?,?,0,0,0,0,0,0,?)`,
  );
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const now = "2026-08-13T08:00:00.000Z";
    sqlite.prepare(`INSERT INTO products (
      id,slug,name,status,price_cents,currency,created_at,updated_at
    ) VALUES ('product_apollon','apollon','Apollon','active',2999,'EUR',?,?)`).run(now, now);
    for (const seed of launchVariantSeed) {
      const quantity = FROZEN_SYNTHETIC_STOCK[seed.id];
      assert.ok(Number.isInteger(quantity), `missing frozen quantity for ${seed.id}`);
      variant.run(
        seed.id,
        seed.productId,
        seed.internalReference,
        seed.colorKey,
        seed.colorName,
        seed.size,
        seed.swatch,
        seed.imageUrl,
        seed.sortOrder,
        now,
        now,
      );
      inventory.run(seed.id, quantity, now);
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

async function runtime(lastMigration = LATE_PAYMENT_REFUND_MIGRATION) {
  const sqlite = database();
  applyThrough(sqlite, lastMigration);
  recordMigration(sqlite);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("synthetic-demo", `${process.pid}-${Date.now()}-${crypto.randomUUID()}`);
  const { default: worker } = await import(workerUrl.href);
  return { sqlite, d1: new D1(sqlite), worker };
}

function headers(session = {}, extra = {}) {
  return {
    Origin: ORIGIN,
    "Sec-Fetch-Site": "same-origin",
    ...(session.cookie ? { Cookie: session.cookie } : {}),
    ...(session.csrf ? { "X-CSRF-Token": session.csrf } : {}),
    ...extra,
  };
}

async function invoke(context, pathname, options = {}, env = {}) {
  return context.worker.fetch(
    new Request(`${ORIGIN}${pathname}`, options),
    {
      APP_ENV: "preproduction",
      PREPROD_ORIGIN: ORIGIN,
      PREPROD_DEMO_DATASET: SYNTHETIC_DEMO_FIXTURE_VERSION,
      DB: context.d1,
      ...env,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function session(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") ?? "").split(/,(?=\s*__Host-aj_)/);
  const cookie = values.find((value) => value.startsWith("__Host-aj_cart="))?.split(";", 1)[0];
  const csrfCookie = values.find((value) => value.startsWith("__Host-aj_cart_csrf="))?.split(";", 1)[0];
  assert.ok(cookie && csrfCookie);
  return { cookie: `${cookie}; ${csrfCookie}`, csrf: csrfCookie.split("=", 2)[1] };
}

function mutation(sessionValue, idempotencyKey, body) {
  const options = {
    method: "POST",
    headers: headers(sessionValue, { "Idempotency-Key": idempotencyKey }),
  };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  return options;
}

test("0008 installs fresh or frozen-compatible data atomically and rejects newer or incompatible state", async () => {
  for (const compatible of [false, true]) {
    const sqlite = database();
    applyThrough(sqlite, "0007_transactional_preprod_order_payment.sql");
    if (compatible) {
      seedFrozenSyntheticCatalog(sqlite);
    }
    applySql(sqlite, SYNTHETIC_DEMO_MIGRATION);
    assert.deepEqual(
      sqlite.prepare("SELECT dataset_kind,fixture_version,expires_at FROM preprod_demo_dataset").get(),
      Object.assign(Object.create(null), {
        dataset_kind: "synthetic-demo",
        fixture_version: "aj-demo-v1",
        expires_at: "2026-09-30T23:59:59.999Z",
      }),
    );
    assert.deepEqual(sqlite.prepare("SELECT COUNT(*) variants,SUM(reserves_validated) validated FROM inventory").get(), Object.assign(Object.create(null), { variants: 12, validated: 12 }));
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM shipping_zone_configurations WHERE status='active'").get().count, 4);
    assert.throws(() => sqlite.exec("UPDATE preprod_demo_dataset SET expires_at='2099-01-01T00:00:00.000Z'"), /immutable/);
    sqlite.close();
  }

  const newerLaunchSeed = database();
  applyThrough(newerLaunchSeed, "0007_transactional_preprod_order_payment.sql");
  await new D1CommerceStore(new D1(newerLaunchSeed)).seedLaunchCatalog("2026-08-25T14:07:12.000Z");
  assert.throws(() => applySql(newerLaunchSeed, SYNTHETIC_DEMO_MIGRATION));
  assert.equal(newerLaunchSeed.prepare("SELECT COUNT(*) count FROM sqlite_schema WHERE name='preprod_demo_dataset'").get().count, 0);
  assert.equal(newerLaunchSeed.prepare("SELECT SUM(physical_quantity) quantity FROM inventory").get().quantity, 756);
  assert.equal(newerLaunchSeed.prepare("SELECT COUNT(*) count FROM inventory WHERE physical_quantity=63").get().count, 12);
  newerLaunchSeed.close();

  const incompatible = database();
  applyThrough(incompatible, "0007_transactional_preprod_order_payment.sql");
  incompatible.exec(`INSERT INTO customers (id,email,accepts_marketing,created_at,updated_at)
    VALUES ('customer_real','real@example.com',0,'2026-08-13T08:00:00.000Z','2026-08-13T08:00:00.000Z')`);
  assert.throws(() => applySql(incompatible, SYNTHETIC_DEMO_MIGRATION));
  assert.equal(incompatible.prepare("SELECT COUNT(*) count FROM sqlite_schema WHERE name='preprod_demo_dataset'").get().count, 0);
  assert.equal(incompatible.prepare("SELECT COUNT(*) count FROM products").get().count, 0);
  incompatible.close();
});

test("tracked migration replay is a no-op and 0000-0007 stay byte-identical", () => {
  const expected = {
    "0000_flimsy_rhino.sql": "64ec5b38a5c5e33b235f65ba6f5524fa26961a50af33a01c219af4080807435b",
    "0001_lock_cart_line_price_provenance.sql": "a28fe428ba0aeb12bd6eb254082f49fc0735541cbc315a28e5cd137ee57da045",
    "0002_lock_order_line_snapshots.sql": "7a7498959ef379096f5f2aec132a80ab30645186bd2add4b09634cf9599ef566",
    "0003_identity_access.sql": "97497dbef41179a669b2ff58286ae9e0986cd8fcb2c76e97ae696f7fd7b1fc5a",
    "0004_email_outbox_data_rights.sql": "fdf9c27b57d24c931d234bf8651e83599d10c0e8adfc28b188d165f01c9b59ef",
    "0005_fulfillment_returns_refunds.sql": "2eff61c2caa307e094f9cf64885816beff5f476dbbfe52a9988560a57faa1008",
    "0006_allow_bounded_expired_cart_purge.sql": "3cbd7390bb8834305b11f6d791583a86f3c6fe7ba9be23fc91e1e1ea98203a52",
    "0007_transactional_preprod_order_payment.sql": "3b58d9e49e5154c855c2620fea80e733c8953ec713e75a2e8c5b31432840d838",
  };
  for (const [name, digest] of Object.entries(expected)) {
    const actual = createHash("sha256").update(readFileSync(`${drizzle}${name}`)).digest("hex");
    assert.equal(actual, digest, `${name} changed`);
  }
  const sqlite = database();
  sqlite.exec("CREATE TABLE migration_replay(name TEXT PRIMARY KEY)");
  for (const name of migrations) {
    if (!sqlite.prepare("SELECT 1 FROM migration_replay WHERE name=?").get(name)) {
      applySql(sqlite, name);
      sqlite.prepare("INSERT INTO migration_replay(name) VALUES (?)").run(name);
    }
  }
  const before = sqlite.prepare("SELECT COUNT(*) count FROM shipping_zone_configurations").get().count;
  for (const name of migrations) if (!sqlite.prepare("SELECT 1 FROM migration_replay WHERE name=?").get(name)) applySql(sqlite, name);
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM shipping_zone_configurations").get().count, before);
  sqlite.close();
});

test("synthetic health is honest and missing flag or expiration fails closed with zero writes", async () => {
  const context = await runtime();
  const health = await invoke(context, "/api/preprod/health");
  assert.equal(health.status, 200);
  const payload = await health.json();
  assert.equal(payload.capabilities.launchReadiness, false);
  assert.equal(payload.capabilities.payment, false);
  assert.equal(payload.capabilities.carrier, false);
  assert.equal(payload.capabilities.emailDelivery, false);
  assert.equal(payload.capabilities.reservesValidated, false);
  assert.equal(payload.capabilities.syntheticReservesReady, true);
  assert.equal(payload.capabilities.stockSimulation, true);
  assert.equal(payload.syntheticDataset.active, true);
  assert.equal(payload.latestMigration, LATE_PAYMENT_REFUND_MIGRATION);
  assert.equal(context.d1.queries.some((query) => /d1_migrations/.test(query)), false);

  const missingFlagHealth = await invoke(
    context,
    "/api/preprod/health",
    {},
    { PREPROD_DEMO_DATASET: undefined },
  );
  assert.equal(missingFlagHealth.status, 503);
  const missingFlagPayload = await missingFlagHealth.json();
  assert.equal(missingFlagPayload.syntheticDataset.reason, "flag-disabled");
  assert.equal(missingFlagPayload.latestMigration, null);

  const before = context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count;
  const missingFlag = await invoke(context, "/api/preprod/cart", { method: "POST", headers: headers() }, { PREPROD_DEMO_DATASET: undefined });
  assert.equal(missingFlag.status, 503);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count, before);

  const RealDate = globalThis.Date;
  class ExpiredDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : ["2026-10-01T00:00:00.000Z"])); }
    static now() { return RealDate.parse("2026-10-01T00:00:00.000Z"); }
  }
  globalThis.Date = ExpiredDate;
  try {
    const expired = await invoke(context, "/api/preprod/cart", { method: "POST", headers: headers() });
    assert.equal(expired.status, 503);
    assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count, before);
  } finally {
    globalThis.Date = RealDate;
  }
  context.sqlite.close();
});

test("health stays closed through 0013 and becomes ready only with exact 0014", async () => {
  const migration0008 = await runtime(SYNTHETIC_DEMO_MIGRATION);
  const before = migration0008.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count;
  const unavailable = await invoke(migration0008, "/api/preprod/health");
  assert.equal(unavailable.status, 503);
  const unavailablePayload = await unavailable.json();
  assert.equal(unavailablePayload.status, "unavailable");
  assert.equal(unavailablePayload.syntheticDataset.reason, "installation-proof-invalid");
  assert.equal(unavailablePayload.latestMigration, SYNTHETIC_DEMO_MIGRATION);
  assert.equal(unavailablePayload.capabilities.shippingQuotes, false);
  const closedCart = await invoke(migration0008, "/api/preprod/cart", {
    method: "POST",
    headers: headers(),
  });
  assert.equal(closedCart.status, 503);
  assert.equal(
    migration0008.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count,
    before,
  );
  migration0008.sqlite.close();

  const migration0009 = await runtime(CLIENT_VALIDATED_PARCEL_MIGRATION);
  const notYetReady = await invoke(migration0009, "/api/preprod/health");
  assert.equal(notYetReady.status, 503);
  assert.equal((await notYetReady.json()).latestMigration, CLIENT_VALIDATED_PARCEL_MIGRATION);
  migration0009.sqlite.close();

  const migration0010 = await runtime(MULTICARRIER_FOUNDATION_MIGRATION);
  const stillClosed = await invoke(migration0010, "/api/preprod/health");
  assert.equal(stillClosed.status, 503);
  assert.equal((await stillClosed.json()).latestMigration, CLIENT_VALIDATED_PARCEL_MIGRATION);
  migration0010.sqlite.close();

  const migration0011 = await runtime(SERVICE_POINT_REFERENCE_VAULT_MIGRATION);
  const missingPricingContract = await invoke(migration0011, "/api/preprod/health");
  assert.equal(missingPricingContract.status, 503);
  assert.equal((await missingPricingContract.json()).latestMigration, CLIENT_VALIDATED_PARCEL_MIGRATION);
  migration0011.sqlite.close();

  const migration0012 = await runtime(PROVIDER_PRICED_DELIVERY_MIGRATION);
  const missingOrderContract = await invoke(migration0012, "/api/preprod/health");
  assert.equal(missingOrderContract.status, 503);
  assert.equal((await missingOrderContract.json()).latestMigration, CLIENT_VALIDATED_PARCEL_MIGRATION);
  migration0012.sqlite.close();

  const migration0013 = await runtime(PROVIDER_PRICED_ORDER_MIGRATION);
  const missingRefundContract = await invoke(migration0013, "/api/preprod/health");
  assert.equal(missingRefundContract.status, 503);
  assert.equal((await missingRefundContract.json()).latestMigration, PROVIDER_PRICED_ORDER_MIGRATION);
  migration0013.sqlite.close();

  const migration0014 = await runtime();
  const ready = await invoke(migration0014, "/api/preprod/health");
  assert.equal(ready.status, 200);
  const readyPayload = await ready.json();
  assert.equal(readyPayload.syntheticDataset.reason, "ready");
  assert.equal(readyPayload.latestMigration, LATE_PAYMENT_REFUND_MIGRATION);
  assert.equal(readyPayload.capabilities.shippingQuoteSimulation, true);
  assert.equal(readyPayload.capabilities.deliveryConnectorReady, false);
  assert.equal(readyPayload.capabilities.deliveryProviderConnected, false);
  assert.equal(readyPayload.capabilities.realShippingRates, false);
  assert.equal(readyPayload.capabilities.realShippingLabels, false);
  assert.equal(readyPayload.capabilities.deliveryLive, false);
  migration0014.sqlite.close();
});

test("hosted-like exact 0014 health never reads the Sites ledger", async () => {
  const context = await runtime();
  context.d1 = new HostedLikeD1(context.sqlite);

  const health = await invoke(context, "/api/preprod/health");
  assert.equal(health.status, 200);
  const payload = await health.json();
  assert.equal(payload.latestMigration, LATE_PAYMENT_REFUND_MIGRATION);
  assert.equal(payload.syntheticDataset.reason, "ready");
  assert.deepEqual(
    {
      shippingQuoteSimulation: payload.capabilities.shippingQuoteSimulation,
      orderSimulation: payload.capabilities.orderSimulation,
      paymentTestSimulation: payload.capabilities.paymentTestSimulation,
      emailCaptureSimulation: payload.capabilities.emailCaptureSimulation,
      stockSimulation: payload.capabilities.stockSimulation,
      shippingSimulation: payload.capabilities.shippingSimulation,
      payment: payload.capabilities.payment,
      emailDelivery: payload.capabilities.emailDelivery,
      carrier: payload.capabilities.carrier,
      deliveryConnectorReady: payload.capabilities.deliveryConnectorReady,
      deliveryProviderConnected: payload.capabilities.deliveryProviderConnected,
      realShippingRates: payload.capabilities.realShippingRates,
      realShippingLabels: payload.capabilities.realShippingLabels,
      deliveryLive: payload.capabilities.deliveryLive,
      launchReadiness: payload.capabilities.launchReadiness,
    },
    {
      shippingQuoteSimulation: true,
      orderSimulation: true,
      paymentTestSimulation: true,
      emailCaptureSimulation: true,
      stockSimulation: true,
      shippingSimulation: true,
      payment: false,
      emailDelivery: false,
      carrier: false,
      deliveryConnectorReady: false,
      deliveryProviderConnected: false,
      realShippingRates: false,
      realShippingLabels: false,
      deliveryLive: false,
      launchReadiness: false,
    },
  );
  assert.equal(
    context.d1.queries.some((query) => /\bd1_migrations\b/.test(query)),
    false,
  );
  context.sqlite.close();
});

test("0010 inventory rejects missing, extra, renamed and prefix-colliding objects", async () => {
  const mutations = [
    "DROP TABLE shipping_document_metadata",
    "DROP INDEX ux_delivery_options_quote",
    "DROP TRIGGER trg_delivery_option_select_once",
    "CREATE TABLE delivery_option_snapshots_shadow (id TEXT)",
    "CREATE INDEX unrelated_extra_index ON delivery_option_snapshots (carrier_code)",
    `DROP INDEX ux_delivery_options_quote;
      CREATE UNIQUE INDEX renamed_quote_index
      ON delivery_option_snapshots (shipping_quote_id)`,
    "CREATE INDEX ux_delivery_prefix_collision ON carts (id)",
    `CREATE TRIGGER unrelated_extra_trigger
      BEFORE INSERT ON delivery_service_point_snapshots BEGIN SELECT 1; END`,
    "CREATE TABLE DELIVERY_OPTION_SNAPSHOTS_SHADOW (id TEXT)",
    "CREATE INDEX UX_DELIVERY_PREFIX_COLLISION ON carts (id)",
    `DROP TRIGGER trg_delivery_option_select_once;
      CREATE TRIGGER trg_delivery_option_select_once
      BEFORE INSERT ON carts BEGIN SELECT 1; END`,
    `DROP INDEX ux_delivery_options_quote;
      CREATE UNIQUE INDEX ux_delivery_options_quote ON carts (id)`,
  ];
  for (const mutation of mutations) {
    const context = await runtime();
    context.sqlite.exec(mutation);
    const before = context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count;

    const health = await invoke(context, "/api/preprod/health");
    assert.equal(health.status, 503, mutation);
    const payload = await health.json();
    assert.equal(payload.syntheticDataset.reason, "installation-proof-invalid");
    assert.equal(payload.latestMigration, CLIENT_VALIDATED_PARCEL_MIGRATION);

    const cart = await invoke(context, "/api/preprod/cart", {
      method: "POST",
      headers: headers(),
    });
    assert.equal(cart.status, 503);
    assert.equal(
      context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count,
      before,
    );
    assert.equal(
      context.d1.queries.some((query) => /\bd1_migrations\b/.test(query)),
      false,
    );
    context.sqlite.close();
  }
});

test("missing, extra or renamed 0009 schema objects fail closed without writes", async () => {
  const mutations = [
    "DROP TABLE shipping_quote_parcel_snapshots",
    `CREATE TRIGGER trg_shipping_quote_parcel_snapshot_unexpected
      BEFORE INSERT ON shipping_quote_parcel_snapshots BEGIN SELECT 1; END`,
    `DROP TRIGGER trg_shipping_quote_parcel_snapshot_matches_cart;
      CREATE TRIGGER trg_shipping_quote_parcel_snapshot_cart_guard_renamed
      BEFORE INSERT ON shipping_quote_parcel_snapshots BEGIN SELECT 1; END`,
  ];
  for (const mutation of mutations) {
    const context = await runtime();
    context.sqlite.exec(mutation);
    const before = context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count;
    const health = await invoke(context, "/api/preprod/health");
    assert.equal(health.status, 503);
    const payload = await health.json();
    assert.equal(payload.syntheticDataset.reason, "installation-proof-invalid");
    assert.equal(payload.latestMigration, SYNTHETIC_DEMO_MIGRATION);
    assert.equal(payload.capabilities.shippingQuotes, false);
    const cart = await invoke(context, "/api/preprod/cart", {
      method: "POST",
      headers: headers(),
    });
    assert.equal(cart.status, 503);
    assert.equal(
      context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count,
      before,
    );
    context.sqlite.close();
  }
});

test("missing, extra or renamed synthetic guards invalidate proof with zero writes", async () => {
  const mutations = [
    "DROP TRIGGER trg_preprod_demo_payment_active_insert",
    `CREATE TRIGGER trg_preprod_demo_unexpected_guard
      BEFORE INSERT ON payments BEGIN SELECT 1; END`,
    `DROP TRIGGER trg_preprod_demo_payment_active_insert;
      CREATE TRIGGER trg_preprod_demo_payment_guard_renamed
      BEFORE INSERT ON payments BEGIN SELECT 1; END`,
  ];
  for (const mutation of mutations) {
    const context = await runtime();
    context.sqlite.exec(mutation);
    const before = context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count;

    const health = await invoke(context, "/api/preprod/health");
    assert.equal(health.status, 503);
    const payload = await health.json();
    assert.equal(payload.syntheticDataset.reason, "installation-proof-invalid");
    assert.equal(payload.latestMigration, null);

    const cart = await invoke(context, "/api/preprod/cart", {
      method: "POST",
      headers: headers(),
    });
    assert.equal(cart.status, 503);
    assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count, before);
    assert.equal(context.d1.queries.some((query) => /d1_migrations/.test(query)), false);
    context.sqlite.close();
  }
});

test("an altered future sentinel expiry is invalid and writes nothing", async () => {
  const context = await runtime();
  context.sqlite.exec("DROP TRIGGER trg_preprod_demo_dataset_immutable_update");
  context.sqlite.exec("PRAGMA ignore_check_constraints=ON");
  context.sqlite.exec(
    "UPDATE preprod_demo_dataset SET expires_at='2099-12-31T23:59:59.999Z'",
  );
  context.sqlite.exec("PRAGMA ignore_check_constraints=OFF");
  const before = context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count;

  const health = await invoke(context, "/api/preprod/health");
  assert.equal(health.status, 503);
  const payload = await health.json();
  assert.equal(payload.syntheticDataset.reason, "sentinel-invalid");
  assert.equal(payload.latestMigration, null);

  const cart = await invoke(context, "/api/preprod/cart", {
    method: "POST",
    headers: headers(),
  });
  assert.equal(cart.status, 503);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count, before);
  context.sqlite.close();
});

test("four locked fixtures work and free-form address is rejected before persistence", async () => {
  for (const fixture of SYNTHETIC_DEMO_ADDRESS_FIXTURES) {
    const context = await runtime();
    const opened = await invoke(context, "/api/preprod/cart", { method: "POST", headers: headers() });
    const activeSession = session(opened);
    const line = await invoke(context, "/api/preprod/cart/lines/variant_boxer_pourpre_m", {
      method: "PUT",
      headers: headers(activeSession, { "Content-Type": "application/json" }),
      body: JSON.stringify({ quantity: 1 }),
    });
    assert.equal(line.status, 200);
    const quote = await invoke(context, "/api/preprod/checkout/shipping-quote", mutation(activeSession, `quote-fixture-${fixture.zone}-0001`, { address: fixture.address }));
    assert.equal(quote.status, 200, `${fixture.zone}: ${await quote.text()}`);
    context.sqlite.close();
  }

  const context = await runtime();
  const activeSession = session(await invoke(context, "/api/preprod/cart", { method: "POST", headers: headers() }));
  await invoke(context, "/api/preprod/cart/lines/variant_boxer_pourpre_m", {
    method: "PUT", headers: headers(activeSession, { "Content-Type": "application/json" }), body: JSON.stringify({ quantity: 1 }),
  });
  const changed = { ...SYNTHETIC_DEMO_ADDRESS_FIXTURES[0].address, line1: "2 REAL STREET" };
  const rejected = await invoke(context, "/api/preprod/checkout/shipping-quote", mutation(activeSession, "quote-free-address-0001", { address: changed }));
  assert.equal(rejected.status, 400);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM shipping_quotes").get().count, 0);
  context.sqlite.close();
});

test("cart to quote to order to test payment is durable, simulated and carries no real PII", async () => {
  const context = await runtime();
  const activeSession = session(await invoke(context, "/api/preprod/cart", { method: "POST", headers: headers() }));
  const line = await invoke(context, "/api/preprod/cart/lines/variant_boxer_pourpre_m", {
    method: "PUT", headers: headers(activeSession, { "Content-Type": "application/json" }), body: JSON.stringify({ quantity: 1 }),
  });
  assert.equal(line.status, 200);
  const address = SYNTHETIC_DEMO_ADDRESS_FIXTURES[0].address;
  const quoteResponse = await invoke(context, "/api/preprod/checkout/shipping-quote", mutation(activeSession, "quote-e2e-synthetic-0001", { address }));
  assert.equal(quoteResponse.status, 200);
  const quote = (await quoteResponse.json()).data;
  const optionId = `option_${quote.quoteId.slice("quote_".length)}`;
  const selectedOption = await invoke(context, "/api/preprod/checkout/delivery-options/select", mutation(
    activeSession,
    "delivery-select-e2e-synthetic-0001",
    { address, optionId },
  ));
  assert.equal(selectedOption.status, 200);
  assert.throws(() => context.sqlite.exec(`INSERT INTO shipping_quotes (
    id,cart_id,cart_fingerprint,cart_revision,configuration_id,
    shipping_address_json,shipping_address_fingerprint,provider_quote_reference,
    provider_receipt_fingerprint,amount_cents,currency,estimated_days_min,
    estimated_days_max,duties_terms,expires_at,selected_at,created_at
  ) SELECT 'quote_direct_free_form',cart_id,cart_fingerprint,cart_revision,
    configuration_id,'{"countryCode":"FR","postalCode":"12345","regionCode":null}',
    shipping_address_fingerprint,NULL,NULL,amount_cents,currency,
    estimated_days_min,estimated_days_max,duties_terms,expires_at,NULL,created_at
  FROM shipping_quotes WHERE id='${quote.quoteId}'`), /preprod_demo_dataset_inactive/);
  const wrongEmail = await invoke(context, "/api/preprod/checkout/order", mutation(activeSession, "order-wrong-email-0001", {
    quoteId: quote.quoteId, address, email: "other@demo.invalid",
    termsAccepted: true, privacyAccepted: true, simulationAcknowledged: true,
  }));
  assert.equal(wrongEmail.status, 400, await wrongEmail.clone().text());
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM orders").get().count, 0);
  const orderResponse = await invoke(context, "/api/preprod/checkout/order", mutation(activeSession, "order-e2e-synthetic-0001", {
    quoteId: quote.quoteId, address, email: SYNTHETIC_DEMO_EMAIL,
    termsAccepted: true, privacyAccepted: true, simulationAcknowledged: true,
  }));
  assert.equal(orderResponse.status, 200);
  const order = (await orderResponse.json()).data;
  assert.equal(order.status, "pending_payment");
  const paymentResponse = await invoke(context, "/api/preprod/checkout/test-payment", mutation(activeSession, "payment-e2e-synthetic-0001"));
  assert.equal(paymentResponse.status, 200);
  const paid = (await paymentResponse.json()).data;
  assert.equal(paid.status, "paid");
  assert.equal(paid.debited, false);
  assert.equal(paid.emailSent, false);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM payments WHERE provider='test' AND status='succeeded'").get().count, 1);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM email_outbox WHERE status='pending' AND sent_at IS NULL").get().count, 1);
  assert.doesNotMatch(JSON.stringify(paid), /quote_|order_[0-9a-f]|shipping_address|fingerprint|@demo\.invalid/i);
  assert.doesNotMatch(context.sqlite.prepare("SELECT shipping_address_json value FROM orders").get().value, /@|example\.com/i);
  context.sqlite.close();
});

test("D1 triggers stop critical writes after synthetic dataset expiry", async () => {
  const context = await runtime();
  context.sqlite.exec("DROP TRIGGER trg_preprod_demo_dataset_immutable_update");
  context.sqlite.exec("PRAGMA ignore_check_constraints=ON");
  context.sqlite.exec("UPDATE preprod_demo_dataset SET expires_at='2026-08-13T00:00:00.000Z'");
  context.sqlite.exec("PRAGMA ignore_check_constraints=OFF");
  const before = context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count;
  const closed = await invoke(context, "/api/preprod/cart", { method: "POST", headers: headers() });
  assert.equal(closed.status, 503);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count, before);
  assert.throws(() => context.sqlite.exec(`INSERT INTO carts (
    id,status,currency,expires_at,created_at,updated_at
  ) VALUES ('cart_after_expiry','open','EUR','2026-08-13T00:10:00.000Z',
    '2026-08-13T00:00:00.000Z','2026-08-13T00:00:00.000Z')`),
  /preprod_demo_dataset_inactive|fulfillment_quote_mismatch/);
  assert.throws(() => context.sqlite.exec(`INSERT INTO shipping_quotes (
    id,cart_id,cart_fingerprint,cart_revision,configuration_id,
    shipping_address_json,shipping_address_fingerprint,provider_quote_reference,
    provider_receipt_fingerprint,amount_cents,currency,estimated_days_min,
    estimated_days_max,duties_terms,expires_at,selected_at,created_at
  ) VALUES ('quote_expired','missing_cart','${"a".repeat(64)}',0,
    'config_synthetic_demo_eu_v1',
    '{"countryCode":"FR","postalCode":"00000","regionCode":null}',
    '${"b".repeat(64)}',NULL,NULL,700,'EUR',2,4,'EU_INCLUDED',
    '2026-08-13T00:10:00.000Z',NULL,'2026-08-13T00:00:00.000Z')`),
  /preprod_demo_dataset_inactive|fulfillment_quote_mismatch/);
  context.sqlite.close();
});
