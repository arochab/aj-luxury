import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

const editorialAssets = [
  {
    file: "public/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
    hash: "031e34845ed68f71cd7dfbbb7c5a31e67abbcf4fa2097b85fe8be7adcdddf15d",
    ceiling: 125_000,
  },
  {
    file: "public/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
    hash: "14d1b618087d444a7546d092b7abbcfcaf4dadc9b41134dc662f44dc9be427d9",
    ceiling: 135_000,
  },
  {
    file: "public/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
    hash: "5357acfff4fc48eb2f5c7f8e6d12299f4c7b74584438f61de9cea835084c92d6",
    ceiling: 130_000,
  },
];

test("Isabelle Apollon editorials keep exact provenance and a bounded payload", async () => {
  let totalBytes = 0;

  for (const asset of editorialAssets) {
    const file = projectFile(asset.file);
    const bytes = await readFile(file);
    const metadata = await stat(file);
    totalBytes += metadata.size;

    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.hash);
    assert.ok(metadata.size <= asset.ceiling, `${asset.file}: ${metadata.size} bytes`);
  }

  assert.ok(totalBytes <= 390_000, `editorial payload: ${totalBytes} bytes`);
});

test("the homepage is a direct editorial document, not a scroll-controlled film", async () => {
  const page = await readFile(projectFile("app/page.tsx"), "utf8");
  const experience = await readFile(
    projectFile("app/components/HomeExperienceV9.tsx"),
    "utf8",
  );
  const css = await readFile(
    projectFile("app/components/HomeExperienceV9.module.css"),
    "utf8",
  );

  assert.match(page, /<HomeExperienceV9/);
  assert.doesNotMatch(page, /<Hero\s*\/>/);
  assert.doesNotMatch(page, /<ApollonGuidedSequence/);
  assert.doesNotMatch(experience, /gsap|ScrollTrigger|WebGL|MetallicField/);
  assert.doesNotMatch(css, /position:\s*sticky|100svh\s*\*/);
  assert.doesNotMatch(css, /heroCopyIn|\.heroCopy[^}]*animation/s);
  assert.doesNotMatch(css, /\.heroCopy[^}]*opacity:\s*0/s);
  assert.match(css, /\.heroMedia img[^}]*animation:\s*heroMediaIn/s);
  assert.match(css, /min-height: calc\(100svh - var\(--aj-tete-h\)\)/);

  assert.match(experience, /role="tablist"/);
  assert.match(experience, /role="tabpanel"/);
  assert.match(experience, /ArrowRight/);
  assert.match(experience, /ArrowLeft/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the redesigned homepage only references retained repository assets", async () => {
  const page = await readFile(projectFile("app/page.tsx"), "utf8");
  const experience = await readFile(
    projectFile("app/components/HomeExperienceV9.tsx"),
    "utf8",
  );
  const content = await readFile(
    projectFile("app/components/HomeExperienceV9.content.ts"),
    "utf8",
  );
  const homepageSources = `${page}\n${experience}\n${content}`;
  const sources = [...homepageSources.matchAll(/(?:srcSet|src|image|hero|material|mobile|tablet|desktop)\s*(?:=|:)\s*["'](\/images\/[^"']+)["']/g)]
    .map((match) => match[1]);

  const whitelist = [
    "/images/client/campagne-duo-1100.webp",
    "/images/client/campagne-duo-1484.webp",
    "/images/client/campagne-duo-760.webp",
    "/images/client/editorial-lilas-chair.webp",
    "/images/client/editorial-pourpre-chair.webp",
    "/images/client/editorial-rose-profile.webp",
    "/images/client/raw/product-pourpre-detail.webp",
    "/images/client/raw/product-rose-detail.webp",
  ];

  assert.deepEqual([...new Set(sources)].sort(), whitelist);
  assert.equal(new Set(sources).size, sources.length, "homepage visual sources must not be duplicated");

  for (const source of sources) {
    await access(projectFile(`public${source}`));
  }

  assert.doesNotMatch(
    homepageSources,
    /generated_images|concept|placeholder-v1|hero-figures|identity-overlay|hero-v[67]-|apollon-world|editorial\/isabelle-apollon|campaign-duo-lilas-seated|campagne-duo-lilas-master|product-lilas-model|<video/i,
  );
  assert.equal(
    (homepageSources.match(/\/images\/client\/raw\/product-pourpre-detail\.webp/g) ?? []).length,
    1,
    "the revised hero whitelist must use the exact retained Pourpre detail once",
  );
});

test("homepage controls answer quickly and scroll-linked product motion has no lag", async () => {
  const designSystem = await readFile(projectFile("app/design-system.css"), "utf8");
  const homepageCss = await readFile(
    projectFile("app/components/HomeExperienceV9.module.css"),
    "utf8",
  );
  const gallery = await readFile(
    projectFile("app/components/ProductGalleryZoom.tsx"),
    "utf8",
  );
  const storeHeader = await readFile(
    projectFile("app/components/StoreHeader.tsx"),
    "utf8",
  );
  const storeChrome = await readFile(
    projectFile("app/components/StoreChrome.module.css"),
    "utf8",
  );
  const worker = await readFile(projectFile("worker/index.ts"), "utf8");
  const menuTimeline = storeHeader.match(
    /const partition = gsap[\s\S]*?ouvertureMenu\.current = partition;/,
  )?.[0] ?? "";

  assert.match(designSystem, /--aj-d-court:\s*0\.18s/);
  assert.match(homepageCss, /transition:[^;]*180ms/);
  assert.doesNotMatch(homepageCss, /transition:[^;]*(?:7\d{2,}|[1-9]\d{3,})ms/);
  assert.doesNotMatch(storeHeader, /stagger:/);
  assert.match(storeHeader, /duration:\s*0\.32/);
  assert.doesNotMatch(storeHeader, /duration:\s*(?:0\.[6-9]|[1-9])/);
  assert.match(menuTimeline, /autoAlpha:\s*0[\s\S]*autoAlpha:\s*1[\s\S]*duration:\s*0\.32/);
  assert.doesNotMatch(menuTimeline, /stagger:|\b(?:x|y|xPercent|yPercent|scale|transform):/);
  assert.match(storeHeader, /requestAnimationFrame\(\(\) => boutonMenu\.current\?\.focus\(\)\)/);
  assert.match(storeChrome, /@media \(max-width: 760px\)/);
  assert.match(storeChrome, /\.menuSigne[\s\S]*?transition:\s*none/);
  assert.match(storeChrome, /\.menuBouton[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/);
  assert.match(storeChrome, /\.menuPanneau \.navLink,[\s\S]*?min-height:\s*44px/);
  assert.match(storeChrome, /\.aj-home\.aj-home-v9[\s\S]*?transform:\s*none\s*!important/);
  assert.match(worker, /if \(allowLocalPreviewFrame\) headers\.delete\("X-Frame-Options"\)/);
  assert.match(worker, /env === undefined \|\| env\.APP_ENV === undefined[\s\S]*url\.hostname === "localhost"[\s\S]*frontend-design[\s\S]*round-4/);
  assert.match(gallery, /scrub: true/);
  assert.doesNotMatch(gallery, /scrub:\s*0\.[1-9]/);
});

test("new editorial messages are localized in every supported locale", async () => {
  const keys = [
    "home.apollonEyebrow",
    "home.apollonStatement",
    "home.incarnationEyebrow",
    "home.incarnationTitle",
    "home.incarnationBody",
    "home.firstGarment",
    "home.materialModal",
    "home.materialElastane",
    "home.colors",
    "home.sizes",
    "sequence.color.rose",
    "sequence.color.lilac",
    "sequence.color.purple",
    "sequence.tablist",
    "sequence.stillAlt",
    "sequence.bodyAlt",
  ];

  for (const locale of ["fr", "en", "es", "de", "it"]) {
    const dictionary = JSON.parse(
      await readFile(projectFile(`lib/i18n/dictionaries/${locale}.json`), "utf8"),
    );

    for (const key of keys) {
      assert.equal(typeof dictionary[key], "string", `${locale}.${key}`);
      assert.notEqual(dictionary[key].trim(), "", `${locale}.${key}`);
    }
  }
});
