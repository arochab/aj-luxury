import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import { D1ProductionCheckoutStore } from "../lib/commerce/d1-production-checkout-store.ts";
import { D1ProductionDeliveryStore } from "../lib/commerce/d1-production-delivery-store.ts";
import { D1StripePaymentEffectsStore, StripePaymentEffectsError } from "../lib/commerce/d1-stripe-payment-effects.ts";

const directory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrations = readdirSync(directory).filter((name) => /^(?:000[0-7]|0009|0010)_.+\.sql$/.test(name)).sort();
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

async function fixture(failEffectsAt = null) {
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
  await commerce.setCartLineQuantity({ cartId: "cart_prod", variantId: "variant_boxer_pourpre_m", quantity: 1, now: iso(base, 40) });
  const address = { recipient: "Ada Test", line1: "1 rue du Test", postalCode: "75001", city: "Paris", countryCode: "FR" };
  const expiry = iso(base, 900_000);
  const delivery = new D1ProductionDeliveryStore(d1, { quotes: { async quote() { return [{ providerCode: "sendcloud", providerQuoteReference: "provider-ref-home", carrierCode: "colissimo", serviceCode: "home", displayName: "Livraison domicile", deliveryMode: "home", amountCents: 700, currency: "EUR", estimatedDaysMin: 2, estimatedDaysMax: 5, dutiesTerms: "EU_INCLUDED", expiresAt: expiry, responseFingerprint: "c".repeat(64) }]; } }, servicePoints: { async servicePoints() { return []; } }, documents: { async document() { throw new Error("closed"); } }, returns: { async validate() { throw new Error("closed"); }, async create() { throw new Error("closed"); } } });
  const [option] = await delivery.quoteHomeOptions({ cartId: "cart_prod", address, idempotencyKey: "delivery-idem-0001", now: iso(base, 50) });
  const checkout = new D1ProductionCheckoutStore(d1);
  await checkout.createOrder({ cartId: "cart_prod", quoteId: option.quoteId, optionId: option.optionId, address, email: "ada@example.com", idempotencyKey: "order-idem-0001", termsVersion: "2026-07-30", privacyVersion: "2026-07-30", now: iso(base, 60) });
  const request = await checkout.prepareCheckoutSession({ cartId: "cart_prod", idempotencyKey: "payment-idem-0001", origin: "https://ajluxurystore.com", locale: "fr", now: iso(base, 70) });
  await checkout.recordCheckoutSession(request, { provider: "stripe", providerSessionId: "cs_live_fixture_001", providerPaymentId: null, checkoutUrl: "https://checkout.stripe.com/c/pay/test", state: "open", amountTotalCents: 3699, currency: "EUR", livemode: true, providerRequestId: "req_fixture" }, iso(base, 80));
  const event = Object.freeze({ provider: "stripe", providerEventId: "evt_fixture_paid_001", eventType: "checkout.session.completed", occurredAt: iso(base, 90), livemode: true, kind: "payment", orderId: request.orderId, providerPaymentId: "pi_fixture_001", providerCheckoutSessionId: "cs_live_fixture_001", state: "paid", amountCents: 3699, currency: "EUR", providerFailureCode: null, semanticKey: "stripe:payment:pi_fixture_001:paid" });
  return { sqlite, d1, event, effects: new D1StripePaymentEffectsStore(failEffectsAt === null ? d1 : new D1(sqlite, failEffectsAt)) };
}

test("paid Checkout event atomically pays, sells stock, closes cart and enqueues bounded copy", async () => {
  const { sqlite, effects, event } = await fixture();
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
  for (const patch of [{ amountCents: 1 }, { currency: "USD" }, { providerCheckoutSessionId: "cs_live_other" }]) {
    const { sqlite, effects, event } = await fixture();
    await assert.rejects(() => effects.applyVerified({ ...event, ...patch }), StripePaymentEffectsError);
    assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id=?").get(event.orderId).status, "pending_payment");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM webhook_events").get().n, 0);
  }
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
