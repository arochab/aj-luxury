import {
  ANALYTICS_UTM_KEYS,
  CLIENT_ANALYTICS_EVENT_NAMES,
  CLIENT_ANALYTICS_INPUT_FIELD_ALLOWLIST,
  type AnalyticsContextInput,
  type AnalyticsDataPolicy,
  type AnalyticsPayloadByName,
  type AnalyticsUtm,
  type AnalyticsUtmKey,
  type ClientAnalyticsEventName,
  type SanitizedAnalyticsContext,
  type ServerOrderPaidInput,
} from "./events.ts";

const FALLBACK_URL = "https://analytics.invalid";
const MAX_PATH_LENGTH = 256;
const MAX_PATH_SEGMENT_LENGTH = 64;
const MAX_REFERRER_ORIGIN_LENGTH = 255;
const MAX_UTM_VALUE_LENGTH = 80;
const MAX_IDENTIFIER_LENGTH = 64;
const MAX_LINE_COUNT = 50;
const MAX_ITEM_COUNT = 99;
const MAX_VALUE_MINOR = 100_000_000;
const REDACTED_PATH = "/:redacted";

const clientEventNameAllowlist = new Set<string>(CLIENT_ANALYTICS_EVENT_NAMES);
const safePathSegment = /^[\p{L}\p{N}._~-]+$/u;
const safeCampaignValue = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;
const safeIdentifier = /^[a-z0-9][a-z0-9_-]*$/i;
const uuidLike =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const longOpaqueToken = /^[a-z0-9_-]{33,}$/i;
const longDigitRun = /\d{7,}/;
const controlCharacters = /[\u0000-\u001f\u007f]/;

type NormalizedCatalogVariant = {
  variantId: string;
  productId: string;
  unitPriceMinor: number;
  currency: string;
};

type NormalizedCatalog = {
  byVariantId: Map<string, NormalizedCatalogVariant>;
  productIds: Set<string>;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
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

function normalizeCanonicalOrigin(value: unknown): string | null {
  const parsed = parseAbsoluteHttpUrl(value);
  if (
    !parsed ||
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }
  return parsed.origin.toLowerCase();
}

function decodePathSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment).normalize("NFKC");
  } catch {
    return null;
  }
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%7E/gi, "~");
}

function sanitizePathname(pathname: string): string | null {
  if (pathname.length === 0 || pathname.length > MAX_PATH_LENGTH) return null;

  const rawSegments = pathname.split("/").filter(Boolean);
  if (rawSegments.length === 0) return "/";

  const segments: string[] = [];
  for (const segment of rawSegments) {
    const decoded = decodePathSegment(segment);
    if (
      decoded === null ||
      decoded.length === 0 ||
      decoded.length > MAX_PATH_SEGMENT_LENGTH ||
      controlCharacters.test(decoded) ||
      decoded.includes("@") ||
      uuidLike.test(decoded) ||
      longOpaqueToken.test(decoded) ||
      longDigitRun.test(decoded) ||
      !safePathSegment.test(decoded)
    ) {
      return null;
    }
    segments.push(encodePathSegment(decoded));
  }

  const sanitized = `/${segments.join("/")}`;
  return sanitized.length <= MAX_PATH_LENGTH ? sanitized : null;
}

function normalizePathAllowlist(value: unknown): Set<string> {
  const normalized = new Set<string>();
  if (!Array.isArray(value)) return normalized;

  for (const candidate of value) {
    if (
      typeof candidate !== "string" ||
      !candidate.startsWith("/") ||
      candidate.startsWith("//")
    ) {
      continue;
    }

    try {
      const parsed = new URL(candidate, FALLBACK_URL);
      const path = sanitizePathname(parsed.pathname);
      if (
        parsed.origin === new URL(FALLBACK_URL).origin &&
        !parsed.search &&
        !parsed.hash &&
        path === candidate
      ) {
        normalized.add(path);
      }
    } catch {
      // Invalid policy entries are ignored and therefore fail closed.
    }
  }
  return normalized;
}

function parseCanonicalPageUrl(
  value: unknown,
  canonicalOrigin: unknown,
): URL | null {
  const parsed = parseAbsoluteHttpUrl(value);
  const expectedOrigin = normalizeCanonicalOrigin(canonicalOrigin);
  if (
    !parsed ||
    !expectedOrigin ||
    parsed.username ||
    parsed.password ||
    parsed.origin.toLowerCase() !== expectedOrigin
  ) {
    return null;
  }
  return parsed;
}

export function sanitizeAnalyticsPath(
  value: unknown,
  allowedPaths: unknown = [],
  canonicalOrigin: unknown = null,
): string {
  try {
    const parsed = parseCanonicalPageUrl(value, canonicalOrigin);
    if (!parsed) return REDACTED_PATH;

    const path = sanitizePathname(parsed.pathname);
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
  url: URL,
  policy: Record<string, unknown>,
): AnalyticsUtm {
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
): SanitizedAnalyticsContext | null {
  try {
    if (!isPlainRecord(value) || !isPlainRecord(policy)) return null;

    const parsedUrl = parseCanonicalPageUrl(value.url, policy.canonicalOrigin);
    if (!parsedUrl) return null;

    const path = sanitizeAnalyticsPath(
      parsedUrl.href,
      policy.allowedPaths,
      policy.canonicalOrigin,
    );
    if (path === REDACTED_PATH) return null;

    const attribution = isPlainRecord(policy.attribution)
      ? policy.attribution
      : {};
    const referrerOrigin = sanitizeReferrerOrigin(
      value.referrer,
      attribution.allowedReferrerOrigins,
    );
    const utm = {
      ...readUtmFromUrl(parsedUrl, policy),
      ...readExplicitUtm(value.utm, policy),
    };

    return {
      path,
      ...(referrerOrigin ? { referrerOrigin } : {}),
      ...(Object.keys(utm).length > 0 ? { utm } : {}),
    };
  } catch {
    return null;
  }
}

function sanitizeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= MAX_IDENTIFIER_LENGTH &&
    safeIdentifier.test(normalized)
    ? normalized
    : null;
}

function sanitizeCurrency(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value)
    ? value
    : null;
}

function normalizeCatalog(policy: Record<string, unknown>): NormalizedCatalog | null {
  const catalog = isPlainRecord(policy.catalog) ? policy.catalog : null;
  if (!catalog || !Array.isArray(catalog.variants) || catalog.variants.length === 0) {
    return null;
  }

  const byVariantId = new Map<string, NormalizedCatalogVariant>();
  const productIds = new Set<string>();

  for (const candidate of catalog.variants) {
    if (!isPlainRecord(candidate)) return null;

    const variantId = sanitizeIdentifier(candidate.variantId);
    const productId = sanitizeIdentifier(candidate.productId);
    const unitPriceMinor = candidate.unitPriceMinor;
    const currency = sanitizeCurrency(candidate.currency);
    if (
      !variantId ||
      !productId ||
      !Number.isSafeInteger(unitPriceMinor) ||
      Number(unitPriceMinor) <= 0 ||
      Number(unitPriceMinor) > MAX_VALUE_MINOR ||
      !currency ||
      byVariantId.has(variantId)
    ) {
      return null;
    }

    byVariantId.set(variantId, {
      variantId,
      productId,
      unitPriceMinor: Number(unitPriceMinor),
      currency,
    });
    productIds.add(productId);
  }

  return { byVariantId, productIds };
}

function sanitizePositiveInteger(value: unknown, maximum: number): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= maximum
    ? Number(value)
    : null;
}

function deriveCommerceSummary(
  value: unknown,
  catalog: NormalizedCatalog,
): AnalyticsPayloadByName["checkout_started"] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINE_COUNT) {
    return null;
  }

  let itemCount = 0;
  let valueMinor = 0;
  let currency: string | null = null;

  for (const line of value) {
    if (!isPlainRecord(line) || !hasOnlyKeys(line, ["variantId", "quantity"])) {
      return null;
    }

    const variantId = sanitizeIdentifier(line.variantId);
    const quantity = sanitizePositiveInteger(line.quantity, MAX_ITEM_COUNT);
    const variant = variantId ? catalog.byVariantId.get(variantId) : undefined;
    if (!variant || quantity === null) return null;

    if (currency !== null && variant.currency !== currency) return null;
    currency = variant.currency;
    itemCount += quantity;
    valueMinor += variant.unitPriceMinor * quantity;

    if (
      itemCount > MAX_ITEM_COUNT ||
      !Number.isSafeInteger(valueMinor) ||
      valueMinor > MAX_VALUE_MINOR
    ) {
      return null;
    }
  }

  return currency ? { itemCount, valueMinor, currency } : null;
}

export type SanitizedClientAnalyticsInput = {
  [Name in ClientAnalyticsEventName]: {
    name: Name;
    payload: AnalyticsPayloadByName[Name];
  };
}[ClientAnalyticsEventName];

export function sanitizeClientAnalyticsInput(
  name: unknown,
  input: unknown,
  policy: AnalyticsDataPolicy | unknown,
): SanitizedClientAnalyticsInput | null {
  try {
    if (
      typeof name !== "string" ||
      !clientEventNameAllowlist.has(name) ||
      !isPlainRecord(input) ||
      !isPlainRecord(policy)
    ) {
      return null;
    }

    const catalog = normalizeCatalog(policy);
    if (!catalog) return null;

    switch (name as ClientAnalyticsEventName) {
      case "product_view": {
        if (!hasOnlyKeys(input, CLIENT_ANALYTICS_INPUT_FIELD_ALLOWLIST.product_view)) {
          return null;
        }
        const productId = sanitizeIdentifier(input.productId);
        const variantId =
          input.variantId === undefined ? null : sanitizeIdentifier(input.variantId);
        if (!productId || !catalog.productIds.has(productId)) return null;
        if (input.variantId !== undefined) {
          const variant = variantId
            ? catalog.byVariantId.get(variantId)
            : undefined;
          if (!variant || variant.productId !== productId) return null;
        }
        return {
          name: "product_view",
          payload: { productId, ...(variantId ? { variantId } : {}) },
        };
      }
      case "add_to_cart": {
        if (!hasOnlyKeys(input, CLIENT_ANALYTICS_INPUT_FIELD_ALLOWLIST.add_to_cart)) {
          return null;
        }
        const productId = sanitizeIdentifier(input.productId);
        const variantId = sanitizeIdentifier(input.variantId);
        const quantity = sanitizePositiveInteger(input.quantity, MAX_ITEM_COUNT);
        const variant = variantId
          ? catalog.byVariantId.get(variantId)
          : undefined;
        if (
          !productId ||
          !variantId ||
          quantity === null ||
          !variant ||
          variant.productId !== productId
        ) {
          return null;
        }
        const valueMinor = variant.unitPriceMinor * quantity;
        if (!Number.isSafeInteger(valueMinor) || valueMinor > MAX_VALUE_MINOR) {
          return null;
        }
        return {
          name: "add_to_cart",
          payload: {
            productId,
            variantId,
            quantity,
            valueMinor,
            currency: variant.currency,
          },
        };
      }
      case "checkout_started": {
        if (
          !hasOnlyKeys(
            input,
            CLIENT_ANALYTICS_INPUT_FIELD_ALLOWLIST.checkout_started,
          )
        ) {
          return null;
        }
        const payload = deriveCommerceSummary(input.lines, catalog);
        return payload ? { name: "checkout_started", payload } : null;
      }
    }
  } catch {
    return null;
  }
}

export function sanitizeServerOrderPaidInput(
  input: ServerOrderPaidInput | unknown,
  policy: AnalyticsDataPolicy | unknown,
): AnalyticsPayloadByName["order_paid"] | null {
  try {
    if (
      !isPlainRecord(input) ||
      !hasOnlyKeys(input, ["lines"]) ||
      !isPlainRecord(policy)
    ) {
      return null;
    }
    const catalog = normalizeCatalog(policy);
    if (!catalog) return null;
    return deriveCommerceSummary(input.lines, catalog);
  } catch {
    return null;
  }
}
