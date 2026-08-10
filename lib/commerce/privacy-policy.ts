export const prohibitedOperationalLogFields = Object.freeze([
  "email",
  "firstName",
  "lastName",
  "phone",
  "address",
  "line1",
  "line2",
  "postalCode",
  "paymentToken",
  "cardNumber",
  "rawWebhookPayload",
] as const);

/**
 * Only fields with a closed value policy belong here. Provider identifiers,
 * provider event names and free-form error codes remain excluded until the
 * corresponding providers and server-owned code catalogues are selected.
 */
export const allowedCommerceLogFields = Object.freeze([
  "event",
  "status",
  "zone",
  "attempt",
  "durationMs",
] as const);

const allowedCommerceLogFieldSet = new Set<string>(allowedCommerceLogFields);
const allowedEvents = new Set<string>(["payment-reconciled"]);
const allowedStatuses = new Set<string>([
  "open",
  "converted",
  "expired",
  "pending-payment",
  "paid",
  "preparing",
  "fulfilled",
  "cancelled",
  "refunded",
  "created",
  "requires-action",
  "succeeded",
  "failed",
]);
const allowedZones = new Set<string>(["EU", "UK", "US", "CA"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sanitizeCommerceLogMetadata(
  metadata: Readonly<Record<string, unknown>>,
): Record<string, string | number>;
export function sanitizeCommerceLogMetadata(
  metadata: unknown,
): Record<string, string | number> {
  const sanitized: Record<string, string | number> = {};
  if (!isRecord(metadata)) return sanitized;

  for (const [key, value] of Object.entries(metadata)) {
    if (!allowedCommerceLogFieldSet.has(key)) continue;

    if (key === "event") {
      if (typeof value === "string" && allowedEvents.has(value)) {
        sanitized.event = value;
      }
      continue;
    }

    if (key === "status") {
      if (typeof value === "string" && allowedStatuses.has(value)) {
        sanitized.status = value;
      }
      continue;
    }

    if (key === "zone") {
      if (typeof value === "string" && allowedZones.has(value)) {
        sanitized.zone = value;
      }
      continue;
    }

    if (key === "attempt") {
      if (
        typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 1 &&
        value <= 20
      ) {
        sanitized.attempt = value;
      }
      continue;
    }

    if (
      key === "durationMs" &&
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= 120_000
    ) {
      sanitized.durationMs = value;
    }
  }

  return sanitized;
}

const customerRights = Object.freeze([
  "access",
  "rectification",
  "export",
  "erasure-request",
] as const);

export const commerceDataRules = Object.freeze({
  marketingProfiles: "not-collected-at-launch",
  sessionReplay: "prohibited-at-launch",
  advertisingPixels: "prohibited-at-launch",
  paymentCardData: "never-received-by-aj-luxury",
  accountPasswords: "not-stored-passwordless-access-only",
  legalRetentionDuration: "must-be-validated-before-live-data",
  customerRights,
} as const);

export type DataRightsRequestKind =
  (typeof commerceDataRules.customerRights)[number];

export function canEraseCommerceRecord(input: {
  legalRetentionRequired: boolean;
  activeDispute: boolean;
}): boolean {
  return !input.legalRetentionRequired && !input.activeDispute;
}
