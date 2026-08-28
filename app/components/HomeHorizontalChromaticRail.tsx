/* eslint-disable @next/next/no-img-element -- the retained client masters are
   already exported at the exact editorial ratio used by this composition. */
"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import type { TranslationKey } from "../../lib/i18n/dictionaries";
import { useI18n } from "../../lib/i18n/I18nProvider";
import { useAjMotion } from "./useAjMotion";
import styles from "./HomeHorizontalChromaticRail.module.css";

type Chapter = {
  slug: "pourpre" | "lilas-bleu-clair" | "rose-pale";
  nameKey: TranslationKey;
  moment: string;
  product: string;
  productAlt: string;
  model: string;
  modelAlt: string;
  accent: string;
};

const CHAPTERS: readonly Chapter[] = [
  {
    slug: "pourpre",
    nameKey: "sequence.color.purple",
    moment: "Au crépuscule",
    product:
      "/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
    productAlt:
      "Apollon Pourpre Impérial en lévitation sur son décor de marbre",
    model:
      "/images/client/apollon-world/apollon-pourpre-model-color-v2.webp",
    modelAlt: "Apollon Pourpre Impérial porté par Jérémy",
    accent: "#5b1233",
  },
  {
    slug: "lilas-bleu-clair",
    nameKey: "sequence.color.lilac",
    moment: "Au zénith",
    product:
      "/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
    productAlt: "Apollon Lilas Céleste en lévitation sur son décor de marbre",
    model: "/images/client/apollon-world/apollon-lilas-model-color-v2.webp",
    modelAlt: "Apollon Lilas Céleste porté par Alex",
    accent: "#777a9d",
  },
  {
    slug: "rose-pale",
    nameKey: "sequence.color.rose",
    moment: "À l’aube",
    product: "/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
    productAlt: "Apollon Rose Velours en lévitation sur son décor de marbre",
    model: "/images/client/apollon-world/apollon-rose-model-color-v2.webp",
    modelAlt: "Apollon Rose Velours porté par Jérémy",
    accent: "#ad777c",
  },
] as const;

const RAIL_IMAGE_SIZES =
  "(max-width: 560px) 46vw, (max-width: 1024px) 45vw, 31vw";

function responsiveSrcSet(src: string, sourceWidth: 1024 | 1731) {
  const variant = (width: number) => src.replace(/\.webp$/, `-${width}.webp`);
  const widths = sourceWidth === 1024 ? [360, 720] : [360, 720, 1080];
  return [
    ...widths.map((width) => `${variant(width)} ${width}w`),
    `${src} ${sourceWidth}w`,
  ].join(", ");
}

export default function HomeHorizontalChromaticRail() {
  const { t } = useI18n();
  const [motionReady, setMotionReady] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const lastActive = useRef(0);

  const root = useAjMotion<HTMLElement>(({ gsap, mm, racine }) => {
    const stage = racine.querySelector<HTMLElement>(`.${styles.stage}`);
    const track = racine.querySelector<HTMLElement>(`.${styles.track}`);
    const progress = racine.querySelector<HTMLElement>(`.${styles.progressFill}`);
    const panels = Array.from(
      racine.querySelectorAll<HTMLElement>(`.${styles.panel}`),
    );

    if (!stage || !track || panels.length !== CHAPTERS.length) return;

    mm.add(
      { animate: "(prefers-reduced-motion: no-preference)" },
      (context) => {
        const { animate } = context.conditions as { animate: boolean };
        if (!animate) return;

        // ScrollTrigger measures the pin synchronously. Apply the horizontal
        // layout before creating it so the pre-motion three-panel stack can
        // never inflate the pinned stage to three viewport heights.
        racine.classList.add(styles.motionReady);
        setMotionReady(true);
        const frames = panels.map((panel) =>
          Array.from(panel.querySelectorAll<HTMLElement>(`.${styles.frame}`)),
        );
        const syncPanelWidth = () => {
          racine.style.setProperty("--rail-panel-width", `${stage.clientWidth}px`);
        };

        const panelOffset = (index: number) => panels[index]?.offsetLeft ?? 0;
        const scrollLength = () =>
          Math.max(
            stage.clientWidth * 2.3,
            stage.clientHeight * 3.15,
          );

        syncPanelWidth();
        gsap.set(track, { x: 0 });
        if (progress) gsap.set(progress, { scaleX: 0, transformOrigin: "left center" });

        frames.slice(1).forEach((pair) => {
          const [product, model] = pair;
          if (product) gsap.set(product, { xPercent: -4, opacity: 0.78 });
          if (model) gsap.set(model, { xPercent: 4, opacity: 0.78 });
        });

        const timeline = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: racine,
            start: "top top",
            end: () => `+=${scrollLength()}`,
            pin: stage,
            pinSpacing: true,
            scrub: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            fastScrollEnd: 2800,
            onRefreshInit: syncPanelWidth,
            onToggle: (self) => {
              track.style.willChange = self.isActive ? "transform" : "";
            },
            onUpdate: (self) => {
              const next = self.progress < 0.37 ? 0 : self.progress < 0.78 ? 1 : 2;
              if (next !== lastActive.current) {
                lastActive.current = next;
                setActiveIndex(next);
              }
            },
          },
        });

        timeline
          .addLabel("pourpre", 0)
          .to(track, { x: 0, duration: 0.18 }, "pourpre")
          .addLabel("pourpre-to-lilas", ">")
          .to(
            track,
            { x: () => -panelOffset(1), duration: 1 },
            "pourpre-to-lilas",
          )
          .addLabel("lilas", ">")
          .to(track, { x: () => -panelOffset(1), duration: 0.24 }, "lilas")
          .addLabel("lilas-to-rose", ">")
          .to(
            track,
            { x: () => -panelOffset(2), duration: 1 },
            "lilas-to-rose",
          )
          .addLabel("rose", ">")
          .to(track, { x: () => -panelOffset(2), duration: 0.3 }, "rose");

        frames[0]?.forEach((frame, index) => {
          timeline.to(
            frame,
            {
              xPercent: index === 0 ? -3 : 3,
              opacity: 0.74,
              duration: 0.58,
            },
            "pourpre-to-lilas",
          );
        });
        frames[1]?.forEach((frame) => {
          timeline.to(
            frame,
            { xPercent: 0, opacity: 1, duration: 0.62 },
            "pourpre-to-lilas+=0.24",
          );
        });
        frames[1]?.forEach((frame, index) => {
          timeline.to(
            frame,
            {
              xPercent: index === 0 ? -3 : 3,
              opacity: 0.74,
              duration: 0.58,
            },
            "lilas-to-rose",
          );
        });
        frames[2]?.forEach((frame) => {
          timeline.to(
            frame,
            { xPercent: 0, opacity: 1, duration: 0.62 },
            "lilas-to-rose+=0.24",
          );
        });

        if (progress) {
          timeline.to(progress, { scaleX: 1, duration: timeline.duration() }, 0);
        }

        return () => {
          racine.classList.remove(styles.motionReady);
          gsap.set(track, { clearProps: "transform" });
          frames.flat().forEach((frame) =>
            gsap.set(frame, { clearProps: "transform,opacity" }),
          );
          if (progress) gsap.set(progress, { clearProps: "transform" });
          racine.style.removeProperty("--rail-panel-width");
          track.style.willChange = "";
          lastActive.current = 0;
          setActiveIndex(0);
          setMotionReady(false);
        };
      },
    );
  });

  const activeChapter = CHAPTERS[activeIndex] ?? CHAPTERS[0];

  return (
    <section
      ref={root}
      className={`${styles.sequence}${motionReady ? ` ${styles.motionReady}` : ""}`}
      id="apollon"
      aria-labelledby="horizontal-apollon-title"
      data-home-horizontal-rail="v46"
    >
      <div className={styles.stage}>
        <div className={styles.stageHeader}>
          <p id="horizontal-apollon-title">Apollon</p>
          <Link href="/shop">{t("home.viewBoutique")}</Link>
        </div>

        <div className={styles.track}>
          {CHAPTERS.map((chapter, index) => {
            const inactive = motionReady && activeIndex !== index;
            return (
              <article
                aria-hidden={inactive || undefined}
                className={styles.panel}
                data-colorway={chapter.slug}
                key={chapter.slug}
                style={{ "--chapter-accent": chapter.accent } as CSSProperties}
              >
                <div className={styles.panelInner}>
                  <div className={styles.copy}>
                    <p className={styles.moment}>{chapter.moment}</p>
                    <h2>{t(chapter.nameKey)}</h2>
                    <Link
                      href={`/products/${chapter.slug}`}
                      tabIndex={inactive ? -1 : undefined}
                    >
                      {t("shop.discover")}
                      <span aria-hidden="true">↗</span>
                    </Link>
                  </div>

                  <div className={styles.mediaPair}>
                    <figure className={styles.frame}>
                      <img
                        src={chapter.product}
                        srcSet={responsiveSrcSet(chapter.product, 1024)}
                        sizes={RAIL_IMAGE_SIZES}
                        alt={chapter.productAlt}
                        width={1024}
                        height={1536}
                        loading={index === 0 ? "eager" : "lazy"}
                        decoding="async"
                      />
                    </figure>
                    <figure className={styles.frame}>
                      <img
                        src={chapter.model}
                        srcSet={responsiveSrcSet(chapter.model, 1731)}
                        sizes={RAIL_IMAGE_SIZES}
                        alt={chapter.modelAlt}
                        width={1731}
                        height={2600}
                        loading={index === 0 ? "eager" : "lazy"}
                        decoding="async"
                      />
                    </figure>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className={styles.compactCopy} key={activeChapter.slug}>
          <p className={styles.moment}>{activeChapter.moment}</p>
          <h2>{t(activeChapter.nameKey)}</h2>
          <Link href={`/products/${activeChapter.slug}`}>
            {t("shop.discover")}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>

        <div className={styles.stageFooter} aria-hidden="true">
          <span>{t(CHAPTERS[activeIndex]?.nameKey ?? CHAPTERS[0].nameKey)}</span>
          <div className={styles.progressTrack}>
            <span className={styles.progressFill} />
          </div>
        </div>
      </div>
      <div className={styles.exitBridge} aria-hidden="true" />
    </section>
  );
}
