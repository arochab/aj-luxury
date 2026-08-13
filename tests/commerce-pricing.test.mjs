import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatPrice, products } from "../lib/products.ts";

test("products and commerce variants share the approved 29.99 EUR price", () => {
  assert.equal(products.length, 3);
  assert.ok(products.every((product) => product.priceCents === 2999));

  const catalogSource = readFileSync(
    fileURLToPath(new URL("../lib/commerce/catalog.ts", import.meta.url)),
    "utf8",
  );
  assert.match(catalogSource, /amountCents:\s*product\.priceCents/);
  assert.doesNotMatch(catalogSource, /amountCents:\s*0/);
});

test("currency formatting follows the selected language", () => {
  assert.match(formatPrice(2999, "fr"), /29,99.*€/);
  assert.match(formatPrice(2999, "en"), /€29\.99/);
  assert.match(formatPrice(2999, "de"), /29,99.*€/);
  assert.match(formatPrice(2999, "es"), /29,99.*€/);
  assert.match(formatPrice(2999, "it"), /29,99.*€/);
});
