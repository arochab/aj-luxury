import assert from "node:assert/strict";
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

test("production pages remain indexable while preproduction is explicitly noindex", async () => {
  const production = await render("/");
  assert.equal(production.headers.get("x-robots-tag"), null);

  const preproduction = await invokeWorker("/", {
    headers: { accept: "text/html" },
    environment: "preproduction",
  });
  assert.equal(preproduction.headers.get("x-robots-tag"), "noindex, nofollow");
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
      /aj-luxury-html-2026-08-21-hero-v6/,
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
  assert.match(
    html,
    /<link rel="icon" href="(?:https:\/\/ajluxurystore\.com)?\/favicon\.svg"/i,
  );
  assert.match(html, /Apollon/);
  assert.match(html, /Pourpre Impérial/);
  assert.match(html, /Rose Velours/);
  assert.match(html, /Lilas Céleste/);
  /* ── LE CONTRAT DE L'ACCUEIL v9 ───────────────────────────────────────
     Le hero n'est plus une démonstration WebGL ni un plan épinglé. Il doit
     rendre immédiatement une hiérarchie lisible et la photographie de studio
     existante, sans dérivé ni calque généré. Ce contrat verrouille la sortie
     réellement servie, pas une mécanique d'animation interne. */
  assert.match(html, /<main class="aj-home aj-home-v9">/);
  assert.match(html, /id="home-hero-title"/);
  assert.match(html, /Reveal Your[\s\S]*Inner[\s\S]*Beauty/);
  assert.match(
    html,
    /product-pourpre-detail\.webp"[^>]*fetchPriority="high"[^>]*decoding="async"/,
  );
  assert.match(html, /product-pourpre-detail\.webp" alt="AJ Luxury — détail d’Apollon Pourpre Impérial"/);
  assert.equal(
    (html.match(/product-pourpre-detail\.webp/g) ?? []).length,
    2,
    "le détail Pourpre doit apparaître une fois dans le preload et une fois dans l’image prioritaire",
  );
  assert.doesNotMatch(html, /campaign-duo-pourpre\.webp|hero-pourpre-model\.webp/);
  assert.match(html, /campagne-duo-760\.webp/);
  assert.match(html, /campagne-duo-1100\.webp/);
  assert.match(html, /campagne-duo-1484\.webp/);
  assert.match(html, /product-rose-detail\.webp"[^>]*loading="eager"/);
  assert.match(html, /Apollon · Rose Velours/);
  assert.match(html, /Apollon · Lilas Céleste/);
  assert.match(html, /href="\/products\/pourpre"/);
  assert.match(html, /29,99(?:\s| |&nbsp;)€/);
  assert.match(html, /Découvrir[\s\S]*Apollon/);

  /* Aucun vestige du film remplacé ne doit repasser dans le bundle rendu. */
  assert.doesNotMatch(
    html,
    /data-hero-version|hero-figures|identity-overlay|hero-v[67]-|apollon-world|editorial\/isabelle-apollon|placeholder-v1|campaign-duo-lilas-seated|campagne-duo-lilas-master|product-lilas-model/,
  );
  assert.doesNotMatch(html, /data-metallic-mounted|metallic-field__canvas/);
  assert.doesNotMatch(html, /<video|Figer le métal/);
  assert.doesNotMatch(html, /aj-film__hero-|aj-film__living-duo|aj-film__liquid-overlay/);

  /* Le logo de barre reste la seule image de marque : aucun doublon animé ne
     vient s'y superposer, et le header conserve son point d'accroche stable. */
  assert.match(html, /data-aj-marque="entete"/);
  assert.equal(
    (html.match(/aj-luxury-logo\.webp/g) ?? []).length,
    2,
    "le logo doit apparaître une fois dans le preload et une fois dans le header",
  );
  assert.match(html, /data-aj-tete-seuil/);

  /* Les coloris sont de vrais onglets : l'état actif, le panneau associé et
     l'accès direct au produit sont présents dès le rendu serveur. */
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.match(html, /role="tabpanel"/);
  assert.match(
    html,
    /id="home-colorway-pourpre"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="home-colorway-pourpre"/,
  );
  assert.match(html, /href="\/products\/pourpre"/);

  assert.match(html, /href="\/"[^>]*aria-current="page"[^>]*>Accueil</);
  assert.match(html, />Notre histoire</);
  /* UN SEUL LIBELLE POUR /shop SUR TOUTE LA PAGE. Elle s'appelait « Voir
     toute la boutique » dans #coloris et « Decouvrir la collection » en
     cloture : deux noms pour une meme destination, sur un meme ecran. Le test
     verrouille l'unicite, pas la formule. */
  assert.equal(
    (html.match(/href="\/shop"[^>]*><span>Voir toute la boutique<\/span>/g) ?? [])
      .length,
    2,
  );
  assert.doesNotMatch(html, /Découvrir la collection/);
  assert.match(html, /94\s*%[\s\S]*modal/i);
  assert.match(html, /6\s*%[\s\S]*élasthanne/i);
  assert.match(
    html,
    /editorial-rose-profile\.webp[\s\S]*editorial-lilas-chair\.webp[\s\S]*editorial-pourpre-chair\.webp/,
  );
  assert.doesNotMatch(html, /Un modèle décliné en trois coloris/i);
  assert.doesNotMatch(html, /data-hero-fusion/);
  assert.doesNotMatch(html, /href="\/#collection"/);
  assert.doesNotMatch(html, /href="\/#matiere"/);
  assert.doesNotMatch(html, />La matière</);
  assert.doesNotMatch(html, /aj-film__living-duo|aj-film__liquid-overlay/);
  assert.doesNotMatch(
    html,
    /pika|Signature 01|Contour 02|Ligne 03|Motion 04|Libre 05|iStock|Getty/i,
  );
});

/* Tailles de galerie depuis la reprise des fiches du 19/08 (natures mortes) :
   pourpre 5, rose 4, lilas 3. L'ancienne garde « >= 4 placeholders » était un
   proxy calibré sur le catalogue d'avant ; l'invariant exact est plus fort —
   chaque cadre porte son placeholder, la vue principale portant EN PLUS la
   seule image pleine résolution : n placeholders, 1 full. */
const productCases = [
  ["/products/pourpre", "Pourpre Impérial", 5],
  ["/products/rose-pale", "Rose Velours", 4],
  ["/products/lilas-bleu-clair", "Lilas Céleste", 3],
];

for (const [pathname, colorName, galerie] of productCases) {
  test(`server-renders ${pathname}`, async () => {
    const response = await render(pathname);
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.match(html, /Apollon/);
    assert.match(html, new RegExp(colorName));
    /* Libelle corrige le 22/08 : quatre documents internes disent que
       29,99 EUR est le prix VALIDE par le client, donc l'annoncer fictif etait
       faux. Le garde-fou reste le meme — un montant nu se lirait comme une
       offre active alors que la vente n'est pas ouverte. */
    assert.match(html, /Vente non encore ouverte/);
    assert.match(html, /29,99(?:\s|&nbsp;|&#xA0;)*€/);
    assert.match(html, /Sélectionnez une taille/);
    assert.match(
      html,
      /94\s*%\s*modal\s*(?:,|–|-|et)\s*6\s*%\s*élasthanne/,
    );
    assert.match(html, /ceinture de 3,5 cm/i);
    assert.match(html, /Description complète/);
    assert.match(html, /Caractéristiques/);
    assert.match(html, /Guide des tailles/);
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
    assert.match(html, /Disponibilité simulée/);
    assert.match(html, />Accueil</);
    assert.match(
      html,
      /href="\/shop"[^>]*aria-current="page"[^>]*>Boutique</,
    );
    assert.doesNotMatch(
      html,
      /(?:26|36|87|88|102|103)\s+(?:en stock|disponibles?)/i,
    );
    assert.doesNotMatch(
      html,
      /(?:physical|reserved|availableToSell|inventoryQuantity|inventory)(?:\\?&quot;|\\?")?\s*:\s*(?:26|36|87|88|102|103)/i,
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
  /* Depuis la reprise du 19/08, la boutique NOMME les coloris au lieu de les
     compter — « Coloris : Rose Velours · Lilas Céleste · Pourpre Impérial ». */
  assert.match(
    html,
    /Coloris[\s\S]*Rose Velours[\s\S]*Lilas Céleste[\s\S]*Pourpre Impérial/,
  );
  assert.match(html, /Pourpre Impérial/);
  assert.match(html, /Rose Velours/);
  assert.match(html, /Lilas Céleste/);
  assert.match(html, /href="\/products\/pourpre"/);
  assert.match(html, /href="\/products\/rose-pale"/);
  assert.match(html, /href="\/products\/lilas-bleu-clair"/);
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
  // Les trois mouvements sont nommés, plus jamais numérotés (retour du 19/08).
  assert.match(html, /Le marbre/);
  assert.match(html, /La lyre/);
  assert.match(html, /Le laurier/);
  assert.doesNotMatch(html, /<p[^>]*>0[123]<\/p>/);
  assert.match(html, /Le vêtement que personne ne voit/);
  assert.match(html, /Jérémy et Alex/);
  // La seule prise de parole signée du site, et le seul endroit où le double
  // rôle fondateurs/mannequins est explicité.
  assert.match(html, /Apollon est notre premier modèle\. Il ne sera pas le dernier\./);
  assert.match(html, /et les deux corps de toutes ces images/);
  assert.match(html, /Pas d’excès\. Simplement la justesse des détails\./);
  // Retour n°4, 19/08. Les deux portraits sont la seule référence NOMINATIVE
  // du site : un prénom écrit sous un visage. Ils portaient Jérémy en Rose et
  // Alex en Lilas, soit l'inverse de ce que montrent l'accueil, /shop et les
  // fiches. Chacun porte désormais son coloris, et cette page ne peut plus
  // dériver sans casser ce test.
  assert.match(html, /editorial-lilas-chair\.webp/); // Jérémy — Lilas Céleste
  assert.match(html, /hero-pourpre-model\.webp/); // Alex — Pourpre Impérial
  assert.doesNotMatch(html, /story-jeremy-retouched\.jpeg/);
  assert.doesNotMatch(html, /product-lilas-model\.webp/);
  assert.match(html, /campaign-duo-pourpre\.webp/);
  assert.match(html, /product-pourpre-detail\.webp/);
  assert.match(html, />Accueil</);
  assert.match(
    html,
    /href="\/notre-histoire"[^>]*aria-current="page"[^>]*>Notre histoire</,
  );
  assert.doesNotMatch(html, /Le premier chapitre/);
  /* L'interdit « pas de fiche technique dans le recit » est tombe avec la
     section Le Laurier (reprise du recit, 19-20/08) : la matiere y est
     presentee en composition — 94 MODAL · 6 ELASTHANNE — et cette section
     fait partie du design courant, verifie par captures le 21/08. */
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

  /* LE NUMERO DE TVA EST PUBLIE, sur instruction explicite d'Adam du
     22/08/2026. La cle de controle le confirme : (12 + 3 x (944996487 mod 97))
     mod 97 = 58, donc FR58944996487 est bien LE numero de ce SIREN. */
  assert.match(html, /FR\s?58\s?944\s?996\s?487/);

  /* MAIS L'ETIQUETTE DU PRIX NE SUIT PAS. Publier le numero ne tranche pas le
     regime : l'API officielle renvoie encore « tva: null », ce qui est le
     comportement d'une franchise en base. Le montant affiche est le meme sous
     les deux regimes, seule sa mention change. Tant que Jeremy n'a pas
     repondu, aucune des deux n'est affirmee — c'est la seule position vraie
     dans les deux cas, et ce test empeche de la trancher par inadvertance. */
  assert.doesNotMatch(html, /\bTTC\b/);
  assert.doesNotMatch(html, /293\s?B/);

  /* AUCUN TEXTE D'ATTENTE NE RESTE VISIBLE. Adam confirme le 22/08 qu'aucune
     ligne telephonique n'est ouverte. La ligne « Telephone » est donc omise
     plutot que remplie d'un « a completer » : le placeholder ne satisfaisait
     pas la LCEN et signalait en plus une marque non prete. Le manque est
     porte par PRELAUNCH_BLOCKERS, pas par la page publique. */
  assert.doesNotMatch(html, /À compléter/);

  /* Attention au faux positif : l'hebergeur AFFICHE un telephone, celui de
     Cloudflare France. Interdire la chaine « Telephone » ferait echouer le
     test pour la mauvaise raison. Ce qui doit etre vrai, c'est qu'il n'en
     reste QU'UN sur la page, et que c'est celui de l'hebergeur. */
  const lignesTelephone = html.match(/<dt[^>]*>Téléphone<\/dt>/g) ?? [];
  assert.equal(
    lignesTelephone.length,
    1,
    "seul l’hébergeur doit porter un téléphone tant que l’éditeur n’en a pas",
  );
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
  assert.match(html, /accéder au formulaire de rétractation/);
  assert.match(html, /accusé de réception/i);
  assert.match(html, /n’est pas exclu du seul fait que le produit est un sous-vêtement/i);
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

test("privacy and cookies describe the actual preview storage and no fictitious tracker", async () => {
  const privacyResponse = await render("/privacy");
  const privacyHtml = await privacyResponse.text();
  assert.match(privacyHtml, /prévisualisation ne permet pas encore/i);
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
  assert.match(cookiesHtml, /aucun outil publicitaire/i);
  assert.match(cookiesHtml, /tout accepter/i);
  assert.match(cookiesHtml, /tout refuser/i);
  assert.match(cookiesHtml, /six mois/i);
  assert.doesNotMatch(cookiesHtml, /Google Analytics|Meta Pixel|TikTok Pixel/i);
});

test("withdrawal route is visible but cannot fake a live order workflow", async () => {
  const response = await render("/withdrawal");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Aucune commande réelle ne peut avoir été conclue/i);
  assert.match(html, /accusé horodaté/i);
  assert.match(html, /accessible sans connexion et sans frais/i);
  assert.match(html, /contact@ajluxurystore\.com/);
});

test("cart renders a secure loading state and ignores legacy URL variants", async () => {
  const response = await render(
    "/cart?variant=variant_boxer_rose-pale_xl",
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /prix et stocks simulés, non commerciaux/i);
  assert.match(html, /Chargement du panier/i);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /Rose Velours|Taille[\s\S]*XL|29,99/);
  assert.doesNotMatch(html, /href="\/checkout|cart\?variant/);
});

test("checkout uses the cookie-backed cart and ignores legacy URL variants", async () => {
  const checkout = await render(
    "/checkout?variant=variant_boxer_rose-pale_xl",
  );
  const checkoutHtml = await checkout.text();
  assert.match(checkoutHtml, /Préproduction privée/i);
  assert.match(checkoutHtml, /Chargement du panier/i);
  assert.match(checkoutHtml, /aria-busy="true"/);
  assert.doesNotMatch(checkoutHtml, /Rose Velours|29,99|cart\?variant/);
});

const commerceCases = [
  ["/cart", /prix et stocks simulés, non commerciaux/i],
  ["/checkout", /aucun débit, e-mail ou transporteur réel/i],
  ["/account", /espace client privé de préproduction[^<]*aucune commande réelle/i],
];

for (const [pathname, marker] of commerceCases) {
  test(`server-renders the simulated commerce route ${pathname}`, async () => {
    const response = await render(pathname);
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.headers.get("cache-control") ?? "", /s-maxage/i);
    assert.equal(response.headers.get("x-aj-edge-cache"), null);
    const html = await response.text();
    assert.match(html, marker);
    assert.doesNotMatch(html, /sk_live_|pk_live_|password=/i);
  });
}
