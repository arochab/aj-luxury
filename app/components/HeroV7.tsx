"use client";

import type { CSSProperties } from "react";
import {
  HERO_MASTERS,
  HERO_PORTRAIT_MEDIA,
  HERO_VERSION,
  type HeroMaster,
} from "../../lib/hero-v7";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useAjMotion } from "./useAjMotion";
import styles from "./HeroV7.module.css";

/* ==========================================================================
   HeroV7 — le premier écran
   --------------------------------------------------------------------------
   Le mouvement en une phrase : une salle de chrome s'éveille, la caméra se
   détend, le nom de la maison se lève DERRIÈRE les corps, puis la même caméra
   continue au défilement — ce n'est pas un effet d'entrée suivi d'un effet de
   scroll, c'est un seul mouvement d'appareil.

   Ce qui est animé : transform et opacity, rien d'autre. Aucune couleur,
   aucun filtre, aucune géométrie recalculée en continu — la seule propriété
   non transformée qui bouge est `background-position` sur le mot-marque, sur
   un élément unique de la page, ce qui reste dans le budget de composition.
   ========================================================================== */

/** Une paire <source>/<img> pour un calque. Les deux calques d'un même master
 *  reçoivent des attributs de cadrage identiques : c'est le CSS qui l'impose,
 *  mais les dimensions intrinsèques doivent l'être aussi, sinon le navigateur
 *  ne calcule pas le même `cover`. */
function Calque({
  master,
  portrait,
  role,
  alt,
  priorite,
}: {
  master: HeroMaster;
  portrait: HeroMaster;
  role: "plate" | "figures";
  alt: string;
  priorite: boolean;
}) {
  const paysageCalque = master[role];
  const portraitCalque = portrait[role];
  // L'ordre des <source> suit le poids MESURÉ de chaque actif, pas une
  // préférence de format : voir lib/hero-v7.ts, calque `figures`.
  const ordre =
    role === "figures" && master === HERO_MASTERS.paysage
      ? (["webp", "avif"] as const)
      : (["avif", "webp"] as const);

  return (
    <picture className={styles[role]}>
      {ordre.map((format) => (
        <source
          key={`portrait-${format}`}
          media={HERO_PORTRAIT_MEDIA}
          type={`image/${format}`}
          srcSet={portraitCalque[format]}
          width={portrait.largeur}
          height={portrait.hauteur}
        />
      ))}
      {ordre.map((format) => (
        <source
          key={`paysage-${format}`}
          type={`image/${format}`}
          srcSet={paysageCalque[format]}
          width={master.largeur}
          height={master.hauteur}
        />
      ))}
      <img
        src={paysageCalque.webp}
        alt={alt}
        width={master.largeur}
        height={master.hauteur}
        decoding={priorite ? "sync" : "async"}
        loading="eager"
        fetchPriority={priorite ? "high" : "auto"}
      />
    </picture>
  );
}

export default function HeroV7() {
  const { t } = useI18n();
  const paysage = HERO_MASTERS.paysage;
  const portrait = HERO_MASTERS.portrait;

  const racine = useAjMotion<HTMLElement>(({ gsap, mm, racine: noeud }) => {
    const q = gsap.utils.selector(noeud);
    const scene = q(`.${styles.scene}`)[0];
    const mot = q(`.${styles.marqueMot}`)[0];
    if (!scene || !mot) return;

    mm.add(
      {
        anime: "(prefers-reduced-motion: no-preference)",
        etroit: `${HERO_PORTRAIT_MEDIA}`,
      },
      (ctx) => {
        const { anime, etroit } = ctx.conditions as {
          anime: boolean;
          etroit: boolean;
        };
        if (!anime) return;

        /* ── L'ARRIVÉE ──────────────────────────────────────────────────
           Elle démarre pendant que le volet CSS finit de se lever : les deux
           gestes se recouvrent, donc l'écran n'a jamais l'air figé entre
           « couvert » et « animé ». */
        const arrivee = gsap.timeline({ delay: 0.12 });

        arrivee
          // La caméra se détend depuis un sur-cadrage plus serré vers le
          // repos. C'est le seul mouvement que l'œil doit percevoir comme
          // « on est en train de filmer ».
          .fromTo(
            scene,
            { scale: etroit ? 1.11 : 1.14 },
            { scale: 1.04, duration: 2.6, ease: "expo.out" },
            0,
          )
          // Le mot se lève derrière les corps. Il monte de sa propre hauteur :
          // il sort du sol de la salle, il n'apparaît pas.
          .fromTo(
            mot,
            { yPercent: 108, opacity: 0 },
            {
              yPercent: 0,
              opacity: 1,
              duration: 1.5,
              ease: "expo.out",
            },
            0.5,
          )
          .fromTo(
            q(`.${styles.ligne}`),
            { yPercent: 118 },
            {
              yPercent: 0,
              duration: 1.15,
              ease: "expo.out",
              stagger: 0.08,
            },
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
        gsap.fromTo(
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
          scale: 1.065,
          duration: 18,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          paused: true,
        });
        arrivee.eventCallback("onComplete", () => derive.play());

        /* ── LA CAMÉRA CONTINUE AU DÉFILEMENT ───────────────────────────
           Même appareil, même axe : la scène poursuit sa poussée et s'élève
           pendant que le mot sort par le haut. La copie part la première, le
           mot ensuite, l'image en dernier — un plan qui se vide par étages.
           Aucun pin : la page défile normalement, ce qui évite le piège de
           défilement sur téléphone et garde le retour arrière propre. */
        const scrollTween = gsap.timeline({
          scrollTrigger: {
            trigger: noeud,
            start: "top top",
            end: "bottom top",
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });

        scrollTween
          .to(
            scene,
            {
              scale: etroit ? 1.12 : 1.16,
              yPercent: -6,
              ease: "none",
            },
            0,
          )
          .to(
            mot,
            { yPercent: -46, opacity: 0.12, ease: "none" },
            0,
          )
          .to(
            q(`.${styles.copieBloc}, .${styles.lien}`),
            { yPercent: -60, opacity: 0, ease: "none", stagger: 0.04 },
            0,
          );

        // La dérive n'a aucune raison de tourner quand la scène est sortie du
        // champ : la mettre en pause rend le budget de composition aux écrans
        // qui sont, eux, à l'image.
        const veille = ScrollTriggerVeille(scene, derive);
        return () => veille();
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
          master={paysage}
          portrait={portrait}
          role="plate"
          alt="AJ Luxury — Jérémy et Alex portent le boxer Apollon Lilas Céleste dans une salle de chrome à colonnes."
          priorite
        />

        {/* Le mot-marque est le h1 : il porte le nom de la maison, une seule
            fois, à sa place logique dans la hiérarchie du document. */}
        <h1 className={styles.marque} id="aj-hero-marque">
          <span className={`aj-metal ${styles.marqueMot}`}>AJ Luxury</span>
        </h1>

        {/* Les corps, redécoupés du MÊME fichier : leur seule fonction est
            d'occulter le mot. Le texte alternatif appartient au calque du
            dessous, qui décrit déjà la scène entière — répéter ici créerait
            une seconde description de la même photographie. */}
        <Calque
          master={paysage}
          portrait={portrait}
          role="figures"
          alt=""
          priorite={false}
        />
      </div>

      <div className={styles.voile} aria-hidden="true" />

      <div className={styles.copie}>
        <div className={styles.copieBloc}>
          <p className={styles.surtitre} lang="en">
            Reveal Your Inner Beauty
          </p>
          <p className={styles.enonce}>
            <span className={styles.ligneMasque}>
              <span className={styles.ligne}>{t("home.apollonEyebrow")}</span>
            </span>
          </p>
        </div>

        <a className={styles.lien} href="#apollon">
          <span className={styles.lienMot}>{t("hero.discover")}</span>
          <span className={styles.lienFleche} aria-hidden="true">
            ↓
          </span>
        </a>
      </div>

      <span className={styles.volet} aria-hidden="true" />
    </section>
  );
}

/** Met la dérive en pause quand la scène quitte le champ, et quand l'onglet
 *  passe en arrière-plan. Retourne son propre nettoyage : `gsap.context()` ne
 *  connaît ni IntersectionObserver ni les écouteurs de document. */
function ScrollTriggerVeille(
  scene: Element,
  derive: gsap.core.Tween,
): () => void {
  const observateur = new IntersectionObserver(
    ([entree]) => {
      if (!entree) return;
      if (entree.isIntersecting) derive.play();
      else derive.pause();
    },
    { threshold: 0 },
  );
  observateur.observe(scene);

  const surVisibilite = () => {
    if (document.hidden) derive.pause();
    else if (derive.scrollTrigger?.isActive !== false) derive.play();
  };
  document.addEventListener("visibilitychange", surVisibilite);

  return () => {
    observateur.disconnect();
    document.removeEventListener("visibilitychange", surVisibilite);
  };
}
