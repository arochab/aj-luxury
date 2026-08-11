import { FulfillmentError } from "./fulfillment-domain.ts";
import { isRegisteredVerifiedCarrierEvent } from "./carrier-event-registration.internal.ts";

declare const verifiedCarrierEventTypeBrand: unique symbol;

export type VerifiedCarrierEventClaims = Readonly<{
  shipmentId: string;
  providerCode: string;
  providerEventId: string;
  trackingReference: string;
  eventType:
    | "in_transit"
    | "out_for_delivery"
    | "delivered"
    | "exception"
    | "returned";
  eventFingerprint: string;
  receiptFingerprint: string;
  occurredAt: string;
  receivedAt: string;
  verifiedAt: string;
  verificationMethod: "test_adapter" | "carrier_signature";
}>;

export type VerifiedCarrierEvent = VerifiedCarrierEventClaims &
  Readonly<{ [verifiedCarrierEventTypeBrand]: true }>;

export function assertVerifiedCarrierEvent(
  event: unknown,
): asserts event is VerifiedCarrierEvent {
  if (!isRegisteredVerifiedCarrierEvent(event)) {
    throw new FulfillmentError(
      "TRACKING_VERIFICATION_REQUIRED",
      "A carrier event must come from an approved verification adapter.",
    );
  }
}
