import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL(
  "../app/components/IsabelleColorwayRail.tsx",
  import.meta.url,
);
const cssPath = new URL(
  "../app/components/IsabelleColorwayRail.module.css",
  import.meta.url,
);
const pagePath = new URL("../app/page.tsx", import.meta.url);

test("the preview second screen uses only the six approved local assets", async () => {
  const source = await readFile(componentPath, "utf8");
  const assetMatches = source.match(/\/(?:images)[^"\s]+\.webp/g) ?? [];

  assert.deepEqual(assetMatches, [
    "/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
    "/images/client/apollon-world/apollon-pourpre-model-color-v2.webp",
    "/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
    "/images/client/apollon-world/apollon-lilas-model-color-v2.webp",
    "/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
    "/images/client/apollon-world/apollon-rose-model-color-v2.webp",
  ]);
  assert.doesNotMatch(source, /https?:\/\//);
});

test("the colorway rail preserves framing and reduced motion", async () => {
  const [source, css] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(cssPath, "utf8"),
  ]);

  assert.match(source, /pin: viewport/);
  assert.match(source, /scrub: true/);
  assert.match(source, /#3f051c/);
  assert.match(source, /#616384/);
  assert.match(source, /#97666a/);
  assert.doesNotMatch(source, /\bindex\s*:/);
  assert.match(css, /aspect-ratio:\s*2\s*\/\s*3/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /border:\s*1px solid/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /border-(?:left|right)\s*:/);
  assert.doesNotMatch(css, /transition:\s*all/);
});

test("the homepage mounts the isolated preview rail in place of the old bridge", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.match(page, /import IsabelleColorwayRail/);
  assert.match(page, /<IsabelleColorwayRail \/>/);
  assert.doesNotMatch(page, /HomeChromaticBridge/);
  assert.doesNotMatch(page, /aj-featured/);
});
