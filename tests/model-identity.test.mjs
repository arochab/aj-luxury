import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* ===========================================================================
   IDENTITÉ DES MANNEQUINS ET FIDÉLITÉ À LA PRODUCTION
   --------------------------------------------------------------------------
   L'attribution vient de `wearerByAsset`, renseignée après inspection des
   images. Un nom de fichier ne prouve rien : `product-rose-profile.webp`
   montre Jérémy, tandis que `product-card-rose.webp` montre Alex.

   L'accueil conserve sa séquence visuelle validée. La boutique suit en
   revanche l'ordre actuellement publié — Pourpre, Rose, Lilas — même si cet
   ordre n'alterne pas parfaitement les mannequins. Un test ne doit jamais
   forcer une refonte différente du site que le client a approuvé.
   ========================================================================== */

const lire = (chemin) => readFile(new URL(chemin, import.meta.url), "utf8");

const [produits, accueil, moodboard, recit, boutique, fiche] =
  await Promise.all([
    lire("../lib/products.ts"),
    lire("../app/page.tsx"),
    lire("../lib/editorial-moodboard.ts"),
    lire("../app/notre-histoire/page.tsx"),
    lire("../app/shop/page.tsx"),
    lire("../app/products/[slug]/page.tsx"),
  ]);

/** La table d'attribution, relue depuis la source plutôt que recopiée : un
 *  seul endroit peut la changer, et c'est celui que le site lit. */
function tableAttribution(source) {
  const bloc = source.match(
    /wearerByAsset[\s\S]*?Object\.freeze\(\{([\s\S]*?)\n\s*\}\);/,
  )?.[1];
  assert.ok(bloc, "wearerByAsset doit exister dans lib/products.ts");
  const table = new Map();
  for (const [, actif, qui] of bloc.matchAll(
    /"([^"]+)":\s*"(alex|jeremy|duo)"/g,
  )) {
    table.set(actif, qui);
  }
  assert.ok(table.size >= 12, "la table d'attribution doit être renseignée");
  return table;
}

const ATTRIBUTION = tableAttribution(produits);

/** Qui figure sur ce média, ou null s'il n'y a pas de visage. */
function porteur(src) {
  for (const [actif, qui] of ATTRIBUTION) {
    if (src.endsWith(actif)) return qui;
  }
  return null;
}

/** Les chemins d'images d'un fichier source, dans l'ordre du document. */
function medias(source) {
  return [
    ...source.matchAll(/\/images\/[A-Za-z0-9/_.-]+\.(?:webp|jpeg|jpg|png)/g),
  ]
    .map(([chemin]) => chemin)
    .filter((chemin) => !chemin.includes("-placeholder-"));
}

/** La séquence des personnes visibles, dans l'ordre de lecture. */
function personnes(source) {
  return medias(source)
    .map((src) => ({ src, qui: porteur(src) }))
    .filter((entree) => entree.qui !== null);
}

function exigerAlternance(suite, etiquette) {
  for (let i = 1; i < suite.length; i += 1) {
    const avant = suite[i - 1];
    const apres = suite[i];
    // Une image duo n'est jamais une répétition : les deux y sont.
    if (avant.qui === "duo" || apres.qui === "duo") continue;
    assert.notEqual(
      apres.qui,
      avant.qui,
      `${etiquette} : ${avant.src} puis ${apres.src} montrent deux fois ${apres.qui}`,
    );
  }
}

const blocsProduits = () => produits.split(/\n {4}slug: "/).slice(1);

/* Exception volontaire et fermée : le site de production validé emploie le
   même lead sur la carte et en tête de PDP pour chacun des trois coloris.
   Ajouter un quatrième chemin ou remplacer l'un de ces masters doit casser le
   test et repasser par une validation visuelle explicite. */
const LEADS_PRODUCTION_VALIDES = Object.freeze({
  "rose-pale": "/images/client/raw/product-card-rose.webp",
  "lilas-bleu-clair": "/images/client/editorial-lilas-chair.webp",
  pourpre: "/images/client/raw/product-card-pourpre.webp",
});

function ordreProductionAccueil() {
  const bloc = accueil.match(
    /const productionOrder = \[([\s\S]*?)\n\s*\] as const;/,
  )?.[1];
  assert.ok(bloc, "productionOrder doit exister sur l'accueil");

  const ordre = [...bloc.matchAll(
    /\{\s*slug:\s*"([a-z-]+)",[\s\S]*?image:\s*"([^"]+)"[\s\S]*?\}/g,
  )].map(([, slug, src]) => ({ slug, src, qui: porteur(src) }));
  assert.equal(ordre.length, 3, "productionOrder doit contenir trois coloris");
  return ordre;
}

/* ── 1 · Un coloris, un homme ─────────────────────────────────────────── */

test("chaque coloris déclare son porteur et n'en montre aucun autre", () => {
  const blocs = blocsProduits();
  assert.equal(blocs.length, 3, "trois coloris attendus");

  const attendu = {
    "rose-pale": "alex",
    "lilas-bleu-clair": "jeremy",
    pourpre: "alex",
  };

  for (const bloc of blocs) {
    const slug = bloc.match(/^([a-z-]+)"/)?.[1];
    assert.ok(slug in attendu, `slug inconnu : ${slug}`);
    const declare = bloc.match(/wearer:\s*"(alex|jeremy)"/)?.[1];
    assert.equal(declare, attendu[slug], `porteur déclaré de ${slug}`);

    for (const { src, qui } of personnes(bloc)) {
      assert.equal(
        qui,
        declare,
        `${slug} : ${src} montre ${qui}, pas ${declare}`,
      );
    }
  }
});

test("la carte et la tête de fiche répètent uniquement les trois leads de production validés", () => {
  assert.equal(
    blocsProduits().length,
    Object.keys(LEADS_PRODUCTION_VALIDES).length,
    "l'exception carte/lead doit rester strictement limitée aux trois coloris",
  );

  for (const bloc of blocsProduits()) {
    const slug = bloc.match(/^([a-z-]+)"/)?.[1];
    const carte = bloc.match(/\n\s*image:\s*"([^"]+)"/)?.[1];
    const tete = bloc.match(/gallery:\s*\[\s*\{\s*src:\s*"([^"]+)"/)?.[1];
    const leadValide = LEADS_PRODUCTION_VALIDES[slug];

    assert.ok(leadValide, `aucune exception carte/lead autorisée pour ${slug}`);
    assert.equal(carte, leadValide, `carte de production inattendue pour ${slug}`);
    assert.equal(tete, leadValide, `lead PDP de production inattendu pour ${slug}`);
    assert.equal(
      porteur(tete),
      porteur(carte),
      `changement de porteur entre ${carte} et ${tete}`,
    );
  }
});

test("les recommandations de bas de fiche ne portent aucun corps", () => {
  // Deux coloris sur trois reviennent à Alex : une paire de plans portés y
  // serait fatalement deux fois le même homme. Elle montre donc les plateaux.
  assert.match(fiche, /src=\{item\.still\}/);
  assert.doesNotMatch(fiche, /src=\{item\.image\}/);
  for (const teinte of ["rose", "lilas", "pourpre"]) {
    assert.match(
      produits,
      new RegExp(`still:\\s*"[^"]*apollon-${teinte}-lyre-v1\\.webp"`),
    );
  }
});

/* ── 2 · Jamais deux fois le même homme à la suite ────────────────────── */

test("l'ordre de production de l'accueil alterne", () => {
  const suite = ordreProductionAccueil();
  assert.deepEqual(
    suite.map(({ slug, qui }) => ({ slug, qui })),
    [
      { slug: "pourpre", qui: "alex" },
      { slug: "rose-pale", qui: "jeremy" },
      { slug: "lilas-bleu-clair", qui: "alex" },
    ],
  );
  assert.match(accueil, /productionOrder\.flatMap\(\(entry\) =>/);
  assert.match(accueil, /<HomeExperienceV10 colorways=\{colorways\} \/>/);
  exigerAlternance(suite, "ordre de production de l'accueil");
});

test("les trois cartes de /shop suivent l'ordre de production validé", () => {
  assert.match(
    boutique,
    /const PRODUCTION_ORDER = \["pourpre", "rose-pale", "lilas-bleu-clair"\] as const;/,
  );
  assert.match(boutique, /const catalog = getProducts\(\);/);
  assert.match(boutique, /PRODUCTION_ORDER\.flatMap\(\(slug\) =>/);
  assert.match(boutique, /\{products\.map\(\(product,\s*index\) => \(/);
  assert.match(boutique, /src=\{product\.image\}/);
  assert.match(boutique, /className=\{styles\.productGrid\} role="list"/);
  assert.match(boutique, /role="listitem"/);
  assert.match(boutique, /aria-label=\{`\$\{product\.model\} \$\{product\.name\}`\}/);
  assert.match(boutique, /href=\{`\/products\/\$\{product\.slug\}`\}/);

  const parSlug = new Map(blocsProduits().map((bloc) => {
    const slug = bloc.match(/^([a-z-]+)"/)?.[1];
    const src = bloc.match(/\n\s*image:\s*"([^"]+)"/)[1];
    return [slug, { slug, src, qui: porteur(src) }];
  }));
  const suite = ["pourpre", "rose-pale", "lilas-bleu-clair"].map(
    (slug) => parSlug.get(slug),
  );
  assert.deepEqual(
    suite.map(({ slug, qui }) => ({ slug, qui })),
    [
      { slug: "pourpre", qui: "alex" },
      { slug: "rose-pale", qui: "alex" },
      { slug: "lilas-bleu-clair", qui: "jeremy" },
    ],
  );
});

test("la bande éditoriale de l'accueil alterne", () => {
  exigerAlternance(personnes(moodboard), "bande éditoriale");
});

test("/notre-histoire identifie exactement Alex et Jérémy sur les prises validées", () => {
  exigerAlternance(personnes(recit), "notre-histoire");

  assert.match(
    recit,
    /campaign-duo-lilas-seated\.webp"[\s\S]{0,180}alt="AJ Luxury — Jérémy, Alex — Apollon Lilas Céleste"/,
  );
  assert.match(
    recit,
    /product-lilas-model\.webp"[\s\S]{0,180}alt="AJ Luxury — Alex — Apollon Lilas Céleste"[\s\S]{0,180}<figcaption>Alex<\/figcaption>/,
  );
  assert.match(
    recit,
    /story-jeremy-retouched\.jpeg"[\s\S]{0,180}alt="AJ Luxury — Jérémy — Apollon Rose Velours"[\s\S]{0,180}<figcaption>Jérémy<\/figcaption>/,
  );
});

/* ── 3 · Les photos qui contredisent l'attribution sortent du tunnel ──── */

test("aucune photo contredisant l'attribution ne reste dans le commerce", () => {
  const bannies = [
    "product-rose-profile.webp", // Jérémy en Rose
    "product-lilas-model.webp", // Alex en Lilas
    "editorial-pourpre-chair.webp", // Jérémy en Pourpre
    "story-jeremy-retouched.jpeg", // Jérémy en Rose
  ];
  // La bande éditoriale de l'accueil (lib/editorial-moodboard.ts) n'est PAS
  // dans cette liste : c'est une campagne, pas un catalogue — aucun prix,
  // aucun lien, aucun nom de coloris affiché. Elle garde le seul solo de
  // Jérémy que le dépôt possède hors du Lilas. Le jour où une prise « Jérémy
  // seul, Lilas Céleste, second angle » existera, elle pourra y entrer et
  // cette exception tombera.
  // La table `wearerByAsset` cite ces fichiers, et c'est son rôle : elle dit
  // qui figure dessus. On ne regarde donc que le catalogue lui-même.
  // Les commentaires les citent aussi, pour dire pourquoi elles sont sorties.
  const catalogue = produits
    .slice(produits.indexOf("export const products"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  // Notre histoire reste éditoriale : elle peut employer les portraits de la
  // production tant que leurs alt et légendes identifient la bonne personne.
  // Le garde-fou ci-dessous ne vise que le tunnel commercial.
  for (const source of [catalogue, boutique, fiche]) {
    for (const bannie of bannies) {
      assert.ok(
        !source.includes(bannie),
        `${bannie} reste lue par le tunnel commercial`,
      );
    }
  }
});
