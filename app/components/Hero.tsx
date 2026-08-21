"use client";

import type { CSSProperties } from "react";
import {
  HERO_FIGURES,
  HERO_FIGURES_RATIO,
  HERO_PORTRAIT_MEDIA,
  HERO_VERSION,
} from "../../lib/hero";
import DeferredMetallicField from "./DeferredMetallicField";
import { T } from "../../lib/i18n/TranslatedText";
import { useAjMotion } from "./useAjMotion";
import styles from "./Hero.module.css";

/* ==========================================================================
   Hero — le premier écran
   --------------------------------------------------------------------------
   Le mouvement en une phrase : un champ de métal s'éveille, la caméra se
   détend, le nom de la maison se lève DERRIÈRE les corps, puis la même caméra
   continue au défilement — ce n'est pas une entrée suivie d'un effet de
   scroll, c'est un seul mouvement d'appareil.

   Ce qui est animé : transform et opacity, rien d'autre. La seule propriété
   non transformée qui bouge est `background-position` sur le mot-marque, sur
   un unique élément de la page.

   LES CORPS NE SONT JAMAIS REDESSINÉS. C'est la garantie d'architecture de
   cet écran, et elle est structurelle, pas déclarative : les pixels des deux
   modèles sortent de la photographie validée et sont posés PAR-DESSUS tout ce
   qui bouge. Un générateur ne se trouve nulle part sur ce chemin.
   ========================================================================== */

/** Met une animation en veille dès qu'elle n'est plus à l'image, et quand
 *  l'onglet passe en arrière-plan. Les deux conditions sont retenues
 *  séparément : revenir sur l'onglet ne doit pas relancer une scène hors
 *  champ. `gsap.context()` ne connaît ni IntersectionObserver ni les écouteurs
 *  de document — d'où le nettoyage explicite. */
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

export default function Hero() {
  const racine = useAjMotion<HTMLElement>(({ gsap, mm, racine: noeud }) => {
    const q = gsap.utils.selector(noeud);
    const camera = q(`.${styles.camera}`)[0];
    const scene = q(`.${styles.scene}`)[0];
    const mot = q(`.${styles.marqueMot}`)[0];
    const figures = q(`.${styles.figures}`)[0];
    if (!camera || !scene || !mot || !figures) return;

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
          // La caméra se détend d'un sur-cadrage serré vers le repos.
          .fromTo(
            scene,
            { scale: etroit ? 1.1 : 1.13 },
            { scale: 1, duration: 2.6, ease: "expo.out" },
            0,
          )
          // Les corps entrent les derniers et de très peu : ils sont le sujet,
          // ils n'ont pas à faire d'effet. 18 px de montée suffisent à les
          // faire se poser plutôt qu'apparaître.
          .fromTo(
            figures,
            { y: 18, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.6, ease: "expo.out" },
            0.18,
          )
          // Le mot se lève DERRIÈRE eux : il monte de sa propre hauteur, il
          // sort du sol, il n'apparaît pas.
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
           sous une lumière qui tourne, pas une enseigne qui clignote. */
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
           3 % sur 18 secondes, aller-retour. Sous le seuil de perception
           consciente : on ne voit pas l'image bouger, on sent que le plan
           respire. */
        const derive = gsap.to(scene, {
          scale: 1.03,
          duration: 18,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          paused: true,
        });

        /* La dérive partage `scene` avec l'arrivée. Deux tweens sur la même
           propriété du même nœud se disputent le rendu : elles ne doivent
           donc jamais se recouvrir. La dérive ne naît qu'au terme de
           l'arrivée, où elle lit enfin sa valeur de départ, l'échelle 1. */
        let arretDerive: (() => void) | undefined;
        arrivee.eventCallback("onComplete", () => {
          derive.play();
          arretDerive = veillerSurAnimation(scene, derive);
        });

        /* ── LA CAMÉRA CONTINUE AU DÉFILEMENT ───────────────────────────
           Même appareil, même axe. Aucun pin : la page défile normalement,
           ce qui évite le piège de défilement sur téléphone et garde le
           retour arrière propre. */
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
          /* CHAQUE TWEEN PART D'UNE VALEUR ÉCRITE ET NE SE REND QU'AU PREMIER
             DÉFILEMENT. Sans cela, GSAP relève la valeur de départ à la
             CRÉATION du tween, c'est-à-dire en plein milieu de l'arrivée :
             mesuré, le retour en haut de page rendait la caméra à 1,13 et le
             mot à l'opacité 0 — le premier écran revenait VIDE. */
          .fromTo(
            camera,
            { scale: 1, yPercent: 0 },
            {
              scale: etroit ? 1.12 : 1.16,
              yPercent: -6,
              ease: "none",
              immediateRender: false,
            },
            0,
          )
          .fromTo(
            mot,
            { yPercent: 0, opacity: 1 },
            {
              yPercent: -46,
              opacity: 0.12,
              ease: "none",
              immediateRender: false,
            },
            0,
          )
          .fromTo(
            q(`.${styles.copieBloc}, .${styles.lien}`),
            { yPercent: 0, opacity: 1 },
            {
              yPercent: -60,
              opacity: 0,
              ease: "none",
              stagger: 0.04,
              immediateRender: false,
            },
            0,
          );

        // Ni la dérive ni la brillance n'ont de raison de tourner hors champ :
        // le budget de composition revient aux écrans qui sont à l'image.
        const arretBrillance = veillerSurAnimation(mot, brillance);
        return () => {
          arretDerive?.();
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
      style={
        {
          "--aj-hero-figures-ratio": String(HERO_FIGURES_RATIO),
        } as CSSProperties
      }
    >
      <div className={styles.camera}>
        <div className={styles.scene}>
          {/* ── LE MÉTAL LIQUIDE ─────────────────────────────────────────
              Le monde, pas un décor. Plein cadre, calculé au navigateur,
              donc net à toute taille et à tout DPR — c'est ce qui supprime
              le plafond de résolution que la photographie de fond imposait.
              Le composant est celui déjà écrit pour ce rôle : montage
              différé à l'intersection donc hors du chemin du LCP, 30 i/s au
              plafond, repli en dégradé CSS sans WebGL, arrêt complet en
              mouvement réduit. */}
          <div className={styles.metal} aria-hidden="true">
            <DeferredMetallicField variant="reference" motion="slow" />
          </div>

          <h1 className={styles.marque} id="aj-hero-marque">
            <span className={`aj-metal ${styles.marqueMot}`}>AJ Luxury</span>
          </h1>

          {/* Les deux corps, socle noir compris. Un seul actif pour toutes
              les tailles d'écran : c'est un sujet, pas une scène — on ne le
              recadre pas, on le place. */}
          <picture className={styles.figures}>
            <source type="image/avif" srcSet={HERO_FIGURES.avif} />
            <source type="image/webp" srcSet={HERO_FIGURES.webp} />
            <img
              src={HERO_FIGURES.webp}
              alt={HERO_FIGURES.alt}
              width={HERO_FIGURES.largeur}
              height={HERO_FIGURES.hauteur}
              decoding="sync"
              loading="eager"
              fetchPriority="high"
            />
          </picture>
        </div>
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
