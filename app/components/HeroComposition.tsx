"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import MetallicField from "./MetallicField";

export default function HeroComposition() {
  const [playing, setPlaying] = useState(true);

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
      <div className="aj-film__hero-scene">
        <div className="aj-film__color-wash" aria-hidden="true" />

        <div className="aj-film__photo-backdrop" aria-hidden="true">
          <Image
            unoptimized
            priority
            src="/images/client/hero-duo-static.webp"
            alt=""
            fill
            sizes="100vw"
            style={{ objectFit: "cover", objectPosition: "center 46%" }}
          />
        </div>

        <div className="aj-film__liquid-metal" aria-hidden="true">
          <MetallicField
            motion={playing ? "normal" : "still"}
            variant="reference"
          />
        </div>

        <div className="aj-film__photo-plate" aria-hidden="true">
          <Image
            unoptimized
            priority
            src="/images/client/hero-duo-static.webp"
            alt=""
            fill
            sizes="100vw"
            style={{ objectFit: "contain", objectPosition: "center bottom" }}
          />
        </div>

        <div className="aj-film__studio-light" aria-hidden="true" />

        <figure className="aj-film__portrait">
          <Image
            unoptimized
            priority
            src="/images/client/hero-duo-cutout.png"
            alt="Les deux fondateurs et mannequins AJ Luxury portant Apollon Lilas Céleste"
            fill
            sizes="100vw"
            style={{ objectFit: "contain", objectPosition: "center bottom" }}
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
