"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import {
  HERO_VIDEO_ASSETS,
  selectHeroVideoAsset,
  type HeroVideoAsset,
} from "../../lib/hero-video";
import { shouldPlayHeroVideo } from "../../lib/motion-policy";

type HeroBackgroundVideoProps = {
  playing: boolean;
  onPlaybackIntentChange: (playing: boolean) => void;
};

export default function HeroBackgroundVideo({
  playing,
  onPlaybackIntentChange,
}: HeroBackgroundVideoProps) {
  preload(HERO_VIDEO_ASSETS.mobile.poster, {
    as: "image",
    fetchPriority: "high",
    media: "(max-width: 600px)",
  });
  preload(HERO_VIDEO_ASSETS.desktop.poster, {
    as: "image",
    fetchPriority: "high",
    media: "(min-width: 601px)",
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const visibleRef = useRef(true);
  const pageVisibleRef = useRef(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sourceEnabled, setSourceEnabled] = useState(false);
  const [asset, setAsset] = useState<HeroVideoAsset | null>(null);

  const syncPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !asset) return;

    const canPlay = shouldPlayHeroVideo({
      playbackIntent: playing,
      assetReady: true,
      reducedMotion,
      inViewport: visibleRef.current,
      pageVisible: pageVisibleRef.current,
    });

    if (!canPlay) {
      video.pause();
      return;
    }

    try {
      await video.play();
    } catch {
      onPlaybackIntentChange(false);
    }
  }, [asset, onPlaybackIntentChange, playing, reducedMotion]);

  useEffect(() => {
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

    const enableSource = () => setSourceEnabled(true);
    const scheduleSource = () => {
      if ("requestIdleCallback" in window) {
        idleHandle = window.requestIdleCallback(enableSource, { timeout: 1800 });
        return;
      }
      timeoutHandle = globalThis.setTimeout(enableSource, 250);
    };

    if (document.readyState === "complete") scheduleSource();
    else window.addEventListener("load", scheduleSource, { once: true });

    return () => {
      window.removeEventListener("load", scheduleSource);
      if (idleHandle !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) globalThis.clearTimeout(timeoutHandle);
    };
  }, []);

  useEffect(() => {
    if (!sourceEnabled || reducedMotion) return;

    const updateAsset = () => {
      const nextAsset = selectHeroVideoAsset(window.innerWidth);
      setAsset((current) =>
        current?.src === nextAsset.src ? current : nextAsset,
      );
    };

    updateAsset();
    const mobileQuery = window.matchMedia("(max-width: 600px)");
    const tabletQuery = window.matchMedia(
      "(min-width: 601px) and (max-width: 1199px)",
    );
    mobileQuery.addEventListener("change", updateAsset);
    tabletQuery.addEventListener("change", updateAsset);

    return () => {
      mobileQuery.removeEventListener("change", updateAsset);
      tabletQuery.removeEventListener("change", updateAsset);
    };
  }, [reducedMotion, sourceEnabled]);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      setReducedMotion(motionQuery.matches);
      if (motionQuery.matches) onPlaybackIntentChange(false);
    };

    updateMotionPreference();
    motionQuery.addEventListener("change", updateMotionPreference);
    return () =>
      motionQuery.removeEventListener("change", updateMotionPreference);
  }, [onPlaybackIntentChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        void syncPlayback();
      },
      { threshold: 0.01 },
    );
    observer.observe(video);

    const updatePageVisibility = () => {
      pageVisibleRef.current = !document.hidden;
      void syncPlayback();
    };
    updatePageVisibility();
    document.addEventListener("visibilitychange", updatePageVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updatePageVisibility);
    };
  }, [asset, syncPlayback]);

  useEffect(() => {
    void syncPlayback();
  }, [asset, syncPlayback]);

  return (
    <>
      <picture className="aj-film__hero-poster">
        <source
          media="(max-width: 600px)"
          srcSet={HERO_VIDEO_ASSETS.mobile.poster}
        />
        <img
          src={HERO_VIDEO_ASSETS.desktop.poster}
          alt=""
          width={HERO_VIDEO_ASSETS.desktop.width}
          height={HERO_VIDEO_ASSETS.desktop.height}
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      </picture>
      <video
        ref={videoRef}
        className="aj-film__hero-video"
        src={asset?.src}
        width={asset?.width ?? HERO_VIDEO_ASSETS.desktop.width}
        height={asset?.height ?? HERO_VIDEO_ASSETS.desktop.height}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
        disablePictureInPicture
        controlsList="nodownload noplaybackrate noremoteplayback"
        onCanPlay={() => void syncPlayback()}
        onError={() => onPlaybackIntentChange(false)}
      />
    </>
  );
}
