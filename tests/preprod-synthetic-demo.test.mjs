import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import {
  SYNTHETIC_DEMO_ADDRESS_FIXTURES,
  SYNTHETIC_DEMO_EMAIL,
  SYNTHETIC_DEMO_FIXTURE_VERSION,
  SYNTHETIC_DEMO_MIGRATION,
} from "../lib/preprod/synthetic-demo.ts";

const ORIGIN = "https://aj-luxury-preprod.example";
const drizzle = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrations = readdirSync(drizzle).filter((name) => /^000\d_.+\.sql$/.test(name)).sort();

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
  constructor(database) { this.database = database; }
  prepare(query) { return new Statement(this.database, query); }
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

async function runtime() {
  const sqlite = database();
  for (const name of migrations) applySql(sqlite, name);
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

test("0008 installs fresh or exact-compatible data atomically and rejects incompatible state", async () => {
  for (const compatible of [false, true]) {
    const sqlite = database();
    applyThrough(sqlite, "0007_transactional_preprod_order_payment.sql");
    if (compatible) {
      await new D1CommerceStore(new D1(sqlite)).seedLaunchCatalog("2026-08-13T08:00:00.000Z");
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
  /preprod_demo_dataset_inactive/);
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
  /preprod_demo_dataset_inactive/);
  context.sqlite.close();
});
