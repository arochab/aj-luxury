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

test("the homepage follows Jérémy's approved Rose, duo Pourpre and Lilas sequence", () => {
  const alexRoseIndex = home.indexOf("/images/client/product-rose-model.webp");
  const duoPourpreIndex = home.indexOf("/images/client/campaign-duo-pourpre.webp");
  const jeremyLilasIndex = home.indexOf("/images/client/editorial-lilas-chair.webp");

  assert.ok(alexRoseIndex >= 0, "Alex in Rose Velours must be on the left");
  assert.ok(duoPourpreIndex > alexRoseIndex, "the duo in Pourpre must be centered");
  assert.ok(jeremyLilasIndex > duoPourpreIndex, "Jérémy in Lilas must be on the right");
  assert.match(home, /AJ Luxury — Alex — Apollon Rose Velours/);
  assert.match(home, /AJ Luxury — Jérémy et Alex — Apollon Pourpre Impérial/);
  assert.match(home, /AJ Luxury — Jérémy — Apollon Lilas Céleste/);
});

test("story and moodboard identities match the photographed founders", () => {
  assert.match(
    story,
    /product-lilas-model\.webp"[\s\S]*alt="AJ Luxury — Alex — Apollon Lilas Céleste/,
  );
  assert.match(
    story,
    /story-jeremy-retouched\.jpeg"[\s\S]*alt="AJ Luxury — Jérémy — Apollon Rose Velours/,
  );
  assert.match(
    moodboard,
    /editorial-pourpre-chair\.webp"[\s\S]*alt: "AJ Luxury — Jérémy — Apollon Pourpre Impérial/,
  );
  assert.match(
    moodboard,
    /campaign-duo-lilas-seated\.webp"[\s\S]*alt: "AJ Luxury — Alex et Jérémy — Apollon Lilas Céleste/,
  );
  assert.match(
    moodboard,
    /campaign-duo-lilas-seated\.webp"[\s\S]*objectPosition: "50% 22%"/,
  );
  assert.match(
    moodboard,
    /editorial-rose-profile\.webp"[\s\S]*alt: "AJ Luxury — Alex — Apollon Rose Velours/,
  );
});

test("non-product editorial sequences never juxtapose the same color", () => {
  const featuredBlock = home.match(
    /const featuredEditorialImages = \[([\s\S]*?)\n\];/,
  )?.[1];
  const moodboardBlock = moodboard.match(
    /editorialMoodboardImages[^=]*= \[([\s\S]*?)\n\];/,
  )?.[1];
  const storyPortraitBlock = story.match(
    /<div className=\{styles\.portraitGrid\}>([\s\S]*?)<\/div>\s*<\/section>/,
  )?.[1];

  assert.ok(featuredBlock, "the homepage editorial sequence must exist");
  assert.ok(moodboardBlock, "the homepage moodboard sequence must exist");
  assert.ok(storyPortraitBlock, "the story portrait sequence must exist");

  const colorsIn = (source) =>
    [...source.matchAll(/Rose Velours|Pourpre Impérial|Lilas Céleste/g)].map(
      ([color]) => color,
    );

  const featuredSequence = colorsIn(featuredBlock);
  const moodboardSequence = colorsIn(moodboardBlock);
  const storyPortraitSequence = colorsIn(storyPortraitBlock);

  assert.deepEqual(featuredSequence, [
    "Rose Velours",
    "Pourpre Impérial",
    "Lilas Céleste",
  ]);
  assert.deepEqual(moodboardSequence, [
    "Pourpre Impérial",
    "Lilas Céleste",
    "Rose Velours",
  ]);
  assert.deepEqual(storyPortraitSequence, ["Lilas Céleste", "Rose Velours"]);

  for (const sequence of [featuredSequence, moodboardSequence, storyPortraitSequence]) {
    for (let index = 1; index < sequence.length; index += 1) {
      assert.notEqual(sequence[index], sequence[index - 1]);
    }
  }
});

test("the requested extra Pourpre view is Jérémy", () => {
  assert.match(products, /gallery:[\s\S]*editorial-pourpre-chair\.webp/);
  assert.match(gallery, /image\.src\.includes\("editorial-pourpre-chair"\)[\s\S]*Jérémy —/);
  assert.doesNotMatch(products, /gallery:[\s\S]*hero-pourpre-model\.webp/);
});
