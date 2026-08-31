/* eslint-disable @next/next/no-img-element -- the retained client masters are
   already exported at the exact editorial ratio used by this composition. */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  modelWidth: 1200 | 1731;
  modelHeight: 1803 | 2600;
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
      "/images/client/apollon-world/apollon-pourpre-alex-bordeaux-v1.webp",
    modelAlt: "Apollon Pourpre Impérial porté par Alex",
    modelWidth: 1200,
    modelHeight: 1803,
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
    modelWidth: 1731,
    modelHeight: 2600,
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
    modelWidth: 1731,
    modelHeight: 2600,
    accent: "#ad777c",
  },
] as const;

const RAIL_IMAGE_SIZES =
  "(max-width: 560px) 46vw, (max-width: 1024px) 45vw, 31vw";

function responsiveSrcSet(src: string, sourceWidth: 1024 | 1200 | 1731) {
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
  const viewportRef = useRef<HTMLDivElement>(null);

  /* Phones and compact tablets keep the browser's native horizontal scroll.
     This lets a finger own the rail directly while the page remains vertically
     scrollable. React only updates when the nearest panel changes, never on
     every pixel of the gesture. */
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const compact = window.matchMedia("(max-width: 900px)");
    const root = viewport.closest<HTMLElement>(`.${styles.sequence}`);
    const panels = Array.from(
      viewport.querySelectorAll<HTMLElement>(`.${styles.panel}`),
    );
    let frame = 0;
    let listening = false;

    const sync = () => {
      frame = 0;
      const next = panels.length
        ? panels.reduce(
            (closest, panel, index) =>
              Math.abs(panel.offsetLeft - viewport.scrollLeft) <
              Math.abs(panels[closest].offsetLeft - viewport.scrollLeft)
                ? index
                : closest,
            0,
          )
        : 0;

      if (next !== lastActive.current) {
        lastActive.current = next;
        setActiveIndex(next);
      }
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };

    const enable = () => {
      if (listening || !compact.matches) return;
      listening = true;
      root?.classList.add(styles.motionReady);
      setMotionReady(true);
      viewport.addEventListener("scroll", onScroll, { passive: true });
      sync();
    };

    const disable = () => {
      if (!listening) return;
      listening = false;
      viewport.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      viewport.scrollLeft = 0;
      root?.classList.remove(styles.motionReady);
      lastActive.current = 0;
      setActiveIndex(0);
      setMotionReady(false);
    };

    const reconcile = () => {
      if (compact.matches) enable();
      else disable();
    };

    reconcile();
    compact.addEventListener("change", reconcile);
    return () => {
      compact.removeEventListener("change", reconcile);
      disable();
    };
  }, []);

  const root = useAjMotion<HTMLElement>(({ gsap, mm, racine }) => {
    const stage = racine.querySelector<HTMLElement>(`.${styles.stage}`);
    const track = racine.querySelector<HTMLElement>(`.${styles.track}`);
    const panels = Array.from(
      racine.querySelectorAll<HTMLElement>(`.${styles.panel}`),
    );

    if (!stage || !track || panels.length !== CHAPTERS.length) return;

    mm.add(
      {
        desktop: "(min-width: 901px)",
        animate: "(prefers-reduced-motion: no-preference)",
      },
      (context) => {
        const { desktop, animate } = context.conditions as {
          desktop: boolean;
          animate: boolean;
        };
        if (!desktop || !animate) return;

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
            // The hero and rail already share one exact edge. Anticipating the
            // pin pulled the rail roughly 6 px over the film on mobile, so the
            // pin now begins only when that shared edge reaches the viewport.
            anticipatePin: 0,
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

        /* A horizontal trackpad gesture advances the same scroll-linked scene
           as the vertical wheel. We only intercept genuinely horizontal input
           while the rail is pinned; ordinary vertical page scrolling remains
           completely native. */
        const onWheel = (event: WheelEvent) => {
          const trigger = timeline.scrollTrigger;
          if (!trigger?.isActive) return;

          const horizontalDelta =
            Math.abs(event.deltaX) > Math.abs(event.deltaY)
              ? event.deltaX
              : event.shiftKey
                ? event.deltaY
                : 0;
          if (Math.abs(horizontalDelta) < 0.5) return;

          event.preventDefault();
          const target = Math.max(
            trigger.start,
            Math.min(trigger.end, window.scrollY + horizontalDelta),
          );
          window.scrollTo({ top: target, behavior: "auto" });
        };
        racine.addEventListener("wheel", onWheel, { passive: false });

        return () => {
          racine.removeEventListener("wheel", onWheel);
          racine.classList.remove(styles.motionReady);
          gsap.set(track, { clearProps: "transform" });
          frames.flat().forEach((frame) =>
            gsap.set(frame, { clearProps: "transform,opacity" }),
          );
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
      data-home-horizontal-rail="v48"
    >
      <div className={styles.stage}>
        <div className={styles.stageHeader}>
          <p id="horizontal-apollon-title">Apollon</p>
          <Link href="/shop">{t("home.viewBoutique")}</Link>
        </div>

        <div
          ref={viewportRef}
          className={styles.trackViewport}
          aria-label="Collection Apollon, trois coloris"
          tabIndex={motionReady ? 0 : undefined}
        >
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
                          loading="eager"
                          fetchPriority={index === 0 ? "auto" : "low"}
                          decoding="async"
                        />
                      </figure>
                      <figure className={styles.frame}>
                        <img
                          src={chapter.model}
                          srcSet={responsiveSrcSet(
                            chapter.model,
                            chapter.modelWidth,
                          )}
                          sizes={RAIL_IMAGE_SIZES}
                          alt={chapter.modelAlt}
                          width={chapter.modelWidth}
                          height={chapter.modelHeight}
                          loading="eager"
                          fetchPriority={index === 0 ? "auto" : "low"}
                          decoding="async"
                        />
                      </figure>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
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
          <span>
            {String(activeIndex + 1).padStart(2, "0")} / {String(CHAPTERS.length).padStart(2, "0")} ·{" "}
            {t(CHAPTERS[activeIndex]?.nameKey ?? CHAPTERS[0].nameKey)}
          </span>
        </div>
      </div>
    </section>
  );
}
