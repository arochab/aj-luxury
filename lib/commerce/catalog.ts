import type { ProductVariant } from "./types.ts";
import { products, sizes } from "../products.ts";
import { deepFreeze } from "../deep-freeze.ts";
import { getInternalStockPosition } from "./internal-stock.ts";
import {
  buildInternalVariantReference,
  isLaunchColorSlug,
} from "./internal-reference.ts";

/**
 * Catalogue de simulation : les quantités restent dans le registre interne.
 * La projection publique ne reçoit jamais la quantité disponible à la vente.
 */
export const launchVariants: ProductVariant[] = deepFreeze(
  products.flatMap((product) =>
    sizes.map((size) => {
      const stock = getInternalStockPosition(product.slug, size);
      if (!isLaunchColorSlug(product.slug)) {
        throw new Error(`Unsupported launch color slug: ${product.slug}`);
      }

      return {
        id: `variant_boxer_${product.slug}_${size.toLowerCase()}`,
        productId: `product_boxer_${product.slug}`,
        productSlug: product.slug,
        productName: product.model,
        title: `${product.name} / ${size}`,
        sku: buildInternalVariantReference(product.slug, size),
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

export function getLaunchVariant(variantId: string) {
  return launchVariants.find((variant) => variant.id === variantId) ?? null;
}

export function getDemoVariant() {
  return launchVariants.find(
    (variant) =>
      variant.color.name === "Pourpre Impérial" && variant.size === "M",
  )!;
}
