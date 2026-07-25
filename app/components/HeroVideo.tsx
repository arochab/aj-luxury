"use client";

import { useEffect, useRef, useState } from "react";

export default function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function applyPreference() {
      if (reducedMotion.matches) {
        videoRef.current?.pause();
        setPlaying(false);
      }
    }

    applyPreference();
    reducedMotion.addEventListener("change", applyPreference);
    return () => reducedMotion.removeEventListener("change", applyPreference);
  }, []);

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      await video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  return (
    <>
      <div className="aj-film__hero-video" aria-hidden="true">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
        >
          <source
            src="/videos/aj-luxury-hero-full-mobile.mp4"
            type="video/mp4"
            media="(max-width: 760px)"
          />
          <source src="/videos/aj-luxury-hero-loop.mp4" type="video/mp4" />
        </video>
      </div>
      <button
        type="button"
        className="aj-film__video-toggle"
        aria-pressed={!playing}
        onClick={togglePlayback}
      >
        {playing ? "Pause" : "Lire"}
      </button>
    </>
  );
}
