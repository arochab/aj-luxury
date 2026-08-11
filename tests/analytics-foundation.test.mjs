import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { build } from "esbuild";
import { resolveConfig } from "vite";
import * as analyticsPublicApi from "../lib/analytics/index.ts";
import * as analyticsServerApi from "../lib/analytics/server.ts";
import { prepareClientAnalyticsEvent } from "../lib/analytics/client-preparation.ts";
import {
  sanitizeAnalyticsContext,
  sanitizeAnalyticsPath,
  sanitizeReferrerOrigin,
} from "../lib/analytics/context-sanitization.ts";
import { launchVariants } from "../lib/commerce/catalog.ts";

const {
  ANALYTICS_SCHEMA_VERSION,
  ANALYTICS_UTM_KEYS,
  CLIENT_ANALYTICS_EVENT_NAMES,
  CLIENT_ANALYTICS_INPUT_FIELD_ALLOWLIST,
  createAnalyticsConsentController,
  createClientAnalyticsFacade,
} = analyticsPublicApi;

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testDirectory, "..");
const analyticsRoot = join(projectRoot, "lib", "analytics");
const finalClientRoot = join(projectRoot, "dist", "client");

let vinextProductionConditionsPromise;

function productionConditions(conditions) {
  return conditions.map((condition) =>
    condition === "development|production" ? "production" : condition,
  );
}

function resolveVinextProductionConditions() {
  vinextProductionConditionsPromise ??= resolveConfig(
    {
      configFile: join(projectRoot, "vite.config.ts"),
      mode: "production",
      logLevel: "silent",
    },
    "build",
    "production",
    "production",
  ).then((config) => {
    const client = config.environments.client.resolve.conditions;
    const ssr = config.environments.ssr.resolve.conditions;
    const rsc = config.environments.rsc.resolve.conditions;
    assert.deepEqual(client, [
      "module",
      "browser",
      "development|production",
    ]);
    assert.ok(ssr.includes("workerd") && ssr.includes("worker"));
    assert.ok(rsc.includes("react-server") && rsc.includes("workerd"));
    return {
      client: productionConditions(client),
      ssr: productionConditions(ssr),
      rsc: productionConditions(rsc),
    };
  });
  return vinextProductionConditionsPromise;
}

const COLORS = [
  { code: "POU", productId: "AJ-APO-POU", path: "/products/pourpre" },
  { code: "ROS", productId: "AJ-APO-ROS", path: "/products/rose-pale" },
  {
    code: "LIL",
    productId: "AJ-APO-LIL",
    path: "/products/lilas-bleu-clair",
  },
];
const SIZES = ["S", "M", "L", "XL"];
const EXPECTED_AJ_APO_VARIANT_IDS = COLORS.flatMap((color) =>
  SIZES.map((size) => `${color.productId}-${size}`),
);

const TEST_POLICY = {
  canonicalOrigin: "https://ajluxurystore.com",
  allowedPaths: ["/", ...COLORS.map((color) => color.path), "/checkout"],
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

test("the real commerce catalogue contains exactly twelve AJ-APO variants", () => {
  assert.equal(launchVariants.length, 12);
  assert.equal(new Set(launchVariants.map((variant) => variant.id)).size, 12);
  assert.deepEqual(
    launchVariants.map((variant) => variant.id),
    EXPECTED_AJ_APO_VARIANT_IDS,
  );
  assert.deepEqual(
    [...new Set(launchVariants.map((variant) => variant.productId))],
    COLORS.map((color) => color.productId),
  );
  assert.ok(
    launchVariants.every(
      (variant) =>
        variant.sku === variant.id &&
        variant.id.startsWith(`${variant.productId}-`) &&
        variant.price.amountCents === 2999 &&
        variant.price.currency === "EUR",
    ),
  );
  assert.deepEqual(
    [...new Set(launchVariants.map((variant) => variant.size))],
    SIZES,
  );
});

test("the public client schema contains only three browser events", () => {
  assert.equal(ANALYTICS_SCHEMA_VERSION, 3);
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
  assert.equal("ORDER_PAID_INTERNAL_CONTRACT" in analyticsPublicApi, false);
  assert.equal("createServerOrderPaidEmitter" in analyticsPublicApi, false);
});

test("an actual browser bundle of the client index contains no paid-order authority", async () => {
  const { client: conditions } = await resolveVinextProductionConditions();
  const result = await build({
    absWorkingDir: projectRoot,
    entryPoints: [join(analyticsRoot, "index.ts")],
    bundle: true,
    platform: "browser",
    format: "esm",
    conditions,
    treeShaking: true,
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles.map((file) => file.text).join("\n");
  assert.doesNotMatch(code, /order_paid/);
  assert.doesNotMatch(code, /canonical_commerce_d1_not_integrated/);
});

test("the final Vinext client artifacts contain no paid-order or server-outbox code", async () => {
  const clientJavaScriptFiles = (await listFilesRecursively(finalClientRoot)).filter(
    (path) => /\.(?:c|m)?js$/i.test(path),
  );
  assert.ok(
    clientJavaScriptFiles.length > 0,
    "npm run build must produce final browser JavaScript before this test",
  );

  const bundle = (
    await Promise.all(
      clientJavaScriptFiles.map((path) => readFile(path, "utf8")),
    )
  ).join("\n");
  for (const forbidden of [
    /order_paid/,
    /canonical_commerce_d1_not_integrated/,
    /storeOnce/,
  ]) {
    assert.doesNotMatch(bundle, forbidden);
  }
});

test("every deep server file fails an actual browser bundle", async () => {
  const { client: conditions } = await resolveVinextProductionConditions();
  const serverEntryPoints = (await listFilesRecursively(analyticsRoot)).filter(
    (path) => /^server(?:-.+)?\.ts$/.test(basename(path)),
  );
  assert.deepEqual(
    serverEntryPoints.map((path) => basename(path)).sort(),
    [
      "server-browser-forbidden.ts",
      "server-events.ts",
      "server-runtime-guard.ts",
      "server.ts",
    ],
  );

  for (const entryPoint of serverEntryPoints) {
    await assert.rejects(
      () =>
        build({
          absWorkingDir: projectRoot,
          entryPoints: [entryPoint],
          bundle: true,
          platform: "browser",
          format: "esm",
          conditions,
          write: false,
          logLevel: "silent",
        }),
      (error) =>
        /analytics-server-entry-is-not-browser-bundleable/.test(String(error)),
      `${basename(entryPoint)} unexpectedly bundled for a browser`,
    );
  }
});

test("guarded server files bundle for the actual Vinext SSR and RSC Worker targets", async () => {
  const resolved = await resolveVinextProductionConditions();
  const guardedEntryPoints = [
    "server.ts",
    "server-events.ts",
    "server-runtime-guard.ts",
  ].map((file) => join(analyticsRoot, file));

  for (const entryPoint of guardedEntryPoints) {
    for (const conditions of [resolved.ssr, resolved.rsc]) {
      const result = await build({
        absWorkingDir: projectRoot,
        entryPoints: [entryPoint],
        bundle: true,
        platform: "neutral",
        format: "esm",
        conditions,
        treeShaking: true,
        write: false,
        logLevel: "silent",
      });
      const code = result.outputFiles.map((file) => file.text).join("\n");
      assert.doesNotMatch(
        code,
        /analytics-server-entry-is-not-browser-bundleable/,
      );
      if (basename(entryPoint) !== "server-runtime-guard.ts") {
        assert.match(code, /order_paid/);
      }
    }
  }
});

test("the inactive facade stays fail-closed for unknown and denied consent", () => {
  const consent = createAnalyticsConsentController();
  const analytics = createClientAnalyticsFacade({ consent });
  assert.deepEqual(
    analytics.track(
      "product_view",
      { productId: "AJ-APO-POU" },
      { url: "https://ajluxurystore.com/products/pourpre" },
    ),
    { accepted: false, reason: "consent_not_granted" },
  );
  consent.setState("denied");
  assert.deepEqual(
    analytics.track(
      "product_view",
      { productId: "AJ-APO-POU" },
      { url: "https://ajluxurystore.com/products/pourpre" },
    ),
    { accepted: false, reason: "consent_not_granted" },
  );
});

test("granted consent does not activate, buffer or schedule browser analytics", () => {
  const analytics = createClientAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
  });
  assert.deepEqual(
    analytics.track(
      "add_to_cart",
      {
        productId: "AJ-APO-POU",
        variantId: "AJ-APO-POU-S",
        quantity: 1,
      },
      { url: "https://ajluxurystore.com/products/pourpre" },
    ),
    { accepted: false, reason: "analytics_inactive" },
  );
});

test("a hostile CPU collector cannot delay the next task because the client facade has no collector boundary", async () => {
  let collectorCalled = false;
  const hostileInput = new Proxy(
    {},
    {
      get() {
        throw new Error("inactive facade must not inspect payloads");
      },
      ownKeys() {
        throw new Error("inactive facade must not enumerate payloads");
      },
    },
  );
  const analytics = createClientAnalyticsFacade({
    consent: createAnalyticsConsentController("granted"),
    collect() {
      collectorCalled = true;
      const deadline = performance.now() + 1_000;
      while (performance.now() < deadline) {
        // Intentional CPU stall that must remain unreachable.
      }
    },
  });

  const startedAt = performance.now();
  const nextTask = new Promise((resolve) => setTimeout(resolve, 0));
  assert.doesNotThrow(() =>
    analytics.track("checkout_started", hostileInput, hostileInput),
  );
  await nextTask;
  assert.equal(collectorCalled, false);
  assert.ok(
    performance.now() - startedAt < 750,
    "the next task would exceed the bound if the 1s collector ran",
  );
});

test("client preparation derives AJ-APO add-to-cart totals without collecting", () => {
  const event = prepareClientAnalyticsEvent(
    "add_to_cart",
    {
      productId: "AJ-APO-POU",
      variantId: "AJ-APO-POU-S",
      quantity: 2,
    },
    { url: "https://ajluxurystore.com/products/pourpre" },
    TEST_POLICY,
    () => new Date("2026-08-10T12:00:00.000Z"),
  );
  assert.deepEqual(event, {
    schemaVersion: 3,
    name: "add_to_cart",
    occurredAt: "2026-08-10T12:00:00.000Z",
    context: { path: "/products/pourpre" },
    payload: {
      productId: "AJ-APO-POU",
      variantId: "AJ-APO-POU-S",
      quantity: 2,
      valueMinor: 5998,
      currency: "EUR",
    },
  });
});

test("an injected fixture cannot override the commerce catalogue", () => {
  const policyWithForgedCatalogue = {
    ...TEST_POLICY,
    catalog: { variants: [] },
  };
  const event = prepareClientAnalyticsEvent(
    "add_to_cart",
    {
      productId: "AJ-APO-POU",
      variantId: "AJ-APO-POU-S",
      quantity: 1,
    },
    { url: "https://ajluxurystore.com/products/pourpre" },
    policyWithForgedCatalogue,
  );

  assert.deepEqual(event?.payload, {
    productId: "AJ-APO-POU",
    variantId: "AJ-APO-POU-S",
    quantity: 1,
    valueMinor: 2999,
    currency: "EUR",
  });
  assert.equal(
    prepareClientAnalyticsEvent(
      "add_to_cart",
      {
        productId: "AJ-FORGED",
        variantId: "AJ-FORGED-XS",
        quantity: 1,
      },
      { url: "https://ajluxurystore.com/products/pourpre" },
      policyWithForgedCatalogue,
    ),
    null,
  );
});

test("product and variant relationships reject mismatches and supplied totals", () => {
  assert.equal(
    prepareClientAnalyticsEvent(
      "product_view",
      { productId: "AJ-APO-LIL", variantId: "AJ-APO-POU-S" },
      { url: "https://ajluxurystore.com/products/pourpre" },
      TEST_POLICY,
    ),
    null,
  );
  assert.equal(
    prepareClientAnalyticsEvent(
      "add_to_cart",
      {
        productId: "AJ-APO-POU",
        variantId: "AJ-APO-POU-S",
        quantity: 1,
        valueMinor: 2999,
        currency: "EUR",
      },
      { url: "https://ajluxurystore.com/products/pourpre" },
      TEST_POLICY,
    ),
    null,
  );
});

test("checkout totals are derived from the governed twelve-variant catalogue", () => {
  const event = prepareClientAnalyticsEvent(
    "checkout_started",
    {
      lines: [
        { variantId: "AJ-APO-POU-S", quantity: 2 },
        { variantId: "AJ-APO-ROS-M", quantity: 1 },
        { variantId: "AJ-APO-LIL-XL", quantity: 1 },
      ],
    },
    { url: "https://ajluxurystore.com/checkout" },
    TEST_POLICY,
  );
  assert.deepEqual(event?.payload, {
    itemCount: 4,
    valueMinor: 11996,
    currency: "EUR",
  });
});

test("canonical origin, referrer and governed UTM values remain strict", () => {
  assert.equal(
    sanitizeAnalyticsPath(
      "https://ajluxurystore.com/products/pourpre?email=private@example.com",
      TEST_POLICY.allowedPaths,
      TEST_POLICY.canonicalOrigin,
    ),
    "/products/pourpre",
  );
  assert.equal(
    sanitizeAnalyticsContext(
      { url: "https://attacker.example/products/pourpre" },
      TEST_POLICY,
    ),
    null,
  );
  assert.equal(
    sanitizeReferrerOrigin(
      "https://www.google.com/search?email=private@example.com",
      TEST_POLICY.attribution.allowedReferrerOrigins,
    ),
    "https://www.google.com",
  );
  assert.deepEqual(
    sanitizeAnalyticsContext(
      {
        url: "https://ajluxurystore.com/products/pourpre?utm_source=instagram&utm_medium=paid-social&utm_campaign=lancement_apollon",
        referrer: "https://instagram.com/private?token=secret",
      },
      TEST_POLICY,
    ),
    {
      path: "/products/pourpre",
      referrerOrigin: "https://instagram.com",
      utm: {
        utm_source: "instagram",
        utm_medium: "paid-social",
        utm_campaign: "lancement_apollon",
      },
    },
  );
});

test("order_paid is honestly unavailable until canonical commerce D1 exists", async () => {
  assert.deepEqual(analyticsServerApi.ORDER_PAID_INTERNAL_CONTRACT, {
    eventName: "order_paid",
    availability: "unavailable",
    blocker: "canonical_commerce_d1_not_integrated",
    requiredAuthority: "canonical_commerce_d1_paid_order_transaction",
  });
  assert.ok(Object.isFrozen(analyticsServerApi.ORDER_PAID_INTERNAL_CONTRACT));
  assert.deepEqual(Object.keys(analyticsServerApi), [
    "ORDER_PAID_INTERNAL_CONTRACT",
  ]);

  const serverSources = (
    await Promise.all(
      (await listFilesRecursively(analyticsRoot))
        .filter((path) => /^server(?:-.+)?\.ts$/.test(basename(path)))
        .map((path) => readFile(path, "utf8")),
    )
  ).join("\n");
  assert.doesNotMatch(serverSources, /storeOnce/);
  assert.doesNotMatch(serverSources, /accepted\s*:\s*true/);
  assert.doesNotMatch(serverSources, /VerifiedPaidOrderSnapshot/);
  assert.doesNotMatch(serverSources, /payment-provider-webhook-verified/);
});

async function listFilesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);
      return entry.isDirectory()
        ? listFilesRecursively(absolutePath)
        : [absolutePath];
    }),
  );
  return nested.flat();
}

test("analytics source remains free of transport, provider SDKs and endpoints", async () => {
  const sourceFiles = await listFilesRecursively(analyticsRoot);
  assert.ok(sourceFiles.length >= 12);
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
