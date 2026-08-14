import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import { normalizeShippingAddress } from "../lib/commerce/fulfillment-domain.ts";

const ORIGIN = "https://aj-luxury-preprod.example";
const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrationPaths = readdirSync(drizzleDirectory)
  .filter((name) => /^000(?:[0-7]|9)_.+\.sql$/.test(name))
  .sort()
  .map((name) => `${drizzleDirectory}${name}`);

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
    if (
      this.query.includes("FROM shipping_quotes WHERE id = ?") &&
      typeof this.database.__quoteReadBarrier === "function"
    ) {
      await this.database.__quoteReadBarrier();
    }
    return this.database.prepare(this.query).get(...this.values) ?? null;
  }
  async all() {
    return { success: true, results: this.database.prepare(this.query).all(...this.values), meta: { changes: 0 } };
  }
  async run() {
    if (/^\s*(?:SELECT|WITH)\b/i.test(this.query)) {
      return { success: true, results: this.database.prepare(this.query).all(...this.values), meta: { changes: 0 } };
    }
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
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
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }
  async #runBatch(statements) {
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

function applyMigrations(database) {
  for (const path of migrationPaths) {
    for (const statement of readFileSync(path, "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
}

async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  applyMigrations(sqlite);
  const d1 = new SQLiteD1Database(sqlite);
  await new D1CommerceStore(d1).seedLaunchCatalog(new Date().toISOString());
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("shipping-api", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return { sqlite, d1, worker };
}

function headers(session = {}, overrides = {}) {
  return {
    Origin: ORIGIN,
    "Sec-Fetch-Site": "same-origin",
    ...(session.cookie ? { Cookie: session.cookie } : {}),
    ...(session.csrf ? { "X-CSRF-Token": session.csrf } : {}),
    ...overrides,
  };
}

function cookies(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") ?? "").split(/,(?=\s*__Host-aj_)/);
  const session = values.find((value) => value.startsWith("__Host-aj_cart="));
  const csrf = values.find((value) => value.startsWith("__Host-aj_cart_csrf="));
  assert.ok(session && csrf);
  const sessionPair = session.split(";", 1)[0];
  const csrfPair = csrf.split(";", 1)[0];
  return {
    cookie: `${sessionPair}; ${csrfPair}`,
    csrf: csrfPair.split("=", 2)[1],
  };
}

async function invoke(context, pathname, options = {}) {
  return context.worker.fetch(
    new Request(`${ORIGIN}${pathname}`, options),
    {
      APP_ENV: options.environment ?? "preproduction",
      PREPROD_ORIGIN: ORIGIN,
      DB: context.d1,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function cartWithLine(context, variantId = "variant_boxer_pourpre_m", quantity = 1) {
  const opened = await invoke(context, "/api/preprod/cart", {
    method: "POST",
    headers: headers(),
  });
  assert.equal(opened.status, 201);
  const session = cookies(opened);
  const line = await invoke(context, `/api/preprod/cart/lines/${variantId}`, {
    method: "PUT",
    headers: headers(session, { "Content-Type": "application/json" }),
    body: JSON.stringify({ quantity }),
  });
  assert.equal(line.status, 200);
  return session;
}

function activate(context, zone, priceCents = 1200) {
  const id = `config_${zone.toLowerCase()}_api`;
  const created = "2026-08-13T10:00:00.000Z";
  const activated = "2026-08-13T10:00:01.000Z";
  context.sqlite.prepare(`INSERT INTO shipping_zone_configurations (
    id, zone, version, status, created_at, updated_at
  ) VALUES (?, ?, 1, 'draft', ?, ?)`).run(id, zone, created, created);
  context.sqlite.prepare(`UPDATE shipping_zone_configurations SET
    status='active', service_code='fixture-service', price_cents=?,
    estimated_days_min=2, estimated_days_max=5, duties_terms=?,
    parcel_code='fixture-parcel', parcel_weight_grams=250,
    parcel_length_mm=240, parcel_width_mm=180, parcel_height_mm=40,
    origin_country_code='FR', customs_hs_code='610711',
    activated_at=?, updated_at=? WHERE id=?`).run(
    priceCents,
    zone === "EU" ? "EU_INCLUDED" : "DAP",
    activated,
    activated,
    id,
  );
}

function quoteRequest(session, address, key = "quote-attempt-00000001", overrides = {}) {
  return {
    method: "POST",
    headers: headers(session, {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      ...(overrides.headers ?? {}),
    }),
    body: JSON.stringify({ address }),
    ...overrides,
  };
}

const france = Object.freeze({
  recipient: "Ada Test",
  line1: "1 rue du Test",
  postalCode: "75001",
  city: "Paris",
  countryCode: "FR",
});

test("shipping quote fails closed until a complete active runtime configuration exists", async () => {
  const context = await fixture();
  const session = await cartWithLine(context);
  const response = await invoke(
    context,
    "/api/preprod/checkout/shipping-quote",
    quoteRequest(session, france),
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "CONFIGURATION_UNAVAILABLE");
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) AS count FROM shipping_quotes").get().count, 0);
  context.sqlite.close();
});

test("preproduction order and payment simulation are session-bound, strict and never send", async () => {
  const context = await fixture();
  activate(context, "EU", 1200);
  context.sqlite.exec("UPDATE inventory SET reserves_validated=1");
  const session = await cartWithLine(context);
  const quoteResponse = await invoke(
    context,
    "/api/preprod/checkout/shipping-quote",
    quoteRequest(session, france, "quote-attempt-order-flow"),
  );
  assert.equal(quoteResponse.status, 200);
  const quote = (await quoteResponse.json()).data;
  const orderBody = {
    quoteId: quote.quoteId,
    address: france,
    email: "client@demo.invalid",
    termsAccepted: true,
    privacyAccepted: true,
    simulationAcknowledged: true,
  };
  const createRequest = {
    method: "POST",
    headers: headers(session, {
      "Content-Type": "application/json",
      "Idempotency-Key": "order-attempt-api-gate-c",
    }),
    body: JSON.stringify(orderBody),
  };
  const created = await invoke(context, "/api/preprod/checkout/order", createRequest);
  assert.equal(created.status, 200);
  const createdPayload = (await created.json()).data;
  assert.deepEqual(Object.keys(createdPayload).sort(), [
    "createdAt", "currency", "debited", "emailCaptured", "emailSent",
    "lines", "orderNumber", "paidAt", "paymentMode", "shippingCents",
    "simulation", "status", "subtotalCents", "totalCents",
  ].sort());
  assert.equal(createdPayload.status, "pending_payment");
  assert.equal(createdPayload.debited, false);
  assert.doesNotMatch(
    JSON.stringify(createdPayload),
    /Ada Test|rue du Test|demo\.invalid|quote_|order_[0-9a-f]/i,
  );
  const replay = await invoke(context, "/api/preprod/checkout/order", createRequest);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { data: createdPayload });

  const changedEmail = await invoke(context, "/api/preprod/checkout/order", {
    ...createRequest,
    body: JSON.stringify({ ...orderBody, email: "other@demo.invalid" }),
  });
  assert.equal(changedEmail.status, 409);
  const realEmail = await invoke(context, "/api/preprod/checkout/order", {
    ...createRequest,
    headers: headers(session, {
      "Content-Type": "application/json",
      "Idempotency-Key": "order-attempt-api-real-email",
    }),
    body: JSON.stringify({ ...orderBody, email: "real@example.com" }),
  });
  assert.equal(realEmail.status, 400);
  const extraField = await invoke(context, "/api/preprod/checkout/order", {
    ...createRequest,
    headers: headers(session, {
      "Content-Type": "application/json",
      "Idempotency-Key": "order-attempt-api-extra-field",
    }),
    body: JSON.stringify({ ...orderBody, cardNumber: "4111111111111111" }),
  });
  assert.equal(extraField.status, 400);
  const compressed = await invoke(context, "/api/preprod/checkout/order", {
    ...createRequest,
    headers: headers(session, {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "Idempotency-Key": "order-attempt-api-compressed",
    }),
  });
  assert.equal(compressed.status, 400);

  const paymentRequest = {
    method: "POST",
    headers: headers(session, { "Idempotency-Key": "payment-attempt-api-gate-c" }),
  };
  const paid = await invoke(context, "/api/preprod/checkout/test-payment", paymentRequest);
  assert.equal(paid.status, 200);
  const paidPayload = (await paid.json()).data;
  assert.equal(paidPayload.status, "paid");
  assert.equal(paidPayload.debited, false);
  assert.equal(paidPayload.emailCaptured, true);
  assert.equal(paidPayload.emailSent, false);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM email_outbox WHERE status='pending' AND sent_at IS NULL").get().count, 1);
  const refreshed = await invoke(context, "/api/preprod/orders/current", {
    method: "GET",
    headers: headers(session),
  });
  assert.equal(refreshed.status, 200);
  assert.deepEqual((await refreshed.json()).data, paidPayload);
  const paymentBody = await invoke(context, "/api/preprod/checkout/test-payment", {
    ...paymentRequest,
    headers: headers(session, {
      "Content-Type": "application/json",
      "Idempotency-Key": "payment-attempt-api-body-rejected",
    }),
    body: JSON.stringify({ cardNumber: "4111111111111111" }),
  });
  assert.equal(paymentBody.status, 400);

  const otherSession = await cartWithLine(context, "variant_boxer_pourpre_l");
  const crossed = await invoke(context, "/api/preprod/checkout/test-payment", {
    method: "POST",
    headers: headers(otherSession, { "Idempotency-Key": "payment-attempt-api-crossed" }),
  });
  assert.equal(crossed.status, 404);
  context.sqlite.close();
});

test("production order/payment routes are invisible before any D1 access", async () => {
  const context = await fixture();
  let databaseTouches = 0;
  const forbiddenDb = {
    prepare() { databaseTouches += 1; throw new Error("D1 touched"); },
    batch() { databaseTouches += 1; throw new Error("D1 touched"); },
  };
  for (const pathname of [
    "/api/preprod/checkout/order",
    "/api/preprod/orders/current",
    "/api/preprod/checkout/test-payment",
  ]) {
    const response = await context.worker.fetch(
      new Request(`${ORIGIN}${pathname}`, { method: "POST" }),
      { APP_ENV: "production", PREPROD_ORIGIN: ORIGIN, DB: forbiddenDb },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(response.status, 404);
  }
  assert.equal(databaseTouches, 0);
  context.sqlite.close();
});

test("shipping quote is D1-persistent, deterministic and exposes only the public allowlist", async () => {
  const context = await fixture();
  activate(context, "EU", 1375);
  const session = await cartWithLine(context, "variant_boxer_pourpre_m", 2);
  const first = await invoke(context, "/api/preprod/checkout/shipping-quote", quoteRequest(session, france));
  const replay = await invoke(context, "/api/preprod/checkout/shipping-quote", quoteRequest(session, france));
  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  const payload = await first.json();
  assert.deepEqual(await replay.json(), payload);
  assert.match(payload.data.quoteId, /^quote_[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(payload.data).sort(), [
    "amountCents", "carrierConnected", "cart", "currency", "dutiesTerms",
    "estimatedDaysMax", "estimatedDaysMin", "expiresAt", "parcel", "quoteId",
    "simulation", "zone",
  ].sort());
  assert.equal(payload.data.amountCents, 1375);
  assert.equal(payload.data.simulation, true);
  assert.equal(payload.data.carrierConnected, false);
  assert.equal(payload.data.cart.itemCount, 2);
  assert.deepEqual(payload.data.parcel, {
    profileCode: "AJL_ENVELOPE_2_ITEMS_V1",
    itemCount: 2,
    weightGrams: 250,
    lengthCm: 40,
    widthCm: 32,
    heightCm: 4,
  });
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) AS count FROM shipping_quotes").get().count, 1);
  assert.deepEqual(
    context.sqlite.prepare(`SELECT profile_code, source_version, item_count,
      weight_grams, length_mm, width_mm, height_mm
      FROM shipping_quote_parcel_snapshots`).get(),
    Object.assign(Object.create(null), {
      profile_code: "AJL_ENVELOPE_2_ITEMS_V1",
      source_version: "client-validated-2026-08-13",
      item_count: 2,
      weight_grams: 250,
      length_mm: 400,
      width_mm: 320,
      height_mm: 40,
    }),
  );
  assert.throws(
    () => context.sqlite.exec(
      "UPDATE shipping_quote_parcel_snapshots SET weight_grams=350",
    ),
    /immutable/,
  );
  assert.equal("stockState" in payload.data.cart.lines[0], false);
  const durableRoute = context.sqlite.prepare(
    "SELECT shipping_address_json FROM shipping_quotes",
  ).get().shipping_address_json;
  assert.deepEqual(JSON.parse(durableRoute), {
    countryCode: "FR", postalCode: "00000", regionCode: null,
  });
  assert.doesNotMatch(durableRoute, /Ada|rue du Test|Paris|75001/i);
  const durableFingerprint = context.sqlite.prepare(
    "SELECT shipping_address_fingerprint FROM shipping_quotes",
  ).get().shipping_address_fingerprint;
  assert.notEqual(
    durableFingerprint,
    (await normalizeShippingAddress(france)).fingerprint,
    "durable proof must be keyed by the raw session secret",
  );
  assert.doesNotMatch(
    JSON.stringify(payload),
    /Ada|rue du Test|shipping_address|fingerprint|configuration|service_code|610711|physical|reserve|available_to_sell/i,
  );
  context.sqlite.close();
});

test("parcel selection sums multiple lines and unmeasured carts fail closed", async () => {
  const multi = await fixture();
  activate(multi, "EU", 1375);
  const multiSession = await cartWithLine(multi, "variant_boxer_pourpre_m", 1);
  const secondLine = await invoke(
    multi,
    "/api/preprod/cart/lines/variant_boxer_rose-pale_l",
    {
      method: "PUT",
      headers: headers(multiSession, { "Content-Type": "application/json" }),
      body: JSON.stringify({ quantity: 1 }),
    },
  );
  assert.equal(secondLine.status, 200);
  const multiQuote = await invoke(
    multi,
    "/api/preprod/checkout/shipping-quote",
    quoteRequest(multiSession, france, "quote-attempt-multi-line"),
  );
  assert.equal(multiQuote.status, 200);
  assert.deepEqual((await multiQuote.json()).data.parcel, {
    profileCode: "AJL_ENVELOPE_2_ITEMS_V1",
    itemCount: 2,
    weightGrams: 250,
    lengthCm: 40,
    widthCm: 32,
    heightCm: 4,
  });
  multi.sqlite.close();

  const overLimit = await fixture();
  activate(overLimit, "EU", 1375);
  const overLimitSession = await cartWithLine(
    overLimit,
    "variant_boxer_pourpre_m",
    4,
  );
  const rejected = await invoke(
    overLimit,
    "/api/preprod/checkout/shipping-quote",
    quoteRequest(overLimitSession, france, "quote-attempt-over-profile-limit"),
  );
  assert.equal(rejected.status, 422);
  assert.equal(
    (await rejected.json()).error.code,
    "PARCEL_CONFIGURATION_UNAVAILABLE",
  );
  assert.equal(
    overLimit.sqlite.prepare("SELECT COUNT(*) count FROM shipping_quotes").get()
      .count,
    0,
  );
  assert.equal(
    overLimit.sqlite.prepare(
      "SELECT COUNT(*) count FROM shipping_quote_parcel_snapshots",
    ).get().count,
    0,
  );
  overLimit.sqlite.close();
});

test("shipping quote replay stays byte-stable when sufficient stock crosses the low-stock threshold", async () => {
  const context = await fixture();
  activate(context, "EU", 1375);
  const session = await cartWithLine(context);
  const request = quoteRequest(session, france, "quote-attempt-stock-stable");
  const first = await invoke(context, "/api/preprod/checkout/shipping-quote", request);
  assert.equal(first.status, 200);
  const firstPayload = await first.json();
  const currentQuantity = context.sqlite.prepare(`SELECT physical_quantity
    FROM inventory WHERE variant_id='variant_boxer_pourpre_m'`).get().physical_quantity;
  context.sqlite.prepare(`INSERT INTO inventory_movements (
    id, variant_id, kind, quantity, reference_type, reference_id,
    actor_type, actor_id, idempotency_key, created_at
  ) VALUES ('movement_quote_low_stock', 'variant_boxer_pourpre_m', 'adjustment', ?,
    'physical_decrease', 'quote-low-stock', 'admin', NULL,
    'stock:quote-low-stock', ?)`).run(
      currentQuantity - 4,
      new Date().toISOString(),
    );
  const replay = await invoke(
    context,
    "/api/preprod/checkout/shipping-quote",
    quoteRequest(session, france, "quote-attempt-stock-stable"),
  );
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), firstPayload);
  context.sqlite.close();
});

test("two simultaneous requests with one key converge on one byte-stable D1 quote", async () => {
  const context = await fixture();
  activate(context, "EU", 1375);
  const session = await cartWithLine(context);
  let initialReads = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  context.sqlite.__quoteReadBarrier = async () => {
    initialReads += 1;
    if (initialReads === 2) release();
    if (initialReads <= 2) await gate;
  };
  const RealDate = globalThis.Date;
  let clockTick = 0;
  class AdvancingDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(RealDate.parse("2026-08-13T12:00:00.000Z") + clockTick++);
      } else {
        super(...args);
      }
    }
  }
  globalThis.Date = AdvancingDate;
  let responses;
  try {
    responses = await Promise.all([
      invoke(
        context,
        "/api/preprod/checkout/shipping-quote",
        quoteRequest(session, france, "quote-attempt-concurrent"),
      ),
      invoke(
        context,
        "/api/preprod/checkout/shipping-quote",
        quoteRequest(session, france, "quote-attempt-concurrent"),
      ),
    ]);
  } finally {
    globalThis.Date = RealDate;
    delete context.sqlite.__quoteReadBarrier;
  }
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.deepEqual(await responses[1].json(), await responses[0].json());
  assert.equal(
    context.sqlite.prepare("SELECT COUNT(*) AS count FROM shipping_quotes").get().count,
    1,
  );
  context.sqlite.close();
});

test("shipping quote rejects replay conflict, unsupported destinations and stale stock", async () => {
  const context = await fixture();
  activate(context, "EU");
  const session = await cartWithLine(context);
  const first = await invoke(context, "/api/preprod/checkout/shipping-quote", quoteRequest(session, france));
  assert.equal(first.status, 200);
  const conflict = await invoke(
    context,
    "/api/preprod/checkout/shipping-quote",
    quoteRequest(session, { ...france, line1: "2 rue du Test" }),
  );
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "IDEMPOTENCY_CONFLICT");

  const outside = await invoke(
    context,
    "/api/preprod/checkout/shipping-quote",
    quoteRequest(session, { ...france, postalCode: "2000", city: "Sydney", countryCode: "AU" }, "quote-attempt-00000002"),
  );
  assert.equal(outside.status, 422);
  assert.equal((await outside.json()).error.code, "DESTINATION_UNAVAILABLE");

  const currentQuantity = context.sqlite.prepare(`SELECT physical_quantity
    FROM inventory WHERE variant_id='variant_boxer_pourpre_m'`).get().physical_quantity;
  context.sqlite.prepare(`INSERT INTO inventory_movements (
    id, variant_id, kind, quantity, reference_type, reference_id,
    actor_type, actor_id, idempotency_key, created_at
  ) VALUES ('movement_quote_stock', 'variant_boxer_pourpre_m', 'adjustment', ?,
    'physical_decrease', 'quote-stock', 'admin', NULL,
    'stock:quote-stock', ?)`).run(currentQuantity, new Date().toISOString());
  const stale = await invoke(
    context,
    "/api/preprod/checkout/shipping-quote",
    quoteRequest(session, france, "quote-attempt-00000003"),
  );
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "OUT_OF_STOCK");
  context.sqlite.close();
});

test("shipping quote enforces method, origin, CSRF, idempotency and 4 KiB JSON", async () => {
  const context = await fixture();
  activate(context, "EU");
  const session = await cartWithLine(context);
  const path = "/api/preprod/checkout/shipping-quote";
  const method = await invoke(context, path, { method: "GET" });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "POST");

  for (const [label, options, code] of [
    ["origin", quoteRequest(session, france, undefined, { headers: { Origin: "https://evil.example" } }), "ORIGIN_REJECTED"],
    ["csrf", quoteRequest({ ...session, csrf: "A".repeat(43) }, france), "CSRF_REJECTED"],
    ["key", quoteRequest(session, france, "short"), "IDEMPOTENCY_CONFLICT"],
  ]) {
    const response = await invoke(context, path, options);
    assert.equal((await response.json()).error.code, code, label);
  }

  const unknown = await invoke(context, path, {
    ...quoteRequest(session, france),
    body: JSON.stringify({ address: france, priceCents: 1 }),
  });
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error.code, "INVALID_JSON");

  let cancelled = false;
  const oversizedBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(3000));
      controller.enqueue(new Uint8Array(3000));
    },
    cancel() {
      cancelled = true;
    },
  });
  const oversized = await invoke(context, path, {
    method: "POST",
    headers: headers(session, {
      "Content-Type": "application/json",
      "Idempotency-Key": "quote-attempt-oversized",
    }),
    body: oversizedBody,
    duplex: "half",
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "BODY_TOO_LARGE");
  assert.equal(cancelled, true);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) AS count FROM shipping_quotes").get().count, 0);
  context.sqlite.close();
});

test("US state is mandatory and EU, UK, US and Canada remain the only launch zones", async () => {
  const cases = [
    ["EU", france],
    ["UK", { ...france, line1: "1 Test Street", postalCode: "SW1A 1AA", city: "London", countryCode: "GB" }],
    ["US", { ...france, line1: "1 Fifth Avenue", postalCode: "10001", city: "New York", regionCode: "NY", countryCode: "US" }],
    ["CA", { ...france, line1: "1 Test Street", postalCode: "M5V 3A8", city: "Toronto", countryCode: "CA" }],
  ];
  for (const [zone, address] of cases) {
    const context = await fixture();
    activate(context, zone);
    const session = await cartWithLine(context);
    const response = await invoke(context, "/api/preprod/checkout/shipping-quote", quoteRequest(session, address));
    assert.equal(response.status, 200, zone);
    assert.equal((await response.json()).data.zone, zone);
    context.sqlite.close();
  }
  const context = await fixture();
  activate(context, "US");
  const session = await cartWithLine(context);
  const missingState = await invoke(context, "/api/preprod/checkout/shipping-quote", quoteRequest(session, {
    ...france, postalCode: "10001", city: "New York", countryCode: "US",
  }));
  assert.equal(missingState.status, 422);
  assert.equal((await missingState.json()).error.code, "DESTINATION_UNAVAILABLE");
  context.sqlite.close();
});
