export const HERO_VIDEO_VERSION = "v5";

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

type EndedHeroVideoTimeline = {
  ended: boolean;
  currentTime: number;
};

/* v5 est un montage aller-retour : les images 0..84 puis 83..1, 168 images a
   24 i/s. La derniere image et la premiere sont deux images CONSECUTIVES du
   master, donc le raccord de boucle est un pas de temps reel et non une coupe.
   `loop` est desormais actif sur l'element video ; ce rembobinage reste le
   filet de securite si un moteur termine malgre tout la lecture. */
export function rewindHeroVideoIfEnded(
  video: EndedHeroVideoTimeline,
): boolean {
  if (!video.ended) return false;
  video.currentTime = 0;
  return true;
}

export const HERO_VIDEO_ASSETS = {
  portrait: {
    src: versioned("/media/videos/aj-luxury-hero-v5-portrait-720x934.mp4"),
    poster: versioned(
      "/media/images/client/hero-v5-portrait-720x934-poster.webp",
    ),
    posterCompact: versioned(
      "/media/images/client/hero-v5-portrait-480x623-poster.webp",
    ),
    width: 720,
    height: 934,
  },
  tablet: {
    src: versioned("/media/videos/aj-luxury-hero-v5-tablet-1440x810.mp4"),
    poster: versioned(
      "/media/images/client/hero-v5-tablet-1440x810-poster.webp",
    ),
    posterAvif: versioned(
      "/media/images/client/hero-v5-tablet-1440x810-poster.avif",
    ),
    width: 1440,
    height: 810,
  },
  desktop: {
    src: versioned("/media/videos/aj-luxury-hero-v5-desktop-1920x1080.mp4"),
    poster: versioned(
      "/media/images/client/hero-v5-desktop-1920x1080-poster.webp",
    ),
    posterAvif: versioned(
      "/media/images/client/hero-v5-desktop-1920x1080-poster.avif",
    ),
    width: 1920,
    height: 1080,
  },
  xl: {
    src: versioned(
      "/media/videos/aj-luxury-hero-v5-xl-native-1920x1080.mp4",
    ),
    poster: versioned(
      "/media/images/client/hero-v5-xl-native-1920x1080-poster.webp",
    ),
    posterAvif: versioned(
      "/media/images/client/hero-v5-xl-native-1920x1080-poster.avif",
    ),
    width: 1920,
    height: 1080,
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
