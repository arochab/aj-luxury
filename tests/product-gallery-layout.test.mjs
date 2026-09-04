import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(
  new URL("../app/components/ProductPage.module.css", import.meta.url),
  "utf8",
);
const gallery = await readFile(
  new URL("../app/components/ProductGalleryZoom.tsx", import.meta.url),
  "utf8",
);
const products = await readFile(
  new URL("../lib/products.ts", import.meta.url),
  "utf8",
);
const productPage = await readFile(
  new URL("../app/products/[slug]/page.tsx", import.meta.url),
  "utf8",
);
/* globals.css n'est plus lu ici : le seul test qui s'en servait visait
   .aj-product-card, une classe que plus aucun markup ne rend. Il est reporté
   sur Accueil.module.css. */
const purchase = await readFile(
  new URL("../app/components/ProductPurchase.tsx", import.meta.url),
  "utf8",
);
const storyStyles = await readFile(
  new URL("../app/notre-histoire/Story.module.css", import.meta.url),
  "utf8",
);
const accueilStyles = await readFile(
  new URL("../app/components/Accueil.module.css", import.meta.url),
  "utf8",
);
const shopStyles = await readFile(
  new URL("../app/shop/Shop.module.css", import.meta.url),
  "utf8",
);

test("all five media form one coherent 2:3 snap carousel", () => {
  assert.match(css, /\.gallerySecondary\s*\{[^}]*display:\s*contents;/s);
  assert.match(css, /\.gallery\s*\{[^}]*overflow-x:\s*auto;[^}]*scroll-snap-type:\s*x mandatory;/s);
  assert.match(
    css,
    /\.galleryItem,[\s\S]*?\.galleryMain,[\s\S]*?\.galleryPortrait\s*\{[^}]*flex:\s*0 0 min\(88%, 52rem\);[^}]*aspect-ratio:\s*2\s*\/\s*3;[^}]*scroll-snap-align:\s*start;/s,
  );
  assert.doesNotMatch(css, /galleryPortraitWide/);
});

test("landscape details remain fully visible inside the portrait carousel", () => {
  assert.match(
    css,
    /\.galleryLandscape \.zoomTrigger img\s*\{[^}]*object-fit:\s*contain;/s,
  );
});

/* Le live validé emploie un cadre carré sur desktop. Sur mobile, les cinq
   vues forment un seul rail 2:3 cohérent et glissable. Le point de fuite reste
   ancré à 30 % depuis le haut sur la vue principale. */
test("the lead media keeps the live frame at every breakpoint", () => {
  assert.match(css, /\.galleryMain\s*\{[^}]*aspect-ratio:\s*1\s*;/s);
  assert.match(
    css,
    /@media \(max-width:\s*900px\)[\s\S]*?\.galleryItem,[\s\S]*?\.galleryMain,[\s\S]*?\.galleryPortrait\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/s,
  );
  assert.match(
    css,
    /\.galleryMain \.zoomTrigger img\s*\{[^}]*object-position:\s*center 30%/s,
  );
});

test("gallery layout is driven by product media metadata, not filenames", () => {
  assert.match(products, /frame:\s*"main"/);
  assert.match(products, /frame:\s*"portrait"/);
  assert.match(products, /frame:\s*"landscape"/);
  assert.doesNotMatch(gallery, /product-rose-(?:front|detail)/);
});

test("recommendations exclude the product currently viewed", () => {
  assert.match(productPage, /productionOrder\.flatMap/);
  assert.match(productPage, /item\.slug !== product\.slug/);
});

/* CE TEST VISAIT UNE CLASSE MORTE, ET IL ETAIT ROUGE DEPUIS LE 16/08.

   Intention d'origine, qui reste juste : un portrait produit sur l'accueil ne
   doit jamais couper la tete du mannequin. Elle etait verifiee sur
   `.aj-product-card__image img` dans globals.css, avec un ancrage haut
   (`object-position: center top`) et l'interdiction du cadrage a 28 %.

   Deux choses ont change depuis, et aucune n'a ete repercutee ici.

   1. Le commit 81bb776 du 16/08 a fait passer cette regle en
      `object-fit: contain`, rendant `object-position: center top` inutile — il
      l'a donc remis a `center`. La regex exigeait toujours `center top` : le
      test est rouge depuis, sans rapport avec ce qu'il pretend proteger.

   2. La refonte de l'accueil a remplace `.aj-product-card`. Cette classe
      n'est plus rendue par AUCUN markup : elle ne survit que dans globals.css
      et dans ce test. Le test gardait donc du CSS mort.

   Il est reporte sur le contrat vivant, et RENFORCE au passage. `contain`
   n'est pas un ancrage plus fin, c'est une garantie d'une autre nature :
   l'image entiere entre dans le cadre, donc aucun recadrage n'est possible,
   quelle que soit la boite. Interdire `cover` sur ces memes elements ferme la
   seule porte par laquelle une tete pourrait etre coupee.

   Le CSS mort `.aj-product-card*` est laisse au chantier de nettoyage, qui a
   son propre manifeste. */
test("homepage product portraits preserve the full head area", () => {
  assert.match(accueilStyles, /\.prise\s*\{[^}]*object-fit:\s*contain;/s);
  assert.match(accueilStyles, /\.priseVoisine\s*\{[^}]*object-fit:\s*contain;/s);
  assert.doesNotMatch(accueilStyles, /\.prise\s*\{[^}]*object-fit:\s*cover;/s);
  assert.doesNotMatch(
    accueilStyles,
    /\.priseVoisine\s*\{[^}]*object-fit:\s*cover;/s,
  );
});

test("the validated body-waist guide covers only the four sold sizes", () => {
  assert.match(purchase, /S:\s*"67–73 cm"/);
  assert.match(purchase, /M:\s*"74–80 cm"/);
  assert.match(purchase, /L:\s*"81–87 cm"/);
  assert.match(purchase, /XL:\s*"88–97 cm"/);
  assert.doesNotMatch(purchase, /(?:XS|XXL):\s*"/);
  assert.match(purchase, /product\.waistMeasurement/);
  assert.match(purchase, /<table>/);
  assert.match(purchase, /selectedPackSize > 1 && selectedSize/);
  assert.match(purchase, /product\.oneSizeForPack/);
});

test("the mobile story keeps the final visual compact instead of leaving an empty spacer", () => {
  assert.match(
    storyStyles,
    /@media \(max-width: 760px\)[\s\S]*?\.definitionVisual\s*\{[^}]*min-height:\s*min\(120vw, 34rem\);/s,
  );
  assert.doesNotMatch(
    storyStyles,
    /@media \(max-width: 760px\)[\s\S]*?\.definitionVisual\s*\{[^}]*display:\s*none;/s,
  );
});

test("shop cards keep the live desktop and mobile crops", () => {
  assert.match(
    shopStyles,
    /\.productVisual img\s*\{[^}]*object-position:\s*50% 0;/s,
  );
  assert.match(
    shopStyles,
    /@media \(max-width:\s*860px\)[\s\S]*?\.productVisual img\s*\{[^}]*object-position:\s*50% 16%;/s,
  );
  assert.match(
    shopStyles,
    /\.productGrid\s*\{[^}]*gap:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
  );
  assert.match(shopStyles, /\.collection\s*\{[^}]*padding:\s*0;/s);
  assert.match(
    shopStyles,
    /\.productVisual\s*\{[^}]*aspect-ratio:\s*1731\s*\/\s*2600;[^}]*background:\s*transparent;/s,
  );
  assert.match(
    shopStyles,
    /\.productVisual img\s*\{[^}]*object-fit:\s*cover;/s,
  );
});

test("shop mobile cards use their native portrait ratio without grey gutters", () => {
  const mobile = /@media \(max-width:\s*540px\)([\s\S]*)/.exec(shopStyles)?.[1] ?? "";

  assert.match(mobile, /\.introCopy\s*\{[^}]*row-gap:\s*1\.25rem;/s);
  assert.match(mobile, /\.collection\s*\{[^}]*padding:\s*0;/s);
  assert.match(mobile, /\.productGrid\s*\{[^}]*gap:\s*0;/s);
  assert.match(mobile, /\.productCard\s*\{[^}]*border:\s*0;/s);
  assert.match(
    mobile,
    /\.productVisual\s*\{[^}]*aspect-ratio:\s*1731\s*\/\s*2600;/s,
  );
});
