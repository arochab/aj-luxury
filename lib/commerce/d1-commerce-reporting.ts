import { isCanonicalUtcTimestamp } from "./account-security.ts";
import type {
  CommerceD1Database,
  CommerceD1Result,
} from "./d1-port.ts";

export type CommerceOperationsReport = Readonly<{
  protocol: "ajl-commerce-report-v1";
  period: Readonly<{ start: string; endExclusive: string }>;
  generatedAt: string;
  privacy: Readonly<{
    containsPersonalData: false;
    grain: "period_totals";
    thirdPartyTrackingRequired: false;
  }>;
  commerce: Readonly<{
    ordersCreated: number;
    ordersPaid: number;
    ordersCancelled: number;
    grossPaidCents: number;
    refundsSucceeded: number;
    refundedCents: number;
    netPaidCents: number;
    averagePaidOrderCents: number;
    paymentFailures: number;
  }>;
  stock: Readonly<{
    variants: number;
    physicalUnits: number;
    giftingReserveUnits: number;
    safetyAndSavReserveUnits: number;
    activeReservedUnits: number;
    soldUnits: number;
    sellableUnits: number;
    variantsAwaitingReserveApproval: number;
  }>;
  delivery: Readonly<{
    shipmentsCreated: number;
    labelsReady: number;
    parcelsHandedOver: number;
    parcelsDelivered: number;
    shipmentFailures: number;
    deliveryExceptions: number;
  }>;
  returns: Readonly<{
    requestsReceived: number;
    withdrawalsReceived: number;
    requestedUnits: number;
    requestsResolved: number;
    requestsRejected: number;
    unitsRestocked: number;
    openRequestBacklog: number;
  }>;
  notifications: Readonly<{
    sent: number;
    terminalFailures: number;
    pendingBacklog: number;
  }>;
}>;

export class CommerceReportingError extends Error {
  readonly code: "INVALID_PERIOD" | "INVALID_DURABLE_DATA";

  constructor(code: CommerceReportingError["code"], message: string) {
    super(message);
    this.name = "CommerceReportingError";
    this.code = code;
  }
}

type AggregateRow = Record<string, number>;

function requireCount(row: AggregateRow, key: string): number {
  const value = row[key];
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CommerceReportingError(
      "INVALID_DURABLE_DATA",
      `Durable aggregate ${key} is invalid.`,
    );
  }
  return value;
}

function firstRow(
  result: CommerceD1Result<object> | undefined,
  label: string,
): AggregateRow {
  const row = result?.results?.[0];
  if (!result?.success || !row || typeof row !== "object") {
    throw new CommerceReportingError(
      "INVALID_DURABLE_DATA",
      `${label} aggregate is unavailable.`,
    );
  }
  return row as AggregateRow;
}

function integerAverage(total: number, count: number): number {
  return count === 0 ? 0 : Math.round(total / count);
}

/**
 * Reads only aggregate operational facts from first-party D1 tables. It never
 * selects customer identifiers, email addresses, postal addresses, free text,
 * tracking references, provider references, IP addresses or user agents.
 */
export async function readCommerceOperationsReport(
  database: CommerceD1Database,
  input: Readonly<{
    start: string;
    endExclusive: string;
    generatedAt: string;
  }>,
): Promise<CommerceOperationsReport> {
  if (
    !isCanonicalUtcTimestamp(input.start) ||
    !isCanonicalUtcTimestamp(input.endExclusive) ||
    !isCanonicalUtcTimestamp(input.generatedAt) ||
    input.endExclusive <= input.start ||
    input.endExclusive > input.generatedAt ||
    Date.parse(input.endExclusive) - Date.parse(input.start) > 366 * 86_400_000
  ) {
    throw new CommerceReportingError(
      "INVALID_PERIOD",
      "Report period must be canonical, closed and at most 366 days.",
    );
  }

  const period = [input.start, input.endExclusive] as const;
  const results = await database.batch([
    database.prepare(
      `SELECT
        (SELECT COUNT(*) FROM orders
          WHERE created_at >= ? AND created_at < ?) AS orders_created,
        (SELECT COUNT(*) FROM orders
          WHERE status = 'cancelled' AND updated_at >= ? AND updated_at < ?)
          AS orders_cancelled,
        (SELECT COUNT(*) FROM payments AS payment
          INNER JOIN orders AS customer_order ON customer_order.id = payment.order_id
          WHERE payment.status IN ('succeeded','refunded')
            AND customer_order.paid_at >= ? AND customer_order.paid_at < ?)
          AS orders_paid,
        (SELECT COALESCE(SUM(payment.amount_cents), 0)
          FROM payments AS payment
          INNER JOIN orders AS customer_order ON customer_order.id = payment.order_id
          WHERE payment.status IN ('succeeded','refunded')
            AND customer_order.paid_at >= ? AND customer_order.paid_at < ?)
          AS gross_paid_cents,
        (SELECT COUNT(*) FROM payments
          WHERE status = 'failed' AND updated_at >= ? AND updated_at < ?)
          AS payment_failures`,
    ).bind(...period, ...period, ...period, ...period, ...period),
    database.prepare(
      `SELECT COUNT(*) AS variants,
        COALESCE(SUM(physical_quantity), 0) AS physical_units,
        COALESCE(SUM(gift_reserve_quantity), 0) AS gifting_reserve_units,
        COALESCE(SUM(safety_reserve_quantity), 0) AS safety_and_sav_reserve_units,
        COALESCE(SUM(active_reserved_quantity), 0) AS active_reserved_units,
        COALESCE(SUM(sold_quantity), 0) AS sold_units,
        COALESCE(SUM(physical_quantity - gift_reserve_quantity
          - safety_reserve_quantity - active_reserved_quantity - sold_quantity), 0)
          AS sellable_units,
        COALESCE(SUM(CASE WHEN reserves_validated = 0 THEN 1 ELSE 0 END), 0)
          AS variants_awaiting_reserve_approval
      FROM inventory`,
    ),
    database.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ?
          THEN 1 ELSE 0 END), 0) AS shipments_created,
        COALESCE(SUM(CASE WHEN label_created_at >= ? AND label_created_at < ?
          THEN 1 ELSE 0 END), 0) AS labels_ready,
        COALESCE(SUM(CASE WHEN handed_over_at >= ? AND handed_over_at < ?
          THEN 1 ELSE 0 END), 0) AS parcels_handed_over,
        COALESCE(SUM(CASE WHEN delivered_at >= ? AND delivered_at < ?
          THEN 1 ELSE 0 END), 0) AS parcels_delivered,
        COALESCE(SUM(CASE WHEN status = 'failed'
          AND updated_at >= ? AND updated_at < ? THEN 1 ELSE 0 END), 0)
          AS shipment_failures,
        (SELECT COUNT(*) FROM shipment_tracking_events
          WHERE event_type = 'exception' AND occurred_at >= ? AND occurred_at < ?)
          AS delivery_exceptions
      FROM shipments`,
    ).bind(...period, ...period, ...period, ...period, ...period, ...period),
    database.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN requested_at >= ? AND requested_at < ?
          THEN 1 ELSE 0 END), 0) AS requests_received,
        COALESCE(SUM(CASE WHEN kind = 'withdrawal'
          AND requested_at >= ? AND requested_at < ? THEN 1 ELSE 0 END), 0)
          AS withdrawals_received,
        (SELECT COALESCE(SUM(return_line.requested_quantity), 0)
          FROM return_lines AS return_line
          INNER JOIN return_requests AS request
            ON request.id = return_line.return_request_id
          WHERE request.requested_at >= ? AND request.requested_at < ?)
          AS requested_units,
        COALESCE(SUM(CASE WHEN status = 'resolved'
          AND resolved_at >= ? AND resolved_at < ? THEN 1 ELSE 0 END), 0)
          AS requests_resolved,
        COALESCE(SUM(CASE WHEN status = 'rejected'
          AND resolved_at >= ? AND resolved_at < ? THEN 1 ELSE 0 END), 0)
          AS requests_rejected,
        (SELECT COALESCE(SUM(return_line.restocked_quantity), 0)
          FROM return_lines AS return_line
          INNER JOIN return_requests AS request
            ON request.id = return_line.return_request_id
          WHERE request.resolved_at >= ? AND request.resolved_at < ?)
          AS units_restocked,
        COALESCE(SUM(CASE WHEN status IN (
          'received','approved','goods_received','inspected'
        ) THEN 1 ELSE 0 END), 0) AS open_request_backlog
      FROM return_requests`,
    ).bind(...period, ...period, ...period, ...period, ...period, ...period),
    database.prepare(
      `SELECT
        (SELECT COUNT(*) FROM refunds
          WHERE status = 'succeeded' AND succeeded_at >= ? AND succeeded_at < ?)
          AS refunds_succeeded,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM refunds
          WHERE status = 'succeeded' AND succeeded_at >= ? AND succeeded_at < ?)
          AS refunded_cents`,
    ).bind(...period, ...period),
    database.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'sent'
          AND sent_at >= ? AND sent_at < ? THEN 1 ELSE 0 END), 0) AS sent,
        COALESCE(SUM(CASE WHEN status = 'failed'
          AND terminal_at >= ? AND terminal_at < ? THEN 1 ELSE 0 END), 0)
          AS terminal_failures,
        COALESCE(SUM(CASE WHEN status IN ('pending','sending')
          THEN 1 ELSE 0 END), 0) AS pending_backlog
      FROM email_outbox`,
    ).bind(...period, ...period),
  ]);

  const commerceRow = firstRow(results[0], "Commerce");
  const stockRow = firstRow(results[1], "Stock");
  const deliveryRow = firstRow(results[2], "Delivery");
  const returnRow = firstRow(results[3], "Returns");
  const refundRow = firstRow(results[4], "Refund");
  const notificationRow = firstRow(results[5], "Notification");

  const ordersPaid = requireCount(commerceRow, "orders_paid");
  const grossPaidCents = requireCount(commerceRow, "gross_paid_cents");
  const refundedCents = requireCount(refundRow, "refunded_cents");
  return Object.freeze({
    protocol: "ajl-commerce-report-v1",
    period: Object.freeze({ start: input.start, endExclusive: input.endExclusive }),
    generatedAt: input.generatedAt,
    privacy: Object.freeze({
      containsPersonalData: false,
      grain: "period_totals",
      thirdPartyTrackingRequired: false,
    }),
    commerce: Object.freeze({
      ordersCreated: requireCount(commerceRow, "orders_created"),
      ordersPaid,
      ordersCancelled: requireCount(commerceRow, "orders_cancelled"),
      grossPaidCents,
      refundsSucceeded: requireCount(refundRow, "refunds_succeeded"),
      refundedCents,
      netPaidCents: grossPaidCents - refundedCents,
      averagePaidOrderCents: integerAverage(grossPaidCents, ordersPaid),
      paymentFailures: requireCount(commerceRow, "payment_failures"),
    }),
    stock: Object.freeze({
      variants: requireCount(stockRow, "variants"),
      physicalUnits: requireCount(stockRow, "physical_units"),
      giftingReserveUnits: requireCount(stockRow, "gifting_reserve_units"),
      safetyAndSavReserveUnits: requireCount(
        stockRow,
        "safety_and_sav_reserve_units",
      ),
      activeReservedUnits: requireCount(stockRow, "active_reserved_units"),
      soldUnits: requireCount(stockRow, "sold_units"),
      sellableUnits: requireCount(stockRow, "sellable_units"),
      variantsAwaitingReserveApproval: requireCount(
        stockRow,
        "variants_awaiting_reserve_approval",
      ),
    }),
    delivery: Object.freeze({
      shipmentsCreated: requireCount(deliveryRow, "shipments_created"),
      labelsReady: requireCount(deliveryRow, "labels_ready"),
      parcelsHandedOver: requireCount(deliveryRow, "parcels_handed_over"),
      parcelsDelivered: requireCount(deliveryRow, "parcels_delivered"),
      shipmentFailures: requireCount(deliveryRow, "shipment_failures"),
      deliveryExceptions: requireCount(deliveryRow, "delivery_exceptions"),
    }),
    returns: Object.freeze({
      requestsReceived: requireCount(returnRow, "requests_received"),
      withdrawalsReceived: requireCount(returnRow, "withdrawals_received"),
      requestedUnits: requireCount(returnRow, "requested_units"),
      requestsResolved: requireCount(returnRow, "requests_resolved"),
      requestsRejected: requireCount(returnRow, "requests_rejected"),
      unitsRestocked: requireCount(returnRow, "units_restocked"),
      openRequestBacklog: requireCount(returnRow, "open_request_backlog"),
    }),
    notifications: Object.freeze({
      sent: requireCount(notificationRow, "sent"),
      terminalFailures: requireCount(notificationRow, "terminal_failures"),
      pendingBacklog: requireCount(notificationRow, "pending_backlog"),
    }),
  });
}
