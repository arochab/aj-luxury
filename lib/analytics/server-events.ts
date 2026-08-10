import type {
  AnalyticsEvent,
  AnalyticsLineInput,
  CommerceSummary,
} from "./shared.ts";

export const SERVER_ORDER_PAID_EVENT_NAME = "order_paid" as const;

export type VerifiedPaidOrderSnapshot = Readonly<{
  snapshotVersion: 1;
  verification: "payment-provider-webhook-verified";
  idempotencyKey: string;
  paidAt: string;
  lines: readonly AnalyticsLineInput[];
  amounts: Readonly<{
    merchandiseMinor: number;
    shippingMinor: number;
    taxMinor: number;
    discountMinor: number;
    totalPaidMinor: number;
    currency: string;
  }>;
}>;

export type OrderPaidPayload = CommerceSummary;
export type ServerOrderPaidEvent = AnalyticsEvent<
  typeof SERVER_ORDER_PAID_EVENT_NAME,
  OrderPaidPayload
>;
