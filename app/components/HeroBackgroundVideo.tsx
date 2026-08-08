"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const visibleRef = useRef(true);
  const pageVisibleRef = useRef(true);
  const [reducedMotion, setReducedMotion] = useState(false);
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
  }, []);

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
    <video
      ref={videoRef}
      className="aj-film__hero-video"
      src={asset?.src}
      poster={asset?.poster ?? HERO_VIDEO_ASSETS.desktop.poster}
      width={asset?.width ?? HERO_VIDEO_ASSETS.desktop.width}
      height={asset?.height ?? HERO_VIDEO_ASSETS.desktop.height}
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
      disablePictureInPicture
      controlsList="nodownload noplaybackrate noremoteplayback"
      onCanPlay={() => void syncPlayback()}
      onError={() => onPlaybackIntentChange(false)}
    />
  );
}
