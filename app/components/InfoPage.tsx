"use client";

import StoreFooter from "./StoreFooter";
import StoreHeader from "./StoreHeader";
import styles from "./InfoPage.module.css";
import LocalizedInfoContent from "./LocalizedInfoContent";
import { useAjMotion } from "./useAjMotion";
import { T } from "@/lib/i18n/TranslatedText";

/* ==========================================================================
   InfoPage — le gabarit des sept pages légales
   --------------------------------------------------------------------------
   contact · mentions légales · CGV · confidentialité · cookies ·
   livraison-retours · rétractation.

   Un client qui lit des CGV cherche deux choses : trouver, et croire. Le
   gabarit sert exactement ça.
     • Une colonne de lecture bornée à 70 caractères, sur un papier chaud qui
       tranche avec le noir du reste du site — un document se lit sur du
       papier, pas sur un mur.
     • Un titre qui reste au bord de l'écran pendant qu'on descend : on sait
       toujours quel document on lit, y compris au milieu de l'article 12.
     • Chaque `<section>` ouverte par un filet : le texte respire par sa
       structure, pas par des marges arbitraires.
     • Plancher 15px strict, y compris dans les tableaux, les définitions et
       la ligne d'état — c'était l'endroit le plus fautif du site (10px).

   Ce fichier est passé client pour porter les entrées de section au scroll.
   Les pages appelantes restent des composants serveur : leurs `metadata` et
   leur contenu sont rendus côté serveur et passés ici en `children`.
   ========================================================================== */

type InfoPageProps = {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  status?: React.ReactNode | false;
  officialFrenchOnly?: boolean;
};

export function InfoNotice({
  children,
  warning = false,
}: {
  children: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <aside className={warning ? styles.warning : styles.notice}>{children}</aside>
  );
}

/*
  Le tableau déborde de sa colonne et défile dans son propre conteneur : aucune
  information n'est perdue, mais la barre est masquée et rien ne signalait que
  « Base légale » et « Durée de référence » commençaient après le bord droit de
  l'écran. Deux manques, deux corrections : l'amorce visuelle est en CSS
  (ombre portée sur le bord tant qu'il reste à défiler), et la zone devient
  atteignable au clavier — `tabindex="0"` sur une région nommée, sans quoi un
  utilisateur au clavier ne peut pas faire défiler ce qu'il ne peut pas
  atteindre.
*/
export function InfoTable({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export default function InfoPage({
  eyebrow,
  title,
  children,
  status = <T id="info.defaultStatus" />,
  officialFrenchOnly = false,
}: InfoPageProps) {
  const racine = useAjMotion<HTMLElement>(({ gsap, mm, racine: page }) => {
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Les enfants directs de la colonne de lecture : sections, encarts,
      // paragraphes libres, ligne d'état. On ne connaît pas leur nature —
      // c'est la page appelante qui la décide — mais on connaît leur place.
      const blocs = Array.from(
        page.querySelectorAll<HTMLElement>(`.${styles.copy} > *`),
      );
      if (!blocs.length) return;

      // On ne pose l'état de départ que sur ce qui est SOUS la ligne de
      // flottaison au montage. Masquer puis révéler un bloc déjà lu ferait
      // clignoter la page le temps que GSAP arrive.
      const seuil = window.innerHeight * 0.9;
      const aReveler = blocs.filter(
        (bloc) => bloc.getBoundingClientRect().top > seuil,
      );
      if (!aReveler.length) return;

      aReveler.forEach((bloc) => {
        gsap.from(bloc, {
          y: 18,
          opacity: 0,
          duration: 0.75,
          ease: "expo.out",
          scrollTrigger: {
            trigger: bloc,
            start: "top 90%",
            once: true,
            invalidateOnRefresh: true,
          },
        });
      });
    });
  });

  return (
    <main className={styles.page} ref={racine}>
      <StoreHeader />

      <article className={styles.article}>
        <header className={styles.tete}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.titre}>{title}</h1>
        </header>

        <div className={styles.copy}>
          <LocalizedInfoContent
            status={
              status ? <span className={styles.status}>{status}</span> : false
            }
            officialFrenchOnly={officialFrenchOnly}
          >
            {children}
          </LocalizedInfoContent>
        </div>
      </article>

      <StoreFooter />
    </main>
  );
}
