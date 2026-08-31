import assert from "node:assert/strict";
import test from "node:test";

import {
  fingerprintCartLines,
  fingerprintReturnDeclaration,
  fulfillmentProvidersClosed,
  normalizeShippingAddress,
} from "../lib/commerce/fulfillment-domain.ts";

const addresses = Object.freeze({
  EU: {
    recipient: "Ada Lovelace",
    line1: "1 rue de la Paix",
    postalCode: "75001",
    city: "Paris",
    countryCode: "fr",
  },
  UK: {
    recipient: "Alan Turing",
    line1: "1 King Street",
    postalCode: "SW1A 1AA",
    city: "London",
    countryCode: "GB",
    phone: "+447700900123",
  },
  US: {
    recipient: "Grace Hopper",
    line1: "1 Main Street",
    postalCode: "10001",
    city: "New York",
    regionCode: "NY",
    countryCode: "US",
    phone: "+12025550123",
  },
  CA: {
    recipient: "James Gosling",
    line1: "1 Queen Street",
    postalCode: "M5H 2N2",
    city: "Toronto",
    regionCode: "ON",
    countryCode: "CA",
    phone: "+14165550123",
  },
});

test("address normalization resolves the controlled EU and international scope deterministically", async () => {
  for (const [zone, input] of Object.entries(addresses)) {
    const first = await normalizeShippingAddress(input);
    const second = await normalizeShippingAddress({ ...input });
    assert.equal(first.zone, zone);
    assert.equal(first.fingerprint, second.fingerprint);
    assert.equal(first.canonicalJson, second.canonicalJson);
    assert.match(first.fingerprint, /^[0-9a-f]{64}$/);
  }
  await assert.rejects(
    () => normalizeShippingAddress({
      recipient: "Outside",
      line1: "1 George Street",
      postalCode: "2000",
      city: "Sydney",
      countryCode: "AU",
    }),
    (error) => error?.code === "DESTINATION_UNAVAILABLE",
  );
  await assert.rejects(
    () => normalizeShippingAddress({
      ...addresses.US,
      phone: undefined,
    }),
    (error) => error?.code === "INVALID_INPUT",
  );
  await assert.rejects(
    () => normalizeShippingAddress({
      ...addresses.EU,
      postalCode: "97100",
    }),
    (error) => error?.code === "DESTINATION_UNAVAILABLE",
  );
  await assert.rejects(
    () => normalizeShippingAddress({
      ...addresses.US,
      regionCode: "PR",
      postalCode: "00901",
    }),
    (error) => error?.code === "DESTINATION_UNAVAILABLE",
  );
});

test("cart and return fingerprints are order-independent and reject malformed lines", async () => {
  const lines = [
    { variantId: "variant_b", quantity: 2, unitPriceCents: 2_999 },
    { variantId: "variant_a", quantity: 1, unitPriceCents: 2_999 },
  ];
  assert.equal(
    await fingerprintCartLines("cart_1", lines),
    await fingerprintCartLines("cart_1", [...lines].reverse()),
  );
  const declaration = [
    { orderLineId: "line_b", quantity: 1 },
    { orderLineId: "line_a", quantity: 2 },
  ];
  assert.equal(
    await fingerprintReturnDeclaration("order_1", "withdrawal", declaration),
    await fingerprintReturnDeclaration(
      "order_1",
      "withdrawal",
      [...declaration].reverse(),
    ),
  );
  await assert.rejects(
    () => fingerprintReturnDeclaration("order_1", "return", [
      { orderLineId: "line_a", quantity: 1 },
      { orderLineId: "line_a", quantity: 1 },
    ]),
    /duplicate/i,
  );
});

test("all external fulfillment providers remain closed by default", () => {
  assert.deepEqual(fulfillmentProvidersClosed, {
    shippingLabel: {
      available: false,
      reason: "shipping-label-provider-not-configured",
    },
    tracking: {
      available: false,
      reason: "tracking-provider-not-configured",
    },
    refund: {
      available: false,
      reason: "refund-provider-not-configured",
    },
  });
});
