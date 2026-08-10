"use client";

import { useCallback, useRef, useState } from "react";
import { HERO_VIDEO_VERSION } from "../../lib/hero-video";
import { useI18n } from "@/lib/i18n/I18nProvider";
import HeroBackgroundVideo, {
  type HeroBackgroundVideoHandle,
} from "./HeroBackgroundVideo";

export default function HeroComposition() {
  const { t } = useI18n();
  const backgroundVideoRef = useRef<HeroBackgroundVideoHandle>(null);
  const [playing, setPlaying] = useState(true);
  const [motionAvailable, setMotionAvailable] = useState(true);

  const handlePlaybackIntentChange = useCallback((nextPlaying: boolean) => {
    setPlaying(nextPlaying);
  }, []);

  const handleMotionToggle = useCallback(() => {
    if (playing) backgroundVideoRef.current?.pausePlayback();
    else backgroundVideoRef.current?.requestPlayback();
  }, [playing]);

  return (
    <>
      <div
        className="aj-film__hero-scene"
        data-hero-version={`video-${HERO_VIDEO_VERSION}`}
      >
        <HeroBackgroundVideo
          ref={backgroundVideoRef}
          playing={playing}
          onPlaybackIntentChange={handlePlaybackIntentChange}
          onMotionAvailabilityChange={setMotionAvailable}
        />

        <figure className="aj-film__portrait aj-film__portrait--sr">
          <figcaption>
            AJ Luxury — Jérémy, Alex — Apollon Lilas Céleste
          </figcaption>
        </figure>
      </div>

      {motionAvailable ? (
        <button
          type="button"
          className="aj-film__motion-toggle"
          onClick={handleMotionToggle}
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
      ) : null}
    </>
  );
}
