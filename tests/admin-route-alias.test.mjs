import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAdminRoute } from "../worker/admin-route-alias.ts";

test("public management routes map exactly to internal rate-limited admin routes", async () => {
  const original = new Request(
    "https://ajluxurystore.com/api/commerce/management/orders/order_1?proof=safe",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://ajluxurystore.com" },
      body: JSON.stringify({ safe: true }),
    },
  );
  const normalized = normalizeAdminRoute(original);
  assert.equal(
    normalized.url,
    "https://ajluxurystore.com/api/commerce/admin/orders/order_1?proof=safe",
  );
  assert.equal(normalized.method, "POST");
  assert.equal(normalized.headers.get("Origin"), "https://ajluxurystore.com");
  assert.deepEqual(await normalized.json(), { safe: true });
});

test("lookalike and non-admin routes are never rewritten", () => {
  for (const pathname of [
    "/api/commerce/management-evil/orders",
    "/api/commerce/account/current",
    "/admin",
  ]) {
    const request = new Request(`https://ajluxurystore.com${pathname}`);
    assert.equal(normalizeAdminRoute(request), request);
  }
});
