import type { ProductVariant } from "./types";
import { products, sizes } from "../products";

/**
 * Source de vérité de la maquette au 23/07/2026 :
 * 1 boxer × 3 coloris × 4 tailles = 12 variantes, 756 unités reçues.
 * La quantité influenceurs et la répartition entre trois lots restent à arbitrer.
 */
export const launchVariants: ProductVariant[] = products.flatMap((product) =>
  sizes.map((size) => ({
    id: `variant_boxer_${product.slug}_${size.toLowerCase()}`,
    productId: `product_boxer_${product.slug}`,
    productSlug: product.slug,
    productName: product.model,
    title: `${product.name} / ${size}`,
    sku: `AJ-BOX-${product.slug.slice(0, 3).toUpperCase()}-${size}`,
    options: [
      { name: "color" as const, value: product.name },
      { name: "size" as const, value: size },
    ],
    color: {
      name: product.name,
      swatch: product.swatch,
    },
    size,
    imageUrl: product.image,
    price: {
      amountCents: product.priceCents,
      currency: "EUR" as const,
    },
    availableForSale: product.inventory[size] > 0,
    inventoryPolicy: "deny-when-empty" as const,
    inventoryQuantity: product.inventory[size],
  })),
);

export function getLaunchVariant(variantId: string) {
  return launchVariants.find((variant) => variant.id === variantId) ?? null;
}

export function getDemoVariant() {
  return launchVariants.find(
    (variant) =>
      variant.color.name === "Pourpre Impérial" && variant.size === "M",
  )!;
}
