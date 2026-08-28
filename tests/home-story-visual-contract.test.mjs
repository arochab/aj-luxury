import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [homeCss, storyPage, storyCss] = await Promise.all([
  readFile(
    new URL("../app/components/ProductionHome.module.css", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../app/notre-histoire/page.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../app/notre-histoire/Story.module.css", import.meta.url),
    "utf8",
  ),
]);

test("phone hero preserves the complete supplied composition without a dead band", () => {
  const phoneRules = homeCss.slice(homeCss.indexOf("@media (max-width: 560px)"));
  assert.match(
    phoneRules,
    /\.home :global\(\.aj-film__hero-stage\)\s*\{[^}]*left:\s*0;/s,
  );
  assert.match(
    phoneRules,
    /\.home :global\(\.aj-film__hero-poster img\),\s*\.home :global\(\.aj-film__hero-video\)\s*\{[^}]*object-fit:\s*contain;[^}]*object-position:\s*center;/s,
  );
});

test("story sections expose headings without visible act numbers", () => {
  assert.doesNotMatch(storyPage, /styles\.actIndex|>\s*0[123]\s*</);
  assert.doesNotMatch(storyCss, /\.actIndex\b/);
  for (const heading of ["origin-title", "people-title", "definition-title"]) {
    assert.match(storyPage, new RegExp(`<h2 id="${heading}">`));
  }
});

test("the story page delegates its only closing collection CTA to the shared footer", () => {
  assert.doesNotMatch(storyPage, /styles\.closing/);
  assert.equal((storyPage.match(/<StoreFooter\s*\/>/g) ?? []).length, 1);
});
