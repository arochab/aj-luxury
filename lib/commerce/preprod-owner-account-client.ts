"use client";

import { readCartCsrfToken } from "./preprod-cart-client.ts";

const ACCOUNT_PATH = "/api/preprod/account/current";
const ADVANCE_PATH = "/api/preprod/orders/current/tracking/advance";
const DIAGNOSTICS_PATH = "/api/preprod/diagnostics";
const stages = ["paid", "label_ready", "handed_over", "in_transit", "delivered"] as const;

export type PublicOwnerAccount = Readonly<{
  email: string;
  authentication: "platform-passwordless";
  access: "owner-only";
  emailSent: false;
  orders: readonly Readonly<{
    orderNumber: string;
    status: "pending_payment" | "paid";
    currency: "EUR";
    subtotalCents: number;
    shippingCents: number;
    totalCents: number;
    createdAt: string;
    paidAt: string | null;
    delivery: Readonly<{
      simulation: true;
      provider: "synthetic-demo";
      externalCarrierContacted: false;
      parcelSent: false;
      stage: (typeof stages)[number];
      trackingReference: string | null;
      labelCreatedAt: string | null;
      handedOverAt: string | null;
      deliveredAt: string | null;
      method: string;
      mode: "home" | "service_point";
      connectorReady: true;
      providerConnected: false;
      realLabelAvailable: false;
    }>;
    lines: readonly Readonly<{
      productName: string;
      colorName: string;
      size: "S" | "M" | "L" | "XL";
      quantity: number;
      unitPriceCents: number;
      lineTotalCents: number;
    }>[];
  }>[];
}>;

export type PublicPreprodDiagnostics = Readonly<{
  status: "ready";
  database: "reachable";
  dataset: Readonly<{ active: true }>;
  simulation: Readonly<{
    emailSent: false;
    externalCarrierContacted: false;
    parcelSent: false;
  }>;
}>;

export class OwnerAccountApiError extends Error {
  constructor(readonly status = 0) {
    super("ACCOUNT_SIMULATION_UNAVAILABLE");
    this.name = "OwnerAccountApiError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

export function parseOwnerAccount(value: unknown): PublicOwnerAccount {
  if (
    !record(value) || typeof value.email !== "string" ||
    value.authentication !== "platform-passwordless" ||
    value.access !== "owner-only" || value.emailSent !== false ||
    !Array.isArray(value.orders)
  ) throw new OwnerAccountApiError();
  for (const order of value.orders) {
    if (
      !record(order) || !/^AJ-TEST-[0-9A-F]{24}$/.test(String(order.orderNumber)) ||
      !["pending_payment", "paid"].includes(String(order.status)) ||
      order.currency !== "EUR" || !Array.isArray(order.lines) ||
      !record(order.delivery) || order.delivery.simulation !== true ||
      order.delivery.provider !== "synthetic-demo" ||
      order.delivery.externalCarrierContacted !== false ||
      order.delivery.parcelSent !== false ||
      !stages.includes(order.delivery.stage as (typeof stages)[number]) ||
      !nullableString(order.delivery.trackingReference) ||
      !nullableString(order.delivery.labelCreatedAt) ||
      !nullableString(order.delivery.handedOverAt) ||
      !nullableString(order.delivery.deliveredAt) ||
      typeof order.delivery.method !== "string" ||
      order.delivery.method.length < 1 || order.delivery.method.length > 160 ||
      !["home", "service_point"].includes(String(order.delivery.mode)) ||
      order.delivery.connectorReady !== true ||
      order.delivery.providerConnected !== false ||
      order.delivery.realLabelAvailable !== false ||
      ![order.subtotalCents, order.shippingCents, order.totalCents]
        .every((amount) => Number.isSafeInteger(amount) && (amount as number) >= 0)
    ) throw new OwnerAccountApiError();
  }
  return value as PublicOwnerAccount;
}

async function readResponse(response: Response): Promise<PublicOwnerAccount> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new OwnerAccountApiError(response.status);
  }
  if (!response.ok || !record(body) || !("data" in body)) {
    throw new OwnerAccountApiError(response.status);
  }
  return parseOwnerAccount(body.data);
}

export async function getOwnerAccount(): Promise<PublicOwnerAccount> {
  return readResponse(await fetch(ACCOUNT_PATH, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  }));
}

export async function getPreprodDiagnostics(): Promise<PublicPreprodDiagnostics> {
  const response = await fetch(DIAGNOSTICS_PATH, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new OwnerAccountApiError(response.status);
  }
  if (!response.ok || !record(body) || !record(body.data)) {
    throw new OwnerAccountApiError(response.status);
  }
  const data = body.data;
  if (
    data.status !== "ready" || data.database !== "reachable" ||
    !record(data.dataset) || data.dataset.active !== true ||
    !record(data.simulation) || data.simulation.emailSent !== false ||
    data.simulation.externalCarrierContacted !== false ||
    data.simulation.parcelSent !== false
  ) throw new OwnerAccountApiError(response.status);
  return data as PublicPreprodDiagnostics;
}

export async function advanceSyntheticDelivery(): Promise<PublicOwnerAccount> {
  const csrf = readCartCsrfToken();
  if (!csrf) throw new OwnerAccountApiError();
  return readResponse(await fetch(ADVANCE_PATH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "X-CSRF-Token": csrf,
    },
  }));
}
