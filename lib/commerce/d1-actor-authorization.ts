import {
  accessTokenHashContexts,
  hashOneTimeAccessToken,
  isCanonicalUtcTimestamp,
  isOpaqueAccessToken,
} from "./account-security.ts";
import type { CommerceD1Database } from "./d1-port.ts";

export type D1MutationActor = Readonly<{
  kind: "customer" | "guest-order" | "admin";
  sessionToken: string;
  csrfToken: string;
}>;

export type ResolvedD1Actor =
  | Readonly<{ kind: "customer"; customerId: string }>
  | Readonly<{ kind: "guest"; orderId: string }>
  | Readonly<{ kind: "admin"; administratorId: string; role: "owner" | "operations" }>;

export async function resolveD1MutationActor(
  database: CommerceD1Database,
  actor: D1MutationActor,
  now: string,
): Promise<ResolvedD1Actor | null> {
  if (
    !isCanonicalUtcTimestamp(now) ||
    typeof actor !== "object" || actor === null ||
    !["customer", "guest-order", "admin"].includes(actor.kind) ||
    !isOpaqueAccessToken(actor.sessionToken) ||
    !isOpaqueAccessToken(actor.csrfToken)
  ) {
    return null;
  }
  const sessionContext = actor.kind === "customer"
    ? accessTokenHashContexts.customerSession
    : actor.kind === "guest-order"
      ? accessTokenHashContexts.guestOrderSession
      : accessTokenHashContexts.adminSession;
  const csrfContext = actor.kind === "customer"
    ? accessTokenHashContexts.customerCsrf
    : actor.kind === "guest-order"
      ? accessTokenHashContexts.guestOrderCsrf
      : accessTokenHashContexts.adminCsrf;
  const [sessionHash, csrfHash] = await Promise.all([
    hashOneTimeAccessToken(actor.sessionToken, sessionContext),
    hashOneTimeAccessToken(actor.csrfToken, csrfContext),
  ]);
  if (actor.kind === "customer") {
    const row = await database
      .prepare(
        `SELECT session.customer_id
        FROM customer_sessions AS session
        INNER JOIN customers AS customer ON customer.id = session.customer_id
        WHERE session.token_hash = ? AND session.csrf_token_hash = ?
          AND session.revoked_at IS NULL AND session.expires_at > ?
          AND session.idle_expires_at > ? AND customer.deleted_at IS NULL
          AND customer.account_enabled_at IS NOT NULL LIMIT 1`,
      )
      .bind(sessionHash, csrfHash, now, now)
      .first<{ customer_id: string }>();
    return row ? Object.freeze({ kind: "customer", customerId: row.customer_id }) : null;
  }
  if (actor.kind === "guest-order") {
    const row = await database
      .prepare(
        `SELECT session.order_id
        FROM guest_order_sessions AS session
        INNER JOIN orders AS customer_order ON customer_order.id = session.order_id
        WHERE session.token_hash = ? AND session.csrf_token_hash = ?
          AND session.revoked_at IS NULL AND session.expires_at > ?
          AND session.idle_expires_at > ? AND customer_order.customer_id IS NULL
        LIMIT 1`,
      )
      .bind(sessionHash, csrfHash, now, now)
      .first<{ order_id: string }>();
    return row ? Object.freeze({ kind: "guest", orderId: row.order_id }) : null;
  }
  const row = await database
    .prepare(
      `SELECT administrator.id, administrator.role
      FROM admin_sessions AS session
      INNER JOIN administrators AS administrator
        ON administrator.id = session.administrator_id
      WHERE session.token_hash = ? AND session.csrf_token_hash = ?
        AND session.revoked_at IS NULL AND session.expires_at > ?
        AND session.idle_expires_at > ? AND session.aal >= 2
        AND administrator.enabled = 1
        AND administrator.authz_version = session.authz_version
        AND administrator.role IN ('owner', 'operations') LIMIT 1`,
    )
    .bind(sessionHash, csrfHash, now, now)
    .first<{ id: string; role: "owner" | "operations" }>();
  return row
    ? Object.freeze({
        kind: "admin",
        administratorId: row.id,
        role: row.role,
      })
    : null;
}
