import {
  isOneTimeAccessTokenUsable,
  verifyOneTimeAccessToken,
} from "./account-security.ts";

export const adminRoles = Object.freeze(["owner", "operations"] as const);
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

export type VerifiedGuestOrderGrant = Readonly<{
  orderId: string;
}>;

const verifiedGuestGrants = new WeakSet<VerifiedGuestOrderGrant>();

export type ConsumeOneTimeAccessTokenAtomically = (
  command: Readonly<{
    orderId: string;
    expectedTokenHash: string;
    now: string;
  }>,
) => Promise<boolean>;

export async function verifyGuestOrderGrant(input: {
  orderId: string;
  providedToken: string;
  storedTokenHash: string;
  consumedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
  now: Date;
  /**
   * Must compare the persisted hash, consumed/revoked state and expiry, then
   * mark the token consumed in one storage transaction. No grant is issued
   * without this compare-and-consume boundary.
   */
  consumeTokenAtomically: ConsumeOneTimeAccessTokenAtomically;
}): Promise<VerifiedGuestOrderGrant | null> {
  if (
    !isRecord(input) ||
    !isSafeInternalId(input.orderId) ||
    typeof input.providedToken !== "string" ||
    typeof input.storedTokenHash !== "string" ||
    typeof input.expiresAt !== "string" ||
    !(input.now instanceof Date) ||
    !Number.isFinite(input.now.getTime()) ||
    typeof input.consumeTokenAtomically !== "function" ||
    !isOneTimeAccessTokenUsable(input) ||
    !(await verifyOneTimeAccessToken(input.providedToken, input.storedTokenHash))
  ) {
    return null;
  }

  const consumed = await input.consumeTokenAtomically({
    orderId: input.orderId,
    expectedTokenHash: input.storedTokenHash,
    now: input.now.toISOString(),
  });
  if (consumed !== true) {
    return null;
  }

  const grant = Object.freeze({
    orderId: input.orderId,
  });
  verifiedGuestGrants.add(grant);
  return grant;
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
    verifiedGuestGrants.has(actor.grant as VerifiedGuestOrderGrant) &&
    typeof actor.grant.orderId === "string" &&
    isSafeInternalId(actor.grant.orderId) &&
    actor.grant.orderId === order.orderId
  );
}

export function canCreateRefund(role: AdminRole): boolean {
  return adminHasCapability(role, "refunds:create");
}
