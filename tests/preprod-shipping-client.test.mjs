import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parseShippingQuote,
  requestShippingQuote,
  shippingQuoteAttemptCanReplay,
  ShippingQuoteApiError,
} from "../lib/commerce/preprod-shipping-client.ts";
import {
  SYNTHETIC_DEMO_ADDRESS_FIXTURES,
  SYNTHETIC_DEMO_EMAIL,
} from "../lib/preprod/synthetic-demo.ts";

const csrf = "A".repeat(43);

function quote(overrides = {}) {
  return {
    quoteId: `quote_${"a".repeat(64)}`,
    simulation: true,
    carrierConnected: false,
    zone: "EU",
    amountCents: 1200,
    currency: "EUR",
    estimatedDaysMin: 2,
    estimatedDaysMax: 5,
    dutiesTerms: "EU_INCLUDED",
    expiresAt: "2099-08-20T12:00:00.000Z",
    parcel: {
      profileCode: "AJL_ENVELOPE_1_ITEM_V1",
      itemCount: 1,
      weightGrams: 150,
      lengthCm: 40,
      widthCm: 32,
      heightCm: 4,
    },
    cart: {
      status: "open",
      currency: "EUR",
      expiresAt: "2099-08-20T12:00:00.000Z",
      itemCount: 1,
      subtotalCents: 5900,
      lines: [{
        variantId: "variant_boxer_pourpre_m",
        productId: "product_apollon",
        productSlug: "pourpre",
        colorKey: "pourpre",
        colorName: "Pourpre Impérial",
        size: "M",
        imageUrl: "/images/client/raw/product-card-pourpre.webp",
        quantity: 1,
        unitPriceCents: 5900,
        lineTotalCents: 5900,
      }],
    },
    ...overrides,
  };
}

function withDocumentCookie(cookie, callback) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie },
  });
  return Promise.resolve(callback()).finally(() => {
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete globalThis.document;
  });
}

test("shipping client sends a same-origin protected request without leaking the session", async () => {
  const originalFetch = globalThis.fetch;
  let call;
  globalThis.fetch = async (url, init) => {
    call = { url, init };
    return Response.json({ data: quote() });
  };
  try {
    await withDocumentCookie(
      `__Host-aj_cart=hidden-session; __Host-aj_cart_csrf=${csrf}`,
      () => requestShippingQuote(
        {
          recipient: "Ada Test",
          line1: "1 rue du Test",
          postalCode: "75001",
          city: "Paris",
          countryCode: "FR",
        },
        "quote-attempt-00000001",
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(call.url, "/api/preprod/checkout/shipping-quote");
  assert.equal(call.init.credentials, "same-origin");
  assert.equal(call.init.cache, "no-store");
  assert.equal(call.init.headers["X-CSRF-Token"], csrf);
  assert.equal(call.init.headers["Idempotency-Key"], "quote-attempt-00000001");
  assert.equal(JSON.stringify(call).includes("hidden-session"), false);
  assert.deepEqual(JSON.parse(call.init.body), {
    address: {
      recipient: "Ada Test",
      line1: "1 rue du Test",
      postalCode: "75001",
      city: "Paris",
      countryCode: "FR",
    },
  });
});

test("shipping client rejects widened or contradictory server responses", () => {
  for (const candidate of [
    quote({ simulation: false }),
    quote({ carrierConnected: true }),
    quote({ amountCents: -1 }),
    quote({ zone: "WORLD" }),
    quote({ expiresAt: "invalid" }),
    quote({ parcel: {
      profileCode: "AJL_ENVELOPE_1_ITEM_V1", itemCount: 1, weightGrams: 130,
      lengthCm: 40, widthCm: 32, heightCm: 4,
    } }),
    quote({ parcel: {
      profileCode: "AJL_ENVELOPE_2_ITEMS_V1", itemCount: 2, weightGrams: 250,
      lengthCm: 40, widthCm: 32, heightCm: 4,
    } }),
    quote({ configurationId: "secret" }),
    quote({ estimatedDaysMin: 5, estimatedDaysMax: 2 }),
    quote({ cart: {
      status: "open", currency: "EUR", expiresAt: "2099-08-20T12:00:00.000Z",
      itemCount: 1, subtotalCents: 5900,
      lines: [{ stockState: "low-stock" }],
    } }),
    quote({ cart: {
      status: "empty", currency: "EUR", expiresAt: null,
      itemCount: 0, subtotalCents: 0, lines: [],
    } }),
  ]) {
    assert.throws(
      () => parseShippingQuote(candidate),
      (error) => error instanceof ShippingQuoteApiError && error.code === "MALFORMED_RESPONSE",
    );
  }
});

test("cart semantic changes rotate the quote key while ambiguous retries preserve it", () => {
  for (const code of [
    "CART_CHANGED", "CART_EMPTY", "CART_EXPIRED", "CART_NOT_FOUND",
    "PARCEL_CONFIGURATION_UNAVAILABLE",
  ]) {
    assert.equal(shippingQuoteAttemptCanReplay(code), false, code);
  }
  for (const code of [
    "NETWORK_UNAVAILABLE", "INTERNAL_ERROR", "CONFIGURATION_UNAVAILABLE",
    "OUT_OF_STOCK",
  ]) {
    assert.equal(shippingQuoteAttemptCanReplay(code), true, code);
  }
});

test("checkout UI remains real-cart, test-only payment and carrier-neutral", async () => {
  const project = new URL("../", import.meta.url);
  const [page, client, cart, styles] = await Promise.all([
    readFile(new URL("app/checkout/page.tsx", project), "utf8"),
    readFile(new URL("app/checkout/CheckoutClient.tsx", project), "utf8"),
    readFile(new URL("app/cart/CartClient.tsx", project), "utf8"),
    readFile(new URL("app/cart/CommerceShell.module.css", project), "utf8"),
  ]);
  const source = `${page}\n${client}\n${cart}`;
  assert.doesNotMatch(source, /createDemoCart|searchParams|cart\?variant|DHL|FedEx|UPS/);
  assert.match(client, /requestShippingQuote/);
  assert.match(client, /getCart/);
  assert.match(client, /crypto\.randomUUID\(\)/);
  assert.match(client, /attemptRef\.current = null/);
  assert.match(client, /shippingQuoteAttemptCanReplay/);
  assert.match(client, /quote\.parcel\.weightGrams/);
  assert.match(client, /checkout\.parcelProfile/);
  assert.match(client, /createPreprodOrder/);
  assert.match(client, /payPreprodOrder/);
  assert.match(client, /getCurrentPreprodOrder/);
  assert.equal(SYNTHETIC_DEMO_EMAIL, "client@demo.invalid");
  assert.match(client, /value=\{SYNTHETIC_DEMO_EMAIL\}/);
  assert.match(client, /email: SYNTHETIC_DEMO_EMAIL/);
  assert.match(client, /disabled=\{submitting\}/);
  assert.match(client, /checkout\.simulationAck/);
  assert.match(client, /checkout\.noDebitNoEmail/);
  assert.deepEqual(
    SYNTHETIC_DEMO_ADDRESS_FIXTURES.map(({ zone }) => zone),
    ["EU", "UK", "US", "CA"],
  );
  assert.match(cart, /href="\/checkout"/);
  assert.match(styles, /\.form select[\s\S]*min-height: 48px/);
  assert.match(styles, /@media \(max-width: 800px\)/);
  assert.match(styles, /@media \(max-width: 360px\)/);
});
