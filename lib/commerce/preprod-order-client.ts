"use client";

import { readCartCsrfToken } from "./preprod-cart-client.ts";
import type { ShippingAddress } from "./preprod-shipping-client.ts";

const ORDER_PATH = "/api/preprod/checkout/order";
const CURRENT_ORDER_PATH = "/api/preprod/orders/current";
const PAYMENT_PATH = "/api/preprod/checkout/test-payment";

export type PublicPreprodOrder = Readonly<{
  orderNumber: string;
  status: "pending_payment" | "paid";
  currency: "EUR";
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  simulation: true;
  paymentMode: "test";
  debited: false;
  emailCaptured: boolean;
  emailSent: false;
  lines: readonly Readonly<{
    productName: string;
    colorName: string;
    size: "S" | "M" | "L" | "XL";
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>[];
}>;

export class PreprodOrderApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 0) {
    super(code);
    this.name = "PreprodOrderApiError";
    this.code = code;
    this.status = status;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function parsePreprodOrder(value: unknown): PublicPreprodOrder {
  const keys = [
    "orderNumber", "status", "currency", "subtotalCents", "shippingCents",
    "totalCents", "createdAt", "paidAt", "simulation", "paymentMode",
    "debited", "emailCaptured", "emailSent", "lines",
  ];
  const lineKeys = [
    "productName", "colorName", "size", "quantity", "unitPriceCents",
    "lineTotalCents",
  ];
  if (!record(value) || !exact(value, keys) || !Array.isArray(value.lines)) {
    throw new PreprodOrderApiError("MALFORMED_RESPONSE");
  }
  if (
    typeof value.orderNumber !== "string" ||
    !/^AJ-TEST-[0-9A-F]{24}$/.test(value.orderNumber) ||
    !["pending_payment", "paid"].includes(String(value.status)) ||
    value.currency !== "EUR" || value.simulation !== true ||
    value.paymentMode !== "test" || value.debited !== false ||
    typeof value.emailCaptured !== "boolean" || value.emailSent !== false ||
    ![value.subtotalCents, value.shippingCents, value.totalCents]
      .every((amount) => Number.isSafeInteger(amount) && (amount as number) >= 0) ||
    value.totalCents !== (value.subtotalCents as number) + (value.shippingCents as number) ||
    typeof value.createdAt !== "string" ||
    !(value.paidAt === null || typeof value.paidAt === "string") ||
    value.lines.length < 1 ||
    value.lines.some((line) => !record(line) || !exact(line, lineKeys))
  ) throw new PreprodOrderApiError("MALFORMED_RESPONSE");
  return value as PublicPreprodOrder;
}

async function responseOrder(response: Response): Promise<PublicPreprodOrder> {
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new PreprodOrderApiError("MALFORMED_RESPONSE", response.status); }
  if (!response.ok) {
    const code = record(payload) && record(payload.error) && typeof payload.error.code === "string"
      ? payload.error.code : "CHECKOUT_UNAVAILABLE";
    throw new PreprodOrderApiError(code, response.status);
  }
  if (!record(payload) || !exact(payload, ["data"])) throw new PreprodOrderApiError("MALFORMED_RESPONSE", response.status);
  return parsePreprodOrder(payload.data);
}

export async function getCurrentPreprodOrder(): Promise<PublicPreprodOrder | null> {
  const response = await fetch(CURRENT_ORDER_PATH, {
    method: "GET", credentials: "same-origin", cache: "no-store",
    headers: { Accept: "application/json" },
  });
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new PreprodOrderApiError("MALFORMED_RESPONSE", response.status); }
  if (!response.ok || !record(payload) || !exact(payload, ["data"])) {
    throw new PreprodOrderApiError("CHECKOUT_UNAVAILABLE", response.status);
  }
  return payload.data === null ? null : parsePreprodOrder(payload.data);
}

function mutationHeaders(idempotencyKey: string): HeadersInit {
  const csrf = readCartCsrfToken();
  if (!csrf) throw new PreprodOrderApiError("CSRF_UNAVAILABLE");
  return {
    Accept: "application/json",
    "Idempotency-Key": idempotencyKey,
    "X-CSRF-Token": csrf,
  };
}

export async function createPreprodOrder(input: Readonly<{
  quoteId: string;
  address: ShippingAddress;
  email: string;
  idempotencyKey: string;
}>): Promise<PublicPreprodOrder> {
  const headers = new Headers(mutationHeaders(input.idempotencyKey));
  headers.set("Content-Type", "application/json");
  const response = await fetch(ORDER_PATH, {
    method: "POST", credentials: "same-origin", cache: "no-store", headers,
    body: JSON.stringify({
      quoteId: input.quoteId,
      address: input.address,
      email: input.email,
      termsAccepted: true,
      privacyAccepted: true,
      simulationAcknowledged: true,
    }),
  });
  return responseOrder(response);
}

export async function payPreprodOrder(idempotencyKey: string): Promise<PublicPreprodOrder> {
  const response = await fetch(PAYMENT_PATH, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: mutationHeaders(idempotencyKey),
  });
  return responseOrder(response);
}
