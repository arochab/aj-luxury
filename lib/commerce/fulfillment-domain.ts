import {
  resolveLaunchShippingScope,
  type LaunchShippingZone,
} from "./shipping-policy.ts";
import type { VerifiedCarrierEvent } from "./verified-carrier-event.ts";

export type FulfillmentErrorCode =
  | "INVALID_INPUT"
  | "DEPENDENCY_UNAVAILABLE"
  | "DESTINATION_UNAVAILABLE"
  | "CONFIGURATION_UNAVAILABLE"
  | "QUOTE_MISMATCH"
  | "QUOTE_EXPIRED"
  | "ORDER_NOT_PAID"
  | "CUSTOMS_NOT_READY"
  | "LEASE_UNAVAILABLE"
  | "PROVIDER_OUTCOME_UNKNOWN"
  | "PROVIDER_RECEIPT_MISMATCH"
  | "TRACKING_VERIFICATION_REQUIRED"
  | "TRACKING_EVENT_CONFLICT"
  | "SESSION_REQUIRED"
  | "RETURN_QUANTITY_EXCEEDED"
  | "INSPECTION_INCOMPLETE"
  | "REFUND_LIMIT_EXCEEDED"
  | "INVALID_TRANSITION"
  | "PERSISTENCE_FAILURE";

export class FulfillmentError extends Error {
  readonly code: FulfillmentErrorCode;

  constructor(code: FulfillmentErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FulfillmentError";
    this.code = code;
  }
}

export class FulfillmentProviderError extends Error {
  readonly outcome: "ambiguous" | "rejected";

  constructor(outcome: "ambiguous" | "rejected", message: string) {
    super(message);
    this.name = "FulfillmentProviderError";
    this.outcome = outcome;
  }
}

export type ShippingAddressInput = Readonly<{
  recipient: string;
  company?: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  regionCode?: string;
  countryCode: string;
}>;

export type NormalizedShippingAddress = Readonly<{
  recipient: string;
  company: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  regionCode: string | null;
  countryCode: string;
}>;

export type NormalizedShippingAddressProof = Readonly<{
  address: NormalizedShippingAddress;
  canonicalJson: string;
  fingerprint: string;
  zone: LaunchShippingZone;
}>;

export type CartFingerprintLine = Readonly<{
  variantId: string;
  quantity: number;
  unitPriceCents: number;
}>;

export type ReturnDeclarationLine = Readonly<{
  orderLineId: string;
  quantity: number;
}>;

export type ShippingLabelRequest = Readonly<{
  shipmentId: string;
  orderId: string;
  shippingQuoteId: string;
  idempotencyKey: string;
}>;

export type ShippingLabelReceipt = Readonly<{
  shipmentId: string;
  orderId: string;
  idempotencyKey: string;
  providerCode: string;
  providerShipmentReference: string;
  trackingReference: string;
  receiptFingerprint: string;
}>;

export interface ShippingLabelProviderPort {
  createLabel(request: ShippingLabelRequest): Promise<ShippingLabelReceipt>;
}

export type TrackingEventCandidate = Readonly<{
  shipmentId: string;
  providerCode: string;
  providerEventId: string;
  trackingReference: string;
  eventType:
    | "handed_over"
    | "in_transit"
    | "out_for_delivery"
    | "delivered"
    | "exception"
    | "returned";
  eventFingerprint: string;
  occurredAt: string;
}>;

export type TrackingEventVerificationRequest = TrackingEventCandidate &
  Readonly<{ receivedAt: string }>;

export interface TrackingProviderPort {
  verifyEvent(candidate: TrackingEventVerificationRequest): Promise<VerifiedCarrierEvent>;
}

export type RefundProviderRequest = Readonly<{
  refundId: string;
  paymentId: string;
  amountCents: number;
  currency: "EUR";
  idempotencyKey: string;
}>;

export type RefundProviderReceipt = Readonly<{
  refundId: string;
  paymentId: string;
  amountCents: number;
  currency: "EUR";
  idempotencyKey: string;
  providerRefundReference: string;
  receiptFingerprint: string;
}>;

export interface RefundProviderPort {
  refund(request: RefundProviderRequest): Promise<RefundProviderReceipt>;
}

export const fulfillmentProvidersClosed = Object.freeze({
  shippingLabel: Object.freeze({
    available: false,
    reason: "shipping-label-provider-not-configured",
  } as const),
  tracking: Object.freeze({
    available: false,
    reason: "tracking-provider-not-configured",
  } as const),
  refund: Object.freeze({
    available: false,
    reason: "refund-provider-not-configured",
  } as const),
});

const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const fingerprintPattern = /^[0-9a-f]{64}$/;
const strictUtcIsoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const addressKeys = new Set([
  "recipient",
  "company",
  "line1",
  "line2",
  "postalCode",
  "city",
  "regionCode",
  "countryCode",
]);

export function assertFulfillmentIdentifier(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || !safeIdentifierPattern.test(value)) {
    throw new FulfillmentError("INVALID_INPUT", `${field} is invalid.`);
  }
}

export function assertFulfillmentFingerprint(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || !fingerprintPattern.test(value)) {
    throw new FulfillmentError("INVALID_INPUT", `${field} is invalid.`);
  }
}

export function assertFulfillmentTimestamp(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || !strictUtcIsoPattern.test(value)) {
    throw new FulfillmentError("INVALID_INPUT", `${field} is invalid.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FulfillmentError("INVALID_INPUT", `${field} is invalid.`);
  }
}

export function assertPositiveFulfillmentInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new FulfillmentError("INVALID_INPUT", `${field} is invalid.`);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

function normalizeText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") {
    throw new FulfillmentError("INVALID_INPUT", `${field} is invalid.`);
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (
    normalized.length < 1 ||
    normalized.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new FulfillmentError("INVALID_INPUT", `${field} is invalid.`);
  }
  return normalized;
}

function normalizeOptionalText(
  value: unknown,
  field: string,
  maximum: number,
): string | null {
  if (value === undefined) return null;
  return normalizeText(value, field, maximum);
}

function snapshotAddress(input: unknown): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new FulfillmentError("INVALID_INPUT", "Shipping address is invalid.");
  }
  const snapshot: Record<string, unknown> = {};
  try {
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== "string" || !addressKeys.has(key)) {
        throw new FulfillmentError("INVALID_INPUT", "Shipping address is invalid.");
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new FulfillmentError("INVALID_INPUT", "Shipping address is invalid.");
      }
      snapshot[key] = descriptor.value;
    }
    structuredClone(input);
  } catch (error) {
    if (error instanceof FulfillmentError) throw error;
    throw new FulfillmentError("INVALID_INPUT", "Shipping address is invalid.");
  }
  return snapshot;
}

export async function normalizeShippingAddress(
  input: ShippingAddressInput,
): Promise<NormalizedShippingAddressProof>;
export async function normalizeShippingAddress(
  input: unknown,
): Promise<NormalizedShippingAddressProof> {
  const snapshot = snapshotAddress(input);
  const countryCode = normalizeText(snapshot.countryCode, "countryCode", 2).toUpperCase();
  const postalCode = normalizeText(snapshot.postalCode, "postalCode", 16)
    .toUpperCase()
    .replace(/\s+/g, " ");
  const regionCode = snapshot.regionCode === undefined
    ? null
    : normalizeText(snapshot.regionCode, "regionCode", 2).toUpperCase();
  const scope = resolveLaunchShippingScope({
    countryCode,
    postalCode,
    ...(regionCode ? { regionCode } : {}),
  });
  if (!scope.inScope) {
    throw new FulfillmentError(
      "DESTINATION_UNAVAILABLE",
      "The destination is outside the configured launch scope.",
    );
  }
  const address = Object.freeze({
    recipient: normalizeText(snapshot.recipient, "recipient", 120),
    company: normalizeOptionalText(snapshot.company, "company", 120),
    line1: normalizeText(snapshot.line1, "line1", 160),
    line2: normalizeOptionalText(snapshot.line2, "line2", 160),
    postalCode,
    city: normalizeText(snapshot.city, "city", 120),
    regionCode,
    countryCode,
  });
  const canonicalJson = JSON.stringify(address);
  return Object.freeze({
    address,
    canonicalJson,
    fingerprint: await sha256Hex(canonicalJson),
    zone: scope.zone,
  });
}

export async function fingerprintCartLines(
  cartId: string,
  lines: readonly CartFingerprintLine[],
): Promise<string> {
  assertFulfillmentIdentifier(cartId, "cartId");
  if (!Array.isArray(lines) || lines.length < 1) {
    throw new FulfillmentError("INVALID_INPUT", "Cart lines are invalid.");
  }
  const normalized = lines.map((line) => {
    assertFulfillmentIdentifier(line.variantId, "variantId");
    assertPositiveFulfillmentInteger(line.quantity, "quantity");
    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
      throw new FulfillmentError("INVALID_INPUT", "unitPriceCents is invalid.");
    }
    return [line.variantId, line.quantity, line.unitPriceCents] as const;
  }).sort((left, right) => left[0].localeCompare(right[0]));
  return sha256Hex(JSON.stringify([cartId, normalized]));
}

export async function fingerprintReturnDeclaration(
  orderId: string,
  kind: "return" | "withdrawal",
  lines: readonly ReturnDeclarationLine[],
): Promise<string> {
  assertFulfillmentIdentifier(orderId, "orderId");
  if (!Array.isArray(lines) || lines.length < 1) {
    throw new FulfillmentError("INVALID_INPUT", "Return lines are invalid.");
  }
  const seen = new Set<string>();
  const normalized = lines.map((line) => {
    assertFulfillmentIdentifier(line.orderLineId, "orderLineId");
    assertPositiveFulfillmentInteger(line.quantity, "quantity");
    if (seen.has(line.orderLineId)) {
      throw new FulfillmentError("INVALID_INPUT", "Return lines contain a duplicate.");
    }
    seen.add(line.orderLineId);
    return [line.orderLineId, line.quantity] as const;
  }).sort((left, right) => left[0].localeCompare(right[0]));
  return sha256Hex(JSON.stringify([orderId, kind, normalized]));
}
