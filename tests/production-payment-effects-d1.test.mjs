import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Buffer } from "node:buffer";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import { D1ProductionCheckoutStore } from "../lib/commerce/d1-production-checkout-store.ts";
import { D1ProductionDeliveryActivationStore } from "../lib/commerce/d1-production-delivery-activation-store.ts";
import { DeliveryReferenceVault } from "../lib/commerce/delivery-reference-vault.ts";
import { D1StripePaymentEffectsStore, StripePaymentEffectsError } from "../lib/commerce/d1-stripe-payment-effects.ts";
import { D1LatePaymentRefundDispatcher, LatePaymentRefundDispatchError } from "../lib/commerce/d1-late-payment-refunds.ts";
import { PaymentProviderError } from "../lib/commerce/payment-provider.ts";
import { productionReleaseSchemaInstalled } from "../worker/production-commerce-api.ts";

const directory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrations = readdirSync(directory)
  .filter((name) => /^(?:000[0-7]|0009|001[0-7])_.+\.sql$/.test(name))
  .sort();
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
  constructor(database, failAt = null) { this.database = database; this.failAt = failAt; }
  prepare(query) { return new Statement(this.database, query); }
  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const [index, statement] of statements.entries()) {
        if (index === this.failAt) throw new Error("injected-batch-failure");
        results.push(await statement.run());
      }
      this.database.exec("COMMIT"); return results;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}
const iso = (base, offset) => new Date(base + offset).toISOString();

async function fixture(failEffectsAt = null, livemode = true, quantity = 1) {
  const sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys=ON");
  for (const name of migrations) for (const sql of readFileSync(`${directory}${name}`, "utf8").split("--> statement-breakpoint")) if (sql.trim()) sqlite.exec(sql);
  const base = Date.now() - 60_000; const d1 = new D1(sqlite); const commerce = new D1CommerceStore(d1);
  await commerce.seedLaunchCatalog(iso(base, 0)); sqlite.exec("UPDATE inventory SET reserves_validated=1");
  sqlite.prepare(`INSERT INTO shipping_zone_configurations (id,zone,version,status,created_at,updated_at)
    VALUES ('config_prod','EU',1,'draft',?,?)`).run(iso(base, 10), iso(base, 10));
  sqlite.prepare(`UPDATE shipping_zone_configurations SET status='active',service_code='provider',price_cents=700,
    estimated_days_min=2,estimated_days_max=5,duties_terms='EU_INCLUDED',parcel_code='fixture',parcel_weight_grams=150,
    parcel_length_mm=400,parcel_width_mm=320,parcel_height_mm=40,origin_country_code='FR',customs_hs_code='610711',
    activated_at=?,updated_at=? WHERE id='config_prod'`).run(iso(base, 20), iso(base, 20));
  await commerce.createCart({ id: "cart_prod", expiresAt: iso(base, 3_600_000), now: iso(base, 30) });
  await commerce.setCartLineQuantity({ cartId: "cart_prod", variantId: "variant_boxer_pourpre_m", quantity, now: iso(base, 40) });
  const address = { recipient: "Ada Test", line1: "1 rue du Test", postalCode: "75001", city: "Paris", countryCode: "FR" };
  const expiry = iso(base, 900_000);
  const delivery = new D1ProductionDeliveryActivationStore(d1, { quotes: { async quote() { return [{ providerCode: "sendcloud", providerQuoteReference: "provider-ref-home", carrierCode: "colissimo", serviceCode: "home", displayName: "Livraison domicile", deliveryMode: "home", amountCents: 900, currency: "EUR", estimatedDaysMin: 2, estimatedDaysMax: 5, dutiesTerms: "EU_INCLUDED", expiresAt: expiry, responseFingerprint: "c".repeat(64) }]; } }, servicePoints: { async servicePoints() { return []; } }, documents: { async document() { throw new Error("closed"); } }, returns: { async validate() { throw new Error("closed"); }, async create() { throw new Error("closed"); } } }, new DeliveryReferenceVault({ encryptionKeyBase64: Buffer.alloc(32, 7).toString("base64"), keyVersion: 1 }));
  const [option] = await delivery.quoteOptions({ cartId: "cart_prod", address, idempotencyKey: "delivery-idem-0001", now: iso(base, 50) });
  const checkout = new D1ProductionCheckoutStore(d1);
  await checkout.createOrder({ cartId: "cart_prod", quoteId: option.quoteId, optionId: option.optionId, address, email: "ada@example.com", idempotencyKey: "order-idem-0001", termsVersion: "2026-07-30", privacyVersion: "2026-07-30", now: iso(base, 60) });
  const request = await checkout.prepareCheckoutSession({ cartId: "cart_prod", idempotencyKey: "payment-idem-0001", origin: "https://ajluxurystore.com", locale: "fr", now: iso(base, 70) });
  const sessionId = livemode ? "cs_live_fixture_001" : "cs_test_fixture_001";
  const totalCents = ({ 1: 2999, 2: 4999, 3: 6999 })[quantity] + 900;
  await checkout.recordCheckoutSession(request, { provider: "stripe", providerSessionId: sessionId, providerPaymentId: null, checkoutUrl: "https://checkout.stripe.com/c/pay/test", state: "open", amountTotalCents: totalCents, currency: "EUR", livemode, providerRequestId: "req_fixture" }, iso(base, 80));
  const event = Object.freeze({ provider: "stripe", providerEventId: "evt_fixture_paid_001", eventType: "checkout.session.completed", occurredAt: iso(base, 90), livemode, kind: "payment", orderId: request.orderId, providerPaymentId: "pi_fixture_001", providerCheckoutSessionId: sessionId, state: "paid", amountCents: totalCents, currency: "EUR", providerFailureCode: null, semanticKey: "stripe:payment:pi_fixture_001:paid" });
  return { sqlite, d1, event, expiry, request, effects: new D1StripePaymentEffectsStore(failEffectsAt === null ? d1 : new D1(sqlite, failEffectsAt), livemode) };
}

test("same-colour pack two charges 49.99 before delivery without pack stock", async () => {
  const { sqlite, request, event } = await fixture(null, true, 2);
  assert.deepEqual(
    { ...sqlite.prepare("SELECT subtotal_cents, discount_cents, total_cents FROM orders").get() },
    { subtotal_cents: 4999, discount_cents: 999, total_cents: 5899 },
  );
  assert.deepEqual(request.lines.map(({ internalReference, unitAmountCents, quantity }) => ({
    internalReference,
    unitAmountCents,
    quantity,
  })), [
    { internalReference: "pack:apollon:2", unitAmountCents: 4999, quantity: 1 },
    { internalReference: request.lines[1].internalReference, unitAmountCents: 900, quantity: 1 },
  ]);
  assert.equal(event.amountCents, 5899);
  assert.equal(
    sqlite.prepare("SELECT quantity FROM stock_reservations").get().quantity,
    2,
  );
});

test("paid Checkout event atomically pays, sells stock, closes cart and enqueues bounded copy", async () => {
  const { sqlite, d1, effects, event } = await fixture();
  assert.equal(await productionReleaseSchemaInstalled(d1), true);
  assert.equal(await effects.applyVerified(event), "applied");
  assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id=?").get(event.orderId).status, "paid");
  assert.equal(sqlite.prepare("SELECT status FROM carts WHERE id='cart_prod'").get().status, "converted");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM stock_reservations WHERE status='converted'").get().n, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE kind='sale'").get().n, 1);
  const outbox = sqlite.prepare("SELECT payload_json,status FROM email_outbox WHERE order_id=?").get(event.orderId);
  assert.equal(outbox.status, "pending"); assert.deepEqual(Object.keys(JSON.parse(outbox.payload_json)).sort(), ["subject", "text"]);
  assert.equal(await effects.applyVerified(event), "duplicate");
  assert.equal(await effects.applyVerified({ ...event, providerEventId: "evt_fixture_paid_002" }), "duplicate");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM webhook_events").get().n, 1);
});

test("wrong amount, currency or Checkout session has zero effects", async () => {
  for (const patch of [{ amountCents: 1 }, { currency: "USD" }, { providerCheckoutSessionId: "cs_live_other" }, { livemode: false }]) {
    const { sqlite, effects, event } = await fixture();
    await assert.rejects(() => effects.applyVerified({ ...event, ...patch }), StripePaymentEffectsError);
    assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id=?").get(event.orderId).status, "pending_payment");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM webhook_events").get().n, 0);
  }
});

test("sandbox mode accepts a signed test event but rejects cross-mode events", async () => {
  const sandbox = await fixture(null, false);
  assert.equal(await sandbox.effects.applyVerified(sandbox.event), "applied");
  const live = await fixture();
  await assert.rejects(() => live.effects.applyVerified({ ...live.event, livemode: false }), StripePaymentEffectsError);
});

test("new browser idempotency keys reload the one active Checkout Session per order", async () => {
  const { sqlite, d1, event } = await fixture();
  const checkout = new D1ProductionCheckoutStore(d1);
  const prepared = await checkout.prepareCheckoutSession({
    cartId: "cart_prod",
    idempotencyKey: "different-browser-reload-key-0002",
    origin: "https://ajluxurystore.com",
    locale: "fr",
    now: new Date(Date.now()).toISOString(),
  });
  const persisted = sqlite.prepare(
    "SELECT idempotency_key FROM payments WHERE order_id=? AND status='created'",
  ).get(event.orderId);
  assert.equal(prepared.idempotencyKey, persisted.idempotency_key);
  await checkout.recordCheckoutSession(prepared, {
    provider: "stripe",
    providerSessionId: event.providerCheckoutSessionId,
    providerPaymentId: null,
    checkoutUrl: "https://checkout.stripe.com/c/pay/test",
    state: "open",
    amountTotalCents: event.amountCents,
    currency: "EUR",
    livemode: true,
    providerRequestId: "req_fixture_replay",
  }, new Date(Date.now() + 1).toISOString());
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS n FROM payments WHERE order_id=? AND status='created'",
  ).get(event.orderId).n, 1);
  assert.throws(() => sqlite.prepare(
    `INSERT INTO payments (id,order_id,provider,provider_session_id,status,
      amount_cents,currency,idempotency_key,failure_code,created_at,updated_at)
    SELECT 'forged_second_session',order_id,'stripe','cs_live_second','created',
      amount_cents,'EUR','stripe-checkout:forged-second',NULL,updated_at,updated_at
    FROM payments WHERE order_id=? AND status='created'`,
  ).run(event.orderId));
});

test("late paid event is durably flagged without selling or marking paid", async () => {
  const { sqlite, effects, event, expiry } = await fixture();
  const late = { ...event, occurredAt: expiry };
  assert.equal(await effects.applyVerified(late), "applied");
  assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id=?").get(event.orderId).status, "pending_payment");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM payments WHERE status='succeeded'").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE kind='sale'").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM webhook_events WHERE status='processed'").get().n, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='late_payment_refund_obligation_created'").get().n, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM late_payment_refund_intents WHERE status='pending'").get().n, 1);
  assert.equal(await effects.applyVerified(late), "duplicate");
  assert.equal(await effects.applyVerified({
    ...late,
    providerEventId: "evt_fixture_paid_distinct_semantic_replay",
  }), "duplicate");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM webhook_events").get().n, 1);
});

test("paid event after reservations became inactive is durably flagged", async () => {
  const { sqlite, d1, effects, event, expiry } = await fixture();
  const reservationId = sqlite.prepare("SELECT id FROM stock_reservations WHERE cart_id='cart_prod'").get().id;
  await new D1CommerceStore(d1).expireReservation({
    reservationId,
    idempotencyKey: "expire-before-webhook-0001",
    now: new Date(Date.parse(expiry) + 1).toISOString(),
  });
  assert.equal(await effects.applyVerified(event), "applied");
  assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id=?").get(event.orderId).status, "pending_payment");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM payments WHERE status='succeeded'").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE kind='sale'").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='late_payment_refund_obligation_created'").get().n, 1);
});

test("a first paid webhook after order cancellation creates a durable refund obligation", async () => {
  const { sqlite, d1, effects, event, expiry } = await fixture();
  const reservationId = sqlite.prepare(
    "SELECT id FROM stock_reservations WHERE cart_id='cart_prod'",
  ).get().id;
  await new D1CommerceStore(d1).expireReservation({
    reservationId,
    idempotencyKey: "expire-before-cancelled-webhook-0001",
    now: new Date(Date.parse(expiry) + 1).toISOString(),
  });
  sqlite.prepare(
    "UPDATE orders SET status='cancelled', updated_at=? WHERE id=?",
  ).run(expiry, event.orderId);
  const late = { ...event, occurredAt: new Date(Date.parse(expiry) + 2).toISOString() };
  assert.equal(await effects.applyVerified(late), "applied");
  assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id=?").get(event.orderId).status, "cancelled");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM payments WHERE status='succeeded'").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE kind='sale'").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM late_payment_refund_intents WHERE status='pending'").get().n, 1);
  assert.equal(await effects.applyVerified(late), "duplicate");
});

test("non-paid/out-of-order events are stale and do not mutate D1", async () => {
  const { sqlite, effects, event } = await fixture();
  assert.equal(await effects.applyVerified({ ...event, state: "failed", semanticKey: "stripe:payment:pi_fixture_001:failed" }), "stale");
  assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id=?").get(event.orderId).status, "pending_payment");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM webhook_events").get().n, 0);
});

test("an injected D1 failure rolls back every payment effect", async () => {
  const { sqlite, effects, event } = await fixture(5);
  await assert.rejects(() => effects.applyVerified(event), StripePaymentEffectsError);
  assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id=?").get(event.orderId).status, "pending_payment");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM webhook_events").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE kind='sale'").get().n, 0);
});

async function lateFixture() {
  const context = await fixture();
  const late = { ...context.event, occurredAt: context.expiry };
  assert.equal(await context.effects.applyVerified(late), "applied");
  return { ...context, late };
}

function succeededRefund(overrides = {}) {
  return {
    provider: "stripe",
    providerRefundId: "re_late_fixture_001",
    providerPaymentId: "pi_fixture_001",
    amountCents: 3899,
    currency: "EUR",
    state: "succeeded",
    providerRequestId: "req_late_fixture_001",
    ...overrides,
  };
}

test("late refund dispatch cancels without paid/sale and never double-refunds", async () => {
  const { sqlite, d1, expiry } = await lateFixture();
  const calls = [];
  const dispatcher = new D1LatePaymentRefundDispatcher(d1, {
    async createRefund(request) {
      calls.push(request);
      return succeededRefund();
    },
  }, () => "lease-token-success-0001");
  const now = new Date(Date.parse(expiry) + 1_000).toISOString();
  assert.deepEqual(await dispatcher.dispatch({ now }), {
    claimed: 1, succeeded: 1, rejected: 0, unknown: 0, attentionRequired: 0,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].idempotencyKey, sqlite.prepare(
    "SELECT idempotency_key FROM late_payment_refund_intents",
  ).get().idempotency_key);
  assert.equal(sqlite.prepare("SELECT status FROM orders").get().status, "cancelled");
  assert.equal(sqlite.prepare("SELECT status FROM late_payment_refund_intents").get().status, "succeeded");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM payments WHERE status IN ('succeeded','refunded')").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE kind='sale'").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM stock_reservations WHERE status='released'").get().n, 1);
  assert.deepEqual(await dispatcher.dispatch({ now: new Date(Date.parse(now) + 1_000).toISOString() }), {
    claimed: 0, succeeded: 0, rejected: 0, unknown: 0, attentionRequired: 0,
  });
  assert.equal(calls.length, 1);
});

test("pending Stripe refund reconciles by exact id and finalizes D1 only once", async () => {
  const { sqlite, d1, expiry } = await lateFixture();
  const createCalls = [];
  const retrieveCalls = [];
  const provider = {
    async createRefund(request) {
      createCalls.push(request);
      return succeededRefund({ state: "pending" });
    },
    async retrieveRefund(request) {
      retrieveCalls.push(request);
      return succeededRefund();
    },
  };
  const firstNow = new Date(Date.parse(expiry) + 1_000).toISOString();
  const first = new D1LatePaymentRefundDispatcher(d1, provider, () => "lease-token-pending-0001");
  assert.deepEqual(await first.dispatch({ now: firstNow, leaseSeconds: 30 }), {
    claimed: 1, succeeded: 0, rejected: 0, unknown: 1, attentionRequired: 0,
  });
  const retained = sqlite.prepare(
    "SELECT status,provider_refund_id,lease_expires_at FROM late_payment_refund_intents",
  ).get();
  assert.equal(retained.status, "claimed");
  assert.equal(retained.provider_refund_id, "re_late_fixture_001");
  assert.equal(createCalls.length, 1);
  assert.equal(retrieveCalls.length, 0);

  const retryNow = new Date(Date.parse(retained.lease_expires_at) + 1).toISOString();
  const retry = new D1LatePaymentRefundDispatcher(d1, provider, () => "lease-token-pending-0002");
  assert.deepEqual(await retry.dispatch({ now: retryNow, leaseSeconds: 30 }), {
    claimed: 1, succeeded: 1, rejected: 0, unknown: 0, attentionRequired: 0,
  });
  assert.equal(createCalls.length, 1);
  assert.deepEqual(retrieveCalls, [{
    orderId: createCalls[0].orderId,
    providerPaymentId: createCalls[0].providerPaymentId,
    providerRefundId: "re_late_fixture_001",
    amountCents: createCalls[0].amountCents,
    currency: createCalls[0].currency,
  }]);
  assert.equal(sqlite.prepare("SELECT status FROM late_payment_refund_intents").get().status, "succeeded");
  assert.equal(sqlite.prepare("SELECT status FROM orders").get().status, "cancelled");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM payments WHERE status IN ('succeeded','refunded')").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE kind='sale'").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='late_payment_refund_succeeded'").get().n, 1);
  assert.deepEqual(await retry.dispatch({ now: new Date(Date.parse(retryNow) + 60_000).toISOString() }), {
    claimed: 0, succeeded: 0, rejected: 0, unknown: 0, attentionRequired: 0,
  });
  assert.equal(createCalls.length, 1);
  assert.equal(retrieveCalls.length, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='late_payment_refund_succeeded'").get().n, 1);
});

test("unknown Stripe timeout retains the lease then reconciles with the exact same key", async () => {
  const { sqlite, d1, expiry } = await lateFixture();
  const keys = [];
  let attempt = 0;
  const provider = {
    async createRefund(request) {
      keys.push(request.idempotencyKey);
      attempt += 1;
      if (attempt === 1) throw new PaymentProviderError("TIMEOUT", "ambiguous");
      return succeededRefund();
    },
  };
  const firstNow = new Date(Date.parse(expiry) + 1_000).toISOString();
  const first = new D1LatePaymentRefundDispatcher(d1, provider, () => "lease-token-timeout-0001");
  assert.equal((await first.dispatch({ now: firstNow, leaseSeconds: 30 })).unknown, 1);
  const retained = sqlite.prepare(
    "SELECT status,last_error_code,lease_expires_at FROM late_payment_refund_intents",
  ).get();
  assert.deepEqual({ status: retained.status, error: retained.last_error_code }, {
    status: "claimed", error: "outcome_unknown",
  });
  assert.equal((await first.dispatch({ now: firstNow, leaseSeconds: 30 })).claimed, 0);
  const retryNow = new Date(Date.parse(retained.lease_expires_at) + 1).toISOString();
  const retry = new D1LatePaymentRefundDispatcher(d1, provider, () => "lease-token-timeout-0002");
  assert.equal((await retry.dispatch({ now: retryNow, leaseSeconds: 30 })).succeeded, 1);
  assert.deepEqual(keys, [keys[0], keys[0]]);
  assert.equal(sqlite.prepare("SELECT status FROM late_payment_refund_intents").get().status, "succeeded");
});

test("crash after Stripe success rolls D1 back and reconciles without a second refund", async () => {
  const { sqlite, d1, expiry } = await lateFixture();
  const keys = [];
  const provider = {
    async createRefund(request) {
      keys.push(request.idempotencyKey);
      return succeededRefund();
    },
  };
  const firstNow = new Date(Date.parse(expiry) + 1_000).toISOString();
  const crashing = new D1LatePaymentRefundDispatcher(
    new D1(sqlite, 4),
    provider,
    () => "lease-token-crash-0001",
  );
  await assert.rejects(
    () => crashing.dispatch({ now: firstNow, leaseSeconds: 30 }),
    LatePaymentRefundDispatchError,
  );
  const retained = sqlite.prepare(
    "SELECT status,lease_expires_at FROM late_payment_refund_intents",
  ).get();
  assert.equal(retained.status, "claimed");
  assert.equal(sqlite.prepare("SELECT status FROM orders").get().status, "pending_payment");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE kind='sale'").get().n, 0);
  const retry = new D1LatePaymentRefundDispatcher(d1, provider, () => "lease-token-crash-0002");
  const retryNow = new Date(Date.parse(retained.lease_expires_at) + 1).toISOString();
  assert.equal((await retry.dispatch({ now: retryNow, leaseSeconds: 30 })).succeeded, 1);
  assert.deepEqual(keys, [keys[0], keys[0]]);
});

test("wrong refund identity stays ambiguous and a confirmed rejection is terminal", async () => {
  for (const [index, override] of [
    { amountCents: 1 },
    { currency: "USD" },
    { providerPaymentId: "pi_wrong_payment_001" },
  ].entries()) {
    const wrong = await lateFixture();
    const wrongNow = new Date(Date.parse(wrong.expiry) + 1_000).toISOString();
    const wrongDispatcher = new D1LatePaymentRefundDispatcher(wrong.d1, {
      async createRefund() { return succeededRefund(override); },
    }, () => `lease-token-wrong-000${index + 1}`);
    assert.equal((await wrongDispatcher.dispatch({ now: wrongNow, leaseSeconds: 30 })).unknown, 1);
    assert.equal(wrong.sqlite.prepare("SELECT status FROM orders").get().status, "pending_payment");
    assert.equal(wrong.sqlite.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE kind='sale'").get().n, 0);
  }

  const rejected = await lateFixture();
  const rejectedNow = new Date(Date.parse(rejected.expiry) + 1_000).toISOString();
  const rejectedDispatcher = new D1LatePaymentRefundDispatcher(rejected.d1, {
    async createRefund() { throw new PaymentProviderError("REJECTED", "confirmed"); },
  }, () => "lease-token-rejected-0001");
  assert.equal((await rejectedDispatcher.dispatch({ now: rejectedNow })).rejected, 1);
  const rejectedIntent = rejected.sqlite.prepare(
    "SELECT status,last_error_code FROM late_payment_refund_intents",
  ).get();
  assert.equal(rejectedIntent.status, "rejected");
  assert.equal(rejectedIntent.last_error_code, "provider_rejected");
  assert.equal(rejected.sqlite.prepare("SELECT status FROM orders").get().status, "pending_payment");
});
