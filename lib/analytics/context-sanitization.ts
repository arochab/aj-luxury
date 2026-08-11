import { isPlainRecord } from "./catalog-policy.ts";
import {
  ANALYTICS_UTM_KEYS,
  type AnalyticsContextInput,
  type AnalyticsDataPolicy,
  type AnalyticsUtm,
  type AnalyticsUtmKey,
  type SanitizedAnalyticsContext,
} from "./shared.ts";

const FALLBACK_URL = "https://analytics.invalid";
const MAX_PATH_LENGTH = 256;
const MAX_PATH_SEGMENT_LENGTH = 64;
const MAX_REFERRER_ORIGIN_LENGTH = 255;
const MAX_UTM_VALUE_LENGTH = 80;
const REDACTED_PATH = "/:redacted";
const safePathSegment = /^[\p{L}\p{N}._~-]+$/u;
const safeCampaignValue = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;
const uuidLike =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const longOpaqueToken = /^[a-z0-9_-]{33,}$/i;
const longDigitRun = /\d{7,}/;
const controlCharacters = /[\u0000-\u001f\u007f]/;

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
    segments.push(encodeURIComponent(decoded).replace(/%7E/gi, "~"));
  }
  const sanitized = `/${segments.join("/")}`;
  return sanitized.length <= MAX_PATH_LENGTH ? sanitized : null;
}

function normalizePathAllowlist(value: unknown): Set<string> {
  const normalized = new Set<string>();
  if (!Array.isArray(value)) return normalized;
  const fallbackOrigin = new URL(FALLBACK_URL).origin;

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
        parsed.origin === fallbackOrigin &&
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
    const clean = sanitizeUtmSyntax(candidate);
    if (clean) normalized.add(clean);
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
    const clean = sanitizeAllowedUtmValue(
      value[key],
      allowedUtmValues(policy, key),
    );
    if (clean !== undefined) sanitized[key] = clean;
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
