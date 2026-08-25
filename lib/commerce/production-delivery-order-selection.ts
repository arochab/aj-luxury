import type { CommerceD1Database, CommerceD1PreparedStatement } from "./d1-port.ts";
import {
  D1DeliveryOptionsStore,
  DeliveryOptionStoreError,
  type DeliveryOptionSnapshotRow,
} from "./d1-delivery-options-store.ts";

export type PreparedProductionDeliveryOrderSelection = Readonly<{
  option: DeliveryOptionSnapshotRow;
  statement: CommerceD1PreparedStatement;
}>;

/**
 * Validates the exact home/service-point choice and returns the guarded update
 * that must be placed in the same D1 batch as quote selection and order insert.
 */
export async function prepareProductionDeliveryOrderSelection(
  database: CommerceD1Database,
  input: Readonly<{
    cartId: string;
    quoteId: string;
    optionId: string;
    addressFingerprint: string;
    servicePointId?: string | null;
    now: string;
  }>,
): Promise<PreparedProductionDeliveryOrderSelection> {
  const prepared = await new D1DeliveryOptionsStore(database).prepareOrderSelection({
    cartId: input.cartId,
    optionId: input.optionId,
    addressFingerprint: input.addressFingerprint,
    servicePointId: input.servicePointId,
    now: input.now,
  });
  if (prepared.option.shipping_quote_id !== input.quoteId) {
    throw new DeliveryOptionStoreError(
      "OPTION_MISMATCH",
      "Delivery option does not belong to the current quote.",
    );
  }
  return prepared;
}
