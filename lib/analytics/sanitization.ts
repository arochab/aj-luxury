import {
  ANALYTICS_EVENT_FIELD_ALLOWLIST,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_UTM_KEYS,
  type AnalyticsContextInput,
  type AnalyticsDataPolicy,
  type AnalyticsEventName,
  type AnalyticsPayloadByName,
  type AnalyticsUtm,
  type AnalyticsUtmKey,
  type SanitizedAnalyticsContext,
} from "./events.ts";

const FALLBACK_URL = "https://analytics.invalid";
const MAX_PATH_LENGTH = 256;
const MAX_PATH_SEGMENT_LENGTH = 64;
const MAX_REFERRER_ORIGIN_LENGTH = 255;
const MAX_UTM_VALUE_LENGTH = 80;
const MAX_IDENTIFIER_LENGTH = 64;
const MAX_ITEM_COUNT = 99;
const MAX_VALUE_MINOR = 100_000_000;
const REDACTED_PATH = "/:redacted";

const eventNameAllowlist = new Set<string>(ANALYTICS_EVENT_NAMES);
const safePathSegment = /^[\p{L}\p{N}._~-]+$/u;
const safeCampaignValue = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;
const safeIdentifier = /^[a-z0-9][a-z0-9_-]*$/i;
const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const longOpaqueToken = /^[a-z0-9_-]{33,}$/i;
const longDigitRun = /\d{7,}/;
const controlCharacters = /[\u0000-\u001f\u007f]/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function parseHttpUrl(value: unknown, base = FALLBACK_URL): URL | null {
  if (typeof value !== "string" || value.length === 0) return null;

  try {
    const parsed = new URL(value, base);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function parseAbsoluteHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length === 0) return null;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function decodePathSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment).normalize("NFKC");
  } catch {
    return null;
  }
}

function isSensitiveSegment(segment: string): boolean {
  return (
    segment.length === 0 ||
    segment.length > MAX_PATH_SEGMENT_LENGTH ||
    controlCharacters.test(segment) ||
    segment.includes("@") ||
    uuidLike.test(segment) ||
    longOpaqueToken.test(segment) ||
    longDigitRun.test(segment) ||
    !safePathSegment.test(segment)
  );
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%7E/gi, "~");
}

function sanitizePathSyntax(value: unknown): string | null {
  const url = parseHttpUrl(value);
  if (!url) return null;

  const rawPath = url.pathname || "/";
  if (rawPath.length > MAX_PATH_LENGTH) return null;

  const rawSegments = rawPath.split("/").filter(Boolean);
  if (rawSegments.length === 0) return "/";

  const segments: string[] = [];
  for (const segment of rawSegments) {
    const decoded = decodePathSegment(segment);
    if (decoded === null || isSensitiveSegment(decoded)) return null;
    segments.push(encodePathSegment(decoded));
  }

  const sanitizedPath = `/${segments.join("/")}`;
  return sanitizedPath.length <= MAX_PATH_LENGTH ? sanitizedPath : null;
}

function normalizePathAllowlist(value: unknown): Set<string> {
  const normalized = new Set<string>();
  if (!Array.isArray(value)) return normalized;

  for (const candidate of value) {
    const path = sanitizePathSyntax(candidate);
    if (typeof candidate === "string" && path === candidate) {
      normalized.add(path);
    }
  }
  return normalized;
}

export function sanitizeAnalyticsPath(
  value: unknown,
  allowedPaths: unknown = [],
): string {
  try {
    const path = sanitizePathSyntax(value);
    return path && normalizePathAllowlist(allowedPaths).has(path)
      ? path
      : REDACTED_PATH;
  } catch {
    return REDACTED_PATH;
  }
}

function sanitizeReferrerSyntax(value: unknown): string | undefined {
  const url = parseAbsoluteHttpUrl(value);
  if (!url || url.username || url.password) return undefined;

  const origin = url.origin.toLowerCase();
  return origin.length <= MAX_REFERRER_ORIGIN_LENGTH ? origin : undefined;
}

function normalizeReferrerAllowlist(value: unknown): Set<string> {
  const normalized = new Set<string>();
  if (!Array.isArray(value)) return normalized;

  for (const candidate of value) {
    const origin = sanitizeReferrerSyntax(candidate);
    if (origin) normalized.add(origin);
  }
  return normalized;
}

export function sanitizeReferrerOrigin(
  value: unknown,
  allowedOrigins: unknown = [],
): string | undefined {
  try {
    const origin = sanitizeReferrerSyntax(value);
    return origin && normalizeReferrerAllowlist(allowedOrigins).has(origin)
      ? origin
      : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeUtmSyntax(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().replace(/\s+/g, " ").normalize("NFKC");
  if (
    normalized.length === 0 ||
    normalized.length > MAX_UTM_VALUE_LENGTH ||
    controlCharacters.test(normalized) ||
    normalized.includes("@") ||
    longDigitRun.test(normalized) ||
    longOpaqueToken.test(normalized) ||
    !safeCampaignValue.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function normalizeUtmAllowlist(value: unknown): Set<string> {
  const normalized = new Set<string>();
  if (!Array.isArray(value)) return normalized;

  for (const candidate of value) {
    const cleanValue = sanitizeUtmSyntax(candidate);
    if (cleanValue) normalized.add(cleanValue);
  }
  return normalized;
}

function allowedUtmValues(
  policy: Record<string, unknown>,
  key: AnalyticsUtmKey,
): Set<string> {
  const attribution = isPlainRecord(policy.attribution)
    ? policy.attribution
    : {};
  const byKey = isPlainRecord(attribution.allowedUtmValues)
    ? attribution.allowedUtmValues
    : {};
  return normalizeUtmAllowlist(byKey[key]);
}

function sanitizeAllowedUtmValue(
  value: unknown,
  allowlist: Set<string>,
): string | undefined {
  const sanitized = sanitizeUtmSyntax(value);
  return sanitized && allowlist.has(sanitized) ? sanitized : undefined;
}

function readUtmFromUrl(
  url: URL | null,
  policy: Record<string, unknown>,
): AnalyticsUtm {
  if (!url) return {};

  const sanitized: AnalyticsUtm = {};
  for (const key of ANALYTICS_UTM_KEYS) {
    const value = sanitizeAllowedUtmValue(
      url.searchParams.get(key),
      allowedUtmValues(policy, key),
    );
    if (value !== undefined) sanitized[key] = value;
  }
  return sanitized;
}

function readExplicitUtm(
  value: unknown,
  policy: Record<string, unknown>,
): AnalyticsUtm {
  if (!isPlainRecord(value)) return {};

  const sanitized: AnalyticsUtm = {};
  for (const key of ANALYTICS_UTM_KEYS) {
    const cleanValue = sanitizeAllowedUtmValue(
      value[key],
      allowedUtmValues(policy, key),
    );
    if (cleanValue !== undefined) sanitized[key] = cleanValue;
  }
  return sanitized;
}

export function sanitizeAnalyticsContext(
  value: AnalyticsContextInput | unknown,
  policy: AnalyticsDataPolicy | unknown,
): SanitizedAnalyticsContext {
  try {
    const input = isPlainRecord(value) ? value : {};
    const policyRecord = isPlainRecord(policy) ? policy : {};
    const attribution = isPlainRecord(policyRecord.attribution)
      ? policyRecord.attribution
      : {};
    const parsedUrl = parseHttpUrl(input.url);
    const referrerOrigin = sanitizeReferrerOrigin(
      input.referrer,
      attribution.allowedReferrerOrigins,
    );
    const utm = {
      ...readUtmFromUrl(parsedUrl, policyRecord),
      ...readExplicitUtm(input.utm, policyRecord),
    };

    return {
      path: sanitizeAnalyticsPath(input.url, policyRecord.allowedPaths),
      ...(referrerOrigin ? { referrerOrigin } : {}),
      ...(Object.keys(utm).length > 0 ? { utm } : {}),
    };
  } catch {
    return { path: REDACTED_PATH };
  }
}

function sanitizeEventIdentifier(
  value: unknown,
  allowedIdentifiers: unknown,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_IDENTIFIER_LENGTH ||
    !safeIdentifier.test(normalized)
  ) {
    return undefined;
  }

  if (!Array.isArray(allowedIdentifiers)) return undefined;
  return allowedIdentifiers.some((candidate) => candidate === normalized)
    ? normalized
    : undefined;
}

function sanitizePositiveInteger(
  value: unknown,
  maximum: number,
): number | undefined {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= maximum
    ? Number(value)
    : undefined;
}

function sanitizeNonNegativeInteger(
  value: unknown,
  maximum: number,
): number | undefined {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= maximum
    ? Number(value)
    : undefined;
}

function sanitizeCurrency(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value)
    ? value
    : undefined;
}

function sanitizeProductViewPayload(
  value: unknown,
  policy: Record<string, unknown>,
): AnalyticsPayloadByName["product_view"] | null {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ANALYTICS_EVENT_FIELD_ALLOWLIST.product_view)
  ) {
    return null;
  }

  const productId = sanitizeEventIdentifier(
    value.productId,
    policy.allowedProductIds,
  );
  const variantId = sanitizeEventIdentifier(
    value.variantId,
    policy.allowedVariantIds,
  );
  if (!productId || (value.variantId !== undefined && !variantId)) return null;

  return { productId, ...(variantId ? { variantId } : {}) };
}

function sanitizeAddToCartPayload(
  value: unknown,
  policy: Record<string, unknown>,
): AnalyticsPayloadByName["add_to_cart"] | null {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ANALYTICS_EVENT_FIELD_ALLOWLIST.add_to_cart)
  ) {
    return null;
  }

  const productId = sanitizeEventIdentifier(
    value.productId,
    policy.allowedProductIds,
  );
  const variantId = sanitizeEventIdentifier(
    value.variantId,
    policy.allowedVariantIds,
  );
  const quantity = sanitizePositiveInteger(value.quantity, MAX_ITEM_COUNT);
  const valueMinor = sanitizeNonNegativeInteger(value.valueMinor, MAX_VALUE_MINOR);
  const currency = sanitizeCurrency(value.currency);
  if (!productId || !variantId || !quantity || valueMinor === undefined || !currency) {
    return null;
  }

  return { productId, variantId, quantity, valueMinor, currency };
}

function sanitizeCommerceSummaryPayload<
  Name extends "checkout_started" | "order_paid",
>(
  value: unknown,
  allowedKeys: readonly string[],
): AnalyticsPayloadByName[Name] | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, allowedKeys)) return null;

  const itemCount = sanitizePositiveInteger(value.itemCount, MAX_ITEM_COUNT);
  const valueMinor = sanitizeNonNegativeInteger(value.valueMinor, MAX_VALUE_MINOR);
  const currency = sanitizeCurrency(value.currency);
  if (!itemCount || valueMinor === undefined || !currency) return null;

  return { itemCount, valueMinor, currency } as AnalyticsPayloadByName[Name];
}

export type SanitizedAnalyticsPayload = {
  [Name in AnalyticsEventName]: {
    name: Name;
    payload: AnalyticsPayloadByName[Name];
  };
}[AnalyticsEventName];

export function sanitizeAnalyticsPayload(
  name: unknown,
  payload: unknown,
  policy: AnalyticsDataPolicy | unknown,
): SanitizedAnalyticsPayload | null {
  try {
    if (
      typeof name !== "string" ||
      !eventNameAllowlist.has(name) ||
      !isPlainRecord(policy)
    ) {
      return null;
    }

    switch (name as AnalyticsEventName) {
      case "product_view": {
        const cleanPayload = sanitizeProductViewPayload(payload, policy);
        return cleanPayload
          ? { name: "product_view", payload: cleanPayload }
          : null;
      }
      case "add_to_cart": {
        const cleanPayload = sanitizeAddToCartPayload(payload, policy);
        return cleanPayload
          ? { name: "add_to_cart", payload: cleanPayload }
          : null;
      }
      case "checkout_started": {
        const cleanPayload = sanitizeCommerceSummaryPayload<"checkout_started">(
          payload,
          ANALYTICS_EVENT_FIELD_ALLOWLIST.checkout_started,
        );
        return cleanPayload
          ? { name: "checkout_started", payload: cleanPayload }
          : null;
      }
      case "order_paid": {
        const cleanPayload = sanitizeCommerceSummaryPayload<"order_paid">(
          payload,
          ANALYTICS_EVENT_FIELD_ALLOWLIST.order_paid,
        );
        return cleanPayload
          ? { name: "order_paid", payload: cleanPayload }
          : null;
      }
    }
  } catch {
    return null;
  }
}
