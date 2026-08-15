import assert from "node:assert/strict";
import test from "node:test";
import { productionCommerceApiResponse, productionDeliveryRuntimeInstalled, productionStockRuntimeAttested } from "../worker/production-commerce-api.ts";

const releaseSha = "a".repeat(40);
const controlled = Object.freeze({
  APP_ENV: "production",
  COMMERCE_MODE: "controlled",
  COMMERCE_RELEASE_SHA: releaseSha,
  COMMERCE_ORIGIN: "https://ajluxurystore.com",
  COMMERCE_ADAM_APPROVAL_SHA: releaseSha,
  COMMERCE_JEREMY_APPROVAL_SHA: releaseSha,
  STOCK_MANIFEST_ID: "stock-launch-20260815",
  STOCK_MANIFEST_SHA256: "b".repeat(64),
  STOCK_MANIFEST_APPROVED_BY: "jeremy",
  PAYMENT_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: "sk_live_redacted",
  STRIPE_WEBHOOK_SECRET: "whsec_redacted",
  STRIPE_SETTLEMENT_MODE: "live",
  DELIVERY_PROVIDER: "sendcloud",
  SENDCLOUD_API_VERSION: "3",
  SENDCLOUD_PUBLIC_KEY: "public-redacted",
  SENDCLOUD_SECRET_KEY: "secret-redacted-secret",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_redacted",
  RESEND_WEBHOOK_SECRET: "whsec_resend_redacted",
  TRANSACTIONAL_FROM_EMAIL: "commandes@ajluxurystore.com",
  SELLER_LEGAL_IDENTITY_APPROVED: "true",
  TAX_DUTY_POLICY_APPROVED: "true",
  RETURNS_POLICY_APPROVED: "true",
  BACKUP_RESTORE_DRILL_APPROVED: "true",
  MONITORING_ALERTS_APPROVED: "true",
  COMMERCE_CART_HMAC_SECRET: "x".repeat(32),
  COMMERCE_CONTROLLED_OWNER_EMAIL: "owner@example.com",
  DB: {},
});

const ownerHeaders = Object.freeze({
  "oai-authenticated-user-email": "owner@example.com",
  "oai-authenticated-user-id": "owner-1",
});

test("the production namespace is invisible outside production", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://preprod.example/api/commerce/health"),
    { APP_ENV: "preproduction" },
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not-found" });
});

test("production health fails closed without release evidence", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/health"),
    { APP_ENV: "production", COMMERCE_MODE: "closed" },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const payload = await response.json();
  assert.equal(payload.status, "closed");
  assert.equal(payload.capabilities.publicCommerce, false);
  assert.ok(payload.blockers.includes("release-sha-invalid"));
  assert.doesNotMatch(JSON.stringify(payload), /sk_(?:test|live)|whsec|secret-redacted/);
});

test("unknown production commerce routes stay hidden", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/checkout", { method: "POST" }),
    { APP_ENV: "production", COMMERCE_MODE: "live" },
  );
  assert.equal(response.status, 404);
});

test("health rejects non-GET methods", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/health", { method: "POST" }),
    { APP_ENV: "production" },
  );
  assert.equal(response.status, 405);
});

test("controlled routes require the authenticated owner before touching D1", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/cart"),
    controlled,
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "CONTROLLED_ACCESS_REQUIRED");
});

test("cart creation rejects a missing exact origin before touching D1", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/cart", {
      method: "POST",
      headers: { ...ownerHeaders, "Idempotency-Key": "cart-create-0001" },
    }),
    controlled,
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "ORIGIN_REJECTED");
});

test("service-point purchase remains 503 until exact 0013 schema is installed", async () => {
  const cartToken = "A".repeat(43);
  const csrfToken = "B".repeat(43);
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/checkout/service-points", {
      method: "POST",
      headers: {
        ...ownerHeaders,
        Cookie: `__Host-aj_cart=${cartToken}; __Host-aj_cart_csrf=${csrfToken}`,
        Origin: "https://ajluxurystore.com",
        "Sec-Fetch-Site": "same-origin",
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": "service-points-0001",
      },
    }),
    controlled,
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "DELIVERY_SCHEMA_NOT_READY");
});

test("delivery runtime proof rejects missing and prefix-colliding 0013 objects", async () => {
  const exact = [
    { type: "column", name: "selected_service_point_id", table_name: "delivery_option_snapshots" },
    { type: "table", name: "delivery_provider_reference_vault", table_name: "delivery_provider_reference_vault" },
    { type: "table", name: "delivery_service_point_snapshots", table_name: "delivery_service_point_snapshots" },
    { type: "trigger", name: "trg_delivery_order_requires_selected_option", table_name: "orders" },
    { type: "trigger", name: "trg_orders_provider_pricing_contract", table_name: "orders" },
    { type: "trigger", name: "trg_shipping_quote_provider_pricing_contract", table_name: "shipping_quotes" },
  ];
  const database = (results) => ({ prepare() { return { async all() { return { results }; } }; } });
  assert.equal(await productionDeliveryRuntimeInstalled(database(exact)), true);
  assert.equal(await productionDeliveryRuntimeInstalled(database(exact.slice(1))), false);
  assert.equal(await productionDeliveryRuntimeInstalled(database([...exact, { ...exact[1], name: "delivery_provider_reference_vault_shadow" }])), false);
});

function stockProofDatabase(stock, approvals) {
  return {
    prepare(query) {
      return {
        bind() { return this; },
        async first() { return query.includes("FROM inventory") ? stock : approvals; },
      };
    },
  };
}

test("live stock attestation requires exact D1 inventory and two distinct bound approvals", async () => {
  const exactStock = { variant_count: 12, physical_quantity: 756, validated_count: 12, invalid_count: 0 };
  const twoApprovals = { approval_count: 2, signer_count: 2, valid_actor_count: 2, stock_owner_count: 1, release_owner_count: 1 };
  const env = { DB: stockProofDatabase(exactStock, twoApprovals), STOCK_MANIFEST_ID: "stock-launch-20260815", STOCK_MANIFEST_SHA256: "b".repeat(64) };
  assert.equal(await productionStockRuntimeAttested(env), true);
  assert.equal(await productionStockRuntimeAttested({ ...env, DB: stockProofDatabase(exactStock, { ...twoApprovals, signer_count: 1 }) }), false);
  assert.equal(await productionStockRuntimeAttested({ ...env, DB: stockProofDatabase(exactStock, { ...twoApprovals, approval_count: 3, signer_count: 3, valid_actor_count: 3 }) }), false);
  assert.equal(await productionStockRuntimeAttested({ ...env, DB: stockProofDatabase({ ...exactStock, invalid_count: 1 }, twoApprovals) }), false);
  assert.equal(await productionStockRuntimeAttested({ ...env, STOCK_MANIFEST_SHA256: "c".repeat(64), DB: { prepare() { throw new Error("unbound-proof"); } } }), false);
});

test("controlled payment session stays closed until late-payment compensation is activated", async () => {
  const cartToken = "A".repeat(43);
  const csrfToken = "B".repeat(43);
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/checkout/payment-session", {
      method: "POST",
      headers: {
        ...ownerHeaders,
        Cookie: `__Host-aj_cart=${cartToken}; __Host-aj_cart_csrf=${csrfToken}`,
        Origin: "https://ajluxurystore.com",
        "Sec-Fetch-Site": "same-origin",
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": "payment-session-0001",
      },
    }),
    controlled,
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "LATE_PAYMENT_COMPENSATION_NOT_ACTIVATED");
});

test("a verified Stripe webhook is never acknowledged without atomic effects", async () => {
  let verifications = 0;
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/webhooks/stripe", {
      method: "POST",
      headers: {
        "Stripe-Signature": "t=1,v1=" + "a".repeat(64),
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    controlled,
    {
      paymentProvider: {
        checkout: { async createSession() { throw new Error("not-called"); } },
        refunds: { async createRefund() { throw new Error("not-called"); } },
        webhooks: { async verify() {
          verifications += 1;
          return {
            provider: "stripe", providerEventId: "evt_paid_1",
            eventType: "checkout.session.completed",
            occurredAt: new Date().toISOString(), livemode: true,
            kind: "payment", orderId: "order_1", providerPaymentId: "pi_1",
            providerCheckoutSessionId: "cs_live_1", state: "paid",
            amountCents: 2999, currency: "EUR", providerFailureCode: null,
            semanticKey: "stripe:payment:pi_1:paid",
          };
        } },
      },
    },
  );
  assert.equal(verifications, 1);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "PAYMENT_EFFECTS_UNAVAILABLE");
});

test("webhook provider misconfiguration remains retryable 503", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/webhooks/stripe", {
      method: "POST",
      headers: { "Stripe-Signature": "t=1,v1=" + "a".repeat(64) },
      body: "{}",
    }),
    {
      APP_ENV: "production",
      COMMERCE_MODE: "closed",
      COMMERCE_ORIGIN: "https://ajluxurystore.com",
      STRIPE_SETTLEMENT_MODE: "live",
      DB: {},
    },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "PAYMENT_EFFECTS_UNAVAILABLE");
});

test("a signed existing payment settles after commerce is closed without owner headers", async () => {
  let effects = 0;
  const closedAfterSession = {
    APP_ENV: "production",
    COMMERCE_MODE: "closed",
    COMMERCE_ORIGIN: "https://ajluxurystore.com",
    STRIPE_SETTLEMENT_MODE: "live",
    DB: {},
  };
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/webhooks/stripe", {
      method: "POST",
      headers: {
        "Stripe-Signature": "t=1,v1=" + "a".repeat(64),
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    closedAfterSession,
    {
      paymentProvider: {
        checkout: { async createSession() { throw new Error("not-called"); } },
        refunds: { async createRefund() { throw new Error("not-called"); } },
        webhooks: { async verify() {
          return {
            provider: "stripe", providerEventId: "evt_paid_closed_1",
            eventType: "checkout.session.completed",
            occurredAt: new Date().toISOString(), livemode: true,
            kind: "payment", orderId: "order_1", providerPaymentId: "pi_1",
            providerCheckoutSessionId: "cs_live_1", state: "paid",
            amountCents: 2999, currency: "EUR", providerFailureCode: null,
            semanticKey: "stripe:payment:pi_1:paid",
          };
        } },
      },
      paymentEffects: { async applyVerified() { effects += 1; return "applied"; } },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(effects, 1);
  assert.deepEqual(await response.json(), { received: true, disposition: "applied" });
});
