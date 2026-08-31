import assert from "node:assert/strict";
import test from "node:test";

import {
  createVerifiedSendcloudTrackingPort,
  sendcloudTrackingCandidate,
  SendcloudTrackingWebhookError,
  verifySendcloudTrackingWebhook,
} from "../lib/commerce/sendcloud-tracking-webhook.ts";
import { assertVerifiedCarrierEvent } from "../lib/commerce/verified-carrier-event.ts";

const secret = "sendcloud-webhook-secret-value-2026";
const receivedAt = "2026-08-31T12:00:00.000Z";

function payload(overrides = {}) {
  return new TextEncoder().encode(JSON.stringify({
    action: "parcel_status_changed",
    timestamp: 1788177540,
    carrier_status_change_timestamp: 1788177540,
    parcel: {
      id: 383707309,
      tracking_number: "8NLAJ123456789",
      status: { id: 11, message: "Shipment picked up by driver" },
      name: "must-not-be-retained",
      email: "customer@example.com",
    },
    ...overrides,
  }));
}

async function signature(rawBody) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Buffer.from(await crypto.subtle.sign("HMAC", key, rawBody)).toString("hex");
}

test("a signed Sendcloud possession scan becomes one PII-free verified event", async () => {
  const rawBody = payload();
  const signal = await verifySendcloudTrackingWebhook({
    rawBody,
    signature: await signature(rawBody),
    secret,
    receivedAt,
  });
  assert.deepEqual(signal, {
    providerShipmentReference: "383707309",
    trackingReference: "8NLAJ123456789",
    providerEventId: signal.providerEventId,
    eventType: "in_transit",
    eventFingerprint: signal.eventFingerprint,
    occurredAt: "2026-08-31T11:59:00.000Z",
    receivedAt,
    receiptFingerprint: signal.receiptFingerprint,
  });
  assert.match(signal.providerEventId, /^sendcloud_[a-f0-9]{64}$/);
  assert.match(signal.eventFingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(signal), /customer@example|must-not-be-retained/);

  const candidate = sendcloudTrackingCandidate(signal, "shipment_12345678");
  const port = createVerifiedSendcloudTrackingPort(signal, "shipment_12345678");
  const verified = await port.verifyEvent({ ...candidate, receivedAt });
  assert.doesNotThrow(() => assertVerifiedCarrierEvent(verified));
  assert.strictEqual(
    await port.verifyEvent({ ...candidate, receivedAt }),
    verified,
    "an exact retry reuses the same registered carrier evidence",
  );
});

test("Sendcloud verification rejects tampering, unknown states and crossed shipments", async () => {
  const rawBody = payload();
  await assert.rejects(
    verifySendcloudTrackingWebhook({
      rawBody,
      signature: "0".repeat(64),
      secret,
      receivedAt,
    }),
    (error) => error instanceof SendcloudTrackingWebhookError &&
      error.code === "INVALID_SIGNATURE",
  );

  const unsupportedBody = payload({
    parcel: {
      id: 383707309,
      tracking_number: "8NLAJ123456789",
      status: { id: 1, message: "Ready to send" },
    },
  });
  await assert.rejects(
    verifySendcloudTrackingWebhook({
      rawBody: unsupportedBody,
      signature: await signature(unsupportedBody),
      secret,
      receivedAt,
    }),
    (error) => error instanceof SendcloudTrackingWebhookError &&
      error.code === "IGNORED_STATUS",
  );

  const unknownBody = payload({
    parcel: {
      id: 383707309,
      tracking_number: "8NLAJ123456789",
      status: { id: 999, message: "New carrier status not mapped yet" },
    },
  });
  await assert.rejects(
    verifySendcloudTrackingWebhook({
      rawBody: unknownBody,
      signature: await signature(unknownBody),
      secret,
      receivedAt,
    }),
    (error) => error instanceof SendcloudTrackingWebhookError &&
      error.code === "UNSUPPORTED_STATUS",
  );

  const signal = await verifySendcloudTrackingWebhook({
    rawBody,
    signature: await signature(rawBody),
    secret,
    receivedAt,
  });
  const candidate = sendcloudTrackingCandidate(signal, "shipment_12345678");
  const port = createVerifiedSendcloudTrackingPort(signal, "shipment_12345678");
  await assert.rejects(
    port.verifyEvent({
      ...candidate,
      shipmentId: "shipment_crossed_12345678",
      receivedAt,
    }),
    (error) => error?.code === "PROVIDER_RECEIPT_MISMATCH",
  );
});

test("a future Sendcloud timestamp and malformed evidence fail closed", async () => {
  const future = payload({
    timestamp: 1788177901,
    carrier_status_change_timestamp: 1788177901,
    parcel: {
      id: 383707309,
      tracking_number: "8NLAJ123456789",
      status: { id: 11, message: "Parcel en route" },
    },
  });
  await assert.rejects(
    verifySendcloudTrackingWebhook({
      rawBody: future,
      signature: await signature(future),
      secret,
      receivedAt,
    }),
    (error) => error instanceof SendcloudTrackingWebhookError &&
      error.code === "INVALID_PAYLOAD",
  );

  const malformed = new TextEncoder().encode("{not-json");
  await assert.rejects(
    verifySendcloudTrackingWebhook({
      rawBody: malformed,
      signature: await signature(malformed),
      secret,
      receivedAt,
    }),
    (error) => error instanceof SendcloudTrackingWebhookError &&
      error.code === "INVALID_PAYLOAD",
  );
});
