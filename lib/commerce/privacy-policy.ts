export const prohibitedOperationalLogFields = new Set([
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
]);

export const allowedCommerceLogFields = new Set([
  "event",
  "status",
  "zone",
  "provider",
  "providerEventType",
  "attempt",
  "durationMs",
  "errorCode",
]);

export function sanitizeCommerceLogMetadata(
  metadata: Readonly<Record<string, unknown>>,
): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};
  const unsafeString =
    /@|https?:|(?:sk|pk)_(?:live|test)_|(?:secret|password|token|bearer)/i;
  const safeToken = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;

  for (const [key, value] of Object.entries(metadata)) {
    if (!allowedCommerceLogFields.has(key) || prohibitedOperationalLogFields.has(key)) {
      continue;
    }
    if (value === null) {
      sanitized[key] = null;
      continue;
    }
    if (typeof value === "string") {
      if (unsafeString.test(value) || !safeToken.test(value)) continue;
      if (key === "zone" && !["EU", "UK", "US", "CA"].includes(value)) {
        continue;
      }
      sanitized[key] = value;
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) continue;
      if (key === "attempt" && (!Number.isSafeInteger(value) || value > 100)) {
        continue;
      }
      if (
        key === "durationMs" &&
        (!Number.isSafeInteger(value) || value > 120_000)
      ) {
        continue;
      }
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export const commerceDataRules = {
  marketingProfiles: "not-collected-at-launch",
  sessionReplay: "prohibited-at-launch",
  advertisingPixels: "prohibited-at-launch",
  paymentCardData: "never-received-by-aj-luxury",
  accountPasswords: "not-stored-passwordless-access-only",
  legalRetentionDuration: "must-be-validated-before-live-data",
  customerRights: ["access", "rectification", "export", "erasure-request"],
} as const;

export type DataRightsRequestKind =
  (typeof commerceDataRules.customerRights)[number];

export function canEraseCommerceRecord(input: {
  legalRetentionRequired: boolean;
  activeDispute: boolean;
}): boolean {
  return !input.legalRetentionRequired && !input.activeDispute;
}
