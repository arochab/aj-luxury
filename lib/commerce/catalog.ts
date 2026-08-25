import type { ProductVariant } from "./types.ts";
import { products, sizes } from "../products.ts";
import { deepFreeze } from "../deep-freeze.ts";
import { getInternalStockPosition } from "./internal-stock.ts";
import {
  createApollonInternalReference,
  createLaunchVariantId,
  LAUNCH_PRODUCT_ID,
} from "./product-identifiers.ts";

/**
 * Catalogue de simulation : les quantités restent dans le registre interne.
 * La projection publique ne reçoit jamais la quantité disponible à la vente.
 */
const canonicalLaunchVariants: readonly ProductVariant[] = deepFreeze(
  products.flatMap((product) =>
    sizes.map((size) => {
      const stock = getInternalStockPosition(product.slug, size);

      return {
        id: createLaunchVariantId(product.slug, size),
        productId: LAUNCH_PRODUCT_ID,
        productSlug: product.slug,
        productName: product.model,
        title: `${product.name} / ${size}`,
        sku: createApollonInternalReference(product.slug, size),
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
        availableForSale: stock.availableToSell > 0,
        inventoryPolicy: "deny-when-empty" as const,
        inventoryQuantity: stock.availableToSell,
      };
    }),
  ),
);

/** Frozen compatibility view over the private canonical catalogue. */
export const launchVariants: readonly ProductVariant[] = canonicalLaunchVariants;

function cloneVariant(variant: ProductVariant): ProductVariant {
  return {
    ...variant,
    options: variant.options.map((option) => ({ ...option })),
    color: { ...variant.color },
    price: { ...variant.price },
  };
}

export function listLaunchVariants(): ProductVariant[] {
  return canonicalLaunchVariants.map(cloneVariant);
}

export function getLaunchVariant(variantId: string) {
  const variant = canonicalLaunchVariants.find(
    (candidate) => candidate.id === variantId,
  );
  return variant ? cloneVariant(variant) : null;
}

export function getDemoVariant() {
  const variant = canonicalLaunchVariants.find(
    (variant) =>
      variant.color.name === "Pourpre Impérial" && variant.size === "M",
  );
  if (!variant) {
    throw new Error("The canonical Apollon demo variant is unavailable.");
  }
  return cloneVariant(variant);
}
