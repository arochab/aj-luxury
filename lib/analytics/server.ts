import "#analytics-server-only";

import { SERVER_ORDER_PAID_EVENT_NAME } from "./server-events.ts";

/**
 * Honest dormant contract. There is deliberately no recorder, snapshot
 * validator, callback, store injection or success result in this branch.
 * Activation can only be designed after the canonical commerce D1 transaction
 * exists and can become the sole authority for a paid order.
 */
export const ORDER_PAID_INTERNAL_CONTRACT = Object.freeze({
  eventName: SERVER_ORDER_PAID_EVENT_NAME,
  availability: "unavailable",
  blocker: "canonical_commerce_d1_not_integrated",
  requiredAuthority: "canonical_commerce_d1_paid_order_transaction",
} as const);

export type OrderPaidInternalContract = typeof ORDER_PAID_INTERNAL_CONTRACT;
