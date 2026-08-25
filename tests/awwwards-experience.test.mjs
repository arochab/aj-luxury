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

test("the homepage is a native-scroll GSAP editorial document, never a film", async () => {
  const page = await readFile(projectFile("app/page.tsx"), "utf8");
  const experience = await readFile(
    projectFile("app/components/HomeExperienceV10.tsx"),
    "utf8",
  );
  const css = await readFile(
    projectFile("app/components/HomeExperienceV10.module.css"),
    "utf8",
  );

  assert.match(page, /<HomeExperienceV10/);
  assert.match(page, /aj-home-v10/);
  assert.doesNotMatch(`${page}\n${experience}`, /<video|HeroComposition|MetallicField|WebGL/i);
  assert.match(experience, /useAjMotion/);
  assert.match(experience, /scrub:\s*true/g);
  assert.doesNotMatch(experience, /scrub:\s*0\.|\bpin:\s*/);
  assert.match(experience, /if \(desktop && featured && featuredCards\.length === 3\)/);
  assert.match(experience, /if \(desktop && collectionStage && collectionCards\.length === 3\)/);
  assert.match(experience, /if \(desktop\) \{[\s\S]*moodboardMedia\.forEach/);
  assert.match(css, /@media \(min-width: 761px\) and \(prefers-reduced-motion: no-preference\)/);
  assert.match(css, /scroll-snap-type:\s*x mandatory/);
  assert.match(css, /flex:\s*0 0 78vw/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the redesigned homepage only references retained repository assets", async () => {
  const page = await readFile(projectFile("app/page.tsx"), "utf8");
  const experience = await readFile(
    projectFile("app/components/HomeExperienceV10.tsx"),
    "utf8",
  );
  const moodboard = await readFile(projectFile("lib/editorial-moodboard.ts"), "utf8");
  const products = await readFile(projectFile("lib/products.ts"), "utf8");
  const homepageSources = `${page}\n${experience}\n${moodboard}\n${products}`;
  const sources = [...homepageSources.matchAll(/["'](\/images\/[^"']+\.(?:webp|avif|png|jpe?g))["']/g)]
    .map((match) => match[1]);

  assert.ok(sources.length >= 10, "the home must draw from the retained AJ asset library");
  assert.ok(sources.every((source) =>
    source.startsWith("/images/client/") ||
    source.startsWith("/images/editorial/isabelle-apollon/"),
  ));

  for (const source of new Set(sources)) {
    await access(projectFile(`public${source}`));
  }

  assert.ok(!sources.some((source) =>
    /generated_images|concept|hero-figures|identity-overlay|hero-v[67]-|apollon-world/i.test(source),
  ));
  assert.doesNotMatch(`${page}\n${experience}`, /<video/i);
  assert.match(experience, /campaign-duo-pourpre\.webp/);
  assert.match(experience, /campaign-duo-lilas-seated\.webp/);
});

test("homepage controls answer quickly and scroll-linked product motion has no lag", async () => {
  const designSystem = await readFile(projectFile("app/design-system.css"), "utf8");
  const homepageCss = await readFile(
    projectFile("app/components/HomeExperienceV10.module.css"),
    "utf8",
  );
  const homepage = await readFile(
    projectFile("app/components/HomeExperienceV10.tsx"),
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
  assert.match(designSystem, /--aj-d-court:\s*0\.18s/);
  assert.match(homepageCss, /transition:[^;]*(?:140|180)ms/);
  assert.doesNotMatch(homepageCss, /transition:[^;]*(?:7\d{2,}|[1-9]\d{3,})ms/);
  assert.doesNotMatch(storeHeader, /gsap|stagger:|setTimeout/);
  assert.match(storeHeader, /const navigation = \[[\s\S]*href: "\/"[\s\S]*href: "\/shop"[\s\S]*href: "\/notre-histoire"/);
  assert.match(storeChrome, /@media \(max-width: 620px\)/);
  assert.match(storeChrome, /min-width:\s*2\.75rem/);
  assert.match(storeChrome, /min-height:\s*2\.75rem/);
  assert.match(homepage, /scrub:\s*true/g);
  assert.doesNotMatch(homepage, /scrub:\s*0\.[1-9]|\bpin:\s*/);
  assert.match(homepage, /collectionCleanup = \(\) =>/);
  assert.match(homepage, /return collectionCleanup/);
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
