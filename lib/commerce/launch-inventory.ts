import type { ProductSize } from "../products.ts";

export const LAUNCH_INITIAL_QUANTITY = 756;
export const LAUNCH_HISTORICAL_SOLD_QUANTITY = 4;
export const LAUNCH_HISTORICAL_GIFTED_QUANTITY = 3;
export const LAUNCH_CURRENT_PHYSICAL_QUANTITY = 749;
export const LAUNCH_REMAINING_GIFT_RESERVE_QUANTITY = 23;
export const LAUNCH_CURRENT_SELLABLE_QUANTITY = 726;
export const LAUNCH_TOTAL_GIFT_QUANTITY = 26;

export type LaunchInventorySlug =
  | "pourpre"
  | "rose-pale"
  | "lilas-bleu-clair";

export type LaunchInventoryPosition = Readonly<{
  currentPhysicalQuantity: number;
  remainingGiftReserveQuantity: number;
  alreadyGiftedQuantity: number;
}>;

type LaunchInventoryGrid = Readonly<
  Record<LaunchInventorySlug, Readonly<Record<ProductSize, LaunchInventoryPosition>>>
>;

/**
 * Stock de lancement arrêté le 26 août 2026.
 *
 * Les quantités physiques sont celles de la fiche courante, après quatre
 * ventes et trois cadeaux déjà remis. La réserve est l'allocation
 * opérationnelle des vingt-trois cadeaux restant à remettre. Elle est dérivée
 * de l'instruction d'Adam et non présentée comme un comptage fournisseur.
 */
export const launchInventoryGrid: LaunchInventoryGrid = Object.freeze({
  pourpre: Object.freeze({
    S: Object.freeze({ currentPhysicalQuantity: 26, remainingGiftReserveQuantity: 2, alreadyGiftedQuantity: 0 }),
    M: Object.freeze({ currentPhysicalQuantity: 102, remainingGiftReserveQuantity: 2, alreadyGiftedQuantity: 1 }),
    L: Object.freeze({ currentPhysicalQuantity: 87, remainingGiftReserveQuantity: 2, alreadyGiftedQuantity: 0 }),
    XL: Object.freeze({ currentPhysicalQuantity: 35, remainingGiftReserveQuantity: 2, alreadyGiftedQuantity: 0 }),
  }),
  "lilas-bleu-clair": Object.freeze({
    S: Object.freeze({ currentPhysicalQuantity: 26, remainingGiftReserveQuantity: 2, alreadyGiftedQuantity: 0 }),
    M: Object.freeze({ currentPhysicalQuantity: 100, remainingGiftReserveQuantity: 1, alreadyGiftedQuantity: 1 }),
    L: Object.freeze({ currentPhysicalQuantity: 88, remainingGiftReserveQuantity: 2, alreadyGiftedQuantity: 0 }),
    XL: Object.freeze({ currentPhysicalQuantity: 35, remainingGiftReserveQuantity: 2, alreadyGiftedQuantity: 0 }),
  }),
  "rose-pale": Object.freeze({
    S: Object.freeze({ currentPhysicalQuantity: 26, remainingGiftReserveQuantity: 2, alreadyGiftedQuantity: 0 }),
    M: Object.freeze({ currentPhysicalQuantity: 102, remainingGiftReserveQuantity: 2, alreadyGiftedQuantity: 1 }),
    L: Object.freeze({ currentPhysicalQuantity: 87, remainingGiftReserveQuantity: 2, alreadyGiftedQuantity: 0 }),
    XL: Object.freeze({ currentPhysicalQuantity: 35, remainingGiftReserveQuantity: 2, alreadyGiftedQuantity: 0 }),
  }),
});

export function getLaunchInventoryPosition(
  productSlug: string,
  size: ProductSize,
): LaunchInventoryPosition | null {
  if (!(productSlug in launchInventoryGrid)) return null;
  return launchInventoryGrid[productSlug as LaunchInventorySlug][size];
}

export function assertLaunchInventoryIntegrity(): void {
  const positions = Object.values(launchInventoryGrid).flatMap((bySize) =>
    Object.values(bySize),
  );
  const currentPhysical = positions.reduce(
    (total, position) => total + position.currentPhysicalQuantity,
    0,
  );
  const remainingGifts = positions.reduce(
    (total, position) => total + position.remainingGiftReserveQuantity,
    0,
  );
  const alreadyGifted = positions.reduce(
    (total, position) => total + position.alreadyGiftedQuantity,
    0,
  );
  const sellable = positions.reduce(
    (total, position) => total +
      position.currentPhysicalQuantity - position.remainingGiftReserveQuantity,
    0,
  );

  if (
    positions.length !== 12 ||
    currentPhysical !== LAUNCH_CURRENT_PHYSICAL_QUANTITY ||
    remainingGifts !== LAUNCH_REMAINING_GIFT_RESERVE_QUANTITY ||
    alreadyGifted !== LAUNCH_HISTORICAL_GIFTED_QUANTITY ||
    sellable !== LAUNCH_CURRENT_SELLABLE_QUANTITY ||
    LAUNCH_CURRENT_PHYSICAL_QUANTITY + LAUNCH_HISTORICAL_SOLD_QUANTITY +
      LAUNCH_HISTORICAL_GIFTED_QUANTITY !== LAUNCH_INITIAL_QUANTITY ||
    LAUNCH_REMAINING_GIFT_RESERVE_QUANTITY +
      LAUNCH_HISTORICAL_GIFTED_QUANTITY !== LAUNCH_TOTAL_GIFT_QUANTITY
  ) {
    throw new Error("The AJ Luxury launch inventory does not reconcile.");
  }
}

assertLaunchInventoryIntegrity();
