"use client";

import { useEffect, useRef, useState } from "react";

type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean };
};

export default function ProductionHeroMotion() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sourceEnabled, setSourceEnabled] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const mobileStill = window.matchMedia("(max-aspect-ratio: 4 / 5)");
    const saveData = (navigator as NavigatorWithConnection).connection
      ?.saveData;
    if (mobileStill.matches || reducedMotion.matches || saveData) return;

    const video = videoRef.current;
    if (!video) return;

    if (typeof IntersectionObserver === "undefined") {
      const fallback = window.setTimeout(() => setSourceEnabled(true), 0);
      return () => window.clearTimeout(fallback);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          video.pause();
          return;
        }

        setSourceEnabled(true);
        if (video.currentTime > 0 && !video.ended) {
          void video.play().catch(() => undefined);
        }
      },
      { threshold: 0.08 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sourceEnabled) return;

    video.load();
    void video.play().catch(() => {
      // The approved photograph remains fully visible when autoplay is denied.
    });
  }, [sourceEnabled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVisibility = () => {
      if (document.hidden) {
        video.pause();
      } else if (sourceEnabled && !video.ended) {
        void video.play().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [sourceEnabled]);

  return (
    <video
      ref={videoRef}
      className={`aj-film__hero-video${started ? " aj-film__hero-video--started" : ""}`}
      muted
      playsInline
      autoPlay
      loop
      preload="none"
      aria-hidden="true"
      onPlaying={() => setStarted(true)}
    >
      {sourceEnabled ? (
        <source
          media="(min-aspect-ratio: 4 / 5)"
          src="/videos/aj-luxury-hero-isabelle-v2-landscape-1920x1080-realesrgan.mp4?v=2"
          type="video/mp4"
        />
      ) : null}
    </video>
  );
}
