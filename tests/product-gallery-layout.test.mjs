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

test("the lead media uses stable breakpoint ratios", () => {
  assert.match(css, /\.galleryMain\s*\{[^}]*aspect-ratio:\s*1\s*;/s);
  assert.match(
    css,
    /@media \(max-width:\s*900px\)[\s\S]*?\.galleryMain\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*5/s,
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

test("homepage product portraits preserve the full head area", () => {
  assert.match(
    globalStyles,
    /\.aj-product-card__image img\s*\{[^}]*object-position:\s*center top;[^}]*transform-origin:\s*50% 0%;/s,
  );
  assert.doesNotMatch(
    globalStyles,
    /\.aj-product-card__image img\s*\{[^}]*object-position:\s*center 28%;/s,
  );
});
