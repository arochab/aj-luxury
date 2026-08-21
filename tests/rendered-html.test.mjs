import assert from "node:assert/strict";
import test from "node:test";

function schemaRows(type, tableByName) {
  return Object.entries(tableByName).map(([name, table_name]) => ({
    type,
    name,
    table_name,
  }));
}

const governedSchemaRows = [
  ...schemaRows("table", {
    preprod_demo_dataset: "preprod_demo_dataset",
    shipping_quote_parcel_snapshots: "shipping_quote_parcel_snapshots",
    delivery_option_snapshots: "delivery_option_snapshots",
    delivery_service_point_snapshots: "delivery_service_point_snapshots",
    shipping_document_metadata: "shipping_document_metadata",
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
  }),
  ...schemaRows("trigger", {
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
  /* ── LE CONTRAT DU HERO v7 ────────────────────────────────────────────
     Le premier ecran n'est plus une video mais une photographie vivante en
     deux calques. Le contrat v6 verrouillait la mecanique de la video —
     autoPlay, loop, poster, backdrop, stage, reflet metallique — et decrivait
     donc un produit qui n'existe plus. Il est REECRIT sur ce que la v7 promet,
     et ce qu'elle promet est plus fort : le geste de la maison est verifiable
     dans le HTML rendu, pas seulement a l'oeil. */
  assert.match(html, /data-hero-version="v7"/);
  assert.doesNotMatch(html, /hero-v6-|data-hero-version="video-v6"/);

  /* LES DEUX CALQUES. C'est l'invariant central : sans le calque `figures`,
     le mot-marque cesse de passer DERRIERE les corps et le hero perd sa seule
     idee. Les deux <picture> doivent etre presents, et le mot entre les deux
     dans l'ordre du document. */
  const plate = html.indexOf("hero-v7-paysage-plate");
  const marque = html.indexOf('id="aj-hero-marque"');
  const figures = html.indexOf("hero-v7-paysage-figures");
  assert.ok(
    plate > -1 && marque > plate && figures > marque,
    "l'ordre du hero doit rester fond -> mot-marque -> corps decoupes",
  );

  /* Les quatre actifs, chacun dans les deux formats, et le master portrait
     derriere sa requete media — un telephone ne doit jamais telecharger le
     master paysage. */
  for (const actif of [
    "hero-v7-paysage-plate",
    "hero-v7-paysage-figures",
    "hero-v7-portrait-plate",
    "hero-v7-portrait-figures",
  ]) {
    assert.ok(html.includes(`${actif}.avif?v=v7`), `${actif}.avif manquant`);
    assert.ok(html.includes(`${actif}.webp?v=v7`), `${actif}.webp manquant`);
  }
  assert.match(
    html,
    /media="\(max-aspect-ratio: 4 \/ 5\)"[^>]*srcSet="[^"]*hero-v7-portrait-plate\.avif/,
  );

  /* L'ordre des <source> suit le poids MESURE et non le format : sur la
     decoupe paysage, WebP bat AVIF (79 Ko contre 120). Se tromper d'ordre
     coute le surpoids a chaque visite, silencieusement. */
  const figuresPaysage = html.slice(figures - 400, figures + 400);
  assert.ok(
    figuresPaysage.indexOf("hero-v7-paysage-figures.webp") <
      figuresPaysage.indexOf("hero-v7-paysage-figures.avif"),
    "la decoupe paysage doit proposer WebP avant AVIF : il est plus leger",
  );

  /* Le fond est le LCP et se declare comme tel ; la decoupe ne doit PAS
     concourir avec lui. */
  assert.match(
    html,
    /hero-v7-paysage-plate\.webp\?v=v7"[^>]*decoding="sync"[^>]*fetchPriority="high"/,
  );

  /* La decoupe est strictement decorative : elle redecoupe les memes pixels
     que le fond, qui porte deja la description de la scene. Un second texte
     alternatif creerait une deuxieme description de la meme photographie. */
  assert.match(
    html,
    /hero-v7-paysage-figures\.webp\?v=v7" alt=""/,
  );

  /* Le mot-marque EST le h1 : le nom de la maison, une fois, a sa place. */
  assert.match(
    html,
    /<h1 class="[^"]*" id="aj-hero-marque"><span class="aj-metal [^"]*">AJ Luxury<\/span><\/h1>/,
  );

  /* La couleur est posee au premier paint par une vignette en data URI :
     aucune requete, aucun decalage de mise en page. */
  assert.match(html, /--aj-hero-lqip:url\(&quot;data:image\/webp;base64,/);

  /* Plus une seule video sur l'accueil, donc plus de bouton pour la figer,
     et plus aucun champ metallique a monter. */
  assert.doesNotMatch(html, /<video/);
  assert.doesNotMatch(html, /Figer le métal/);
  assert.doesNotMatch(html, /aj-film__hero-|aj-film__living-duo|aj-film__liquid-overlay/);
  assert.equal((html.match(/data-metallic-mounted="false"/g) ?? []).length, 0);
  assert.doesNotMatch(html, /class="metallic-field__canvas"/);
  assert.doesNotMatch(html, /hero-identity-overlay-/);
  assert.doesNotMatch(html, /images\/client\/hero-duo-(?:static|cutout)/);

  assert.match(html, /href="\/"[^>]*aria-current="page"[^>]*>Accueil</);
  assert.match(html, />Notre histoire</);
  assert.match(html, /href="\/shop"[^>]*>Découvrir la collection</);
  assert.match(html, /94\s*%[\s\S]*modal/i);
  assert.match(html, /6\s*%[\s\S]*élasthanne/i);
  assert.match(
    html,
    /apollon-rose-lyre-v1\.webp[\s\S]*apollon-lilas-lyre-v1\.webp[\s\S]*apollon-pourpre-lyre-v1\.webp/,
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
    assert.match(html, /Prix fictif, non commercial/);
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

test("legal notice exposes the required pre-launch checklist without invented company data", async () => {
  const response = await render("/legal-notice");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Éditeur du site/);
  assert.match(html, /adresse du siège ou de domiciliation/);
  assert.match(html, /SIREN, SIRET et mention RCS\/RNE/);
  assert.match(html, /Direction de la publication/);
  assert.match(html, /Cloudflare, Inc\./);
  assert.match(html, /\+33 1 73 01 52 44/);
  assert.match(html, /contact@ajluxurystore\.com/);
  assert.match(html, /À compléter avant l’ouverture des ventes/);
  assert.match(html, /à compléter/i);
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
