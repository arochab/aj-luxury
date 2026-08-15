import assert from "node:assert/strict";
import test from "node:test";
import { productionCommerceApiResponse } from "../worker/production-commerce-api.ts";

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

test("service-point purchase is an explicit 503 and never reaches a provider", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/checkout/service-points", {
      method: "POST",
      headers: ownerHeaders,
    }),
    controlled,
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "SERVICE_POINT_NOT_ACTIVATED");
});

test("payment session is not exposed while webhook effects are absent", async () => {
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
  assert.equal((await response.json()).error.code, "PAYMENT_WEBHOOK_EFFECTS_NOT_ACTIVATED");
});

test("a verified Stripe webhook is never acknowledged without atomic effects", async () => {
  let verifications = 0;
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/webhooks/stripe", {
      method: "POST",
      headers: {
        ...ownerHeaders,
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
        webhooks: { async verify() { verifications += 1; return { kind: "ignored" }; } },
      },
    },
  );
  assert.equal(verifications, 1);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "PAYMENT_EFFECTS_NOT_ACTIVATED");
});
