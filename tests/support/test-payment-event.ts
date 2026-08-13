import { createHash } from "node:crypto";

import {
  CommerceError,
  assertIsoTimestamp,
  assertPositiveInteger,
  assertSafeIdentifier,
} from "../../lib/commerce/backend-domain.ts";
import { registerVerifiedPaymentEventForNodeTest } from "../../lib/commerce/payment-event-registration.internal.ts";
import type { VerifiedPaymentEvent } from "../../lib/commerce/verified-payment-event.ts";

export type TestPaymentEventFixture = {
  providerEventId: string;
  providerPaymentId: string;
  orderId: string;
  amountCents: number;
  currency: "EUR";
  occurredAt: string;
  verifiedAt: string;
};

function fingerprintFixture(fixture: TestPaymentEventFixture): string {
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
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

/** Local Node-only contract adapter. Never imported by application code. */
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

  return registerVerifiedPaymentEventForNodeTest({
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
    payloadFingerprint: fingerprintFixture(fixture),
  });
}
