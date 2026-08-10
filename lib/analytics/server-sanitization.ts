import {
  deriveCommerceSummary,
  hasOnlyKeys,
  isPlainRecord,
  MAX_VALUE_MINOR,
  normalizeAnalyticsCatalog,
} from "./catalog-policy.ts";
import type {
  OrderPaidPayload,
  VerifiedPaidOrderSnapshot,
} from "./server-events.ts";
import type { AnalyticsDataPolicy } from "./shared.ts";

export type SanitizedPaidOrderSnapshot = {
  idempotencyKey: string;
  occurredAt: string;
  payload: OrderPaidPayload;
};

const snapshotKeys = [
  "snapshotVersion",
  "verification",
  "idempotencyKey",
  "paidAt",
  "lines",
  "amounts",
] as const;

const amountKeys = [
  "merchandiseMinor",
  "shippingMinor",
  "taxMinor",
  "discountMinor",
  "totalPaidMinor",
  "currency",
] as const;

function sanitizeIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/.test(value)
    ? value
    : null;
}

function sanitizeIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const normalized = new Date(timestamp).toISOString();
  return normalized === value ? normalized : null;
}

function sanitizeNonNegativeMinor(value: unknown): number | null {
  return Number.isSafeInteger(value) &&
    Number(value) >= 0 &&
    Number(value) <= MAX_VALUE_MINOR
    ? Number(value)
    : null;
}

export function sanitizeVerifiedPaidOrderSnapshot(
  snapshot: VerifiedPaidOrderSnapshot | unknown,
  policy: AnalyticsDataPolicy | unknown,
): SanitizedPaidOrderSnapshot | null {
  try {
    if (
      !isPlainRecord(snapshot) ||
      !hasOnlyKeys(snapshot, snapshotKeys) ||
      snapshot.snapshotVersion !== 1 ||
      snapshot.verification !== "payment-provider-webhook-verified" ||
      !isPlainRecord(snapshot.amounts) ||
      !hasOnlyKeys(snapshot.amounts, amountKeys)
    ) {
      return null;
    }

    const idempotencyKey = sanitizeIdempotencyKey(snapshot.idempotencyKey);
    const occurredAt = sanitizeIsoTimestamp(snapshot.paidAt);
    const catalog = normalizeAnalyticsCatalog(policy);
    if (!idempotencyKey || !occurredAt || !catalog) return null;

    const merchandiseMinor = sanitizeNonNegativeMinor(
      snapshot.amounts.merchandiseMinor,
    );
    const shippingMinor = sanitizeNonNegativeMinor(snapshot.amounts.shippingMinor);
    const taxMinor = sanitizeNonNegativeMinor(snapshot.amounts.taxMinor);
    const discountMinor = sanitizeNonNegativeMinor(snapshot.amounts.discountMinor);
    const totalPaidMinor = sanitizeNonNegativeMinor(
      snapshot.amounts.totalPaidMinor,
    );
    const currency = snapshot.amounts.currency;
    if (
      merchandiseMinor === null ||
      shippingMinor === null ||
      taxMinor === null ||
      discountMinor === null ||
      totalPaidMinor === null ||
      typeof currency !== "string" ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      return null;
    }

    const catalogueSummary = deriveCommerceSummary(snapshot.lines, catalog);
    if (
      !catalogueSummary ||
      catalogueSummary.currency !== currency ||
      catalogueSummary.valueMinor !== merchandiseMinor
    ) {
      return null;
    }

    const grossMinor = merchandiseMinor + shippingMinor + taxMinor;
    const expectedTotal = grossMinor - discountMinor;
    if (
      !Number.isSafeInteger(grossMinor) ||
      !Number.isSafeInteger(expectedTotal) ||
      expectedTotal < 0 ||
      expectedTotal > MAX_VALUE_MINOR ||
      totalPaidMinor !== expectedTotal
    ) {
      return null;
    }

    return {
      idempotencyKey,
      occurredAt,
      payload: {
        itemCount: catalogueSummary.itemCount,
        valueMinor: totalPaidMinor,
        currency,
      },
    };
  } catch {
    return null;
  }
}
