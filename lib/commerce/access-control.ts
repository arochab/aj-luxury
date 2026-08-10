import {
  isOneTimeAccessTokenUsable,
  verifyOneTimeAccessToken,
} from "./account-security.ts";

export const adminRoles = ["owner", "operations"] as const;
export type AdminRole = (typeof adminRoles)[number];

export type AdminCapability =
  | "catalog:write"
  | "inventory:write"
  | "orders:read"
  | "orders:write"
  | "refunds:create"
  | "customers:read"
  | "admins:manage";

const roleCapabilities: Record<AdminRole, ReadonlySet<AdminCapability>> = {
  owner: new Set<AdminCapability>([
    "catalog:write",
    "inventory:write",
    "orders:read",
    "orders:write",
    "refunds:create",
    "customers:read",
    "admins:manage",
  ]),
  operations: new Set<AdminCapability>([
    "inventory:write",
    "orders:read",
    "orders:write",
    "customers:read",
  ]),
};

export function adminHasCapability(
  role: AdminRole | string,
  capability: AdminCapability,
): boolean {
  return isAdminRole(role) && roleCapabilities[role].has(capability);
}

export function isAdminRole(value: string): value is AdminRole {
  return (adminRoles as readonly string[]).includes(value);
}

const safeInternalId = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

function isSafeInternalId(value: string): boolean {
  return safeInternalId.test(value);
}

const verifiedGuestGrantBrand = Symbol("verified-guest-order-grant");

export type VerifiedGuestOrderGrant = {
  orderId: string;
  [verifiedGuestGrantBrand]: true;
};

export async function verifyGuestOrderGrant(input: {
  orderId: string;
  providedToken: string;
  storedTokenHash: string;
  consumedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
  now: Date;
}): Promise<VerifiedGuestOrderGrant | null> {
  if (
    !isSafeInternalId(input.orderId) ||
    !isOneTimeAccessTokenUsable(input) ||
    !(await verifyOneTimeAccessToken(input.providedToken, input.storedTokenHash))
  ) {
    return null;
  }

  return Object.freeze({
    orderId: input.orderId,
    [verifiedGuestGrantBrand]: true as const,
  });
}

export type OrderAccessActor =
  | { kind: "customer"; customerId: string }
  | { kind: "guest-order"; grant: VerifiedGuestOrderGrant }
  | { kind: "admin"; role: AdminRole };

export type OrderOwnership = {
  orderId: string;
  customerId: string | null;
};

export function canReadOrder(
  actor: OrderAccessActor,
  order: OrderOwnership,
): boolean {
  if (!isSafeInternalId(order.orderId)) return false;

  if (actor.kind === "admin") {
    return adminHasCapability(actor.role, "orders:read");
  }

  if (actor.kind === "customer") {
    return (
      order.customerId !== null &&
      isSafeInternalId(actor.customerId) &&
      isSafeInternalId(order.customerId) &&
      actor.customerId === order.customerId
    );
  }

  return (
    actor.grant[verifiedGuestGrantBrand] === true &&
    isSafeInternalId(actor.grant.orderId) &&
    actor.grant.orderId === order.orderId
  );
}

export function canCreateRefund(role: AdminRole): boolean {
  return adminHasCapability(role, "refunds:create");
}
