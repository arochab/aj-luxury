"use client";

import Image from "next/image";
import { useAjMotion } from "../components/useAjMotion";
import styles from "./Story.module.css";

export default function StoryHeroMedia() {
  const root = useAjMotion<HTMLElement>(({ gsap, mm, racine }) => {
    const image = racine.querySelector<HTMLElement>(`.${styles.heroForeground}`);
    if (!image) return;

    mm.add(
      {
        animate: "(prefers-reduced-motion: no-preference)",
        compact: "(max-width: 760px)",
      },
      (context) => {
        const { animate, compact } = context.conditions as {
          animate: boolean;
          compact: boolean;
        };
        if (!animate) return;

        gsap.fromTo(
          image,
          { scale: 1 },
          {
            scale: compact ? 1.018 : 1.028,
            ease: "none",
            scrollTrigger: {
              trigger: racine,
              start: "top 86%",
              end: "bottom 24%",
              scrub: 0.18,
              invalidateOnRefresh: true,
            },
          },
        );
      },
    );
  });

  return (
    <figure ref={root} className={styles.heroImage} data-story-scroll-zoom="subtle">
      <Image
        unoptimized
        priority
        src="/images/client/campaign-duo-lilas-seated.webp"
        alt="AJ Luxury — Alex et Jérémy — collection Apollon"
        fill
        sizes="(max-width: 760px) calc(100vw - 40px), 46vw"
        className={styles.heroForeground}
      />
    </figure>
  );
}
