import { isOpaqueAccessToken } from "./account-security.ts";

export const accessRequestAcknowledgement = Object.freeze({
  accepted: true,
  message: "If the supplied details are eligible, an access link will be sent.",
} as const);

export type SessionCookieKind = "customer" | "guest-order" | "admin" | "cart";

export const identityCookieContract = Object.freeze({
  customer: Object.freeze({
    sessionName: "__Host-aj_customer",
    csrfName: "__Host-aj_customer_csrf",
    sameSite: "Lax",
  }),
  "guest-order": Object.freeze({
    sessionName: "__Host-aj_guest_order",
    csrfName: "__Host-aj_guest_order_csrf",
    sameSite: "Lax",
  }),
  admin: Object.freeze({
    sessionName: "__Host-aj_admin",
    csrfName: "__Host-aj_admin_csrf",
    sameSite: "Strict",
  }),
  cart: Object.freeze({
    sessionName: "__Host-aj_cart",
    csrfName: "__Host-aj_cart_csrf",
    sameSite: "Lax",
  }),
} as const);

function isBoundedCookieLifetime(value: number): boolean {
  return Number.isInteger(value) && value >= 60 && value <= 31 * 24 * 60 * 60;
}

export function buildSessionCookie(
  kind: SessionCookieKind,
  token: string,
  maxAgeSeconds: number,
): string {
  if (!isOpaqueAccessToken(token) || !isBoundedCookieLifetime(maxAgeSeconds)) {
    throw new Error("Invalid session cookie input.");
  }

  const configuration = identityCookieContract[kind];
  return `${configuration.sessionName}=${token}; Path=/; Max-Age=${maxAgeSeconds}; Secure; HttpOnly; SameSite=${configuration.sameSite}`;
}

export function clearSessionCookie(kind: SessionCookieKind): string {
  const configuration = identityCookieContract[kind];
  return `${configuration.sessionName}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=${configuration.sameSite}`;
}

export function buildCsrfCookie(
  kind: SessionCookieKind,
  token: string,
  maxAgeSeconds: number,
): string {
  if (!isOpaqueAccessToken(token) || !isBoundedCookieLifetime(maxAgeSeconds)) {
    throw new Error("Invalid CSRF cookie input.");
  }

  const configuration = identityCookieContract[kind];
  return `${configuration.csrfName}=${token}; Path=/; Max-Age=${maxAgeSeconds}; Secure; SameSite=Strict`;
}

export function clearCsrfCookie(kind: SessionCookieKind): string {
  return `${identityCookieContract[kind].csrfName}=; Path=/; Max-Age=0; Secure; SameSite=Strict`;
}

export function buildPendingCustomerCookie(token: string): string {
  if (!isOpaqueAccessToken(token)) throw new Error("Invalid pending customer token.");
  return `__Host-aj_pending_customer=${token}; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Strict`;
}

export function clearPendingCustomerCookie(): string {
  return "__Host-aj_pending_customer=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict";
}

function normalizeOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin);
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isTrustedMutationOrigin(
  providedOrigin: unknown,
  allowedOrigins: readonly string[],
): boolean {
  if (typeof providedOrigin !== "string" || !Array.isArray(allowedOrigins)) {
    return false;
  }
  const normalizedProvided = normalizeOrigin(providedOrigin);
  if (normalizedProvided === null) return false;

  return allowedOrigins.some(
    (allowed) => typeof allowed === "string" && normalizeOrigin(allowed) === normalizedProvided,
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function isValidCsrfPair(
  cookieToken: unknown,
  headerToken: unknown,
): boolean {
  return (
    isOpaqueAccessToken(cookieToken) &&
    isOpaqueAccessToken(headerToken) &&
    constantTimeEqual(cookieToken, headerToken)
  );
}

/**
 * Browser-only gate. A mutation route must also call
 * D1IdentityAccessStore.authorizeSessionMutation so the CSRF hash is bound to
 * the current persistent session.
 */
export function authorizeBrowserMutation(input: Readonly<{
  method: unknown;
  origin: unknown;
  secFetchSite: unknown;
  allowedOrigins: readonly string[];
  csrfCookieToken: unknown;
  csrfHeaderToken: unknown;
}>): boolean {
  if (
    typeof input.method !== "string" ||
    !["POST", "PUT", "PATCH", "DELETE"].includes(input.method.toUpperCase())
  ) {
    return false;
  }

  return (
    input.secFetchSite === "same-origin" &&
    isTrustedMutationOrigin(input.origin, input.allowedOrigins) &&
    isValidCsrfPair(input.csrfCookieToken, input.csrfHeaderToken)
  );
}
