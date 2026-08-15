import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
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

test("the private homepage preserves the approved film and the recovered Apollon sequence", async () => {
  const page = await readFile(projectFile("app/page.tsx"), "utf8");
  const heroComposition = await readFile(
    projectFile("app/components/HeroComposition.tsx"),
    "utf8",
  );
  const heroBackgroundVideo = await readFile(
    projectFile("app/components/HeroBackgroundVideo.tsx"),
    "utf8",
  );
  const rose = page.indexOf("apollon-rose-lyre-v1.webp");
  const lilas = page.indexOf("apollon-lilas-lyre-v1.webp");
  const pourpre = page.indexOf("apollon-pourpre-lyre-v1.webp");

  assert.ok(rose > -1 && lilas > rose && pourpre > lilas);
  assert.match(page, /<HeroComposition\s*\/>/);
  assert.match(heroComposition, /<HeroBackgroundVideo/);
  assert.match(heroBackgroundVideo, /<HeroIdentityOverlay\s*\/>/);
  assert.match(page, /<T id="home\.apollonStatement"\s*\/>/);
  assert.match(page, /aria-label=\{`\$\{product\.model\} \$\{product\.name\}`\}/);
});

test("the Awwwards layer covers the critical short tablet and reduced-motion states", async () => {
  const css = await readFile(projectFile("app/globals.css"), "utf8");

  assert.match(
    css,
    /@media \(min-width: 761px\) and \(max-width: 999px\) and \(max-height: 620px\)/,
  );
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.aj-apollon-myth__frame img,[\s\S]*animation: none !important/);
  assert.match(css, /scroll-snap-type: x mandatory/);
});

test("new editorial messages are localized in every supported locale", async () => {
  const keys = [
    "home.apollonEyebrow",
    "home.apollonStatement",
    "home.firstGarment",
    "home.materialModal",
    "home.materialElastane",
    "home.colors",
    "home.sizes",
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
