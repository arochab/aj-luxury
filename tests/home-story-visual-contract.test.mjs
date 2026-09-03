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

test("desktop hero is a full-bleed canvas without a visible media rectangle", () => {
  const desktopRules = homeCss.slice(
    homeCss.lastIndexOf("@media (min-width: 901px)"),
  );

  assert.match(
    desktopRules,
    /\.home :global\(\.aj-film__hero-backdrop\)\s*\{[^}]*display:\s*none;[^}]*opacity:\s*0;/s,
  );
  assert.match(
    desktopRules,
    /\.home :global\(\.aj-film__hero-stage\)\s*\{[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;/s,
  );
  assert.match(
    desktopRules,
    /\.home :global\(\.aj-film__hero-poster img\),\s*\.home :global\(\.aj-film__hero-video\)\s*\{[^}]*object-fit:\s*cover;[^}]*object-position:\s*center top;[^}]*mask-image:\s*none;/s,
  );
  assert.match(
    desktopRules,
    /\.home :global\(\.aj-film__hero-media\),[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0;[\s\S]*?box-shadow:\s*none;/,
  );
  assert.match(
    homeCss,
    /\.home :global\(\.aj-film__signature\)\s*\{[^}]*background:\s*transparent;/s,
  );
});

test("desktop cover geometry preserves the film's full horizontal subject field", () => {
  const source = { width: 1920, height: 1080 };
  const desktopHeaderHeight = 110.4;
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
  ];

  for (const viewport of viewports) {
    const stageHeight = viewport.height - desktopHeaderHeight;
    const scale = Math.max(
      viewport.width / source.width,
      stageHeight / source.height,
    );
    const renderedWidth = source.width * scale;
    const renderedHeight = source.height * scale;

    assert.equal(
      renderedWidth,
      viewport.width,
      `${viewport.width}x${viewport.height} must not crop either model laterally`,
    );
    assert.ok(renderedHeight >= stageHeight);
    assert.ok(
      renderedHeight - stageHeight < 112,
      `${viewport.width}x${viewport.height} keeps the crop on the lower scenery`,
    );
  }
});

test("story sections expose headings without visible act numbers", () => {
  assert.doesNotMatch(storyPage, /styles\.actIndex|>\s*0[123]\s*</);
  assert.doesNotMatch(storyCss, /\.actIndex\b/);
  for (const heading of ["origin-title", "people-title", "definition-title"]) {
    assert.match(storyPage, new RegExp(`<h2 id="${heading}">`));
  }
});

test("the story hero uses a prominent native-ratio frame on one seamless charcoal-lilac canvas", () => {
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
  assert.match(storyCss, /--story-surface:\s*#2d2733/);
  for (const section of ["hero", "origin", "people", "definition"]) {
    assert.match(
      storyCss,
      new RegExp(`\\.${section}\\s*\\{[^}]*background:\\s*var\\(--story-surface\\);`, "s"),
      `${section} uses the shared seamless story surface`,
    );
  }
  assert.match(
    storyCss,
    /\.heroBody\s*\{[^}]*width:\s*min\(1580px,[^}]*grid-template-columns:\s*minmax\(17rem, 0\.45fr\) minmax\(0, 1\.55fr\);[^}]*gap:\s*clamp\(1\.75rem, 3vw, 4rem\);[^}]*padding:\s*clamp\(0\.75rem, 1\.5vh, 1rem\) 0;/s,
  );
  assert.match(
    storyCss,
    /\.heroImage\s*\{[^}]*width:\s*min\(100%, calc\(\(100svh - 7\.25rem\) \* 2 \/ 3\), 44rem\);[^}]*justify-self:\s*center;/s,
  );
  assert.match(
    storyCss,
    /@media \(max-width:\s*760px\)[\s\S]*?\.heroImage\s*\{[^}]*width:\s*calc\(100% - 1\.5rem\);[^}]*max-width:\s*34rem;/s,
  );
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
