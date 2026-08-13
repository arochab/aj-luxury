export default function HeroIdentityOverlay() {
  return (
    <picture
      className="aj-film__identity"
      data-identity-source="client-approved-campaign-photo"
    >
      <source
        media="(max-aspect-ratio: 4 / 5)"
        srcSet="/images/client/hero-identity-overlay-portrait-v1.png"
      />
      <img
        src="/images/client/hero-identity-overlay-landscape-v1.png"
        alt=""
        width="1920"
        height="1080"
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />
    </picture>
  );
}
