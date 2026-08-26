import type { AdminRole } from "./access-control.ts";
import {
  accessTokenHashContexts,
  type AccessTokenHashContext,
  createOneTimeAccessToken,
  createOpaqueAccessToken,
  hashOneTimeAccessToken,
  isCanonicalUtcTimestamp,
  isOpaqueAccessToken,
} from "./account-security.ts";
import type { CommerceD1Database } from "./d1-port.ts";
import { accessRequestAcknowledgement } from "./identity-access-policy.ts";

const safeInternalId = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const sha256Hex = /^[0-9a-f]{64}$/;
const genericAccessResponse = accessRequestAcknowledgement;

const durations = Object.freeze({
  customer: Object.freeze({ absoluteMs: 7 * 24 * 60 * 60_000, idleMs: 30 * 60_000 }),
  guest: Object.freeze({ absoluteMs: 24 * 60 * 60_000, idleMs: 15 * 60_000 }),
  admin: Object.freeze({ absoluteMs: 8 * 60 * 60_000, idleMs: 15 * 60_000 }),
});
const accessRequestMinimumDurationMs = 120;
const adminPreMfaRateLimitSeed = "admin-sign-in-pre-mfa";

export class IdentityAccessError extends Error {
  readonly code:
    | "INVALID_INPUT"
    | "DEPENDENCY_UNAVAILABLE"
    | "RATE_LIMITED"
    | "PERSISTENCE_FAILURE";

  constructor(
    code:
      | "INVALID_INPUT"
      | "DEPENDENCY_UNAVAILABLE"
      | "RATE_LIMITED"
      | "PERSISTENCE_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "IdentityAccessError";
    this.code = code;
  }
}

export type IdentityDelivery = Readonly<{
  destinationEmail: string;
  rawToken: string;
  expiresAt: string;
  idempotencyKey: string;
  notAfter: string;
  purpose: "customer_sign_in" | "guest_order_access";
  orderNumber?: string;
}>;

export type IdentityDeliveryReceipt = Readonly<{
  idempotencyKey: string;
  acceptedAt: string;
}>;

export interface IdentityDeliveryPort {
  /**
   * The adapter MUST atomically deduplicate concurrent/repeated calls by
   * idempotencyKey, return the same acceptance receipt for every replay, and
   * refuse provider acceptance at or after notAfter.
   */
  deliver(input: IdentityDelivery): Promise<IdentityDeliveryReceipt>;
}

export interface IdentityRateLimitPort {
  take(input: Readonly<{
    scope: "customer_sign_in" | "guest_order_access" | "admin_sign_in";
    discriminatorHash: string;
    now: string;
  }>): Promise<boolean>;
}

export type VerifiedExternalMfa = Readonly<{
  externalSubjectHash: string;
  evidenceHash: string;
  aal: number;
  authenticatedAt: string;
}>;

export interface ExternalMfaPort {
  verify(assertion: unknown): Promise<VerifiedExternalMfa | null>;
}

export interface IdentityBackgroundPort {
  defer(task: () => Promise<void>): void;
}

export interface IdentityTimingPort {
  monotonicMilliseconds(): number;
  wait(milliseconds: number): Promise<void>;
}

export interface IdentityUtcClockPort {
  now(): string;
}

const closedDeliveryPort: IdentityDeliveryPort = Object.freeze({
  async deliver() {
    throw new IdentityAccessError(
      "DEPENDENCY_UNAVAILABLE",
      "Identity delivery is not configured.",
    );
  },
});

const closedRateLimitPort: IdentityRateLimitPort = Object.freeze({
  async take(input: Parameters<IdentityRateLimitPort["take"]>[0]) {
    if (input.scope === "admin_sign_in") {
      throw new IdentityAccessError(
        "DEPENDENCY_UNAVAILABLE",
        "Admin rate limiting is not configured.",
      );
    }
    return false;
  },
});

const closedMfaPort: ExternalMfaPort = Object.freeze({
  async verify() {
    throw new IdentityAccessError(
      "DEPENDENCY_UNAVAILABLE",
      "External MFA verification is not configured.",
    );
  },
});

const closedBackgroundPort: IdentityBackgroundPort = Object.freeze({
  defer() {
    throw new IdentityAccessError(
      "DEPENDENCY_UNAVAILABLE",
      "Identity background execution is not configured.",
    );
  },
});

const systemTimingPort: IdentityTimingPort = Object.freeze({
  monotonicMilliseconds() {
    return performance.now();
  },
  async wait(milliseconds: number) {
    await new Promise<void>((resolvePromise) => {
      setTimeout(resolvePromise, milliseconds);
    });
  },
});

const systemUtcClockPort: IdentityUtcClockPort = Object.freeze({
  now() {
    return new Date().toISOString();
  },
});

export const closedIdentityAccessPorts = Object.freeze({
  delivery: closedDeliveryPort,
  rateLimit: closedRateLimitPort,
  externalMfa: closedMfaPort,
  background: closedBackgroundPort,
  timing: systemTimingPort,
  utcClock: systemUtcClockPort,
  available: false,
  reason: "external-identity-providers-not-configured",
} as const);

type SessionResult = Readonly<{
  token: string;
  csrfToken: string;
  expiresAt: string;
  idleExpiresAt: string;
}>;

export type OrderAccessActor =
  | Readonly<{ kind: "customer"; sessionToken: string }>
  | Readonly<{ kind: "guest-order"; sessionToken: string }>
  | Readonly<{ kind: "admin"; sessionToken: string }>;

export type AccessibleOrder = Readonly<{
  id: string;
  orderNumber: string;
  status: string;
}>;

function assertInternalId(value: string, label: string): void {
  if (!safeInternalId.test(value)) {
    throw new IdentityAccessError("INVALID_INPUT", `${label} is invalid.`);
  }
}

function assertTimestamp(value: string, label: string): void {
  if (!isCanonicalUtcTimestamp(value)) {
    throw new IdentityAccessError("INVALID_INPUT", `${label} must be canonical UTC.`);
  }
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function earlierTimestamp(left: string, right: string): string {
  return left < right ? left : right;
}

function normalizeEmail(value: string): string {
  if (typeof value !== "string") {
    throw new IdentityAccessError("INVALID_INPUT", "Email is invalid.");
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new IdentityAccessError("INVALID_INPUT", "Email is invalid.");
  }
  return normalized;
}

function isExpectedContention(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /UNIQUE constraint failed|identity_.+_(?:insert_not_allowed|consume_failed)/.test(
    message,
  );
}

function changed(result: { meta?: { changes?: number } } | undefined): number {
  return Number(result?.meta?.changes ?? 0);
}

type IdentitySessionKind = "customer" | "guest-order" | "admin";

function sessionHashContext(kind: IdentitySessionKind): AccessTokenHashContext {
  return kind === "customer"
    ? accessTokenHashContexts.customerSession
    : kind === "guest-order"
      ? accessTokenHashContexts.guestOrderSession
      : accessTokenHashContexts.adminSession;
}

function csrfHashContext(kind: IdentitySessionKind): AccessTokenHashContext {
  return kind === "customer"
    ? accessTokenHashContexts.customerCsrf
    : kind === "guest-order"
      ? accessTokenHashContexts.guestOrderCsrf
      : accessTokenHashContexts.adminCsrf;
}

export class D1IdentityAccessStore {
  private readonly database: CommerceD1Database;
  private readonly ports: Readonly<{
    delivery: IdentityDeliveryPort;
    rateLimit: IdentityRateLimitPort;
    externalMfa: ExternalMfaPort;
    background: IdentityBackgroundPort;
    timing: IdentityTimingPort;
    utcClock: IdentityUtcClockPort;
  }>;

  constructor(
    database: CommerceD1Database,
    ports: Readonly<{
      delivery: IdentityDeliveryPort;
      rateLimit: IdentityRateLimitPort;
      externalMfa: ExternalMfaPort;
      background: IdentityBackgroundPort;
      timing: IdentityTimingPort;
      utcClock: IdentityUtcClockPort;
    }> = closedIdentityAccessPorts,
  ) {
    this.database = database;
    this.ports = ports;
  }

  async requestCustomerSignIn(input: Readonly<{
    email: string;
    challengeId: string;
    now: string;
  }>): Promise<typeof genericAccessResponse> {
    const email = normalizeEmail(input.email);
    assertInternalId(input.challengeId, "Challenge id");
    assertTimestamp(input.now, "Now");
    const timingStartedAt = this.startAccessRequestTiming();

    try {
      const discriminatorHash = await hashOneTimeAccessToken(
        email,
        accessTokenHashContexts.customerRateLimit,
      );
      if (
        !(await this.ports.rateLimit.take({
          scope: "customer_sign_in",
          discriminatorHash,
          now: input.now,
        }))
      ) {
        return genericAccessResponse;
      }

      const customer = await this.database
        .prepare(
          `SELECT id, email FROM customers
          WHERE lower(email) = ? AND account_enabled_at IS NOT NULL
            AND deleted_at IS NULL
          LIMIT 1`,
        )
        .bind(email)
        .first<{ id: string; email: string }>();
      const challenge = await createOneTimeAccessToken(
        new Date(input.now),
        15,
        accessTokenHashContexts.customerChallenge,
      );

      await this.database
        .prepare(
          `INSERT INTO access_challenges (
            id, purpose, customer_id, order_id, token_hash, expires_at,
            dispatched_at, consumed_at, revoked_at, created_at
          ) VALUES (?, 'customer_sign_in', ?, NULL, ?, ?, NULL, NULL, ?, ?)`,
        )
        .bind(
          input.challengeId,
          customer?.id ?? null,
          challenge.tokenHash,
          challenge.expiresAt,
          customer === null ? input.now : null,
          input.now,
        )
        .run();

      if (customer !== null) {
        try {
          this.ports.background.defer(() =>
            this.deliverAndActivateChallenge({
              challengeId: input.challengeId,
              delivery: {
                destinationEmail: customer.email,
                rawToken: challenge.token,
                expiresAt: challenge.expiresAt,
                idempotencyKey: `account_access:${input.challengeId}`,
                notAfter: challenge.expiresAt,
                purpose: "customer_sign_in",
              },
            }),
          );
        } catch {
          await this.revokeChallenge(
            input.challengeId,
            this.readUtcClockOrFallback(input.now, input.now),
          );
        }
      }

      return genericAccessResponse;
    } finally {
      await this.concealAccessRequestTiming(timingStartedAt);
    }
  }

  async requestGuestOrderAccess(input: Readonly<{
    email: string;
    orderNumber: string;
    challengeId: string;
    now: string;
  }>): Promise<typeof genericAccessResponse> {
    const email = normalizeEmail(input.email);
    if (typeof input.orderNumber !== "string") {
      throw new IdentityAccessError("INVALID_INPUT", "Order number is invalid.");
    }
    const orderNumber = input.orderNumber.trim().toUpperCase();
    assertInternalId(input.challengeId, "Challenge id");
    assertTimestamp(input.now, "Now");
    if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(orderNumber)) {
      throw new IdentityAccessError("INVALID_INPUT", "Order number is invalid.");
    }
    const timingStartedAt = this.startAccessRequestTiming();

    try {
      const discriminatorHash = await hashOneTimeAccessToken(
        `${orderNumber}\n${email}`,
        accessTokenHashContexts.guestOrderRateLimit,
      );
      if (
        !(await this.ports.rateLimit.take({
          scope: "guest_order_access",
          discriminatorHash,
          now: input.now,
        }))
      ) {
        return genericAccessResponse;
      }

      const order = await this.database
        .prepare(
          `SELECT id, order_number, email FROM orders
          WHERE order_number = ? AND lower(email) = ? AND customer_id IS NULL
          LIMIT 1`,
        )
        .bind(orderNumber, email)
        .first<{ id: string; order_number: string; email: string }>();
      const challenge = await createOneTimeAccessToken(
        new Date(input.now),
        15,
        accessTokenHashContexts.guestOrderChallenge,
      );
      await this.database
        .prepare(
          `INSERT INTO access_challenges (
            id, purpose, customer_id, order_id, token_hash, expires_at,
            dispatched_at, consumed_at, revoked_at, created_at
          ) VALUES (?, 'guest_order_access', NULL, ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .bind(
          input.challengeId,
          order?.id ?? null,
          challenge.tokenHash,
          challenge.expiresAt,
          order === null ? input.now : null,
          input.now,
        )
        .run();

      if (order !== null) {
        try {
          this.ports.background.defer(() =>
            this.deliverAndActivateChallenge({
              challengeId: input.challengeId,
              delivery: {
                destinationEmail: order.email,
                rawToken: challenge.token,
                expiresAt: challenge.expiresAt,
                idempotencyKey: `account_access:${input.challengeId}`,
                notAfter: challenge.expiresAt,
                purpose: "guest_order_access",
                orderNumber: order.order_number,
              },
            }),
          );
        } catch {
          await this.revokeChallenge(
            input.challengeId,
            this.readUtcClockOrFallback(input.now, input.now),
          );
        }
      }

      return genericAccessResponse;
    } finally {
      await this.concealAccessRequestTiming(timingStartedAt);
    }
  }

  async consumeCustomerChallenge(input: Readonly<{
    rawChallengeToken: string;
    sessionId: string;
    now: string;
  }>): Promise<SessionResult | null> {
    return this.consumeChallenge(input, "customer");
  }

  async consumeGuestOrderChallenge(input: Readonly<{
    rawChallengeToken: string;
    sessionId: string;
    now: string;
  }>): Promise<SessionResult | null> {
    return this.consumeChallenge(input, "guest");
  }

  private async consumeChallenge(
    input: Readonly<{
      rawChallengeToken: string;
      sessionId: string;
      now: string;
    }>,
    kind: "customer" | "guest",
  ): Promise<SessionResult | null> {
    if (!isOpaqueAccessToken(input.rawChallengeToken)) return null;
    assertInternalId(input.sessionId, "Session id");
    assertTimestamp(input.now, "Now");
    const challengeHash = await hashOneTimeAccessToken(
      input.rawChallengeToken,
      kind === "customer"
        ? accessTokenHashContexts.customerChallenge
        : accessTokenHashContexts.guestOrderChallenge,
    );
    const session = await createOpaqueAccessToken(
      kind === "customer"
        ? accessTokenHashContexts.customerSession
        : accessTokenHashContexts.guestOrderSession,
    );
    const csrf = await createOpaqueAccessToken(
      kind === "customer"
        ? accessTokenHashContexts.customerCsrf
        : accessTokenHashContexts.guestOrderCsrf,
    );
    const expiresAt = addMilliseconds(input.now, durations[kind].absoluteMs);
    const idleExpiresAt = addMilliseconds(input.now, durations[kind].idleMs);

    const create =
      kind === "customer"
        ? this.database
            .prepare(
              `INSERT INTO customer_sessions (
                id, customer_id, token_hash, csrf_token_hash, session_family_id,
                authentication_source, issued_by_challenge_id,
                rotated_from_session_id, expires_at, idle_expires_at,
                last_seen_at, revoked_at, created_at
              )
              SELECT ?, customer_id, ?, ?, ?, 'challenge', id, NULL, ?, ?, NULL, NULL, ?
              FROM access_challenges
              WHERE token_hash = ? AND purpose = 'customer_sign_in'
                AND customer_id IS NOT NULL AND dispatched_at IS NOT NULL
                AND consumed_at IS NULL AND revoked_at IS NULL
                AND expires_at > ?`,
            )
            .bind(
              input.sessionId,
              session.tokenHash,
              csrf.tokenHash,
              input.sessionId,
              expiresAt,
              idleExpiresAt,
              input.now,
              challengeHash,
              input.now,
            )
        : this.database
            .prepare(
              `INSERT INTO guest_order_sessions (
                id, order_id, token_hash, csrf_token_hash, issued_by_challenge_id,
                expires_at, idle_expires_at, last_seen_at, revoked_at, created_at
              )
              SELECT ?, order_id, ?, ?, id, ?, ?, NULL, NULL, ?
              FROM access_challenges
              WHERE token_hash = ? AND purpose = 'guest_order_access'
                AND order_id IS NOT NULL AND dispatched_at IS NOT NULL
                AND consumed_at IS NULL AND revoked_at IS NULL
                AND expires_at > ?`,
            )
            .bind(
              input.sessionId,
              session.tokenHash,
              csrf.tokenHash,
              expiresAt,
              idleExpiresAt,
              input.now,
              challengeHash,
              input.now,
            );

    try {
      const result = await create.run();
      if (changed(result) !== 1) return null;
    } catch (error) {
      if (isExpectedContention(error)) return null;
      throw error;
    }

    return Object.freeze({
      token: session.token,
      csrfToken: csrf.token,
      expiresAt,
      idleExpiresAt,
    });
  }

  async rotateCustomerSession(input: Readonly<{
    rawSessionToken: string;
    newSessionId: string;
    now: string;
  }>): Promise<SessionResult | null> {
    if (!isOpaqueAccessToken(input.rawSessionToken)) return null;
    assertInternalId(input.newSessionId, "Session id");
    assertTimestamp(input.now, "Now");
    const oldHash = await hashOneTimeAccessToken(
      input.rawSessionToken,
      accessTokenHashContexts.customerSession,
    );
    const current = await this.database
      .prepare(
        `SELECT expires_at FROM customer_sessions
        WHERE token_hash = ? AND revoked_at IS NULL
          AND expires_at > ? AND idle_expires_at > ?`,
      )
      .bind(oldHash, input.now, input.now)
      .first<{ expires_at: string }>();
    if (current === null) return null;

    const replacement = await createOpaqueAccessToken(
      accessTokenHashContexts.customerSession,
    );
    const csrf = await createOpaqueAccessToken(
      accessTokenHashContexts.customerCsrf,
    );
    const idleExpiresAt = earlierTimestamp(
      addMilliseconds(input.now, durations.customer.idleMs),
      current.expires_at,
    );
    const revoke = this.database
      .prepare(
        `UPDATE customer_sessions SET revoked_at = ?
        WHERE token_hash = ? AND revoked_at IS NULL
          AND expires_at > ? AND idle_expires_at > ?`,
      )
      .bind(input.now, oldHash, input.now, input.now);
    const create = this.database
      .prepare(
        `INSERT INTO customer_sessions (
          id, customer_id, token_hash, csrf_token_hash, session_family_id,
          authentication_source, issued_by_challenge_id,
          rotated_from_session_id, expires_at, idle_expires_at,
          last_seen_at, revoked_at, created_at
        )
        SELECT ?, customer_id, ?, ?, session_family_id, 'rotation', NULL, id,
          expires_at, ?, NULL, NULL, ?
        FROM customer_sessions
        WHERE token_hash = ? AND revoked_at = ?`,
      )
      .bind(
        input.newSessionId,
        replacement.tokenHash,
        csrf.tokenHash,
        idleExpiresAt,
        input.now,
        oldHash,
        input.now,
      );

    try {
      const results = await this.database.batch([revoke, create]);
      if (changed(results[0]) !== 1 || changed(results[1]) !== 1) return null;
    } catch (error) {
      if (isExpectedContention(error)) return null;
      throw error;
    }

    return Object.freeze({
      token: replacement.token,
      csrfToken: csrf.token,
      expiresAt: current.expires_at,
      idleExpiresAt,
    });
  }

  async createAdminSession(input: Readonly<{
    assertion: unknown;
    sessionId: string;
    now: string;
    requestedRole?: unknown;
  }>): Promise<(SessionResult & { role: AdminRole }) | null> {
    void input.requestedRole;
    assertInternalId(input.sessionId, "Session id");
    assertTimestamp(input.now, "Now");
    const discriminatorHash = await hashOneTimeAccessToken(
      adminPreMfaRateLimitSeed,
      accessTokenHashContexts.adminRateLimit,
    );
    if (
      !(await this.ports.rateLimit.take({
        scope: "admin_sign_in",
        discriminatorHash,
        now: input.now,
      }))
    ) {
      return null;
    }

    const evidence = await this.ports.externalMfa.verify(input.assertion);
    if (
      evidence === null ||
      !sha256Hex.test(evidence.externalSubjectHash) ||
      !sha256Hex.test(evidence.evidenceHash) ||
      !Number.isInteger(evidence.aal) ||
      evidence.aal < 2 ||
      !isCanonicalUtcTimestamp(evidence.authenticatedAt) ||
      evidence.authenticatedAt > input.now ||
      Date.parse(input.now) - Date.parse(evidence.authenticatedAt) > 5 * 60_000
    ) {
      return null;
    }

    const administrator = await this.database
      .prepare(
        `SELECT id, role, authz_version FROM administrators
        WHERE external_subject_hash = ? AND enabled = 1
        LIMIT 1`,
      )
      .bind(evidence.externalSubjectHash)
      .first<{ id: string; role: AdminRole; authz_version: number }>();
    if (administrator === null) return null;

    const session = await createOpaqueAccessToken(
      accessTokenHashContexts.adminSession,
    );
    const csrf = await createOpaqueAccessToken(
      accessTokenHashContexts.adminCsrf,
    );
    const expiresAt = addMilliseconds(input.now, durations.admin.absoluteMs);
    const idleExpiresAt = addMilliseconds(input.now, durations.admin.idleMs);
    const result = await this.database
      .prepare(
        `INSERT INTO admin_sessions (
          id, administrator_id, token_hash, csrf_token_hash, evidence_hash,
          authz_version, aal,
          external_authenticated_at, expires_at, idle_expires_at,
          last_seen_at, revoked_at, created_at
        )
        SELECT ?, id, ?, ?, ?, authz_version, ?, ?, ?, ?, NULL, NULL, ?
        FROM administrators
        WHERE id = ? AND enabled = 1 AND authz_version = ?`,
      )
      .bind(
        input.sessionId,
        session.tokenHash,
        csrf.tokenHash,
        evidence.evidenceHash,
        evidence.aal,
        evidence.authenticatedAt,
        expiresAt,
        idleExpiresAt,
        input.now,
        administrator.id,
        administrator.authz_version,
      )
      .run()
      .catch((error: unknown) => {
        if (isExpectedContention(error)) return null;
        throw error;
      });
    if (result === null || changed(result) !== 1) return null;

    return Object.freeze({
      token: session.token,
      csrfToken: csrf.token,
      expiresAt,
      idleExpiresAt,
      role: administrator.role,
    });
  }

  async findAccessibleOrder(
    orderId: string,
    actor: OrderAccessActor,
    now: string,
  ): Promise<AccessibleOrder | null> {
    if (typeof orderId !== "string" || !safeInternalId.test(orderId)) {
      return null;
    }
    let actorKind: unknown;
    let sessionToken: unknown;
    try {
      if (typeof actor !== "object" || actor === null) return null;
      actorKind = actor.kind;
      sessionToken = actor.sessionToken;
    } catch {
      return null;
    }
    if (
      typeof actorKind !== "string" ||
      !["customer", "guest-order", "admin"].includes(actorKind) ||
      !isOpaqueAccessToken(sessionToken)
    ) {
      return null;
    }
    assertTimestamp(now, "Now");
    const tokenHash = await hashOneTimeAccessToken(
      sessionToken,
      sessionHashContext(actorKind as IdentitySessionKind),
    );
    let query: string;
    if (actorKind === "customer") {
      query = `SELECT customer_order.id, customer_order.order_number, customer_order.status
        FROM orders AS customer_order
        INNER JOIN customer_sessions AS session
          ON session.customer_id = customer_order.customer_id
        INNER JOIN customers AS customer ON customer.id = session.customer_id
        WHERE customer_order.id = ? AND session.token_hash = ?
          AND session.revoked_at IS NULL AND session.expires_at > ?
          AND session.idle_expires_at > ? AND customer.deleted_at IS NULL
          AND customer.account_enabled_at IS NOT NULL
        LIMIT 1`;
    } else if (actorKind === "guest-order") {
      query = `SELECT customer_order.id, customer_order.order_number, customer_order.status
        FROM orders AS customer_order
        INNER JOIN guest_order_sessions AS session
          ON session.order_id = customer_order.id
        WHERE customer_order.id = ? AND customer_order.customer_id IS NULL
          AND session.token_hash = ? AND session.revoked_at IS NULL
          AND session.expires_at > ? AND session.idle_expires_at > ?
        LIMIT 1`;
    } else if (actorKind === "admin") {
      query = `SELECT customer_order.id, customer_order.order_number, customer_order.status
        FROM orders AS customer_order
        INNER JOIN admin_sessions AS session ON session.token_hash = ?
        INNER JOIN administrators AS administrator
          ON administrator.id = session.administrator_id
        WHERE customer_order.id = ? AND administrator.enabled = 1
          AND administrator.authz_version = session.authz_version
          AND administrator.role IN ('owner', 'operations')
          AND session.aal >= 2 AND session.revoked_at IS NULL
          AND session.expires_at > ? AND session.idle_expires_at > ?
        LIMIT 1`;
      const row = await this.database
        .prepare(query)
        .bind(tokenHash, orderId, now, now)
        .first<{ id: string; order_number: string; status: string }>();
      return row === null
        ? null
        : Object.freeze({ id: row.id, orderNumber: row.order_number, status: row.status });
    } else {
      return null;
    }

    const row = await this.database
      .prepare(query)
      .bind(orderId, tokenHash, now, now)
      .first<{ id: string; order_number: string; status: string }>();
    return row === null
      ? null
      : Object.freeze({ id: row.id, orderNumber: row.order_number, status: row.status });
  }

  async currentGuestOrder(
    rawSessionToken: string,
    now: string,
  ): Promise<AccessibleOrder | null> {
    if (!isOpaqueAccessToken(rawSessionToken)) return null;
    assertTimestamp(now, "Now");
    const tokenHash = await hashOneTimeAccessToken(
      rawSessionToken,
      accessTokenHashContexts.guestOrderSession,
    );
    const row = await this.database.prepare(
      `SELECT customer_order.id, customer_order.order_number, customer_order.status
      FROM orders AS customer_order
      INNER JOIN guest_order_sessions AS session
        ON session.order_id = customer_order.id
      WHERE customer_order.customer_id IS NULL AND session.token_hash = ?
        AND session.revoked_at IS NULL AND session.expires_at > ?
        AND session.idle_expires_at > ?
      LIMIT 1`,
    ).bind(tokenHash, now, now).first<{
      id: string;
      order_number: string;
      status: string;
    }>();
    return row === null
      ? null
      : Object.freeze({ id: row.id, orderNumber: row.order_number, status: row.status });
  }

  async logout(
    kind: "customer" | "guest-order" | "admin",
    rawSessionToken: string,
    now: string,
  ): Promise<boolean> {
    if (
      !["customer", "guest-order", "admin"].includes(kind) ||
      !isOpaqueAccessToken(rawSessionToken)
    ) {
      return false;
    }
    assertTimestamp(now, "Now");
    const tokenHash = await hashOneTimeAccessToken(
      rawSessionToken,
      sessionHashContext(kind),
    );
    const updateSql =
      kind === "customer"
        ? `UPDATE customer_sessions SET revoked_at = ?
          WHERE token_hash = ? AND revoked_at IS NULL`
        : kind === "guest-order"
          ? `UPDATE guest_order_sessions SET revoked_at = ?
            WHERE token_hash = ? AND revoked_at IS NULL`
          : `UPDATE admin_sessions SET revoked_at = ?
            WHERE token_hash = ? AND revoked_at IS NULL`;
    const result = await this.database
      .prepare(updateSql)
      .bind(now, tokenHash)
      .run();
    return changed(result) === 1;
  }

  async logoutAllCustomerSessions(
    rawSessionToken: string,
    now: string,
  ): Promise<number> {
    if (!isOpaqueAccessToken(rawSessionToken)) return 0;
    assertTimestamp(now, "Now");
    const tokenHash = await hashOneTimeAccessToken(
      rawSessionToken,
      accessTokenHashContexts.customerSession,
    );
    const result = await this.database
      .prepare(
        `UPDATE customer_sessions SET revoked_at = ?
        WHERE revoked_at IS NULL
          AND customer_id = (
            SELECT current_session.customer_id
            FROM customer_sessions AS current_session
            INNER JOIN customers AS customer
              ON customer.id = current_session.customer_id
            WHERE current_session.token_hash = ?
              AND current_session.revoked_at IS NULL
              AND current_session.expires_at > ?
              AND current_session.idle_expires_at > ?
              AND customer.deleted_at IS NULL
              AND customer.account_enabled_at IS NOT NULL
            LIMIT 1
          )`,
      )
      .bind(now, tokenHash, now, now)
      .run();
    return changed(result);
  }

  async authorizeSessionMutation(
    kind: "customer" | "guest-order" | "admin",
    rawSessionToken: string,
    rawCsrfToken: string,
    now: string,
  ): Promise<boolean> {
    if (
      !["customer", "guest-order", "admin"].includes(kind) ||
      !isOpaqueAccessToken(rawSessionToken) ||
      !isOpaqueAccessToken(rawCsrfToken)
    ) {
      return false;
    }
    assertTimestamp(now, "Now");
    const [sessionHash, csrfHash] = await Promise.all([
      hashOneTimeAccessToken(rawSessionToken, sessionHashContext(kind)),
      hashOneTimeAccessToken(rawCsrfToken, csrfHashContext(kind)),
    ]);
    const query =
      kind === "customer"
        ? `SELECT 1 AS authorized FROM customer_sessions AS session
          INNER JOIN customers AS customer ON customer.id = session.customer_id
          WHERE session.token_hash = ? AND session.csrf_token_hash = ?
            AND session.revoked_at IS NULL AND session.expires_at > ?
            AND session.idle_expires_at > ? AND customer.deleted_at IS NULL
            AND customer.account_enabled_at IS NOT NULL
          LIMIT 1`
        : kind === "guest-order"
          ? `SELECT 1 AS authorized FROM guest_order_sessions
            WHERE token_hash = ? AND csrf_token_hash = ?
              AND revoked_at IS NULL AND expires_at > ? AND idle_expires_at > ?
            LIMIT 1`
          : `SELECT 1 AS authorized
            FROM admin_sessions AS session
            INNER JOIN administrators AS administrator
              ON administrator.id = session.administrator_id
            WHERE session.token_hash = ? AND session.csrf_token_hash = ?
              AND session.revoked_at IS NULL AND session.expires_at > ?
              AND session.idle_expires_at > ? AND administrator.enabled = 1
              AND administrator.authz_version = session.authz_version
            LIMIT 1`;
    return (
      (await this.database
        .prepare(query)
        .bind(sessionHash, csrfHash, now, now)
        .first<{ authorized: number }>()) !== null
    );
  }

  async touchSession(
    kind: "customer" | "guest-order" | "admin",
    rawSessionToken: string,
    now: string,
  ): Promise<boolean> {
    if (
      !["customer", "guest-order", "admin"].includes(kind) ||
      !isOpaqueAccessToken(rawSessionToken)
    ) {
      return false;
    }
    assertTimestamp(now, "Now");
    const tokenHash = await hashOneTimeAccessToken(
      rawSessionToken,
      sessionHashContext(kind),
    );
    const duration =
      kind === "customer"
        ? durations.customer
        : kind === "guest-order"
          ? durations.guest
          : durations.admin;
    const selectSql =
      kind === "customer"
        ? `SELECT expires_at FROM customer_sessions
          WHERE token_hash = ? AND revoked_at IS NULL
            AND expires_at > ? AND idle_expires_at > ?`
        : kind === "guest-order"
          ? `SELECT expires_at FROM guest_order_sessions
            WHERE token_hash = ? AND revoked_at IS NULL
              AND expires_at > ? AND idle_expires_at > ?`
          : `SELECT session.expires_at
            FROM admin_sessions AS session
            INNER JOIN administrators AS administrator
              ON administrator.id = session.administrator_id
            WHERE session.token_hash = ? AND session.revoked_at IS NULL
              AND session.expires_at > ? AND session.idle_expires_at > ?
              AND administrator.enabled = 1
              AND administrator.authz_version = session.authz_version`;
    const current = await this.database
      .prepare(selectSql)
      .bind(tokenHash, now, now)
      .first<{ expires_at: string }>();
    if (current === null) return false;
    const idleExpiresAt = earlierTimestamp(
      addMilliseconds(now, duration.idleMs),
      current.expires_at,
    );

    const updateSql =
      kind === "customer"
        ? `UPDATE customer_sessions
          SET last_seen_at = ?, idle_expires_at = ?
          WHERE token_hash = ? AND revoked_at IS NULL
            AND expires_at > ? AND idle_expires_at > ?`
        : kind === "guest-order"
          ? `UPDATE guest_order_sessions
            SET last_seen_at = ?, idle_expires_at = ?
            WHERE token_hash = ? AND revoked_at IS NULL
              AND expires_at > ? AND idle_expires_at > ?`
          : `UPDATE admin_sessions
            SET last_seen_at = ?, idle_expires_at = ?
            WHERE token_hash = ? AND revoked_at IS NULL
              AND expires_at > ? AND idle_expires_at > ?
              AND EXISTS (
                SELECT 1 FROM administrators
                WHERE administrators.id = admin_sessions.administrator_id
                  AND administrators.enabled = 1
                  AND administrators.authz_version = admin_sessions.authz_version
              )`;
    const result = await this.database
      .prepare(updateSql)
      .bind(now, idleExpiresAt, tokenHash, now, now)
      .run();
    return changed(result) === 1;
  }

  private startAccessRequestTiming(): number {
    const startedAt = this.ports.timing.monotonicMilliseconds();
    if (!Number.isFinite(startedAt)) {
      throw new IdentityAccessError(
        "DEPENDENCY_UNAVAILABLE",
        "Identity timing is not configured safely.",
      );
    }
    return startedAt;
  }

  private async concealAccessRequestTiming(startedAt: number): Promise<void> {
    const current = this.ports.timing.monotonicMilliseconds();
    if (!Number.isFinite(current) || current < startedAt) {
      throw new IdentityAccessError(
        "DEPENDENCY_UNAVAILABLE",
        "Identity timing is not configured safely.",
      );
    }
    const remaining = accessRequestMinimumDurationMs - (current - startedAt);
    if (remaining > 0) await this.ports.timing.wait(remaining);
  }

  private async deliverAndActivateChallenge(input: Readonly<{
    challengeId: string;
    delivery: IdentityDelivery;
  }>): Promise<void> {
    const challenge = await this.database
      .prepare(
        `SELECT created_at, expires_at FROM access_challenges
        WHERE id = ? AND dispatched_at IS NULL AND consumed_at IS NULL
          AND revoked_at IS NULL`,
      )
      .bind(input.challengeId)
      .first<{ created_at: string; expires_at: string }>();
    if (challenge === null) {
      return;
    }
    let beforeDeliveryAt: string;
    try {
      beforeDeliveryAt = this.readUtcClock();
    } catch {
      await this.revokeChallenge(input.challengeId, challenge.created_at);
      return;
    }
    if (
      beforeDeliveryAt < challenge.created_at ||
      beforeDeliveryAt >= challenge.expires_at
    ) {
      await this.revokeChallenge(
        input.challengeId,
        beforeDeliveryAt < challenge.created_at
          ? challenge.created_at
          : beforeDeliveryAt,
      );
      return;
    }
    if (
      input.delivery.idempotencyKey !== `account_access:${input.challengeId}` ||
      input.delivery.expiresAt !== challenge.expires_at ||
      input.delivery.notAfter !== challenge.expires_at
    ) {
      await this.revokeChallenge(input.challengeId, beforeDeliveryAt);
      throw new IdentityAccessError(
        "INVALID_INPUT",
        "Identity delivery contract does not match its challenge.",
      );
    }

    let receipt: IdentityDeliveryReceipt;
    try {
      receipt = await this.ports.delivery.deliver(input.delivery);
    } catch {
      await this.revokeChallenge(
        input.challengeId,
        this.readUtcClockOrFallback(beforeDeliveryAt, beforeDeliveryAt),
      );
      return;
    }

    let afterDeliveryAt: string;
    try {
      afterDeliveryAt = this.readUtcClock(beforeDeliveryAt);
    } catch {
      await this.revokeChallenge(input.challengeId, beforeDeliveryAt);
      return;
    }
    if (
      !receipt ||
      receipt.idempotencyKey !== input.delivery.idempotencyKey ||
      !isCanonicalUtcTimestamp(receipt.acceptedAt) ||
      receipt.acceptedAt < challenge.created_at ||
      receipt.acceptedAt >= challenge.expires_at ||
      receipt.acceptedAt > afterDeliveryAt ||
      afterDeliveryAt >= challenge.expires_at
    ) {
      await this.revokeChallenge(input.challengeId, afterDeliveryAt);
      return;
    }

    let dispatch;
    try {
      dispatch = await this.database
        .prepare(
          `UPDATE access_challenges SET dispatched_at = ?
          WHERE id = ? AND dispatched_at IS NULL AND consumed_at IS NULL
            AND revoked_at IS NULL AND created_at <= ? AND expires_at > ?
            AND expires_at > ?`,
        )
        .bind(
          receipt.acceptedAt,
          input.challengeId,
          receipt.acceptedAt,
          receipt.acceptedAt,
          afterDeliveryAt,
        )
        .run();
    } catch (error) {
      await this.revokeChallenge(input.challengeId, afterDeliveryAt);
      throw error;
    }
    if (changed(dispatch) !== 1) {
      const existing = await this.database
        .prepare("SELECT dispatched_at FROM access_challenges WHERE id = ?")
        .bind(input.challengeId)
        .first<{ dispatched_at: string | null }>();
      if (existing?.dispatched_at === receipt.acceptedAt) return;
      await this.revokeChallenge(input.challengeId, afterDeliveryAt);
      throw new IdentityAccessError(
        "PERSISTENCE_FAILURE",
        "Delivered identity challenge could not be activated.",
      );
    }
  }

  private async revokeChallenge(challengeId: string, now: string): Promise<void> {
    await this.database
      .prepare(
        `UPDATE access_challenges SET revoked_at = ?
        WHERE id = ? AND dispatched_at IS NULL
          AND consumed_at IS NULL AND revoked_at IS NULL`,
      )
      .bind(now, challengeId)
      .run();
  }

  private readUtcClock(notBefore?: string): string {
    const now = this.ports.utcClock.now();
    if (!isCanonicalUtcTimestamp(now) || (notBefore !== undefined && now < notBefore)) {
      throw new IdentityAccessError(
        "DEPENDENCY_UNAVAILABLE",
        "Identity UTC clock is not configured safely.",
      );
    }
    return now;
  }

  private readUtcClockOrFallback(fallback: string, notBefore?: string): string {
    try {
      return this.readUtcClock(notBefore);
    } catch {
      return fallback;
    }
  }
}
