import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as analyticsPublicApi from "../lib/analytics/index.ts";

const {
  ANALYTICS_EVENT_FIELD_ALLOWLIST,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_UTM_KEYS,
  createAnalyticsConsentController,
  createAnalyticsFacade,
  sanitizeAnalyticsContext,
  sanitizeAnalyticsPath,
  sanitizeReferrerOrigin,
} = analyticsPublicApi;

const TEST_POLICY = {
  allowedPaths: ["/", "/products/rose-pale", "/checkout"],
  allowedProductIds: [
    "apollon-rose",
    "apollon-lilas",
    "apollon-pourpre",
  ],
  allowedVariantIds: ["variant_boxer_rose-pale_xl"],
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

function createRecordingCollector() {
  const events = [];
  return {
    events,
    collector: {
      collect(event) {
        events.push(structuredClone(event));
        return true;
      },
    },
  };
}

test("the schema is limited to four events and three governed UTM keys", () => {
  assert.deepEqual(ANALYTICS_EVENT_NAMES, [
    "product_view",
    "add_to_cart",
    "checkout_started",
    "order_paid",
  ]);
  assert.deepEqual(ANALYTICS_EVENT_FIELD_ALLOWLIST, {
    product_view: ["productId", "variantId"],
    add_to_cart: [
      "productId",
      "variantId",
      "quantity",
      "valueMinor",
      "currency",
    ],
    checkout_started: ["itemCount", "valueMinor", "currency"],
    order_paid: ["itemCount", "valueMinor", "currency"],
  });
  assert.deepEqual(ANALYTICS_UTM_KEYS, [
    "utm_source",
    "utm_medium",
    "utm_campaign",
  ]);
});

test("unknown and denied consent fail closed without buffering events", () => {
  const consent = createAnalyticsConsentController();
  const recording = createRecordingCollector();
  const analytics = createAnalyticsFacade({
    consent,
    collector: recording.collector,
    policy: TEST_POLICY,
  });

  assert.deepEqual(
    analytics.track("product_view", { productId: "apollon-rose" }),
    { accepted: false, reason: "consent_not_granted" },
  );
  consent.setState("denied");
  assert.deepEqual(
    analytics.track("product_view", { productId: "apollon-rose" }),
    { accepted: false, reason: "consent_not_granted" },
  );
  assert.equal(recording.events.length, 0);
});

test("consent is reversible at event time", () => {
  const consent = createAnalyticsConsentController();
  const recording = createRecordingCollector();
  const analytics = createAnalyticsFacade({
    consent,
    collector: recording.collector,
    policy: TEST_POLICY,
    clock: () => new Date("2026-08-10T12:00:00.000Z"),
  });

  consent.setState("granted");
  assert.deepEqual(
    analytics.track("product_view", { productId: "apollon-rose" }),
    { accepted: true },
  );

  consent.setState("denied");
  assert.deepEqual(
    analytics.track("product_view", { productId: "apollon-lilas" }),
    { accepted: false, reason: "consent_not_granted" },
  );

  consent.setState("granted");
  assert.deepEqual(
    analytics.track("product_view", { productId: "apollon-pourpre" }),
    { accepted: true },
  );

  consent.reset();
  assert.equal(consent.getState(), "unknown");
  assert.equal(recording.events.length, 2);
  assert.deepEqual(
    recording.events.map((event) => event.payload.productId),
    ["apollon-rose", "apollon-pourpre"],
  );
});

test("URL, referrer and UTM attribution require exact governed values", () => {
  assert.equal(
    sanitizeAnalyticsPath(
      "https://ajluxurystore.com/products/rose-pale?email=adam@example.com#size",
      TEST_POLICY.allowedPaths,
    ),
    "/products/rose-pale",
  );
  assert.equal(
    sanitizeAnalyticsPath(
      "https://ajluxurystore.com/account/adam-chabbi/orders/12345678",
      TEST_POLICY.allowedPaths,
    ),
    "/:redacted",
  );
  assert.equal(
    sanitizeReferrerOrigin(
      "https://www.google.com/search?q=aj+luxury&email=adam@example.com",
      TEST_POLICY.attribution.allowedReferrerOrigins,
    ),
    "https://www.google.com",
  );
  assert.equal(
    sanitizeReferrerOrigin(
      "https://personal-adam.example/profile",
      TEST_POLICY.attribution.allowedReferrerOrigins,
    ),
    undefined,
  );

  assert.deepEqual(
    sanitizeAnalyticsContext(
      {
        url: "https://ajluxurystore.com/products/rose-pale?utm_source=instagram&utm_medium=paid-social&utm_campaign=lancement_apollon&utm_content=adam%40example.com&utm_term=0612345678&email=private%40example.com",
        referrer: "https://instagram.com/profile/private?token=secret",
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

test("free-form attribution and missing policy fail closed", () => {
  const freeForm = sanitizeAnalyticsContext(
    {
      url: "https://ajluxurystore.com/products/rose-pale?utm_source=Adam%20Chabbi&utm_medium=10%20rue%20Paris&utm_campaign=client_prive",
      referrer: "https://adam-personal.example/private",
      utm: {
        utm_source: "Adam Chabbi",
        utm_medium: "10 rue Paris",
        utm_campaign: "client_prive",
      },
    },
    TEST_POLICY,
  );
  assert.deepEqual(freeForm, { path: "/products/rose-pale" });

  assert.deepEqual(
    sanitizeAnalyticsContext(
      {
        url: "https://ajluxurystore.com/products/rose-pale?utm_source=instagram",
        referrer: "https://instagram.com/private",
      },
      undefined,
    ),
    { path: "/:redacted" },
  );
});

test("the facade emits a sanitized, versioned event without personal identifiers", () => {
  const consent = createAnalyticsConsentController("granted");
  const recording = createRecordingCollector();
  const analytics = createAnalyticsFacade({
    consent,
    collector: recording.collector,
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
        valueMinor: 5998,
        currency: "EUR",
      },
      {
        url: "https://ajluxurystore.com/products/rose-pale?utm_source=instagram",
        referrer: "https://instagram.com/private/path?secret=1",
      },
    ),
    { accepted: true },
  );

  assert.deepEqual(recording.events, [
    {
      schemaVersion: 1,
      name: "add_to_cart",
      occurredAt: "2026-08-10T12:00:00.000Z",
      context: {
        path: "/products/rose-pale",
        referrerOrigin: "https://instagram.com",
        utm: { utm_source: "instagram" },
      },
      payload: {
        productId: "apollon-rose",
        variantId: "variant_boxer_rose-pale_xl",
        quantity: 2,
        valueMinor: 5998,
        currency: "EUR",
      },
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(recording.events),
    /email|phone|address|customer|session|userId|orderId|cartId/i,
  );
});

test("unknown events, fields, identifiers and values never reach the collector", () => {
  const recording = createRecordingCollector();
  const analytics = createAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    collector: recording.collector,
    policy: TEST_POLICY,
  });

  const rejected = [
    analytics.track("page_view", { path: "/" }),
    analytics.track("product_view", {
      productId: "apollon-rose",
      email: "private@example.com",
    }),
    analytics.track("product_view", { productId: "customer_123" }),
    analytics.track("add_to_cart", {
      productId: "apollon-rose",
      variantId: "550e8400-e29b-41d4-a716-446655440000",
      quantity: 1,
      valueMinor: 2999,
      currency: "EUR",
    }),
    analytics.track("checkout_started", {
      itemCount: 1,
      valueMinor: -1,
      currency: "EUR",
    }),
  ];

  for (const result of rejected) {
    assert.deepEqual(result, { accepted: false, reason: "invalid_event" });
  }
  assert.equal(recording.events.length, 0);
});

test("hostile consent, payload, context and policy values never throw", () => {
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

  const hostileConsentFacade = createAnalyticsFacade({
    consent: throwingProxy,
    collector: recording.collector,
    policy: TEST_POLICY,
  });
  assert.doesNotThrow(() =>
    hostileConsentFacade.track("product_view", { productId: "apollon-rose" }),
  );
  assert.deepEqual(
    hostileConsentFacade.track("product_view", { productId: "apollon-rose" }),
    { accepted: false, reason: "consent_not_granted" },
  );

  const analytics = createAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    collector: recording.collector,
    policy: TEST_POLICY,
  });
  assert.deepEqual(
    analytics.track("product_view", throwingProxy, throwingProxy),
    { accepted: false, reason: "invalid_event" },
  );

  const hostilePolicyFacade = createAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    collector: recording.collector,
    policy: throwingProxy,
  });
  assert.deepEqual(
    hostilePolicyFacade.track("product_view", { productId: "apollon-rose" }),
    { accepted: false, reason: "invalid_event" },
  );
  assert.equal(recording.events.length, 0);
});

test("collector failures and never-resolving collectors are contained synchronously", () => {
  const throwingAnalytics = createAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    policy: TEST_POLICY,
    collector: {
      collect() {
        throw new Error("test collector failure");
      },
    },
  });
  assert.deepEqual(
    throwingAnalytics.track("order_paid", {
      itemCount: 1,
      valueMinor: 2999,
      currency: "EUR",
    }),
    { accepted: false, reason: "collector_error" },
  );

  const pending = new Promise(() => {});
  const pendingAnalytics = createAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    policy: TEST_POLICY,
    collector: { collect: () => pending },
  });
  const startedAt = performance.now();
  assert.deepEqual(
    pendingAnalytics.track("order_paid", {
      itemCount: 1,
      valueMinor: 2999,
      currency: "EUR",
    }),
    { accepted: false, reason: "collector_error" },
  );
  assert.ok(
    performance.now() - startedAt < 100,
    "track must not await an invalid asynchronous collector",
  );
});

test("rejected asynchronous collector results are silenced without leaking", async () => {
  const analytics = createAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    policy: TEST_POLICY,
    collector: {
      collect() {
        return Promise.reject(new Error("unexpected async rejection"));
      },
    },
  });

  assert.deepEqual(
    analytics.track("order_paid", {
      itemCount: 1,
      valueMinor: 2999,
      currency: "EUR",
    }),
    { accepted: false, reason: "collector_error" },
  );
  await new Promise((resolve) => setImmediate(resolve));
});

test("the public analytics API cannot build an event outside the consent facade", () => {
  assert.equal("buildAnalyticsEvent" in analyticsPublicApi, false);
  assert.equal("buildConsentGatedEvent" in analyticsPublicApi, false);
  assert.equal("sanitizeAnalyticsPayload" in analyticsPublicApi, false);
  assert.equal(typeof analyticsPublicApi.createAnalyticsFacade, "function");
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
  assert.ok(sourceFiles.length >= 5);

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
