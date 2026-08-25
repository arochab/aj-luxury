import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { products } from "../lib/products.ts";

const homeSources = [
  ["app/page.tsx", new URL("../app/page.tsx", import.meta.url)],
  [
    "app/components/HomeExperienceV10.tsx",
    new URL("../app/components/HomeExperienceV10.tsx", import.meta.url),
  ],
  [
    "lib/editorial-moodboard.ts",
    new URL("../lib/editorial-moodboard.ts", import.meta.url),
  ],
];

/* Seules ces trois répétitions carte -> premier média PDP reproduisent le
   commerce de production approuvé. L'allowlist lie le slug, le chemin et les
   deux rôles : elle ne peut donc pas masquer une duplication ajoutée ailleurs. */
const CARD_LEAD_PRODUCTION_VALIDES = new Map([
  ["rose-pale", "/images/client/raw/product-card-rose.webp"],
  ["lilas-bleu-clair", "/images/client/editorial-lilas-chair.webp"],
  ["pourpre", "/images/client/raw/product-card-pourpre.webp"],
]);

const imagePaths = (source) => [
  ...source.matchAll(/\/images\/[A-Za-z0-9/_.-]+\.(?:webp|avif|png|jpe?g)/g),
].map(([path]) => path).filter((path) => !path.includes("-placeholder-"));

async function sha256(path) {
  const file = new URL(`../public${path}`, import.meta.url);
  let metadata;

  try {
    metadata = await stat(file);
  } catch {
    assert.fail(`${path} doit exister sous public/`);
  }

  assert.ok(metadata.isFile(), `${path} doit désigner un fichier réel sous public/`);
  const digest = createHash("sha256").update(await readFile(file)).digest("hex");
  assert.match(digest, /^[a-f0-9]{64}$/, `empreinte SHA-256 invalide pour ${path}`);
  return digest;
}

test("l'accueil ne co-rend ni chemin ni binaire dupliqué", async () => {
  const sources = await Promise.all(
    homeSources.map(async ([source, file]) => ({
      source,
      content: await readFile(file, "utf8"),
    })),
  );
  const assets = sources.flatMap(({ source, content }) =>
    imagePaths(content).map((path) => ({ source, path })),
  );
  assert.ok(assets.length > 0, "l'accueil doit déclarer des médias à contrôler");

  const paths = assets.map(({ path }) => path);
  assert.equal(
    new Set(paths).size,
    paths.length,
    `chemin co-rendu plusieurs fois sur l'accueil : ${paths.join(", ")}`,
  );

  const fingerprints = await Promise.all(
    assets.map(async (asset) => ({ ...asset, hash: await sha256(asset.path) })),
  );
  const byHash = Map.groupBy(fingerprints, ({ hash }) => hash);
  const binaryDuplicates = [...byHash.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([hash, entries]) =>
      `${hash}: ${entries.map(({ source, path }) => `${path} (${source})`).join(", ")}`,
    );

  assert.deepEqual(
    binaryDuplicates,
    [],
    `masters binaires co-rendus sur l'accueil : ${binaryDuplicates.join(" ; ")}`,
  );
});

test("la boutique ne duplique aucun média hors des trois couples carte/lead validés en production", async () => {
  const gallery = products.flatMap((product) => product.gallery.map((media) => media.src));
  const commerceAssignments = products.flatMap((product) => [
    { slug: product.slug, role: "card", path: product.image },
    { slug: product.slug, role: "still", path: product.still },
    ...product.gallery.map((media, index) => ({
      slug: product.slug,
      role: `gallery:${index}`,
      path: media.src,
    })),
  ]);

  assert.equal(new Set(gallery).size, gallery.length, "un master est répété entre deux galeries");
  assert.equal(
    CARD_LEAD_PRODUCTION_VALIDES.size,
    products.length,
    "l'exception carte/lead doit rester limitée aux trois produits de production",
  );

  for (const product of products) {
    const leadValide = CARD_LEAD_PRODUCTION_VALIDES.get(product.slug);
    assert.ok(leadValide, `aucune exception carte/lead autorisée pour ${product.slug}`);
    assert.equal(
      product.image,
      leadValide,
      `carte de production inattendue pour ${product.slug}`,
    );
    assert.equal(
      product.gallery[0]?.src,
      leadValide,
      `lead PDP de production inattendu pour ${product.slug}`,
    );
  }

  const reuses = [...Map.groupBy(commerceAssignments, ({ path }) => path)]
    .filter(([, assignments]) => assignments.length > 1)
    .map(([path, assignments]) => ({
      path,
      roles: assignments
        .map(({ slug, role }) => `${slug}:${role}`)
        .sort(),
    }))
    .sort(({ path: left }, { path: right }) => left.localeCompare(right));
  const reusesAttendues = [...CARD_LEAD_PRODUCTION_VALIDES]
    .map(([slug, path]) => ({
      path,
      roles: [`${slug}:card`, `${slug}:gallery:0`].sort(),
    }))
    .sort(({ path: left }, { path: right }) => left.localeCompare(right));

  assert.deepEqual(
    reuses,
    reusesAttendues,
    "toute autre répétition de chemin reste interdite dans le commerce",
  );

  const shop = await readFile(new URL("../app/shop/page.tsx", import.meta.url), "utf8");
  assert.match(
    shop,
    /const PRODUCTION_ORDER = \["pourpre", "rose-pale", "lilas-bleu-clair"\] as const;/,
  );
  assert.match(shop, /src=\{product\.image\}/);
  assert.doesNotMatch(
    shop,
    /MATIERE_IMAGE|matiereImage|plan matière/i,
    "la boutique fidèle à la production ne doit pas réintroduire le bloc matière de la refonte noire",
  );

  const uniqueCommercePaths = [...new Set(
    commerceAssignments.map(({ path }) => path),
  )];
  const fingerprints = await Promise.all(
    uniqueCommercePaths.map(async (path) => ({ path, hash: await sha256(path) })),
  );
  const binaryDuplicates = [...Map.groupBy(fingerprints, ({ hash }) => hash)]
    .filter(([, entries]) => entries.length > 1)
    .map(([, entries]) => entries.map(({ path }) => path));
  assert.deepEqual(
    binaryDuplicates,
    [],
    `un même fichier binaire est rendu sous plusieurs noms : ${binaryDuplicates.flat().join(", ")}`,
  );
});
