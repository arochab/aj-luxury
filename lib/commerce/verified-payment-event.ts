import { CommerceError } from "./backend-domain.ts";

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

const verifiedPaymentEvents = new WeakSet<object>();

/**
 * Internal registration seam for audited server-side verification adapters.
 *
 * This function is deliberately absent from the commerce barrel. Import use is
 * constrained by a regression test until a real payment adapter is selected.
 */
export function registerVerifiedPaymentEventFromTrustedAdapter(
  claims: VerifiedPaymentEventClaims,
): VerifiedPaymentEvent {
  const event = Object.freeze({ ...claims });
  verifiedPaymentEvents.add(event);
  return event as VerifiedPaymentEvent;
}

export function assertVerifiedPaymentEvent(
  event: unknown,
): asserts event is VerifiedPaymentEvent {
  if (
    typeof event !== "object" ||
    event === null ||
    !verifiedPaymentEvents.has(event)
  ) {
    throw new CommerceError(
      "PAYMENT_VERIFICATION_REQUIRED",
      "A payment event must come from an approved verification adapter.",
    );
  }
}
