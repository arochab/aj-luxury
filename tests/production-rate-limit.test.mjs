import assert from "node:assert/strict";
import test from "node:test";

import {
  productionCommerceRateLimitResponse,
  productionRateLimitBindingsReady,
  productionScheduledRateLimit,
} from "../worker/production-rate-limit.ts";

const allow = Object.freeze({ async limit() { return { success: true }; } });
const ready = Object.freeze({
  APP_ENV: "production",
  COMMERCE_RATE_LIMITER: allow,
  PROVIDER_RATE_LIMITER: allow,
  WEBHOOK_RATE_LIMITER: allow,
  OPERATOR_RATE_LIMITER: allow,
});

test("production rate-limit bindings are an exact four-class readiness proof", () => {
  assert.equal(productionRateLimitBindingsReady(ready), true);
  assert.equal(productionRateLimitBindingsReady({ ...ready, PROVIDER_RATE_LIMITER: undefined }), false);
});

test("health is protected while unknown routes retain canonical routing", async () => {
  const unavailable = { APP_ENV: "production" };
  const health = await productionCommerceRateLimitResponse(
    new Request("https://ajluxurystore.com/api/commerce/health"), unavailable,
  );
  assert.equal(health.status, 503);
  assert.equal((await health.json()).error.code, "RATE_LIMIT_UNAVAILABLE");
  assert.equal(await productionCommerceRateLimitResponse(
    new Request("https://ajluxurystore.com/api/commerce/future"), unavailable,
  ), null);
});

test("a missing or exceeded provider limiter stops before D1 and Sendcloud", async () => {
  const request = new Request("https://ajluxurystore.com/api/commerce/checkout/delivery-options", {
    method: "POST",
    headers: {
      Cookie: "__Host-aj_cart=opaque-cart-secret",
      "CF-Connecting-IP": "192.0.2.44",
    },
  });
  const missing = await productionCommerceRateLimitResponse(request.clone(), {
    ...ready,
    PROVIDER_RATE_LIMITER: undefined,
  });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error.code, "RATE_LIMIT_UNAVAILABLE");

  let input;
  const exceeded = await productionCommerceRateLimitResponse(request, {
    ...ready,
    PROVIDER_RATE_LIMITER: {
      async limit(candidate) { input = candidate; return { success: false }; },
    },
  });
  assert.equal(exceeded.status, 429);
  assert.equal(exceeded.headers.get("Retry-After"), "60");
  assert.match(input.key, /^provider:[0-9a-f]{64}$/);
  assert.doesNotMatch(input.key, /opaque-cart-secret/);
});

test("rotating attacker-controlled cookies cannot rotate the edge counter", async () => {
  const keys = [];
  const env = {
    ...ready,
    PROVIDER_RATE_LIMITER: {
      async limit({ key }) { keys.push(key); return { success: true }; },
    },
  };
  for (const cart of ["forged-a", "forged-b", "forged-c"]) {
    await productionCommerceRateLimitResponse(new Request(
      "https://ajluxurystore.com/api/commerce/checkout/delivery-options",
      { headers: { Cookie: `__Host-aj_cart=${cart}`, "CF-Connecting-IP": "192.0.2.45" } },
    ), env);
  }
  assert.equal(new Set(keys).size, 1);
});

test("cart, provider, webhook and operator traffic use separate bindings", async () => {
  const calls = [];
  const env = {
    APP_ENV: "production",
    COMMERCE_RATE_LIMITER: { async limit() { calls.push("commerce"); return { success: true }; } },
    PROVIDER_RATE_LIMITER: { async limit() { calls.push("provider"); return { success: true }; } },
    WEBHOOK_RATE_LIMITER: { async limit() { calls.push("webhook"); return { success: true }; } },
    OPERATOR_RATE_LIMITER: { async limit() { calls.push("operator"); return { success: true }; } },
  };
  for (const pathname of [
    "/api/commerce/cart",
    "/api/commerce/checkout/payment-session",
    "/api/commerce/webhooks/stripe",
    "/api/commerce/admin/orders/order_1/shipping-label",
    "/api/commerce/admin/late-payment-refunds/dispatch",
    "/api/commerce/admin/launch-stock-import",
    "/api/commerce/returns",
    "/api/commerce/admin/reporting",
    "/api/commerce/admin/returns/return_1/approve",
    "/api/commerce/admin/returns/return_1/inspect",
  ]) {
    assert.equal(await productionCommerceRateLimitResponse(
      new Request(`https://ajluxurystore.com${pathname}`, {
        headers: { "CF-Connecting-IP": "192.0.2.1" },
      }), env,
    ), null);
  }
  assert.deepEqual(calls, [
    "commerce",
    "provider",
    "webhook",
    "operator",
    "operator",
    "operator",
    "commerce",
    "operator",
    "operator",
    "operator",
  ]);
});

test("scheduled stock, email and refund jobs share a bounded operator counter before costs", async () => {
  assert.equal(await productionScheduledRateLimit(
    { APP_ENV: "production" },
    "reservation-expiry",
  ), "unavailable");
  const keys = [];
  const env = {
    APP_ENV: "production",
    OPERATOR_RATE_LIMITER: {
      async limit({ key }) {
        keys.push(key);
        return { success: keys.length === 1 };
      },
    },
  };
  assert.equal(await productionScheduledRateLimit(env, "reservation-expiry"), "allowed");
  assert.equal(
    await productionScheduledRateLimit(env, "transactional-email-dispatch"),
    "limited",
  );
  assert.equal(
    await productionScheduledRateLimit(env, "late-payment-refund-dispatch"),
    "limited",
  );
  assert.equal(keys.length, 3);
  assert.match(keys[0], /^operator:[0-9a-f]{64}$/);
  assert.match(keys[1], /^operator:[0-9a-f]{64}$/);
  assert.match(keys[2], /^operator:[0-9a-f]{64}$/);
  assert.notEqual(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});
