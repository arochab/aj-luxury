import { issuePreprodWorkerCarrierRegistrar } from "./carrier-event-registration.internal.ts";
import {
  assertFulfillmentFingerprint,
  assertFulfillmentIdentifier,
  assertFulfillmentTimestamp,
  FulfillmentError,
  sha256Hex,
  type TrackingEventVerificationRequest,
} from "./fulfillment-domain.ts";
import type { VerifiedCarrierEvent } from "./verified-carrier-event.ts";

/** Worker-only synthetic verifier. It never contacts or impersonates a carrier. */
export async function verifyPreprodSyntheticCarrierEvent(
  environment: unknown,
  fixture: TrackingEventVerificationRequest,
): Promise<VerifiedCarrierEvent> {
  if (environment !== "preproduction") {
    throw new FulfillmentError(
      "TRACKING_VERIFICATION_REQUIRED",
      "The synthetic carrier adapter is restricted to preproduction.",
    );
  }
  assertFulfillmentIdentifier(fixture.shipmentId, "shipmentId");
  assertFulfillmentIdentifier(fixture.providerEventId, "providerEventId");
  assertFulfillmentIdentifier(fixture.trackingReference, "trackingReference");
  assertFulfillmentFingerprint(fixture.eventFingerprint, "eventFingerprint");
  assertFulfillmentTimestamp(fixture.occurredAt, "occurredAt");
  assertFulfillmentTimestamp(fixture.receivedAt, "receivedAt");
  if (
    fixture.providerCode !== "synthetic_demo" ||
    !["in_transit", "delivered"].includes(fixture.eventType) ||
    fixture.receivedAt < fixture.occurredAt
  ) {
    throw new FulfillmentError("INVALID_INPUT", "Synthetic tracking is invalid.");
  }
  const receiptFingerprint = await sha256Hex(JSON.stringify({
    ...fixture,
    simulation: true,
  }));
  const registrar = issuePreprodWorkerCarrierRegistrar(environment);
  return registrar.register(environment, {
    ...fixture,
    eventType: fixture.eventType as "in_transit" | "delivered",
    receiptFingerprint,
    verifiedAt: fixture.receivedAt,
    verificationMethod: "test_adapter",
  });
}
