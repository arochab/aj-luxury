import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [homeCss, storyPage, storyMedia, storyCss] = await Promise.all([
  readFile(
    new URL("../app/components/ProductionHome.module.css", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../app/notre-histoire/page.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../app/notre-histoire/StoryHeroMedia.tsx", import.meta.url),
    "utf8",
  ),
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

test("the story hero uses a native-ratio bordered frame on the dark editorial canvas", () => {
  assert.equal(
    (storyPage.match(/style=\{\{ objectFit: "contain", objectPosition: "center" \}\}/g) ?? []).length,
    2,
    "both founder portraits preserve their complete source canvases",
  );
  assert.match(
    storyCss,
    /\.heroImage\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3;[^}]*border:\s*1px solid var\(--story-line-strong\);/s,
  );
  assert.match(
    storyCss,
    /@media \(max-width:\s*760px\)[\s\S]*?\.heroImage\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3;/s,
  );
  assert.match(storyMedia, /className=\{styles\.heroForeground\}/);
  assert.match(storyMedia, /data-story-scroll-zoom="subtle"/);
  assert.match(storyMedia, /prefers-reduced-motion: no-preference/);
  assert.match(storyMedia, /scale: compact \? 1\.018 : 1\.028/);
  assert.match(storyMedia, /scrub: 0\.18/);
  assert.match(storyCss, /\.heroForeground\s*\{[^}]*object-fit:\s*cover !important;/s);
  assert.match(storyCss, /--story-ink:\s*#0b0b0d/);
  assert.match(storyCss, /--story-panel:\s*#121216/);
  assert.match(storyCss, /\.portrait\s*\{[^}]*border:\s*1px solid var\(--story-line-strong\);/s);
  assert.match(
    storyCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.heroForeground\s*\{[^}]*transform:\s*none !important;/s,
  );
  assert.doesNotMatch(storyCss, /transition:\s*all|will-change\s*:/);
  assert.doesNotMatch(storyPage, /styles\.heroBackdrop/);
  assert.doesNotMatch(storyCss, /\.heroBackdrop\b|filter:\s*blur\(/);
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
