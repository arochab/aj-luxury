import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [home, sequence, story, moodboard, products, gallery] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/ApollonGuidedSequence.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/notre-histoire/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/editorial-moodboard.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/products.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/components/ProductGalleryZoom.tsx", import.meta.url), "utf8"),
]);

test("the guided homepage keeps all three approved photographed colorways", () => {
  const roseIndex = sequence.indexOf("apollon-rose-model-world-v1.webp");
  const lilasIndex = sequence.indexOf("apollon-lilas-model-world-v1.webp");
  const pourpreIndex = sequence.indexOf("apollon-pourpre-model-world-v1.webp");

  assert.ok(roseIndex >= 0, "Rose Velours must be present");
  assert.ok(lilasIndex > roseIndex, "Lilas Céleste must follow Rose Velours");
  assert.ok(pourpreIndex > lilasIndex, "Pourpre Impérial must complete the sequence");
  assert.match(sequence, /sequence\.color\.rose/);
  assert.match(sequence, /sequence\.color\.lilac/);
  assert.match(sequence, /sequence\.color\.purple/);
  assert.match(home, /<ApollonGuidedSequence\s*\/>/);
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
    /editorial-rose-profile\.webp"[\s\S]*alt: "AJ Luxury — Alex — Apollon Rose Velours/,
  );
});

test("non-product editorial sequences never juxtapose the same color", () => {
  const moodboardBlock = moodboard.match(
    /editorialMoodboardImages[^=]*= \[([\s\S]*?)\n\];/,
  )?.[1];
  const storyPortraitBlock = story.match(
    /<div className=\{styles\.portraitGrid\}>([\s\S]*?)<\/div>\s*<\/section>/,
  )?.[1];

  assert.ok(moodboardBlock, "the homepage moodboard sequence must exist");
  assert.ok(storyPortraitBlock, "the story portrait sequence must exist");

  const colorsIn = (source) =>
    [...source.matchAll(/Rose Velours|Pourpre Impérial|Lilas Céleste/g)].map(
      ([color]) => color,
    );

  const moodboardSequence = colorsIn(moodboardBlock);
  const storyPortraitSequence = colorsIn(storyPortraitBlock);

  assert.deepEqual(moodboardSequence, [
    "Pourpre Impérial",
    "Lilas Céleste",
    "Rose Velours",
  ]);
  assert.deepEqual(storyPortraitSequence, ["Lilas Céleste", "Rose Velours"]);

  for (const editorialSequence of [moodboardSequence, storyPortraitSequence]) {
    for (let index = 1; index < editorialSequence.length; index += 1) {
      assert.notEqual(editorialSequence[index], editorialSequence[index - 1]);
    }
  }
});

test("the requested extra Pourpre view is Jérémy", () => {
  assert.match(products, /gallery:[\s\S]*editorial-pourpre-chair\.webp/);
  assert.match(gallery, /image\.src\.includes\("editorial-pourpre-chair"\)[\s\S]*Jérémy —/);
  assert.doesNotMatch(products, /gallery:[\s\S]*hero-pourpre-model\.webp/);
});
