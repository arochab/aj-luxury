import { getLaunchVariant } from "../commerce/catalog.ts";
import {
  resolveLaunchShippingScope,
  type LaunchShippingZone,
} from "../commerce/shipping-policy.ts";

export const PREPROD_DEMO_MODE = "PREPROD_DEMO" as const;
export const PREPROD_DEMO_MAX_QUANTITY = 5;

/**
 * Deliberately fictitious checkout fixtures. They prove total calculation in a
 * private preproduction demo and must never be treated as launch shipping rates.
 */
export const PREPROD_DEMO_SHIPPING_FEES_CENTS = Object.freeze({
  EU: 500,
  UK: 900,
  US: 1_500,
  CA: 1_400,
  GCC: 1_800,
} satisfies Readonly<Record<LaunchShippingZone, number>>);

export type PreprodCommerceErrorCode =
  | "PREPROD_DEMO_DISABLED"
  | "INVALID_PAYLOAD"
  | "UNSUPPORTED_VARIANT"
  | "SHIPPING_ADDRESS_REJECTED"
  | "IDEMPOTENCY_CONFLICT"
  | "ORDER_NOT_FOUND"
  | "INVALID_ORDER_TRANSITION"
  | "PAYMENT_VERIFICATION_REQUIRED";

export class PreprodCommerceError extends Error {
  readonly code: PreprodCommerceErrorCode;
  readonly reason: string | null;

  constructor(
    code: PreprodCommerceErrorCode,
    message: string,
    reason: string | null = null,
  ) {
    super(message);
    this.name = "PreprodCommerceError";
    this.code = code;
    this.reason = reason;
  }
}

export type PreprodShippingAddress = Readonly<{
  firstName: string;
  lastName: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  countryCode: string;
  regionCode?: string;
}>;

export type PreprodCheckoutPayload = Readonly<{
  variantId: string;
  quantity: number;
  email: string;
  shippingAddress: PreprodShippingAddress;
}>;

export type PreprodOrder = Readonly<{
  id: string;
  number: string;
  environment: typeof PREPROD_DEMO_MODE;
  status: "pending" | "paid";
  currency: "EUR";
  email: string;
  shippingAddress: PreprodShippingAddress;
  shippingZone: LaunchShippingZone;
  shippingRateKind: "fictitious-preprod-demo";
  line: Readonly<{
    variantId: string;
    internalReference: string;
    productName: string;
    colorName: string;
    size: "S" | "M" | "L" | "XL";
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  subtotalCents: number;
  shippingCents: number;
  taxCents: 0;
  totalCents: number;
  paymentId: string | null;
  createdAt: string;
  paidAt: string | null;
}>;

export type PreprodTestPaymentReceipt = Readonly<{
  kind: "preprod-test-payment";
  environment: typeof PREPROD_DEMO_MODE;
  paymentId: string;
  orderId: string;
  amountCents: number;
  currency: "EUR";
  authorizedAt: string;
}>;

export type PreprodTestPaymentAdapter = Readonly<{
  kind: "preprod-test-adapter";
  authorize(input: Readonly<{
    orderId: string;
    amountCents: number;
    currency: "EUR";
    idempotencyKey: string;
  }>): Promise<PreprodTestPaymentReceipt>;
}>;

type Clock = () => string;

const canonicalUtcTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const safeIdempotencyKey = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const forbiddenControls = /[\u0000-\u001f\u007f]/;
const checkoutKeys = new Set([
  "variantId",
  "quantity",
  "email",
  "shippingAddress",
]);
const addressKeys = new Set([
  "firstName",
  "lastName",
  "line1",
  "line2",
  "postalCode",
  "city",
  "countryCode",
  "regionCode",
]);
const trustedPaymentAdapters = new WeakSet<object>();
const trustedPaymentReceipts = new WeakSet<object>();

function fail(
  code: PreprodCommerceErrorCode,
  message: string,
  reason: string | null = null,
): never {
  throw new PreprodCommerceError(code, message, reason);
}

function assertMode(mode: unknown): asserts mode is typeof PREPROD_DEMO_MODE {
  if (mode !== PREPROD_DEMO_MODE) {
    fail(
      "PREPROD_DEMO_DISABLED",
      "The fictitious checkout is disabled outside PREPROD_DEMO.",
    );
  }
}

function assertCanonicalTimestamp(value: string): string {
  if (
    !canonicalUtcTimestamp.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail("INVALID_PAYLOAD", "The preproduction clock must return strict UTC.");
  }
  return value;
}

function assertIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !safeIdempotencyKey.test(value)) {
    fail(
      "INVALID_PAYLOAD",
      "An idempotency key of at most 160 safe characters is required.",
    );
  }
  return value;
}

function snapshotPlainRecord(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  requiredKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("INVALID_PAYLOAD", `${label} must be a plain object.`);
  }

  const snapshot: Record<string, unknown> = {};
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !allowedKeys.has(key)) {
        fail("INVALID_PAYLOAD", `${label} contains an unsupported field.`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail("INVALID_PAYLOAD", `${label} must contain data properties only.`);
      }
      snapshot[key] = descriptor.value;
    }
    structuredClone(snapshot);
  } catch (error) {
    if (error instanceof PreprodCommerceError) throw error;
    fail("INVALID_PAYLOAD", `${label} could not be snapshotted safely.`);
  }

  if (requiredKeys.some((key) => !Object.hasOwn(snapshot, key))) {
    fail("INVALID_PAYLOAD", `${label} is missing a required field.`);
  }
  return Object.freeze(snapshot);
}

function normalizedText(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    fail("INVALID_PAYLOAD", `${label} must be text.`);
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (
    normalized.length === 0 ||
    normalized.length > maximumLength ||
    forbiddenControls.test(normalized)
  ) {
    fail("INVALID_PAYLOAD", `${label} is invalid.`);
  }
  return normalized;
}

function normalizedOptionalText(
  value: unknown,
  label: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  return normalizedText(value, label, maximumLength);
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    fail("INVALID_PAYLOAD", "email must be text.");
  }
  const normalized = value.trim().toLowerCase();
  const separator = normalized.indexOf("@");
  if (
    normalized.length > 254 ||
    separator <= 0 ||
    separator !== normalized.lastIndexOf("@") ||
    separator > 64 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
    forbiddenControls.test(normalized)
  ) {
    fail("INVALID_PAYLOAD", "email is invalid.");
  }
  return normalized;
}

function normalizeCheckoutPayload(input: unknown): {
  payload: PreprodCheckoutPayload;
  zone: LaunchShippingZone;
  fingerprint: string;
} {
  const checkout = snapshotPlainRecord(
    input,
    checkoutKeys,
    ["variantId", "quantity", "email", "shippingAddress"],
    "checkout",
  );
  const addressInput = snapshotPlainRecord(
    checkout.shippingAddress,
    addressKeys,
    [
      "firstName",
      "lastName",
      "line1",
      "postalCode",
      "city",
      "countryCode",
    ],
    "shippingAddress",
  );

  const variantId = normalizedText(checkout.variantId, "variantId", 160);
  if (!getLaunchVariant(variantId)) {
    fail("UNSUPPORTED_VARIANT", "The variant is not in the launch catalogue.");
  }
  if (
    !Number.isSafeInteger(checkout.quantity) ||
    (checkout.quantity as number) < 1 ||
    (checkout.quantity as number) > PREPROD_DEMO_MAX_QUANTITY
  ) {
    fail(
      "INVALID_PAYLOAD",
      `quantity must be between 1 and ${PREPROD_DEMO_MAX_QUANTITY}.`,
    );
  }

  const countryCode = normalizedText(
    addressInput.countryCode,
    "countryCode",
    2,
  ).toUpperCase();
  const postalCode = normalizedText(
    addressInput.postalCode,
    "postalCode",
    16,
  );
  const regionCode = normalizedOptionalText(
    addressInput.regionCode,
    "regionCode",
    2,
  )?.toUpperCase();
  const shippingDecision = resolveLaunchShippingScope({
    countryCode,
    postalCode,
    ...(regionCode ? { regionCode } : {}),
  });
  if (!shippingDecision.inScope) {
    fail(
      "SHIPPING_ADDRESS_REJECTED",
      "The address is outside the private preproduction launch scope.",
      shippingDecision.reason,
    );
  }

  const shippingAddress: PreprodShippingAddress = Object.freeze({
    firstName: normalizedText(addressInput.firstName, "firstName", 80),
    lastName: normalizedText(addressInput.lastName, "lastName", 80),
    line1: normalizedText(addressInput.line1, "line1", 200),
    ...(() => {
      const line2 = normalizedOptionalText(addressInput.line2, "line2", 200);
      return line2 ? { line2 } : {};
    })(),
    postalCode,
    city: normalizedText(addressInput.city, "city", 100),
    countryCode,
    ...(regionCode ? { regionCode } : {}),
  });
  const payload: PreprodCheckoutPayload = Object.freeze({
    variantId,
    quantity: checkout.quantity as number,
    email: normalizeEmail(checkout.email),
    shippingAddress,
  });
  return {
    payload,
    zone: shippingDecision.zone,
    fingerprint: JSON.stringify(payload),
  };
}

function freezeOrder(order: PreprodOrder): PreprodOrder {
  Object.freeze(order.line);
  Object.freeze(order.shippingAddress);
  return Object.freeze(order);
}

export function createPreprodTestPaymentAdapter(input: Readonly<{
  mode: unknown;
  clock?: Clock;
}>): PreprodTestPaymentAdapter {
  assertMode(input.mode);
  const clock = input.clock ?? (() => new Date().toISOString());
  const receiptsByKey = new Map<
    string,
    Readonly<{
      fingerprint: string;
      receipt: PreprodTestPaymentReceipt;
    }>
  >();
  let paymentSequence = 0;

  const adapter: PreprodTestPaymentAdapter = Object.freeze({
    kind: "preprod-test-adapter" as const,
    async authorize(request) {
      const idempotencyKey = assertIdempotencyKey(request.idempotencyKey);
      if (
        !safeIdempotencyKey.test(request.orderId) ||
        !Number.isSafeInteger(request.amountCents) ||
        request.amountCents <= 0 ||
        request.currency !== "EUR"
      ) {
        fail("INVALID_PAYLOAD", "The test payment request is invalid.");
      }
      const fingerprint = JSON.stringify({
        orderId: request.orderId,
        amountCents: request.amountCents,
        currency: request.currency,
      });
      const existing = receiptsByKey.get(idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          fail(
            "IDEMPOTENCY_CONFLICT",
            "The payment idempotency key was reused for different input.",
          );
        }
        return existing.receipt;
      }

      paymentSequence += 1;
      const receipt: PreprodTestPaymentReceipt = Object.freeze({
        kind: "preprod-test-payment",
        environment: PREPROD_DEMO_MODE,
        paymentId: `payment_preprod_${String(paymentSequence).padStart(6, "0")}`,
        orderId: request.orderId,
        amountCents: request.amountCents,
        currency: "EUR",
        authorizedAt: assertCanonicalTimestamp(clock()),
      });
      trustedPaymentReceipts.add(receipt);
      receiptsByKey.set(idempotencyKey, Object.freeze({ fingerprint, receipt }));
      return receipt;
    },
  });
  trustedPaymentAdapters.add(adapter);
  return adapter;
}

export type PreprodCommerceService = Readonly<{
  submitCheckout(
    payload: unknown,
    idempotencyKey: unknown,
  ): Promise<PreprodOrder>;
  getOrder(orderId: unknown): PreprodOrder | null;
  payOrder(orderId: unknown, idempotencyKey: unknown): Promise<PreprodOrder>;
  confirmTestPayment(
    orderId: unknown,
    receipt: unknown,
  ): Promise<PreprodOrder>;
}>;

export function createPreprodCommerceService(input: Readonly<{
  mode: unknown;
  paymentAdapter: PreprodTestPaymentAdapter;
  clock?: Clock;
}>): PreprodCommerceService {
  assertMode(input.mode);
  if (
    typeof input.paymentAdapter !== "object" ||
    input.paymentAdapter === null ||
    !trustedPaymentAdapters.has(input.paymentAdapter)
  ) {
    fail(
      "PAYMENT_VERIFICATION_REQUIRED",
      "Only the private preproduction test adapter is accepted.",
    );
  }
  const paymentAdapter = input.paymentAdapter;
  const clock = input.clock ?? (() => new Date().toISOString());
  const checkoutClaims = new Map<
    string,
    Readonly<{ fingerprint: string; orderId: string }>
  >();
  const orders = new Map<string, PreprodOrder>();
  let orderSequence = 0;

  function resolveOrder(orderId: unknown): PreprodOrder {
    if (typeof orderId !== "string" || !safeIdempotencyKey.test(orderId)) {
      fail("ORDER_NOT_FOUND", "The preproduction order does not exist.");
    }
    const order = orders.get(orderId);
    if (!order) {
      fail("ORDER_NOT_FOUND", "The preproduction order does not exist.");
    }
    return order;
  }

  const service: PreprodCommerceService = Object.freeze({
    async submitCheckout(payloadInput, idempotencyKeyInput) {
      const idempotencyKey = assertIdempotencyKey(idempotencyKeyInput);
      const normalized = normalizeCheckoutPayload(payloadInput);
      const previous = checkoutClaims.get(idempotencyKey);
      if (previous) {
        if (previous.fingerprint !== normalized.fingerprint) {
          fail(
            "IDEMPOTENCY_CONFLICT",
            "The checkout idempotency key was reused for different input.",
          );
        }
        return resolveOrder(previous.orderId);
      }

      const variant = getLaunchVariant(normalized.payload.variantId);
      if (!variant) {
        fail("UNSUPPORTED_VARIANT", "The variant left the launch catalogue.");
      }
      orderSequence += 1;
      const suffix = String(orderSequence).padStart(6, "0");
      const subtotalCents =
        variant.price.amountCents * normalized.payload.quantity;
      const shippingCents =
        PREPROD_DEMO_SHIPPING_FEES_CENTS[normalized.zone];
      const createdAt = assertCanonicalTimestamp(clock());
      const order = freezeOrder({
        id: `order_preprod_${suffix}`,
        number: `AJ-PREPROD-${suffix}`,
        environment: PREPROD_DEMO_MODE,
        status: "pending",
        currency: "EUR",
        email: normalized.payload.email,
        shippingAddress: normalized.payload.shippingAddress,
        shippingZone: normalized.zone,
        shippingRateKind: "fictitious-preprod-demo",
        line: {
          variantId: variant.id,
          internalReference: variant.sku,
          productName: variant.productName,
          colorName: variant.color.name,
          size: variant.size,
          quantity: normalized.payload.quantity,
          unitPriceCents: variant.price.amountCents,
          lineTotalCents: subtotalCents,
        },
        subtotalCents,
        shippingCents,
        taxCents: 0,
        totalCents: subtotalCents + shippingCents,
        paymentId: null,
        createdAt,
        paidAt: null,
      });
      checkoutClaims.set(
        idempotencyKey,
        Object.freeze({ fingerprint: normalized.fingerprint, orderId: order.id }),
      );
      orders.set(order.id, order);
      return order;
    },

    getOrder(orderId) {
      if (typeof orderId !== "string" || !safeIdempotencyKey.test(orderId)) {
        return null;
      }
      return orders.get(orderId) ?? null;
    },

    async payOrder(orderIdInput, idempotencyKeyInput) {
      const order = resolveOrder(orderIdInput);
      const receipt = await paymentAdapter.authorize({
        orderId: order.id,
        amountCents: order.totalCents,
        currency: order.currency,
        idempotencyKey: assertIdempotencyKey(idempotencyKeyInput),
      });
      return service.confirmTestPayment(order.id, receipt);
    },

    async confirmTestPayment(orderIdInput, receiptInput) {
      const order = resolveOrder(orderIdInput);
      if (
        typeof receiptInput !== "object" ||
        receiptInput === null ||
        !trustedPaymentReceipts.has(receiptInput)
      ) {
        fail(
          "PAYMENT_VERIFICATION_REQUIRED",
          "The payment receipt did not come from the test adapter.",
        );
      }
      const receipt = receiptInput as PreprodTestPaymentReceipt;
      if (
        receipt.kind !== "preprod-test-payment" ||
        receipt.environment !== PREPROD_DEMO_MODE ||
        receipt.orderId !== order.id ||
        receipt.amountCents !== order.totalCents ||
        receipt.currency !== order.currency
      ) {
        fail(
          "PAYMENT_VERIFICATION_REQUIRED",
          "The payment receipt does not match the order snapshot.",
        );
      }
      if (order.status === "paid") {
        if (order.paymentId === receipt.paymentId) return order;
        fail(
          "INVALID_ORDER_TRANSITION",
          "A paid order cannot accept a second payment.",
        );
      }

      const paidOrder = freezeOrder({
        ...order,
        status: "paid",
        paymentId: receipt.paymentId,
        paidAt: receipt.authorizedAt,
      });
      orders.set(order.id, paidOrder);
      return paidOrder;
    },
  });

  return service;
}
