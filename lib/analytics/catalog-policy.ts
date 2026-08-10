import type {
  AnalyticsDataPolicy,
  CommerceSummary,
} from "./shared.ts";

export const MAX_ITEM_COUNT = 99;
export const MAX_VALUE_MINOR = 100_000_000;
const MAX_LINE_COUNT = 50;
const MAX_IDENTIFIER_LENGTH = 64;
const safeIdentifier = /^[a-z0-9][a-z0-9_-]*$/i;

export type NormalizedCatalogVariant = {
  variantId: string;
  productId: string;
  unitPriceMinor: number;
  currency: string;
};

export type NormalizedCatalog = {
  byVariantId: Map<string, NormalizedCatalogVariant>;
  productIds: Set<string>;
};

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function sanitizeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= MAX_IDENTIFIER_LENGTH &&
    safeIdentifier.test(normalized)
    ? normalized
    : null;
}

export function sanitizePositiveInteger(
  value: unknown,
  maximum: number,
): number | null {
  return Number.isSafeInteger(value) &&
    Number(value) > 0 &&
    Number(value) <= maximum
    ? Number(value)
    : null;
}

function sanitizeCurrency(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value)
    ? value
    : null;
}

export function normalizeAnalyticsCatalog(
  policy: AnalyticsDataPolicy | unknown,
): NormalizedCatalog | null {
  try {
    if (!isPlainRecord(policy)) return null;
    const catalog = isPlainRecord(policy.catalog) ? policy.catalog : null;
    if (
      !catalog ||
      !Array.isArray(catalog.variants) ||
      catalog.variants.length === 0
    ) {
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
  } catch {
    return null;
  }
}

export function deriveCommerceSummary(
  value: unknown,
  catalog: NormalizedCatalog,
): CommerceSummary | null {
  try {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.length > MAX_LINE_COUNT
    ) {
      return null;
    }

    let itemCount = 0;
    let valueMinor = 0;
    let currency: string | null = null;
    for (const line of value) {
      if (
        !isPlainRecord(line) ||
        !hasOnlyKeys(line, ["variantId", "quantity"])
      ) {
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
  } catch {
    return null;
  }
}
