export const AJ_APOLLON_UNIT_PRICE_CENTS = 2_999;
export const AJ_APOLLON_MAX_PACK_SIZE = 3;

export const AJ_APOLLON_PACK_PRICE_CENTS = Object.freeze({
  1: 2_999,
  2: 4_999,
  3: 6_999,
} as const);

export type AjPackPricing = Readonly<{
  itemCount: number;
  listSubtotalCents: number;
  discountCents: number;
  subtotalCents: number;
}>;

type PriceLine = Readonly<{
  quantity: number;
  unitPriceCents: number;
}>;

/**
 * Packs are a deterministic cart price, never a synthetic SKU. Inventory
 * remains attached to each selected colour/size, including repeated variants.
 */
export function calculateAjPackPricing(
  lines: readonly PriceLine[],
): AjPackPricing {
  let itemCount = 0;
  let listSubtotalCents = 0;
  for (const line of lines) {
    if (
      !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
      line.unitPriceCents !== AJ_APOLLON_UNIT_PRICE_CENTS
    ) {
      throw new RangeError("AJ Luxury pack lines are invalid.");
    }
    itemCount += line.quantity;
    listSubtotalCents += line.quantity * line.unitPriceCents;
  }
  if (itemCount === 0) {
    return Object.freeze({
      itemCount: 0,
      listSubtotalCents: 0,
      discountCents: 0,
      subtotalCents: 0,
    });
  }
  if (itemCount > AJ_APOLLON_MAX_PACK_SIZE) {
    throw new RangeError("AJ Luxury carts are limited to three pieces.");
  }
  const subtotalCents = AJ_APOLLON_PACK_PRICE_CENTS[
    itemCount as keyof typeof AJ_APOLLON_PACK_PRICE_CENTS
  ];
  return Object.freeze({
    itemCount,
    listSubtotalCents,
    discountCents: listSubtotalCents - subtotalCents,
    subtotalCents,
  });
}
