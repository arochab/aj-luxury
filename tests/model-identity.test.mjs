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

const [produits, sequence, accueil, moodboard, recit, boutique, fiche] =
  await Promise.all([
    lire("../lib/products.ts"),
    lire("../app/components/ApollonGuidedSequence.tsx"),
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

test("la carte d'un coloris est le plan de tête de sa fiche", () => {
  // C'est ce qui faisait changer de mannequin au clic sur le Lilas : carte
  // Jérémy, fiche Alex.
  for (const bloc of blocsProduits()) {
    const carte = bloc.match(/\n\s*image:\s*"([^"]+)"/)?.[1];
    const tete = bloc.match(/gallery:\s*\[\s*\{\s*src:\s*"([^"]+)"/)?.[1];
    assert.equal(tete, carte, `plan de tête différent de la carte : ${carte}`);
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

test("la séquence guidée de l'accueil alterne", () => {
  const suite = personnes(sequence);
  assert.deepEqual(
    suite.map((entree) => entree.qui),
    ["alex", "jeremy", "alex"],
  );
  exigerAlternance(suite, "séquence guidée");
});

test("la grille de coloris et les cartes de /shop alternent", () => {
  // Les deux lisent la même source, dans le même ordre : rose, lilas, pourpre.
  assert.match(
    accueil,
    /ORDRE_COLORIS = \["rose-pale", "lilas-bleu-clair", "pourpre"\]/,
  );
  assert.match(accueil, /src=\{item\.image\}/);
  assert.match(boutique, /src=\{[a-zA-Z]+\.image\}/);

  const suite = ["rose-pale", "lilas-bleu-clair", "pourpre"].map((slug) => {
    const bloc = blocsProduits().find((part) => part.startsWith(`${slug}"`));
    const src = bloc.match(/\n\s*image:\s*"([^"]+)"/)[1];
    return { src, qui: porteur(src) };
  });
  assert.deepEqual(
    suite.map((entree) => entree.qui),
    ["alex", "jeremy", "alex"],
  );
  exigerAlternance(suite, "cartes de coloris");
});

test("la bande éditoriale de l'accueil alterne", () => {
  exigerAlternance(personnes(moodboard), "bande éditoriale");
});

test("/notre-histoire alterne, et nomme chacun dans SON coloris", () => {
  exigerAlternance(personnes(recit), "notre-histoire");

  // La seule page qui écrit un prénom sous un visage : elle doit dire la même
  // chose que les cartes et les fiches, sinon c'est elle qu'on croit.
  assert.match(
    recit,
    /alt="AJ Luxury — Jérémy — Apollon Lilas Céleste"[\s\S]{0,320}editorial-lilas-chair\.webp/,
  );
  assert.match(
    recit,
    /alt="AJ Luxury — Alex — Apollon Pourpre Impérial"[\s\S]{0,320}hero-pourpre-model\.webp/,
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
  for (const source of [catalogue, boutique, fiche, recit]) {
    for (const bannie of bannies) {
      assert.ok(
        !source.includes(bannie),
        `${bannie} reste lue par le tunnel commercial`,
      );
    }
  }
});
