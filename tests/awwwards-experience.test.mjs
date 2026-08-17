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
  const sequence = await readFile(
    projectFile("app/components/ApollonGuidedSequence.tsx"),
    "utf8",
  );
  const heroComposition = await readFile(
    projectFile("app/components/HeroComposition.tsx"),
    "utf8",
  );
  const heroBackgroundVideo = await readFile(
    projectFile("app/components/HeroBackgroundVideo.tsx"),
    "utf8",
  );
  const rose = sequence.indexOf("apollon-rose-lyre-v1.webp");
  const lilas = sequence.indexOf("apollon-lilas-lyre-v1.webp");
  const pourpre = sequence.indexOf("apollon-pourpre-lyre-v1.webp");

  assert.ok(rose > -1 && lilas > rose && pourpre > lilas);
  assert.match(page, /<HeroComposition\s*\/>/);
  assert.doesNotMatch(page, /className="aj-film__message"/);
  assert.match(heroComposition, /<HeroBackgroundVideo/);
  assert.match(heroBackgroundVideo, /<HeroIdentityOverlay\s*\/>/);
  assert.match(sequence, /<T id="home\.incarnationTitle"\s*\/>/);
  assert.match(sequence, /role="tablist"/);
  assert.match(sequence, /tabIndex=\{index === active \? 0 : -1\}/);
  assert.match(sequence, /event\.key === "ArrowRight"/);
  assert.match(sequence, /event\.key === "Home"/);
  assert.match(sequence, /selectFrame\(index, true\)/);
  assert.match(sequence, /progressRef/);
  assert.match(sequence, /setPaused/);
  assert.match(page, /aria-label=\{`\$\{product\.model\} \$\{product\.name\}`\}/);
});

test("the Awwwards layer covers the critical short tablet and reduced-motion states", async () => {
  const css = await readFile(projectFile("app/globals.css"), "utf8");
  const sequence = await readFile(
    projectFile("app/components/ApollonGuidedSequence.tsx"),
    "utf8",
  );
  const experience = await readFile(
    projectFile("app/components/HomeGsapExperience.tsx"),
    "utf8",
  );
  const packageJson = JSON.parse(await readFile(projectFile("package.json"), "utf8"));

  assert.match(
    css,
    /@media \(min-width: 761px\) and \(max-width: 999px\) and \(max-height: 620px\)/,
  );
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.aj-sequence__frame,[\s\S]*transition: none !important/);
  assert.match(css, /scroll-snap-type: x mandatory/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.aj-sequence__stage \{[\s\S]*--aj-split: 28%;/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.aj-sequence__symbol \{[\s\S]*right: calc\(100% - var\(--aj-split\)\);[\s\S]*bottom: 0;/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.aj-sequence__body \{[\s\S]*top: 0;[\s\S]*left: var\(--aj-split\);[\s\S]*padding: 10px 8px 112px;/);
  assert.doesNotMatch(css, /\.aj-sequence__stage::before \{[\s\S]{0,180}top: 43%/);
  assert.equal(packageJson.dependencies.gsap, "^3.15.0");
  assert.equal(packageJson.dependencies["@gsap/react"], "^2.1.2");
  assert.match(sequence, /import\("gsap"\)/);
  assert.match(sequence, /gsap\.timeline/);
  assert.match(sequence, /autoplayRef/);
  assert.doesNotMatch(sequence, /requestAnimationFrame/);
  assert.match(sequence, /IntersectionObserver/);
  assert.match(sequence, /document\.visibilityState === "visible"/);
  assert.match(sequence, /prefers-reduced-motion: reduce/);
  assert.match(experience, /ScrollTrigger/);
  assert.match(experience, /import\("gsap\/ScrollTrigger"\)/);
  assert.match(experience, /gsap\.matchMedia/);
  assert.match(experience, /\.aj-proof/);
  assert.match(experience, /\.aj-product-card/);
  assert.match(experience, /\.aj-moodboard__item/);
  assert.match(experience, /\.aj-story__copy/);
  assert.doesNotMatch(sequence, /^import .* from "gsap"/m);
  assert.doesNotMatch(experience, /^import .* from "gsap/m);
  assert.doesNotMatch(experience, /^gsap\.registerPlugin/m);
  assert.doesNotMatch(experience, /ScrollSmoother|scrollTo\(/);
  assert.match(experience, /pin: true/);
  assert.match(experience, /end: "\+=85%"/);
  assert.match(css, /\.aj-film__hero-poster img,[\s\S]*\.aj-film__hero-video \{[\s\S]*object-fit: contain/);
  assert.match(css, /\.aj-sequence__body img \{[\s\S]*object-fit: contain/);
  assert.match(css, /\.aj-moodboard__item img \{[\s\S]*object-fit: contain/);
  assert.match(css, /\.aj-product-card__image img \{[\s\S]*object-fit: contain/);
  assert.doesNotMatch(experience, /yPercent: -4/);
  assert.doesNotMatch(experience, /clipPath: "inset\(9%/);
  assert.doesNotMatch(sequence, /\.aj-sequence__body img"\), \{[^}]*scale:/);
  assert.doesNotMatch(sequence, /\.aj-sequence__body img"\), \{[^}]*xPercent:/);
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
    "sequence.pause",
    "sequence.resume",
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
