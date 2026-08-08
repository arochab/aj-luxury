export const HERO_VIDEO_VERSION = "v1";

const versioned = (path: string) => `${path}?v=${HERO_VIDEO_VERSION}`;

export const HERO_VIDEO_BREAKPOINTS = {
  mobileMax: 600,
  tabletMax: 1199,
} as const;

export type HeroVideoAsset = {
  src: string;
  poster: string;
  width: number;
  height: number;
};

export const HERO_VIDEO_ASSETS = {
  mobile: {
    src: versioned("/videos/aj-luxury-hero-mobile.mp4"),
    poster: versioned("/images/client/hero-metal-poster-mobile.webp"),
    width: 720,
    height: 1280,
  },
  tablet: {
    src: versioned("/videos/aj-luxury-hero-tablet.mp4"),
    poster: versioned("/images/client/hero-metal-poster.webp"),
    width: 1280,
    height: 720,
  },
  desktop: {
    src: versioned("/videos/aj-luxury-hero-desktop.mp4"),
    poster: versioned("/images/client/hero-metal-poster.webp"),
    width: 1920,
    height: 1080,
  },
} as const satisfies Record<string, HeroVideoAsset>;

export function selectHeroVideoAsset(viewportWidth: number): HeroVideoAsset {
  if (viewportWidth <= HERO_VIDEO_BREAKPOINTS.mobileMax) {
    return HERO_VIDEO_ASSETS.mobile;
  }

  if (viewportWidth <= HERO_VIDEO_BREAKPOINTS.tabletMax) {
    return HERO_VIDEO_ASSETS.tablet;
  }

  return HERO_VIDEO_ASSETS.desktop;
}
