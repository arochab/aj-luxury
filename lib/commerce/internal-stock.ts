import { sizes, type ProductSize } from "../products.ts";
import type {
  PublicStockBySize,
  PublicStockStatus,
} from "./public-stock.ts";

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
const launchStockLedger: InternalStockLedger = {
  pourpre: {
    S: { physical: 63, reserved: 3 },
    M: { physical: 63, reserved: 2 },
    L: { physical: 63, reserved: 2 },
    XL: { physical: 63, reserved: 2 },
  },
  "rose-pale": {
    S: { physical: 63, reserved: 2 },
    M: { physical: 63, reserved: 2 },
    L: { physical: 63, reserved: 2 },
    XL: { physical: 63, reserved: 2 },
  },
  "lilas-bleu-clair": {
    S: { physical: 63, reserved: 2 },
    M: { physical: 63, reserved: 2 },
    L: { physical: 63, reserved: 2 },
    XL: { physical: 63, reserved: 3 },
  },
};

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
