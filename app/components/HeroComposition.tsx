"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import MetallicField from "./MetallicField";

export default function HeroComposition() {
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function applyPreference() {
      if (reducedMotion.matches) {
        setPlaying(false);
      }
    }

    applyPreference();
    reducedMotion.addEventListener("change", applyPreference);
    return () => reducedMotion.removeEventListener("change", applyPreference);
  }, []);

  return (
    <>
      <div className="aj-film__hero-scene">
        <div className="aj-film__liquid-metal" aria-hidden="true">
          <MetallicField
            motion={playing ? "normal" : "still"}
            variant="graphite"
          />
        </div>
        <figure className="aj-film__portrait">
          <Image
            unoptimized
            priority
            src="/images/client/hero-duo-static.webp"
            alt="Les deux fondateurs et mannequins AJ Luxury portant Apollon Pourpre Impérial"
            fill
            sizes="(max-width: 760px) 100vw, 72vw"
          />
        </figure>
      </div>
      <button
        type="button"
        className="aj-film__motion-toggle"
        onClick={() => setPlaying((current) => !current)}
      >
        {playing ? "Figer le métal" : "Animer le métal"}
      </button>
    </>
  );
}
