import {
  CommerceError,
  assertIsoTimestamp,
  assertPositiveInteger,
  assertSafeIdentifier,
} from "./backend-domain.ts";

const verifiedPaymentEventBrand: unique symbol = Symbol(
  "aj-luxury-verified-payment-event",
);

export type VerifiedPaymentEvent = Readonly<{
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
  [verifiedPaymentEventBrand]: true;
}>;

export type TestPaymentEventFixture = {
  providerEventId: string;
  providerPaymentId: string;
  orderId: string;
  amountCents: number;
  currency: "EUR";
  occurredAt: string;
  verifiedAt: string;
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function fingerprintFixture(
  fixture: TestPaymentEventFixture,
): Promise<string> {
  const canonical = JSON.stringify({
    amountCents: fixture.amountCents,
    currency: fixture.currency,
    occurredAt: fixture.occurredAt,
    orderId: fixture.orderId,
    provider: "test",
    providerEventId: fixture.providerEventId,
    providerPaymentId: fixture.providerPaymentId,
    type: "payment.succeeded",
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

/**
 * Adaptateur strictement local destiné aux tests de contrat.
 *
 * Il ne simule ni ne prétend vérifier une signature Stripe. Le futur adaptateur
 * réel devra produire le même type seulement après vérification cryptographique.
 */
export async function verifyTestPaymentEvent(
  fixture: TestPaymentEventFixture,
): Promise<VerifiedPaymentEvent> {
  assertSafeIdentifier(fixture.providerEventId, "providerEventId");
  assertSafeIdentifier(fixture.providerPaymentId, "providerPaymentId");
  assertSafeIdentifier(fixture.orderId, "orderId");
  assertPositiveInteger(fixture.amountCents, "amountCents");
  assertIsoTimestamp(fixture.occurredAt, "occurredAt");
  assertIsoTimestamp(fixture.verifiedAt, "verifiedAt");

  if (fixture.currency !== "EUR") {
    throw new CommerceError(
      "INVALID_INPUT",
      "The AJ Luxury launch payment currency must be EUR.",
    );
  }

  if (Date.parse(fixture.verifiedAt) < Date.parse(fixture.occurredAt)) {
    throw new CommerceError(
      "INVALID_INPUT",
      "verifiedAt cannot precede occurredAt.",
    );
  }

  const payloadFingerprint = await fingerprintFixture(fixture);
  const verifiedEvent: VerifiedPaymentEvent = {
    provider: "test",
    providerEventId: fixture.providerEventId,
    providerPaymentId: fixture.providerPaymentId,
    eventType: "payment.succeeded",
    orderId: fixture.orderId,
    amountCents: fixture.amountCents,
    currency: fixture.currency,
    occurredAt: fixture.occurredAt,
    verifiedAt: fixture.verifiedAt,
    verificationMethod: "test_adapter",
    payloadFingerprint,
    [verifiedPaymentEventBrand]: true,
  };
  return Object.freeze(verifiedEvent);
}

export function assertVerifiedPaymentEvent(
  event: VerifiedPaymentEvent,
): void {
  if (event[verifiedPaymentEventBrand] !== true) {
    throw new CommerceError(
      "PAYMENT_VERIFICATION_REQUIRED",
      "A payment event must come from an approved verification adapter.",
    );
  }
}
