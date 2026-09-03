import assert from "node:assert/strict";
import test from "node:test";
import { productionHttpsRedirectResponse } from "../worker/production-https-redirect.ts";

const production = Object.freeze({
  APP_ENV: "production",
  COMMERCE_ORIGIN: "https://ajluxurystore.com",
});

test("production HTTP storefront upgrades permanently before commerce handling", () => {
  const response = productionHttpsRedirectResponse(
    new Request("http://ajluxurystore.com/account?returnTo=%2Fcheckout"),
    production,
  );

  assert.ok(response);
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    "https://ajluxurystore.com/account?returnTo=%2Fcheckout",
  );
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000");
});

test("the legacy www HTTP hostname canonicalizes to the secure apex", () => {
  const response = productionHttpsRedirectResponse(
    new Request("http://www.ajluxurystore.com/cart"),
    production,
  );

  assert.ok(response);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("Location"), "https://ajluxurystore.com/cart");
});

test("HTTPS, non-production and internal hosts are untouched", () => {
  assert.equal(
    productionHttpsRedirectResponse(
      new Request("https://ajluxurystore.com/cart"),
      production,
    ),
    null,
  );
  assert.equal(
    productionHttpsRedirectResponse(
      new Request("http://ajluxurystore.com/cart"),
      { ...production, APP_ENV: "preview" },
    ),
    null,
  );
  assert.equal(
    productionHttpsRedirectResponse(
      new Request("http://aj-luxury-production.example.workers.dev/api/commerce/cart"),
      production,
    ),
    null,
  );
});

test("an invalid canonical origin fails closed without inventing a redirect", () => {
  assert.equal(
    productionHttpsRedirectResponse(
      new Request("http://ajluxurystore.com/cart"),
      { APP_ENV: "production", COMMERCE_ORIGIN: "http://ajluxurystore.com" },
    ),
    null,
  );
});
