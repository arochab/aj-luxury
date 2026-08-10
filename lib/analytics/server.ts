import type { AnalyticsConsentController } from "./consent.ts";
import { deferAnalyticsEvent } from "./deferred-dispatch.ts";
import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsContextInput,
  type AnalyticsDataPolicy,
  type ServerOrderPaidEvent,
  type ServerOrderPaidInput,
} from "./events.ts";
import {
  sanitizeAnalyticsContext,
  sanitizeServerOrderPaidInput,
} from "./sanitization.ts";

export type ServerOrderPaidResult =
  | { accepted: true }
  | {
      accepted: false;
      reason:
        | "consent_not_granted"
        | "invalid_event"
        | "dispatch_unavailable";
    };

export type ServerOrderPaidEmitter = {
  emit(
    input: ServerOrderPaidInput,
    context?: AnalyticsContextInput,
  ): ServerOrderPaidResult;
};

type CreateServerOrderPaidEmitterOptions = {
  consent: AnalyticsConsentController;
  collect: (event: ServerOrderPaidEvent) => unknown;
  policy: AnalyticsDataPolicy;
  clock?: () => Date;
};

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

function defaultServerContext(policy: AnalyticsDataPolicy): AnalyticsContextInput | null {
  try {
    return { url: new URL("/checkout", policy.canonicalOrigin).href };
  } catch {
    return null;
  }
}

/**
 * Server-only authority for order_paid. This module is deliberately absent
 * from the browser-facing analytics index.
 */
export function createServerOrderPaidEmitter({
  consent,
  collect,
  policy,
  clock = () => new Date(),
}: CreateServerOrderPaidEmitterOptions): ServerOrderPaidEmitter {
  return {
    emit(input, context) {
      try {
        if (consent.getState() !== "granted") {
          return { accepted: false, reason: "consent_not_granted" };
        }
      } catch {
        return { accepted: false, reason: "consent_not_granted" };
      }

      try {
        const occurredAt = safeTimestamp(clock);
        const payload = sanitizeServerOrderPaidInput(input, policy);
        const effectiveContext = context ?? defaultServerContext(policy);
        const sanitizedContext = effectiveContext
          ? sanitizeAnalyticsContext(effectiveContext, policy)
          : null;
        if (!occurredAt || !payload || !sanitizedContext) {
          return { accepted: false, reason: "invalid_event" };
        }

        const event: ServerOrderPaidEvent = {
          schemaVersion: ANALYTICS_SCHEMA_VERSION,
          name: "order_paid",
          occurredAt,
          context: sanitizedContext,
          payload,
        };

        return deferAnalyticsEvent(collect, event)
          ? { accepted: true }
          : { accepted: false, reason: "dispatch_unavailable" };
      } catch {
        return { accepted: false, reason: "invalid_event" };
      }
    },
  };
}
