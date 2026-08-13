import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import { D1FulfillmentStore } from "../lib/commerce/d1-fulfillment-store.ts";
import { D1PreprodCheckoutStore } from "../lib/commerce/d1-preprod-checkout-store.ts";
import { normalizeShippingAddress } from "../lib/commerce/fulfillment-domain.ts";
import { verifyPreprodTestPaymentEvent } from "../lib/commerce/preprod-test-payment-adapter.internal.ts";

const drizzle = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrationPaths = readdirSync(drizzle).filter((name) => /^000\d_.+\.sql$/.test(name)).sort();

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
    const run = () => this.#batch(statements);
    const result = this.#tail.then(run, run);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }
  async #batch(statements) {
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

class FaultD1 {
  constructor(base, sqlite, failAt) { this.base = base; this.sqlite = sqlite; this.failAt = failAt; }
  prepare(query) { return this.base.prepare(query); }
  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const [index, statement] of statements.entries()) {
        if (index === this.failAt) throw new Error(`fault-${index}`);
        results.push(await statement.run());
      }
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const name of migrationPaths) {
    const sql = readFileSync(`${drizzle}${name}`, "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  const d1 = new D1(sqlite);
  const commerce = new D1CommerceStore(d1);
  await commerce.seedLaunchCatalog("2099-01-01T00:00:00.000Z");
  sqlite.exec("UPDATE inventory SET reserves_validated=1");
  sqlite.exec(`INSERT INTO shipping_zone_configurations (
    id, zone, version, status, created_at, updated_at
  ) VALUES ('config_eu_gate_c', 'EU', 1, 'draft',
    '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')`);
  sqlite.exec(`UPDATE shipping_zone_configurations SET status='active',
    service_code='fixture-only', price_cents=1200, estimated_days_min=2,
    estimated_days_max=5, duties_terms='EU_INCLUDED', parcel_code='fixture',
    parcel_weight_grams=250, parcel_length_mm=240, parcel_width_mm=180,
    parcel_height_mm=40, origin_country_code='FR', customs_hs_code='610711',
    activated_at='2099-01-01T00:00:01.000Z',
    updated_at='2099-01-01T00:00:01.000Z' WHERE id='config_eu_gate_c'`);
  await commerce.createCart({
    id: "cart_gate_c", customerId: null, email: null,
    expiresAt: "2099-01-01T01:00:00.000Z", now: "2099-01-01T00:00:02.000Z",
  });
  for (const [index, variantId] of ["variant_boxer_pourpre_m", "variant_boxer_rose-pale_l"].entries()) {
    sqlite.prepare(`INSERT INTO cart_lines (
      id, cart_id, variant_id, quantity, unit_price_cents, created_at, updated_at
    ) VALUES (?, 'cart_gate_c', ?, 1, 2999,
      '2099-01-01T00:00:02.000Z', '2099-01-01T00:00:02.000Z')`)
      .run(`line_gate_${index}`, variantId);
  }
  const address = {
    recipient: "Ada Test", line1: "1 rue du Test", postalCode: "75001",
    city: "Paris", countryCode: "FR",
  };
  const normalized = await normalizeShippingAddress(address);
  const proof = "a".repeat(64);
  const quote = await new D1FulfillmentStore(d1).createShippingQuote({
    id: "quote_gate_c", cartId: "cart_gate_c", address,
    addressFingerprint: proof, expiresAt: "2099-01-01T00:20:00.000Z",
    now: "2099-01-01T00:00:03.000Z",
  });
  return { sqlite, d1, store: new D1PreprodCheckoutStore(d1), address, normalized, proof, quote };
}

async function create(context, overrides = {}) {
  return context.store.createOrder({
    cartId: "cart_gate_c", quoteId: context.quote.id,
    addressJson: context.normalized.canonicalJson,
    addressFingerprint: context.proof, countryCode: "FR",
    email: "client@demo.invalid", idempotencyKey: "order-attempt-gate-c-0001",
    termsVersion: "2026-07-30", privacyVersion: "2026-07-30",
    now: "2099-01-01T00:00:04.000Z", ...overrides,
  });
}

test("Gate C commits every line atomically and replay is exact", async () => {
  const context = await fixture();
  const first = await create(context);
  const replay = await create(context);
  assert.deepEqual(replay, first);
  assert.equal(first.status, "pending_payment");
  assert.equal(first.lines.length, 2);
  assert.equal("orderId" in first, false);
  assert.equal("quoteId" in first, false);
  assert.match(first.orderNumber, /^AJ-TEST-[0-9A-F]{24}$/);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM orders").get().count, 1);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM order_lines").get().count, 2);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM stock_reservations WHERE status='active'").get().count, 2);
  await assert.rejects(() => create(context, { email: "other@demo.invalid" }), (error) => error.code === "ORDER_CONFLICT");
  await assert.rejects(() => create(context, { email: "real@example.com" }), (error) => error.code === "INVALID_INPUT");
  context.sqlite.close();
});

test("Gate C accepts only opaque verified preproduction payment and proves the full commit", async () => {
  const context = await fixture();
  await create(context);
  const prepared = await context.store.prepareTestPayment({
    cartId: "cart_gate_c", idempotencyKey: "payment-attempt-gate-c-0001",
    requestedAt: "2099-01-01T00:00:04.000Z",
  });
  assert.ok("claims" in prepared);
  assert.throws(() => verifyPreprodTestPaymentEvent("production", prepared.claims));
  const event = verifyPreprodTestPaymentEvent("preproduction", prepared.claims);
  const paid = await context.store.completeTestPayment(prepared, event);
  assert.equal(paid.status, "paid");
  assert.equal(paid.debited, false);
  assert.equal(paid.emailCaptured, true);
  assert.equal(paid.emailSent, false);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM payments WHERE provider='test' AND status='succeeded'").get().count, 1);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM email_outbox WHERE status='pending' AND sent_at IS NULL").get().count, 1);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM stock_reservations WHERE status='converted'").get().count, 2);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM inventory_movements WHERE kind='sale'").get().count, 2);
  assert.doesNotMatch(JSON.stringify(paid), /Ada|rue du Test|demo\.invalid|order_[0-9a-f]|quote_/i);
  context.sqlite.close();
});

test("0007 direct trigger rejects unselected quote and real address never enters quote storage", async () => {
  const context = await fixture();
  const quoteJson = context.sqlite.prepare("SELECT shipping_address_json FROM shipping_quotes").get().shipping_address_json;
  assert.doesNotMatch(quoteJson, /Ada|rue du Test|Paris|75001/i);
  assert.throws(() => context.sqlite.prepare(`INSERT INTO orders (
    id, order_number, cart_id, email, status, currency, subtotal_cents,
    shipping_cents, tax_cents, total_cents, shipping_country_code,
    shipping_address_json, shipping_address_fingerprint, billing_address_json,
    shipping_quote_id, terms_version, privacy_version, created_at, updated_at
  ) VALUES ('order_direct_attack', 'AJ-ATTACK', 'cart_gate_c',
    'attack@demo.invalid', 'pending_payment', 'EUR', 5998, 1200, 0, 7198,
    'FR', ?, ?, ?, 'quote_gate_c', 'v', 'v',
    '2099-01-01T00:00:04.000Z', '2099-01-01T00:00:04.000Z')`)
    .run(context.normalized.canonicalJson, context.proof, context.normalized.canonicalJson), /fulfillment_quote_mismatch/);
  context.sqlite.close();
});

test("quote selection revalidates active configuration, HMAC and expiry", async () => {
  const context = await fixture();
  const fulfillment = new D1FulfillmentStore(context.d1);
  await assert.rejects(() => fulfillment.selectShippingQuote({
    quoteId: context.quote.id, cartId: "cart_gate_c", address: context.address,
    addressFingerprint: "c".repeat(64), now: "2099-01-01T00:00:04.000Z",
  }), (error) => error.code === "QUOTE_MISMATCH");
  await assert.rejects(() => fulfillment.selectShippingQuote({
    quoteId: context.quote.id, cartId: "cart_gate_c", address: context.address,
    addressFingerprint: context.proof, now: "2099-01-01T00:21:00.000Z",
  }), (error) => error.code === "QUOTE_EXPIRED");
  context.sqlite.exec(`UPDATE shipping_zone_configurations SET status='retired',
    retired_at='2099-01-01T00:00:04.000Z', updated_at='2099-01-01T00:00:04.000Z'
    WHERE id='config_eu_gate_c'`);
  await assert.rejects(() => fulfillment.selectShippingQuote({
    quoteId: context.quote.id, cartId: "cart_gate_c", address: context.address,
    addressFingerprint: context.proof, now: "2099-01-01T00:00:05.000Z",
  }), (error) => error.code === "CONFIGURATION_UNAVAILABLE");
  context.sqlite.close();
});

test("every order and payment batch statement rolls back without residue", async () => {
  for (let failAt = 0; failAt < 8; failAt += 1) {
    const context = await fixture();
    const faultStore = new D1PreprodCheckoutStore(new FaultD1(context.d1, context.sqlite, failAt));
    await assert.rejects(() => faultStore.createOrder({
      cartId: "cart_gate_c", quoteId: context.quote.id,
      addressJson: context.normalized.canonicalJson,
      addressFingerprint: context.proof, countryCode: "FR",
      email: "client@demo.invalid", idempotencyKey: "order-fault-gate-c",
      termsVersion: "2026-07-30", privacyVersion: "2026-07-30",
      now: "2099-01-01T00:00:04.000Z",
    }));
    assert.equal(context.sqlite.prepare("SELECT selected_at FROM shipping_quotes").get().selected_at, null);
    assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM orders").get().count, 0);
    assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM order_lines").get().count, 0);
    assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM stock_reservations").get().count, 0);
    assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM inventory_movements WHERE kind='reserve'").get().count, 0);
    context.sqlite.close();
  }

  for (let failAt = 0; failAt < 9; failAt += 1) {
    const context = await fixture();
    await create(context);
    const prepared = await context.store.prepareTestPayment({
      cartId: "cart_gate_c", idempotencyKey: "payment-fault-gate-c",
      requestedAt: "2099-01-01T00:00:04.000Z",
    });
    assert.ok("claims" in prepared);
    const event = verifyPreprodTestPaymentEvent("preproduction", prepared.claims);
    const faultStore = new D1PreprodCheckoutStore(new FaultD1(context.d1, context.sqlite, failAt));
    await assert.rejects(() => faultStore.completeTestPayment(prepared, event));
    assert.equal(context.sqlite.prepare("SELECT status FROM orders").get().status, "pending_payment");
    assert.equal(context.sqlite.prepare("SELECT status FROM carts").get().status, "open");
    assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM payments").get().count, 0);
    assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM webhook_events").get().count, 0);
    assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM email_outbox").get().count, 0);
    assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM inventory_movements WHERE kind='sale'").get().count, 0);
    assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM stock_reservations WHERE status='active'").get().count, 2);
    context.sqlite.close();
  }
});

test("test payment adapter stays outside public and browser import graphs", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const hits = [];
  for (const directory of ["app", "lib", "worker"]) {
    const visit = (path) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const target = join(path, entry.name);
        if (entry.isDirectory()) visit(target);
        else if (/\.(?:ts|tsx|mjs)$/.test(entry.name)) {
          const source = readFileSync(target, "utf8");
          if (source.includes("preprod-test-payment-adapter.internal")) {
            hits.push(target.slice(root.length).replaceAll("\\", "/"));
          }
        }
      }
    };
    visit(join(root, directory));
  }
  assert.deepEqual(hits, ["worker/index.ts"]);
  const issuerHits = [];
  for (const directory of ["app", "lib", "worker"]) {
    const visit = (path) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const target = join(path, entry.name);
        if (entry.isDirectory()) visit(target);
        else if (/\.(?:ts|tsx|mjs)$/.test(entry.name)) {
          const source = readFileSync(target, "utf8");
          if (source.includes("issuePreprodWorkerPaymentRegistrar")) {
            issuerHits.push(target.slice(root.length).replaceAll("\\", "/"));
          }
        }
      }
    };
    visit(join(root, directory));
  }
  assert.deepEqual(issuerHits.sort(), [
    "lib/commerce/payment-event-registration.internal.ts",
    "lib/commerce/preprod-test-payment-adapter.internal.ts",
  ]);
});

test("two carts racing for the last sellable unit produce one complete order", async () => {
  const context = await fixture();
  const physical = context.sqlite.prepare(
    "SELECT physical_quantity FROM inventory WHERE variant_id='variant_boxer_pourpre_m'",
  ).get().physical_quantity;
  context.sqlite.prepare(`INSERT INTO inventory_movements (
    id, variant_id, kind, quantity, reference_type, reference_id, actor_type,
    actor_id, idempotency_key, created_at
  ) VALUES ('movement_last_unit_fixture', 'variant_boxer_pourpre_m',
    'safety_allocation', ?, 'safety_reserve_increase', 'test_fixture',
    'system', NULL, 'fixture:last-unit', '2099-01-01T00:00:03.500Z')`).run(physical - 1);
  const commerce = new D1CommerceStore(context.d1);
  await commerce.createCart({
    id: "cart_gate_competing", customerId: null, email: null,
    expiresAt: "2099-01-01T01:00:00.000Z", now: "2099-01-01T00:00:02.000Z",
  });
  context.sqlite.exec(`INSERT INTO cart_lines (
    id, cart_id, variant_id, quantity, unit_price_cents, created_at, updated_at
  ) VALUES ('line_gate_competing', 'cart_gate_competing',
    'variant_boxer_pourpre_m', 1, 2999,
    '2099-01-01T00:00:02.000Z', '2099-01-01T00:00:02.000Z')`);
  const proof = "b".repeat(64);
  const quote = await new D1FulfillmentStore(context.d1).createShippingQuote({
    id: "quote_gate_competing", cartId: "cart_gate_competing",
    address: context.address, addressFingerprint: proof,
    expiresAt: "2099-01-01T00:20:00.000Z", now: "2099-01-01T00:00:03.000Z",
  });
  const results = await Promise.allSettled([
    create(context),
    context.store.createOrder({
      cartId: "cart_gate_competing", quoteId: quote.id,
      addressJson: context.normalized.canonicalJson,
      addressFingerprint: proof, countryCode: "FR",
      email: "other@demo.invalid", idempotencyKey: "order-competing-gate-c",
      termsVersion: "2026-07-30", privacyVersion: "2026-07-30",
      now: "2099-01-01T00:00:04.000Z",
    }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM orders").get().count, 1);
  const winningOrder = context.sqlite.prepare("SELECT id, cart_id FROM orders").get();
  const cartLineCount = context.sqlite.prepare("SELECT COUNT(*) count FROM cart_lines WHERE cart_id=?").get(winningOrder.cart_id).count;
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM order_lines WHERE order_id=?").get(winningOrder.id).count, cartLineCount);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM stock_reservations WHERE cart_id=? AND status='active'").get(winningOrder.cart_id).count, cartLineCount);
  assert.equal(context.sqlite.prepare("SELECT active_reserved_quantity FROM inventory WHERE variant_id='variant_boxer_pourpre_m'").get().active_reserved_quantity, 1);
  context.sqlite.close();
});

test("same-cart concurrent idempotency converges; different keys conflict for order and payment", async () => {
  const context = await fixture();
  const orderInput = {
    cartId: "cart_gate_c", quoteId: context.quote.id,
    addressJson: context.normalized.canonicalJson,
    addressFingerprint: context.proof, countryCode: "FR",
    email: "client@demo.invalid", idempotencyKey: "order-concurrent-same",
    termsVersion: "2026-07-30", privacyVersion: "2026-07-30",
    now: "2099-01-01T00:00:04.000Z",
  };
  const sameOrder = await Promise.all([
    context.store.createOrder(orderInput),
    context.store.createOrder(orderInput),
  ]);
  assert.deepEqual(sameOrder[0], sameOrder[1]);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM orders").get().count, 1);
  const differentOrder = await Promise.allSettled([
    context.store.createOrder(orderInput),
    context.store.createOrder({ ...orderInput, idempotencyKey: "order-concurrent-different" }),
  ]);
  assert.equal(differentOrder.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(differentOrder.filter((result) => result.status === "rejected").length, 1);

  const payInput = {
    cartId: "cart_gate_c", idempotencyKey: "payment-concurrent-same",
    requestedAt: "2099-01-01T00:00:04.000Z",
  };
  const [prepared, preparedLater] = await Promise.all([
    context.store.prepareTestPayment(payInput),
    context.store.prepareTestPayment({
      ...payInput, requestedAt: "2099-01-01T00:00:10.000Z",
    }),
  ]);
  assert.ok("claims" in prepared && "claims" in preparedLater);
  assert.deepEqual(prepared, preparedLater);
  const event = verifyPreprodTestPaymentEvent("preproduction", prepared.claims);
  const laterEvent = verifyPreprodTestPaymentEvent("preproduction", preparedLater.claims);
  const samePayment = await Promise.all([
    context.store.completeTestPayment(prepared, event),
    context.store.completeTestPayment(preparedLater, laterEvent),
  ]);
  assert.deepEqual(samePayment[0], samePayment[1]);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM payments").get().count, 1);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM email_outbox").get().count, 1);
  await assert.rejects(() => context.store.prepareTestPayment({
    ...payInput, idempotencyKey: "payment-concurrent-different",
  }), (error) => error.code === "PAYMENT_CONFLICT");
  context.sqlite.close();
});

test("a payment request at or after reservation expiry writes nothing", async () => {
  const context = await fixture();
  await create(context);
  await assert.rejects(() => context.store.prepareTestPayment({
    cartId: "cart_gate_c", idempotencyKey: "payment-expired-gate-c",
    requestedAt: "2099-01-01T00:20:00.000Z",
  }), (error) => error.code === "ORDER_EXPIRED");
  assert.equal(context.sqlite.prepare("SELECT status FROM orders").get().status, "pending_payment");
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM payments").get().count, 0);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM webhook_events").get().count, 0);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM email_outbox").get().count, 0);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM inventory_movements WHERE kind='sale'").get().count, 0);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM stock_reservations WHERE status='active'").get().count, 2);
  context.sqlite.close();
});
