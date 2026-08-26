"use client";

import { commerceApiPath } from "./commerce-runtime.ts";
import { parseProductionOrder, type PublicProductionOrder } from "./production-order-client.ts";

const paths = Object.freeze({
  current: commerceApiPath("production", "/account/current"),
  register: commerceApiPath("production", "/account/register"),
  login: commerceApiPath("production", "/account/login"),
  logout: commerceApiPath("production", "/account/logout"),
  forgot: commerceApiPath("production", "/account/password/forgot"),
  reset: commerceApiPath("production", "/account/password/reset"),
  marketing: commerceApiPath("production", "/account/marketing"),
});

export type PublicCustomerAccount = Readonly<{
  email: string;
  acceptsMarketing: boolean;
  orders: readonly PublicProductionOrder[];
}>;

export class CustomerAccountApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super(code);
    this.name = "CustomerAccountApiError";
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

async function payload(response: Response): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = await response.json(); } catch {
    throw new CustomerAccountApiError("MALFORMED_RESPONSE", response.status);
  }
  if (!record(value)) throw new CustomerAccountApiError("MALFORMED_RESPONSE", response.status);
  if (!response.ok) {
    const code = record(value.error) && typeof value.error.code === "string"
      ? value.error.code
      : "ACCOUNT_UNAVAILABLE";
    throw new CustomerAccountApiError(code, response.status);
  }
  return value;
}

function customerCsrf(): string | null {
  const values = document.cookie.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    return separator >= 0 && part.slice(0, separator).trim() === "__Host-aj_customer_csrf"
      ? [part.slice(separator + 1).trim()]
      : [];
  });
  return values.length === 1 ? values[0] : null;
}

async function post(path: string, body: Record<string, unknown>, csrf = false) {
  const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json" });
  if (csrf) {
    const token = customerCsrf();
    if (!token) throw new CustomerAccountApiError("CSRF_UNAVAILABLE");
    headers.set("X-CSRF-Token", token);
  }
  return payload(await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers,
    body: JSON.stringify(body),
  }));
}

export async function getCustomerAccount(): Promise<PublicCustomerAccount | null> {
  const response = await fetch(paths.current, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const result = await payload(response);
  if (!exact(result, ["data"])) throw new CustomerAccountApiError("MALFORMED_RESPONSE");
  if (result.data === null) return null;
  if (!record(result.data) || !exact(result.data, ["acceptsMarketing", "email", "orders"]) ||
    typeof result.data.email !== "string" || typeof result.data.acceptsMarketing !== "boolean" ||
    !Array.isArray(result.data.orders)) throw new CustomerAccountApiError("MALFORMED_RESPONSE");
  return Object.freeze({
    email: result.data.email,
    acceptsMarketing: result.data.acceptsMarketing,
    orders: Object.freeze(result.data.orders.map(parseProductionOrder)),
  });
}

export async function registerCustomerAccount(input: Readonly<{
  email: string;
  password: string;
  acceptsMarketing: boolean;
  source: "account_registration" | "checkout";
}>): Promise<void> {
  await post(paths.register, input);
}

export async function loginCustomerAccount(email: string, password: string): Promise<void> {
  await post(paths.login, { email, password });
}

export async function requestCustomerPasswordReset(email: string): Promise<void> {
  await post(paths.forgot, { email });
}

export async function resetCustomerPassword(token: string, password: string): Promise<void> {
  await post(paths.reset, { token, password });
}

export async function logoutCustomerAccount(): Promise<void> {
  await post(paths.logout, {}, true);
}

export async function updateCustomerMarketing(acceptsMarketing: boolean): Promise<void> {
  await post(paths.marketing, { acceptsMarketing }, true);
}
