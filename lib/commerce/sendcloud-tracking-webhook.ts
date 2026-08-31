import { issueSendcloudWorkerCarrierRegistrar } from "./carrier-event-registration.internal.ts";
import {
  assertFulfillmentFingerprint,
  assertFulfillmentIdentifier,
  assertFulfillmentTimestamp,
  FulfillmentError,
  sha256Hex,
  type TrackingEventCandidate,
  type TrackingEventVerificationRequest,
  type TrackingProviderPort,
} from "./fulfillment-domain.ts";
import type { VerifiedCarrierEvent } from "./verified-carrier-event.ts";
import type { VerifiedCarrierEventClaims } from "./verified-carrier-event.ts";

const SAFE_SIGNATURE = /^[0-9a-f]{64}$/i;
const SAFE_TRACKING_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const MAX_CLOCK_SKEW_SECONDS = 300;

const IN_TRANSIT = new Set([
  "shipment picked up by driver",
  "en route to sorting center",
  "at sorting centre",
  "being sorted",
  "sorted",
  "parcel en route",
  "at customs",
  "awaiting customer pickup",
]);
const OUT_FOR_DELIVERY = new Set(["driver en route"]);
const DELIVERED = new Set(["delivered", "shipment collected by customer"]);
const RETURNED = new Set(["returned to sender"]);
const EXCEPTION = new Set([
  "address invalid",
  "announcement failed",
  "delivery attempt failed",
  "delivery delayed",
  "error collecting",
  "exception",
  "no label",
  "not sorted",
  "refused by recipient",
  "unable to deliver",
]);
const IGNORED_PRE_POSSESSION = new Set([
  "announced",
  "announced: not collected",
  "being announced",
  "cancelled",
  "ready to send",
]);

export class SendcloudTrackingWebhookError extends Error {
  readonly code:
    | "INVALID_SIGNATURE"
    | "INVALID_PAYLOAD"
    | "IGNORED_STATUS"
    | "UNSUPPORTED_STATUS";

  constructor(
    code: "INVALID_SIGNATURE" | "INVALID_PAYLOAD" | "IGNORED_STATUS" | "UNSUPPORTED_STATUS",
    message: string,
  ) {
    super(message);
    this.name = "SendcloudTrackingWebhookError";
    this.code = code;
  }
}

type SendcloudSignal = Readonly<{
  providerShipmentReference: string;
  trackingReference: string;
  providerEventId: string;
  eventType: VerifiedCarrierEventClaims["eventType"];
  eventFingerprint: string;
  occurredAt: string;
  receivedAt: string;
  receiptFingerprint: string;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function owned(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeHexEqual(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

async function verifySignature(
  rawBody: Uint8Array,
  signature: string,
  secret: string,
): Promise<void> {
  if (!SAFE_SIGNATURE.test(signature) || secret.length < 16 || secret.length > 256) {
    throw new SendcloudTrackingWebhookError(
      "INVALID_SIGNATURE",
      "Sendcloud signature metadata is invalid.",
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    owned(new TextEncoder().encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const wanted = hex(new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    owned(rawBody),
  )));
  if (!constantTimeHexEqual(signature.toLowerCase(), wanted)) {
    throw new SendcloudTrackingWebhookError(
      "INVALID_SIGNATURE",
      "Sendcloud signature does not match.",
    );
  }
}

function statusType(message: string): VerifiedCarrierEventClaims["eventType"] | null {
  const normalized = message.trim().toLowerCase();
  if (IN_TRANSIT.has(normalized)) return "in_transit";
  if (OUT_FOR_DELIVERY.has(normalized)) return "out_for_delivery";
  if (DELIVERED.has(normalized)) return "delivered";
  if (RETURNED.has(normalized)) return "returned";
  if (EXCEPTION.has(normalized)) return "exception";
  return null;
}

function canonicalTimestamp(epochSeconds: number, receivedAt: string): string {
  if (!Number.isSafeInteger(epochSeconds) || epochSeconds < 1) {
    throw new SendcloudTrackingWebhookError(
      "INVALID_PAYLOAD",
      "Sendcloud tracking timestamp is invalid.",
    );
  }
  const occurredAt = new Date(epochSeconds * 1_000).toISOString();
  if (occurredAt > new Date(Date.parse(receivedAt) + MAX_CLOCK_SKEW_SECONDS * 1_000).toISOString()) {
    throw new SendcloudTrackingWebhookError(
      "INVALID_PAYLOAD",
      "Sendcloud tracking timestamp is in the future.",
    );
  }
  return occurredAt;
}

/** Verify the exact raw Sendcloud webhook and retain only non-PII evidence. */
export async function verifySendcloudTrackingWebhook(input: Readonly<{
  rawBody: Uint8Array;
  signature: string | null;
  secret: string;
  receivedAt: string;
}>): Promise<SendcloudSignal> {
  assertFulfillmentTimestamp(input.receivedAt, "receivedAt");
  if (!input.signature) {
    throw new SendcloudTrackingWebhookError(
      "INVALID_SIGNATURE",
      "Sendcloud signature is missing.",
    );
  }
  await verifySignature(input.rawBody, input.signature, input.secret);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.rawBody));
  } catch {
    throw new SendcloudTrackingWebhookError(
      "INVALID_PAYLOAD",
      "Sendcloud payload is invalid.",
    );
  }
  if (!record(parsed) || parsed.action !== "parcel_status_changed" ||
    !record(parsed.parcel) || !record(parsed.parcel.status)) {
    throw new SendcloudTrackingWebhookError(
      "INVALID_PAYLOAD",
      "Sendcloud payload is invalid.",
    );
  }
  const parcel = parsed.parcel;
  const status = parcel.status;
  if (!record(status)) {
    throw new SendcloudTrackingWebhookError(
      "INVALID_PAYLOAD",
      "Sendcloud parcel status is invalid.",
    );
  }
  if (!Number.isSafeInteger(parcel.id) || Number(parcel.id) < 1 ||
    typeof parcel.tracking_number !== "string" ||
    !SAFE_TRACKING_REFERENCE.test(parcel.tracking_number) ||
    !Number.isSafeInteger(status.id) || Number(status.id) < 1 ||
    typeof status.message !== "string" || status.message.length < 1 ||
    status.message.length > 160 || /[\u0000-\u001f\u007f]/.test(status.message)) {
    throw new SendcloudTrackingWebhookError(
      "INVALID_PAYLOAD",
      "Sendcloud parcel evidence is invalid.",
    );
  }
  const eventType = statusType(status.message);
  if (!eventType) {
    if (IGNORED_PRE_POSSESSION.has(status.message.trim().toLowerCase())) {
      throw new SendcloudTrackingWebhookError(
        "IGNORED_STATUS",
        "Sendcloud status is explicitly pre-possession and non-actionable.",
      );
    }
    throw new SendcloudTrackingWebhookError(
      "UNSUPPORTED_STATUS",
      "Sendcloud status is unknown to the AJ Luxury state map.",
    );
  }
  const epoch = Number.isSafeInteger(parsed.carrier_status_change_timestamp)
    ? Number(parsed.carrier_status_change_timestamp)
    : Number(parsed.timestamp);
  const occurredAt = canonicalTimestamp(epoch, input.receivedAt);
  const canonical = JSON.stringify({
    action: "parcel_status_changed",
    carrierStatusChangeTimestamp: parsed.carrier_status_change_timestamp ?? null,
    parcelId: Number(parcel.id),
    statusId: Number(status.id),
    statusMessage: status.message,
    timestamp: parsed.timestamp,
    trackingReference: parcel.tracking_number,
  });
  const eventFingerprint = await sha256Hex(canonical);
  const providerEventId = `sendcloud_${await sha256Hex(
    `${String(parcel.id)}\0${String(epoch)}\0${String(status.id)}\0${status.message}`,
  )}`;
  const receiptFingerprint = await sha256Hex(
    `${eventFingerprint}\0${input.signature.toLowerCase()}`,
  );
  return Object.freeze({
    providerShipmentReference: String(parcel.id),
    trackingReference: parcel.tracking_number,
    providerEventId,
    eventType,
    eventFingerprint,
    occurredAt,
    receivedAt: input.receivedAt,
    receiptFingerprint,
  });
}

/** Build the only production tracking port accepted for this signed signal. */
export function createVerifiedSendcloudTrackingPort(
  signal: SendcloudSignal,
  shipmentId: string,
): TrackingProviderPort {
  assertFulfillmentIdentifier(shipmentId, "shipmentId");
  const registrar = issueSendcloudWorkerCarrierRegistrar();
  let verified: VerifiedCarrierEvent | null = null;
  return Object.freeze({
    async verifyEvent(candidate: TrackingEventVerificationRequest) {
      assertFulfillmentIdentifier(candidate.shipmentId, "shipmentId");
      assertFulfillmentIdentifier(candidate.providerCode, "providerCode");
      assertFulfillmentIdentifier(candidate.providerEventId, "providerEventId");
      assertFulfillmentIdentifier(candidate.trackingReference, "trackingReference");
      assertFulfillmentFingerprint(candidate.eventFingerprint, "eventFingerprint");
      assertFulfillmentTimestamp(candidate.occurredAt, "occurredAt");
      assertFulfillmentTimestamp(candidate.receivedAt, "receivedAt");
      if (
        candidate.shipmentId !== shipmentId ||
        candidate.providerCode !== "sendcloud" ||
        candidate.providerEventId !== signal.providerEventId ||
        candidate.trackingReference !== signal.trackingReference ||
        candidate.eventType !== signal.eventType ||
        candidate.eventFingerprint !== signal.eventFingerprint ||
        candidate.occurredAt !== signal.occurredAt ||
        candidate.receivedAt !== signal.receivedAt
      ) {
        throw new FulfillmentError(
          "PROVIDER_RECEIPT_MISMATCH",
          "The signed Sendcloud event differs from the persisted shipment.",
        );
      }
      if (!verified) {
        verified = registrar.register({
          shipmentId: candidate.shipmentId,
          providerCode: candidate.providerCode,
          providerEventId: candidate.providerEventId,
          trackingReference: candidate.trackingReference,
          eventType: signal.eventType,
          eventFingerprint: candidate.eventFingerprint,
          occurredAt: candidate.occurredAt,
          receivedAt: candidate.receivedAt,
          receiptFingerprint: signal.receiptFingerprint,
          verifiedAt: signal.receivedAt,
          verificationMethod: "carrier_signature",
        });
      }
      return verified;
    },
  });
}

export function sendcloudTrackingCandidate(
  signal: SendcloudSignal,
  shipmentId: string,
): TrackingEventCandidate {
  return Object.freeze({
    shipmentId,
    providerCode: "sendcloud",
    providerEventId: signal.providerEventId,
    trackingReference: signal.trackingReference,
    eventType: signal.eventType,
    eventFingerprint: signal.eventFingerprint,
    occurredAt: signal.occurredAt,
  });
}
