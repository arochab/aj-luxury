import "#analytics-server-only";

import type { AnalyticsConsentController } from "./consent.ts";
import { sanitizeAnalyticsContext } from "./context-sanitization.ts";
import {
  SERVER_ORDER_PAID_EVENT_NAME,
  type ServerOrderPaidEvent,
  type VerifiedPaidOrderSnapshot,
} from "./server-events.ts";
import { sanitizeVerifiedPaidOrderSnapshot } from "./server-sanitization.ts";
import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsContextInput,
  type AnalyticsDataPolicy,
} from "./shared.ts";

export type ServerOrderPaidResult =
  | { accepted: true }
  | {
      accepted: false;
      reason:
        | "consent_not_granted"
        | "invalid_snapshot"
        | "duplicate_snapshot"
        | "outbox_unavailable";
    };

export type ServerOrderPaidEmitter = {
  record(
    snapshot: VerifiedPaidOrderSnapshot,
    context?: AnalyticsContextInput,
  ): Promise<ServerOrderPaidResult>;
};

type CreateServerOrderPaidEmitterOptions = {
  consent: AnalyticsConsentController;
  policy: AnalyticsDataPolicy;
  storeOnce: (record: {
    idempotencyKey: string;
    event: ServerOrderPaidEvent;
  }) => "stored" | "duplicate" | Promise<"stored" | "duplicate">;
};

function defaultServerContext(
  policy: AnalyticsDataPolicy,
): AnalyticsContextInput | null {
  try {
    return { url: new URL("/checkout", policy.canonicalOrigin).href };
  } catch {
    return null;
  }
}

/**
 * Server-only paid-order recorder. The caller must implement storeOnce with one
 * atomic durable outbox transaction before activation. This candidate
 * deliberately provides no store, transport or provider integration.
 */
export function createServerOrderPaidEmitter({
  consent,
  policy,
  storeOnce,
}: CreateServerOrderPaidEmitterOptions): ServerOrderPaidEmitter {
  return {
    async record(snapshot, context) {
      try {
        if (consent.getState() !== "granted") {
          return { accepted: false, reason: "consent_not_granted" };
        }
      } catch {
        return { accepted: false, reason: "consent_not_granted" };
      }

      const sanitized = sanitizeVerifiedPaidOrderSnapshot(snapshot, policy);
      const effectiveContext = context ?? defaultServerContext(policy);
      const sanitizedContext = effectiveContext
        ? sanitizeAnalyticsContext(effectiveContext, policy)
        : null;
      if (!sanitized || !sanitizedContext) {
        return { accepted: false, reason: "invalid_snapshot" };
      }

      const event: ServerOrderPaidEvent = {
        schemaVersion: ANALYTICS_SCHEMA_VERSION,
        name: SERVER_ORDER_PAID_EVENT_NAME,
        occurredAt: sanitized.occurredAt,
        context: sanitizedContext,
        payload: sanitized.payload,
      };

      try {
        const result = await storeOnce({
          idempotencyKey: sanitized.idempotencyKey,
          event,
        });
        if (result === "stored") return { accepted: true };
        if (result === "duplicate") {
          return { accepted: false, reason: "duplicate_snapshot" };
        }
        return { accepted: false, reason: "outbox_unavailable" };
      } catch {
        return { accepted: false, reason: "outbox_unavailable" };
      }
    },
  };
}

export type { VerifiedPaidOrderSnapshot } from "./server-events.ts";
