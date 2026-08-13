"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { preload } from "react-dom";
import {
  HERO_VIDEO_ASSETS,
  rewindHeroVideoIfEnded,
  selectHeroVideoAsset,
  type HeroVideoAsset,
} from "../../lib/hero-video";
import {
  isHeroVideoReady,
  nextHeroPlaybackIntentAfterRejection,
  shouldAttachHeroVideoSource,
  shouldPlayHeroVideo,
} from "../../lib/motion-policy";

type HeroBackgroundVideoProps = {
  playing: boolean;
  onPlaybackIntentChange: (playing: boolean) => void;
  onMotionAvailabilityChange: (available: boolean) => void;
};

export type HeroBackgroundVideoHandle = {
  pausePlayback: () => void;
  requestPlayback: () => void;
};

type NetworkInformation = EventTarget & { saveData?: boolean };
type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformation;
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

const HeroBackgroundVideo = forwardRef<
  HeroBackgroundVideoHandle,
  HeroBackgroundVideoProps
>(function HeroBackgroundVideo(
  {
    playing,
    onPlaybackIntentChange,
    onMotionAvailabilityChange,
  },
  controlRef,
) {
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
  const playbackAttemptRef = useRef(0);
  const visibleRef = useRef(true);
  const pageVisibleRef = useRef(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [saveData, setSaveData] = useState(false);
  const [sourceEnabled, setSourceEnabled] = useState(false);
  const [asset, setAsset] = useState<HeroVideoAsset | null>(null);
  const [startedAssetSrc, setStartedAssetSrc] = useState<string | null>(null);
  const sourceAttached = shouldAttachHeroVideoSource({
    sourceEnabled,
    reducedMotion,
    saveData,
  });

  const rejectPlaybackIntent = useCallback(
    (error: unknown, attempt: number, readyState: number) => {
      if (attempt !== playbackAttemptRef.current) return;
      const errorName =
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        typeof error.name === "string"
          ? error.name
          : null;
      const nextIntent = nextHeroPlaybackIntentAfterRejection({
        currentIntent: true,
        errorName,
        readyState,
      });
      if (!nextIntent) onPlaybackIntentChange(false);
    },
    [onPlaybackIntentChange],
  );

  const syncPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const attempt = ++playbackAttemptRef.current;
    if (!asset || !sourceAttached) {
      video.pause();
      return;
    }

    const canPlay = shouldPlayHeroVideo({
      playbackIntent: playing,
      assetReady: isHeroVideoReady(video.readyState),
      reducedMotion,
      inViewport: visibleRef.current,
      pageVisible: pageVisibleRef.current,
    });

    if (!canPlay) {
      if (
        !playing ||
        reducedMotion ||
        !visibleRef.current ||
        !pageVisibleRef.current
      ) {
        video.pause();
      }
      return;
    }

    if (rewindHeroVideoIfEnded(video)) {
      setStartedAssetSrc(null);
    }

    try {
      await video.play();
    } catch (error) {
      rejectPlaybackIntent(error, attempt, video.readyState);
    }
  }, [asset, playing, reducedMotion, rejectPlaybackIntent, sourceAttached]);

  const requestPlayback = useCallback(() => {
    onPlaybackIntentChange(true);

    const video = videoRef.current;
    if (
      !video ||
      !asset ||
      !sourceAttached ||
      reducedMotion ||
      !visibleRef.current ||
      !pageVisibleRef.current
    ) {
      return;
    }

    if (rewindHeroVideoIfEnded(video)) {
      setStartedAssetSrc(null);
    }

    const attempt = ++playbackAttemptRef.current;
    void video.play().catch((error: unknown) => {
      rejectPlaybackIntent(error, attempt, video.readyState);
    });
  }, [
    asset,
    onPlaybackIntentChange,
    reducedMotion,
    rejectPlaybackIntent,
    sourceAttached,
  ]);

  const pausePlayback = useCallback(() => {
    playbackAttemptRef.current += 1;
    videoRef.current?.pause();
    onPlaybackIntentChange(false);
  }, [onPlaybackIntentChange]);

  useImperativeHandle(
    controlRef,
    () => ({ pausePlayback, requestPlayback }),
    [pausePlayback, requestPlayback],
  );

  useEffect(() => {
    const firstPaintFrame = window.requestAnimationFrame(() => {
      setAsset(selectHeroVideoAsset(window.innerWidth, window.innerHeight));
      setSourceEnabled(true);
    });

    return () => {
      window.cancelAnimationFrame(firstPaintFrame);
    };
  }, []);

  useEffect(() => {
    if (!sourceAttached) return;

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
  }, [sourceAttached]);

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
    const connection = (navigator as NavigatorWithConnection).connection;
    if (!connection) return;

    const updateSaveDataPreference = () => {
      const nextSaveData = connection.saveData === true;
      setSaveData(nextSaveData);
      if (nextSaveData) onPlaybackIntentChange(false);
    };

    updateSaveDataPreference();
    connection.addEventListener("change", updateSaveDataPreference);
    return () =>
      connection.removeEventListener("change", updateSaveDataPreference);
  }, [onPlaybackIntentChange]);

  useEffect(() => {
    onMotionAvailabilityChange(!reducedMotion && !saveData);
  }, [onMotionAvailabilityChange, reducedMotion, saveData]);

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
          className={`aj-film__hero-video${
            startedAssetSrc === asset?.src
              ? " aj-film__hero-video--started"
              : ""
          }`}
          src={sourceAttached ? asset?.src : undefined}
          width={asset?.width ?? HERO_VIDEO_ASSETS.desktop.width}
          height={asset?.height ?? HERO_VIDEO_ASSETS.desktop.height}
          autoPlay={playing}
          muted
          playsInline
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          onCanPlay={() => void syncPlayback()}
          onPlaying={() => setStartedAssetSrc(asset?.src ?? null)}
          onEnded={() => onPlaybackIntentChange(false)}
          onError={() => {
            setStartedAssetSrc(null);
            onPlaybackIntentChange(false);
          }}
        />
      </div>
    </div>
  );
});

export default HeroBackgroundVideo;
