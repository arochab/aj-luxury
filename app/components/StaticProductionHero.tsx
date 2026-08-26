import ProductionHeroMotion from "./ProductionHeroMotion";

const PORTRAIT_SRC_SET =
  "/images/client/hero-v4-portrait-480x623-poster.webp 480w, /images/client/hero-v4-portrait-720x934-poster.webp 720w";

export default function StaticProductionHero() {
  return (
    <div
      className="aj-film__hero-scene"
      data-hero-version="v4-motion-from-approved-poster"
    >
      <div className="aj-film__hero-media">
        <div className="aj-film__hero-stage">
          <picture className="aj-film__hero-poster">
            <source
              media="(max-aspect-ratio: 4 / 5)"
              srcSet={PORTRAIT_SRC_SET}
              sizes="max(100vw, calc(100svh * 720 / 934))"
            />
            <source
              type="image/avif"
              media="(min-aspect-ratio: 801 / 1000) and (min-width: 2200px)"
              srcSet="/images/client/hero-v4-xl-native-1920x1080-poster.avif"
            />
            <source
              media="(min-aspect-ratio: 801 / 1000) and (min-width: 2200px)"
              srcSet="/images/client/hero-v4-xl-native-1920x1080-poster.webp"
            />
            <source
              type="image/avif"
              media="(min-aspect-ratio: 801 / 1000) and (min-width: 1441px)"
              srcSet="/images/client/hero-v4-desktop-1920x1080-poster.avif"
            />
            <source
              media="(min-aspect-ratio: 801 / 1000) and (min-width: 1441px)"
              srcSet="/images/client/hero-v4-desktop-1920x1080-poster.webp"
            />
            <source
              type="image/avif"
              media="(min-aspect-ratio: 801 / 1000)"
              srcSet="/images/client/hero-v4-tablet-1440x810-poster.avif"
            />
            <source
              media="(min-aspect-ratio: 801 / 1000)"
              srcSet="/images/client/hero-v4-tablet-1440x810-poster.webp"
            />
            <img
              src="/images/client/hero-v4-tablet-1440x810-poster.webp"
              alt="AJ Luxury — Jérémy et Alex portent Apollon Lilas Céleste"
              width={1440}
              height={810}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </picture>
          <ProductionHeroMotion />
        </div>
      </div>

      <figure className="aj-film__portrait aj-film__portrait--sr">
        <figcaption>
          AJ Luxury — Jérémy et Alex — Apollon Lilas Céleste
        </figcaption>
      </figure>
    </div>
  );
}
