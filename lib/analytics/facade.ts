import type { AnalyticsConsentController } from "./consent.ts";
import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsContextInput,
  type AnalyticsDataPolicy,
  type AnalyticsEventName,
  type AnalyticsPayloadByName,
  type AnyAnalyticsEvent,
} from "./events.ts";
import {
  sanitizeAnalyticsContext,
  sanitizeAnalyticsPayload,
} from "./sanitization.ts";

/**
 * A collector must acknowledge synchronously. Network transport belongs outside
 * the commerce interaction path and is intentionally absent from this lot.
 */
export type AnalyticsCollector = {
  collect(event: AnyAnalyticsEvent): true;
};

export type AnalyticsTrackResult =
  | { accepted: true }
  | {
      accepted: false;
      reason:
        | "consent_not_granted"
        | "invalid_event"
        | "collector_error";
    };

export type AnalyticsFacade = {
  track<Name extends AnalyticsEventName>(
    name: Name,
    payload: AnalyticsPayloadByName[Name],
    context?: AnalyticsContextInput,
  ): AnalyticsTrackResult;
};

type CreateAnalyticsFacadeOptions = {
  consent: AnalyticsConsentController;
  collector: AnalyticsCollector;
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

function buildConsentGatedEvent(
  name: unknown,
  payload: unknown,
  context: unknown,
  occurredAt: string,
  policy: AnalyticsDataPolicy | unknown,
): AnyAnalyticsEvent | null {
  const sanitized = sanitizeAnalyticsPayload(name, payload, policy);
  if (!sanitized) return null;

  const common = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    occurredAt,
    context: sanitizeAnalyticsContext(context, policy),
  } as const;

  switch (sanitized.name) {
    case "product_view":
      return { ...common, ...sanitized };
    case "add_to_cart":
      return { ...common, ...sanitized };
    case "checkout_started":
      return { ...common, ...sanitized };
    case "order_paid":
      return { ...common, ...sanitized };
  }
}

function silenceUnexpectedAsyncResult(result: unknown): void {
  try {
    if (
      (typeof result === "object" && result !== null) ||
      typeof result === "function"
    ) {
      const then = (result as { then?: unknown }).then;
      if (typeof then === "function") {
        void Promise.resolve(result).catch(() => {});
      }
    }
  } catch {
    // An invalid collector must never leak into the commerce interaction path.
  }
}

export function createAnalyticsFacade({
  consent,
  collector,
  policy,
  clock = () => new Date(),
}: CreateAnalyticsFacadeOptions): AnalyticsFacade {
  return {
    track(name, payload, context) {
      try {
        if (consent.getState() !== "granted") {
          return { accepted: false, reason: "consent_not_granted" };
        }
      } catch {
        return { accepted: false, reason: "consent_not_granted" };
      }

      let event: AnyAnalyticsEvent | null = null;
      try {
        const occurredAt = safeTimestamp(clock);
        event = occurredAt
          ? buildConsentGatedEvent(
              name,
              payload,
              context,
              occurredAt,
              policy,
            )
          : null;
      } catch {
        event = null;
      }
      if (!event) return { accepted: false, reason: "invalid_event" };

      try {
        const acknowledgement: unknown = collector.collect(event);
        if (acknowledgement !== true) {
          silenceUnexpectedAsyncResult(acknowledgement);
          return { accepted: false, reason: "collector_error" };
        }
        return { accepted: true };
      } catch {
        return { accepted: false, reason: "collector_error" };
      }
    },
  };
}
