import assert from "node:assert/strict";
import test from "node:test";
import { productionCommerceApiResponse } from "../worker/production-commerce-api.ts";

test("the production namespace is invisible outside production", async () => {
  const response = productionCommerceApiResponse(
    new Request("https://preprod.example/api/commerce/health"),
    { APP_ENV: "preproduction" },
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not-found" });
});

test("production health fails closed without release evidence", async () => {
  const response = productionCommerceApiResponse(
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
  const response = productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/checkout", { method: "POST" }),
    { APP_ENV: "production", COMMERCE_MODE: "live" },
  );
  assert.equal(response.status, 404);
});

test("health rejects non-GET methods", async () => {
  const response = productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/health", { method: "POST" }),
    { APP_ENV: "production" },
  );
  assert.equal(response.status, 405);
});
