import {
  deriveCommerceSummary,
  hasOnlyKeys,
  isPlainRecord,
  MAX_ITEM_COUNT,
  MAX_VALUE_MINOR,
  readCanonicalAnalyticsCatalog,
  sanitizeIdentifier,
  sanitizePositiveInteger,
} from "./catalog-policy.ts";
import {
  CLIENT_ANALYTICS_EVENT_NAMES,
  CLIENT_ANALYTICS_INPUT_FIELD_ALLOWLIST,
  type ClientAnalyticsEvent,
  type ClientAnalyticsEventName,
  type ClientAnalyticsPayloadByName,
} from "./client-events.ts";
import { sanitizeAnalyticsContext } from "./context-sanitization.ts";
import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsContextInput,
  type AnalyticsDataPolicy,
} from "./shared.ts";

const clientEventNameAllowlist = new Set<string>(CLIENT_ANALYTICS_EVENT_NAMES);

function safeTimestamp(clock: () => Date): string | null {
  try {
    const now = clock();
    return now instanceof Date && Number.isFinite(now.getTime())
      ? now.toISOString()
      : null;
  } catch {
    return null;
  }
}

type SanitizedClientInput = {
  [Name in ClientAnalyticsEventName]: {
    name: Name;
    payload: ClientAnalyticsPayloadByName[Name];
  };
}[ClientAnalyticsEventName];

function sanitizeClientInput(
  name: unknown,
  input: unknown,
): SanitizedClientInput | null {
  try {
    if (
      typeof name !== "string" ||
      !clientEventNameAllowlist.has(name) ||
      !isPlainRecord(input)
    ) {
      return null;
    }
    const catalog = readCanonicalAnalyticsCatalog();
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

/**
 * Dormant preparation contract for a future controlled drain. It is not
 * exported by the browser index and the inactive facade never calls it.
 */
export function prepareClientAnalyticsEvent(
  name: unknown,
  input: unknown,
  context: AnalyticsContextInput | unknown,
  policy: AnalyticsDataPolicy | unknown,
  clock: () => Date = () => new Date(),
): ClientAnalyticsEvent | null {
  try {
    const occurredAt = safeTimestamp(clock);
    const sanitized = sanitizeClientInput(name, input);
    const sanitizedContext = sanitizeAnalyticsContext(context, policy);
    if (!occurredAt || !sanitized || !sanitizedContext) return null;
    return {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      occurredAt,
      context: sanitizedContext,
      ...sanitized,
    } as ClientAnalyticsEvent;
  } catch {
    return null;
  }
}
