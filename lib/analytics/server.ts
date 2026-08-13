import "#analytics-server-only";

import { SERVER_ORDER_PAID_EVENT_NAME } from "./server-events.ts";

/**
 * Honest dormant contract. There is deliberately no recorder, snapshot
 * validator, callback, store injection or success result in this branch.
 * Canonical commerce D1 is integrated, but no analytics recorder exists and
 * activation has not been approved. The paid-order transaction remains the
 * only future authority; this module cannot currently record anything.
 */
export const ORDER_PAID_INTERNAL_CONTRACT = Object.freeze({
  eventName: SERVER_ORDER_PAID_EVENT_NAME,
  availability: "unavailable",
  blocker: "analytics_server_recorder_not_implemented",
  activation: "not_approved",
  requiredAuthority: "canonical_commerce_d1_paid_order_transaction",
} as const);

export type OrderPaidInternalContract = typeof ORDER_PAID_INTERNAL_CONTRACT;
