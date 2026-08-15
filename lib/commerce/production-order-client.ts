"use client";

import { commerceApiPath } from "./commerce-runtime.ts";
import { readCartCsrfToken } from "./preprod-cart-client.ts";
import type { ShippingAddress } from "./preprod-shipping-client.ts";

const ORDER_PATH = commerceApiPath("production", "/checkout/order");
const CURRENT_ORDER_PATH = commerceApiPath("production", "/orders/current");
const PAYMENT_SESSION_PATH = commerceApiPath(
  "production",
  "/checkout/payment-session",
);

export type PublicProductionOrder = Readonly<{
  orderNumber: string;
  status: "pending_payment" | "paid";
  currency: "EUR";
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  lines: readonly Readonly<{
    productName: string;
    colorName: string;
    size: "S" | "M" | "L" | "XL";
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>[];
}>;

export class ProductionOrderApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super(code);
    this.name = "ProductionOrderApiError";
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
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function validAmount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function parseProductionOrder(value: unknown): PublicProductionOrder {
  const keys = [
    "createdAt", "currency", "lines", "orderNumber", "paidAt",
    "shippingCents", "status", "subtotalCents", "totalCents",
  ];
  const lineKeys = [
    "colorName", "lineTotalCents", "productName", "quantity", "size",
    "unitPriceCents",
  ];
  if (!record(value) || !exact(value, keys) || !Array.isArray(value.lines)) {
    throw new ProductionOrderApiError("MALFORMED_RESPONSE");
  }
  if (
    typeof value.orderNumber !== "string" ||
    !/^AJ-[0-9A-F]{20}$/.test(value.orderNumber) ||
    !["pending_payment", "paid"].includes(String(value.status)) ||
    value.currency !== "EUR" ||
    !validAmount(value.subtotalCents) ||
    !validAmount(value.shippingCents) ||
    !validAmount(value.totalCents) ||
    value.totalCents !== value.subtotalCents + value.shippingCents ||
    typeof value.createdAt !== "string" ||
    !(value.paidAt === null || typeof value.paidAt === "string") ||
    value.lines.length < 1 || value.lines.length > 3
  ) {
    throw new ProductionOrderApiError("MALFORMED_RESPONSE");
  }
  for (const line of value.lines) {
    if (
      !record(line) || !exact(line, lineKeys) ||
      typeof line.productName !== "string" ||
      typeof line.colorName !== "string" ||
      !["S", "M", "L", "XL"].includes(String(line.size)) ||
      !Number.isSafeInteger(line.quantity) || (line.quantity as number) < 1 ||
      (line.quantity as number) > 3 || !validAmount(line.unitPriceCents) ||
      !validAmount(line.lineTotalCents) ||
      line.lineTotalCents !== (line.unitPriceCents as number) * (line.quantity as number)
    ) throw new ProductionOrderApiError("MALFORMED_RESPONSE");
  }
  if (value.lines.reduce(
    (total, line) => total + Number((line as Record<string, unknown>).quantity),
    0,
  ) > 3) {
    throw new ProductionOrderApiError("MALFORMED_RESPONSE");
  }
  return Object.freeze(value as PublicProductionOrder);
}

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProductionOrderApiError("MALFORMED_RESPONSE", response.status);
  }
  if (!record(payload)) {
    throw new ProductionOrderApiError("MALFORMED_RESPONSE", response.status);
  }
  if (!response.ok) {
    const code = record(payload.error) && typeof payload.error.code === "string"
      ? payload.error.code
      : "CHECKOUT_UNAVAILABLE";
    throw new ProductionOrderApiError(code, response.status);
  }
  return payload;
}

function mutationHeaders(idempotencyKey: string, json = false): Headers {
  const csrf = readCartCsrfToken();
  if (!csrf) throw new ProductionOrderApiError("CSRF_UNAVAILABLE");
  const headers = new Headers({
    Accept: "application/json",
    "Idempotency-Key": idempotencyKey,
    "X-CSRF-Token": csrf,
  });
  if (json) headers.set("Content-Type", "application/json");
  return headers;
}

async function orderResponse(response: Response): Promise<PublicProductionOrder> {
  const payload = await jsonResponse(response);
  if (!exact(payload, ["data"])) {
    throw new ProductionOrderApiError("MALFORMED_RESPONSE", response.status);
  }
  return parseProductionOrder(payload.data);
}

export async function getCurrentProductionOrder(): Promise<PublicProductionOrder | null> {
  const response = await fetch(CURRENT_ORDER_PATH, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await jsonResponse(response);
  if (!exact(payload, ["data"])) {
    throw new ProductionOrderApiError("MALFORMED_RESPONSE", response.status);
  }
  return payload.data === null ? null : parseProductionOrder(payload.data);
}

export async function createProductionOrder(input: Readonly<{
  quoteId: string;
  optionId: string;
  address: ShippingAddress;
  email: string;
  idempotencyKey: string;
  servicePointId?: string;
}>): Promise<PublicProductionOrder> {
  return orderResponse(await fetch(ORDER_PATH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: mutationHeaders(input.idempotencyKey, true),
    body: JSON.stringify({
      quoteId: input.quoteId,
      optionId: input.optionId,
      address: input.address,
      email: input.email,
      ...(input.servicePointId ? { servicePointId: input.servicePointId } : {}),
      termsAccepted: true,
      privacyAccepted: true,
    }),
  }));
}

export async function createProductionPaymentSession(
  idempotencyKey: string,
): Promise<string> {
  const response = await fetch(PAYMENT_SESSION_PATH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: mutationHeaders(idempotencyKey),
  });
  const payload = await jsonResponse(response);
  if (!exact(payload, ["data"]) || !record(payload.data) ||
    !exact(payload.data, ["url"]) || typeof payload.data.url !== "string") {
    throw new ProductionOrderApiError("MALFORMED_RESPONSE", response.status);
  }
  let url: URL;
  try {
    url = new URL(payload.data.url);
  } catch {
    throw new ProductionOrderApiError("MALFORMED_RESPONSE", response.status);
  }
  if (url.protocol !== "https:" || url.username || url.password ||
    url.hostname !== "checkout.stripe.com") {
    throw new ProductionOrderApiError("MALFORMED_RESPONSE", response.status);
  }
  return url.href;
}
