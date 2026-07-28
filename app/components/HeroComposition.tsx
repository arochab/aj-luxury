"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { HERO_FUSION_VERSION } from "../../lib/hero-fusion";
import { useI18n } from "@/lib/i18n/I18nProvider";
import HeroFusionField from "./HeroFusionField";

export default function HeroComposition() {
  const { t } = useI18n();
  const [playing, setPlaying] = useState(true);
  const [fusionReady, setFusionReady] = useState(false);

  const handleFusionReady = useCallback(() => {
    setFusionReady(true);
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function applyPreference() {
      if (reducedMotion.matches) setPlaying(false);
    }

    applyPreference();
    reducedMotion.addEventListener("change", applyPreference);
    return () => reducedMotion.removeEventListener("change", applyPreference);
  }, []);

  return (
    <>
      <div
        className="aj-film__hero-scene"
        data-hero-version={`fusion-${HERO_FUSION_VERSION}`}
      >
        <div
          className={`aj-film__hero-photo-base${fusionReady ? " is-ready" : ""}`}
          aria-hidden="true"
        >
          <Image
            unoptimized
            priority
            src="/images/client/hero-duo-static.webp"
            alt=""
            fill
            sizes="100vw"
            style={{ objectFit: "contain", objectPosition: "center center" }}
          />
        </div>

        <HeroFusionField playing={playing} onReady={handleFusionReady} />

        <figure className="aj-film__portrait aj-film__portrait--sr">
          <Image
            unoptimized
            priority
            src="/images/client/hero-duo-static.webp"
            alt="Les deux fondateurs et mannequins AJ Luxury portant Apollon Lilas Céleste"
            fill
            sizes="100vw"
            style={{ objectFit: "contain", objectPosition: "center center" }}
          />
        </figure>
      </div>

      <button
        type="button"
        className="aj-film__motion-toggle"
        onClick={() => setPlaying((current) => !current)}
      >
        {playing ? t("hero.pauseMetal") : t("hero.playMetal")}
      </button>
    </>
  );
}
