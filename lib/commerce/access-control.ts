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

/**
 * Guest-order access stays closed until a server-owned D1 store can compare
 * and consume a token in one persistent transaction. A caller callback cannot
 * stand in for that boundary because the caller could return `true` twice.
 */
export const guestOrderGrantAvailability = Object.freeze({
  available: false,
  reason: "persistent-d1-token-store-required",
} as const);

export async function verifyGuestOrderGrant(input: unknown): Promise<null> {
  void input;
  return null;
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
  if (!isRecord(actor) || !isRecord(order)) {
    return false;
  }

  let actorKind: unknown;
  let orderId: unknown;
  let orderCustomerId: unknown;
  try {
    actorKind = actor.kind;
    orderId = order.orderId;
    orderCustomerId = order.customerId;
  } catch {
    return false;
  }

  if (
    typeof orderId !== "string" ||
    !isSafeInternalId(orderId) ||
    (orderCustomerId !== null && typeof orderCustomerId !== "string")
  ) {
    return false;
  }

  if (actorKind === "admin") {
    let role: unknown;
    try {
      role = actor.role;
    } catch {
      return false;
    }
    return (
      typeof role === "string" && adminHasCapability(role, "orders:read")
    );
  }

  if (actorKind === "customer") {
    let actorCustomerId: unknown;
    try {
      actorCustomerId = actor.customerId;
    } catch {
      return false;
    }
    return (
      orderCustomerId !== null &&
      typeof actorCustomerId === "string" &&
      isSafeInternalId(actorCustomerId) &&
      isSafeInternalId(orderCustomerId) &&
      actorCustomerId === orderCustomerId
    );
  }

  // Deliberately do not read actor.grant while issuance is unavailable. This
  // also removes accessor/Proxy time-of-check/time-of-use switching.
  return false;
}

export function canCreateRefund(role: AdminRole): boolean {
  return adminHasCapability(role, "refunds:create");
}
