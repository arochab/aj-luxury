"use client";

import { useEffect, useRef, type DependencyList, type RefObject } from "react";

/* ==========================================================================
   useAjMotion — le socle d'animation partagé par tous les écrans AJ Luxury
   --------------------------------------------------------------------------
   Ce que le hook prend en charge, pour que personne n'ait à le réécrire :
     • le chargement différé de gsap et ScrollTrigger (import dynamique : GSAP
       reste hors du bundle initial, comme dans HomeGsapExperience) ;
     • l'enregistrement du plugin ;
     • un gsap.context() scopé sur TA racine — un sélecteur passé à gsap ne
       peut donc pas déborder sur l'écran d'un autre agent ;
     • un gsap.matchMedia() prêt à l'emploi ;
     • la révocation complète au démontage, dans le bon ordre ;
     • un unique ScrollTrigger.refresh() une fois les polices posées : Manrope
       est variable, ses métriques changent à l'arrivée du woff2 et toutes les
       mesures faites avant seraient fausses.

   Doctrine, rappelée ici parce qu'aucun hook ne peut la faire respecter :
     • le scroll est la seule horloge — pas de setTimeout, pas d'auto-avance ;
     • on n'anime QUE transform et opacity ;
     • une scène épinglée s'épingle sur un wrapper, jamais sur le nœud animé ;
     • scrub + invalidateOnRefresh sur tout ce qui est lié au scroll ;
     • mouvement réduit = variante statique lisible, jamais une page vide.

   --------------------------------------------------------------------------
   USAGE

     "use client";
     import { useAjMotion } from "@/app/components/useAjMotion";

     export default function MonEcran() {
       const racine = useAjMotion(({ gsap, mm }) => {
         mm.add(
           {
             large: "(min-width: 900px)",
             etroit: "(max-width: 899px)",
             anime: "(prefers-reduced-motion: no-preference)",
           },
           (ctx) => {
             const { large, anime } = ctx.conditions as {
               large: boolean;
               etroit: boolean;
               anime: boolean;
             };
             if (!anime) return; // rien à animer : le CSS livre déjà l'état lisible

             gsap.to(".mon-rail", {
               xPercent: large ? -66.6666 : -50,
               ease: "none",
               scrollTrigger: {
                 trigger: ".mon-wrapper",
                 start: "top top",
                 end: "bottom bottom",
                 scrub: true,
                 invalidateOnRefresh: true,
               },
             });
           },
         );
       });

       return <section ref={racine}>…</section>;
     }

   Le tableau de dépendances est optionnel et vaut [] par défaut : le réglage
   ne rejoue donc qu'au montage. La fonction de réglage peut être réécrite à
   chaque rendu sans rien relancer — c'est toujours la dernière version qui
   est appelée.

   Si le réglage crée quelque chose que gsap.context() ne sait pas défaire —
   un SplitText, un IntersectionObserver, un addEventListener — il retourne sa
   propre fonction de nettoyage. Elle est appelée en premier au démontage.
   ========================================================================== */

type Gsap = (typeof import("gsap"))["default"];
type ScrollTriggerStatique = (typeof import("gsap/ScrollTrigger"))["ScrollTrigger"];

export interface AjMotionOutils {
  /** L'instance gsap, plugin ScrollTrigger déjà enregistré. */
  gsap: Gsap;
  /** ScrollTrigger, pour les appels statiques : create, refresh, getAll… */
  ScrollTrigger: ScrollTriggerStatique;
  /** Le nœud porteur du ref retourné. Les sélecteurs gsap y sont déjà scopés. */
  racine: HTMLElement;
  /** Le contexte gsap actif, si tu dois y ajouter quelque chose à la main. */
  contexte: ReturnType<Gsap["context"]>;
  /** matchMedia géré par le hook : desktop / mobile / mouvement réduit. */
  mm: ReturnType<Gsap["matchMedia"]>;
  /**
   * Instantané de prefers-reduced-motion au montage. Pratique pour une
   * décision unique ; pour une scène qui doit réagir à un changement de
   * réglage en cours de session, passer par `mm`.
   */
  reduit: boolean;
}

/** Reçoit les outils, câble la scène, retourne éventuellement son nettoyage. */
export type AjMotionReglage = (outils: AjMotionOutils) => void | (() => void);

/**
 * Un seul refresh par chargement de page, quel que soit le nombre d'écrans
 * montés. Les cinq hooks se partagent cette promesse.
 */
let refreshPolices: Promise<void> | null = null;

function rafraichirApresPolices(ScrollTrigger: ScrollTriggerStatique): void {
  if (refreshPolices) return;
  const pretes: Promise<unknown> =
    typeof document !== "undefined" && document.fonts
      ? document.fonts.ready
      : Promise.resolve();
  refreshPolices = pretes.then(() => {
    ScrollTrigger.refresh();
  });
}

/**
 * @param reglage  Câblage de la scène. Appelé une fois montée, à l'intérieur
 *                 du gsap.context() scopé sur la racine.
 * @param deps     Dépendances qui doivent rejouer le réglage. [] par défaut.
 * @returns        Le ref à poser sur l'élément racine de l'écran.
 *
 * Le paramètre de type suit l'élément porteur : `HTMLElement` couvre
 * `<section>`, `<header>`, `<main>`, `<article>` ; pour un `<div>`, écrire
 * `useAjMotion<HTMLDivElement>(…)`.
 */
export function useAjMotion<T extends HTMLElement = HTMLElement>(
  reglage: AjMotionReglage,
  deps: DependencyList = [],
): RefObject<T | null> {
  const racine = useRef<T>(null);
  const reglageRef = useRef(reglage);

  // Déclaré AVANT l'effet principal : à chaque rendu la référence pointe sur
  // la dernière version du réglage, sans que son identité ne soit une raison
  // de rejouer la scène.
  useEffect(() => {
    reglageRef.current = reglage;
  });

  useEffect(() => {
    const noeud = racine.current;
    if (!noeud) return;

    let annule = false;
    let nettoyer: (() => void) | undefined;

    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([moduleGsap, moduleScrollTrigger]) => {
        // Démontage pendant le chargement : ne rien créer, il n'y aurait plus
        // personne pour le défaire.
        if (annule) return;

        const gsap = moduleGsap.default;
        const { ScrollTrigger } = moduleScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);

        const mm = gsap.matchMedia();
        const reduit =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        let nettoyageDuReglage: void | (() => void);

        // Le contexte se reçoit en paramètre (`self`) et non par la constante
        // qu'on est en train d'affecter : celle-ci n'existe pas encore quand
        // GSAP exécute la fonction, qui est appelée pendant la construction.
        const contexte = gsap.context((self) => {
          nettoyageDuReglage = reglageRef.current({
            gsap,
            ScrollTrigger,
            racine: noeud,
            contexte: self,
            mm,
            reduit,
          });
        }, noeud);

        rafraichirApresPolices(ScrollTrigger);

        // Ordre imposé : d'abord ce que le réglage a créé hors GSAP, puis les
        // branches matchMedia, puis le contexte. L'inverse laisserait des
        // ScrollTrigger orphelins accrochés à des nœuds déjà démontés.
        nettoyer = () => {
          if (typeof nettoyageDuReglage === "function") nettoyageDuReglage();
          mm.revert();
          contexte.revert();
        };

        // Le démontage a eu lieu pendant que le contexte se construisait.
        if (annule) nettoyer();
      },
    );

    return () => {
      annule = true;
      nettoyer?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return racine;
}

export default useAjMotion;
