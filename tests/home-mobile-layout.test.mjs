import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const railCss = readFileSync(
  `${root}app/components/HomeHorizontalChromaticRail.module.css`,
  "utf8",
);

test("the narrow mobile rail reserves the two-line title before its media", () => {
  assert.match(railCss, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.panelInner\s*\{[\s\S]*?padding:\s*clamp\(278px,\s*38svh,\s*304px\)\s+0\s+24px;/);
  assert.match(railCss, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.compactCopy\s+a\s*\{[\s\S]*?white-space:\s*nowrap;/);
});

test("the narrow mobile media pair is bounded by the real capped stage height", () => {
  assert.match(
    railCss,
    /\.mediaPair\s*\{[\s\S]*?width:\s*min\([\s\S]*?min\(100svh,\s*620px\)[\s\S]*?clamp\(278px,\s*38svh,\s*304px\)[\s\S]*?\*\s*4\s*\/\s*3[\s\S]*?\);/,
  );
});
