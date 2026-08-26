import { sizes, type ProductSize } from "../products.ts";
import type {
  PublicStockBySize,
  PublicStockStatus,
} from "./public-stock.ts";
import { getLaunchInventoryPosition } from "./launch-inventory.ts";

export type InternalStockPosition = {
  physical: number;
  reserved: number;
  availableToSell: number;
};

type InternalStockInput = {
  physical: number;
  reserved: number;
};

type InternalStockLedger = Record<
  string,
  Record<ProductSize, InternalStockInput>
>;

/**
 * Registre interne de la maquette.
 *
 * Il prépare le contrat de données d'un futur back-office sans prétendre
 * fournir une synchronisation ou une réservation transactionnelle.
 * Ce module ne doit jamais être importé par un composant client.
 */
const launchStockLedger: InternalStockLedger = Object.fromEntries(
  ["pourpre", "rose-pale", "lilas-bleu-clair"].map((slug) => [
    slug,
    Object.fromEntries(sizes.map((size) => {
      const position = getLaunchInventoryPosition(slug, size);
      if (!position) throw new Error(`Missing launch inventory for ${slug}/${size}.`);
      return [size, {
        physical: position.currentPhysicalQuantity,
        reserved: position.remainingGiftReserveQuantity,
      }];
    })) as Record<ProductSize, InternalStockInput>,
  ]),
) as InternalStockLedger;

export function getInternalStockPosition(
  productSlug: string,
  size: ProductSize,
): InternalStockPosition {
  const position = launchStockLedger[productSlug]?.[size];

  if (!position) {
    return { physical: 0, reserved: 0, availableToSell: 0 };
  }

  return {
    ...position,
    availableToSell: Math.max(position.physical - position.reserved, 0),
  };
}

export function toPublicStockStatus(
  availableToSell: number,
): PublicStockStatus {
  if (availableToSell <= 0) {
    return { state: "sold-out" };
  }

  if (availableToSell <= 5) {
    return { state: "low-stock", remaining: availableToSell };
  }

  return { state: "available" };
}

export function getPublicStockBySize(
  productSlug: string,
): PublicStockBySize {
  return Object.fromEntries(
    sizes.map((size) => [
      size,
      toPublicStockStatus(
        getInternalStockPosition(productSlug, size).availableToSell,
      ),
    ]),
  ) as PublicStockBySize;
}
