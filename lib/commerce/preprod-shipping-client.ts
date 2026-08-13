"use client";

import {
  parseCartSnapshot,
  readCartCsrfToken,
  type PublicCartSnapshot,
} from "./preprod-cart-client.ts";

const SHIPPING_QUOTE_API_PATH = "/api/preprod/checkout/shipping-quote";
const QUOTE_ID_PATTERN = /^quote_[0-9a-f]{64}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type ShippingAddress = Readonly<{
  recipient: string;
  company?: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  regionCode?: string;
  countryCode: string;
}>;

export type PublicShippingQuote = Readonly<{
  quoteId: string;
  simulation: true;
  carrierConnected: false;
  zone: "EU" | "UK" | "US" | "CA";
  amountCents: number;
  currency: "EUR";
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  dutiesTerms: "EU_INCLUDED" | "DAP" | "DDP";
  expiresAt: string;
  cart: ShippingCartSnapshot;
}>;

export type ShippingCartSnapshot = Readonly<{
  status: PublicCartSnapshot["status"];
  currency: PublicCartSnapshot["currency"];
  expiresAt: string;
  itemCount: number;
  subtotalCents: number;
  lines: readonly Readonly<Omit<PublicCartSnapshot["lines"][number], "stockState">>[];
}>;

export class ShippingQuoteApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super(code);
    this.name = "ShippingQuoteApiError";
    this.code = code;
    this.status = status;
  }
}

const CART_ATTEMPT_INVALIDATING_ERRORS = new Set([
  "CART_CHANGED",
  "CART_EMPTY",
  "CART_EXPIRED",
  "CART_NOT_FOUND",
]);

export function shippingQuoteAttemptCanReplay(errorCode: string): boolean {
  return !CART_ATTEMPT_INVALIDATING_ERRORS.has(errorCode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index]);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseShippingCartSnapshot(value: unknown): ShippingCartSnapshot {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "currency", "expiresAt", "itemCount", "lines", "status", "subtotalCents",
    ]) ||
    !Array.isArray(value.lines)
  ) {
    throw new ShippingQuoteApiError("MALFORMED_RESPONSE");
  }
  const lineKeys = [
    "colorKey", "colorName", "imageUrl", "lineTotalCents", "productId",
    "productSlug", "quantity", "size", "unitPriceCents", "variantId",
  ];
  if (value.lines.some((line) => !isRecord(line) || !hasExactKeys(line, lineKeys))) {
    throw new ShippingQuoteApiError("MALFORMED_RESPONSE");
  }
  const parsed = parseCartSnapshot({
    ...value,
    lines: value.lines.map((line) => ({ ...line, stockState: "available" })),
  });
  if (parsed.status !== "open" || parsed.expiresAt === null) {
    throw new ShippingQuoteApiError("MALFORMED_RESPONSE");
  }
  return Object.freeze({
    status: parsed.status,
    currency: parsed.currency,
    expiresAt: parsed.expiresAt,
    itemCount: parsed.itemCount,
    subtotalCents: parsed.subtotalCents,
    lines: Object.freeze(parsed.lines.map((line) => Object.freeze({
      variantId: line.variantId,
      productId: line.productId,
      productSlug: line.productSlug,
      colorKey: line.colorKey,
      colorName: line.colorName,
      size: line.size,
      imageUrl: line.imageUrl,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
    }))),
  });
}

export function parseShippingQuote(value: unknown): PublicShippingQuote {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "amountCents",
      "carrierConnected",
      "cart",
      "currency",
      "dutiesTerms",
      "estimatedDaysMax",
      "estimatedDaysMin",
      "expiresAt",
      "quoteId",
      "simulation",
      "zone",
    ])
  ) {
    throw new ShippingQuoteApiError("MALFORMED_RESPONSE");
  }
  const expiresAt = value.expiresAt;
  if (
    typeof value.quoteId !== "string" ||
    !QUOTE_ID_PATTERN.test(value.quoteId) ||
    value.simulation !== true ||
    value.carrierConnected !== false ||
    !["EU", "UK", "US", "CA"].includes(String(value.zone)) ||
    !isNonNegativeInteger(value.amountCents) ||
    value.currency !== "EUR" ||
    !Number.isSafeInteger(value.estimatedDaysMin) ||
    (value.estimatedDaysMin as number) < 1 ||
    !Number.isSafeInteger(value.estimatedDaysMax) ||
    (value.estimatedDaysMax as number) < (value.estimatedDaysMin as number) ||
    !["EU_INCLUDED", "DAP", "DDP"].includes(String(value.dutiesTerms)) ||
    typeof expiresAt !== "string" ||
    !UTC_TIMESTAMP_PATTERN.test(expiresAt) ||
    Number.isNaN(Date.parse(expiresAt)) ||
    new Date(expiresAt).toISOString() !== expiresAt
  ) {
    throw new ShippingQuoteApiError("MALFORMED_RESPONSE");
  }
  return Object.freeze({
    quoteId: value.quoteId,
    simulation: true,
    carrierConnected: false,
    zone: value.zone as PublicShippingQuote["zone"],
    amountCents: value.amountCents,
    currency: "EUR",
    estimatedDaysMin: value.estimatedDaysMin as number,
    estimatedDaysMax: value.estimatedDaysMax as number,
    dutiesTerms: value.dutiesTerms as PublicShippingQuote["dutiesTerms"],
    expiresAt,
    cart: parseShippingCartSnapshot(value.cart),
  });
}

export async function requestShippingQuote(
  address: ShippingAddress,
  idempotencyKey: string,
): Promise<PublicShippingQuote> {
  const csrfToken = readCartCsrfToken();
  if (!csrfToken) throw new ShippingQuoteApiError("CSRF_UNAVAILABLE");

  let response: Response;
  try {
    response = await fetch(SHIPPING_QUOTE_API_PATH, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ address }),
    });
  } catch {
    throw new ShippingQuoteApiError("NETWORK_UNAVAILABLE");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ShippingQuoteApiError("MALFORMED_RESPONSE", response.status);
  }
  if (!response.ok) {
    const code = isRecord(payload) && isRecord(payload.error)
      ? payload.error.code
      : null;
    throw new ShippingQuoteApiError(
      typeof code === "string" ? code : "SHIPPING_QUOTE_UNAVAILABLE",
      response.status,
    );
  }
  if (!isRecord(payload) || !hasExactKeys(payload, ["data"])) {
    throw new ShippingQuoteApiError("MALFORMED_RESPONSE", response.status);
  }
  return parseShippingQuote(payload.data);
}
