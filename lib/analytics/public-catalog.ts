import {
  createLaunchVariantId,
  LAUNCH_PRODUCT_ID,
} from "../commerce/product-identifiers.ts";
import { deepFreeze } from "../deep-freeze.ts";
import { products, sizes } from "../products.ts";

export type PublicAnalyticsCatalogVariant = {
  readonly variantId: string;
  readonly productId: typeof LAUNCH_PRODUCT_ID;
  readonly unitPriceMinor: number;
  readonly currency: "EUR";
};

/*
 * Browser-safe price and identity projection. It is intentionally built only
 * from public product data: no stock ledger, availability or inventory field
 * is reachable from this module's import graph.
 */
const publicAnalyticsCatalog: readonly PublicAnalyticsCatalogVariant[] =
  deepFreeze(
    products.flatMap((product) =>
      sizes.map((size) => ({
        variantId: createLaunchVariantId(product.slug, size),
        productId: LAUNCH_PRODUCT_ID,
        unitPriceMinor: product.priceCents,
        currency: "EUR" as const,
      })),
    ),
  );

export function getPublicAnalyticsCatalog(): readonly PublicAnalyticsCatalogVariant[] {
  return publicAnalyticsCatalog;
}
