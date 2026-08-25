import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CartApiError,
  ensureOpenCart,
  getCart,
  readCartCsrfToken,
  setCartLineQuantity,
} from "../lib/commerce/preprod-cart-client.ts";

const csrf = "A".repeat(43);

function snapshot(overrides = {}) {
  return {
    status: "open",
    currency: "EUR",
    expiresAt: "2099-08-20T12:00:00.000Z",
    itemCount: 0,
    subtotalCents: 0,
    lines: [],
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

test("the browser helper reads only one valid CSRF cookie", () => {
  assert.equal(
    readCartCsrfToken(`__Host-aj_cart=hidden-session; __Host-aj_cart_csrf=${csrf}`),
    csrf,
  );
  assert.equal(readCartCsrfToken("__Host-aj_cart=hidden-session"), null);
  assert.equal(
    readCartCsrfToken(
      `__Host-aj_cart_csrf=${csrf}; __Host-aj_cart_csrf=${csrf}`,
    ),
    null,
  );
  assert.equal(readCartCsrfToken("__Host-aj_cart_csrf=short"), null);
});

test("cart requests are same-origin, no-store and use the CSRF token only for mutations", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "PUT") {
      const line = {
        variantId: "variant_boxer_pourpre_m",
        productId: "product_apollon",
        productSlug: "pourpre",
        colorKey: "pourpre",
        colorName: "Pourpre Impérial",
        size: "M",
        imageUrl: "/images/client/raw/product-card-pourpre.webp",
        quantity: 1,
        unitPriceCents: 2999,
        lineTotalCents: 2999,
        stockState: "available",
      };
      return Response.json({ data: snapshot({ itemCount: 1, subtotalCents: 2999, lines: [line] }) });
    }
    return Response.json({ data: snapshot() });
  };

  try {
    await withDocumentCookie(
      `__Host-aj_cart=not-visible-to-code; __Host-aj_cart_csrf=${csrf}`,
      async () => {
        await getCart();
        await ensureOpenCart();
        await setCartLineQuantity("variant_boxer_pourpre_m", 1);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls.map((call) => call.url), [
    "/api/preprod/cart",
    "/api/preprod/cart",
    "/api/preprod/cart/lines/variant_boxer_pourpre_m",
  ]);
  for (const call of calls) {
    assert.equal(call.init.credentials, "same-origin");
    assert.equal(call.init.cache, "no-store");
    assert.equal(JSON.stringify(call).includes("not-visible-to-code"), false);
  }
  assert.equal(calls[0].init.headers["X-CSRF-Token"], undefined);
  assert.equal(calls[1].init.headers["X-CSRF-Token"], csrf);
  assert.equal(calls[2].init.headers["X-CSRF-Token"], csrf);
  assert.equal(calls[2].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[2].init.body), { quantity: 1 });
});

test("the client rejects an internally inconsistent server total", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ data: snapshot({ subtotalCents: 1 }) });
  try {
    await assert.rejects(
      () => getCart(),
      (error) =>
        error instanceof CartApiError && error.code === "MALFORMED_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the client accepts the exact product slugs and color keys seeded by migration 0008", async () => {
  const originalFetch = globalThis.fetch;
  const migration = await readFile(
    new URL("../drizzle/0008_preprod_synthetic_demo_dataset.sql", import.meta.url),
    "utf8",
  );
  assert.match(
    migration,
    /'variant_boxer_rose-pale_m','AJ-APO-ROS-M','rose','Rose Velours'/,
  );
  assert.match(
    migration,
    /'variant_boxer_lilas-bleu-clair_m','AJ-APO-LIL-M','lilas','Lilas Céleste'/,
  );
  const seededLines = [
    {
      variantId: "variant_boxer_rose-pale_m",
      productSlug: "rose-pale",
      colorKey: "rose",
      colorName: "Rose Velours",
      size: "M",
      imageUrl: "/images/client/raw/product-card-rose.webp",
    },
    {
      variantId: "variant_boxer_lilas-bleu-clair_m",
      productSlug: "lilas-bleu-clair",
      colorKey: "lilas",
      colorName: "Lilas Céleste",
      size: "M",
      imageUrl: "/images/client/editorial-lilas-chair.webp",
    },
  ].map((line) => ({
    ...line,
    productId: "product_apollon",
    quantity: 1,
    unitPriceCents: 2999,
    lineTotalCents: 2999,
    stockState: "available",
  }));

  globalThis.fetch = async () =>
    Response.json({
      data: snapshot({
        itemCount: 2,
        subtotalCents: 5998,
        lines: seededLines,
      }),
    });
  try {
    const cart = await getCart();
    assert.deepEqual(
      cart.lines.map(({ productSlug, colorKey }) => ({ productSlug, colorKey })),
      [
        { productSlug: "rose-pale", colorKey: "rose" },
        { productSlug: "lilas-bleu-clair", colorKey: "lilas" },
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the client rejects malformed expiry and non-canonical catalogue fields", async () => {
  const originalFetch = globalThis.fetch;
  const validLine = {
    variantId: "variant_boxer_pourpre_m",
    productId: "product_apollon",
    productSlug: "pourpre",
    colorKey: "pourpre",
    colorName: "Pourpre Impérial",
    size: "M",
    imageUrl: "/images/client/raw/product-card-pourpre.webp",
    quantity: 1,
    unitPriceCents: 2999,
    lineTotalCents: 2999,
    stockState: "available",
  };
  const malformed = [
    snapshot({ expiresAt: "not-a-date" }),
    snapshot({ expiresAt: "2026-02-31T12:00:00.000Z" }),
    snapshot({
      itemCount: 1,
      subtotalCents: 2999,
      lines: [{ ...validLine, variantId: "" }],
    }),
    snapshot({
      itemCount: 1,
      subtotalCents: 2999,
      lines: [{ ...validLine, productSlug: "../checkout" }],
    }),
    snapshot({
      itemCount: 1,
      subtotalCents: 2999,
      lines: [{ ...validLine, size: "XXL" }],
    }),
  ];

  try {
    for (const candidate of malformed) {
      globalThis.fetch = async () => Response.json({ data: candidate });
      await assert.rejects(
        () => getCart(),
        (error) =>
          error instanceof CartApiError && error.code === "MALFORMED_RESPONSE",
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("product and cart UI have no demo cart or URL-variant path", async () => {
  const projectRoot = new URL("../", import.meta.url);
  const [purchase, page, cartClient, cartStyles] = await Promise.all([
    readFile(new URL("app/components/ProductPurchase.tsx", projectRoot), "utf8"),
    readFile(new URL("app/cart/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/cart/CartClient.tsx", projectRoot), "utf8"),
    readFile(new URL("app/cart/CommerceShell.module.css", projectRoot), "utf8"),
  ]);
  const source = `${purchase}\n${page}\n${cartClient}`;

  assert.doesNotMatch(source, /createDemoCart|cart\?variant|searchParams/);
  assert.doesNotMatch(source, /document\.cookie|__Host-aj_cart=/);
  assert.match(purchase, /href="\/cart"/);
  assert.match(purchase, /aria-busy=\{cartBusy\}/);
  assert.match(purchase, /cartRequestInFlight\.current = true/);
  assert.match(purchase, /kind: "success"; quantity: number; size: ProductSize/);
  assert.match(purchase, /AJ_APOLLON_PACK_PRICE_CENTS/);
  assert.match(purchase, /currentCart\.itemCount \+ selectedPackSize/);
  assert.match(purchase, /product\.sameColorPackBody/);
  assert.match(purchase, /product\.mixedColorPackBody/);
  assert.match(cartClient, /removeCartLine|setCartLineQuantity/);
  assert.match(cartClient, /mutationInFlight\.current = true/);
  assert.match(cartClient, /disabled=\{cartMutating/);
  assert.match(cartClient, /line\.stockState === "sold-out"/);
  assert.match(cartClient, /role="alert"[\s\S]*tabIndex=\{-1\}/);
  assert.match(cartClient, /role="group"[\s\S]*cart\.quantity/);
  assert.match(cartStyles, /\.quantityControl button,[\s\S]*min-height: 44px/);
  assert.match(cartStyles, /@media \(max-width: 360px\)/);
});

test("owner account keeps long order and tracking references inside narrow viewports", async () => {
  const projectRoot = new URL("../", import.meta.url);
  const [accountClient, commerceStyles] = await Promise.all([
    readFile(new URL("app/account/AccountClient.tsx", projectRoot), "utf8"),
    readFile(new URL("app/cart/CommerceShell.module.css", projectRoot), "utf8"),
  ]);

  assert.match(accountClient, /styles\.main\} \$\{styles\.accountMain/);
  assert.match(accountClient, /styles\.summary\} \$\{styles\.accountOrderSummary/);
  assert.match(accountClient, /className=\{styles\.orderNumber\}/);
  assert.match(
    commerceStyles,
    /\.accountMain > \*,[\s\S]*min-width: 0;[\s\S]*max-width: 100%;/,
  );
  assert.match(
    commerceStyles,
    /\.orderNumber,[\s\S]*overflow-wrap: anywhere;[\s\S]*word-break: normal;/,
  );
  assert.match(
    commerceStyles,
    /\.accountOrderSummary \.row > :last-child[\s\S]*white-space: nowrap;/,
  );
  assert.match(
    commerceStyles,
    /@media \(max-width: 800px\)[\s\S]*\.accountMain[\s\S]*grid-template-columns: minmax\(0, 1fr\);/,
  );
  assert.doesNotMatch(commerceStyles, /\.account(?:Main|OrderSummary)[^{]*\{[^}]*overflow-x:\s*hidden/s);
});
