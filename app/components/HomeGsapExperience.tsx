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
  const racine = useAjMotion<HTMLDivElement>(({ gsap, mm }) => {
    mm.add({ anime: "(prefers-reduced-motion: no-preference)" }, (contexte) => {
      const { anime } = contexte.conditions as { anime: boolean };
      // Mouvement réduit : rien n'est posé, donc rien n'est masqué. Le CSS
      // livre déjà la page entière, lisible et statique.
      if (!anime) return;

      // Les blocs révélés. L'état de départ est posé ICI, en JS : si ce
      // fichier ne s'exécute jamais, le contenu est déjà à sa place.
      const blocs = gsap.utils.toArray<HTMLElement>(".aj-reveal");
      blocs.forEach((bloc) => {
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
