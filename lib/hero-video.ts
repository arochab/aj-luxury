export const HERO_VIDEO_VERSION = "v3";

const versioned = (path: string) => `${path}?v=${HERO_VIDEO_VERSION}`;

export const HERO_VIDEO_BREAKPOINTS = {
  portraitMaxAspect: 4 / 5,
  tabletMax: 1440,
  desktopMax: 2199,
} as const;

export type HeroVideoAsset = {
  src: string;
  poster: string;
  posterAvif?: string;
  posterCompact?: string;
  width: number;
  height: number;
};

export const HERO_VIDEO_ASSETS = {
  portrait: {
    src: versioned("/videos/aj-luxury-hero-v3-portrait-720x934.mp4"),
    poster: versioned(
      "/images/client/hero-v3-portrait-720x934-poster.webp",
    ),
    posterCompact: versioned(
      "/images/client/hero-v3-portrait-480x623-poster.webp",
    ),
    width: 720,
    height: 934,
  },
  tablet: {
    src: versioned("/videos/aj-luxury-hero-v3-tablet-1440x810.mp4"),
    poster: versioned(
      "/images/client/hero-v3-tablet-1440x810-poster.webp",
    ),
    posterAvif: versioned(
      "/images/client/hero-v3-tablet-1440x810-poster.avif",
    ),
    width: 1440,
    height: 810,
  },
  desktop: {
    src: versioned("/videos/aj-luxury-hero-v3-desktop-1920x1080.mp4"),
    poster: versioned(
      "/images/client/hero-v3-desktop-1920x1080-poster.webp",
    ),
    posterAvif: versioned(
      "/images/client/hero-v3-desktop-1920x1080-poster.avif",
    ),
    width: 1920,
    height: 1080,
  },
  xl: {
    src: versioned("/videos/aj-luxury-hero-v3-xl-2560x1440.mp4"),
    poster: versioned("/images/client/hero-v3-xl-2560x1440-poster.webp"),
    posterAvif: versioned("/images/client/hero-v3-xl-2560x1440-poster.avif"),
    width: 2560,
    height: 1440,
  },
} as const satisfies Record<string, HeroVideoAsset>;

export function selectHeroVideoAsset(
  viewportWidth: number,
  viewportHeight: number,
): HeroVideoAsset {
  if (
    viewportHeight > 0 &&
    viewportWidth / viewportHeight <= HERO_VIDEO_BREAKPOINTS.portraitMaxAspect
  ) {
    return HERO_VIDEO_ASSETS.portrait;
  }

  if (viewportWidth <= HERO_VIDEO_BREAKPOINTS.tabletMax) {
    return HERO_VIDEO_ASSETS.tablet;
  }

  if (viewportWidth <= HERO_VIDEO_BREAKPOINTS.desktopMax) {
    return HERO_VIDEO_ASSETS.desktop;
  }

  return HERO_VIDEO_ASSETS.xl;
}
