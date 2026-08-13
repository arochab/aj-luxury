import { CommerceError } from "./backend-domain.ts";
import { issuePreprodWorkerPaymentRegistrar } from "./payment-event-registration.internal.ts";
import type { VerifiedPaymentEvent } from "./verified-payment-event.ts";

export type PreprodTestPaymentClaims = Readonly<{
  providerEventId: string;
  providerPaymentId: string;
  orderId: string;
  amountCents: number;
  currency: "EUR";
  occurredAt: string;
  verifiedAt: string;
  payloadFingerprint: string;
}>;

/** Worker-only adapter. Never export this module from a public barrel. */
export function verifyPreprodTestPaymentEvent(
  environment: unknown,
  claims: PreprodTestPaymentClaims,
): VerifiedPaymentEvent {
  if (environment !== "preproduction") {
    throw new CommerceError(
      "PAYMENT_VERIFICATION_REQUIRED",
      "The test payment adapter is restricted to preproduction.",
    );
  }
  const registrar = issuePreprodWorkerPaymentRegistrar(environment);
  return registrar.register(environment, {
    provider: "test",
    providerEventId: claims.providerEventId,
    providerPaymentId: claims.providerPaymentId,
    eventType: "payment.succeeded",
    orderId: claims.orderId,
    amountCents: claims.amountCents,
    currency: claims.currency,
    occurredAt: claims.occurredAt,
    verifiedAt: claims.verifiedAt,
    verificationMethod: "test_adapter",
    payloadFingerprint: claims.payloadFingerprint,
  });
}
