"use client";

import { useEffect } from "react";

export default function ExperienceMotionLayer() {
  useEffect(() => {
    const featured = document.querySelector<HTMLElement>(".aj-featured");
    const moodboard = document.querySelector<HTMLElement>(".aj-moodboard");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const figures = featured
      ? [...featured.querySelectorAll<HTMLElement>(".aj-featured__image")]
      : [];

    const moveFeatured = (event: PointerEvent) => {
      if (!featured || reduced.matches || coarse.matches) return;
      const box = featured.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      featured.style.setProperty("--aj-spot-x", `${(x + 0.5) * 100}%`);
      featured.style.setProperty("--aj-spot-y", `${(y + 0.5) * 100}%`);
      figures.forEach((figure, index) => {
        const depth = index === 1 ? 14 : 8;
        figure.style.transform = `translate3d(${x * depth}px, ${y * depth}px, 0)`;
      });
    };
    const leaveFeatured = () => {
      figures.forEach((figure) => figure.style.removeProperty("transform"));
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

    featured?.addEventListener("pointermove", moveFeatured);
    featured?.addEventListener("pointerleave", leaveFeatured);
    moodboard?.addEventListener("pointerdown", startDrag);
    moodboard?.addEventListener("pointermove", drag);
    moodboard?.addEventListener("pointerup", stopDrag);
    moodboard?.addEventListener("pointercancel", stopDrag);
    moodboard?.addEventListener("keydown", keyScroll);
    return () => {
      featured?.removeEventListener("pointermove", moveFeatured);
      featured?.removeEventListener("pointerleave", leaveFeatured);
      moodboard?.removeEventListener("pointerdown", startDrag);
      moodboard?.removeEventListener("pointermove", drag);
      moodboard?.removeEventListener("pointerup", stopDrag);
      moodboard?.removeEventListener("pointercancel", stopDrag);
      moodboard?.removeEventListener("keydown", keyScroll);
    };
  }, []);

  return null;
}
