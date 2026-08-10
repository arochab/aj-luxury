export const LAUNCH_PRODUCT_ID = "product_apollon";
export const LAUNCH_PRICE_CENTS = 2_999;
export const LAUNCH_CURRENCY = "EUR" as const;
export const LAUNCH_RESERVES_VALIDATED = false;

export type LaunchSize = "S" | "M" | "L" | "XL";

export type LaunchVariantSeed = {
  id: string;
  internalReference: string;
  colorKey: "pourpre" | "rose" | "lilas";
  colorName: string;
  sourceSlug: "pourpre" | "rose-pale" | "lilas-bleu-clair";
  swatch: string;
  imageUrl: string;
  size: LaunchSize;
  sortOrder: number;
  physicalQuantity: number;
  giftReserveQuantity: 0;
  safetyReserveQuantity: 0;
  reservesValidated: false;
};

type LaunchColor = Omit<
  LaunchVariantSeed,
  | "id"
  | "internalReference"
  | "size"
  | "sortOrder"
  | "physicalQuantity"
  | "giftReserveQuantity"
  | "safetyReserveQuantity"
  | "reservesValidated"
> & {
  stockBySize: Readonly<Record<LaunchSize, number>>;
};

const sizes: readonly LaunchSize[] = ["S", "M", "L", "XL"];

const colors: readonly LaunchColor[] = [
  {
    colorKey: "pourpre",
    colorName: "Pourpre Impérial",
    sourceSlug: "pourpre",
    swatch: "#7d0f52",
    imageUrl: "/images/client/raw/product-card-pourpre.webp",
    stockBySize: { S: 26, M: 103, L: 87, XL: 36 },
  },
  {
    colorKey: "rose",
    colorName: "Rose Velours",
    sourceSlug: "rose-pale",
    swatch: "#dda9bd",
    imageUrl: "/images/client/raw/product-rose-profile.webp",
    stockBySize: { S: 26, M: 103, L: 87, XL: 36 },
  },
  {
    colorKey: "lilas",
    colorName: "Lilas Céleste",
    sourceSlug: "lilas-bleu-clair",
    swatch: "#a9abd9",
    imageUrl: "/images/client/raw/product-lilas-model.webp",
    stockBySize: { S: 26, M: 102, L: 88, XL: 36 },
  },
] as const;

export const launchVariantSeed: readonly LaunchVariantSeed[] = colors.flatMap(
  (color, colorIndex) =>
    sizes.map((size, sizeIndex) => ({
      id: `variant_boxer_${color.sourceSlug}_${size.toLowerCase()}`,
      internalReference: createApollonInternalReference(color.sourceSlug, size),
      colorKey: color.colorKey,
      colorName: color.colorName,
      sourceSlug: color.sourceSlug,
      swatch: color.swatch,
      imageUrl: color.imageUrl,
      size,
      sortOrder: colorIndex * sizes.length + sizeIndex,
      physicalQuantity: color.stockBySize[size],
      giftReserveQuantity: 0 as const,
      safetyReserveQuantity: 0 as const,
      reservesValidated: false as const,
    })),
);

export const LAUNCH_VARIANT_COUNT = launchVariantSeed.length;
export const LAUNCH_PHYSICAL_QUANTITY = launchVariantSeed.reduce(
  (total, variant) => total + variant.physicalQuantity,
  0,
);

export function assertLaunchSeedIntegrity(): void {
  const ids = new Set(launchVariantSeed.map((variant) => variant.id));
  const references = new Set(
    launchVariantSeed.map((variant) => variant.internalReference),
  );

  if (LAUNCH_VARIANT_COUNT !== 12 || ids.size !== 12 || references.size !== 12) {
    throw new Error("The AJ Luxury launch seed must contain 12 unique variants.");
  }

  if (LAUNCH_PHYSICAL_QUANTITY !== 756) {
    throw new Error("The AJ Luxury launch seed must total 756 physical units.");
  }

  if (
    launchVariantSeed.some(
      (variant) =>
        variant.giftReserveQuantity !== 0 ||
        variant.safetyReserveQuantity !== 0 ||
        variant.reservesValidated,
    )
  ) {
    throw new Error(
      "Test reserves must stay at zero and unvalidated until AJ Luxury approves them.",
    );
  }
}

assertLaunchSeedIntegrity();
import { createApollonInternalReference } from "../lib/commerce/internal-reference.ts";
