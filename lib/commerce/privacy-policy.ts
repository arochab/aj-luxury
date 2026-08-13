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

  try {
    for (const key of allowedCommerceLogFields) {
      const descriptor = Object.getOwnPropertyDescriptor(metadata, key);
      // Accessors are deliberately ignored so sanitization never executes
      // caller code merely to produce an operational log.
      if (!descriptor || !("value" in descriptor)) continue;
      const value = descriptor.value;

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
  } catch {
    // Logging must never break the commerce path. A hostile or revoked Proxy
    // is dropped entirely instead of leaking a partial, inconsistent record.
    return {};
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

export function canEraseCommerceRecord(input: unknown): boolean {
  if (!isRecord(input)) return false;

  try {
    if (Array.isArray(input)) return false;
    if (Object.getPrototypeOf(input) !== Object.prototype) return false;

    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== 2 ||
      !keys.includes("legalRetentionRequired") ||
      !keys.includes("activeDispute")
    ) {
      return false;
    }

    const legalRetentionDescriptor = Object.getOwnPropertyDescriptor(
      input,
      "legalRetentionRequired",
    );
    const activeDisputeDescriptor = Object.getOwnPropertyDescriptor(
      input,
      "activeDispute",
    );
    if (
      !legalRetentionDescriptor ||
      !("value" in legalRetentionDescriptor) ||
      !legalRetentionDescriptor.enumerable ||
      typeof legalRetentionDescriptor.value !== "boolean" ||
      !activeDisputeDescriptor ||
      !("value" in activeDisputeDescriptor) ||
      !activeDisputeDescriptor.enumerable ||
      typeof activeDisputeDescriptor.value !== "boolean"
    ) {
      return false;
    }

    // Descriptor inspection above guarantees that cloning cannot invoke a
    // getter. The platform clone is then used only as a Proxy rejection gate:
    // ECMAScript Proxy objects are not structured-cloneable.
    const snapshot: unknown = structuredClone(input);
    if (!isRecord(snapshot) || Object.getPrototypeOf(snapshot) !== Object.prototype) {
      return false;
    }

    return (
      legalRetentionDescriptor.value === false &&
      activeDisputeDescriptor.value === false
    );
  } catch {
    return false;
  }
}
