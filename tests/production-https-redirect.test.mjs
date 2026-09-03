import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import JSON5 from "json5";
import { productionHttpsRedirectResponse } from "../worker/production-https-redirect.ts";

const projectRoot = new URL("../", import.meta.url);
const production = Object.freeze({
  APP_ENV: "production",
  COMMERCE_ORIGIN: "https://ajluxurystore.com",
});

test("every production page reaches the Worker before static assets are served", async () => {
  const source = await readFile(new URL("cloudflare.production.jsonc", projectRoot), "utf8");
  const config = JSON5.parse(source);
  assert.deepEqual(config.assets.run_worker_first, ["/*"]);
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

test("the legacy www HTTPS hostname canonicalizes to the secure apex", () => {
  const response = productionHttpsRedirectResponse(
    new Request("https://www.ajluxurystore.com/shop?utm_source=google"),
    production,
  );

  assert.ok(response);
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    "https://ajluxurystore.com/shop?utm_source=google",
  );
});

test("internal release markers are removed without losing useful parameters", () => {
  const response = productionHttpsRedirectResponse(
    new Request(
      "https://ajluxurystore.com/?release=94d4376&utm_source=call",
    ),
    production,
  );

  assert.ok(response);
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    "https://ajluxurystore.com/?utm_source=call",
  );
});

test("the retired private launch page permanently redirects to the public home", () => {
  const response = productionHttpsRedirectResponse(
    new Request(
      "https://ajluxurystore.com/preouverture?utm_source=old-bookmark",
    ),
    production,
  );

  assert.ok(response);
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    "https://ajluxurystore.com/?utm_source=old-bookmark",
  );
});

test("the retired Cloudflare operations bookmark redirects to native admin login", () => {
  const response = productionHttpsRedirectResponse(
    new Request(
      "https://ajluxurystore.com/operations?source=old-bookmark",
    ),
    production,
  );

  assert.ok(response);
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    "https://ajluxurystore.com/admin?source=old-bookmark",
  );
});

test("canonical HTTPS, non-production and internal hosts are untouched", () => {
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
