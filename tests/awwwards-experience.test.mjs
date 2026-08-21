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
  const hero = await readFile(projectFile("app/components/HeroV7.tsx"), "utf8");
  const rose = sequence.indexOf("apollon-rose-lyre-v1.webp");
  const lilas = sequence.indexOf("apollon-lilas-lyre-v1.webp");
  const pourpre = sequence.indexOf("apollon-pourpre-lyre-v1.webp");

  assert.ok(rose > -1 && lilas > rose && pourpre > lilas);
  assert.match(page, /<HeroV7\s*\/>/);
  assert.doesNotMatch(page, /className="aj-film__message"/);
  /* Le hero v7 tient sur deux calques superposes. Le calque `figures` est la
     SEULE raison pour laquelle le mot-marque passe derriere les corps : sans
     lui le premier ecran redevient un titre pose sur une image. */
  assert.match(hero, /role="plate"/);
  assert.match(hero, /role="figures"/);
  /* Trois mouvements, trois proprietaires. La derive et la poussee au
     defilement ont anime `scale` sur le meme noeud le 21/08 : elles se
     disputaient le rendu et l'image restait immobile au defilement. Elles
     vivent depuis sur deux noeuds imbriques. */
  assert.match(hero, /const camera = q\(`\.\$\{styles\.camera\}`\)\[0\]/);
  assert.match(hero, /const scene = q\(`\.\$\{styles\.scene\}`\)\[0\]/);
  /* Chaque tween de defilement part d'une valeur ECRITE et ne se rend qu'au
     premier defilement : sans cela GSAP relevait sa valeur de depart en plein
     milieu de l'arrivee, et le retour en haut de page rendait le premier ecran
     vide. Trois tweens de defilement, trois immediateRender: false. */
  assert.equal((hero.match(/immediateRender: false,/g) ?? []).length, 3);
  assert.doesNotMatch(hero, /<HeroIdentityOverlay/);
  /* CONTRATS RÉALIGNÉS LE 21/08 sur l'implémentation vivante — partition
     nommée + copie progressive. Les marqueurs aj-sequence__*, selectFrame et
     le mode world/color appartenaient à la première implémentation, disparue
     lors des reprises des 18-20/08 ; ce test verrouillait un fantôme. */
  assert.match(sequence, /t\("home\.incarnationTitle"\)/);
  /* Des raccourcis de position, pas des onglets ARIA : le motif tablist
     promettrait des tabpanels qui n'existent pas. */
  assert.match(sequence, /role="group"/);
  assert.doesNotMatch(sequence, /role="tablist"/);
  assert.match(sequence, /aria-current=\{index === actif \? "true" : undefined\}/);
  assert.match(sequence, /inert=\{anime && index !== actif\}/);
  /* Chaque coloris a ses temps propres, et le repère d'onglet vise 30 % du
     palier porté — la copie est entière à l'arrivée. */
  assert.match(sequence, /DUREES_PAR_PLATEAU/);
  assert.match(sequence, /porte\.debut \+ 0\.3 \* \(porte\.fin - porte\.debut\)/);
  /* Les trois plans portés v2, décors nettoyés du 18/08. */
  assert.match(sequence, /apollon-rose-model-color-v2\.webp/);
  assert.match(sequence, /apollon-lilas-model-color-v2\.webp/);
  assert.match(sequence, /apollon-pourpre-model-color-v2\.webp/);
  /* Le texte avance avec l'image : la phrase suit l'ouverture du volet, la
     ligne commerce s'assemble au palier, le lien invisible sort du focus. */
  assert.match(sequence, /phrase\.style\.opacity = ouverture\.toFixed\(4\)/);
  assert.match(sequence, /lisse\(borne\(u \/ 0\.25, 0, 1\)\)/);
  assert.match(
    sequence,
    /noeud\.style\.visibility = commerce < 0\.05 \? "hidden" : ""/,
  );
  assert.match(page, /<ApollonGuidedSequence coloris=\{coloris\} \/>/);
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

  /* CONTRATS RÉALIGNÉS LE 21/08. Les marqueurs aj-sequence__* et le pin GSAP
     appartenaient à la première implémentation ; les garanties vivantes sont
     celles-ci, et elles couvrent les mêmes risques : une variante statique
     LISIBLE sous mouvement réduit, GSAP jamais importé statiquement, et le
     scroll comme seule horloge. */
  const module_ = await readFile(
    projectFile("app/components/Accueil.module.css"),
    "utf8",
  );
  const hook = await readFile(
    projectFile("app/components/useAjMotion.ts"),
    "utf8",
  );

  /* Mouvement réduit : le rail se déplie en colonne, les transforms écrits
     en inline par GSAP sont neutralisés, les entrées de chargement coupées. */
  assert.match(module_, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(module_, /transform: none !important/);
  assert.match(module_, /flex-direction: column/);
  assert.match(sequence, /prefers-reduced-motion: no-preference/);
  assert.match(experience, /prefers-reduced-motion: no-preference/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);

  /* GSAP n'entre que par import dynamique, via le hook partagé. */
  assert.match(hook, /import\("gsap"\)/);
  assert.match(hook, /import\("gsap\/ScrollTrigger"\)/);
  assert.doesNotMatch(sequence, /^import .* from "gsap"/m);
  assert.doesNotMatch(experience, /^import .* from "gsap/m);
  assert.equal(packageJson.dependencies.gsap, "^3.15.0");
  assert.equal(packageJson.dependencies["@gsap/react"], "^2.1.2");

  /* Le scroll est la seule horloge : scrub 1:1 sans lissage, le collage est
     en CSS sticky — jamais un pin GSAP qui se disputerait la position — et
     la hauteur de la section est DÉRIVÉE de la partition. */
  assert.match(sequence, /scrub: true/);
  assert.doesNotMatch(sequence, /pin: true/);
  assert.match(module_, /position: sticky/);
  assert.doesNotMatch(experience, /ScrollSmoother/);
  assert.match(
    module_,
    /calc\(\(1 \+ var\(--plaque-temps, 3\.2\)\) \* 100svh\)/,
  );
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
