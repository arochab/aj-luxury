import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as analyticsPublicApi from "../lib/analytics/index.ts";
import { createServerOrderPaidEmitter } from "../lib/analytics/server.ts";

const {
  ANALYTICS_UTM_KEYS,
  CLIENT_ANALYTICS_EVENT_NAMES,
  CLIENT_ANALYTICS_INPUT_FIELD_ALLOWLIST,
  createAnalyticsConsentController,
  createClientAnalyticsFacade,
  sanitizeAnalyticsContext,
  sanitizeAnalyticsPath,
  sanitizeReferrerOrigin,
} = analyticsPublicApi;

const TEST_POLICY = {
  canonicalOrigin: "https://ajluxurystore.com",
  allowedPaths: ["/", "/products/rose-pale", "/products/lilas-bleu-clair", "/checkout"],
  catalog: {
    variants: [
      {
        variantId: "variant_boxer_rose-pale_xl",
        productId: "apollon-rose",
        unitPriceMinor: 2999,
        currency: "EUR",
      },
      {
        variantId: "variant_boxer_rose-pale_m",
        productId: "apollon-rose",
        unitPriceMinor: 2999,
        currency: "EUR",
      },
      {
        variantId: "variant_boxer_lilas-bleu-clair_m",
        productId: "apollon-lilas",
        unitPriceMinor: 2999,
        currency: "EUR",
      },
    ],
  },
  attribution: {
    allowedReferrerOrigins: [
      "https://instagram.com",
      "https://www.google.com",
    ],
    allowedUtmValues: {
      utm_source: ["instagram"],
      utm_medium: ["paid-social"],
      utm_campaign: ["lancement_apollon", "Lancement Apollon"],
    },
  },
};

const CANONICAL_PRODUCT_CONTEXT = {
  url: "https://ajluxurystore.com/products/rose-pale",
};

function createRecordingCollector() {
  const events = [];
  return {
    events,
    collect(event) {
      events.push(structuredClone(event));
    },
  };
}

function flushDeferredCollection() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("the public client schema exposes only three browser events", () => {
  assert.deepEqual(CLIENT_ANALYTICS_EVENT_NAMES, [
    "product_view",
    "add_to_cart",
    "checkout_started",
  ]);
  assert.deepEqual(CLIENT_ANALYTICS_INPUT_FIELD_ALLOWLIST, {
    product_view: ["productId", "variantId"],
    add_to_cart: ["productId", "variantId", "quantity"],
    checkout_started: ["lines"],
  });
  assert.deepEqual(ANALYTICS_UTM_KEYS, [
    "utm_source",
    "utm_medium",
    "utm_campaign",
  ]);
  assert.equal("ANALYTICS_EVENT_NAMES" in analyticsPublicApi, false);
  assert.equal("SERVER_ANALYTICS_EVENT_NAMES" in analyticsPublicApi, false);
  assert.equal("createServerOrderPaidEmitter" in analyticsPublicApi, false);
  assert.equal("deferAnalyticsEvent" in analyticsPublicApi, false);
  assert.equal("AnalyticsCollector" in analyticsPublicApi, false);
});

test("unknown and denied consent fail closed without scheduling events", async () => {
  const consent = createAnalyticsConsentController();
  const recording = createRecordingCollector();
  const analytics = createClientAnalyticsFacade({
    consent,
    collect: recording.collect,
    policy: TEST_POLICY,
  });

  assert.deepEqual(
    analytics.track(
      "product_view",
      { productId: "apollon-rose" },
      CANONICAL_PRODUCT_CONTEXT,
    ),
    { accepted: false, reason: "consent_not_granted" },
  );
  consent.setState("denied");
  assert.deepEqual(
    analytics.track(
      "product_view",
      { productId: "apollon-rose" },
      CANONICAL_PRODUCT_CONTEXT,
    ),
    { accepted: false, reason: "consent_not_granted" },
  );
  await flushDeferredCollection();
  assert.equal(recording.events.length, 0);
});

test("consent withdrawal is effective for the next event", async () => {
  const consent = createAnalyticsConsentController("granted");
  const recording = createRecordingCollector();
  const analytics = createClientAnalyticsFacade({
    consent,
    collect: recording.collect,
    policy: TEST_POLICY,
  });

  assert.deepEqual(
    analytics.track(
      "product_view",
      { productId: "apollon-rose" },
      CANONICAL_PRODUCT_CONTEXT,
    ),
    { accepted: true },
  );
  consent.setState("denied");
  assert.deepEqual(
    analytics.track(
      "product_view",
      { productId: "apollon-lilas" },
      { url: "https://ajluxurystore.com/products/lilas-bleu-clair" },
    ),
    { accepted: false, reason: "consent_not_granted" },
  );
  await flushDeferredCollection();
  assert.equal(recording.events.length, 1);
  consent.reset();
  assert.equal(consent.getState(), "unknown");
});

test("paths require the exact configured canonical origin", () => {
  assert.equal(
    sanitizeAnalyticsPath(
      "https://ajluxurystore.com/products/rose-pale?email=private@example.com",
      TEST_POLICY.allowedPaths,
      TEST_POLICY.canonicalOrigin,
    ),
    "/products/rose-pale",
  );
  for (const url of [
    "https://www.ajluxurystore.com/products/rose-pale",
    "http://ajluxurystore.com/products/rose-pale",
    "https://attacker.example/products/rose-pale",
    "https://ajluxurystore.com/account",
  ]) {
    assert.equal(
      sanitizeAnalyticsPath(
        url,
        TEST_POLICY.allowedPaths,
        TEST_POLICY.canonicalOrigin,
      ),
      "/:redacted",
    );
    assert.equal(sanitizeAnalyticsContext({ url }, TEST_POLICY), null);
  }

  assert.equal(
    sanitizeAnalyticsContext(CANONICAL_PRODUCT_CONTEXT, {
      ...TEST_POLICY,
      canonicalOrigin: "https://ajluxurystore.com/shop",
    }),
    null,
  );
});

test("referrer and UTM attribution require exact governed values", () => {
  assert.equal(
    sanitizeReferrerOrigin(
      "https://www.google.com/search?q=aj+luxury&email=private@example.com",
      TEST_POLICY.attribution.allowedReferrerOrigins,
    ),
    "https://www.google.com",
  );
  assert.deepEqual(
    sanitizeAnalyticsContext(
      {
        url: "https://ajluxurystore.com/products/rose-pale?utm_source=instagram&utm_medium=paid-social&utm_campaign=lancement_apollon&utm_content=private%40example.com",
        referrer: "https://instagram.com/private?token=secret",
        utm: { utm_campaign: "Lancement Apollon" },
      },
      TEST_POLICY,
    ),
    {
      path: "/products/rose-pale",
      referrerOrigin: "https://instagram.com",
      utm: {
        utm_source: "instagram",
        utm_medium: "paid-social",
        utm_campaign: "Lancement Apollon",
      },
    },
  );
});

test("add_to_cart derives price and currency from its governed variant", async () => {
  const recording = createRecordingCollector();
  const analytics = createClientAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    collect: recording.collect,
    policy: TEST_POLICY,
    clock: () => new Date("2026-08-10T12:00:00.000Z"),
  });

  assert.deepEqual(
    analytics.track(
      "add_to_cart",
      {
        productId: "apollon-rose",
        variantId: "variant_boxer_rose-pale_xl",
        quantity: 2,
      },
      CANONICAL_PRODUCT_CONTEXT,
    ),
    { accepted: true },
  );
  await flushDeferredCollection();
  assert.deepEqual(recording.events[0], {
    schemaVersion: 2,
    name: "add_to_cart",
    occurredAt: "2026-08-10T12:00:00.000Z",
    context: { path: "/products/rose-pale" },
    payload: {
      productId: "apollon-rose",
      variantId: "variant_boxer_rose-pale_xl",
      quantity: 2,
      valueMinor: 5998,
      currency: "EUR",
    },
  });
});

test("product and variant relationships fail closed", async () => {
  const recording = createRecordingCollector();
  const analytics = createClientAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    collect: recording.collect,
    policy: TEST_POLICY,
  });

  const rejected = [
    analytics.track(
      "product_view",
      {
        productId: "apollon-lilas",
        variantId: "variant_boxer_rose-pale_xl",
      },
      CANONICAL_PRODUCT_CONTEXT,
    ),
    analytics.track(
      "add_to_cart",
      {
        productId: "apollon-lilas",
        variantId: "variant_boxer_rose-pale_xl",
        quantity: 1,
      },
      CANONICAL_PRODUCT_CONTEXT,
    ),
    analytics.track(
      "add_to_cart",
      {
        productId: "apollon-rose",
        variantId: "variant_boxer_rose-pale_xl",
        quantity: 1,
        valueMinor: 1,
        currency: "USD",
      },
      CANONICAL_PRODUCT_CONTEXT,
    ),
  ];
  for (const result of rejected) {
    assert.deepEqual(result, { accepted: false, reason: "invalid_event" });
  }
  await flushDeferredCollection();
  assert.equal(recording.events.length, 0);
});

test("checkout totals are derived from governed lines", async () => {
  const recording = createRecordingCollector();
  const analytics = createClientAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    collect: recording.collect,
    policy: TEST_POLICY,
  });

  assert.deepEqual(
    analytics.track(
      "checkout_started",
      {
        lines: [
          { variantId: "variant_boxer_rose-pale_xl", quantity: 2 },
          { variantId: "variant_boxer_lilas-bleu-clair_m", quantity: 1 },
        ],
      },
      { url: "https://ajluxurystore.com/checkout" },
    ),
    { accepted: true },
  );
  await flushDeferredCollection();
  assert.deepEqual(recording.events[0].payload, {
    itemCount: 3,
    valueMinor: 8997,
    currency: "EUR",
  });
});

test("invalid, duplicate and mixed-currency catalogue policies fail closed", async () => {
  const policies = [
    {
      ...TEST_POLICY,
      catalog: {
        variants: [
          ...TEST_POLICY.catalog.variants,
          { ...TEST_POLICY.catalog.variants[0] },
        ],
      },
    },
    {
      ...TEST_POLICY,
      catalog: {
        variants: [
          TEST_POLICY.catalog.variants[0],
          {
            variantId: "variant_usd",
            productId: "apollon-rose",
            unitPriceMinor: 2999,
            currency: "USD",
          },
        ],
      },
    },
  ];

  const duplicateCollector = createRecordingCollector();
  const duplicateAnalytics = createClientAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    collect: duplicateCollector.collect,
    policy: policies[0],
  });
  assert.deepEqual(
    duplicateAnalytics.track(
      "product_view",
      { productId: "apollon-rose" },
      CANONICAL_PRODUCT_CONTEXT,
    ),
    { accepted: false, reason: "invalid_event" },
  );

  const mixedCollector = createRecordingCollector();
  const mixedAnalytics = createClientAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    collect: mixedCollector.collect,
    policy: policies[1],
  });
  assert.deepEqual(
    mixedAnalytics.track(
      "checkout_started",
      {
        lines: [
          { variantId: "variant_boxer_rose-pale_xl", quantity: 1 },
          { variantId: "variant_usd", quantity: 1 },
        ],
      },
      { url: "https://ajluxurystore.com/checkout" },
    ),
    { accepted: false, reason: "invalid_event" },
  );
  await flushDeferredCollection();
  assert.equal(duplicateCollector.events.length, 0);
  assert.equal(mixedCollector.events.length, 0);
});

test("order_paid is emitted only by the explicit server module", async () => {
  const recording = createRecordingCollector();
  const consent = createAnalyticsConsentController("granted");
  const server = createServerOrderPaidEmitter({
    consent,
    collect: recording.collect,
    policy: TEST_POLICY,
    clock: () => new Date("2026-08-10T12:05:00.000Z"),
  });

  const client = createClientAnalyticsFacade({
    consent,
    collect: recording.collect,
    policy: TEST_POLICY,
  });
  assert.deepEqual(
    client.track(
      "order_paid",
      { lines: [{ variantId: "variant_boxer_rose-pale_xl", quantity: 1 }] },
      { url: "https://ajluxurystore.com/checkout" },
    ),
    { accepted: false, reason: "invalid_event" },
  );

  assert.deepEqual(
    server.emit({
      lines: [
        { variantId: "variant_boxer_rose-pale_xl", quantity: 1 },
        { variantId: "variant_boxer_lilas-bleu-clair_m", quantity: 1 },
      ],
    }),
    { accepted: true },
  );
  await flushDeferredCollection();
  assert.equal(recording.events.length, 1);
  assert.deepEqual(recording.events[0], {
    schemaVersion: 2,
    name: "order_paid",
    occurredAt: "2026-08-10T12:05:00.000Z",
    context: { path: "/checkout" },
    payload: { itemCount: 2, valueMinor: 5998, currency: "EUR" },
  });
});

test("server order_paid remains consent gated", async () => {
  const recording = createRecordingCollector();
  const server = createServerOrderPaidEmitter({
    consent: createAnalyticsConsentController("unknown"),
    collect: recording.collect,
    policy: TEST_POLICY,
  });
  assert.deepEqual(
    server.emit({
      lines: [{ variantId: "variant_boxer_rose-pale_xl", quantity: 1 }],
    }),
    { accepted: false, reason: "consent_not_granted" },
  );
  await flushDeferredCollection();
  assert.equal(recording.events.length, 0);
});

test("slow and throwing collectors start later and never block track", async () => {
  let slowCollectorStarted = false;
  const neverResolves = new Promise(() => {});
  const slowAnalytics = createClientAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    policy: TEST_POLICY,
    collect() {
      slowCollectorStarted = true;
      return neverResolves;
    },
  });

  const startedAt = performance.now();
  assert.deepEqual(
    slowAnalytics.track(
      "product_view",
      { productId: "apollon-rose" },
      CANONICAL_PRODUCT_CONTEXT,
    ),
    { accepted: true },
  );
  assert.ok(performance.now() - startedAt < 100);
  assert.equal(slowCollectorStarted, false);
  await flushDeferredCollection();
  assert.equal(slowCollectorStarted, true);

  let throwingCollectorStarted = false;
  const throwingAnalytics = createClientAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    policy: TEST_POLICY,
    collect() {
      throwingCollectorStarted = true;
      throw new Error("collector failure");
    },
  });
  assert.doesNotThrow(() =>
    throwingAnalytics.track(
      "product_view",
      { productId: "apollon-rose" },
      CANONICAL_PRODUCT_CONTEXT,
    ),
  );
  assert.equal(throwingCollectorStarted, false);
  await flushDeferredCollection();
  assert.equal(throwingCollectorStarted, true);
});

test("rejected asynchronous collectors are contained", async () => {
  const analytics = createClientAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    policy: TEST_POLICY,
    collect() {
      return Promise.reject(new Error("async collector failure"));
    },
  });
  assert.deepEqual(
    analytics.track(
      "product_view",
      { productId: "apollon-rose" },
      CANONICAL_PRODUCT_CONTEXT,
    ),
    { accepted: true },
  );
  await flushDeferredCollection();
});

test("hostile consent, input, context and policy values never throw", async () => {
  const recording = createRecordingCollector();
  const throwingProxy = new Proxy(
    {},
    {
      get() {
        throw new Error("hostile get");
      },
      getPrototypeOf() {
        throw new Error("hostile prototype");
      },
      ownKeys() {
        throw new Error("hostile keys");
      },
    },
  );

  const hostileConsent = createClientAnalyticsFacade({
    consent: throwingProxy,
    collect: recording.collect,
    policy: TEST_POLICY,
  });
  assert.deepEqual(
    hostileConsent.track(
      "product_view",
      { productId: "apollon-rose" },
      CANONICAL_PRODUCT_CONTEXT,
    ),
    { accepted: false, reason: "consent_not_granted" },
  );

  const hostilePolicy = createClientAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    collect: recording.collect,
    policy: throwingProxy,
  });
  assert.doesNotThrow(() =>
    hostilePolicy.track("product_view", throwingProxy, throwingProxy),
  );
  assert.deepEqual(
    hostilePolicy.track("product_view", throwingProxy, throwingProxy),
    { accepted: false, reason: "invalid_event" },
  );
  await flushDeferredCollection();
  assert.equal(recording.events.length, 0);
});

test("the client index and facade contain no server order_paid authority", async () => {
  const analyticsRoot = fileURLToPath(new URL("../lib/analytics/", import.meta.url));
  const indexSource = await readFile(join(analyticsRoot, "index.ts"), "utf8");
  const facadeSource = await readFile(join(analyticsRoot, "facade.ts"), "utf8");
  assert.doesNotMatch(indexSource, /order_paid|ServerOrderPaid|AnalyticsCollector/);
  assert.doesNotMatch(facadeSource, /order_paid|ServerOrderPaid|AnalyticsCollector/);
});

async function listAnalyticsSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);
      return entry.isDirectory()
        ? listAnalyticsSourceFiles(absolutePath)
        : [absolutePath];
    }),
  );
  return nested.flat();
}

test("every analytics source file is free of transport, SDK and endpoint code", async () => {
  const analyticsDirectory = fileURLToPath(
    new URL("../lib/analytics/", import.meta.url),
  );
  const sourceFiles = await listAnalyticsSourceFiles(analyticsDirectory);
  assert.ok(sourceFiles.length >= 7);

  const forbidden = [
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|sendBeacon|new\s+Image\s*\(/i,
    /\bimport\s*\(/,
    /\b(?:posthog|umami|cloudflareinsights|google-analytics|gtag)\b/i,
  ];

  for (const path of sourceFiles) {
    const source = await readFile(path, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path} contains ${pattern}`);
    }
    for (const endpoint of source.match(/https?:\/\/[^\s"'`]+/gi) ?? []) {
      assert.match(
        endpoint,
        /^https?:\/\/(?:[a-z0-9-]+\.)*invalid(?:[/:]|$)/i,
        `${path} contains a non-local endpoint ${endpoint}`,
      );
    }
  }
});
