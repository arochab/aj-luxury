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

const HERO_POSTER_MEDIA = {
  portrait: "(max-aspect-ratio: 4 / 5)",
  tablet: "(min-aspect-ratio: 801 / 1000) and (max-width: 1440px)",
  desktop:
    "(min-aspect-ratio: 801 / 1000) and (min-width: 1441px) and (max-width: 2199px)",
  xl: "(min-aspect-ratio: 801 / 1000) and (min-width: 2200px)",
} as const;

const PORTRAIT_POSTER_SRC_SET = `${HERO_VIDEO_ASSETS.portrait.posterCompact} 480w, ${HERO_VIDEO_ASSETS.portrait.poster} 720w`;
const PORTRAIT_POSTER_SIZES =
  "min(100vw, calc(70svh * 720 / 934))";

type HeroPosterProps = {
  className: string;
  priority: "high" | "auto";
};

function HeroPoster({ className, priority }: HeroPosterProps) {
  return (
    <picture className={className}>
      <source
        media={HERO_POSTER_MEDIA.portrait}
        srcSet={PORTRAIT_POSTER_SRC_SET}
        sizes={PORTRAIT_POSTER_SIZES}
      />
      <source
        type="image/avif"
        media={HERO_POSTER_MEDIA.xl}
        srcSet={HERO_VIDEO_ASSETS.xl.posterAvif}
      />
      <source
        media={HERO_POSTER_MEDIA.xl}
        srcSet={HERO_VIDEO_ASSETS.xl.poster}
      />
      <source
        type="image/avif"
        media={HERO_POSTER_MEDIA.desktop}
        srcSet={HERO_VIDEO_ASSETS.desktop.posterAvif}
      />
      <source
        media={HERO_POSTER_MEDIA.desktop}
        srcSet={HERO_VIDEO_ASSETS.desktop.poster}
      />
      <source
        type="image/avif"
        media={HERO_POSTER_MEDIA.tablet}
        srcSet={HERO_VIDEO_ASSETS.tablet.posterAvif}
      />
      <source
        media={HERO_POSTER_MEDIA.tablet}
        srcSet={HERO_VIDEO_ASSETS.tablet.poster}
      />
      <img
        src={HERO_VIDEO_ASSETS.tablet.poster}
        alt=""
        width={HERO_VIDEO_ASSETS.tablet.width}
        height={HERO_VIDEO_ASSETS.tablet.height}
        loading="eager"
        fetchPriority={priority}
        decoding="async"
      />
    </picture>
  );
}

export default function HeroBackgroundVideo({
  playing,
  onPlaybackIntentChange,
}: HeroBackgroundVideoProps) {
  preload(HERO_VIDEO_ASSETS.portrait.posterCompact, {
    as: "image",
    fetchPriority: "high",
    media: HERO_POSTER_MEDIA.portrait,
    imageSrcSet: PORTRAIT_POSTER_SRC_SET,
    imageSizes: PORTRAIT_POSTER_SIZES,
  });
  for (const role of ["tablet", "desktop", "xl"] as const) {
    preload(HERO_VIDEO_ASSETS[role].posterAvif, {
      as: "image",
      type: "image/avif",
      fetchPriority: "high",
      media: HERO_POSTER_MEDIA[role],
    });
  }

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
      const nextAsset = selectHeroVideoAsset(
        window.innerWidth,
        window.innerHeight,
      );
      setAsset((current) =>
        current?.src === nextAsset.src ? current : nextAsset,
      );
    };

    updateAsset();
    const responsiveQueries = [
      window.matchMedia(HERO_POSTER_MEDIA.portrait),
      window.matchMedia("(max-width: 1440px)"),
      window.matchMedia("(max-width: 2199px)"),
    ];
    for (const query of responsiveQueries) {
      query.addEventListener("change", updateAsset);
    }

    return () => {
      for (const query of responsiveQueries) {
        query.removeEventListener("change", updateAsset);
      }
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
    <div className="aj-film__hero-media">
      <HeroPoster className="aj-film__hero-backdrop" priority="auto" />

      <div className="aj-film__hero-stage">
        <HeroPoster className="aj-film__hero-poster" priority="high" />
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
      </div>
    </div>
  );
}
