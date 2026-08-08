"use client";

/* eslint-disable @next/next/no-img-element -- responsive lossless local assets intentionally avoid the client image runtime */

import { useCallback, useState } from "react";
import { HERO_VIDEO_VERSION } from "../../lib/hero-video";
import { useI18n } from "@/lib/i18n/I18nProvider";
import HeroBackgroundVideo from "./HeroBackgroundVideo";

export default function HeroComposition() {
  const { t } = useI18n();
  const [playing, setPlaying] = useState(true);

  const handlePlaybackIntentChange = useCallback((nextPlaying: boolean) => {
    setPlaying(nextPlaying);
  }, []);

  return (
    <>
      <div
        className="aj-film__hero-scene"
        data-hero-version={`video-${HERO_VIDEO_VERSION}`}
      >
        <HeroBackgroundVideo
          playing={playing}
          onPlaybackIntentChange={handlePlaybackIntentChange}
        />

        <div className="aj-film__hero-photo-base" aria-hidden="true">
          <div className="aj-film__hero-photo-frame aj-film__hero-photo-frame--background">
            <img
              src="/images/client/hero-duo-static.webp"
              alt=""
              width={1464}
              height={2200}
              loading="eager"
              fetchPriority="auto"
              decoding="async"
              sizes="(max-aspect-ratio: 1464/2200) 100vw, 67vh"
            />
          </div>
          <div className="aj-film__hero-photo-frame aj-film__hero-photo-frame--subjects">
            <img
              src="/images/client/hero-duo-cutout-v1.webp"
              srcSet="/images/client/hero-duo-cutout-768-v1.webp 768w, /images/client/hero-duo-cutout-1024-v1.webp 1024w, /images/client/hero-duo-cutout-1280-v1.webp 1280w, /images/client/hero-duo-cutout-v1.webp 1464w"
              alt=""
              width={1464}
              height={2200}
              loading="eager"
              fetchPriority="auto"
              decoding="async"
              sizes="(max-aspect-ratio: 1464/2200) 100vw, 67vh"
            />
          </div>
        </div>

        <figure className="aj-film__portrait aj-film__portrait--sr">
          <figcaption>
            AJ Luxury — Jérémy, Alex — Apollon Lilas Céleste
          </figcaption>
        </figure>
      </div>

      <button
        type="button"
        className="aj-film__motion-toggle"
        onClick={() => handlePlaybackIntentChange(!playing)}
        aria-label={playing ? t("hero.pauseMetal") : t("hero.playMetal")}
        aria-pressed={!playing}
      >
        <span className="aj-film__motion-toggle-icon" aria-hidden="true">
          {playing ? "Ⅱ" : "▶"}
        </span>
        <span className="aj-film__motion-toggle-text">
          {playing ? t("hero.pauseMetal") : t("hero.playMetal")}
        </span>
      </button>
    </>
  );
}
