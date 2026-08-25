"use client";

import type { ReactNode } from "react";
import { useAjMotion } from "./useAjMotion";
import styles from "./Accueil.module.css";

/* ==========================================================================
   Les scènes au scroll de l'accueil, hors #plaque (qui porte les siennes).
   --------------------------------------------------------------------------
   Ce composant enveloppe la page en `display: contents` : il ne produit
   aucune boîte, il ne fait qu'offrir une racine à gsap.context() pour que ses
   sélecteurs ne puissent pas déborder sur l'écran d'un autre agent.

   Ce qu'il ne fait PAS, volontairement : l'ouverture du film. Volet,
   sur-cadrage, montée de la signature et brillance sont des entrées de
   chargement — elles doivent démarrer au premier paint. GSAP arrive par
   import dynamique, donc toujours après ce paint : les piloter d'ici
   donnerait un flash « visible → recouvert → révélé ». Elles sont donc en
   @keyframes dans Accueil.module.css, en transform et opacity uniquement.
   Le scroll reste la seule horloge de tout ce qui est piloté par le scroll.
   ========================================================================== */

export default function HomeGsapExperience({ children }: { children: ReactNode }) {
  const racine = useAjMotion<HTMLDivElement>(({ gsap, racine: noeud, mm }) => {
    mm.add({ anime: "(prefers-reduced-motion: no-preference)" }, (contexte) => {
      const { anime } = contexte.conditions as { anime: boolean };
      // Mouvement réduit : rien n'est posé, donc rien n'est masqué. Le CSS
      // livre déjà la page entière, lisible et statique.
      if (!anime) return;

      /*
       * Les blocs révélés. L'état de départ est posé ICI, en JS : si ce
       * fichier ne s'exécute jamais, le contenu est déjà à sa place.
       *
       * Le garde-fou above-fold, repris de AjScrollReveal : GSAP arrive par
       * import dynamique, donc au moment où ce réglage s'exécute la page est
       * DÉJÀ peinte. Un `gsap.from` rend son état de départ immédiatement,
       * et un ScrollTrigger dont le start est déjà franchi se déclenche au
       * premier refresh : un bloc visible serait masqué puis re-révélé —
       * un clignotement. On ne pose donc l'état de départ que sur ce qui est
       * encore sous la ligne de flottaison ; le reste est laissé tel qu'il a
       * été peint. Le seuil est le même que celui du start, 92 %.
       *
       * La requête est bornée au nœud du hook : `gsap.utils.toArray` ne
       * connaît pas le scope de gsap.context() et balayait tout le document.
       */
      const seuil = window.innerHeight * 0.92;
      const blocs = Array.from(
        noeud.querySelectorAll<HTMLElement>(".aj-reveal"),
      ).filter((bloc) => bloc.getBoundingClientRect().top > seuil);

      blocs.forEach((bloc) => {
        // Le rang se lit sur le groupe COMPLET du parent, filtre compris :
        // le décalage d'un bloc ne doit pas dépendre du nombre de ses voisins
        // qui se trouvaient déjà à l'écran au chargement.
        const groupe = Array.from(
          bloc.parentElement?.querySelectorAll<HTMLElement>(".aj-reveal") ?? [],
        );
        const rang = Math.max(0, groupe.indexOf(bloc));
        gsap.from(bloc, {
          opacity: 0,
          y: 26,
          duration: 0.75,
          delay: rang * 0.1,
          // expo.out est le plus proche built-in de --e1 :
          // cubic-bezier(.16, 1, .3, 1). Sortie longue, arrivée sans rebond.
          ease: "expo.out",
          scrollTrigger: {
            trigger: bloc,
            start: "top 88%",
            once: true,
            invalidateOnRefresh: true,
          },
        });
      });

      // Le parallaxe de #matiere. Le débord de 6 % de part et d'autre est
      // posé en CSS : la course de ±4 % ne peut donc jamais découvrir le fond.
      gsap.utils
        .toArray<HTMLElement>(`.${styles.matiereCadre} img`)
        .forEach((image) => {
          gsap.fromTo(
            image,
            { yPercent: -4 },
            {
              yPercent: 4,
              ease: "none",
              scrollTrigger: {
                trigger: image.parentElement ?? image,
                start: "top bottom",
                end: "bottom top",
                scrub: 0.6,
                invalidateOnRefresh: true,
              },
            },
          );
        });

      // Les trois cartes de coloris montent en décalé sur l'approche.
      const cartes = gsap.utils.toArray<HTMLElement>(`.${styles.carte}`);
      if (cartes.length) {
        gsap.from(cartes, {
          opacity: 0,
          yPercent: 6,
          duration: 1.05,
          stagger: 0.12,
          ease: "expo.out",
          scrollTrigger: {
            trigger: `.${styles.colorisGrille}`,
            start: "top 84%",
            once: true,
            invalidateOnRefresh: true,
          },
        });
      }
    });
  });

  return (
    <div ref={racine} className={styles.scenes}>
      {children}
    </div>
  );
}
