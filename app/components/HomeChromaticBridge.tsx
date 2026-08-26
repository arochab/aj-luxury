"use client";

import { useAjMotion } from "./useAjMotion";
import styles from "./ProductionHome.module.css";

/*
 * The film ends on a measured dark-plum floor (#402127 to #4d2a31), while
 * the editorial section starts in abyss black. This short scroll scene keeps
 * that colour relationship continuous: plum recedes, a restrained chrome
 * threshold appears, then the first campaign images take over.
 *
 * Only transform and opacity move. The colour field itself is static, so the
 * transition remains compositor-friendly even on mobile.
 */
export default function HomeChromaticBridge() {
  const root = useAjMotion<HTMLDivElement>(({ gsap, mm, racine }) => {
    const hero = racine.previousElementSibling as HTMLElement | null;
    const featured = racine.nextElementSibling as HTMLElement | null;

    if (!hero || !featured) return;

    const heroScene = hero.querySelector<HTMLElement>(".aj-film__hero-scene");
    const signature = hero.querySelector<HTMLElement>(".aj-film__signature");
    const field = racine.querySelector<HTMLElement>(`.${styles.bridgeField}`);
    const halo = racine.querySelector<HTMLElement>(`.${styles.bridgeHalo}`);
    const featuredGlow = featured.querySelector<HTMLElement>(
      ".aj-featured__glow",
    );
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

        const threshold = gsap.timeline({
          scrollTrigger: {
            trigger: racine,
            start: "top 96%",
            end: "bottom 22%",
            scrub: 0.1,
            invalidateOnRefresh: true,
          },
        });

        if (field) {
          threshold.fromTo(
            field,
            { opacity: 0.5, yPercent: -14 },
            { opacity: 1, yPercent: 0, ease: "none" },
            0,
          );
        }
        if (halo) {
          threshold.fromTo(
            halo,
            { opacity: 0.18, scaleX: 0.72 },
            { opacity: 0.82, scaleX: 1, ease: "none" },
            0.08,
          );
        }

        if (featuredGlow) {
          gsap.fromTo(
            featuredGlow,
            { opacity: 0.32, yPercent: -4 },
            {
              opacity: 1,
              yPercent: 0,
              ease: "none",
              scrollTrigger: {
                trigger: featured,
                start: "top 94%",
                end: "top 28%",
                scrub: 0.1,
                invalidateOnRefresh: true,
              },
            },
          );
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
                opacity: 0.52,
                y: desktop ? 34 : 18,
                scale: 0.992,
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
      className={styles.chromaticBridge}
      aria-hidden="true"
      data-motion="hero-to-editorial"
    >
      <span className={styles.bridgeField} />
      <span className={styles.bridgeHalo} />
    </div>
  );
}
