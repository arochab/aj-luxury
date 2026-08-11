import { createHash } from "node:crypto";

import { registerVerifiedCarrierEventForNodeTest } from "../../lib/commerce/carrier-event-registration.internal.ts";
import {
  assertFulfillmentFingerprint,
  assertFulfillmentIdentifier,
  assertFulfillmentTimestamp,
  FulfillmentError,
  type TrackingEventVerificationRequest,
} from "../../lib/commerce/fulfillment-domain.ts";
import type { VerifiedCarrierEvent } from "../../lib/commerce/verified-carrier-event.ts";

function receiptFingerprint(fixture: TrackingEventVerificationRequest): string {
  const canonical = JSON.stringify({
    eventFingerprint: fixture.eventFingerprint,
    eventType: fixture.eventType,
    occurredAt: fixture.occurredAt,
    providerCode: fixture.providerCode,
    providerEventId: fixture.providerEventId,
    receivedAt: fixture.receivedAt,
    shipmentId: fixture.shipmentId,
    trackingReference: fixture.trackingReference,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Local Node-only contract adapter. Never imported by application code. */
export async function verifyTestCarrierEvent(
  fixture: TrackingEventVerificationRequest,
): Promise<VerifiedCarrierEvent> {
  assertFulfillmentIdentifier(fixture.shipmentId, "shipmentId");
  assertFulfillmentIdentifier(fixture.providerCode, "providerCode");
  assertFulfillmentIdentifier(fixture.providerEventId, "providerEventId");
  assertFulfillmentIdentifier(fixture.trackingReference, "trackingReference");
  assertFulfillmentFingerprint(fixture.eventFingerprint, "eventFingerprint");
  assertFulfillmentTimestamp(fixture.occurredAt, "occurredAt");
  assertFulfillmentTimestamp(fixture.receivedAt, "receivedAt");
  const supportedEventTypes = [
    "in_transit",
    "out_for_delivery",
    "delivered",
    "exception",
    "returned",
  ] as const;
  if (!supportedEventTypes.includes(
    fixture.eventType as (typeof supportedEventTypes)[number],
  )) {
    throw new FulfillmentError("INVALID_INPUT", "eventType is invalid.");
  }
  if (fixture.receivedAt < fixture.occurredAt) {
    throw new FulfillmentError("INVALID_INPUT", "receivedAt cannot precede occurredAt.");
  }

  return registerVerifiedCarrierEventForNodeTest({
    ...fixture,
    eventType: fixture.eventType as (typeof supportedEventTypes)[number],
    receiptFingerprint: receiptFingerprint(fixture),
    verifiedAt: fixture.receivedAt,
    verificationMethod: "test_adapter",
  });
}
