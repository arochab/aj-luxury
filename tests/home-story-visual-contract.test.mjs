import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("phone hero fills the viewport with the approved native vertical film", () => {
  const phoneRules = homeCss.slice(homeCss.indexOf("@media (max-width: 560px)"));
  assert.match(
    phoneRules,
    /\.home :global\(\.aj-film__hero-stage\)\s*\{[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;/s,
  );
  assert.match(
    phoneRules,
    /\.home :global\(\.aj-film__hero-poster img\),\s*\.home :global\(\.aj-film__hero-video\)\s*\{[^}]*object-fit:\s*cover;[^}]*object-position:\s*center;/s,
  );
});

test("story sections expose headings without visible act numbers", () => {
  assert.doesNotMatch(storyPage, /styles\.actIndex|>\s*0[123]\s*</);
  assert.doesNotMatch(storyCss, /\.actIndex\b/);
  for (const heading of ["origin-title", "people-title", "definition-title"]) {
    assert.match(storyPage, new RegExp(`<h2 id="${heading}">`));
  }
});

test("the story hero never crops the approved duo at any breakpoint", () => {
  assert.equal(
    (storyPage.match(/style=\{\{ objectFit: "contain", objectPosition: "center" \}\}/g) ?? []).length,
    3,
    "the hero and both founder portraits override the fill-image cover default",
  );
  assert.match(
    storyCss,
    /\.heroImage img\s*\{[^}]*object-fit:\s*contain;[^}]*object-position:\s*center;/s,
  );
  assert.match(
    storyCss,
    /@media \(max-width:\s*760px\)[\s\S]*?\.heroImage\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3;/s,
  );
  assert.doesNotMatch(storyCss, /\.heroImage img\s*\{[^}]*object-fit:\s*cover/s);
  assert.match(storyPage, /className=\{styles\.heroBackdrop\}/);
  assert.match(storyPage, /className=\{styles\.heroForeground\}/);
  assert.match(
    storyCss,
    /\.heroBackdrop\s*\{[^}]*object-fit:\s*cover !important;[^}]*filter:\s*blur/s,
  );
});

test("the public account bootstrap stays calm and exposes the protected admin entry", () => {
  const account = readFileSync(
    new URL("../app/account/ProductionAccountClient.tsx", import.meta.url),
    "utf8",
  );
  assert.match(account, /void load\(false\)/);
  assert.match(account, /if \(reportFailure\) setError\(errorMessage\(cause\)\)/);
  assert.match(account, /Accès administrateur/);
  assert.match(account, /href="\/admin"/);
  assert.match(account, /Réservé aux administrateurs AJ Luxury autorisés/);
});

test("the story page delegates its only closing collection CTA to the shared footer", () => {
  assert.doesNotMatch(storyPage, /styles\.closing/);
  assert.equal((storyPage.match(/<StoreFooter\s*\/>/g) ?? []).length, 1);
});
