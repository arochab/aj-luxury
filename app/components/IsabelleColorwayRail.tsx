"use client";

/* eslint-disable @next/next/no-img-element -- approved client assets are already web-optimized */

import type { CSSProperties } from "react";
import { useAjMotion } from "./useAjMotion";
import styles from "./IsabelleColorwayRail.module.css";

type Colorway = {
  key: "pourpre" | "lilas" | "rose";
  name: string;
  color: string;
  still: string;
  worn: string;
  model: "Jérémy" | "Alex";
};

const COLORWAYS: readonly Colorway[] = [
  {
    key: "pourpre",
    name: "Pourpre Impérial",
    color: "#3f051c",
    still:
      "/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
    worn:
      "/images/client/apollon-world/apollon-pourpre-model-color-v2.webp",
    model: "Jérémy",
  },
  {
    key: "lilas",
    name: "Lilas Céleste",
    color: "#616384",
    still:
      "/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
    worn: "/images/client/apollon-world/apollon-lilas-model-color-v2.webp",
    model: "Alex",
  },
  {
    key: "rose",
    name: "Rose Velours",
    color: "#97666a",
    still: "/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
    worn: "/images/client/apollon-world/apollon-rose-model-color-v2.webp",
    model: "Jérémy",
  },
] as const;

export default function IsabelleColorwayRail() {
  const root = useAjMotion<HTMLElement>(
    ({ gsap, mm, racine, ScrollTrigger }) => {
      const viewport = racine.querySelector<HTMLElement>(
        `.${styles.viewport}`,
      );
      const track = racine.querySelector<HTMLElement>(`.${styles.track}`);
      const lilac = racine.querySelector<HTMLElement>(
        `[data-color-field="lilas"]`,
      );
      const rose = racine.querySelector<HTMLElement>(
        `[data-color-field="rose"]`,
      );
      const hero = racine.previousElementSibling as HTMLElement | null;

      if (!viewport || !track || !lilac || !rose) return;

      mm.add(
        {
          animate: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { animate } = context.conditions as { animate: boolean };
          if (!animate) return;

          racine.dataset.motionReady = "true";

          const distance = () =>
            Math.max(1, track.scrollWidth - viewport.clientWidth);

          const timeline = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: racine,
              start: "top top",
              end: () => `+=${distance()}`,
              pin: viewport,
              scrub: true,
              anticipatePin: 1,
              invalidateOnRefresh: true,
            },
          });

          timeline
            .to(track, { x: () => -distance(), duration: 2 }, 0)
            .to(lilac, { opacity: 1, duration: 0.46 }, 0.36)
            .to(rose, { opacity: 1, duration: 0.52 }, 1.22);

          if (hero) {
            const heroScene = hero.querySelector<HTMLElement>(
              ".aj-film__hero-scene",
            );
            const signature = hero.querySelector<HTMLElement>(
              ".aj-film__signature",
            );

            if (heroScene || signature) {
              const departure = gsap.timeline({
                defaults: { ease: "none" },
                scrollTrigger: {
                  trigger: hero,
                  start: "bottom 76%",
                  end: "bottom 8%",
                  scrub: true,
                  invalidateOnRefresh: true,
                },
              });

              if (heroScene) {
                departure.to(
                  heroScene,
                  { scale: 1.016, yPercent: 0.7, duration: 1 },
                  0,
                );
              }
              if (signature) {
                departure.to(
                  signature,
                  { opacity: 0.38, y: -8, duration: 1 },
                  0,
                );
              }
            }
          }

          ScrollTrigger.refresh();

          return () => {
            delete racine.dataset.motionReady;
          };
        },
      );
    },
  );

  return (
    <section
      ref={root}
      className={styles.scene}
      id="apollon"
      aria-label="Apollon — trois coloris"
      data-preview-isabelle-rail="true"
    >
      <div className={styles.viewport}>
        <div className={styles.colorFields} aria-hidden="true">
          <div
            className={`${styles.colorField} ${styles.colorFieldPourpre}`}
            data-color-field="pourpre"
          />
          <div
            className={`${styles.colorField} ${styles.colorFieldLilas}`}
            data-color-field="lilas"
          />
          <div
            className={`${styles.colorField} ${styles.colorFieldRose}`}
            data-color-field="rose"
          />
        </div>

        <div className={styles.track}>
          {COLORWAYS.map((colorway) => (
            <article
              className={styles.panel}
              key={colorway.key}
              aria-labelledby={`colorway-${colorway.key}`}
              style={
                { "--chapter-color": colorway.color } as CSSProperties
              }
            >
              <div className={styles.pair}>
                <figure className={styles.mediaFrame}>
                  <img
                    src={colorway.still}
                    alt={`Apollon ${colorway.name} — composition éditoriale d’Isabelle`}
                    width={1024}
                    height={1536}
                    loading="lazy"
                    fetchPriority="low"
                    decoding="async"
                    sizes="(max-width: 760px) 46vw, 34vw"
                  />
                </figure>

                <figure className={styles.mediaFrame}>
                  <img
                    src={colorway.worn}
                    alt={`AJ Luxury — ${colorway.model} porte Apollon ${colorway.name}`}
                    width={1731}
                    height={2600}
                    loading="lazy"
                    fetchPriority="low"
                    decoding="async"
                    sizes="(max-width: 760px) 46vw, 34vw"
                  />
                </figure>
              </div>

              <div className={styles.caption}>
                <h2 id={`colorway-${colorway.key}`}>{colorway.name}</h2>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
