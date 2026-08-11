import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { build as esbuildBuild } from "esbuild";
import { build as viteBuild, resolveConfig, version as viteVersion } from "vite";
import * as analyticsPublicApi from "../lib/analytics/index.ts";
import * as analyticsServerApi from "../lib/analytics/server.ts";
import { getPublicAnalyticsCatalog } from "../lib/analytics/public-catalog.ts";
import { prepareClientAnalyticsEvent } from "../lib/analytics/client-preparation.ts";
import {
  ANALYTICS_CLIENT_BOUNDARY_ERROR,
  ANALYTICS_SERVER_ARTIFACT_MARKERS,
  analyticsServerBoundaryPlugin,
  isAnalyticsServerModule,
} from "../lib/build/analytics-server-boundary.ts";
import {
  sanitizeAnalyticsContext,
  sanitizeAnalyticsPath,
  sanitizeReferrerOrigin,
} from "../lib/analytics/context-sanitization.ts";
import { launchVariants } from "../lib/commerce/catalog.ts";
import { mockCommerceProvider } from "../lib/commerce/mock-provider.ts";
import {
  createApollonInternalReference,
  createLaunchVariantId,
  LAUNCH_PRODUCT_ID,
} from "../lib/commerce/product-identifiers.ts";
import { products, sizes as productSizes } from "../lib/products.ts";

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
const boundaryFixtureRoot = join(
  projectRoot,
  "tests",
  "fixtures",
  "analytics-client-boundary",
);

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

function viteFixtureBuild(input, options = {}) {
  return viteBuild({
    configFile: false,
    root: projectRoot,
    publicDir: false,
    cacheDir: join(projectRoot, "node_modules", ".vite-analytics-tests"),
    logLevel: "silent",
    plugins: [analyticsServerBoundaryPlugin(projectRoot)],
    resolve: options.conditions
      ? { conditions: options.conditions }
      : undefined,
    build: {
      write: false,
      minify: false,
      assetsInlineLimit: options.assetsInlineLimit,
      ...(options.ssr ? { ssr: input } : {}),
      ...(!options.ssr ? { rollupOptions: { input } } : {}),
    },
  });
}

function viteOutputCode(result) {
  const outputs = Array.isArray(result) ? result : [result];
  return outputs
    .flatMap((output) => output.output ?? [])
    .map((entry) => ("code" in entry ? entry.code : ""))
    .join("\n");
}

function findArtifactLeaks(artifacts) {
  return artifacts.flatMap(({ name, contents }) =>
    ANALYTICS_SERVER_ARTIFACT_MARKERS.filter((marker) =>
      contents.includes(Buffer.from(marker)),
    ).map((marker) => ({ name, marker })),
  );
}

function viteOutputArtifacts(result) {
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((output) =>
    (output.output ?? []).map((entry) => ({
      name: entry.fileName,
      contents: Buffer.from("code" in entry ? entry.code : entry.source),
    })),
  );
}

const COLORS = [
  { code: "POU", slug: "pourpre", path: "/products/pourpre" },
  { code: "ROS", slug: "rose-pale", path: "/products/rose-pale" },
  {
    code: "LIL",
    slug: "lilas-bleu-clair",
    path: "/products/lilas-bleu-clair",
  },
];
const SIZES = ["S", "M", "L", "XL"];
const EXPECTED_VARIANT_IDS = COLORS.flatMap((color) =>
  SIZES.map((size) => createLaunchVariantId(color.slug, size)),
);
const EXPECTED_INTERNAL_REFERENCES = COLORS.flatMap((color) =>
  SIZES.map((size) => createApollonInternalReference(color.slug, size)),
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

test("the catalogue keeps runtime IDs, product FK and internal references distinct", () => {
  assert.equal(launchVariants.length, 12);
  assert.equal(new Set(launchVariants.map((variant) => variant.id)).size, 12);
  assert.deepEqual(
    launchVariants.map((variant) => variant.id),
    EXPECTED_VARIANT_IDS,
  );
  assert.deepEqual(
    [...new Set(launchVariants.map((variant) => variant.productId))],
    [LAUNCH_PRODUCT_ID],
  );
  assert.deepEqual(
    launchVariants.map((variant) => variant.sku),
    EXPECTED_INTERNAL_REFERENCES,
  );
  assert.ok(
    launchVariants.every(
      (variant) =>
        variant.id.startsWith("variant_boxer_") &&
        variant.sku.startsWith("AJ-APO-") &&
        variant.id !== variant.sku &&
        variant.price.amountCents === 2999 &&
        variant.price.currency === "EUR",
    ),
  );
  assert.deepEqual(
    [...new Set(launchVariants.map((variant) => variant.size))],
    SIZES,
  );
});

test("catalogue imports are deeply frozen and provider snapshots cannot poison later reads", async () => {
  assert.ok(Object.isFrozen(products));
  assert.ok(Object.isFrozen(productSizes));
  assert.ok(Object.isFrozen(products[0]));
  assert.ok(Object.isFrozen(products[0].gallery));
  assert.ok(Object.isFrozen(launchVariants));
  assert.ok(Object.isFrozen(launchVariants[0]));
  assert.ok(Object.isFrozen(launchVariants[0].price));
  assert.throws(() => launchVariants.push(launchVariants[0]), TypeError);
  assert.throws(() => {
    launchVariants[0].price.amountCents = 1;
  }, TypeError);
  assert.throws(() => {
    products[0].priceCents = 1;
  }, TypeError);
  assert.throws(() => productSizes.push("XS"), TypeError);

  const firstProviderRead = await mockCommerceProvider.listLaunchVariants();
  firstProviderRead.push({ ...firstProviderRead[0], id: "variant_forged" });
  firstProviderRead[0].price.amountCents = 1;
  const secondProviderRead = await mockCommerceProvider.listLaunchVariants();
  assert.equal(secondProviderRead.length, 12);
  assert.equal(secondProviderRead[0].id, "variant_boxer_pourpre_s");
  assert.equal(secondProviderRead[0].price.amountCents, 2999);

  const firstVariantRead = await mockCommerceProvider.getVariant(
    "variant_boxer_pourpre_s",
  );
  assert.ok(firstVariantRead);
  firstVariantRead.price.amountCents = 1;
  const secondVariantRead = await mockCommerceProvider.getVariant(
    "variant_boxer_pourpre_s",
  );
  assert.equal(secondVariantRead?.price.amountCents, 2999);

  const publicProjection = getPublicAnalyticsCatalog();
  assert.ok(Object.isFrozen(publicProjection));
  assert.ok(Object.isFrozen(publicProjection[0]));
  assert.throws(() => publicProjection.push(publicProjection[0]), TypeError);
  assert.throws(() => {
    publicProjection[0].unitPriceMinor = 1;
  }, TypeError);
});

test("identifier builders reject inherited and unknown slugs", () => {
  for (const hostileSlug of ["toString", "constructor", "__proto__", "unknown"]) {
    assert.throws(
      () => createLaunchVariantId(hostileSlug, "S"),
      /Unknown Apollon color slug/,
    );
    assert.throws(
      () => createApollonInternalReference(hostileSlug, "S"),
      /Unknown Apollon color slug/,
    );
  }
});

test("catalogue identities satisfy the canonical D1 foreign-key shape", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE products (id TEXT PRIMARY KEY);
      CREATE TABLE variants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        internal_reference TEXT NOT NULL UNIQUE
      );
      CREATE TABLE cart_lines (
        id TEXT PRIMARY KEY,
        variant_id TEXT NOT NULL REFERENCES variants(id)
      );
    `);
    database.prepare("INSERT INTO products (id) VALUES (?)").run(
      LAUNCH_PRODUCT_ID,
    );
    const insertVariant = database.prepare(
      "INSERT INTO variants (id, product_id, internal_reference) VALUES (?, ?, ?)",
    );
    for (const variant of launchVariants) {
      insertVariant.run(variant.id, variant.productId, variant.sku);
    }
    database
      .prepare("INSERT INTO cart_lines (id, variant_id) VALUES (?, ?)")
      .run("line_valid", "variant_boxer_pourpre_s");
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(
      () =>
        database
          .prepare("INSERT INTO cart_lines (id, variant_id) VALUES (?, ?)")
          .run("line_sku_is_not_fk", "AJ-APO-POU-S"),
      /FOREIGN KEY constraint failed/,
    );
  } finally {
    database.close();
  }
});

test("client analytics catalogue imports no stock ledger or quantity field", async () => {
  const sources = await Promise.all(
    [
      "client-preparation.ts",
      "context-sanitization.ts",
      "catalog-policy.ts",
      "public-catalog.ts",
    ].map((file) => readFile(join(analyticsRoot, file), "utf8")),
  );
  const clientProjectionSource = sources.join("\n");
  assert.doesNotMatch(
    clientProjectionSource,
    /internal-stock|inventoryQuantity|physicalQuantity|availableToSell|stockLedger/,
  );
  assert.doesNotMatch(clientProjectionSource, /commerce\/catalog/);
  assert.match(sources[2], /\.\/public-catalog\.ts/);
  assert.match(sources[3], /\.\.\/products\.ts/);
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
  const result = await esbuildBuild({
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

test("every final Vinext client artifact contains no paid-order or server-outbox code", async () => {
  const clientArtifactFiles = await listFilesRecursively(finalClientRoot);
  assert.ok(
    clientArtifactFiles.some((path) => /\.(?:c|m)?js$/i.test(path)),
    "npm run build must produce final browser JavaScript before this test",
  );
  assert.ok(
    clientArtifactFiles.some((path) => !/\.(?:c|m)?js$/i.test(path)),
    "the proof must include emitted non-JavaScript assets",
  );
  const artifacts = await Promise.all(
    clientArtifactFiles.map(async (path) => ({
      name: relative(finalClientRoot, path),
      contents: await readFile(path),
    })),
  );
  assert.deepEqual(findArtifactLeaks(artifacts), []);
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
        esbuildBuild({
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

test("Vite 8.1.5 rejects the seven historical client paths and uppercase raw/url variants", async () => {
  assert.equal(viteVersion, "8.1.5");
  for (const fixture of [
    "raw.mjs",
    "url.mjs",
    "subpath.mjs",
    "dynamic-computed.mjs",
    "dynamic-template.mjs",
    "glob.mjs",
    "new-url.mjs",
    "uppercase-raw.mjs",
    "uppercase-url.mjs",
  ]) {
    const fixturePath = join(boundaryFixtureRoot, fixture);
    await assert.rejects(
      () => viteFixtureBuild(fixturePath),
      (error) => String(error).includes(ANALYTICS_CLIENT_BOUNDARY_ERROR),
      `${fixture} unexpectedly passed a real Vite client build`,
    );
  }
});

test("Vite AST analysis rejects whitespace, constants and a trivial URL alias", async () => {
  for (const fixture of [
    "new-url-line-break.mjs",
    "new-url-comments.mjs",
    "dynamic-const.mjs",
    "new-url-const.mjs",
    "new-url-alias.mjs",
  ]) {
    await assert.rejects(
      () => viteFixtureBuild(join(boundaryFixtureRoot, fixture)),
      (error) => String(error).includes(ANALYTICS_CLIENT_BOUNDARY_ERROR),
      `${fixture} unexpectedly passed a real Vite client build`,
    );
  }
});

test("the boundary matcher is case-insensitive before filesystem resolution", () => {
  assert.equal(
    isAnalyticsServerModule(
      "../../../lib/analytics/Server-events.ts?raw",
      projectRoot,
    ),
    true,
  );
  assert.equal(
    isAnalyticsServerModule("../../../LIB/ANALYTICS/SERVER.TS?url", projectRoot),
    true,
  );
});

test("Vite erases type-only server imports without a boundary false positive", async () => {
  const result = await viteFixtureBuild(
    join(boundaryFixtureRoot, "type-only.ts"),
  );
  assert.deepEqual(findArtifactLeaks(viteOutputArtifacts(result)), []);
});

test("Vite applies negative import.meta.glob patterns before the boundary guard", async () => {
  const result = await viteFixtureBuild(
    join(boundaryFixtureRoot, "glob-excluded.mjs"),
  );
  assert.doesNotMatch(
    viteOutputCode(result),
    /order_paid|canonical_commerce_d1_not_integrated/,
  );
});

test("the Vite build rejects forbidden markers in JavaScript and non-JavaScript assets", async () => {
  for (const [fixture, marker, options] of [
    ["asset-js.mjs", "order_paid", {}],
    [
      "asset-non-js.mjs",
      "canonical_commerce_d1_not_integrated",
      { assetsInlineLimit: 0 },
    ],
  ]) {
    await assert.rejects(
      () => viteFixtureBuild(join(boundaryFixtureRoot, fixture), options),
      (error) => {
        const message = String(error);
        return (
          message.includes(ANALYTICS_CLIENT_BOUNDARY_ERROR) &&
          message.includes("emitted-artifact") &&
          message.includes(marker)
        );
      },
      `${fixture} unexpectedly emitted a forbidden client artifact`,
    );
  }
});

test("the real Vite boundary gates source and emitted artifacts during build", async () => {
  const packageManifest = JSON.parse(
    await readFile(join(projectRoot, "package.json"), "utf8"),
  );
  const boundaryCheckSource = await readFile(
    join(projectRoot, "scripts", "check-analytics-client-boundary.mjs"),
    "utf8",
  );
  const viteConfigSource = await readFile(
    join(projectRoot, "vite.config.ts"),
    "utf8",
  );
  const boundarySource = await readFile(
    join(projectRoot, "lib", "build", "analytics-server-boundary.ts"),
    "utf8",
  );
  assert.match(packageManifest.scripts.prebuild, /check:analytics-boundary/);
  assert.match(packageManifest.scripts.postbuild, /check:analytics-artifacts/);
  assert.match(packageManifest.scripts.prelint, /check:analytics-boundary/);
  assert.match(boundaryCheckSource, /build as viteBuild/);
  assert.match(boundaryCheckSource, /dist.+client/);
  assert.match(viteConfigSource, /analyticsServerBoundaryPlugin\(\)/);
  assert.match(boundarySource, /generateBundle/);
  assert.doesNotMatch(boundarySource, /code\.includes\(/);
});

test("the Vite client guard leaves explicit SSR and RSC server builds authorized", async () => {
  const entry = join(analyticsRoot, "server.ts");
  for (const conditions of [
    ["workerd", "worker", "node", "module", "production"],
    ["react-server", "workerd", "worker", "module", "production"],
  ]) {
    const result = await viteFixtureBuild(entry, { ssr: true, conditions });
    const code = viteOutputCode(result);
    assert.match(code, /order_paid/);
    assert.doesNotMatch(code, new RegExp(ANALYTICS_CLIENT_BOUNDARY_ERROR));
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
      const result = await esbuildBuild({
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
      { productId: "product_apollon" },
      { url: "https://ajluxurystore.com/products/pourpre" },
    ),
    { accepted: false, reason: "consent_not_granted" },
  );
  consent.setState("denied");
  assert.deepEqual(
    analytics.track(
      "product_view",
      { productId: "product_apollon" },
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
        productId: "product_apollon",
        variantId: "variant_boxer_pourpre_s",
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

test("client preparation derives canonical add-to-cart totals without collecting", () => {
  const event = prepareClientAnalyticsEvent(
    "add_to_cart",
    {
      productId: "product_apollon",
      variantId: "variant_boxer_pourpre_s",
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
      productId: "product_apollon",
      variantId: "variant_boxer_pourpre_s",
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
      productId: "product_apollon",
      variantId: "variant_boxer_pourpre_s",
      quantity: 1,
    },
    { url: "https://ajluxurystore.com/products/pourpre" },
    policyWithForgedCatalogue,
  );

  assert.deepEqual(event?.payload, {
    productId: "product_apollon",
    variantId: "variant_boxer_pourpre_s",
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
      { productId: "product_forged", variantId: "variant_boxer_pourpre_s" },
      { url: "https://ajluxurystore.com/products/pourpre" },
      TEST_POLICY,
    ),
    null,
  );
  assert.equal(
    prepareClientAnalyticsEvent(
      "add_to_cart",
      {
        productId: "product_apollon",
        variantId: "variant_boxer_pourpre_s",
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
        { variantId: "variant_boxer_pourpre_s", quantity: 2 },
        { variantId: "variant_boxer_rose-pale_m", quantity: 1 },
        { variantId: "variant_boxer_lilas-bleu-clair_xl", quantity: 1 },
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
