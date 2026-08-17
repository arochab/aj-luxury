"use client";

/* eslint-disable @next/next/no-img-element -- pre-optimized, client-owned campaign media */

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { T } from "../../lib/i18n/TranslatedText";
import { useI18n } from "../../lib/i18n/I18nProvider";

/**
 * Le vêtement seul et le vêtement porté sont deux prises d'un MÊME plateau :
 * même mur, même sol de marbre, même lyre, même laurier, même arc.
 * La séquence ne fabrique pas deux fonds — elle ouvre une fenêtre sur la même plaque.
 *
 * Une seule horloge : le scroll. Aucun minuteur, aucune auto-avance.
 */

const frames = [
  {
    number: "01",
    name: "sequence.color.rose" as const,
    still: "/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
    worn: "/images/client/apollon-world/apollon-rose-model-world-v1.webp",
    feature: "product.feature.3" as const,
    accent: "#d8a7ba",
    // Échantillonné sur le mur de la plaque elle-même, jamais inventé.
    ground: "#b8878f",
    // Aligne l'horizon marbre/mur entre les deux prises.
    stillPosition: "50% 46%",
    wornPosition: "50% 52%",
  },
  {
    number: "02",
    name: "sequence.color.lilac" as const,
    still: "/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
    worn: "/images/client/apollon-world/apollon-lilas-model-world-v1.webp",
    feature: "product.feature.4" as const,
    accent: "#a9abd9",
    ground: "#6f7391",
    stillPosition: "50% 46%",
    wornPosition: "50% 52%",
  },
  {
    number: "03",
    name: "sequence.color.purple" as const,
    still: "/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
    worn: "/images/client/apollon-world/apollon-pourpre-model-world-v1.webp",
    feature: "product.feature.7" as const,
    accent: "#c8608f",
    ground: "#6d2540",
    stillPosition: "50% 46%",
    wornPosition: "50% 52%",
  },
] as const;

type Timeline = {
  kill: () => void;
  scrollTrigger?: { labelToScroll: (label: string) => number } | null;
};

export default function ApollonGuidedSequence() {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(reduced.matches);
    sync();
    reduced.addEventListener("change", sync);
    return () => reduced.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const pin = pinRef.current;
    const stage = stageRef.current;
    if (!pin || !stage) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (cancelled) return;
        const gsap = gsapModule.default;
        const { ScrollTrigger } = scrollTriggerModule;
        gsap.registerPlugin(ScrollTrigger);

        const context = gsap.context(() => {
          const media = gsap.matchMedia();

          // Le scroll est l'horloge. Trois actes, une seule timeline, un seul pin.
          const buildTimeline = (span: string) => {
            const timeline = gsap.timeline({
              defaults: { ease: "none" },
              scrollTrigger: {
                trigger: pin,
                start: "top top",
                end: span,
                pin,
                pinSpacing: true,
                scrub: 1,
                anticipatePin: 1,
                invalidateOnRefresh: true,
                fastScrollEnd: 2500,
                onUpdate: (self) => {
                  // Trois actes égaux : l'index dérive du scroll, jamais d'un minuteur.
                  const next = Math.min(
                    frames.length - 1,
                    Math.floor(self.progress * frames.length * 0.999),
                  );
                  setActive((current) => (current === next ? current : next));
                },
              },
            });

            // Acte 1 — la plaque se révèle, le vêtement seul occupe tout le cadre.
            timeline
              .fromTo(
                stage,
                { "--aj-plate-scale": 1.08, "--aj-wipe": "100%" },
                { "--aj-plate-scale": 1, duration: 0.22, ease: "power2.out" },
                0,
              )
              // Acte 2 — le volet : le vêtement seul devient le vêtement porté.
              // Même plateau, même échelle, même lumière. C'est la bascule.
              .to(stage, { "--aj-wipe": "38%", duration: 0.38, ease: "power2.inOut" }, 0.24)
              // Acte 3 — le coloris change sur un décor tenu.
              .to(stage, { "--aj-wipe": "34%", duration: 0.3, ease: "power1.inOut" }, 0.68);

            timeline.addLabel("rose", 0.05);
            timeline.addLabel("lilas", 0.42);
            timeline.addLabel("pourpre", 0.78);
            return timeline;
          };

          media.add("(min-width: 981px) and (prefers-reduced-motion: no-preference)", () => {
            const timeline = buildTimeline("+=220%");
            timelineRef.current = timeline as unknown as Timeline;
            return () => {
              timeline.kill();
              timelineRef.current = null;
            };
          });

          // Le mobile n'est pas une amputation : même récit, pin vertical, volet vertical.
          media.add("(max-width: 980px) and (prefers-reduced-motion: no-preference)", () => {
            ScrollTrigger.config({ ignoreMobileResize: true });
            const timeline = buildTimeline("+=180%");
            timelineRef.current = timeline as unknown as Timeline;
            return () => {
              timeline.kill();
              timelineRef.current = null;
            };
          });

          // Après décodage des plaques, la géométrie du pin est recalculée.
          const images = Array.from(stage.querySelectorAll("img"));
          void Promise.all(
            images.map((image) => image.decode().catch(() => undefined)),
          ).then(() => {
            if (!cancelled) ScrollTrigger.refresh();
          });
        }, pin);

        cleanup = () => context.revert();
      },
    );

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  // Les onglets restent l'override manuel : ils déplacent le scroll, ils ne volent pas le contrôle.
  const selectFrame = (index: number) => {
    setActive(index);
    const label = ["rose", "lilas", "pourpre"][index];
    const trigger = timelineRef.current?.scrollTrigger;
    if (!trigger || reducedMotion) {
      sectionRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      return;
    }
    void import("gsap").then(({ default: gsap }) => {
      window.scrollTo({ top: trigger.labelToScroll(label), behavior: "auto" });
      void gsap;
    });
  };

  const frame = frames[active];

  const stageStyle = {
    "--aj-accent": frame.accent,
    "--aj-ground": frame.ground,
  } as CSSProperties;

  return (
    <section ref={sectionRef} className="aj-sequence" id="apollon" aria-labelledby="aj-sequence-title">
      <div ref={pinRef} className="aj-sequence__pin">
        <header className="aj-sequence__heading">
          <p><T id="home.apollonEyebrow" /></p>
          <h2 id="aj-sequence-title"><T id="home.incarnationTitle" /></h2>
          <p><T id="home.incarnationBody" /></p>
        </header>

        <div ref={stageRef} className="aj-sequence__stage" style={stageStyle}>
          {/* Une seule plaque. Le panneau porté est une fenêtre ouverte dessus,
              pas un second cadrage indépendant. */}
          <div className="aj-plate">
            {frames.map((item, index) => (
              <figure
                className={`aj-plate__still${index === active ? " is-active" : ""}`}
                key={`still-${item.number}`}
                aria-hidden={index !== active}
              >
                <img
                  src={item.still}
                  alt={index === active ? t("sequence.stillAlt").replace("{color}", t(item.name)) : ""}
                  width={1024}
                  height={1536}
                  style={{ objectPosition: item.stillPosition }}
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "low"}
                  decoding="async"
                />
              </figure>
            ))}

            <div className="aj-plate__wipe">
              <div className="aj-plate__wipe-inner">
                {frames.map((item, index) => (
                  <figure
                    className={`aj-plate__worn${index === active ? " is-active" : ""}`}
                    key={`worn-${item.number}`}
                    aria-hidden={index !== active}
                  >
                    <img
                      src={item.worn}
                      alt={index === active ? t("sequence.bodyAlt").replace("{color}", t(item.name)) : ""}
                      width={1731}
                      height={2600}
                      style={{ objectPosition: item.wornPosition }}
                      loading={index === 0 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "low"}
                      decoding="async"
                    />
                  </figure>
                ))}
              </div>
            </div>

            {/* Un seul étalonnage, appliqué identiquement aux deux panneaux. */}
            <div className="aj-plate__grade" aria-hidden="true" />
          </div>

          <div className="aj-sequence__copy">
            <span>{frame.number} / 03</span>
            <h3>{t(frame.name)}</h3>
            <p><T id={frame.feature} /></p>
          </div>

          <div className="aj-sequence__controls">
            <div className="aj-sequence__choices" role="tablist" aria-label={t("sequence.tablist")}>
              {frames.map((item, index) => (
                <button
                  type="button"
                  role="tab"
                  id={`aj-sequence-tab-${index}`}
                  aria-controls="aj-sequence-stage"
                  aria-selected={index === active}
                  tabIndex={index === active ? 0 : -1}
                  className={index === active ? "is-active" : ""}
                  ref={(node) => { tabRefs.current[index] = node; }}
                  onClick={() => selectFrame(index)}
                  onKeyDown={(event) => {
                    let next = index;
                    if (event.key === "ArrowRight") next = (index + 1) % frames.length;
                    else if (event.key === "ArrowLeft") next = (index - 1 + frames.length) % frames.length;
                    else if (event.key === "Home") next = 0;
                    else if (event.key === "End") next = frames.length - 1;
                    else return;
                    event.preventDefault();
                    selectFrame(next);
                    tabRefs.current[next]?.focus();
                  }}
                  key={item.number}
                >
                  <span>{item.number}</span>
                  <strong>{t(item.name)}</strong>
                </button>
              ))}
            </div>

            <Link className="aj-sequence__cta" href="/shop">
              <T id="story.discoverCollection" />
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
                <path d="M3 9L9 3M9 3H4.2M9 3V7.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
