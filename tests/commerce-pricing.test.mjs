import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatPrice, products } from "../lib/products.ts";
import { calculateAjPackPricing } from "../lib/commerce/pack-pricing.ts";

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

test("packs price one, two or three real variants without synthetic stock", () => {
  const one = calculateAjPackPricing([{ quantity: 1, unitPriceCents: 2999 }]);
  const sameColourTwo = calculateAjPackPricing([{ quantity: 2, unitPriceCents: 2999 }]);
  const mixedThree = calculateAjPackPricing([
    { quantity: 1, unitPriceCents: 2999 },
    { quantity: 2, unitPriceCents: 2999 },
  ]);
  assert.deepEqual(one, {
    itemCount: 1, listSubtotalCents: 2999, discountCents: 0, subtotalCents: 2999,
  });
  assert.deepEqual(sameColourTwo, {
    itemCount: 2, listSubtotalCents: 5998, discountCents: 999, subtotalCents: 4999,
  });
  assert.deepEqual(mixedThree, {
    itemCount: 3, listSubtotalCents: 8997, discountCents: 1998, subtotalCents: 6999,
  });
  assert.throws(
    () => calculateAjPackPricing([{ quantity: 4, unitPriceCents: 2999 }]),
    /limited to three/,
  );
});
