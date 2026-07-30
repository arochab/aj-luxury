import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    `${process.pid}-${Date.now()}-${Math.random()}`,
  );
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the real AJ Luxury launch homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="fr">/i);
  assert.match(html, /<title>AJ Luxury \| Reveal Your Inner Beauty<\/title>/i);
  assert.match(html, /Apollon/);
  assert.match(html, /Pourpre Impérial/);
  assert.match(html, /Rose Velours/);
  assert.match(html, /Lilas Céleste/);
  assert.match(html, /data-hero-fusion="v4"/);
  assert.match(html, /data-hero-version="fusion-v4"/);
  assert.match(html, /images\/client\/hero-duo-static\.webp/);
  assert.match(html, /Figer le métal/);
  assert.match(html, />Notre histoire</);
  assert.doesNotMatch(html, /94\s*%\s*modal/i);
  assert.doesNotMatch(html, /6\s*%\s*élasthanne/i);
  assert.doesNotMatch(html, /Un modèle décliné en trois coloris/i);
  assert.doesNotMatch(html, /videos\/aj-luxury-hero/i);
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
    assert.match(html, /Tailles et disponibilité/);
    assert.match(html, /Agrandir la vue 1/);
    assert.match(html, /Disponible/);
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
  assert.match(html, /Jérémy &amp; Alex/);
  assert.match(html, /Pas d’excès\. Simplement la justesse des détails\./);
  assert.match(html, /campaign-duo-lilas-seated\.webp/);
  assert.match(html, /editorial-rose-jeremy\.webp/);
  assert.match(html, /product-rose-model\.webp/);
  assert.match(html, /product-pourpre-detail\.webp/);
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
  ["/shipping-returns", /Livraison et retours/],
  ["/privacy", /Confidentialité/],
  ["/terms", /Conditions générales/],
  ["/contact", /Nous contacter/],
  ["/legal-notice", /Mentions légales/],
  ["/cookies", /Cookies/],
];

for (const [pathname, marker] of informationCases) {
  test(`server-renders the information route ${pathname}`, async () => {
    const response = await render(pathname);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, marker);
    assert.match(html, /Contenu à valider avant mise en ligne/);
  });
}

test("legal notice exposes the required pre-launch checklist without invented company data", async () => {
  const response = await render("/legal-notice");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Éditeur du site/);
  assert.match(html, /Adresse officielle de domiciliation/);
  assert.match(html, /SIREN, SIRET et RCS\/RNE/);
  assert.match(html, /Direction de la publication/);
  assert.match(html, /Cloudflare, Inc\./);
  assert.match(html, /contact@ajluxurystore\.com/);
  assert.match(html, /Numéro de contact de l’entreprise/);
  assert.match(html, /à confirmer/i);
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
    const html = await response.text();
    assert.match(html, marker);
    assert.doesNotMatch(html, /sk_live_|pk_live_|password=/i);
  });
}
