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
  const hero = await readFile(projectFile("app/components/Hero.tsx"), "utf8");
  const rose = sequence.indexOf("apollon-rose-lyre-v1.webp");
  const lilas = sequence.indexOf("apollon-lilas-lyre-v1.webp");
  const pourpre = sequence.indexOf("apollon-pourpre-lyre-v1.webp");

  assert.ok(rose > -1 && lilas > rose && pourpre > lilas);
  assert.match(page, /<Hero\s*\/>/);
  assert.doesNotMatch(page, /className="aj-film__message"/);
  /* LA PROVENANCE DES VISAGES EST UN CONTRAT, PAS UNE INTENTION. Adam a
     refuse le 21/08 les masters issus d'un modele generatif : les visages y
     etaient deformes. La decoupe servie au premier ecran doit donc etre
     fabriquee a partir de la photographie de studio validee, et par un modele
     de SEGMENTATION — qui ne produit qu'un canal alpha et ne peut pas
     redessiner un visage. Ce test verrouille les deux. */
  const fabrique = await readFile(
    projectFile("scripts/build_hero_figures.py"),
    "utf8",
  );
  assert.match(fabrique, /campaign-duo-lilas-seated\.webp/);
  assert.match(fabrique, /only_mask=True/);
  assert.match(hero, /HERO_FIGURES/);
  assert.doesNotMatch(hero, /role="plate"/);

  /* LE VOL DU MOT-MARQUE, ET LE DEFAUT QU'IL A COUTE.
     Un tween sans duree explicite prend 0,5 s ; dans une timeline pilotee au
     scrub, il ne couvre donc que la MOITIE de la course. Releve image par
     image le 21/08 : le logo atteignait sa taille finale des p=0,5 puis
     glissait a vide sur tout le reste du defilement. Les tweens de course
     portent desormais leur duree, et ce test la garde. */
  assert.equal(
    (hero.match(/duration: 1,/g) ?? []).length,
    2,
    "les deux tweens de course (camera et vol du logo) doivent porter leur duree",
  );
  /* La cible du vol est cherchee par attribut, jamais par classe de module :
     celles-ci sont hachees a la compilation. */
  assert.match(hero, /\[data-aj-marque="entete"\]/);
  /* Le terme de defilement. Le mot vit dans le flux : sans lui rendre la
     hauteur du hero, il sort par le haut au lieu d'atterrir. */
  assert.match(hero, /noeud\.offsetHeight/);

  /* La barre ne se derobe pas tant que le premier ecran est la. */
  const barre = await readFile(
    projectFile("app/components/StoreHeader.tsx"),
    "utf8",
  );
  assert.match(barre, /data-aj-tete-seuil/);
  assert.match(barre, /onRefresh: mesurerSeuil/);
  /* Trois mouvements, trois proprietaires. La derive et la poussee au
     defilement ont anime `scale` sur le meme noeud le 21/08 : elles se
     disputaient le rendu et l'image restait immobile au defilement. Elles
     vivent depuis sur deux noeuds imbriques. */
  assert.match(hero, /const plans = q\(`\.\$\{styles\.plan\}`\)/);
  assert.match(hero, /const scenes = q\(`\.\$\{styles\.scene\}`\)/);
  /* Deux PLANS freres, et non un seul : le mot-marque doit rester entre le
     metal et les corps tout en pouvant quitter la scene pour la barre. Un
     ancetre transforme creerait un contexte d'empilement dont il ne sortirait
     pas. Le composant en rend donc exactement deux. */
  assert.equal(
    (hero.match(/className=\{styles\.plan\}/g) ?? []).length,
    2,
    "le metal et les corps doivent etre deux plans freres",
  );
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
  /* Le texte avance avec l'image : la phrase suit l'ouverture du volet, le
     lien invisible sort du focus. */
  assert.match(sequence, /phrase\.style\.opacity = ouverture\.toFixed\(4\)/);

  /* LE PALIER TIENT UN PANNEAU COMPLET. La ligne commerce s'assemblait sur le
     premier quart du PALIER : mesure au navigateur, prix et lien restaient
     visibility:hidden pendant 1 700 px de defilement, soit 67 % du panneau 01.
     La phase la plus longue et la plus regardee tenait un panneau encore en
     train de s'ecrire, alors que le brief exige que le visiteur comprenne
     toujours le prix et le chemin d'achat. Le commerce monte donc pendant le
     DEVOILEMENT, et vaut 1 sur tout le palier. */
  assert.match(sequence, /mesure\.nom === "porte"\s*\?\s*1/);
  assert.match(sequence, /lisse\(borne\(\(u - 0\.35\) \/ 0\.65, 0, 1\)\)/);
  /* Le voile du telephone ne peint que la hauteur revelee : un aplat aux
     dimensions de tout le contenu laissait 79 % de rectangle sombre sur du
     vide pendant le plan scelle. 34 % est le plancher qui couvre le titre. */
  assert.match(sequence, /--aj-copie-remplie/);
  assert.match(sequence, /34 \+ 66 \* Math\.max\(ouverture, commerce\)/);
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
