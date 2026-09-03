import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function schemaRows(type, tableByName) {
  return Object.entries(tableByName).map(([name, table_name]) => ({
    type,
    name,
    table_name,
  }));
}

/* CE MOCK AVAIT UNE MIGRATION DE RETARD, ET C'EST CE QUI RENDAIT LE POINT DE
   SANTE 503 DEPUIS DES SEMAINES.

   Le worker refuse d'ouvrir la preproduction tant qu'il n'a pas prouve, objet
   par objet, que le schema installe correspond exactement a son inventaire.
   Ce tableau simule ce que sqlite_master repond. Onze objets y manquaient,
   tous introduits par des migrations posterieures a la derniere mise a jour
   du mock : le coffre de references transporteur et son trigger frere
   (0011), les deux triggers de contrat de tarification transporteur (0010),
   et les intentions de remboursement tardif (0014).

   Le worker avait donc raison de fermer : le mock decrivait une base
   incomplete. Corrige le 22/08/2026.

   COMMENT LA LISTE A ETE ETABLIE, pour que la prochaine correction ne soit
   pas une devinette. Deux comparaisons, pas une :

   1. contre les constantes *_INVENTORY de worker/index.ts, qui SONT le
      contrat que ce mock doit satisfaire ;
   2. contre une vraie base D1 portant les 16 migrations de production, pour
      verifier que chaque objet exige existe reellement et sur quelle table.

   La premiere comparaison seule suffit. La seconde protege du cas ou le
   worker exigerait un objet qu'aucune migration ne cree — ce qui fermerait
   la production pour toujours sans qu'aucun test ne le dise.

   Piege rencontre : comparer a la base en retapant la requete du worker A LA
   MAIN fait manquer les clauses par nom exact, et donne une liste fausse. Il
   faut lire les constantes, pas reecrire la requete.

   Les objets trg_preprod_demo_* n'existent PAS en production, et c'est
   voulu : la migration 0008 est exclue du plan de production. Ce mock simule
   une preproduction, donc il les porte. Leur absence d'une base de
   production n'est pas un defaut. */
const governedSchemaRows = [
  ...schemaRows("table", {
    preprod_demo_dataset: "preprod_demo_dataset",
    shipping_quote_parcel_snapshots: "shipping_quote_parcel_snapshots",
    delivery_option_snapshots: "delivery_option_snapshots",
    delivery_service_point_snapshots: "delivery_service_point_snapshots",
    shipping_document_metadata: "shipping_document_metadata",
    /* Les deux tables ci-dessous ont ete ajoutees le 22/08/2026 : le mock
       n'avait pas suivi les migrations 0011 et 0014. Note complete plus bas. */
    delivery_provider_reference_vault: "delivery_provider_reference_vault",
    late_payment_refund_intents: "late_payment_refund_intents",
  }),
  ...schemaRows("index", {
    idx_delivery_options_cart_expiry: "delivery_option_snapshots",
    idx_delivery_service_points_option_expiry:
      "delivery_service_point_snapshots",
    ux_delivery_options_quote: "delivery_option_snapshots",
    ux_delivery_options_selected_cart: "delivery_option_snapshots",
    ux_delivery_service_point_provider_ref:
      "delivery_service_point_snapshots",
    ux_shipping_document_reference: "shipping_document_metadata",
    idx_delivery_reference_key_version: "delivery_provider_reference_vault",
    ux_delivery_reference_owner: "delivery_provider_reference_vault",
    idx_late_payment_refund_dispatch: "late_payment_refund_intents",
    ux_late_payment_refund_active_lease: "late_payment_refund_intents",
    ux_late_payment_refund_idempotency: "late_payment_refund_intents",
    ux_late_payment_refund_order: "late_payment_refund_intents",
    ux_late_payment_refund_payment: "late_payment_refund_intents",
    ux_late_payment_refund_provider_refund: "late_payment_refund_intents",
    ux_late_payment_refund_webhook: "late_payment_refund_intents",
    ux_payments_order_active_checkout: "payments",
  }),
  ...schemaRows("trigger", {
    trg_orders_provider_pricing_contract: "orders",
    trg_shipping_quote_provider_pricing_contract: "shipping_quotes",
    trg_delivery_option_initially_unselected: "delivery_option_snapshots",
    trg_delivery_reference_immutable: "delivery_provider_reference_vault",
    trg_delivery_reference_replay_guard: "delivery_provider_reference_vault",
    trg_delivery_reference_retain: "delivery_provider_reference_vault",
    trg_delivery_reference_validate_insert: "delivery_provider_reference_vault",
    trg_late_payment_refund_lock_identity: "late_payment_refund_intents",
    trg_late_payment_refund_retain: "late_payment_refund_intents",
    trg_late_payment_refund_terminal_immutable: "late_payment_refund_intents",
    trg_late_payment_refund_validate_claim_time: "late_payment_refund_intents",
    trg_late_payment_refund_validate_insert: "late_payment_refund_intents",
    trg_late_payment_refund_validate_success: "late_payment_refund_intents",
    trg_late_payment_refund_validate_transition: "late_payment_refund_intents",
    trg_preprod_demo_cart_active_delete: "carts",
    trg_preprod_demo_cart_active_insert: "carts",
    trg_preprod_demo_cart_active_update: "carts",
    trg_preprod_demo_cart_line_active_delete: "cart_lines",
    trg_preprod_demo_cart_line_active_insert: "cart_lines",
    trg_preprod_demo_cart_line_active_update: "cart_lines",
    trg_preprod_demo_dataset_immutable_delete: "preprod_demo_dataset",
    trg_preprod_demo_dataset_immutable_update: "preprod_demo_dataset",
    trg_preprod_demo_order_active_insert: "orders",
    trg_preprod_demo_order_active_update: "orders",
    trg_preprod_demo_payment_active_insert: "payments",
    trg_preprod_demo_reservation_active_insert: "stock_reservations",
    trg_preprod_demo_reservation_active_update: "stock_reservations",
    trg_preprod_demo_shipping_quote_active_insert: "shipping_quotes",
    trg_preprod_demo_shipping_quote_active_update: "shipping_quotes",
    trg_preprod_demo_webhook_active_insert: "webhook_events",
    trg_shipping_quote_parcel_snapshot_immutable_update:
      "shipping_quote_parcel_snapshots",
    trg_shipping_quote_parcel_snapshot_matches_cart:
      "shipping_quote_parcel_snapshots",
    trg_shipping_quote_parcel_snapshot_retain_delete:
      "shipping_quote_parcel_snapshots",
    trg_delivery_order_requires_selected_option: "orders",
    trg_delivery_option_retain: "delivery_option_snapshots",
    trg_delivery_option_select_once: "delivery_option_snapshots",
    trg_delivery_option_validate_insert: "delivery_option_snapshots",
    trg_delivery_service_point_immutable: "delivery_service_point_snapshots",
    trg_delivery_service_point_retain: "delivery_service_point_snapshots",
    trg_delivery_service_point_validate_insert:
      "delivery_service_point_snapshots",
    trg_shipping_document_immutable: "shipping_document_metadata",
    trg_shipping_document_retain: "shipping_document_metadata",
  }),
];

async function invokeWorker(
  pathname = "/",
  { method = "GET", headers = {}, assets, environment } = {},
) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    `${process.pid}-${Date.now()}-${Math.random()}`,
  );
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`https://preprod.example${pathname}`, {
      method,
      headers,
    }),
    {
      APP_ENV: environment,
      ...(environment === "preproduction"
        ? { PREPROD_ORIGIN: "https://preprod.example" }
        : {}),
      ASSETS:
        assets ??
        ({
          fetch: async () => new Response("Not found", { status: 404 }),
        }),
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("preproduction APIs are invisible without the exact isolated environment", async () => {
  const missing = await invokeWorker("/api/preprod/health");
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "not-found" });

  const production = await invokeWorker("/api/preprod/health", {
    environment: "production",
  });
  assert.equal(production.status, 404);
  assert.deepEqual(await production.json(), { error: "not-found" });

  const isolatedWithoutDatabase = await invokeWorker("/api/preprod/health", {
    environment: "preproduction",
  });
  assert.equal(isolatedWithoutDatabase.status, 503);
  assert.deepEqual(await isolatedWithoutDatabase.json(), {
    status: "unavailable",
    reason: "preproduction-database-not-bound",
  });
});

test("production stays indexable while preproduction and branch previews are noindex", async () => {
  const production = await render("/");
  assert.equal(production.headers.get("x-robots-tag"), null);

  const preproduction = await invokeWorker("/", {
    headers: { accept: "text/html" },
    environment: "preproduction",
  });
  assert.equal(preproduction.headers.get("x-robots-tag"), "noindex, nofollow");

  const preview = await invokeWorker("/", {
    headers: { accept: "text/html" },
    environment: "preview",
  });
  assert.equal(preview.headers.get("x-robots-tag"), "noindex, nofollow");
});

test("synthetic candidate stays unavailable on migration 0007 without its sentinel", async () => {
  const statements = [];
  const database = {
    prepare(query) {
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          if (query.includes("preprod_demo_dataset")) {
            return null;
          }
          if (query.includes("reserves_validated")) {
            return { total: 3, validated: 3 };
          }
          return null;
        },
        async all() {
          if (query.includes("shipping_zone_configurations")) {
            return { results: [{ zone: "EU" }] };
          }
          return {
            results: [
              { variant_id: "variant_available", available_to_sell: 18 },
              { variant_id: "variant_low", available_to_sell: 4 },
              { variant_id: "variant_sold", available_to_sell: 0 },
            ],
          };
        },
      };
      statements.push(query);
      return statement;
    },
  };
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("health", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("https://preprod.example/api/preprod/health"),
    {
      APP_ENV: "preproduction",
      PREPROD_ORIGIN: "https://preprod.example",
      PREPROD_DEMO_DATASET: "aj-demo-v1",
      DB: database,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.status, "unavailable");
  assert.equal(payload.latestMigration, null);
  assert.deepEqual(payload.capabilities, {
    catalog: false,
    cart: false,
    shippingQuotes: false,
    shippingQuoteZones: { EU: false, UK: false, US: false, CA: false },
    shippingQuoteSimulation: false,
    shippingQuoteSimulationZones: { EU: false, UK: false, US: false, CA: false },
    payment: false,
    orderCreation: false,
    reservesValidated: false,
    syntheticReservesReady: false,
    orderSimulation: false,
    paymentTestSimulation: false,
    emailCaptureSimulation: false,
    emailDelivery: false,
    carrier: false,
    stockSimulation: false,
    shippingSimulation: false,
    deliveryConnectorReady: false,
    deliveryProviderConnected: false,
    realShippingRates: false,
    realShippingLabels: false,
    deliveryLive: false,
    launchReadiness: false,
  });
  assert.deepEqual(payload.stockProjection, []);
  assert.equal(JSON.stringify(payload).includes("available_to_sell"), false);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /preprod_demo_dataset/);
  assert.equal(statements.some((query) => /d1_migrations/.test(query)), false);
  assert.equal(
    statements.some((query) => /inventory|shipping_zone_configurations/.test(query)),
    false,
  );
});

test("preproduction health stays fail-closed without querying tables from a missing migration", async () => {
  const statements = [];
  const database = {
    prepare(query) {
      statements.push(query);
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          if (query.includes("preprod_demo_dataset")) {
            throw new Error("no such table: preprod_demo_dataset");
          }
          return null;
        },
        async all() {
          throw new Error("shipping tables must not be queried");
        },
      };
      return statement;
    },
  };
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("health-old", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("https://preprod.example/api/preprod/health"),
    {
      APP_ENV: "preproduction",
      PREPROD_ORIGIN: "https://preprod.example",
      DB: database,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.status, "unavailable");
  assert.equal(payload.capabilities.shippingQuotes, false);
  assert.deepEqual(payload.capabilities.shippingQuoteZones, {
    EU: false, UK: false, US: false, CA: false,
  });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /preprod_demo_dataset/);
  assert.equal(statements.some((query) => /d1_migrations/.test(query)), false);
  assert.equal(
    statements.some((query) => /inventory|shipping_zone_configurations/.test(query)),
    false,
  );
});

test("preproduction health never depends on the Sites migration ledger", async () => {
  const statements = [];
  const database = {
    prepare(query) {
      statements.push(query);
      assert.doesNotMatch(query, /d1_migrations/);
      return {
        async first() {
          throw new Error("no such table: preprod_demo_dataset");
        },
      };
    },
  };
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("health-no-ledger", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("https://preprod.example/api/preprod/health"),
    {
      APP_ENV: "preproduction",
      PREPROD_ORIGIN: "https://preprod.example",
      DB: database,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).status, "unavailable");
  assert.equal(statements.length, 1);
});

test("synthetic health exposes simulations, never live capabilities, when all four zones are ready", async () => {
  const database = {
    prepare(query) {
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          if (query.includes("preprod_demo_dataset")) {
            return {
              dataset_kind: "synthetic-demo",
              fixture_version: "aj-demo-v1",
              expires_at: "2026-09-30T23:59:59.999Z",
            };
          }
          return query.includes("reserves_validated")
              ? { total: 12, validated: 12 }
              : null;
        },
        async all() {
          return query.includes("sqlite_master")
            ? { results: governedSchemaRows }
            : query.includes("shipping_zone_configurations")
            ? { results: [{ zone: "EU" }, { zone: "UK" }, { zone: "US" }, { zone: "CA" }] }
            : { results: [{ variant_id: "variant_available", available_to_sell: 1 }] };
        },
      };
      return statement;
    },
  };
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("health-all-zones", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("https://preprod.example/api/preprod/health"),
    {
      APP_ENV: "preproduction",
      PREPROD_ORIGIN: "https://preprod.example",
      PREPROD_DEMO_DATASET: "aj-demo-v1",
      DB: database,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "partial");
  assert.equal(payload.capabilities.shippingQuotes, false);
  assert.deepEqual(payload.capabilities.shippingQuoteZones, {
    EU: false, UK: false, US: false, CA: false,
  });
  assert.equal(payload.capabilities.shippingQuoteSimulation, true);
  assert.deepEqual(payload.capabilities.shippingQuoteSimulationZones, {
    EU: true, UK: true, US: true, CA: true,
  });
  assert.equal(payload.capabilities.payment, false);
  assert.equal(payload.capabilities.reservesValidated, false);
  assert.equal(payload.capabilities.syntheticReservesReady, true);
  assert.equal(payload.capabilities.orderCreation, false);
  assert.equal(payload.capabilities.orderSimulation, true);
  assert.equal(payload.capabilities.paymentTestSimulation, true);
  assert.equal(payload.capabilities.emailCaptureSimulation, true);
  assert.equal(payload.capabilities.carrier, false);
  assert.equal(payload.capabilities.stockSimulation, true);
  assert.equal(payload.capabilities.shippingSimulation, true);
  assert.equal(payload.capabilities.launchReadiness, false);
  assert.equal(payload.syntheticDataset.active, true);
});

async function render(pathname = "/", headers = {}) {
  return invokeWorker(pathname, {
    headers: { accept: "text/html", ...headers },
  });
}

function assertDomAssetOrder(html, paths, label) {
  let cursor = -1;
  for (const path of paths) {
    const next = html.indexOf(`src="${path}`, cursor + 1);
    assert.ok(next > cursor, `${label} : actif absent ou hors ordre : ${path}`);
    cursor = next;
  }
}

test("public HTML advertises shared caching without using the forbidden Cache API", async () => {
  let cacheAccesses = 0;
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      get default() {
        cacheAccesses += 1;
        throw new Error("This Worker is not permitted to access the default cache");
      },
    },
  });

  try {
    const publicResponse = await render("/");
    assert.equal(publicResponse.headers.get("x-aj-edge-cache"), null);
    assert.match(
      publicResponse.headers.get("cache-control") ?? "",
      /s-maxage=300/,
    );
    assert.match(
      publicResponse.headers.get("cache-tag") ?? "",
      /aj-luxury-html-2026-09-03-prelaunch-hardening-v1/,
    );
    await publicResponse.text();

    const privateResponse = await render("/", { cookie: "session=private" });
    assert.equal(privateResponse.headers.get("x-aj-edge-cache"), null);
    assert.doesNotMatch(
      privateResponse.headers.get("cache-control") ?? "",
      /s-maxage/i,
    );
    await privateResponse.text();
    assert.equal(cacheAccesses, 0);
  } finally {
    if (originalCaches) {
      Object.defineProperty(globalThis, "caches", originalCaches);
    } else {
      delete globalThis.caches;
    }
  }
});

function assetHarness() {
  const video = Uint8Array.from({ length: 10 }, (_, index) => index);
  const calls = [];

  return {
    calls,
    fetch: async (request) => {
      const url = new URL(request.url);
      calls.push({
        method: request.method,
        pathname: url.pathname,
        search: url.search,
        range: request.headers.get("range"),
      });

      if (url.pathname === "/videos/test.mp4") {
        const headers = {
          "Content-Length": String(video.byteLength),
          "Content-Type": "application/octet-stream",
          ETag: '"test-video"',
        };
        return request.method === "HEAD"
          ? new Response(null, { status: 200, headers })
          : new Response(video, { status: 200, headers });
      }

      if (url.pathname === "/i18n/en.json") {
        return new Response('{"nav.home":"Home"}', {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      return new Response("Not found", { status: 404 });
    },
  };
}

test("media MP4 supports every single byte-range form and rewrites to ASSETS", async () => {
  const cases = [
    ["bytes=2-5", [2, 3, 4, 5], "bytes 2-5/10"],
    ["bytes=7-", [7, 8, 9], "bytes 7-9/10"],
    ["bytes=-3", [7, 8, 9], "bytes 7-9/10"],
    ["bytes=8-99", [8, 9], "bytes 8-9/10"],
    ["BYTES = 0 - 0", [0], "bytes 0-0/10"],
  ];

  for (const [range, expectedBody, expectedContentRange] of cases) {
    const assets = assetHarness();
    const response = await invokeWorker("/media/videos/test.mp4?v=v3", {
      headers: { range },
      assets,
    });

    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get("content-range"), expectedContentRange);
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(
      response.headers.get("content-length"),
      String(expectedBody.length),
    );
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(
      response.headers.get("cache-control"),
      "public, max-age=31536000, immutable",
    );
    assert.deepEqual(
      [...new Uint8Array(await response.arrayBuffer())],
      expectedBody,
    );
    assert.deepEqual(assets.calls, [
      {
        method: "GET",
        pathname: "/videos/test.mp4",
        search: "?v=v3",
        range: null,
      },
    ]);
  }
});

test("media MP4 returns correct HEAD and 416 responses", async () => {
  const headAssets = assetHarness();
  const head = await invokeWorker("/media/videos/test.mp4?v=v3", {
    method: "HEAD",
    headers: { range: "bytes=2-5" },
    assets: headAssets,
  });
  assert.equal(head.status, 206);
  assert.equal(head.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(head.headers.get("content-length"), "4");
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(headAssets.calls[0].method, "HEAD");
  assert.equal(headAssets.calls[0].range, null);

  for (const range of [
    "bytes=10-10",
    "bytes=5-2",
    "bytes=-0",
    "bytes=0-1,3-4",
    "items=0-1",
    "bytes=999999999999999999999-",
  ]) {
    const assets = assetHarness();
    const response = await invokeWorker("/media/videos/test.mp4?v=v3", {
      headers: { range },
      assets,
    });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get("content-range"), "bytes */10");
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-length"), "0");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
});

test("media i18n is rewritten with immutable JSON security headers", async () => {
  const assets = assetHarness();
  const response = await invokeWorker("/media/i18n/en.json?v=v3", { assets });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await response.text(), '{"nav.home":"Home"}');
  assert.deepEqual(assets.calls, [
    {
      method: "GET",
      pathname: "/i18n/en.json",
      search: "?v=v3",
      range: null,
    },
  ]);
});

test("server-renders the real AJ Luxury launch homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("cache-control") ?? "", /s-maxage=300/);
  assert.equal(response.headers.get("x-aj-edge-cache"), null);

  const html = await response.text();
  assert.match(html, /<html lang="fr">/i);
  assert.match(html, /<title>AJ Luxury \| Reveal Your Inner Beauty<\/title>/i);
  assert.doesNotMatch(
    html,
    /\+33 6 88 42 40 62|tel:\+33688424062/,
    "le téléphone professionnel ne doit pas envahir l’accueil ou son footer",
  );
  assert.match(
    html,
    /<link rel="icon" href="(?:https:\/\/ajluxurystore\.com)?\/favicon\.png"[^>]*sizes="512x512"[^>]*type="image\/png"/i,
  );
  assert.match(
    html,
    /<link rel="manifest" href="(?:https:\/\/ajluxurystore\.com)?\/site\.webmanifest"/i,
  );
  assert.match(
    html,
    /<link rel="apple-touch-icon" href="(?:https:\/\/ajluxurystore\.com)?\/apple-touch-icon\.png"[^>]*sizes="180x180"/i,
  );
  assert.match(html, /Apollon/);
  assert.match(html, /Pourpre Impérial/);
  assert.match(html, /Rose Velours/);
  assert.match(html, /Lilas Céleste/);
  /* Le poster client reste la première image du hero. Le film progressif est
     dérivé pixel pour pixel de cette source et ne remplace jamais le fallback. */
  assert.match(html, /<main class="aj-home [^"]+">/);
  assert.match(html, /data-hero-version="openart-dual-v1"/);
  assert.match(html, /Reveal Your[\s\S]*Inner Beauty/);
  assert.match(
    html,
    /aj-luxury-hero-openart-desktop-poster\.webp"[^>]*fetchPriority="high"[^>]*decoding="async"/,
  );
  assert.match(html, /aj-luxury-hero-openart-mobile-poster-540\.webp 540w/);
  assert.match(html, /aj-luxury-hero-openart-mobile-poster-1080\.webp 1080w/);
  assert.match(html, /apollon-pourpre-lyre-v1\.webp/);
  assert.match(html, /apollon-pourpre-model-world-v1\.webp/);
  assert.match(html, /Apollon Pourpre Impérial porté par Alex/);
  assert.doesNotMatch(html, /Pourpre Impérial porté par Jérémy et Alex/);
  assert.match(html, /apollon-lilas-lyre-v1\.webp/);
  assert.match(html, /apollon-lilas-model-color-v2\.webp/);
  assert.match(html, /apollon-rose-lyre-v1\.webp/);
  assert.match(html, /apollon-rose-model-color-v2\.webp/);

  /* Les trois produits canoniques et leurs routes PDP existent au premier
     rendu. La motion ne porte jamais la responsabilité du contenu commerce. */
  assert.equal((html.match(/class="aj-product-card"/g) ?? []).length, 3);
  assert.match(html, /product-rose-profile\.webp"[^>]*loading="lazy"[^>]*fetchPriority="low"/);
  assert.match(html, /product-lilas-model\.webp"[^>]*loading="lazy"[^>]*fetchPriority="low"/);
  assert.match(html, /product-card-pourpre\.webp"[^>]*loading="lazy"[^>]*fetchPriority="low"/);
  assert.match(html, /href="#apollon"[^>]*>[\s\S]*Découvrir/);
  assert.match(html, /href="\/products\/rose-pale"/);
  assert.match(html, /href="\/products\/lilas-bleu-clair"/);
  assert.match(html, /href="\/products\/pourpre"/);
  assert.match(html, /Rose Velours/);
  assert.match(html, /Lilas Céleste/);
  assert.match(html, /Pourpre Impérial/);
  assert.match(
    html,
    /product-card-pourpre\.webp[\s\S]*product-rose-profile\.webp[\s\S]*product-lilas-model\.webp/,
  );
  assertDomAssetOrder(
    html,
    [
      "/images/client/aj-luxury-hero-openart-desktop-poster.webp",
      "/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
      "/images/client/apollon-world/apollon-pourpre-model-world-v1.webp",
      "/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
      "/images/client/apollon-world/apollon-lilas-model-color-v2.webp",
      "/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
      "/images/client/apollon-world/apollon-rose-model-color-v2.webp",
      "/images/client/raw/product-card-pourpre.webp",
      "/images/client/raw/product-rose-profile.webp",
      "/images/client/raw/product-lilas-model.webp",
      "/images/client/editorial-pourpre-chair.webp",
      "/images/client/campaign-duo-lilas-seated.webp",
      "/images/client/editorial-rose-profile.webp",
    ],
    "accueil live",
  );
  assert.match(
    html,
    /Chez AJ Luxury,[\s\S]*le véritable luxe commence[\s\S]*au plus près de soi/,
  );

  /* Aucun film, rendu métallique, asset généré ni classe CSS invalide ne doit
     réapparaître dans le document réellement servi. */
  assert.match(html, /<video[^>]*muted=""[^>]*playsInline=""[^>]*autoPlay=""[^>]*preload="none"/);
  assert.doesNotMatch(html, /<iframe|data-metallic-mounted="true"|metallic-field__canvas|Figer le métal/);
  assert.doesNotMatch(html, /https?:\/\/(?!ajluxurystore\.com)/i);
  assert.doesNotMatch(html, /generated_images|hero-figures|identity-overlay|hero-v[67]-/);
  assert.doesNotMatch(html, /class="[^"]*\bundefined\b/);

  /* Le chrome et les destinations restent ceux de la production validée. */
  assert.match(html, /<header[^>]*>[\s\S]*aj-luxury-logo\.webp/);
  assert.match(html, /aria-label="Navigation principale"/);
  assert.match(html, /href="\/"[^>]*aria-current="page"[^>]*>Accueil</);
  assert.match(html, />Notre histoire</);
  assert.match(html, /href="\/shop"/);
  assert.match(html, /href="\/notre-histoire"/);
  assert.match(html, />Collection Apollon</);
  assert.doesNotMatch(html, /data-hero-fusion|href="\/#matiere"|>La matière</);
  assert.doesNotMatch(html, /pika|Signature 01|Contour 02|Ligne 03|Motion 04|Libre 05|iStock|Getty/i);
});

/* Chaque cadre porte son placeholder, la vue principale portant en plus la
   seule image pleine résolution. Les recommandations suivent ensuite l'ordre
   exact observé sur le DOM public. */
const productCases = [
  [
    "/products/pourpre",
    "Pourpre Impérial",
    5,
    [
      "/images/client/raw/product-card-pourpre.webp",
      "/images/client/raw/product-card-pourpre-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-pourpre-detail-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-pourpre-back-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-pourpre-alt-placeholder-v1.webp?v=v1",
      "/images/client/editorial-pourpre-chair-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-rose-profile.webp",
      "/images/client/raw/product-lilas-model.webp",
    ],
  ],
  [
    "/products/rose-pale",
    "Rose Velours",
    4,
    [
      "/images/client/raw/product-rose-profile.webp",
      "/images/client/raw/product-rose-profile-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-card-rose-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-rose-front-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-rose-detail-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-card-pourpre.webp",
      "/images/client/raw/product-lilas-model.webp",
    ],
  ],
  [
    "/products/lilas-bleu-clair",
    "Lilas Céleste",
    5,
    [
      "/images/client/raw/product-lilas-model.webp",
      "/images/client/raw/product-lilas-model-placeholder-v1.webp?v=v1",
      "/images/client/editorial-lilas-chair-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-lilas-detail-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-lilas-back-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-lilas-front-placeholder-v1.webp?v=v1",
      "/images/client/raw/product-card-pourpre.webp",
      "/images/client/raw/product-rose-profile.webp",
    ],
  ],
];

for (const [pathname, colorName, galerie, assetOrder] of productCases) {
  test(`server-renders ${pathname}`, async () => {
    const response = await render(pathname);
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.match(html, /Apollon/);
    assert.match(html, new RegExp(colorName));
    /* En production, le prix valide et le moteur de packs sont commandables.
       L'ancien libelle de fermeture ne doit plus contredire ce parcours. */
    assert.doesNotMatch(html, /Vente non encore ouverte/);
    assert.match(html, /29,99(?:\s|&nbsp;|&#xA0;)*€/);
    assert.match(html, /Choisir une taille/);
    assert.match(
      html,
      /94\s*%\s*modal\s*(?:,|–|-|et)\s*6\s*%\s*élasthanne/,
    );
    assert.match(html, /ceinture de 3,5 cm/i);
    assert.match(html, /Description complète/);
    assert.match(html, /Caractéristiques/);
    /* Le guide décrit explicitement le tour de taille du corps conseillé et
       reste identique sur les trois coloris. Il ne revendique aucune mesure
       du vêtement fabricant. */
    assert.match(html, /Guide des tailles/);
    assert.match(html, /Tour de taille conseillé/);
    assert.match(html, /Mesurez votre tour de taille/);
    assert.match(html, /67–73 cm/);
    assert.match(html, /74–80 cm/);
    assert.match(html, /81–87 cm/);
    assert.match(html, /88–97 cm/);
    assert.doesNotMatch(html, />XS<|>XXL<|mesures? à confirmer/i);
    assert.match(html, /Agrandir la vue 1/);
    assert.equal(
      (html.match(/data-gallery-media="full"/g) ?? []).length,
      1,
      "initial HTML keeps only the full-resolution lead gallery image",
    );
    assert.equal(
      (html.match(/data-gallery-media="placeholder"/g) ?? []).length,
      galerie,
      "every gallery frame keeps a lightweight visual placeholder",
    );
    assertDomAssetOrder(html, assetOrder, `${pathname} live`);
    assert.doesNotMatch(html, /images\/editorial\/isabelle-apollon/);
    assert.match(html, />1 pièce</);
    assert.match(html, />2 pièces</);
    assert.match(html, />3 pièces</);
    assert.match(html, />Accueil</);
    assert.match(
      html,
      /href="\/shop"[^>]*aria-current="page"[^>]*>Boutique</,
    );
    assert.doesNotMatch(
      html,
      /(?:60|61|63)\s+(?:en stock|disponibles?)/i,
    );
    assert.doesNotMatch(
      html,
      /(?:physical|reserved|availableToSell|inventoryQuantity|inventory)(?:\\?&quot;|\\?")?\s*:\s*(?:2|3|60|61|63)/i,
    );
    assert.doesNotMatch(
      html,
      /Prix à confirmer|Tarif en cours de validation|49,00|Prix de démonstration|iStock|Getty/i,
    );
    assert.doesNotMatch(
      html,
      /product-story|benefit-grid|product-information/,
    );
  });
}

test("unknown product does not render a sale page", async () => {
  const response = await render("/products/inconnu");
  assert.equal(response.status, 404);
});

test("server-renders the real boutique and its complete navigation", async () => {
  const response = await render("/shop");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1[^>]*>Apollon<\/h1>/);
  assert.match(html, />3 coloris</);
  assert.match(html, /Pourpre Impérial/);
  assert.match(html, /Rose Velours/);
  assert.match(html, /Lilas Céleste/);
  assert.match(html, /href="\/products\/pourpre"/);
  assert.match(html, /href="\/products\/rose-pale"/);
  assert.match(html, /href="\/products\/lilas-bleu-clair"/);
  assert.match(
    html,
    /product-card-pourpre\.webp[\s\S]*product-rose-profile\.webp[\s\S]*product-lilas-model\.webp/,
  );
  assert.match(html, />Accueil</);
  assert.match(
    html,
    /href="\/shop"[^>]*aria-current="page"[^>]*>Boutique</,
  );
  assert.match(html, /href="\/shipping-returns"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/terms"/);
  assert.doesNotMatch(html, /94\s*%\s*modal/i);
  assert.doesNotMatch(html, /6\s*%\s*élasthanne/i);
  assert.doesNotMatch(html, /href="\/#matiere"/);
  assert.doesNotMatch(html, /Les trois coloris|3 produits/);
  assert.doesNotMatch(
    html,
    /<h[1-6][^>]*>(?:Collection Apollon|Les trois coloris|3 produits)<\/h[1-6]>/,
  );
  assert.doesNotMatch(html, />\s*Best Seller\s*</i);
  /* L'interdit « aucun prix en boutique » est tombé avec la reprise du 19/08 :
     les trois coloris partagent UN prix et la boutique le dit une fois
     (app/shop/page.tsx, LocalizedPrice). Le contrat devient : le prix unique,
     jamais un prix par carte. */
  assert.ok(
    (html.match(/29,99(?:\s|&nbsp;|&#xA0;)*€/g) ?? []).length >= 1,
    "the boutique states the single shared price",
  );
});

test("server-renders the complete AJ Luxury story", async () => {
  const response = await render("/notre-histoire");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Notre histoire/);
  // Le runtime publié conserve trois actes lisibles sans numérotation décorative.
  assert.doesNotMatch(html, /Le marbre|La lyre|Le laurier/);
  assert.equal((html.match(/<p[^>]*>0[123]<\/p>/g) ?? []).length, 0);
  assert.match(html, /Le point de départ/);
  assert.match(html, /Alex (?:&amp;|&#x26;) Jérémy/);
  assert.match(html, /Pas d’excès\. Simplement la justesse des détails\./);
  assert.match(html, /campaign-duo-lilas-seated\.webp/);
  assert.match(html, /product-lilas-model\.webp/);
  assert.match(html, /story-jeremy-retouched\.jpeg/);
  assert.match(html, /product-pourpre-detail\.webp/);
  assert.match(html, />Accueil</);
  assert.match(
    html,
    /href="\/notre-histoire"[^>]*aria-current="page"[^>]*>Notre histoire</,
  );
  assert.doesNotMatch(html, /Le premier chapitre|94\s*%\s*modal|6\s*%\s*élasthanne/i);
  assert.doesNotMatch(
    html,
    /intention d’image|casting|futurs? shootings?|compte officiel à confirmer/i,
  );
  assert.match(html, /href="\/shop"/);
  assert.doesNotMatch(html, /iStock|Getty|Lorem ipsum/i);
});

const informationCases = [
  ["/shipping-returns", /Livraison internationale et retours/],
  ["/privacy", /Politique de confidentialité/],
  ["/terms", /Conditions générales de vente/],
  ["/contact", /Nous contacter/],
  ["/legal-notice", /Mentions légales/],
  ["/cookies", /Cookies/],
  ["/withdrawal", /Droit de rétractation/],
];

for (const [pathname, marker] of informationCases) {
  test(`server-renders the information route ${pathname}`, async () => {
    const response = await render(pathname);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, marker);
  });
}

test("shipping and terms publish the exact active international scope and DAP allocation", async () => {
  for (const pathname of ["/shipping-returns", "/terms"]) {
    const response = await render(pathname);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Royaume-Uni/);
    assert.match(html, /États-Unis/);
    assert.match(html, /Canada/);
    assert.match(html, /Émirats arabes unis/);
    assert.match(html, /Qatar/);
    assert.match(html, /Arabie saoudite/);
    assert.match(html, /Incoterm DAP/);
    assert.match(html, /droits, taxes et frais d.importation/);
    assert.doesNotMatch(html, /destinations hors Union européenne[^.]*restent fermées/i);
  }
});

test("contact publishes the service email and no personal seller phone", async () => {
  const response = await render("/contact");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /mailto:contact@ajluxurystore\.com/);
  assert.doesNotMatch(html, /tel:\+33688424062|\+33 6 88 42 40 62/);
  assert.match(html, /La boutique en ligne est ouverte/);
  assert.doesNotMatch(
    html,
    /vente en ligne n.est pas encore ouverte|site est une démonstration/i,
  );
});

test("live customer dictionaries never present the storefront as a demo or unopened shop", () => {
  const dictionaryUrls = [
    "../lib/i18n/dictionaries/fr.json",
    "../lib/i18n/dictionaries/en.json",
    "../lib/i18n/dictionaries/es.json",
    "../lib/i18n/dictionaries/de.json",
    "../lib/i18n/dictionaries/it.json",
    "../public/i18n/en.json",
    "../public/i18n/es.json",
    "../public/i18n/de.json",
    "../public/i18n/it.json",
  ];

  for (const relativeUrl of dictionaryUrls) {
    const dictionary = JSON.parse(
      readFileSync(new URL(relativeUrl, import.meta.url), "utf8"),
    );
    assert.equal(typeof dictionary["contact.storeStatus"], "string");
    assert.equal(dictionary["contact.demoNotice"], undefined);
    const liveOrFailClosedCopy = [
      "account.eyebrow",
      "account.error",
      "account.demoNotice",
      "contact.storeStatus",
      "shop.saleNotice",
      "product.priceLabel",
      "product.openingSoon",
      "product.paymentDisabled",
      "product.cartSecureNotice",
      "product.cartClosed",
      "cart.demoNotice",
    ]
      .map((key) => dictionary[key])
      .filter(Boolean)
      .join(" ");

    assert.doesNotMatch(
      liveOrFailClosedCopy,
      /démonstr|demonstr|private demo|demo-kunden|dimostrativ|opening soon|ouverture prochaine|sales? not open|vente non encore ouverte|prossima apertura|próxima apertura|eröffnung in kürze|preproduction privée|private preproduction|private vorproduktion|preproducción privada|preproduzione privata/i,
    );
  }
});

test("legal notice publishes the sourced seller identity and never the closed establishment", async () => {
  const response = await render("/legal-notice");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Éditeur du site/);
  assert.match(html, /Direction de la publication/);
  assert.match(html, /Cloudflare, Inc\./);
  assert.match(html, /\+33 1 73 01 52 44/);
  assert.match(html, /contact@ajluxurystore\.com/);

  /* L'IDENTITE EST DESORMAIS RENSEIGNEE, ET ELLE EST SOURCEE. Relevee le
     22/08 sur l'Annuaire des Entreprises (INSEE, DGFiP, Douanes, INPI) et
     recoupee avec l'adresse d'expediteur du compte Sendcloud. Le test ne
     verifie plus l'absence de donnees, il verifie qu'elles sont LES BONNES. */
  assert.match(html, /Jérémy Scheppler/);
  assert.match(html, /944 996 487/);
  assert.match(html, /944 996 487 00038/);
  assert.match(html, /Belmont/);
  assert.match(html, /Registre national des entreprises/);

  /* LE SIRET FERME NE DOIT JAMAIS PARAITRE. L'entreprise compte trois
     etablissements et un seul est en activite ; le 00020 de Belmont est ferme
     depuis le 28/07/2026 et circule pourtant encore dans des annuaires
     tiers. Le publier serait une mention legale fausse. */
  assert.doesNotMatch(html, /944 996 487 00020|94499648700020/);
  assert.doesNotMatch(html, /944 996 487 00012|94499648700012/);

  /* Aucun numero de TVA n'est invente. La franchise communiquee est exprimee
     par sa mention de facture canonique, sans transformer un identifiant
     absent en numero intracommunautaire. */
  assert.doesNotMatch(html, /FR\s?58\s?944\s?996\s?487/);
  assert.doesNotMatch(html, /TVA intracommunautaire/);
  assert.doesNotMatch(html, /\bTTC\b/);
  assert.match(html, /TVA non applicable, art\. 293 B/);

  /* L'e-mail est le contact vendeur public pendant le délai validé. */
  assert.doesNotMatch(html, /À compléter/);
  assert.doesNotMatch(html, /Aucun numéro de téléphone|ligne professionnelle/i);
  assert.match(html, /Informations juridiques applicables à la boutique en ligne/i);
  assert.doesNotMatch(html, /vente en ligne activée après|avant l’ouverture/i);

  /* Une seule ligne téléphone : celle de l'hébergeur, pas celle du vendeur. */
  const lignesTelephone = html.match(/<dt[^>]*>Téléphone<\/dt>/g) ?? [];
  assert.equal(
    lignesTelephone.length,
    1,
    "seul l’hébergeur doit porter un téléphone pendant le délai validé",
  );
  assert.doesNotMatch(html, /tel:\+33688424062|\+33 6 88 42 40 62/);
  assert.match(html, /\+33 1 73 01 52 44/);
});

test("terms cover the 2026 consumer baseline without a blanket underwear exclusion", async () => {
  const response = await render("/terms");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /quatorze jours calendaires/i);
  assert.match(html, /deux ans à compter de la délivrance/i);
  assert.match(html, /prolongée de six mois/i);
  assert.match(html, /renouvelée pour deux ans/i);
  assert.match(html, /modèle ci-dessous/);
  assert.match(html, /mailto:contact@ajluxurystore\.com/);
  assert.doesNotMatch(html, /tel:\+33688424062|\+33 6 88 42 40 62/);
  assert.doesNotMatch(html, /avant l’ouverture des ventes/i);
  assert.doesNotMatch(html, /accéder au formulaire de rétractation/);
  assert.match(html, /accusé de réception/i);
  assert.match(html, /n’exclut pas le droit de rétractation au seul motif que le\s+produit est un sous-vêtement/i);
  assert.match(html, /médiateur conventionné/i);
  assert.doesNotMatch(html, /plateforme (?:européenne )?(?:de )?règlement en ligne|ec\.europa\.eu\/consumers\/odr/i);

  /* AUCUN TEXTE D'ATTENTE SUR DES CONDITIONS GENERALES DE VENTE. Releve le
     22/08/2026 sur la previsualisation deployee : la phrase rendue etait
     « le mediateur conventionne par AJ Luxury : A selectionner et
     conventionner avant l'ouverture des ventes, A completer, A completer. »
     Trois marqueurs d'inachevement dans une seule phrase, sur la page qu'un
     client lit pour se rassurer.

     Ces « A completer » ne satisfaisaient pas davantage l'article L612-1 que
     leur absence. La page dit desormais l'echeance. Ce test empeche qu'un
     futur champ vide reintroduise le probleme ailleurs sur la page. */
  assert.doesNotMatch(html, /À compléter/);
  assert.doesNotMatch(html, /À sélectionner/);
});

test("privacy and cookies describe the live commerce storage and no fictitious tracker", async () => {
  const privacyResponse = await render("/privacy");
  const privacyHtml = await privacyResponse.text();
  assert.match(privacyHtml, /compte client, à la commande, au paiement/i);
  assert.match(privacyHtml, /données ne sont pas vendues/i);
  assert.match(privacyHtml, /Facturation et comptabilité/);
  assert.match(privacyHtml, /10 ans/);
  assert.match(privacyHtml, /CNIL/);
  /* Reformulé lors de la reprise des pages légales : même garantie, phrase
     plus complète — ni réception ni conservation du numéro ou du
     cryptogramme. */
  assert.match(
    privacyHtml,
    /ne reçoit ni ne conserve le numéro complet de carte ou son\s+cryptogramme/i,
  );

  const cookiesResponse = await render("/cookies");
  const cookiesHtml = await cookiesResponse.text();
  assert.match(cookiesHtml, /aj-luxury\.locale\.v1/);
  assert.match(cookiesHtml, /aj-luxury-intro-seen/);
  assert.match(cookiesHtml, /aucun traceur publicitaire/i);
  assert.match(cookiesHtml, /__Host-aj_cart/);
  assert.match(cookiesHtml, /__Host-aj_customer/);
  assert.match(cookiesHtml, /__Host-aj_guest_order/);
  assert.match(cookiesHtml, /aucun bandeau de consentement n’est affiché/i);
  assert.doesNotMatch(cookiesHtml, /À ce jour|sera activé|six mois/i);
  assert.doesNotMatch(cookiesHtml, /Google Analytics|Meta Pixel|TikTok Pixel/i);
});

test("withdrawal route gives an immediately usable customer process", async () => {
  const response = await render("/withdrawal");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Exercer votre droit/i);
  assert.match(html, /quatorze jours suivant la réception/i);
  assert.match(html, /conservez la preuve d’envoi/i);
  assert.match(html, /modèle figurant dans les conditions générales/i);
  assert.match(html, /contact@ajluxurystore\.com/);
  assert.doesNotMatch(html, /prévisualisation|Aucune commande réelle/i);
});

test("cart renders a secure loading state and ignores legacy URL variants", async () => {
  const response = await render(
    "/cart?variant=variant_boxer_rose-pale_xl",
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Votre panier/i);
  assert.match(html, /Chargement du panier/i);
  assert.doesNotMatch(html, /Rose Velours|Taille[\s\S]*XL|29,99/);
  assert.doesNotMatch(html, /href="\/checkout|cart\?variant/);
});

test("checkout uses the cookie-backed cart and ignores legacy URL variants", async () => {
  const checkout = await render(
    "/checkout?variant=variant_boxer_rose-pale_xl",
  );
  const checkoutHtml = await checkout.text();
  assert.match(checkoutHtml, /Paiement sécurisé/i);
  assert.match(checkoutHtml, /Chargement du panier/i);
  assert.doesNotMatch(checkoutHtml, /Rose Velours|29,99|cart\?variant/);
  assert.doesNotMatch(checkoutHtml, /<input[^>]+(?:card|carte|cvc)/i);
});

const commerceCases = [
  ["/cart", /Chargement du panier/i],
  ["/checkout", /Chargement du panier/i],
  ["/account", /Chargement sécurisé de votre espace/i],
];

for (const [pathname, marker] of commerceCases) {
  test(`server-renders the production commerce route ${pathname}`, async () => {
    const response = await render(pathname);
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.headers.get("cache-control") ?? "", /s-maxage/i);
    assert.equal(response.headers.get("x-aj-edge-cache"), null);
    const html = await response.text();
    assert.match(html, marker);
    assert.doesNotMatch(html, /sk_live_|pk_live_|password=/i);
  });
}
