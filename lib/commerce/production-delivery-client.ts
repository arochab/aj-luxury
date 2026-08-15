"use client";

import { commerceApiPath } from "./commerce-runtime.ts";
import { readCartCsrfToken } from "./preprod-cart-client.ts";
import type { ShippingAddress } from "./preprod-shipping-client.ts";

const OPTIONS_PATH = commerceApiPath("production", "/checkout/delivery-options");
const SELECT_PATH = commerceApiPath(
  "production",
  "/checkout/delivery-options/select",
);
const OPTION_PATTERN = /^delivery_[0-9a-f]{64}$/;
const QUOTE_PATTERN = /^quote_[0-9a-f]{64}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type PublicProductionDeliveryOption = Readonly<{
  optionId: string;
  quoteId: string;
  carrierCode: string;
  serviceCode: string;
  displayName: string;
  deliveryMode: "home";
  amountCents: number;
  currency: "EUR";
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  dutiesTerms: "EU_INCLUDED" | "DAP";
  expiresAt: string;
}>;

export class ProductionDeliveryApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super(code);
    this.name = "ProductionDeliveryApiError";
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

export function parseProductionDeliveryOption(
  value: unknown,
): PublicProductionDeliveryOption {
  const keys = [
    "amountCents", "carrierCode", "currency", "deliveryMode", "displayName",
    "dutiesTerms", "estimatedDaysMax", "estimatedDaysMin", "expiresAt",
    "optionId", "quoteId", "serviceCode",
  ];
  if (!record(value) || !exact(value, keys) ||
    typeof value.optionId !== "string" || !OPTION_PATTERN.test(value.optionId) ||
    typeof value.quoteId !== "string" || !QUOTE_PATTERN.test(value.quoteId) ||
    typeof value.carrierCode !== "string" || value.carrierCode.length < 1 || value.carrierCode.length > 80 ||
    typeof value.serviceCode !== "string" || value.serviceCode.length < 1 || value.serviceCode.length > 80 ||
    typeof value.displayName !== "string" || value.displayName.length < 1 || value.displayName.length > 160 ||
    value.deliveryMode !== "home" || value.currency !== "EUR" ||
    !Number.isSafeInteger(value.amountCents) || (value.amountCents as number) < 0 ||
    !Number.isSafeInteger(value.estimatedDaysMin) || (value.estimatedDaysMin as number) < 1 ||
    !Number.isSafeInteger(value.estimatedDaysMax) ||
    (value.estimatedDaysMax as number) < (value.estimatedDaysMin as number) ||
    !["EU_INCLUDED", "DAP"].includes(String(value.dutiesTerms)) ||
    typeof value.expiresAt !== "string" || !UTC_PATTERN.test(value.expiresAt) ||
    Number.isNaN(Date.parse(value.expiresAt)) ||
    new Date(value.expiresAt).toISOString() !== value.expiresAt
  ) throw new ProductionDeliveryApiError("MALFORMED_RESPONSE");
  return Object.freeze(value as PublicProductionDeliveryOption);
}

export function parseProductionDeliveryOptions(
  value: unknown,
): readonly PublicProductionDeliveryOption[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new ProductionDeliveryApiError("MALFORMED_RESPONSE");
  }
  const options = Object.freeze(value.map(parseProductionDeliveryOption));
  if (new Set(options.map(({ optionId }) => optionId)).size !== options.length) {
    throw new ProductionDeliveryApiError("MALFORMED_RESPONSE");
  }
  return options;
}

async function post(
  path: string,
  body: unknown,
  idempotencyKey: string,
): Promise<unknown> {
  const csrf = readCartCsrfToken();
  if (!csrf) throw new ProductionDeliveryApiError("CSRF_UNAVAILABLE");
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ProductionDeliveryApiError("NETWORK_UNAVAILABLE");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProductionDeliveryApiError("MALFORMED_RESPONSE", response.status);
  }
  if (!response.ok) {
    const code = record(payload) && record(payload.error) &&
      typeof payload.error.code === "string"
      ? payload.error.code
      : "DELIVERY_UNAVAILABLE";
    throw new ProductionDeliveryApiError(code, response.status);
  }
  if (!record(payload) || !exact(payload, ["data"])) {
    throw new ProductionDeliveryApiError("MALFORMED_RESPONSE", response.status);
  }
  return payload.data;
}

export async function requestProductionDeliveryOptions(
  address: ShippingAddress,
  idempotencyKey: string,
): Promise<readonly PublicProductionDeliveryOption[]> {
  return parseProductionDeliveryOptions(await post(
    OPTIONS_PATH,
    { address },
    idempotencyKey,
  ));
}

export async function selectProductionDeliveryOption(
  optionId: string,
  address: ShippingAddress,
  idempotencyKey: string,
): Promise<PublicProductionDeliveryOption> {
  const selected = parseProductionDeliveryOption(await post(
    SELECT_PATH,
    { address, optionId },
    idempotencyKey,
  ));
  if (selected.optionId !== optionId) {
    throw new ProductionDeliveryApiError("MALFORMED_RESPONSE");
  }
  return selected;
}

