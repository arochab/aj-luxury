import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [home, story, moodboard, products, gallery] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/notre-histoire/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/editorial-moodboard.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/products.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/components/ProductGalleryZoom.tsx", import.meta.url), "utf8"),
]);

test("the homepage keeps Alex left and Jérémy right with verified assets", () => {
  const alexIndex = home.indexOf("/images/client/editorial-rose-profile.webp");
  const jeremyIndex = home.indexOf("/images/client/editorial-pourpre-chair.webp");

  assert.ok(alexIndex >= 0, "Alex's verified Rose profile must be present");
  assert.ok(jeremyIndex > alexIndex, "Jérémy's verified Pourpre portrait must be on the right");
  assert.match(home, /Alex portant Apollon Rose Velours, de profil/);
  assert.match(home, /Jérémy portant Apollon Pourpre Impérial, assis/);
});

test("story and moodboard identities match the photographed founders", () => {
  assert.match(
    story,
    /product-rose-model\.webp"[\s\S]*alt="Alex portant Apollon Rose Velours/,
  );
  assert.match(
    moodboard,
    /editorial-pourpre-chair\.webp"[\s\S]*alt: "Jérémy portant Apollon Pourpre Impérial/,
  );
  assert.match(
    moodboard,
    /editorial-rose-profile\.webp"[\s\S]*alt: "Alex portant Apollon Rose Velours/,
  );
});

test("the requested extra Pourpre view is Jérémy", () => {
  assert.match(products, /gallery:[\s\S]*editorial-pourpre-chair\.webp/);
  assert.match(gallery, /image\.includes\("editorial-pourpre-chair"\)[\s\S]*Jérémy portant/);
  assert.doesNotMatch(products, /gallery:[\s\S]*hero-pourpre-model\.webp/);
});
