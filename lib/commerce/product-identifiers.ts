import type { ProductSize } from "../products.ts";

export const LAUNCH_PRODUCT_ID = "product_apollon" as const;

const colorReferenceCodes = {
  pourpre: "POU",
  "rose-pale": "ROS",
  "lilas-bleu-clair": "LIL",
} as const;

export type LaunchProductSlug = keyof typeof colorReferenceCodes;

export function createLaunchVariantId(
  productSlug: string,
  size: ProductSize,
): `variant_boxer_${string}_${Lowercase<ProductSize>}` {
  if (!Object.hasOwn(colorReferenceCodes, productSlug)) {
    throw new Error(`Unknown Apollon color slug: ${productSlug}`);
  }

  return `variant_boxer_${productSlug}_${size.toLowerCase()}` as
    `variant_boxer_${string}_${Lowercase<ProductSize>}`;
}

export function createApollonInternalReference(
  productSlug: string,
  size: ProductSize,
): `AJ-APO-${(typeof colorReferenceCodes)[LaunchProductSlug]}-${ProductSize}` {
  if (!Object.hasOwn(colorReferenceCodes, productSlug)) {
    throw new Error(`Unknown Apollon color slug: ${productSlug}`);
  }
  const code = colorReferenceCodes[productSlug as LaunchProductSlug];

  return `AJ-APO-${code}-${size}`;
}
