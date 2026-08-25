import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  commerceApiPath,
  resolveCommerceRuntimeMode,
} from "../lib/commerce/commerce-runtime.ts";
import {
  ensureOpenCart,
  getCart,
  setCartLineQuantity,
} from "../lib/commerce/preprod-cart-client.ts";
import {
  parseProductionDeliveryOptions,
  parseProductionServicePoints,
  requestProductionDeliveryOptions,
  requestProductionServicePoints,
  selectProductionDeliveryOption,
} from "../lib/commerce/production-delivery-client.ts";
import {
  createProductionPaymentSession,
  parseProductionOrder,
} from "../lib/commerce/production-order-client.ts";

const csrf = "A".repeat(43);

function cartSnapshot() {
  return {
    status: "empty",
    currency: "EUR",
    expiresAt: null,
    itemCount: 0,
    subtotalCents: 0,
    lines: [],
  };
}

function productionOptions() {
  return [{
      optionId: `delivery_${"b".repeat(64)}`,
      quoteId: `quote_${"a".repeat(64)}`,
      carrierCode: "colissimo",
      serviceCode: "home-standard",
      displayName: "Livraison à domicile",
      deliveryMode: "home",
      amountCents: 700,
      currency: "EUR",
      estimatedDaysMin: 2,
      estimatedDaysMax: 4,
      dutiesTerms: "EU_INCLUDED",
      expiresAt: "2099-08-20T12:00:00.000Z",
    }, {
      optionId: `delivery_${"c".repeat(64)}`,
      quoteId: `quote_${"d".repeat(64)}`,
      carrierCode: "mondial-relay",
      serviceCode: "service-point",
      displayName: "Livraison en point relais",
      deliveryMode: "service_point",
      amountCents: 550,
      currency: "EUR",
      estimatedDaysMin: 3,
      estimatedDaysMax: 5,
      dutiesTerms: "EU_INCLUDED",
      expiresAt: "2099-08-20T12:00:00.000Z",
    }];
}

function productionPoints() {
  return [{
    servicePointId: `point_${"e".repeat(64)}`,
    optionId: productionOptions()[1].optionId,
    displayName: "Relais Central",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
    openingHoursSummary: null,
    expiresAt: "2099-08-20T12:00:00.000Z",
  }];
}

function withDocumentCookie(callback) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: `__Host-aj_cart_csrf=${csrf}` },
  });
  return Promise.resolve(callback()).finally(() => {
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete globalThis.document;
  });
}

test("commerce mode is strict, server-supplied and fail-closed", () => {
  assert.equal(resolveCommerceRuntimeMode("preproduction"), "preproduction");
  assert.equal(resolveCommerceRuntimeMode("production"), "production");
  for (const value of [undefined, null, "", "preview", "PRODUCTION"]) {
    assert.equal(resolveCommerceRuntimeMode(value), "closed");
  }
  assert.equal(commerceApiPath("preproduction", "/cart"), "/api/preprod/cart");
  assert.equal(commerceApiPath("production", "/cart"), "/api/commerce/cart");
  assert.throws(() => commerceApiPath("production", "//evil"), TypeError);
});

test("production cart mutations require and replay the exact attempt key", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    return Response.json({ data: cartSnapshot() });
  };
  try {
    await withDocumentCookie(async () => {
      await getCart("production");
      await ensureOpenCart("production", "cart-create-attempt-0001");
      await setCartLineQuantity(
        "variant_boxer_pourpre_m",
        1,
        "production",
        "cart-line-attempt-0001",
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(calls.map(({ path }) => path), [
    "/api/commerce/cart",
    "/api/commerce/cart",
    "/api/commerce/cart/lines/variant_boxer_pourpre_m",
  ]);
  assert.equal(calls[1].init.headers["Idempotency-Key"], "cart-create-attempt-0001");
  assert.equal(calls[2].init.headers["X-CSRF-Token"], csrf);
  assert.equal(calls[2].init.headers["Idempotency-Key"], "cart-line-attempt-0001");
  await withDocumentCookie(() => assert.throws(
    () => setCartLineQuantity("variant_boxer_pourpre_m", 1, "production"),
    /IDEMPOTENCY_KEY_REQUIRED/,
  ));
});

test("an ambiguous cart network retry keeps the caller's semantic key", async () => {
  const originalFetch = globalThis.fetch;
  const keys = [];
  globalThis.fetch = async (_path, init) => {
    keys.push(init.headers["Idempotency-Key"]);
    if (keys.length === 1) throw new TypeError("connection reset");
    return Response.json({ data: cartSnapshot() });
  };
  try {
    await withDocumentCookie(async () => {
      await assert.rejects(
        () => setCartLineQuantity(
          "variant_boxer_pourpre_m", 1, "production", "stable-line-attempt-0001",
        ),
        /NETWORK_UNAVAILABLE/,
      );
      await setCartLineQuantity(
        "variant_boxer_pourpre_m", 1, "production", "stable-line-attempt-0001",
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(keys, ["stable-line-attempt-0001", "stable-line-attempt-0001"]);
});

test("production delivery parser matches home and encrypted relay contracts", () => {
  const parsed = parseProductionDeliveryOptions(productionOptions());
  assert.equal(parsed[0].optionId, `delivery_${"b".repeat(64)}`);
  assert.equal(parsed[0].deliveryMode, "home");
  assert.throws(
    () => parseProductionDeliveryOptions({ options: productionOptions() }),
    /MALFORMED_RESPONSE/,
  );
  assert.equal(parsed[1].deliveryMode, "service_point");
  assert.equal(
    parseProductionServicePoints(productionPoints(), parsed[1].optionId)[0].city,
    "Paris",
  );
  assert.throws(() => parseProductionServicePoints(productionPoints(), parsed[0].optionId), /MALFORMED_RESPONSE/);
});

test("production quote and selection use the exact router response envelopes", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    return Response.json({
      data: calls.length === 1 ? productionOptions() : productionOptions()[0],
    });
  };
  const address = {
    recipient: "Ada Client",
    line1: "1 rue du Test",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
  };
  try {
    await withDocumentCookie(async () => {
      const options = await requestProductionDeliveryOptions(
        address,
        "delivery-options-0001",
      );
      await selectProductionDeliveryOption(
        options[0].optionId,
        address,
        "delivery-select-0001",
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(calls.map(({ path }) => path), [
    "/api/commerce/checkout/delivery-options",
    "/api/commerce/checkout/delivery-options/select",
  ]);
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    address,
    optionId: productionOptions()[0].optionId,
  });
});

test("production relay lookup and exact point selection use canonical routes", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    return Response.json({
      data: calls.length === 1 ? productionPoints() : productionOptions()[1],
    });
  };
  const address = {
    recipient: "Ada Client",
    line1: "1 rue du Test",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
  };
  try {
    await withDocumentCookie(async () => {
      const points = await requestProductionServicePoints(
        productionOptions()[1].optionId,
        address,
        "delivery-points-0001",
      );
      await selectProductionDeliveryOption(
        productionOptions()[1].optionId,
        address,
        "delivery-relay-select-0001",
        points[0].servicePointId,
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(calls.map(({ path }) => path), [
    "/api/commerce/checkout/service-points",
    "/api/commerce/checkout/delivery-options/select",
  ]);
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    address,
    optionId: productionOptions()[1].optionId,
    servicePointId: productionPoints()[0].servicePointId,
  });
});

test("production orders reject test identifiers and synthetic response fields", () => {
  const order = {
    orderNumber: `AJ-${"A".repeat(20)}`,
    status: "pending_payment",
    currency: "EUR",
    subtotalCents: 2999,
    shippingCents: 700,
    totalCents: 3699,
    createdAt: "2026-08-15T12:00:00.000Z",
    paidAt: null,
    lines: [{
      productName: "Apollon",
      colorName: "Pourpre Impérial",
      size: "M",
      quantity: 1,
      unitPriceCents: 2999,
      lineTotalCents: 2999,
    }],
  };
  assert.equal(parseProductionOrder(order).orderNumber, order.orderNumber);
  assert.throws(
    () => parseProductionOrder({ ...order, orderNumber: `AJ-TEST-${"A".repeat(24)}` }),
    /MALFORMED_RESPONSE/,
  );
  assert.throws(
    () => parseProductionOrder({ ...order, simulation: false }),
    /MALFORMED_RESPONSE/,
  );
});

test("payment uses the canonical session route and accepts only Stripe Checkout", async () => {
  const originalFetch = globalThis.fetch;
  let call;
  globalThis.fetch = async (path, init) => {
    call = { path, init };
    return Response.json({
      data: { url: "https://checkout.stripe.com/c/pay/cs_live_example" },
    });
  };
  try {
    const url = await withDocumentCookie(
      () => createProductionPaymentSession("payment-attempt-0001"),
    );
    assert.equal(url, "https://checkout.stripe.com/c/pay/cs_live_example");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(call.path, "/api/commerce/checkout/payment-session");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.body, undefined);
  assert.equal(call.init.headers.get("Idempotency-Key"), "payment-attempt-0001");

  globalThis.fetch = async () => Response.json({
    data: { url: "https://checkout.stripe.com.evil.example/c/pay/escape" },
  });
  try {
    await assert.rejects(
      () => withDocumentCookie(
        () => createProductionPaymentSession("payment-attempt-0002"),
      ),
      /MALFORMED_RESPONSE/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production UI wiring contains no synthetic payment or hostname switch", async () => {
  const sources = await Promise.all([
    "../app/checkout/ProductionCheckoutClient.tsx",
    "../app/checkout/page.tsx",
    "../app/checkout/success/page.tsx",
    "../app/checkout/success/ProductionCheckoutSuccessClient.tsx",
    "../app/account/ProductionAccountClient.tsx",
    "../lib/commerce/commerce-runtime.ts",
    "../lib/commerce/production-order-client.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const joined = sources.join("\n");
  assert.doesNotMatch(joined, /test-payment|SYNTHETIC_DEMO|location\.hostname/i);
  assert.match(joined, /\/checkout\/payment-session/);
  assert.match(joined, /runtimeMode === "production"/);
  assert.doesNotMatch(joined, /useSearchParams|session_id/);
  assert.match(joined, /MAX_POLLS = 5/);
});

test("production checkout exposes the 27 EU countries and no non-EU destination", async () => {
  const source = await readFile(
    new URL("../app/checkout/ProductionCheckoutClient.tsx", import.meta.url),
    "utf8",
  );
  const block = source.match(/const launchCountries = Object\.freeze\(\[([\s\S]*?)\] as const\)/)?.[1] ?? "";
  const countryCodes = [...block.matchAll(/\["([A-Z]{2})",/g)].map((match) => match[1]);
  assert.equal(countryCodes.length, 27);
  assert.equal(new Set(countryCodes).size, 27);
  assert.ok(countryCodes.includes("FR"));
  assert.ok(countryCodes.includes("DE"));
  assert.ok(countryCodes.includes("IE"));
  assert.ok(!countryCodes.includes("GB"));
  assert.ok(!countryCodes.includes("US"));
  assert.ok(!countryCodes.includes("CA"));
});

test("mock product availability has no authority over production sizes", async () => {
  const source = await readFile(
    new URL("../app/components/ProductPurchase.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /if \(runtimeMode === "production"\) \{\s*return t\("product\.stockCheckedAtAdd"\)/,
  );
  assert.match(
    source,
    /const soldOut = runtimeMode === "preproduction" &&\s*availability\[size\]\.state === "sold-out"/,
  );
  assert.doesNotMatch(source, /runtimeMode === "production"[\s\S]{0,120}cart\.stockVerified/);
});
