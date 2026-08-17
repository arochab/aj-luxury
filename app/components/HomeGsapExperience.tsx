"use client";

import { useEffect } from "react";

export default function HomeGsapExperience() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".aj-home");
    if (!root) return;

    let cancelled = false;
    let revertGsap: (() => void) | undefined;

    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (cancelled) return;
        const gsap = gsapModule.default;
        const { ScrollTrigger } = scrollTriggerModule;
        gsap.registerPlugin(ScrollTrigger);

        const context = gsap.context(() => {
          const media = gsap.matchMedia();
          media.add("(prefers-reduced-motion: no-preference)", () => {
            gsap.fromTo(
              ".aj-film__signature > *",
              { autoAlpha: 0, y: 18 },
              { autoAlpha: 1, y: 0, duration: 1, stagger: 0.12, delay: 0.55, ease: "power3.out" },
            );

            const proofTimeline = gsap.timeline({
              scrollTrigger: {
                trigger: ".aj-proof",
                start: "top 82%",
                end: "bottom 30%",
                scrub: 0.7,
              },
            });
            proofTimeline
              .fromTo(".aj-proof > p", { autoAlpha: 0, x: -28 }, { autoAlpha: 1, x: 0, duration: 0.22, ease: "power3.out" }, 0)
              .fromTo(".aj-proof__material--modal dt", { autoAlpha: 0, xPercent: -12 }, { autoAlpha: 1, xPercent: 0, duration: 0.58, ease: "power4.out" }, 0.04)
              .fromTo(".aj-proof__material--elastic", { autoAlpha: 0, yPercent: 18 }, { autoAlpha: 1, yPercent: 0, duration: 0.5, ease: "power3.out" }, 0.22)
              .fromTo(".aj-proof__meta > div", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.36, stagger: 0.08, ease: "power3.out" }, 0.42);

            gsap.from(".aj-sequence__heading > *", {
              autoAlpha: 0,
              y: 34,
              duration: 0.95,
              stagger: 0.1,
              ease: "power4.out",
              scrollTrigger: { trigger: ".aj-sequence", start: "top 78%", once: true },
            });

            gsap.from(".aj-shop__heading > *", {
              autoAlpha: 0,
              y: 30,
              duration: 0.9,
              stagger: 0.1,
              ease: "power3.out",
              scrollTrigger: { trigger: ".aj-shop", start: "top 80%", once: true },
            });
            gsap.from(".aj-product-card", {
              autoAlpha: 0,
              yPercent: 8,
              duration: 1.05,
              stagger: 0.12,
              ease: "power4.out",
              scrollTrigger: { trigger: ".aj-shop__rail", start: "top 82%", once: true },
            });

            gsap.fromTo(
              ".aj-product-card__image img",
              { clipPath: "inset(0 0 12% 0)", yPercent: 3 },
              {
                clipPath: "inset(0 0 0% 0)",
                yPercent: 0,
                ease: "none",
                stagger: 0.08,
                scrollTrigger: {
                  trigger: ".aj-shop__rail",
                  start: "top 86%",
                  end: "bottom 42%",
                  scrub: 0.75,
                },
              },
            );

            gsap.from(".aj-moodboard__item", {
              autoAlpha: 0,
              y: 42,
              duration: 1.1,
              stagger: 0.11,
              ease: "power3.out",
              scrollTrigger: { trigger: ".aj-moodboard", start: "top 82%", once: true },
            });
            gsap.from(".aj-story__copy > div", {
              autoAlpha: 0,
              y: 46,
              duration: 1.1,
              ease: "power4.out",
              scrollTrigger: { trigger: ".aj-story", start: "top 72%", once: true },
            });
            gsap.fromTo(
              ".aj-story__metal",
              { scale: 1.06, yPercent: -3 },
              {
                scale: 1,
                yPercent: 3,
                ease: "none",
                scrollTrigger: {
                  trigger: ".aj-story",
                  start: "top bottom",
                  end: "bottom top",
                  scrub: 0.8,
                },
              },
            );
          });

          // La séquence Apollon a désormais UNE SEULE autorité d'animation :
          // ApollonGuidedSequence.tsx, qui porte son propre pin et son propre volet.
          // Un second pin sur .aj-sequence__stage créait deux pin-spacers concurrents
          // sur la même section. Ne le réintroduis pas ici.
          revertGsap = () => media.revert();
        }, root);

        const revertMedia = revertGsap;
        revertGsap = () => {
          revertMedia?.();
          context.revert();
        };
      },
    );

    return () => {
      cancelled = true;
      revertGsap?.();
    };
  }, []);

  useEffect(() => {
    const moodboard = document.querySelector<HTMLElement>(".aj-moodboard");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateProgress = () => {
      if (!moodboard) return;
      const distance = moodboard.scrollWidth - moodboard.clientWidth;
      const progress = distance > 0 ? moodboard.scrollLeft / distance : 1;
      moodboard.style.setProperty("--aj-gallery-progress", String(progress));
    };

    let dragging = false;
    let originX = 0;
    let originScroll = 0;
    const startDrag = (event: PointerEvent) => {
      if (!moodboard || event.pointerType === "touch") return;
      dragging = true;
      originX = event.clientX;
      originScroll = moodboard.scrollLeft;
      moodboard.setPointerCapture(event.pointerId);
      moodboard.classList.add("is-dragging");
    };
    const drag = (event: PointerEvent) => {
      if (dragging && moodboard) moodboard.scrollLeft = originScroll - (event.clientX - originX);
    };
    const stopDrag = () => {
      dragging = false;
      moodboard?.classList.remove("is-dragging");
    };
    const keyScroll = (event: KeyboardEvent) => {
      if (!moodboard || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      moodboard.scrollBy({
        left: event.key === "ArrowRight" ? 160 : -160,
        behavior: reduced.matches ? "auto" : "smooth",
      });
    };

    moodboard?.addEventListener("pointerdown", startDrag);
    moodboard?.addEventListener("pointermove", drag);
    moodboard?.addEventListener("pointerup", stopDrag);
    moodboard?.addEventListener("pointercancel", stopDrag);
    moodboard?.addEventListener("keydown", keyScroll);
    moodboard?.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress, { passive: true });
    updateProgress();
    return () => {
      moodboard?.removeEventListener("pointerdown", startDrag);
      moodboard?.removeEventListener("pointermove", drag);
      moodboard?.removeEventListener("pointerup", stopDrag);
      moodboard?.removeEventListener("pointercancel", stopDrag);
      moodboard?.removeEventListener("keydown", keyScroll);
      moodboard?.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  return null;
}
