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
const homeStyles = await readFile(
  new URL("../app/components/HomeExperienceV10.module.css", import.meta.url),
  "utf8",
);
const shopStyles = await readFile(
  new URL("../app/shop/Shop.module.css", import.meta.url),
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

/* Le site validé conserve ses cadres carré et 4:5. La protection contre les
   coupes ne dépend donc plus du ratio de la boîte : l'image finale doit être
   en `contain`, après toute ancienne règle `cover`, pour garder visage, corps,
   ceinture et boxer visibles sur chaque format. */
test("product and shop portraits preserve the full model inside their frames", () => {
  const lastCover = css.lastIndexOf("object-fit: cover");
  const finalContain = css.lastIndexOf("object-fit: contain");
  assert.ok(finalContain > lastCover, "la règle contain doit gagner la cascade produit");
  assert.match(
    css,
    /\.galleryMain \.zoomTrigger img,\s*\.zoomTrigger img\s*\{[^}]*object-fit:\s*contain;/s,
  );
  assert.match(
    shopStyles,
    /\.productVisual img\s*\{[^}]*object-fit:\s*contain;/s,
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

/* Le contrat vivant est HomeExperienceV10 : les trois familles de portraits
   hors hero utilisent `contain`, donc aucun visage, corps ou boxer n'est
   sacrifié pour remplir artificiellement son cadre. */
test("homepage product portraits preserve the full head area", () => {
  assert.match(homeStyles, /\.featuredCard img\s*\{[^}]*object-fit:\s*contain;/s);
  assert.match(homeStyles, /\.productImage img\s*\{[^}]*object-fit:\s*contain;/s);
  assert.match(homeStyles, /\.moodboardItem img\s*\{[^}]*object-fit:\s*contain;/s);
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

test("the product page exposes the three stock-backed pack choices clearly", () => {
  for (const [count, price, saving, ratio] of [
    [1, "2_999", "0", "null"],
    [2, "2_500", "999", "0.1666"],
    [3, "2_333", "1_998", "0.2221"],
  ]) {
    assert.match(
      purchase,
      new RegExp(
        `count:\\s*${count},[\\s\\S]{0,220}perItemCents:\\s*${price},[\\s\\S]{0,120}savingCents:\\s*${saving},[\\s\\S]{0,120}savingRatio:\\s*${ratio}`,
      ),
    );
  }
  assert.match(purchase, /\{PACK_OPTIONS\.map\(\(option\) => \(/);
  assert.match(purchase, /aria-pressed=\{selectedPackSize === option\.count\}/);
  assert.match(purchase, /AJ_APOLLON_PACK_PRICE_CENTS\[option\.count\]/);
  assert.match(purchase, /t\("product\.sameColorPack"\)/);
  assert.match(purchase, /t\("product\.mixedColorPack"\)/);
  assert.match(
    css,
    /\.packOptions\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(css, /\.packOption\[aria-pressed="true"\]/);
});

test("the mobile story removes the empty definition visual spacer", () => {
  assert.match(
    storyStyles,
    /@media \(max-width: 760px\)[\s\S]*?\.definitionVisual\s*\{[^}]*display:\s*none;/s,
  );
});
