/* eslint-disable @next/next/no-img-element -- actifs client deja optimises et
   servis par le worker : aucun runtime d'image a charger. Meme regle que
   app/page.tsx et StoreHeader.tsx. */
"use client";

import type { CSSProperties } from "react";
import {
  HERO_FIGURES,
  HERO_FIGURES_RATIO,
  HERO_LOGO,
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
    // Deux plans, deux chambres : un seul tween pilote les deux a l'identique.
    const plans = q(`.${styles.plan}`);
    const scenes = q(`.${styles.scene}`);
    const mot = q(`.${styles.marqueBoite}`)[0];
    const eclat = q(`.${styles.marqueEclat}`)[0];
    const figures = q(`.${styles.figures}`)[0];
    const volet = q(`.${styles.volet}`)[0];
    if (!plans.length || !scenes.length || !mot || !eclat || !figures) return;

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
        /* On coupe le filet CSS AVANT de creer la timeline : les valeurs de
           depart des fromTo s'appliquent des la construction, et elles doivent
           s'appliquer derriere un volet encore ferme. */
        noeud.dataset.anime = "pret";

        const arrivee = gsap.timeline();

        arrivee
          // La caméra se détend d'un sur-cadrage serré vers le repos.
          .fromTo(
            scenes,
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

        /* Le volet part une fraction apres le debut : les valeurs de depart
           sont deja posees, l'a-coup de la prise en main est donc derriere
           lui. Il decouvre ensuite une scene deja en mouvement. */
        if (volet) {
          arrivee.to(
            volet,
            { scaleY: 0, duration: 1.15, ease: "power4.inOut" },
            0.06,
          );
        }

        /* ── LA BRILLANCE ───────────────────────────────────────────────
           Une lumière traverse le métal, lentement, en boucle. `repeatDelay`
           tient l'essentiel du cycle à l'arrêt : le mot est un objet de métal
           sous une lumière qui tourne, pas une enseigne qui clignote. */
        const brillance = gsap.fromTo(
          eclat,
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
        const derive = gsap.to(scenes, {
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
          arretDerive = veillerSurAnimation(scenes[0], derive);
        });

        /* ── LA CAMÉRA CONTINUE AU DÉFILEMENT ───────────────────────────
           Même appareil, même axe. Aucun pin : la page défile normalement,
           ce qui évite le piège de défilement sur téléphone et garde le
           retour arrière propre. */
        const defilement = gsap.timeline({
          scrollTrigger: {
            trigger: noeud,
            start: "top top",
            end: "bottom top",
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });

        defilement
          /* CHAQUE TWEEN PART D'UNE VALEUR ÉCRITE ET NE SE REND QU'AU PREMIER
             DÉFILEMENT. Sans cela, GSAP relève la valeur de départ à la
             CRÉATION du tween, c'est-à-dire en plein milieu de l'arrivée :
             mesuré, le retour en haut de page rendait la caméra à 1,13 et le
             mot à l'opacité 0 — le premier écran revenait VIDE. */
          .fromTo(
            plans,
            { scale: 1, yPercent: 0 },
            {
              scale: etroit ? 1.12 : 1.16,
              yPercent: -6,
              ease: "none",
              duration: 1,
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
              /* La copie sort sur le premier tiers : elle a dit ce qu'elle
                 avait a dire, et l'ecran doit se vider par etages. */
              duration: 0.34,
              immediateRender: false,
            },
            0,
          );

        /* ── LE MOT RENTRE À LA MAISON ──────────────────────────────────
           Demande d'Adam du 21/08 : en défilant, le mot-marque reprend sa
           place en haut à gauche. Ce n'est pas une sortie, c'est un
           ATTERRISSAGE — le grand nom du premier écran vient devenir le logo
           de la barre, et la barre ne porte donc jamais deux fois la marque.

           GÉOMÉTRIE, ET POURQUOI ELLE SE CALCULE SANS LIRE UNE SEULE MATRICE.
           Mesurer le mot avec getBoundingClientRect() donnerait sa boîte
           TRANSFORMÉE — or au moment du calcul il est en pleine arrivée. On
           remonte donc la chaîne des offsetParent, que les transformations
           n'affectent pas, pour obtenir sa position de mise en page ; `.hero`
           n'est lui-même jamais transformé, donc sa boîte sert d'origine.

           LE TERME DE DÉFILEMENT. Le mot vit dans le flux : pendant que la
           course avance, la page l'emmène vers le haut d'exactement une
           hauteur de hero. Pour qu'il ATTERRISSE sur le logo au lieu de le
           dépasser, il faut lui rendre cette hauteur — d'où le `+ hauteur`
           dans l'écart vertical. Sans ce terme, le mot sort par le haut.

           Tout est en valeurs-fonctions et `invalidateOnRefresh` : un
           redimensionnement, un changement de police ou une rotation
           recalculent la cible au lieu de la figer au premier rendu. */
        const logo = document.querySelector<HTMLElement>(
          '[data-aj-marque="entete"]',
        );

        const positionDeMiseEnPage = (element: HTMLElement) => {
          let x = 0;
          let y = 0;
          let noeudCourant: HTMLElement | null = element;
          while (noeudCourant && noeudCourant !== noeud) {
            x += noeudCourant.offsetLeft;
            y += noeudCourant.offsetTop;
            noeudCourant = noeudCourant.offsetParent as HTMLElement | null;
          }
          const cadre = noeud.getBoundingClientRect();
          return { x: cadre.left + x, y: cadre.top + y };
        };

        if (logo) {
          const motElement = mot as HTMLElement;
          const echelle = () =>
            logo.getBoundingClientRect().width / motElement.offsetWidth;
          const ecartX = () => {
            const depart = positionDeMiseEnPage(motElement);
            const cible = logo.getBoundingClientRect();
            return (
              cible.left +
              cible.width / 2 -
              (depart.x + motElement.offsetWidth / 2)
            );
          };
          const ecartY = () => {
            const depart = positionDeMiseEnPage(motElement);
            const cible = logo.getBoundingClientRect();
            return (
              cible.top +
              cible.height / 2 -
              (depart.y + motElement.offsetHeight / 2) +
              noeud.offsetHeight
            );
          };

          /* Le logo de la barre s'efface tant que le grand logo est a l'ecran :
             la marque n'est jamais ecrite deux fois en meme temps.
             Pose en DOM et non par gsap.set : GSAP n'ecrit une propriete
             personnalisee qu'au premier rendu du tween qui la porte, et le
             notre est en immediateRender: false — l'etat initial n'aurait donc
             jamais ete applique. Mesure : la variable restait vide au repos et
             la barre gardait son logo. */
          document.documentElement.style.setProperty(
            "--aj-marque-entete-opacite",
            "0",
          );

          defilement
            .fromTo(
              mot,
              { x: 0, y: 0, scale: 1 },
              {
                x: ecartX,
                y: ecartY,
                scale: echelle,
                ease: "none",
                /* DUREE EXPLICITE, ET C'EST UN CORRECTIF. Un tween sans duree
                   prend 0,5 s par defaut ; dans une timeline de course pilotee
                   au scrub, il ne couvrait donc que la MOITIE du defilement.
                   Releve image par image : le logo atteignait sa taille finale
                   des p=0,5 puis glissait a vide pendant tout le reste. Le vol
                   doit tenir toute la course, d'ou duration: 1. */
                duration: 1,
                immediateRender: false,
              },
              0,
            )
            /* Le relais se joue avant la fin, quand les deux marques sont deja
               superposees : on ne voit donc pas un fondu, on voit le logo
               devenir celui de la barre. Il se termine a 0,88 et non a 1 pour
               que la passation soit ACQUISE avant que la barre ne reprenne son
               droit de se derober. */
            .to(mot, { opacity: 0, ease: "none", duration: 0.22 }, 0.66)
            .to(
              document.documentElement,
              {
                "--aj-marque-entete-opacite": 1,
                ease: "none",
                duration: 0.22,
              },
              0.66,
            );
        }

        // Ni la dérive ni la brillance n'ont de raison de tourner hors champ :
        // le budget de composition revient aux écrans qui sont à l'image.
        const arretBrillance = veillerSurAnimation(eclat, brillance);
        return () => {
          arretDerive?.();
          arretBrillance();
          delete noeud.dataset.anime;
          // Sans cela, quitter l'accueil en cours de vol laisserait la barre
          // sans logo sur la page suivante.
          document.documentElement.style.removeProperty(
            "--aj-marque-entete-opacite",
          );
        };
      },
    );
  });

  return (
    <section
      ref={racine}
      className={styles.hero}
      data-hero-version={HERO_VERSION}
      /* Tant que ce premier écran est à l'image, la barre reste posée : le
         grand logo vient s'y poser au défilement. Contrat lu par
         StoreHeader.tsx. */
      data-aj-tete-seuil=""
      aria-labelledby="aj-hero-marque"
      style={
        {
          "--aj-hero-figures-ratio": String(HERO_FIGURES_RATIO),
        } as CSSProperties
      }
    >
      {/* Le métal et les corps sont deux PLANS frères, pilotés par la même
          caméra, et le mot-marque est intercalé entre eux. Il garde donc son
          occultation par les corps tout en restant libre de quitter la scène
          pour aller se poser dans la barre. Voir Hero.module.css, « DEUX PLANS
          FRÈRES ». */}
      <div className={styles.plan}>
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
            <DeferredMetallicField variant="reference" motion="normal" />
          </div>
        </div>
      </div>

      <h1 className={styles.marque} id="aj-hero-marque">
        <span className={styles.marqueBoite}>
          <img
            className={styles.marqueLogo}
            src={HERO_LOGO.src}
            srcSet={HERO_LOGO.srcSet}
            sizes={HERO_LOGO.sizes}
            alt="AJ Luxury"
            width={HERO_LOGO.largeur}
            height={HERO_LOGO.hauteur}
            /* PAS de fetchPriority high ici : le LCP de cet écran, ce sont les
               CORPS. Marquer le logo prioritaire faisait émettre par React un
               préchargement de l'actif 720 px, que le navigateur n'utilisait
               pas ensuite puisque le srcSet lui fait choisir le @2x — un
               avertissement de ressource préchargée et jamais servie, relevé
               au navigateur. Le logo reste par ailleurs derrière le volet
               pendant 1,2 s : il n'a aucune raison de disputer la priorité. */
            decoding="async"
            loading="eager"
          />
          <span className={styles.marqueEclat} aria-hidden="true" />
        </span>
      </h1>

      <div className={styles.plan}>
        <div className={styles.scene}>
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
