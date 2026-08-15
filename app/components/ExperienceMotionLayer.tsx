"use client";

import { useEffect } from "react";

export default function ExperienceMotionLayer() {
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
