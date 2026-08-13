import assert from "node:assert/strict";
import test from "node:test";

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

test("preproduction health is ready only on migration 0006 and exposes stock states, not quantities", async () => {
  const statements = [];
  const database = {
    prepare(query) {
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          return query.includes("d1_migrations")
            ? { name: "0006_allow_bounded_expired_cart_purge.sql" }
            : null;
        },
        async all() {
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
      DB: database,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ready");
  assert.equal(
    payload.latestMigration,
    "0006_allow_bounded_expired_cart_purge.sql",
  );
  assert.deepEqual(payload.stockProjection, [
    { variantId: "variant_available", state: "available" },
    { variantId: "variant_low", state: "low-stock" },
    { variantId: "variant_sold", state: "sold-out" },
  ]);
  assert.equal(JSON.stringify(payload).includes("available_to_sell"), false);
  assert.equal(statements.length, 2);
});

test("preproduction health stays unavailable on an incomplete migration chain", async () => {
  const database = {
    prepare(query) {
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          return query.includes("d1_migrations")
            ? { name: "0004_email_outbox_data_rights.sql" }
            : null;
        },
        async all() {
          return { results: [] };
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
  assert.equal((await response.json()).status, "unavailable");
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
      /aj-luxury-html-2026-08-10-hero-v4/,
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
  assert.match(html, /data-hero-version="video-v4"/);
  assert.match(html, /\/media\/images\/client\/hero-v4-/);
  assert.match(html, /class="aj-film__hero-video"/);
  assert.match(html, /class="aj-film__hero-backdrop"/);
  assert.match(html, /class="aj-film__hero-stage"/);
  assert.match(html, /class="aj-film__hero-poster"/);
  assert.match(html, /hero-v4-portrait-720x934-poster\.webp\?v=v4/);
  assert.match(html, /hero-v4-portrait-480x623-poster\.webp\?v=v4/);
  assert.doesNotMatch(html, /hero-v4-portrait-720x934-poster\.avif\?v=v4/);
  assert.match(html, /type="image\/avif"/);
  assert.match(html, /hero-v4-tablet-1440x810-poster\.webp\?v=v4/);
  assert.match(html, /hero-v4-tablet-1440x810-poster\.avif\?v=v4/);
  assert.match(html, /hero-v4-desktop-1920x1080-poster\.webp\?v=v4/);
  assert.match(html, /hero-v4-desktop-1920x1080-poster\.avif\?v=v4/);
  assert.match(html, /hero-v4-xl-native-1920x1080-poster\.webp\?v=v4/);
  assert.match(html, /hero-v4-xl-native-1920x1080-poster\.avif\?v=v4/);
  assert.match(
    html,
    /<video[^>]*autoPlay=""[^>]*muted=""[^>]*playsInline=""[^>]*preload="none"/,
  );
  assert.doesNotMatch(html, /<video[^>]*\sloop=""/);
  assert.doesNotMatch(html, /<video[^>]*\ssrc=/);
  assert.doesNotMatch(html, /<video[^>]*\sposter=/);
  assert.doesNotMatch(html, /images\/client\/hero-duo-(?:static|cutout)/);
  assert.equal(
    (html.match(/data-metallic-mounted="false"/g) ?? []).length,
    2,
    "homepage metallic fields must remain unmounted during initial hero render",
  );
  assert.doesNotMatch(html, /class="metallic-field__canvas"/);
  assert.match(html, /Figer le métal/);
  assert.match(html, /href="\/"[^>]*aria-current="page"[^>]*>Accueil</);
  assert.match(html, />Notre histoire</);
  assert.match(html, /href="\/shop"[^>]*>Découvrir la collection</);
  assert.doesNotMatch(html, /94\s*%\s*modal/i);
  assert.doesNotMatch(html, /6\s*%\s*élasthanne/i);
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

const productCases = [
  ["/products/pourpre", "Pourpre Impérial"],
  ["/products/rose-pale", "Rose Velours"],
  ["/products/lilas-bleu-clair", "Lilas Céleste"],
];

for (const [pathname, colorName] of productCases) {
  test(`server-renders ${pathname}`, async () => {
    const response = await render(pathname);
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.match(html, /Apollon/);
    assert.match(html, new RegExp(colorName));
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
    assert.ok(
      (html.match(/data-gallery-media="placeholder"/g) ?? []).length >= 4,
      "every gallery frame keeps a lightweight visual placeholder",
    );
    assert.match(html, /Disponible/);
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
  assert.match(html, /3(?:<!-- -->)? coloris/);
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
  assert.doesNotMatch(html, /\d+[,.]\d{2}\s*(?:€|EUR)/i);
});

test("server-renders the complete AJ Luxury story", async () => {
  const response = await render("/notre-histoire");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Notre histoire/);
  assert.match(html, /Le point de départ/);
  assert.match(html, /Alex &amp; Jérémy/);
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
  assert.doesNotMatch(html, /Le premier chapitre/);
  assert.doesNotMatch(html, /94\s*%\s*modal|6\s*%\s*élasthanne/);
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
  assert.match(privacyHtml, /ne conserve pas le cryptogramme/i);

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

test("cart keeps the selected color and size", async () => {
  const response = await render(
    "/cart?variant=variant_boxer_rose-pale_xl",
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Rose Velours/);
  assert.match(html, /Taille[\s\S]*XL/);
  assert.match(html, /29,99(?:\s|&nbsp;|&#xA0;)*€/);

  const checkout = await render(
    "/checkout?variant=variant_boxer_rose-pale_xl",
  );
  const checkoutHtml = await checkout.text();
  assert.match(checkoutHtml, /Rose Velours/);
  assert.match(checkoutHtml, /29,99(?:\s|&nbsp;|&#xA0;)*€/);
  assert.match(
    checkoutHtml,
    /\/cart\?variant=variant_boxer_rose-pale_xl/,
  );
});

const commerceCases = [
  ["/cart", /aucune commande ne sera enregistrée/i],
  ["/checkout", /aucune commande n’est enregistrée/i],
  ["/account", /authentification non activée/i],
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
