import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parseShippingQuote,
  requestShippingQuote,
  shippingQuoteAttemptCanReplay,
  ShippingQuoteApiError,
} from "../lib/commerce/preprod-shipping-client.ts";

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
    cart: {
      status: "open",
      currency: "EUR",
      expiresAt: "2099-08-20T12:00:00.000Z",
      itemCount: 0,
      subtotalCents: 0,
      lines: [],
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
  for (const code of ["CART_CHANGED", "CART_EMPTY", "CART_EXPIRED", "CART_NOT_FOUND"]) {
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
  assert.match(client, /createPreprodOrder/);
  assert.match(client, /payPreprodOrder/);
  assert.match(client, /getCurrentPreprodOrder/);
  assert.match(client, /@demo\.invalid/);
  assert.match(client, /checkout\.simulationAck/);
  assert.match(client, /checkout\.noDebitNoEmail/);
  assert.match(client, /countryCode === "US"/);
  assert.match(cart, /href="\/checkout"/);
  assert.match(styles, /\.form select[\s\S]*min-height: 48px/);
  assert.match(styles, /@media \(max-width: 800px\)/);
  assert.match(styles, /@media \(max-width: 360px\)/);
});
