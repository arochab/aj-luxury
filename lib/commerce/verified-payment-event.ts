import { CommerceError } from "./backend-domain.ts";
import { isRegisteredVerifiedPaymentEvent } from "./payment-event-registration.internal.ts";

declare const verifiedPaymentEventTypeBrand: unique symbol;

export type VerifiedPaymentEventClaims = Readonly<{
  provider: "test" | "stripe";
  providerEventId: string;
  providerPaymentId: string;
  eventType: "payment.succeeded";
  orderId: string;
  amountCents: number;
  currency: "EUR";
  occurredAt: string;
  verifiedAt: string;
  verificationMethod: "test_adapter" | "stripe_signature";
  payloadFingerprint: string;
}>;

export type VerifiedPaymentEvent = VerifiedPaymentEventClaims &
  Readonly<{ [verifiedPaymentEventTypeBrand]: true }>;

export function assertVerifiedPaymentEvent(
  event: unknown,
): asserts event is VerifiedPaymentEvent {
  if (!isRegisteredVerifiedPaymentEvent(event)) {
    throw new CommerceError(
      "PAYMENT_VERIFICATION_REQUIRED",
      "A payment event must come from an approved verification adapter.",
    );
  }
}
