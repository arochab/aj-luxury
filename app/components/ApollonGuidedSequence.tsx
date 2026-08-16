"use client";

/* eslint-disable @next/next/no-img-element -- pre-optimized, client-owned campaign media */

import Link from "next/link";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { T } from "../../lib/i18n/TranslatedText";
import { useI18n } from "../../lib/i18n/I18nProvider";

const FRAME_DURATION = 5600;

gsap.registerPlugin(useGSAP);

const frames = [
  {
    number: "01",
    name: "sequence.color.rose" as const,
    still: "/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
    body: "/images/client/product-rose-model.webp",
    feature: "product.feature.3" as const,
    color: "#d8a7ba",
  },
  {
    number: "02",
    name: "sequence.color.lilac" as const,
    still: "/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
    body: "/images/client/editorial-lilas-chair.webp",
    feature: "product.feature.4" as const,
    color: "#a9abd9",
  },
  {
    number: "03",
    name: "sequence.color.purple" as const,
    still: "/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
    body: "/images/client/campaign-duo-pourpre.webp",
    feature: "product.feature.7" as const,
    color: "#7d0f52",
  },
] as const;

export default function ApollonGuidedSequence() {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const progressRef = useRef<HTMLSpanElement>(null);
  const autoplayRef = useRef<gsap.core.Tween | null>(null);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const selectFrame = (index: number, takeControl = false) => {
    autoplayRef.current?.kill();
    if (progressRef.current) progressRef.current.style.transform = "scaleX(0)";
    setActive(index);
    if (takeControl) setPaused(true);
  };

  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % frames.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + frames.length) % frames.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = frames.length - 1;
    else return;

    event.preventDefault();
    selectFrame(next, true);
    tabRefs.current[next]?.focus();
  };

  useGSAP(() => {
    const frame = sectionRef.current?.querySelector<HTMLElement>(".aj-sequence__frame.is-active");
    if (!frame || reducedMotion) return;

    const timeline = gsap.timeline({ defaults: { ease: "power4.out" } });
    timeline
      .fromTo(frame.querySelector(".aj-sequence__symbol img"), { autoAlpha: 0.65, scale: 1.075, xPercent: -3 }, { autoAlpha: 1, scale: 1, xPercent: 0, duration: 1.2 }, 0)
      .fromTo(frame.querySelector(".aj-sequence__body img"), { autoAlpha: 0.65, scale: 1.065, xPercent: 3 }, { autoAlpha: 1, scale: 1, xPercent: 0, duration: 1.25 }, 0.05)
      .fromTo(frame.querySelectorAll(".aj-sequence__copy > *"), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.75, stagger: 0.08 }, 0.2);
  }, { dependencies: [active, reducedMotion], scope: sectionRef });

  useGSAP(() => {
    const progress = progressRef.current;
    if (!progress || reducedMotion) return;

    gsap.set(progress, { scaleX: 0, transformOrigin: "left center" });
    const tween = gsap.to(progress, {
      scaleX: 1,
      duration: FRAME_DURATION / 1000,
      ease: "none",
      paused: true,
      onComplete: () => setActive((current) => (current + 1) % frames.length),
    });
    autoplayRef.current = tween;
    if (!paused && inView && pageVisible) tween.play();
    return () => {
      tween.kill();
      if (autoplayRef.current === tween) autoplayRef.current = null;
    };
  }, { dependencies: [active, reducedMotion], scope: sectionRef });

  useEffect(() => {
    const tween = autoplayRef.current;
    if (!tween) return;
    if (!paused && inView && pageVisible && !reducedMotion) tween.play();
    else tween.pause();
  }, [paused, inView, pageVisible, reducedMotion, active]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    const syncPreferences = () => setReducedMotion(reduced.matches);
    const syncVisibility = () => setPageVisible(document.visibilityState === "visible");
    if (sectionRef.current) observer.observe(sectionRef.current);
    syncPreferences();
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    reduced.addEventListener("change", syncPreferences);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      reduced.removeEventListener("change", syncPreferences);
    };
  }, []);

  return (
    <section ref={sectionRef} className="aj-sequence" id="apollon" aria-labelledby="aj-sequence-title">
      <header className="aj-sequence__heading">
        <p><T id="home.apollonEyebrow" /></p>
        <h2 id="aj-sequence-title"><T id="home.incarnationTitle" /></h2>
        <p><T id="home.incarnationBody" /></p>
      </header>

      <div className="aj-sequence__stage" style={{ "--aj-accent": frames[active].color } as CSSProperties}>
        <div className="aj-sequence__visuals" aria-live="polite">
          {frames.map((frame, index) => (
            <article
              className={`aj-sequence__frame${index === active ? " is-active" : ""}`}
              id={`aj-sequence-panel-${index}`}
              role="tabpanel"
              aria-labelledby={`aj-sequence-tab-${index}`}
              aria-hidden={index !== active}
              key={frame.number}
            >
              <figure className="aj-sequence__symbol">
                <img src={frame.still} alt={index === active ? t("sequence.stillAlt").replace("{color}", t(frame.name)) : ""} width={1024} height={1536} loading="lazy" decoding="async" />
              </figure>
              <figure className="aj-sequence__body">
                <img src={frame.body} alt={index === active ? t("sequence.bodyAlt").replace("{color}", t(frame.name)) : ""} width={1600} height={2400} loading="lazy" decoding="async" />
              </figure>
              <div className="aj-sequence__copy">
                <span>{frame.number} / 03</span>
                <h3>{t(frame.name)}</h3>
                <p><T id={frame.feature} /></p>
              </div>
            </article>
          ))}
        </div>

        <div className="aj-sequence__controls">
          <button
            className="aj-sequence__transport"
            type="button"
            aria-label={paused ? t("sequence.resume") : t("sequence.pause")}
            aria-pressed={paused}
            onClick={() => setPaused((current) => !current)}
          >
            <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
          </button>

          <div className="aj-sequence__choices" role="tablist" aria-label={t("sequence.tablist")}>
            {frames.map((frame, index) => (
              <button
                type="button"
                role="tab"
                id={`aj-sequence-tab-${index}`}
                aria-controls={`aj-sequence-panel-${index}`}
                aria-selected={index === active}
                tabIndex={index === active ? 0 : -1}
                className={index === active ? "is-active" : ""}
                ref={(node) => { tabRefs.current[index] = node; }}
                onClick={() => selectFrame(index, true)}
                onFocus={() => setPaused(true)}
                onKeyDown={(event) => moveSelection(event, index)}
                key={frame.number}
              >
                <span>{frame.number}</span>
                <strong>{t(frame.name)}</strong>
              </button>
            ))}
          </div>

          <div className="aj-sequence__progress" aria-hidden="true">
            <span ref={progressRef} />
          </div>

          <Link href="/shop"><T id="story.discoverCollection" /> <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </section>
  );
}
