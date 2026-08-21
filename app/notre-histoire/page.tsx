"use client";

import Image from "next/image";
import Link from "next/link";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { useAjMotion } from "../components/useAjMotion";
import { T } from "../../lib/i18n/TranslatedText";
import { useI18n } from "../../lib/i18n/I18nProvider";
import styles from "../components/Recit.module.css";

/* ==========================================================================
   /notre-histoire — le seul endroit où la marque parle
   --------------------------------------------------------------------------
   Sur l'accueil, l'histoire tenait sur un tiers d'écran, moins que le pied de
   page. Ici elle occupe six mouvements et environ sept écrans : ouverture,
   trois mouvements nommés, un plan large, une clôture. Le scroll est la
   seule horloge de tout ce qui se déroule ; il n'y a ni minuteur ni
   auto-avance.

   CE QUI TIENT LE RYTHME — retour d'Adam du 19/08 : « supprimer les numéros
   de chapitre ». Les index 01, 02, 03 sont retirés, mais pas remplacés par
   rien : ils ne tenaient déjà aucun rythme, puisqu'ils flottaient à trois
   abscisses différentes (à gauche dans le chapitre 01, à droite dans le duo,
   à gauche dans la matière) et à des intervalles verticaux du simple au
   quadruple. Le rythme vient désormais d'une grammaire répétée à l'identique
   trois fois : NOM DU MOUVEMENT → filet → titre, dans une tête de chapitre
   construite sur la même règle CSS partout (.chapitreAncre, .duoTete et
   .matiereTete partagent la même colonne et le même gap). Les trois noms
   sont les objets d'Apollon que les images portent déjà — le marbre, la
   lyre, le laurier — et ils font enfin entrer ce vocabulaire dans le TEXTE,
   où il était totalement absent.

   L'ARC DU RÉCIT — origine, tension, conviction, promesse. Le marbre pose le
   constat et l'objection ; la lyre donne la parole aux deux fondateurs, une
   seule fois, signée ; le laurier descend dans la matière ; la clôture tient
   la promesse. Aucune idée n'est énoncée deux fois : les quatre
   reformulations de « le confort donne confiance » relevées le 19/08 ont été
   ramenées à zéro.

   PARITÉ STRICTE — contrainte dure du client. Jérémy et Alex sont nommés dans
   le texte visible dès le premier écran, et le mouvement de la lyre les
   montre dans deux cellules rigoureusement identiques : même grille 1fr 1fr,
   même règle CSS pour les deux, même légende, et surtout AUCUN décalage
   d'arrivée. Un ordre d'entrée est déjà une hiérarchie ; les deux portraits
   se révèlent donc exactement en même temps. L'ordre de nomination est
   « Jérémy et Alex » partout, y compris dans l'ordre des deux cellules.

   POURQUOI CE FICHIER EST UN COMPOSANT CLIENT
   Le scrollytelling a besoin de GSAP, donc du navigateur. Next interdit
   d'exporter `metadata` depuis un module « use client » : le titre et la
   description sont donc rendus dans le JSX, via le support natif de React 19
   pour les balises de document, qui les remonte dans <head>.

   MÉDIAS — aucun actif créé. Les quatre visuels existent déjà dans public/,
   et leurs attributions viennent des sources du dépôt (lib/editorial-
   moodboard.ts pour la campagne, l'ancienne version de cette page pour les
   deux portraits). Aucun nom n'est deviné.
   ========================================================================== */

export default function NotreHistoirePage() {
  const { locale } = useI18n();

  const racine = useAjMotion<HTMLElement>(
    ({ gsap, mm, racine: noeud }) => {
      let vivant = true;

      const tous = <E extends HTMLElement = HTMLElement>(classe: string) =>
        Array.from(noeud.querySelectorAll<E>(`.${classe}`));
      const un = <E extends HTMLElement = HTMLElement>(classe: string) =>
        noeud.querySelector<E>(`.${classe}`);

      /* SplitText découpe des lignes : leur nombre dépend des métriques de la
         police. Manrope est variable et arrive en woff2 après le premier
         rendu — découper avant son arrivée produirait des lignes fausses, que
         le premier reflow contredirait. On attend donc le plugin ET les
         polices avant de poser la moindre scène. Rien n'est masqué en CSS :
         pendant cette attente la page est déjà entièrement lisible. */
      void Promise.all([
        import("gsap/SplitText"),
        typeof document !== "undefined" && document.fonts
          ? document.fonts.ready
          : Promise.resolve(),
      ]).then(([moduleSplit]) => {
        if (!vivant) return;
        const { SplitText } = moduleSplit;
        gsap.registerPlugin(SplitText);

        mm.add(
          {
            large: "(min-width: 900px)",
            anime: "(prefers-reduced-motion: no-preference)",
          },
          (contexte) => {
            const { large, anime } = contexte.conditions as {
              large: boolean;
              anime: boolean;
            };
            // Mouvement réduit : aucun état de départ n'est posé, donc rien
            // n'est caché. La page reste le même récit, immobile.
            if (!anime) return;

            const coupes: InstanceType<typeof SplitText>[] = [];

            /* La révélation ligne à ligne. tag: "span" et non "div" : une
               <div> dans un <p> est illégale côté analyseur HTML, et le
               masque est un clone de la ligne. aria: "none" : le texte
               accessible reste celui des nœuds descendants, et des <span>
               génériques ne le fragmentent pas — un aria-label posé sur un
               paragraphe serait, lui, interdit par ARIA. */
            const revelerLignes = (cible: HTMLElement | null, decalage = 0.085) => {
              if (!cible) return;
              const coupe = new SplitText(cible, {
                type: "lines",
                mask: "lines",
                tag: "span",
                aria: "none",
                linesClass: "recit-ligne",
              });
              coupes.push(coupe);
              gsap.from(coupe.lines, {
                yPercent: 112,
                duration: 1.05,
                stagger: decalage,
                // expo.out est le built-in le plus proche de --e1
                // cubic-bezier(.16, 1, .3, 1) : sortie longue, arrivée sèche.
                ease: "expo.out",
                scrollTrigger: {
                  trigger: cible,
                  start: "top 88%",
                  once: true,
                  invalidateOnRefresh: true,
                },
              });
            };

            const revelerBloc = (
              cibles: Array<HTMLElement | null>,
              decalage = 0.1,
            ) => {
              const reels = cibles.filter((c): c is HTMLElement => Boolean(c));
              if (!reels.length) return;
              gsap.from(reels, {
                opacity: 0,
                yPercent: 14,
                duration: 0.95,
                stagger: decalage,
                ease: "expo.out",
                scrollTrigger: {
                  trigger: reels[0],
                  start: "top 88%",
                  once: true,
                  invalidateOnRefresh: true,
                },
              });
            };

            /* La parallaxe de profondeur. Le plan déborde de 9 % de part et
               d'autre de son cadre (CSS) : l'amplitude reste sous ce seuil,
               sinon la course découvrirait le fond. Elle est mesurée, jamais
               spectaculaire — c'est le récit qui avance, pas l'effet. */
            const profondeur = (
              plan: HTMLElement | null,
              declencheur: Element | null,
              amplitude: number,
              bornes: { start: string; end: string } = {
                start: "top bottom",
                end: "bottom top",
              },
            ) => {
              if (!plan || !declencheur) return;
              gsap.fromTo(
                plan,
                { yPercent: -amplitude },
                {
                  yPercent: amplitude,
                  ease: "none",
                  scrollTrigger: {
                    trigger: declencheur,
                    start: bornes.start,
                    end: bornes.end,
                    scrub: 0.6,
                    invalidateOnRefresh: true,
                  },
                },
              );
            };

            const ampleur = large ? 6 : 4;

            // ── 00 · Ouverture ─────────────────────────────────────────────
            /* AUCUNE parallaxe sur l'ouverture, à aucune largeur. Le pendant
               CSS est `.ouvertureMedia .plan { inset: 0; height: 100% }`, lui
               aussi devenu inconditionnel : ni la source portrait du téléphone
               (crâne à 3,2 %) ni le poster 16/9 du bureau (crânes à 8,15 %)
               n'ont le mou qu'une course exige. Le jury du 19/08 a mesuré la
               bande visible à 13,63 % en 1280, 1440 et 1920 : les deux
               fondateurs étaient amputés du sommet du crâne. Les deux
               neutralisations vont ensemble, sinon la course découvre le
               fond. */

            // ── Les filets de chapitre ─────────────────────────────────────
            // Tracés pleins par défaut : sans JS le filet est là. GSAP les
            // redessine de gauche à droite à mesure que le chapitre se lit.
            tous(styles.filet).forEach((filet) => {
              const scene = filet.closest("section") ?? filet.parentElement;
              if (!scene) return;
              gsap.fromTo(
                filet,
                { scaleX: 0 },
                {
                  scaleX: 1,
                  ease: "none",
                  scrollTrigger: {
                    trigger: scene,
                    start: "top 76%",
                    end: "bottom 62%",
                    scrub: true,
                    invalidateOnRefresh: true,
                  },
                },
              );
            });

            // ── Le texte des chapitres ─────────────────────────────────────
            tous(styles.titreChapitre).forEach((titre) => revelerLignes(titre));
            tous(`${styles.corps} > p`).forEach((p) => revelerLignes(p, 0.06));
            revelerLignes(un(styles.titreDuo));
            revelerLignes(un(styles.duoDeclaration), 0.05);
            // La signature suit la citation, jamais l'inverse : c'est une
            // attribution, elle n'a de sens qu'après la phrase.
            revelerBloc([un(styles.duoSignature)], 0);

            // ── La lyre · la scène de parité ───────────────────────────────
            const scene = un(styles.duoScene);
            const portraits = tous(styles.portrait);
            if (scene && portraits.length) {
              // Les deux ensemble. Pas de stagger : c'est la contrainte.
              gsap.from(portraits, {
                opacity: 0,
                yPercent: 7,
                duration: 1.15,
                ease: "expo.out",
                scrollTrigger: {
                  trigger: scene,
                  start: "top 74%",
                  once: true,
                  invalidateOnRefresh: true,
                },
              });

              // PAS de parallaxe interne sur ces deux plans — retrait du
              // 18/08 sur retour client « il y a encore des moments où c'est
              // cropped ». Une parallaxe est un recadrage qui se déplace :
              // elle retire à la source, en haut comme en bas, la valeur de
              // son amplitude. Les deux portraits n'ont pas ce mou — sur
              // story-jeremy-retouched la bande utile va du haut du crâne
              // (2 %) au bas du boxer (100 %, déjà rogné par la source). La
              // course y coupait donc soit la tête, soit le produit.
              // Le pendant CSS est `.portrait .plan { inset: 0; height: 100% }`
              // dans Recit.module.css : les deux doivent rester solidaires,
              // sinon la course découvrirait le fond.
              // La profondeur reste sur l'ouverture et la matière, dont les
              // sources ont de la marge au-dessus et au-dessous du sujet.
            }

            // ── Le plan large, puis la matière ─────────────────────────────
            // Le plan large ne porte pas non plus de parallaxe : sa source
            // (campaign-duo-pourpre) est occupée de 1 % à 93 % par les deux
            // corps. Le cadre est passé à son ratio natif dans
            // Recit.module.css ; toute course rognerait de nouveau les têtes.

            const matiere = un(styles.matiereMedia);
            profondeur(
              matiere?.querySelector<HTMLElement>(`.${styles.plan}`) ?? null,
              matiere,
              ampleur,
            );

            const chiffres = un(styles.chiffres);
            if (chiffres) {
              gsap.from(Array.from(chiffres.children), {
                opacity: 0,
                yPercent: 34,
                duration: 0.95,
                stagger: 0.07,
                ease: "expo.out",
                scrollTrigger: {
                  trigger: chiffres,
                  start: "top 86%",
                  once: true,
                  invalidateOnRefresh: true,
                },
              });
            }

            revelerBloc(tous(`${styles.finitions} > li`), 0.08);

            // ── 04 · Clôture ───────────────────────────────────────────────
            // Le titre porte le métal : il se révèle en bloc, sans découpe.
            // Voir le commentaire de .clotureTitre dans Recit.module.css.
            revelerBloc([un(styles.clotureTitre), un(styles.clotureAction)], 0.14);

            return () => {
              coupes.forEach((coupe) => coupe.revert());
            };
          },
        );
      });

      return () => {
        vivant = false;
      };
    },
    // Au changement de langue le récit entier est remonté (clé sur
    // .recitCorps) : les scènes doivent être recâblées sur les nouveaux nœuds.
    [locale],
  );

  return (
    <main className={styles.recit} ref={racine}>
      <title>Notre histoire | AJ Luxury</title>
      <meta
        name="description"
        content="Jérémy et Alex, fondateurs d’AJ Luxury. Le véritable luxe commence par ce que l’on porte au plus près de soi."
      />

      <StoreHeader />

      <div className={styles.recitCorps} key={locale}>
        {/* ── 00 · Ouverture ──────────────────────────────────────────── */}
        <section className={styles.ouverture} aria-labelledby="recit-titre">
          <div className={styles.ouvertureMedia}>
            <div className={styles.plan}>
              {/* ── L'OUVERTURE REPART DE LA VRAIE PHOTOGRAPHIE — 22/08 ──
                  Cet écran servait encore les posters du hero v6, c'est-à-dire
                  les images composites qu'Adam a REFUSÉES le 21/08 : visages
                  déformés, décor kitsch. Elles avaient disparu de l'accueil
                  mais survivaient ici, sur la page qui présente les deux
                  fondateurs — l'endroit du site où un visage déformé est le
                  plus grave.

                  La source est la prise de studio validée, la même que celle
                  dont le premier écran découpe les corps. Le cadre reste
                  paysage au bureau et portrait sous 780 px, et l'ancrage HAUT
                  garantit les visages entiers dans les deux cas : ce qui sort
                  du cadre sort toujours par le bas. */}
              <img
                alt="AJ Luxury — Jérémy et Alex, prise de studio de la collection Apollon"
                className={styles.planMedia}
                src="/images/client/campaign-duo-lilas-seated.webp"
                width={1484}
                height={2229}
                style={{ objectPosition: "center top" }}
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <span aria-hidden="true" className={styles.grade} />
          </div>

          <span aria-hidden="true" className={styles.volet} />

          <div className={styles.ouvertureTexte}>
            <div className={styles.ouvertureBloc}>
              <p className={`${styles.surtitre} aj-label`}>AJ Luxury</p>
              <h1
                className={`${styles.titreOuverture} aj-display`}
                id="recit-titre"
              >
                <T id="story.title" />
              </h1>
              {/* Le lead appartient à cette page. Il servait jusqu'au 19/08
                  la clé home.apollonStatement, déjà lue sur l'accueil et sur
                  /shop : la même phrase ouvrait donc trois écrans. */}
              <p className={styles.lead}>
                <T id="story.lead" />
              </p>
            </div>

            <div className={styles.ouvertureBord}>
              {/* Un seul ordre de nomination, une seule clé : la conjonction doit
                  suivre la langue (« e » en italien, « and » en anglais). Trois
                  endroits de cette page l'écrivaient en dur, en français. */}
              <p className={`${styles.credit} aj-label`}>
                <T id="story.founders" />
              </p>
              <a className={styles.action} href="#recit-01">
                <span className={styles.actionTexte}>
                  <T id="hero.discover" />
                  <span aria-hidden="true" className={styles.actionFilet} />
                </span>
                <span aria-hidden="true" className={styles.fleche}>
                  ↓
                </span>
              </a>
            </div>
          </div>
        </section>

        {/* ── Le marbre · l'origine et l'objection ─────────────────────── */}
        <section
          className={styles.chapitre}
          aria-labelledby="recit-01-titre"
          id="recit-01"
        >
          <div className={styles.chapitreGrille}>
            <div className={styles.chapitreAncre}>
              <p className={`${styles.mouvement} aj-label`}>
                <T id="story.movementOrigin" />
              </p>
              <span aria-hidden="true" className={styles.filet} />
              <h2
                className={`${styles.titreChapitre} aj-display`}
                id="recit-01-titre"
              >
                <T id="story.originTitle" />
              </h2>
            </div>

            <div className={styles.corps}>
              <p>
                <T id="story.originP1" />
              </p>
              <p className={`${styles.punch} aj-display`}>
                <T id="story.originP2" />
              </p>
            </div>
          </div>
        </section>

        {/* ── La lyre · Jérémy et Alex, à parité stricte ───────────────── */}
        <section
          className={styles.duoScene}
          aria-labelledby="recit-02-titre"
          id="recit-02"
        >
          <div className={styles.duoCadre}>
            {/* Même grammaire que les deux autres têtes de chapitre : nom du
                mouvement, filet, titre. Avant le 19/08 cette tête était une
                ligne en space-between, avec le titre à gauche et l'index à
                droite — donc la seule des trois à ne pas suivre la règle. */}
            <div className={styles.duoTete}>
              <p className={`${styles.mouvement} aj-label`}>
                <T id="story.movementFounders" />
              </p>
              <span aria-hidden="true" className={styles.filet} />
              <h2
                className={`${styles.titreDuo} aj-display`}
                id="recit-02-titre"
              >
                <T id="story.founders" />
              </h2>
            </div>

            {/* L'ordre des deux cellules suit l'ordre de nomination retenu
                pour tout le site, « Jérémy et Alex » : le titre, la mention
                de l'ouverture et la grille disent désormais la même chose.
                La parité, elle, ne dépend pas de l'ordre — les deux cellules
                sont identiques et se révèlent simultanément. */}
            <div className={styles.duoGrille}>
              {/* LES DEUX PORTRAITS SONT LA RÉFÉRENCE NOMINATIVE DU SITE :
                  c'est le seul écran qui écrit un prénom SOUS un visage. Ils
                  disaient jusqu'ici Jérémy en Rose et Alex en Lilas, soit
                  l'inverse exact de ce que montrent la séquence guidée de
                  l'accueil, les cartes et les fiches. La page qui fait
                  autorité contredisait donc tout le reste.
                  Chacun porte désormais SON coloris — Jérémy le Lilas, Alex
                  le Pourpre — et les deux sources gardent le 1731x2600 des
                  cadres 2/3 : aucun rognage, aucun crâne coupé, la contrainte
                  qui avait déjà décapité ce duo le 18/08. */}
              <figure className={styles.portrait}>
                <div className={styles.plan}>
                  <Image
                    alt="AJ Luxury — Jérémy — Apollon Lilas Céleste"
                    className={styles.planImage}
                    fill
                    sizes="(max-width: 899px) 50vw, 44vw"
                    src="/images/client/editorial-lilas-chair.webp"
                  />
                </div>
                <figcaption className={`${styles.legende} aj-label`}>
                  Jérémy
                </figcaption>
              </figure>

              <figure className={styles.portrait}>
                <div className={styles.plan}>
                  <Image
                    alt="AJ Luxury — Alex — Apollon Pourpre Impérial"
                    className={styles.planImage}
                    fill
                    sizes="(max-width: 899px) 50vw, 44vw"
                    src="/images/client/hero-pourpre-model.webp"
                  />
                </div>
                <figcaption className={`${styles.legende} aj-label`}>
                  Alex
                </figcaption>
              </figure>
            </div>

            {/* La seule prise de parole directe du site, et le seul endroit
                où le double rôle fondateurs/mannequins est explicité. Elle
                remplace l'encart « à propos de nous » en deux phrases plates
                (story.peopleStatement, supprimée). Elle pose aussi Apollon
                comme le premier modèle : c'est une intention, jamais une
                disponibilité — aucun autre modèle n'est présenté comme
                achetable nulle part sur le site. */}
            <blockquote className={styles.duoCitation}>
              <p className={styles.duoDeclaration}>
                <T id="story.foundersQuote" />
              </p>
              <footer className={styles.duoSignature}>
                <T id="story.foundersSignature" />
              </footer>
            </blockquote>
          </div>
        </section>

        {/* Le plan large : les deux dans le même cadre, aucune découpe. */}
        <figure className={styles.duoPleine}>
          <div className={styles.plan}>
            <Image
              alt="AJ Luxury — Jérémy et Alex — Apollon Pourpre Impérial"
              className={styles.planImage}
              fill
              sizes="100vw"
              src="/images/client/campaign-duo-pourpre.webp"
            />
          </div>
          <span aria-hidden="true" className={styles.grade} />
          {/* Un seul ordre de nomination sur tout le site, « Jérémy et Alex ».
              Cette page en portait quatre à elle seule. */}
          <figcaption className={`${styles.legende} aj-label`}>
            <T id="story.founders" />
          </figcaption>
        </figure>

        {/* ── Le laurier · la matière ─────────────────────────────────── */}
        <section
          className={styles.matiere}
          aria-labelledby="recit-03-titre"
          id="recit-03"
        >
          <div className={styles.matiereMedia}>
            <div className={styles.plan}>
              <Image
                alt="Ceinture jacquard de 3,5 cm et plaque métal AJ Luxury, Apollon Pourpre Impérial"
                className={styles.planImage}
                fill
                sizes="(max-width: 859px) 100vw, 50vw"
                src="/images/client/product-pourpre-detail.webp"
              />
            </div>
          </div>

          <div className={styles.matiereTexte}>
            <div className={styles.matiereTete}>
              <p className={`${styles.mouvement} aj-label`}>
                <T id="story.movementMaterial" />
              </p>
              <span aria-hidden="true" className={styles.filet} />
              <h2
                className={`${styles.titreChapitre} aj-display`}
                id="recit-03-titre"
              >
                <T id="story.definitionTitle" />
              </h2>
            </div>

            {/* La composition est lue en une phrase par les lecteurs d'écran ;
                les quatre blocs visuels ne sont qu'une mise en page. */}
            <p className="aj-sr-only">
              <T id="product.feature.2" />
            </p>
            <p aria-hidden="true" className={styles.chiffres}>
              <span className={styles.chiffre}>94</span>
              <span className={`${styles.mesure} aj-label`}>
                <T id="home.materialModal" />
              </span>
              <span className={styles.chiffre}>6</span>
              <span className={`${styles.mesure} aj-label`}>
                <T id="home.materialElastane" />
              </span>
            </p>

            <div className={styles.corps}>
              <p>
                <T id="story.definitionP1" />
              </p>
              <p className={`${styles.punch} aj-display`}>
                <T id="story.definitionP2" />
              </p>
            </div>

            <ul className={styles.finitions}>
              <li className="aj-label">
                <T id="product.feature.5" />
              </li>
              <li className="aj-label">
                <T id="product.feature.6" />
              </li>
              <li className="aj-label">
                <T id="product.feature.3" />
              </li>
            </ul>
          </div>
        </section>

        {/* ── 04 · Clôture ────────────────────────────────────────────── */}
        <section className={styles.cloture} aria-labelledby="recit-04-titre">
          <div className={styles.clotureBloc}>
            <h2
              className={`${styles.clotureTitre} aj-display`}
              id="recit-04-titre"
            >
              <T id="story.quote" />
            </h2>

            <Link
              className={`${styles.action} ${styles.clotureAction} ${styles.actionDiscrete}`}
              href="/shop"
            >
              <span className={styles.actionTexte}>
                <T id="story.discoverCollection" />
                <span aria-hidden="true" className={styles.actionFilet} />
              </span>
              <span aria-hidden="true" className={styles.fleche}>
                →
              </span>
            </Link>
          </div>
        </section>
      </div>

      <StoreFooter />
    </main>
  );
}
