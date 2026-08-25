"use client";

import { useEffect } from "react";

export default function ApollonHorizontalRail() {
  useEffect(() => {
    const section = document.querySelector<HTMLElement>(".aj-apollon-myth");
    const rail = document.querySelector<HTMLElement>(".aj-apollon-myth__rail");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!section || !rail) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      if (window.innerWidth <= 760 || reducedMotion.matches) {
        rail.style.removeProperty("transform");
        return;
      }

      const start = section.offsetTop;
      const range = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, (window.scrollY - start) / range));
      const distance = Math.max(0, rail.scrollWidth - window.innerWidth);
      rail.style.transform = `translate3d(${-progress * distance}px, 0, 0)`;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reducedMotion.addEventListener("change", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reducedMotion.removeEventListener("change", schedule);
      rail.style.removeProperty("transform");
    };
  }, []);

  return null;
}
