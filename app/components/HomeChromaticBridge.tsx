"use client";

import { useAjMotion } from "./useAjMotion";
import styles from "./ProductionHome.module.css";

/*
 * The component is intentionally heightless: the full editorial section owns
 * the spatial plum-to-chrome-to-black progression. GSAP only settles the hero
 * and the campaign photographs, so colour never accelerates or lags behind
 * the reader's scroll position.
 */
export default function HomeChromaticBridge() {
  const root = useAjMotion<HTMLDivElement>(({ gsap, mm, racine }) => {
    const hero = racine.previousElementSibling as HTMLElement | null;
    const featured = racine.nextElementSibling as HTMLElement | null;

    if (!hero || !featured) return;

    const heroScene = hero.querySelector<HTMLElement>(".aj-film__hero-scene");
    const signature = hero.querySelector<HTMLElement>(".aj-film__signature");
    const images = Array.from(
      featured.querySelectorAll<HTMLElement>(".aj-featured__image"),
    );

    mm.add(
      {
        animate: "(prefers-reduced-motion: no-preference)",
        desktop: "(min-width: 761px)",
      },
      (context) => {
        const { animate, desktop } = context.conditions as {
          animate: boolean;
          desktop: boolean;
        };
        if (!animate) return;

        if (heroScene || signature) {
          const departure = gsap.timeline({
            scrollTrigger: {
              trigger: hero,
              start: "bottom 76%",
              end: "bottom 6%",
              scrub: 0.1,
              invalidateOnRefresh: true,
            },
          });

          if (heroScene) {
            departure.to(
              heroScene,
              {
                scale: desktop ? 1.018 : 1.012,
                yPercent: 0.8,
                ease: "none",
              },
              0,
            );
          }
          if (signature) {
            departure.to(
              signature,
              { opacity: 0.34, y: -8, ease: "none" },
              0,
            );
          }
        }

        if (images.length) {
          const reveal = gsap.timeline({
            scrollTrigger: {
              trigger: featured,
              start: "top 90%",
              end: desktop ? "top 30%" : "top 48%",
              scrub: 0.12,
              invalidateOnRefresh: true,
            },
          });

          images.forEach((image, index) => {
            reveal.fromTo(
              image,
              {
                opacity: 0.62,
                y: desktop ? 22 : 14,
                scale: 0.996,
              },
              { opacity: 1, y: 0, scale: 1, ease: "none" },
              index * 0.11,
            );
          });
        }
      },
    );
  });

  return (
    <div
      ref={root}
      className={styles.scrollJunction}
      aria-hidden="true"
      data-motion="hero-to-editorial"
    />
  );
}
