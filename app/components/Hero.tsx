/* eslint-disable @next/next/no-img-element -- actifs client deja optimises et
   servis par le worker : aucun runtime d'image a charger. Meme regle que
   app/page.tsx et StoreHeader.tsx. */
"use client";

import type { CSSProperties } from "react";
import {
  HERO_LOGO,
  HERO_PHOTO,
  HERO_PHOTO_RATIO,
  HERO_PORTRAIT_MEDIA,
  HERO_VERSION,
} from "../../lib/hero";
import { T } from "../../lib/i18n/TranslatedText";
import { useAjMotion } from "./useAjMotion";
import styles from "./Hero.module.css";

/* ==========================================================================
   Hero — le premier écran
   --------------------------------------------------------------------------
   Le mouvement en une phrase : la photographie de campagne se pose, le nom de
   la maison se lève par-dessus, puis la même caméra continue au défilement —
   ce n'est pas une entrée suivie d'un effet de scroll, c'est un seul
   mouvement d'appareil.

   Ce qui est animé : transform et opacity, rien d'autre. La seule propriété
   non transformée qui bouge est `background-position` sur le mot-marque, sur
   un unique élément de la page.

   REMPLACEMENT DU 22/08/2026. Cet écran superposait deux corps DÉCOUPÉS sur
   un champ de métal calculé en WebGL. Adam a rejeté cette scène. Elle est
   supprimée, pas atténuée : plus de canevas, plus de découpe, plus de second
   plan, plus de calque de métal. Ce qui est servi est la prise de vue de
   studio telle quelle, fond compris.

   TROIS GAINS DIRECTS, et ils ne sont pas théoriques. Plus aucun liseré de
   détourage dans les cheveux, défaut constaté à l'échelle 1:1. Plus de canevas
   WebGL sur le premier écran, donc le budget de composition revient à la page.
   Et la lumière des corps et celle du fond viennent enfin de la même prise de
   vue, ce qu'aucune composition ne pouvait garantir.

   LES CORPS NE SONT JAMAIS REDESSINÉS. La garantie tient toujours, et elle
   est même devenue plus forte : il n'y a plus de traitement du tout entre la
   photographie validée et l'écran.
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
    // Un plan, une chambre : la photographie et sa camera.
    const plans = q(`.${styles.plan}`);
    const scenes = q(`.${styles.scene}`);
    const mot = q(`.${styles.marqueBoite}`)[0];
    const eclat = q(`.${styles.marqueEclat}`)[0];
    const photo = q(`.${styles.photo}`)[0];
    const volet = q(`.${styles.volet}`)[0];
    if (!plans.length || !scenes.length || !mot || !eclat || !photo) return;

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
          /* La photographie se pose : elle monte de 14 px et s'ouvre. Pas de
             zoom d'entree — un agrandissement arbitraire sur une prise de vue
             de studio ne raconte rien et coute de la nettete. */
          .fromTo(
            photo,
            { y: 14, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.7, ease: "expo.out" },
            0.16,
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
            /* 0,25 et non 0,6. Adam, 22/08 : « le scroll n'est pas fluide ».
               Mesuré : 154 images par seconde PENDANT le défilement, et la
               barre comme son filet sont entièrement transparents. Ce n'était
               donc ni une chute de performance, ni un fond qui tranche le mot.

               C'est le lissage lui-même. À 0,6 l'animation traîne jusqu'à six
               dixièmes de seconde derrière le doigt : on pousse, le mot part
               en retard, puis rattrape tout seul. Cette dérive se lit comme un
               flottement, pas comme de la douceur — et sur un mouvement qui
               doit ATTERRIR au pixel, elle détruit la précision.

               0,25 garde de quoi absorber la molette crantée sans que le mot
               cesse de suivre la main. */
            scrub: 0.4,
            invalidateOnRefresh: true,
          },
        });

        defilement
          /* CHAQUE TWEEN PART D'UNE VALEUR ÉCRITE ET NE SE REND QU'AU PREMIER
             DÉFILEMENT. Sans cela, GSAP relève la valeur de départ à la
             CRÉATION du tween, c'est-à-dire en plein milieu de l'arrivée :
             mesuré, le retour en haut de page rendait la caméra à 1,13 et le
             mot à l'opacité 0 — le premier écran revenait VIDE. */
          /* AUCUNE DERIVE VERTICALE, ET C'EST UN CORRECTIF DU 22/08/2026.
             La composition precedente pouvait deriver : les corps etaient
             DECOUPES, donc rien ne pouvait laisser voir un bord. La
             photographie entiere, elle, tient exactement la hauteur du cadre
             — la faire monter de 6 % decouvrait une BANDE VIDE sous elle,
             constatee au navigateur a mi-course, bord de l'image a 469 px
             pour une fenetre de 900.

             Il ne reste donc que l'echelle. Elle ne peut jamais decouvrir un
             bord puisqu'elle ne fait que grandir, et un leger rapprochement
             au defilement se lit comme une camera qui avance — pas comme un
             parallaxe applique par-dessus. */
          .fromTo(
            plans,
            { scale: 1 },
            {
              scale: etroit ? 1.10 : 1.13,
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

          /* ── OÙ LE VOL SE TERMINE, ET POURQUOI PAS À LA FIN ─────────────
             Le vol s'achevait à p=1, c'est-à-dire au pixel exact où la barre
             commence à se dérober. Relevé au navigateur, scrub laissé se
             poser 1,5 s à chaque palier :

               p=0,67 → mot 372 px, logo 82 px, rapport 4,5, opacités 0,96/0,04
               p=0,75 → mot 298 px, rapport 3,6, opacités 0,58/0,42
               p=0,92 → mot 153 px, rapport 1,9, opacité du mot DÉJÀ NULLE
               p=1,00 → mot 82 px, rapport 1,0, mais invisible depuis longtemps

             Autrement dit l'atterrissage était géométriquement juste et
             PERSONNE NE LE VOYAIT : le mot s'évaporait encore deux fois trop
             gros pendant que la barre rallumait le sien derrière. D'où le
             dédoublement fantôme signalé par Adam le 22/08.

             Le vol se termine donc à 78 % de la course. À ce moment le mot est
             exactement à la taille et à la place du logo, et la barre tient
             encore : la passation a lieu sur deux marques réellement
             superposées, ce que le commentaire précédent affirmait à tort. */
          const FIN_DU_VOL = 0.88;
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
              /* Le terme de défilement suit le vol, il ne suit plus la course.
                 La page emmène le mot vers le haut proportionnellement au
                 défilement parcouru ; si le vol s'arrête à 78 %, elle ne l'a
                 emmené que de 78 % d'une hauteur de hero. Rendre la hauteur
                 ENTIÈRE ferait atterrir le mot 198 px trop haut. */
              FIN_DU_VOL * noeud.offsetHeight
            );
          };

          /* Le logo de la barre s'efface tant que le grand logo est a l'ecran :
             la marque n'est jamais ecrite deux fois en meme temps.

             UN SEUL MECANISME, ET C'EST UN CORRECTIF. La premiere version
             passait par une propriete personnalisee sur :root, lue par une
             regle CSS de la barre. Deux proprietaires pour une meme valeur :
             GSAP l'animait ET l'invalidait a chaque rafraichissement de
             ScrollTrigger. Mesure au navigateur : le style en ligne restait
             VIDE au repos, la barre gardait son logo, et la marque etait donc
             ecrite deux fois sur le premier ecran. On anime desormais
             l'opacite du logo lui-meme — une propriete ordinaire, un seul
             proprietaire. */
          gsap.set(logo, { opacity: 0 });

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
                   doit tenir la course jusqu'a son terme, voir FIN_DU_VOL. */
                duration: FIN_DU_VOL,
                immediateRender: false,
              },
              0,
            )
            /* LA PASSATION SE JOUE AU POSER, PAS AVANT. Elle demarre a
               FIN_DU_VOL, l'instant ou le mot occupe exactement la boite du
               logo : meme largeur, meme centre. Deux marques superposees au
               pixel, donc aucun fondu perceptible — on voit le grand nom
               DEVENIR le logo de la barre.

               LA DUREE EST COURTE, ET C'EST MESURE. Le vol termine, le mot
               reste dans le flux : la page continue de l'emporter vers le
               haut, d'un pixel par pixel defile. Toute duree de passation se
               paie donc en DERIVE.

               A 0,05 de course, relevé au navigateur : a mi-fondu le mot
               flottait 19 px au-dessus du logo, et finissait 45 px plus haut.
               Un fantome qui monte en s'effacant, c'est-a-dire une version
               attenuee du defaut que ce correctif supprime.

               A 0,02, soit environ 18 px, la derive a mi-fondu tombe sous
               10 px. Plus court encore, un ecran a faible frequence pourrait
               sauter la transition et faire clignoter la marque. */
            .to(mot, { opacity: 0, ease: "none", duration: 0.02 }, FIN_DU_VOL)
            .to(logo, { opacity: 1, ease: "none", duration: 0.02 }, FIN_DU_VOL);
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
          if (logo) gsap.set(logo, { clearProps: "opacity" });
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
          "--aj-hero-photo-ratio": String(HERO_PHOTO_RATIO),
        } as CSSProperties
      }
    >
      {/* ── LA PHOTOGRAPHIE, ENTIERE ───────────────────────────────────
          Remplacement demandé par Adam le 22/08/2026. La scène précédente
          superposait deux corps DÉTOURÉS sur un champ de métal calculé en
          WebGL. Elle est SUPPRIMÉE, pas atténuée : plus de canevas, plus de
          découpe, plus de second plan. Ce qui est servi est la prise de vue
          de studio telle quelle, fond compris.

          Un seul plan reste donc, et le mot-marque se pose PAR-DESSUS. La
          structure à deux plans frères n'a plus d'objet : elle existait pour
          intercaler le mot entre le métal et les corps découpés. */}
      <div className={styles.plan}>
        <div className={styles.scene}>
          <picture className={styles.photo}>
            <source
              type="image/webp"
              srcSet={`${HERO_PHOTO.webp760} 760w, ${HERO_PHOTO.webp1100} 1100w, ${HERO_PHOTO.webp1484} 1484w`}
              sizes="(max-aspect-ratio: 1/1) 100vw, 62vh"
            />
            <img
              src={HERO_PHOTO.webp1484}
              alt={HERO_PHOTO.alt}
              width={HERO_PHOTO.largeur}
              height={HERO_PHOTO.hauteur}
              decoding="sync"
              loading="eager"
              fetchPriority="high"
            />
          </picture>
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
            /* PAS de fetchPriority high ici : le LCP de cet écran, c'est la
               PHOTOGRAPHIE. Le logo reste derrière le volet le temps de
               l'ouverture, il n'a aucune raison de disputer la priorité. */
            decoding="async"
            loading="eager"
          />
          <span className={styles.marqueEclat} aria-hidden="true" />
        </span>
      </h1>

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
