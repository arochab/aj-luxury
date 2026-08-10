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

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

export function canReadOrder(
  actor: OrderAccessActor | unknown,
  order: OrderOwnership | unknown,
): boolean {
  if (
    !isRecord(actor) ||
    !isRecord(order) ||
    typeof order.orderId !== "string" ||
    !isSafeInternalId(order.orderId) ||
    (order.customerId !== null && typeof order.customerId !== "string")
  ) {
    return false;
  }

  if (actor.kind === "admin") {
    return (
      typeof actor.role === "string" &&
      adminHasCapability(actor.role, "orders:read")
    );
  }

  if (actor.kind === "customer") {
    return (
      order.customerId !== null &&
      typeof actor.customerId === "string" &&
      isSafeInternalId(actor.customerId) &&
      isSafeInternalId(order.customerId) &&
      actor.customerId === order.customerId
    );
  }

  if (actor.kind !== "guest-order" || !isRecord(actor.grant)) {
    return false;
  }

  return (
    actor.grant[verifiedGuestGrantBrand] === true &&
    typeof actor.grant.orderId === "string" &&
    isSafeInternalId(actor.grant.orderId) &&
    actor.grant.orderId === order.orderId
  );
}

export function canCreateRefund(role: AdminRole): boolean {
  return adminHasCapability(role, "refunds:create");
}
