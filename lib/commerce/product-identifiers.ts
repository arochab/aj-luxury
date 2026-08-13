import { sizes, type ProductSize } from "../products.ts";

export const LAUNCH_PRODUCT_ID = "product_apollon" as const;

const colorReferenceCodes = {
  pourpre: "POU",
  "rose-pale": "ROS",
  "lilas-bleu-clair": "LIL",
} as const;

export type LaunchProductSlug = keyof typeof colorReferenceCodes;
export type ApollonInternalReference =
  `AJ-APO-${(typeof colorReferenceCodes)[LaunchProductSlug]}-${ProductSize}`;

const referenceCodeToSlug = new Map<string, LaunchProductSlug>(
  Object.entries(colorReferenceCodes).map(([slug, code]) => [
    code,
    slug as LaunchProductSlug,
  ]),
);

export function isLaunchProductSlug(
  value: string,
): value is LaunchProductSlug {
  return Object.hasOwn(colorReferenceCodes, value);
}

export function isLaunchProductSize(value: string): value is ProductSize {
  return sizes.includes(value as ProductSize);
}

export function createLaunchVariantId(
  productSlug: string,
  size: ProductSize,
): `variant_boxer_${LaunchProductSlug}_${Lowercase<ProductSize>}` {
  if (!isLaunchProductSlug(productSlug)) {
    throw new Error(`Unknown Apollon color slug: ${productSlug}`);
  }
  if (!isLaunchProductSize(size)) {
    throw new Error(`Unknown Apollon size: ${size}`);
  }

  return `variant_boxer_${productSlug}_${size.toLowerCase()}` as
    `variant_boxer_${LaunchProductSlug}_${Lowercase<ProductSize>}`;
}

export function createApollonInternalReference(
  productSlug: string,
  size: ProductSize,
): ApollonInternalReference {
  if (!isLaunchProductSlug(productSlug)) {
    throw new Error(`Unknown Apollon color slug: ${productSlug}`);
  }
  if (!isLaunchProductSize(size)) {
    throw new Error(`Unknown Apollon size: ${size}`);
  }
  const code = colorReferenceCodes[productSlug];

  return `AJ-APO-${code}-${size}`;
}

export function parseApollonInternalReference(
  reference: string,
): { productSlug: LaunchProductSlug; size: ProductSize } | null {
  const match = /^AJ-APO-([A-Z]{3})-(S|M|L|XL)$/.exec(reference);
  if (!match || !isLaunchProductSize(match[2])) return null;

  const productSlug = referenceCodeToSlug.get(match[1]);
  return productSlug ? { productSlug, size: match[2] } : null;
}
