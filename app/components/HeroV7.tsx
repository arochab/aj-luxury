"use client";

import type { CSSProperties } from "react";
import {
  HERO_MASTERS,
  HERO_PORTRAIT_MEDIA,
  HERO_VERSION,
  type HeroCalque,
  type HeroMaster,
} from "../../lib/hero-v7";
import { T } from "../../lib/i18n/TranslatedText";
import { useAjMotion } from "./useAjMotion";
import styles from "./HeroV7.module.css";

/* ==========================================================================
   HeroV7 — le premier écran
   --------------------------------------------------------------------------
   Le mouvement en une phrase : une salle de chrome s'éveille, la caméra se
   détend, le nom de la maison se lève DERRIÈRE les corps, puis la même caméra
   continue au défilement — ce n'est pas une entrée suivie d'un effet de
   scroll, c'est un seul mouvement d'appareil.

   Ce qui est animé : transform et opacity, rien d'autre. La seule propriété
   non transformée qui bouge est `background-position` sur le mot-marque, sur
   un unique élément de la page — la brillance du métal ne peut pas se faire
   autrement, et un élément isolé reste dans le budget de composition.
   ========================================================================== */

/** L'ordre des formats suit le poids MESURÉ de chaque actif, pas une
 *  préférence : sur une découpe très détourée, AVIF perd parfois contre WebP
 *  (paysage : 120 Ko contre 79). Le navigateur retient la première `<source>`
 *  qu'il sait lire — se tromper d'ordre coûte le surpoids à chaque visite. */
function ordreFormats(calque: HeroCalque, avifPlusLeger: boolean) {
  return avifPlusLeger
    ? ([
        ["avif", calque.avif],
        ["webp", calque.webp],
      ] as const)
    : ([
        ["webp", calque.webp],
        ["avif", calque.avif],
      ] as const);
}

/** Un calque = les deux masters (portrait et paysage) dans un seul <picture>.
 *  Les deux calques d'une même scène reçoivent des dimensions intrinsèques
 *  et un cadrage CSS identiques : leur recalage est donc exact par
 *  construction, à toute taille de fenêtre. */
function Calque({
  role,
  alt,
  priorite,
}: {
  role: "plate" | "figures";
  alt: string;
  priorite: boolean;
}) {
  const paysage = HERO_MASTERS.paysage;
  const portrait = HERO_MASTERS.portrait;

  // Mesures de scripts/build_hero_v7_assets.py, 21/08 :
  //   paysage plate   94 / 129  → AVIF gagne
  //   paysage figures 120 /  79 → WebP gagne
  //   portrait plate  63 /  89  → AVIF gagne
  //   portrait figures 83 / 108 → AVIF gagne
  const avifPaysage = role === "plate";
  const avifPortrait = true;

  return (
    <picture className={styles[role]}>
      {ordreFormats(portrait[role], avifPortrait).map(([format, src]) => (
        <source
          key={`portrait-${format}`}
          media={HERO_PORTRAIT_MEDIA}
          type={`image/${format}`}
          srcSet={src}
          width={portrait.largeur}
          height={portrait.hauteur}
        />
      ))}
      {ordreFormats(paysage[role], avifPaysage).map(([format, src]) => (
        <source
          key={`paysage-${format}`}
          type={`image/${format}`}
          srcSet={src}
          width={paysage.largeur}
          height={paysage.hauteur}
        />
      ))}
      <img
        src={paysage[role].webp}
        alt={alt}
        width={paysage.largeur}
        height={paysage.hauteur}
        decoding={priorite ? "sync" : "async"}
        loading="eager"
        fetchPriority={priorite ? "high" : "auto"}
      />
    </picture>
  );
}

/** Met une animation en veille dès qu'elle n'est plus à l'image, et quand
 *  l'onglet passe en arrière-plan. Les deux conditions sont retenues
 *  séparément : revenir sur l'onglet ne doit pas relancer une scène qui est
 *  hors champ. `gsap.context()` ne connaît ni IntersectionObserver ni les
 *  écouteurs de document — d'où le nettoyage explicite. */
function veillerSurAnimation(
  cible: Element,
  animation: { play: () => void; pause: () => void },
): () => void {
  let visible = true;
  let dansLeChamp = false;

  const arbitrer = () => {
    if (visible && dansLeChamp) animation.play();
    else animation.pause();
  };

  const observateur = new IntersectionObserver(
    ([entree]) => {
      dansLeChamp = Boolean(entree?.isIntersecting);
      arbitrer();
    },
    { threshold: 0 },
  );
  observateur.observe(cible);

  const surVisibilite = () => {
    visible = !document.hidden;
    arbitrer();
  };
  document.addEventListener("visibilitychange", surVisibilite);

  return () => {
    observateur.disconnect();
    document.removeEventListener("visibilitychange", surVisibilite);
  };
}

export default function HeroV7() {
  const paysage: HeroMaster = HERO_MASTERS.paysage;

  const racine = useAjMotion<HTMLElement>(({ gsap, mm, racine: noeud }) => {
    const q = gsap.utils.selector(noeud);
    const scene = q(`.${styles.scene}`)[0];
    const mot = q(`.${styles.marqueMot}`)[0];
    if (!scene || !mot) return;

    mm.add(
      {
        anime: "(prefers-reduced-motion: no-preference)",
        etroit: HERO_PORTRAIT_MEDIA,
      },
      (ctx) => {
        const { anime, etroit } = ctx.conditions as {
          anime: boolean;
          etroit: boolean;
        };
        if (!anime) return;

        /* ── L'ARRIVÉE ──────────────────────────────────────────────────
           Elle démarre pendant que le volet CSS finit de se lever : les deux
           gestes se recouvrent, l'écran n'a donc jamais l'air figé entre
           « couvert » et « animé ». */
        const arrivee = gsap.timeline({ delay: 0.12 });

        arrivee
          // La caméra se détend d'un sur-cadrage serré vers le repos. C'est
          // le seul mouvement que l'œil doit lire comme « on filme ».
          .fromTo(
            scene,
            { scale: etroit ? 1.10 : 1.13 },
            { scale: 1, duration: 2.6, ease: "expo.out" },
            0,
          )
          // Le mot se lève derrière les corps : il monte de sa propre hauteur,
          // il sort du sol de la salle, il n'apparaît pas.
          .fromTo(
            mot,
            { yPercent: 108, opacity: 0 },
            { yPercent: 0, opacity: 1, duration: 1.5, ease: "expo.out" },
            0.5,
          )
          .fromTo(
            q(`.${styles.ligne}`),
            { yPercent: 118 },
            { yPercent: 0, duration: 1.15, ease: "expo.out", stagger: 0.08 },
            0.86,
          )
          .fromTo(
            q(`.${styles.lien}`),
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.9, ease: "power2.out" },
            1.18,
          );

        /* ── LA BRILLANCE ───────────────────────────────────────────────
           Une lumière traverse le métal, lentement, en boucle. `repeatDelay`
           tient l'essentiel du cycle à l'arrêt : le mot est un objet de métal
           dans une salle éclairée, pas une enseigne qui clignote. */
        const brillance = gsap.fromTo(
          mot,
          { backgroundPositionX: "0%" },
          {
            backgroundPositionX: "100%",
            duration: 3.4,
            ease: "power1.inOut",
            repeat: -1,
            repeatDelay: 4.6,
          },
        );

        /* ── LA DÉRIVE ──────────────────────────────────────────────────
           2,5 % sur 18 secondes, aller-retour. Sous le seuil de perception
           consciente : on ne voit pas l'image bouger, on sent que la salle
           respire. C'est ce qui sépare « photo vivante » de « photo ». */
        const derive = gsap.to(scene, {
          scale: 1.03,
          duration: 18,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          paused: true,
        });
        arrivee.eventCallback("onComplete", () => derive.play());

        /* ── LA CAMÉRA CONTINUE AU DÉFILEMENT ───────────────────────────
           Même appareil, même axe : la scène poursuit sa poussée et s'élève
           pendant que le mot sort par le haut. Aucun pin — la page défile
           normalement, ce qui évite le piège de défilement sur téléphone et
           garde le retour arrière propre. */
        gsap
          .timeline({
            scrollTrigger: {
              trigger: noeud,
              start: "top top",
              end: "bottom top",
              scrub: 0.6,
              invalidateOnRefresh: true,
            },
          })
          .to(
            scene,
            { scale: etroit ? 1.12 : 1.16, yPercent: -6, ease: "none" },
            0,
          )
          .to(mot, { yPercent: -46, opacity: 0.12, ease: "none" }, 0)
          .to(
            q(`.${styles.copieBloc}, .${styles.lien}`),
            { yPercent: -60, opacity: 0, ease: "none", stagger: 0.04 },
            0,
          );

        // Ni la dérive ni la brillance n'ont de raison de tourner quand la
        // scène est sortie du champ : le budget de composition revient aux
        // écrans qui sont, eux, à l'image.
        const arretDerive = veillerSurAnimation(scene, derive);
        const arretBrillance = veillerSurAnimation(mot, brillance);
        return () => {
          arretDerive();
          arretBrillance();
        };
      },
    );
  });

  return (
    <section
      ref={racine}
      className={styles.hero}
      data-hero-version={HERO_VERSION}
      aria-labelledby="aj-hero-marque"
      style={{ "--aj-hero-lqip": `url("${paysage.lqip}")` } as CSSProperties}
    >
      <div className={styles.scene}>
        <Calque
          role="plate"
          alt="AJ Luxury — Jérémy et Alex portent le boxer Apollon Lilas Céleste dans une salle de chrome à colonnes."
          priorite
        />

        {/* Le mot-marque est le h1 : il porte le nom de la maison, une seule
            fois, à sa place logique dans la hiérarchie du document. */}
        <h1 className={styles.marque} id="aj-hero-marque">
          <span className={`aj-metal ${styles.marqueMot}`}>AJ Luxury</span>
        </h1>

        {/* Les corps, redécoupés du MÊME fichier. Leur seule fonction est
            d'occulter le mot : le texte alternatif appartient au calque du
            dessous, qui décrit déjà la scène entière — le répéter ici
            créerait une seconde description de la même photographie. */}
        <Calque role="figures" alt="" priorite={false} />
      </div>

      <div className={styles.voile} aria-hidden="true" />

      <div className={styles.copie}>
        <div className={styles.copieBloc}>
          <p className={styles.surtitre} lang="en">
            Reveal Your Inner Beauty
          </p>
          <p className={styles.enonce}>
            <span className={styles.ligneMasque}>
              <span className={styles.ligne}>
                <T id="home.apollonEyebrow" />
              </span>
            </span>
          </p>
        </div>

        <a className={styles.lien} href="#apollon">
          <span className={styles.lienMot}>
            <T id="hero.discover" />
          </span>
          <span className={styles.lienFleche} aria-hidden="true">
            ↓
          </span>
        </a>
      </div>

      <span className={styles.volet} aria-hidden="true" />
    </section>
  );
}
