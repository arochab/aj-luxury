import {
  accessTokenHashContexts,
  createOpaqueAccessToken,
  hashOneTimeAccessToken,
  isCanonicalUtcTimestamp,
  isOpaqueAccessToken,
} from "./account-security.ts";
import type { CommerceD1Database, CommerceD1Result } from "./d1-port.ts";
import {
  consumeDummyPasswordWork,
  hashCustomerPassword,
  isCustomerPasswordValid,
  verifyCustomerPassword,
} from "./password-security.ts";

const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60_000;
const SESSION_IDLE_MS = 30 * 60_000;
const VERIFICATION_TTL_MS = 24 * 60 * 60_000;
const RESET_TTL_MS = 60 * 60_000;
const CHECKOUT_LINK_TTL_MS = 60 * 60_000;
const INTERNAL_CHALLENGE_TTL_MS = 15 * 60_000;
const LOGIN_LOCK_MS = 15 * 60_000;
const LOGIN_FAILURE_LIMIT = 5;

export class CustomerAccountError extends Error {
  readonly code:
    | "INVALID_INPUT"
    | "INVALID_CREDENTIALS"
    | "INVALID_TOKEN"
    | "PERSISTENCE_FAILURE";

  constructor(code: CustomerAccountError["code"], message: string) {
    super(message);
    this.name = "CustomerAccountError";
    this.code = code;
  }
}

export type CustomerAccountEmailDelivery = Readonly<{
  purpose: "email_verification" | "password_reset";
  destinationEmail: string;
  rawToken: string;
  expiresAt: string;
  idempotencyKey: string;
}>;

export interface CustomerAccountEmailPort {
  deliver(input: CustomerAccountEmailDelivery): Promise<void>;
}

export type CustomerSessionResult = Readonly<{
  token: string;
  csrfToken: string;
  expiresAt: string;
}>;

export type CurrentCustomerAccount = Readonly<{
  customerId: string;
  email: string;
  acceptsMarketing: boolean;
  orderIds: readonly string[];
}>;

export type RegistrationResult = Readonly<{
  accepted: true;
  checkoutToken: string | null;
  emailDelivery: CustomerAccountEmailDelivery | null;
}>;

type CredentialRow = Readonly<{
  customer_id: string;
  email: string;
  account_enabled_at: string | null;
  accepts_marketing: number;
  algorithm: string;
  iterations: number;
  salt_base64url: string;
  hash_base64url: string;
  failed_attempts: number;
  locked_until: string | null;
}>;

type SessionCustomerRow = Readonly<{
  session_id: string;
  customer_id: string;
  email: string;
  accepts_marketing: number;
  expires_at: string;
  idle_expires_at: string;
}>;

function changed(result: CommerceD1Result<object> | undefined): number {
  return Number(result?.meta?.changes ?? 0);
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new CustomerAccountError("INVALID_INPUT", "Email is invalid.");
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !email.includes(".") || !EMAIL_PATTERN.test(email)) {
    throw new CustomerAccountError("INVALID_INPUT", "Email is invalid.");
  }
  return email;
}

function assertNow(value: string): void {
  if (!isCanonicalUtcTimestamp(value)) {
    throw new CustomerAccountError("INVALID_INPUT", "Timestamp is invalid.");
  }
}

function after(now: string, milliseconds: number): string {
  return new Date(Date.parse(now) + milliseconds).toISOString();
}

function internalId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function credentialShape(row: CredentialRow) {
  return {
    algorithm: row.algorithm,
    iterations: row.iterations,
    salt: row.salt_base64url,
    hash: row.hash_base64url,
  };
}

function isExpectedWriteContention(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|identity_.+not_allowed/i.test(message);
}

export class D1CustomerPasswordAccountStore {
  readonly #database: CommerceD1Database;

  constructor(database: CommerceD1Database) {
    this.#database = database;
  }

  async #credentialByEmail(email: string): Promise<CredentialRow | null> {
    return this.#database.prepare(
      `SELECT customer.id AS customer_id, customer.email,
        customer.account_enabled_at, customer.accepts_marketing,
        credential.algorithm, credential.iterations, credential.salt_base64url,
        credential.hash_base64url, credential.failed_attempts, credential.locked_until
      FROM customers AS customer
      INNER JOIN customer_password_credentials AS credential
        ON credential.customer_id = customer.id
      WHERE lower(customer.email) = ? AND customer.deleted_at IS NULL
      LIMIT 1`,
    ).bind(email).first<CredentialRow>();
  }

  async register(input: Readonly<{
    email: unknown;
    password: unknown;
    acceptsMarketing: unknown;
    source: "account_registration" | "checkout";
    privacyVersion: string;
    now: string;
  }>): Promise<RegistrationResult> {
    const email = normalizeEmail(input.email);
    assertNow(input.now);
    if (!isCustomerPasswordValid(input.password) || typeof input.acceptsMarketing !== "boolean" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(input.privacyVersion)) {
      throw new CustomerAccountError("INVALID_INPUT", "Registration input is invalid.");
    }
    const existing = await this.#credentialByEmail(email);
    let customerId: string;
    if (existing) {
      const matches = await verifyCustomerPassword(input.password, credentialShape(existing));
      if (!matches || existing.account_enabled_at !== null) {
        return Object.freeze({ accepted: true, checkoutToken: null, emailDelivery: null });
      }
      customerId = existing.customer_id;
    } else {
      customerId = internalId("customer");
    }

    const [verification, checkout, passwordHash] = await Promise.all([
      createOpaqueAccessToken(accessTokenHashContexts.customerEmailVerification),
      createOpaqueAccessToken(accessTokenHashContexts.customerCheckoutLink),
      existing ? Promise.resolve(null) : hashCustomerPassword(input.password),
    ]);
    const challengeId = internalId("account_challenge");
    const checkoutId = internalId("checkout_link");
    const verificationExpiresAt = after(input.now, VERIFICATION_TTL_MS);
    const checkoutExpiresAt = after(input.now, CHECKOUT_LINK_TTL_MS);
    const statements = [];
    if (!existing && passwordHash) {
      statements.push(
        this.#database.prepare(
          `INSERT INTO customers (
            id, email, first_name, last_name, accepts_marketing,
            marketing_consent_at, created_at, updated_at, deleted_at,
            account_enabled_at
          ) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, NULL, NULL)`,
        ).bind(
          customerId,
          email,
          input.acceptsMarketing ? 1 : 0,
          input.acceptsMarketing ? input.now : null,
          input.now,
          input.now,
        ),
        this.#database.prepare(
          `INSERT INTO customer_password_credentials (
            customer_id, algorithm, iterations, salt_base64url, hash_base64url,
            failed_attempts, locked_until, password_changed_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
        ).bind(
          customerId,
          passwordHash.algorithm,
          passwordHash.iterations,
          passwordHash.salt,
          passwordHash.hash,
          input.now,
          input.now,
          input.now,
        ),
      );
    } else {
      statements.push(
        this.#database.prepare(
          `UPDATE customer_account_challenges SET revoked_at = ?
          WHERE customer_id = ? AND purpose = 'email_verification'
            AND consumed_at IS NULL AND revoked_at IS NULL`,
        ).bind(input.now, customerId),
        this.#database.prepare(
          `UPDATE customer_checkout_links SET revoked_at = ?
          WHERE customer_id = ? AND revoked_at IS NULL`,
        ).bind(input.now, customerId),
      );
    }
    statements.push(
      this.#database.prepare(
        `INSERT INTO customer_account_challenges (
          id, purpose, customer_id, token_hash, expires_at,
          consumed_at, revoked_at, created_at
        ) VALUES (?, 'email_verification', ?, ?, ?, NULL, NULL, ?)`,
      ).bind(
        challengeId,
        customerId,
        verification.tokenHash,
        verificationExpiresAt,
        input.now,
      ),
      this.#database.prepare(
        `INSERT INTO customer_checkout_links (
          id, customer_id, token_hash, expires_at, revoked_at, created_at
        ) VALUES (?, ?, ?, ?, NULL, ?)`,
      ).bind(checkoutId, customerId, checkout.tokenHash, checkoutExpiresAt, input.now),
    );
    if (input.acceptsMarketing && (!existing || existing.accepts_marketing !== 1)) {
      statements.push(
        this.#database.prepare(
          `UPDATE customers SET accepts_marketing = 1, marketing_consent_at = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL`,
        ).bind(input.now, input.now, customerId),
        this.#database.prepare(
          `INSERT INTO customer_marketing_consents (
            id, customer_id, decision, source, privacy_version, occurred_at
          ) VALUES (?, ?, 'granted', ?, ?, ?)`,
        ).bind(
          internalId("marketing_consent"), customerId, input.source,
          input.privacyVersion, input.now,
        ),
      );
    }
    try {
      await this.#database.batch(statements);
    } catch (error) {
      if (isExpectedWriteContention(error)) {
        return Object.freeze({ accepted: true, checkoutToken: null, emailDelivery: null });
      }
      throw new CustomerAccountError("PERSISTENCE_FAILURE", "Account registration failed.");
    }
    return Object.freeze({
      accepted: true,
      checkoutToken: checkout.token,
      emailDelivery: Object.freeze({
        purpose: "email_verification",
        destinationEmail: email,
        rawToken: verification.token,
        expiresAt: verificationExpiresAt,
        idempotencyKey: `account-verify:${challengeId}`,
      }),
    });
  }

  async requestPasswordReset(input: Readonly<{
    email: unknown;
    now: string;
  }>): Promise<CustomerAccountEmailDelivery | null> {
    const email = normalizeEmail(input.email);
    assertNow(input.now);
    const credential = await this.#credentialByEmail(email);
    if (!credential || credential.account_enabled_at === null) return null;
    const reset = await createOpaqueAccessToken(accessTokenHashContexts.customerPasswordReset);
    const challengeId = internalId("account_challenge");
    const expiresAt = after(input.now, RESET_TTL_MS);
    await this.#database.batch([
      this.#database.prepare(
        `UPDATE customer_account_challenges SET revoked_at = ?
        WHERE customer_id = ? AND purpose = 'password_reset'
          AND consumed_at IS NULL AND revoked_at IS NULL`,
      ).bind(input.now, credential.customer_id),
      this.#database.prepare(
        `INSERT INTO customer_account_challenges (
          id, purpose, customer_id, token_hash, expires_at,
          consumed_at, revoked_at, created_at
        ) VALUES (?, 'password_reset', ?, ?, ?, NULL, NULL, ?)`,
      ).bind(challengeId, credential.customer_id, reset.tokenHash, expiresAt, input.now),
    ]);
    return Object.freeze({
      purpose: "password_reset",
      destinationEmail: email,
      rawToken: reset.token,
      expiresAt,
      idempotencyKey: `password-reset:${challengeId}`,
    });
  }

  async #createSession(customerId: string, now: string): Promise<CustomerSessionResult> {
    const [bootstrap, session, csrf] = await Promise.all([
      createOpaqueAccessToken(accessTokenHashContexts.customerChallenge),
      createOpaqueAccessToken(accessTokenHashContexts.customerSession),
      createOpaqueAccessToken(accessTokenHashContexts.customerCsrf),
    ]);
    const challengeId = internalId("password_session_challenge");
    const sessionId = internalId("customer_session");
    const bootstrapExpiresAt = after(now, INTERNAL_CHALLENGE_TTL_MS);
    const expiresAt = after(now, SESSION_ABSOLUTE_MS);
    const idleExpiresAt = after(now, SESSION_IDLE_MS);
    await this.#database.batch([
      this.#database.prepare(
        `INSERT INTO access_challenges (
          id, purpose, customer_id, order_id, token_hash, expires_at,
          dispatched_at, consumed_at, revoked_at, created_at
        ) VALUES (?, 'customer_sign_in', ?, NULL, ?, ?, NULL, NULL, NULL, ?)`,
      ).bind(challengeId, customerId, bootstrap.tokenHash, bootstrapExpiresAt, now),
      this.#database.prepare(
        `UPDATE access_challenges SET dispatched_at = ?
        WHERE id = ? AND dispatched_at IS NULL`,
      ).bind(now, challengeId),
      this.#database.prepare(
        `INSERT INTO customer_sessions (
          id, customer_id, token_hash, csrf_token_hash, session_family_id,
          authentication_source, issued_by_challenge_id, rotated_from_session_id,
          expires_at, idle_expires_at, last_seen_at, revoked_at, created_at
        ) SELECT ?, customer_id, ?, ?, ?, 'challenge', id, NULL, ?, ?, NULL, NULL, ?
          FROM access_challenges
          WHERE id = ? AND token_hash = ? AND purpose = 'customer_sign_in'
            AND dispatched_at IS NOT NULL AND consumed_at IS NULL
            AND revoked_at IS NULL AND expires_at > ?`,
      ).bind(
        sessionId, session.tokenHash, csrf.tokenHash, sessionId,
        expiresAt, idleExpiresAt, now, challengeId, bootstrap.tokenHash, now,
      ),
    ]);
    // D1 may report trigger side-effects in `meta.changes`, so a strict
    // `changes === 1` check can turn a successfully persisted session into a
    // false 503. Verify the actual security invariants instead.
    const persisted = await this.#database.prepare(
      `SELECT 1 AS ready
      FROM customer_sessions AS session
      INNER JOIN access_challenges AS challenge
        ON challenge.id = session.issued_by_challenge_id
      WHERE session.id = ? AND session.customer_id = ?
        AND session.token_hash = ? AND session.csrf_token_hash = ?
        AND session.authentication_source = 'challenge'
        AND session.revoked_at IS NULL AND session.expires_at = ?
        AND session.idle_expires_at = ?
        AND challenge.id = ? AND challenge.customer_id = ?
        AND challenge.purpose = 'customer_sign_in'
        AND challenge.dispatched_at IS NOT NULL
        AND challenge.consumed_at IS NOT NULL
        AND challenge.revoked_at IS NULL
      LIMIT 1`,
    ).bind(
      sessionId, customerId, session.tokenHash, csrf.tokenHash,
      expiresAt, idleExpiresAt, challengeId, customerId,
    ).first<{ ready: number }>();
    if (persisted?.ready !== 1) {
      throw new CustomerAccountError("PERSISTENCE_FAILURE", "Customer session creation failed.");
    }
    return Object.freeze({ token: session.token, csrfToken: csrf.token, expiresAt });
  }

  async verifyEmail(rawToken: unknown, now: string): Promise<CustomerSessionResult | null> {
    if (!isOpaqueAccessToken(rawToken)) return null;
    assertNow(now);
    const tokenHash = await hashOneTimeAccessToken(
      rawToken,
      accessTokenHashContexts.customerEmailVerification,
    );
    const challenge = await this.#database.prepare(
      `SELECT challenge.id, challenge.customer_id
      FROM customer_account_challenges AS challenge
      INNER JOIN customers AS customer ON customer.id = challenge.customer_id
      WHERE challenge.token_hash = ? AND challenge.purpose = 'email_verification'
        AND challenge.consumed_at IS NULL AND challenge.revoked_at IS NULL
        AND challenge.expires_at > ? AND customer.deleted_at IS NULL
      LIMIT 1`,
    ).bind(tokenHash, now).first<{ id: string; customer_id: string }>();
    if (!challenge) return null;
    const results = await this.#database.batch([
      this.#database.prepare(
        `UPDATE customer_account_challenges SET consumed_at = ?
        WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      ).bind(now, challenge.id, now),
      this.#database.prepare(
        `UPDATE customers SET account_enabled_at = COALESCE(account_enabled_at, ?), updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
      ).bind(now, now, challenge.customer_id),
      this.#database.prepare(
        `UPDATE orders SET customer_id = ?, updated_at = ?
        WHERE customer_id IS NULL AND lower(email) = (
          SELECT lower(email) FROM customers WHERE id = ? AND deleted_at IS NULL
        )`,
      ).bind(challenge.customer_id, now, challenge.customer_id),
      this.#database.prepare(
        `UPDATE customer_checkout_links SET revoked_at = ?
        WHERE customer_id = ? AND revoked_at IS NULL`,
      ).bind(now, challenge.customer_id),
    ]);
    if (changed(results[0]) !== 1 || changed(results[1]) !== 1) return null;
    return this.#createSession(challenge.customer_id, now);
  }

  async login(input: Readonly<{
    email: unknown;
    password: unknown;
    now: string;
  }>): Promise<CustomerSessionResult | null> {
    const email = normalizeEmail(input.email);
    assertNow(input.now);
    const credential = await this.#credentialByEmail(email);
    if (!credential) {
      await consumeDummyPasswordWork(input.password);
      return null;
    }
    const valid = await verifyCustomerPassword(input.password, credentialShape(credential));
    const locked = credential.locked_until !== null && credential.locked_until > input.now;
    if (!valid || locked || credential.account_enabled_at === null) {
      if (!locked) {
        const failures = Math.min(credential.failed_attempts + 1, 100);
        const lockedUntil = failures >= LOGIN_FAILURE_LIMIT
          ? after(input.now, LOGIN_LOCK_MS)
          : null;
        await this.#database.prepare(
          `UPDATE customer_password_credentials
          SET failed_attempts = ?, locked_until = ?, updated_at = ?
          WHERE customer_id = ?`,
        ).bind(failures, lockedUntil, input.now, credential.customer_id).run();
      }
      return null;
    }
    await this.#database.prepare(
      `UPDATE customer_password_credentials
      SET failed_attempts = 0, locked_until = NULL, updated_at = ?
      WHERE customer_id = ?`,
    ).bind(input.now, credential.customer_id).run();
    return this.#createSession(credential.customer_id, input.now);
  }

  async resetPassword(input: Readonly<{
    rawToken: unknown;
    password: unknown;
    now: string;
  }>): Promise<CustomerSessionResult | null> {
    if (!isOpaqueAccessToken(input.rawToken) || !isCustomerPasswordValid(input.password)) {
      return null;
    }
    assertNow(input.now);
    const [tokenHash, passwordHash] = await Promise.all([
      hashOneTimeAccessToken(input.rawToken, accessTokenHashContexts.customerPasswordReset),
      hashCustomerPassword(input.password),
    ]);
    const challenge = await this.#database.prepare(
      `SELECT challenge.id, challenge.customer_id
      FROM customer_account_challenges AS challenge
      INNER JOIN customers AS customer ON customer.id = challenge.customer_id
      WHERE challenge.token_hash = ? AND challenge.purpose = 'password_reset'
        AND challenge.consumed_at IS NULL AND challenge.revoked_at IS NULL
        AND challenge.expires_at > ? AND customer.account_enabled_at IS NOT NULL
        AND customer.deleted_at IS NULL LIMIT 1`,
    ).bind(tokenHash, input.now).first<{ id: string; customer_id: string }>();
    if (!challenge) return null;
    const results = await this.#database.batch([
      this.#database.prepare(
        `UPDATE customer_account_challenges SET consumed_at = ?
        WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      ).bind(input.now, challenge.id, input.now),
      this.#database.prepare(
        `UPDATE customer_password_credentials SET algorithm = ?, iterations = ?,
          salt_base64url = ?, hash_base64url = ?, failed_attempts = 0,
          locked_until = NULL, password_changed_at = ?, updated_at = ?
        WHERE customer_id = ?`,
      ).bind(
        passwordHash.algorithm, passwordHash.iterations, passwordHash.salt,
        passwordHash.hash, input.now, input.now, challenge.customer_id,
      ),
      this.#database.prepare(
        `UPDATE customer_sessions SET revoked_at = ?
        WHERE customer_id = ? AND revoked_at IS NULL`,
      ).bind(input.now, challenge.customer_id),
    ]);
    if (changed(results[0]) !== 1 || changed(results[1]) !== 1) return null;
    return this.#createSession(challenge.customer_id, input.now);
  }

  async #sessionCustomer(rawSessionToken: unknown, now: string): Promise<SessionCustomerRow | null> {
    if (!isOpaqueAccessToken(rawSessionToken)) return null;
    const tokenHash = await hashOneTimeAccessToken(
      rawSessionToken,
      accessTokenHashContexts.customerSession,
    );
    return this.#database.prepare(
      `SELECT session.id AS session_id, session.customer_id, customer.email,
        customer.accepts_marketing, session.expires_at, session.idle_expires_at
      FROM customer_sessions AS session
      INNER JOIN customers AS customer ON customer.id = session.customer_id
      WHERE session.token_hash = ? AND session.revoked_at IS NULL
        AND session.expires_at > ? AND session.idle_expires_at > ?
        AND customer.account_enabled_at IS NOT NULL AND customer.deleted_at IS NULL
      LIMIT 1`,
    ).bind(tokenHash, now, now).first<SessionCustomerRow>();
  }

  async currentAccount(rawSessionToken: unknown, now: string): Promise<CurrentCustomerAccount | null> {
    assertNow(now);
    const session = await this.#sessionCustomer(rawSessionToken, now);
    if (!session) return null;
    const nextIdle = after(now, SESSION_IDLE_MS) < session.expires_at
      ? after(now, SESSION_IDLE_MS)
      : session.expires_at;
    await this.#database.prepare(
      `UPDATE customer_sessions SET last_seen_at = ?, idle_expires_at = CASE
        WHEN idle_expires_at > ? THEN idle_expires_at ELSE ? END
      WHERE id = ? AND revoked_at IS NULL`,
    ).bind(now, nextIdle, nextIdle, session.session_id).run();
    const orders = await this.#database.prepare(
      `SELECT id FROM orders WHERE customer_id = ? ORDER BY created_at DESC, id DESC`,
    ).bind(session.customer_id).all<{ id: string }>();
    return Object.freeze({
      customerId: session.customer_id,
      email: session.email,
      acceptsMarketing: session.accepts_marketing === 1,
      orderIds: Object.freeze(orders.results.map((order) => order.id)),
    });
  }

  async resolveCheckoutCustomer(input: Readonly<{
    email: unknown;
    customerSessionToken: unknown;
    checkoutToken: unknown;
    now: string;
  }>): Promise<string | null> {
    const email = normalizeEmail(input.email);
    assertNow(input.now);
    const session = await this.#sessionCustomer(input.customerSessionToken, input.now);
    if (session && session.email.toLowerCase() === email) return session.customer_id;
    if (!isOpaqueAccessToken(input.checkoutToken)) return null;
    const tokenHash = await hashOneTimeAccessToken(
      input.checkoutToken,
      accessTokenHashContexts.customerCheckoutLink,
    );
    const pending = await this.#database.prepare(
      `SELECT link.customer_id
      FROM customer_checkout_links AS link
      INNER JOIN customers AS customer ON customer.id = link.customer_id
      WHERE link.token_hash = ? AND link.revoked_at IS NULL AND link.expires_at > ?
        AND customer.deleted_at IS NULL AND lower(customer.email) = ?
      LIMIT 1`,
    ).bind(tokenHash, input.now, email).first<{ customer_id: string }>();
    return pending?.customer_id ?? null;
  }

  async authorizeMutation(
    rawSessionToken: unknown,
    rawCsrfToken: unknown,
    now: string,
  ): Promise<boolean> {
    if (!isOpaqueAccessToken(rawSessionToken) || !isOpaqueAccessToken(rawCsrfToken)) return false;
    assertNow(now);
    const [sessionHash, csrfHash] = await Promise.all([
      hashOneTimeAccessToken(rawSessionToken, accessTokenHashContexts.customerSession),
      hashOneTimeAccessToken(rawCsrfToken, accessTokenHashContexts.customerCsrf),
    ]);
    const result = await this.#database.prepare(
      `SELECT 1 AS authorized FROM customer_sessions AS session
      INNER JOIN customers AS customer ON customer.id = session.customer_id
      WHERE session.token_hash = ? AND session.csrf_token_hash = ?
        AND session.revoked_at IS NULL AND session.expires_at > ?
        AND session.idle_expires_at > ? AND customer.account_enabled_at IS NOT NULL
        AND customer.deleted_at IS NULL LIMIT 1`,
    ).bind(sessionHash, csrfHash, now, now).first<{ authorized: number }>();
    return result?.authorized === 1;
  }

  async logout(rawSessionToken: unknown, now: string): Promise<void> {
    if (!isOpaqueAccessToken(rawSessionToken)) return;
    assertNow(now);
    const tokenHash = await hashOneTimeAccessToken(
      rawSessionToken,
      accessTokenHashContexts.customerSession,
    );
    await this.#database.prepare(
      `UPDATE customer_sessions SET revoked_at = ?
      WHERE token_hash = ? AND revoked_at IS NULL`,
    ).bind(now, tokenHash).run();
  }

  async setMarketingPreference(input: Readonly<{
    rawSessionToken: unknown;
    acceptsMarketing: boolean;
    privacyVersion: string;
    now: string;
  }>): Promise<boolean> {
    assertNow(input.now);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(input.privacyVersion)) return false;
    const session = await this.#sessionCustomer(input.rawSessionToken, input.now);
    if (!session) return false;
    if ((session.accepts_marketing === 1) === input.acceptsMarketing) return true;
    const results = await this.#database.batch([
      this.#database.prepare(
        `UPDATE customers SET accepts_marketing = ?, marketing_consent_at = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
      ).bind(
        input.acceptsMarketing ? 1 : 0,
        input.acceptsMarketing ? input.now : null,
        input.now,
        session.customer_id,
      ),
      this.#database.prepare(
        `INSERT INTO customer_marketing_consents (
          id, customer_id, decision, source, privacy_version, occurred_at
        ) VALUES (?, ?, ?, 'account_settings', ?, ?)`,
      ).bind(
        internalId("marketing_consent"), session.customer_id,
        input.acceptsMarketing ? "granted" : "withdrawn",
        input.privacyVersion, input.now,
      ),
    ]);
    return changed(results[0]) === 1 && changed(results[1]) === 1;
  }
}
