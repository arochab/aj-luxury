/* eslint-disable @next/next/no-img-element -- AJ masters are already approved and pre-optimized */
"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode, UIEvent } from "react";
import type { TranslationKey } from "../../lib/i18n/dictionaries";
import { editorialMoodboardImages } from "../../lib/editorial-moodboard";
import { useI18n } from "../../lib/i18n/I18nProvider";
import ClientCopyText from "./ClientCopyText";
import StoreHeader from "./StoreHeader";
import { useAjMotion } from "./useAjMotion";
import styles from "./HomeExperienceV10.module.css";

export type HomeColorway = {
  slug: "rose-pale" | "lilas-bleu-clair" | "pourpre";
  nameKey: TranslationKey;
  image: string;
  width: number;
  height: number;
  position: string;
  swatch: string;
};

type Props = {
  colorways: readonly HomeColorway[];
};

const featuredEditorialImages = [
  {
    src: "/images/client/product-rose-model.webp",
    alt: "AJ Luxury — Alex — Apollon Rose Velours",
    crop: "left",
  },
  {
    src: "/images/client/campaign-duo-pourpre.webp",
    alt: "AJ Luxury — Alex et Jérémy — Apollon Pourpre Impérial",
    crop: "lead",
  },
  {
    src: "/images/client/editorial-lilas-chair.webp",
    alt: "AJ Luxury — Jérémy — Apollon Lilas Céleste",
    crop: "right",
  },
] as const;

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg aria-hidden="true" className={diagonal ? styles.arrowDiagonal : styles.arrow} viewBox="0 0 28 28">
      <path d={diagonal ? "M7 21 21 7M10 7h11v11" : "M4 14h19M17 8l6 6-6 6"} />
    </svg>
  );
}

function ActionLink({
  children,
  href,
  diagonal = false,
  className = "",
}: {
  children: ReactNode;
  href: string;
  diagonal?: boolean;
  className?: string;
}) {
  return (
    <Link className={styles.action + " " + className} href={href}>
      <span>{children}</span>
      <Arrow diagonal={diagonal} />
    </Link>
  );
}

export default function HomeExperienceV10({ colorways }: Props) {
  const { t } = useI18n();

  const root = useAjMotion<HTMLDivElement>(({ gsap, racine, mm }) => {
    mm.add(
      {
        desktop: "(min-width: 761px)",
        animate: "(prefers-reduced-motion: no-preference)",
      },
      (context) => {
        const { desktop, animate } = context.conditions as {
          desktop: boolean;
          animate: boolean;
        };
        if (!animate) return;

        const heroMedia = racine.querySelector<HTMLElement>("[data-motion='hero-media']");
        const heroCopy = racine.querySelector<HTMLElement>("[data-motion='hero-copy']");
        const featured = racine.querySelector<HTMLElement>("[data-motion='featured']");
        const featuredCards = Array.from(
          racine.querySelectorAll<HTMLElement>("[data-motion='featured-card']"),
        );
        const collectionStage = racine.querySelector<HTMLElement>("[data-motion='collection-stage']");
        const collectionCards = Array.from(
          racine.querySelectorAll<HTMLElement>("[data-motion='collection-card']"),
        );
        const collectionSteps = Array.from(
          racine.querySelectorAll<HTMLButtonElement>("[data-motion='collection-step']"),
        );
        const wordmark = racine.querySelector<HTMLElement>("[data-motion='wordmark']");
        const moodboardMedia = Array.from(
          racine.querySelectorAll<HTMLElement>("[data-motion='moodboard-media']"),
        );
        const storyCopy = racine.querySelector<HTMLElement>("[data-motion='story-copy']");
        let collectionCleanup: (() => void) | undefined;

        if (heroMedia) {
          gsap.to(heroMedia, {
            yPercent: desktop ? 4 : 2,
            scale: desktop ? 1.045 : 1.02,
            ease: "none",
            scrollTrigger: {
              trigger: heroMedia.closest("section"),
              start: "top top",
              end: "bottom top",
              scrub: true,
              invalidateOnRefresh: true,
            },
          });
        }

        if (heroCopy) {
          gsap.to(heroCopy, {
            yPercent: desktop ? -8 : -4,
            opacity: 0.18,
            ease: "none",
            scrollTrigger: {
              trigger: heroCopy.closest("section"),
              start: "38% top",
              end: "bottom top",
              scrub: true,
              invalidateOnRefresh: true,
            },
          });
        }

        if (desktop && featured && featuredCards.length === 3) {
          const featuredSequence = gsap.timeline({
            scrollTrigger: {
              trigger: featured,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
              invalidateOnRefresh: true,
            },
          });

          featuredSequence
            .fromTo(
              featuredCards[0],
              { xPercent: desktop ? -12 : -3, yPercent: 7, scale: 0.92, opacity: 0.58 },
              { xPercent: 0, yPercent: -2, scale: 1, opacity: 1, duration: 1, ease: "none" },
              0,
            )
            .fromTo(
              featuredCards[1],
              { yPercent: 4, scale: 1.06, opacity: 0.82 },
              { yPercent: -4, scale: 1, opacity: 1, duration: 1, ease: "none" },
              0,
            )
            .fromTo(
              featuredCards[2],
              { xPercent: desktop ? 12 : 3, yPercent: -7, scale: 0.92, opacity: 0.58 },
              { xPercent: 0, yPercent: 2, scale: 1, opacity: 1, duration: 1, ease: "none" },
              0,
            );
        }

        if (wordmark) {
          gsap.fromTo(
            wordmark,
            { xPercent: desktop ? 2 : 0 },
            {
              xPercent: desktop ? -7 : -2,
              ease: "none",
              scrollTrigger: {
                trigger: wordmark.closest("section"),
                start: "top bottom",
                end: "bottom top",
                scrub: true,
                invalidateOnRefresh: true,
              },
            },
          );
        }

        if (desktop && collectionStage && collectionCards.length === 3) {
          let activeIndex = -1;
          const activate = (index: number) => {
            if (index === activeIndex) return;
            activeIndex = index;
            collectionCards.forEach((card, cardIndex) => {
              const inactive = cardIndex !== index;
              card.toggleAttribute("inert", inactive);
              card.setAttribute("aria-hidden", String(inactive));
            });
            collectionSteps.forEach((step, stepIndex) => {
              const active = stepIndex === index;
              step.toggleAttribute("data-active", active);
              step.setAttribute("aria-pressed", String(active));
            });
          };

          activate(0);
          gsap.set(collectionCards.slice(1), {
            autoAlpha: 1,
            xPercent: 105,
          });

          const collectionSequence = gsap.timeline({
            scrollTrigger: {
              trigger: collectionStage,
              start: "top top",
              end: "bottom bottom",
              scrub: true,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                activate(self.progress < 0.36 ? 0 : self.progress < 0.7 ? 1 : 2);
              },
            },
          });

          collectionSequence
            .to(
              collectionCards[0],
              { xPercent: -105, duration: 0.52, ease: "power2.inOut" },
              0.74,
            )
            .fromTo(
              collectionCards[1],
              { xPercent: 105 },
              { xPercent: 0, duration: 0.52, ease: "power2.inOut" },
              0.74,
            )
            .to(
              collectionCards[1],
              { xPercent: -105, duration: 0.52, ease: "power2.inOut" },
              1.74,
            )
            .fromTo(
              collectionCards[2],
              { xPercent: 105 },
              { xPercent: 0, duration: 0.52, ease: "power2.inOut" },
              1.74,
            )
            .to(collectionCards[2], { xPercent: 0, duration: 0.74, ease: "none" }, 2.26);

          collectionCleanup = () => {
            collectionCards.forEach((card) => {
              card.removeAttribute("inert");
              card.removeAttribute("aria-hidden");
            });
            collectionSteps.forEach((step) => step.removeAttribute("data-active"));
          };
        }

        if (desktop) {
          moodboardMedia.forEach((media, index) => {
            gsap.fromTo(
              media,
              { yPercent: index % 2 === 0 ? -3 : 3 },
              {
                yPercent: index % 2 === 0 ? 3 : -3,
                ease: "none",
                scrollTrigger: {
                  trigger: media.parentElement,
                  start: "top bottom",
                  end: "bottom top",
                  scrub: true,
                  invalidateOnRefresh: true,
                },
              },
            );
          });
        }

        if (storyCopy) {
          gsap.from(storyCopy, {
            y: 22,
            opacity: 0,
            duration: 0.52,
            ease: "power3.out",
            scrollTrigger: {
              trigger: storyCopy,
              start: "top 84%",
              once: true,
              invalidateOnRefresh: true,
            },
          });
        }

        return collectionCleanup;
      },
    );
  });

  const selectColorway = (index: number) => {
    const rootElement = root.current;
    if (!rootElement) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
    const rail = rootElement.querySelector<HTMLElement>("[data-motion='product-rail']");
    const cards = Array.from(
      rootElement.querySelectorAll<HTMLElement>("[data-motion='collection-card']"),
    );

    if (window.innerWidth <= 760 && rail && cards[index]) {
      rail.scrollTo({ left: cards[index].offsetLeft - 16, behavior });
      return;
    }

    const stage = rootElement.querySelector<HTMLElement>("[data-motion='collection-stage']");
    if (!stage) return;
    const stageTop = stage.getBoundingClientRect().top + window.scrollY;
    const travel = Math.max(0, stage.offsetHeight - window.innerHeight);
    const progress = [0.08, 0.52, 0.9][index] ?? 0;
    window.scrollTo({ top: stageTop + (travel * progress), behavior });
  };

  const syncMobileProgress = (event: UIEvent<HTMLDivElement>) => {
    if (window.innerWidth > 760) return;
    const rail = event.currentTarget;
    const cards = Array.from(
      rail.querySelectorAll<HTMLElement>("[data-motion='collection-card']"),
    );
    if (cards.length === 0) return;
    const activeIndex = cards.reduce((closest, card, index) => (
      Math.abs(card.offsetLeft - rail.scrollLeft) <
      Math.abs(cards[closest].offsetLeft - rail.scrollLeft) ? index : closest
    ), 0);

    root.current?.querySelectorAll<HTMLButtonElement>("[data-motion='collection-step']")
      .forEach((step, index) => {
        const active = index === activeIndex;
        step.toggleAttribute("data-active", active);
        step.setAttribute("aria-pressed", String(active));
      });
  };

  return (
    <div className={styles.page} ref={root}>
      <a className={styles.skipLink} href="#apollon">{t("nav.skipToContent")}</a>
      <section className={styles.hero} id="accueil" aria-labelledby="home10-title" data-motion-root="hero">
        <StoreHeader />
        <figure className={styles.heroMedia} data-motion="hero-media">
          <div className={styles.heroPanelLeft}>
            <picture>
              <source
                media="(max-width: 760px)"
                srcSet="/images/client/hero-v4-portrait-480x623-poster.webp 480w, /images/client/hero-v4-portrait-720x934-poster.webp 720w"
                sizes="100vw"
              />
              <source
                srcSet="/images/client/hero-v4-tablet-1440x810-poster.avif"
                type="image/avif"
              />
              <img
                src="/images/client/hero-v4-tablet-1440x810-poster.webp"
                alt="AJ Luxury — Jérémy et Alex portent Apollon Lilas Céleste"
                width={1440}
                height={810}
                fetchPriority="high"
                decoding="async"
              />
            </picture>
          </div>
        </figure>
        <div className={styles.heroGrade} aria-hidden="true" />
        <div className={styles.heroCopy} data-motion="hero-copy">
          <h1 className={styles.heroTitle} id="home10-title" lang="en">
            <span><span>Reveal Your</span></span>
            <span><span>Inner Beauty</span></span>
          </h1>
          <a className={styles.heroAction} href="#apollon">
            <span>{t("hero.discover")}</span>
            <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <div className={styles.sectionBreak} aria-hidden="true" />

      <section className={styles.featured} id="apollon" aria-label="AJ Luxury — Alex, Jérémy — Apollon" data-motion="featured">
        <div className={styles.featuredStage}>
          <div className={styles.featuredEditorial}>
            {featuredEditorialImages.map((image) => (
              <figure
                className={
                  styles.featuredCard +
                  (image.crop === "lead" ? " " + styles.featuredlead : "")
                }
                data-motion="featured-card"
                key={image.src}
              >
                <img
                  src={image.src}
                  alt={image.alt}
                  width={1600}
                  height={2400}
                  loading="lazy"
                  fetchPriority="low"
                  decoding="async"
                />
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.collection} id="collection" aria-labelledby="home10-apollon">
        <header className={styles.collectionHeader}>
          <h2 id="home10-apollon">Apollon</h2>
          <ActionLink href="/shop">{t("home.viewBoutique")}</ActionLink>
        </header>

        <div className={styles.collectionStage} data-motion="collection-stage">
          <div className={styles.collectionSticky}>
            <div className={styles.wordmark} data-motion="wordmark" aria-hidden="true">APOLLON</div>
            <div className={styles.productRail} data-motion="product-rail" onScroll={syncMobileProgress}>
              {colorways.map((colorway) => (
                <article
                  className={styles.productCard}
                  data-motion="collection-card"
                  key={colorway.slug}
                  style={{ "--colorway": colorway.swatch } as CSSProperties}
                >
                  <Link className={styles.productImage} href={"/products/" + colorway.slug}>
                    <img
                      src={colorway.image}
                      alt={t("sequence.bodyAlt").replace("{color}", t(colorway.nameKey))}
                      width={colorway.width}
                      height={colorway.height}
                      loading="lazy"
                      fetchPriority="low"
                      decoding="async"
                      style={{ objectPosition: colorway.position }}
                    />
                  </Link>
                  <div className={styles.productCaption}>
                    <div>
                      <p>Apollon</p>
                      <h3>{t(colorway.nameKey)}</h3>
                    </div>
                    <ActionLink href={"/products/" + colorway.slug} diagonal>
                      {t("shop.discover")}
                    </ActionLink>
                  </div>
                </article>
              ))}
            </div>
            <div className={styles.collectionProgress} role="group" aria-label={t("sequence.tablist")}>
              {colorways.map((colorway, index) => (
                <button
                  aria-label={t(colorway.nameKey)}
                  aria-pressed={index === 0}
                  className={styles.collectionStep}
                  data-motion="collection-step"
                  key={colorway.slug}
                  data-active={index === 0 ? "" : undefined}
                  onClick={() => selectColorway(index)}
                  style={{ "--colorway": colorway.swatch } as CSSProperties}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.moodboard} aria-label="AJ Luxury — Jérémy, Alex">
        <div className={styles.moodboardTrack}>
          {editorialMoodboardImages.map((image) => (
            <figure
              className={styles.moodboardItem + " " + styles["moodboard" + image.crop]}
              key={image.src}
            >
              <img
                src={image.src}
                alt={image.alt}
                width={image.width}
                height={image.height}
                loading="lazy"
                fetchPriority="low"
                decoding="async"
                data-motion="moodboard-media"
              />
            </figure>
          ))}
        </div>
      </section>

      <section className={styles.story} id="histoire" aria-labelledby="home10-story">
        <div className={styles.storyCopy} data-motion="story-copy">
          <h2 id="home10-story"><ClientCopyText copyKey="brandStory" /></h2>
          <div className={styles.storyActions}>
            <ActionLink href="/notre-histoire">{t("home.discoverStory")}</ActionLink>
            <ActionLink href="/shop">{t("story.discoverCollection")}</ActionLink>
          </div>
        </div>
      </section>
    </div>
  );
}
