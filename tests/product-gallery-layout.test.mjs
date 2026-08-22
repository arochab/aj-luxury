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
const globalStyles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
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

test("paired portrait media share one 2:3 frame", () => {
  assert.match(css, /\.galleryPortrait\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/s);
  assert.doesNotMatch(css, /galleryPortraitWide/);
});

test("landscape details retain a 3:2 frame on mobile", () => {
  assert.match(
    css,
    /\.galleryItem\.galleryLandscape\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/s,
  );
});

test("secondary media reflows from paired tablet rows to one mobile column", () => {
  assert.match(
    css,
    /\.gallerySecondary\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
  );
  assert.match(
    css,
    /@media \(max-width:\s*560px\)[\s\S]*?\.gallerySecondary\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );
});

/* Retour client du 18/08 : « il y a encore des moments où c'est cropped sur
   les images des mannequins ». Ce test épinglait justement les deux ratios
   fautifs du grand plan produit — 1/1 en large, 4/5 en petit — pour des
   sources 1731x2600. `cover` n'y montrait que 67 % puis 83 % de la hauteur :
   tête coupée et bas du boxer tranché sur l'image principale de la fiche.
   Le contrat n'est plus « un ratio stable » mais « le ratio de la source »,
   seul cadrage qui garantisse tête, ceinture, logo AJ et boxer entiers. */
test("the lead media keeps the source ratio at every breakpoint", () => {
  assert.match(css, /\.galleryMain\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/s);
  assert.match(
    css,
    /@media \(max-width:\s*900px\)[\s\S]*?\.galleryMain\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/s,
  );
});

test("gallery layout is driven by product media metadata, not filenames", () => {
  assert.match(products, /frame:\s*"main"/);
  assert.match(products, /frame:\s*"portrait"/);
  assert.match(products, /frame:\s*"landscape"/);
  assert.doesNotMatch(gallery, /product-rose-(?:front|detail)/);
});

test("recommendations exclude the product currently viewed", () => {
  assert.match(
    productPage,
    /products\.filter\(\(item\) => item\.slug !== product\.slug\)/,
  );
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

test("the size guide restores focus after every close path", () => {
  assert.match(purchase, /const restoreSizeGuideFocus = useRef\(false\)/);
  assert.match(
    purchase,
    /if \(sizeGuideOpen \|\| !restoreSizeGuideFocus\.current\) return;[\s\S]*sizeGuideTrigger\.current\?\.focus\(\{ preventScroll: true \}\)/,
  );
  assert.match(
    purchase,
    /function closeSizeGuide\(\) \{[\s\S]*restoreSizeGuideFocus\.current = true;[\s\S]*setSizeGuideOpen\(false\)/,
  );
  assert.doesNotMatch(purchase, /requestAnimationFrame\([\s\S]*trigger\?\.focus/);
});

test("the mobile story removes the empty definition visual spacer", () => {
  assert.match(
    storyStyles,
    /@media \(max-width: 760px\)[\s\S]*?\.definitionVisual\s*\{[^}]*display:\s*none;/s,
  );
});
