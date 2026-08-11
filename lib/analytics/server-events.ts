import "#analytics-server-only";

import type {
  AnalyticsEvent,
  CommerceSummary,
} from "./shared.ts";

export const SERVER_ORDER_PAID_EVENT_NAME = "order_paid" as const;

export type OrderPaidPayload = CommerceSummary;
export type ServerOrderPaidEvent = AnalyticsEvent<
  typeof SERVER_ORDER_PAID_EVENT_NAME,
  OrderPaidPayload
>;
