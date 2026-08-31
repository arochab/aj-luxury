import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* ==========================================================================
   PARITÉ ET ALTERNANCE — retour n°4 d'Adam, 19/08
   --------------------------------------------------------------------------
   « Jamais deux photos du même mannequin à la suite, nulle part », et un
   coloris porté par le même homme partout.

   Ce fichier remplace une version qui épinglait des noms de fichiers un par
   un, et qui a laissé passer la séquence Jérémy / Jérémy / Alex sur l'accueil
   ET sur /shop : elle vérifiait que telle image portait tel alt, jamais que
   la SUITE des images tenait. Le contrat est donc reconstruit à l'envers —
   on reconstitue la séquence de chaque route dans l'ordre du document, on la
   traduit en prénoms via la table d'attribution de lib/products, et on refuse
   toute répétition immédiate.

   L'attribution vient de `wearerByAsset`, renseignée à l'inspection des
   images. Un nom de fichier ne prouve rien ici : `product-rose-profile.webp`
   montre Jérémy, `product-card-rose.webp` montre Alex.
   ========================================================================== */

const lire = (chemin) => readFile(new URL(chemin, import.meta.url), "utf8");

const [produits, sequence, railAccueil, accueil, recit, boutique, fiche] =
  await Promise.all([
    lire("../lib/products.ts"),
    lire("../app/components/ApollonGuidedSequence.tsx"),
    lire("../app/components/HomeHorizontalChromaticRail.tsx"),
    lire("../app/page.tsx"),
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

/* ── 1 · Un coloris, un homme ─────────────────────────────────────────── */

test("chaque coloris déclare le porteur visible sur sa photo principale", () => {
  const blocs = blocsProduits();
  assert.equal(blocs.length, 3, "trois coloris attendus");

  const attendu = {
    "rose-pale": "jeremy",
    "lilas-bleu-clair": "alex",
    pourpre: "alex",
  };

  for (const bloc of blocs) {
    const slug = bloc.match(/^([a-z-]+)"/)?.[1];
    assert.ok(slug in attendu, `slug inconnu : ${slug}`);
    const declare = bloc.match(/wearer:\s*"(alex|jeremy)"/)?.[1];
    assert.equal(declare, attendu[slug], `porteur déclaré de ${slug}`);

    const principale = bloc.match(/\n\s*image:\s*"([^"]+)"/)?.[1];
    assert.ok(principale, `photo principale absente : ${slug}`);
    assert.equal(
      porteur(principale),
      declare,
      `${slug} : ${principale} ne montre pas ${declare}`,
    );
  }
});

test("la carte d'un coloris est le plan de tête de sa fiche", () => {
  // C'est ce qui faisait changer de mannequin au clic sur le Lilas : carte
  // Jérémy, fiche Alex.
  for (const bloc of blocsProduits()) {
    const carte = bloc.match(/\n\s*image:\s*"([^"]+)"/)?.[1];
    const tete = bloc.match(/gallery:\s*\[\s*\{\s*src:\s*"([^"]+)"/)?.[1];
    assert.equal(tete, carte, `plan de tête différent de la carte : ${carte}`);
  }
});

test("les recommandations de bas de fiche reprennent les cartes du live", () => {
  assert.match(fiche, /src=\{item\.image\}/);
  assert.doesNotMatch(fiche, /src=\{item\.still\}/);
  assert.doesNotMatch(fiche, /editorial\/isabelle-apollon/);
});

/* ── 2 · Jamais deux fois le même homme à la suite ────────────────────── */

test("la séquence guidée de l'accueil conserve les identités validées", () => {
  const suite = personnes(sequence);
  assert.deepEqual(
    suite.map((entree) => entree.qui),
    ["jeremy", "alex", "alex"],
  );

  // Lilas puis Pourpre montrent bien Alex, mais une nature morte sépare leurs
  // portraits dans le document : il n'y a jamais deux corps adjacents.
  let precedent = null;
  for (const src of medias(sequence)) {
    const qui = porteur(src);
    if (qui === null) {
      precedent = null;
      continue;
    }
    if (precedent !== null && precedent !== "duo" && qui !== "duo") {
      assert.notEqual(qui, precedent, `séquence guidée : deux portraits adjacents montrent ${qui}`);
    }
    precedent = qui;
  }
});

test("les cartes de /shop alternent", () => {
  /* Le live présente les trois cartes dans cet ordre. Les deux actifs
     principaux imposés par la production (Rose profil et Lilas modèle) sont
     conservés, tout en maintenant Alex / Jérémy / Alex dans la grille. */
  assert.match(
    boutique,
    /PRODUCTION_ORDER = \["pourpre", "rose-pale", "lilas-bleu-clair"\]/,
  );
  assert.match(boutique, /src=\{product\.image\}/);

  const suite = ["pourpre", "rose-pale", "lilas-bleu-clair"].map((slug) => {
    const bloc = blocsProduits().find((part) => part.startsWith(`${slug}"`));
    const src = bloc.match(/\n\s*image:\s*"([^"]+)"/)[1];
    return { src, qui: porteur(src) };
  });
  assert.deepEqual(
    suite.map((entree) => entree.qui),
    ["alex", "jeremy", "alex"],
  );
  exigerAlternance(suite, "cartes de /shop");
});

test("les neuf images portées de l'accueil composé alternent sans rupture", () => {
  // Le rail est un composant importé avant les deux séquences restées dans
  // app/page.tsx. Les sources sont donc concaténées dans l'ordre réellement
  // rencontré au scroll, au lieu de sous-compter les médias du composant.
  const suite = personnes(`${railAccueil}\n${accueil}`);
  assert.deepEqual(
    suite.map((entree) => entree.qui),
    ["alex", "alex", "jeremy", "alex", "jeremy", "alex", "jeremy", "duo", "alex"],
  );

  /* Dans le rail chromatique, chaque portrait est séparé du suivant par une
     nature morte produit. Pourpre et Lilas peuvent donc montrer Alex sans
     créer deux portraits humains adjacents à l'écran. */
  let precedent = null;
  for (const src of medias(`${railAccueil}\n${accueil}`)) {
    const qui = porteur(src);
    if (qui === null) {
      precedent = null;
      continue;
    }
    if (precedent !== null && precedent !== "duo" && qui !== "duo") {
      assert.notEqual(qui, precedent, `accueil live : deux portraits adjacents montrent ${qui}`);
    }
    precedent = qui;
  }
});

test("/notre-histoire alterne et nomme chaque portrait", () => {
  exigerAlternance(personnes(recit), "notre-histoire");

  // La seule page qui écrit un prénom sous chaque visage doit conserver
  // l'identité visible dans les deux photographies du live.
  assert.match(
    recit,
    /alt="AJ Luxury — Alex — collection Apollon"[\s\S]{0,180}product-lilas-model\.webp/,
  );
  assert.match(
    recit,
    /alt="AJ Luxury — Jérémy — collection Apollon"[\s\S]{0,180}story-jeremy-retouched\.jpeg/,
  );
});

/* ── 3 · Les photos qui contredisent l'attribution sortent du tunnel ──── */

test("le commerce conserve exactement les trois photos principales du live", () => {
  const attendues = new Map([
    ["pourpre", "/images/client/raw/product-card-pourpre.webp"],
    ["rose-pale", "/images/client/raw/product-rose-profile.webp"],
    ["lilas-bleu-clair", "/images/client/raw/product-lilas-model.webp"],
  ]);

  for (const [slug, src] of attendues) {
    const bloc = blocsProduits().find((part) => part.startsWith(`${slug}"`));
    assert.ok(bloc, `fiche absente : ${slug}`);
    assert.equal(
      bloc.match(/\n\s*image:\s*"([^"]+)"/)?.[1],
      src,
      `photo principale de ${slug}`,
    );
    assert.equal(
      bloc.match(/gallery:\s*\[\s*\{\s*src:\s*"([^"]+)"/)?.[1],
      src,
      `première galerie de ${slug}`,
    );
  }

  assert.match(boutique, /PRODUCTION_IMAGES/);
  assert.match(fiche, /product\.gallery/);
});
