import ProductionHeroMotion from "./ProductionHeroMotion";

export default function StaticProductionHero() {
  return (
    <div
      className="aj-film__hero-scene"
      data-hero-version="isabelle-welcome-v2"
    >
      <div className="aj-film__hero-media">
        <picture className="aj-film__hero-backdrop">
          <source
            media="(max-aspect-ratio: 4 / 5)"
            srcSet="/images/client/aj-luxury-hero-vertical-approved-540.webp 540w, /images/client/aj-luxury-hero-vertical-approved-1080.webp 1080w"
            sizes="100vw"
          />
          <img
            src="/images/client/aj-luxury-hero-isabelle-v2-landscape-1920x1080-poster.webp"
            alt=""
            width={1920}
            height={1080}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div className="aj-film__hero-stage">
          <picture className="aj-film__hero-poster">
            <source
              media="(max-aspect-ratio: 4 / 5)"
              srcSet="/images/client/aj-luxury-hero-vertical-approved-540.webp 540w, /images/client/aj-luxury-hero-vertical-approved-1080.webp 1080w"
              sizes="100vw"
            />
            <img
              src="/images/client/aj-luxury-hero-isabelle-v2-landscape-1920x1080-poster.webp"
              alt="AJ Luxury — film de bienvenue Apollon Pourpre"
              width={1920}
              height={1080}
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
          AJ Luxury — Jérémy et Alex — Apollon Pourpre
        </figcaption>
      </figure>
    </div>
  );
}
