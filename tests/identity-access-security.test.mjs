import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  D1IdentityAccessStore,
  IdentityAccessError,
  closedIdentityAccessPorts,
} from "../lib/commerce/identity-access-store.ts";
import {
  accessRequestAcknowledgement,
  authorizeBrowserMutation,
  buildCsrfCookie,
  buildSessionCookie,
  clearCsrfCookie,
  clearSessionCookie,
  identityCookieContract,
  isTrustedMutationOrigin,
  isValidCsrfPair,
} from "../lib/commerce/identity-access-policy.ts";
import { createOpaqueAccessToken } from "../lib/commerce/account-security.ts";

const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrationPaths = readdirSync(drizzleDirectory)
  .filter((name) => /^000[0-3]_.+\.sql$/.test(name))
  .sort()
  .map((name) => `${drizzleDirectory}${name}`);

class SQLiteD1Statement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }

  bind(...values) {
    return new SQLiteD1Statement(this.database, this.query, values);
  }

  async first() {
    return this.database.prepare(this.query).get(...this.values) ?? null;
  }

  async all() {
    return {
      success: true,
      results: this.database.prepare(this.query).all(...this.values),
      meta: { changes: 0 },
    };
  }

  async run() {
    const result = this.database.prepare(this.query).run(...this.values);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}

class SQLiteD1Database {
  #tail = Promise.resolve();

  constructor(database) {
    this.database = database;
  }

  prepare(query) {
    return new SQLiteD1Statement(this.database, query);
  }

  batch(statements) {
    const execute = () => this.#runBatch(statements);
    const result = this.#tail.then(execute, execute);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #runBatch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function applyMigration(database, migrationPath) {
  for (const statement of readFileSync(migrationPath, "utf8").split(
    "--> statement-breakpoint",
  )) {
    const sql = statement.trim();
    if (sql) database.exec(sql);
  }
}

function createFixture(options = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migrationPath of migrationPaths) applyMigration(database, migrationPath);

  const deliveries = [];
  const ports = {
    delivery: {
      async deliver(delivery) {
        if (options.deliveryError) throw new Error("test delivery failure");
        deliveries.push(Object.freeze({ ...delivery }));
      },
    },
    rateLimit: {
      async take() {
        return options.allowRateLimit ?? true;
      },
    },
    externalMfa: {
      async verify() {
        return options.mfaEvidence ?? null;
      },
    },
  };

  return {
    database,
    deliveries,
    ports,
    store: new D1IdentityAccessStore(new SQLiteD1Database(database), ports),
  };
}

function insertCustomer(
  database,
  id,
  email,
  now = "2026-08-11T12:00:00.000Z",
  accountEnabled = true,
) {
  database
    .prepare(
      `INSERT INTO customers (
        id, email, accepts_marketing, created_at, updated_at, account_enabled_at
      ) VALUES (?, ?, 0, ?, ?, ?)`,
    )
    .run(id, email, now, now, accountEnabled ? now : null);
}

function insertOrder(database, input) {
  database
    .prepare(
      `INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, 'pending_payment', 'EUR', 2999, 0, 0,
        2999, 'FR', '{}', '{}', 'terms-v1', 'privacy-v1', ?, ?)`,
    )
    .run(
      input.id,
      input.orderNumber,
      input.customerId ?? null,
      input.email,
      input.now,
      input.now,
    );
}

test("known and unknown emails receive the exact same response without persisting a raw token", async () => {
  const { database, deliveries, store } = createFixture();
  const now = "2026-08-11T12:00:00.000Z";
  insertCustomer(database, "customer_known", "known@example.com", now);
  insertCustomer(database, "customer_inactive", "inactive@example.com", now, false);

  const known = await store.requestCustomerSignIn({
    email: " KNOWN@example.com ",
    challengeId: "challenge_known",
    now,
  });
  const unknown = await store.requestCustomerSignIn({
    email: "unknown@example.com",
    challengeId: "challenge_unknown",
    now,
  });
  const inactive = await store.requestCustomerSignIn({
    email: "inactive@example.com",
    challengeId: "challenge_inactive",
    now,
  });

  assert.strictEqual(known, accessRequestAcknowledgement);
  assert.strictEqual(unknown, accessRequestAcknowledgement);
  assert.deepEqual(known, unknown);
  assert.deepEqual(known, inactive);
  assert.equal("token" in known, false);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].destinationEmail, "known@example.com");
  assert.match(deliveries[0].rawToken, /^[A-Za-z0-9_-]{43}$/);

  const challenges = database
    .prepare(
      `SELECT id, customer_id, token_hash, dispatched_at, revoked_at
      FROM access_challenges ORDER BY id`,
    )
    .all();
  assert.equal(challenges.length, 3);
  assert.equal(challenges[0].token_hash.length, 64);
  assert.equal(
    challenges.filter((challenge) => challenge.revoked_at === now).length,
    2,
  );
  assert.doesNotMatch(JSON.stringify(challenges), new RegExp(deliveries[0].rawToken));
  const audits = database
    .prepare(
      `SELECT actor_type, actor_id, action, entity_type, entity_id, metadata_json
      FROM audit_log ORDER BY id`,
    )
    .all();
  assert.equal(audits.length, 4);
  assert.ok(audits.every((audit) => audit.metadata_json === "{}"));
  assert.doesNotMatch(
    JSON.stringify(audits),
    /known@example\.com|unknown@example\.com|inactive@example\.com/,
  );
  assert.doesNotMatch(JSON.stringify(audits), new RegExp(deliveries[0].rawToken));
  database.close();
});

test("delivery failure remains enumeration-safe and revokes the unusable challenge", async () => {
  const { database, store } = createFixture({ deliveryError: true });
  const now = "2026-08-11T12:00:00.000Z";
  insertCustomer(database, "customer_known", "known@example.com", now);
  const known = await store.requestCustomerSignIn({
    email: "known@example.com",
    challengeId: "challenge_delivery_failure",
    now,
  });
  const unknown = await store.requestCustomerSignIn({
    email: "unknown@example.com",
    challengeId: "challenge_unknown_delivery_failure",
    now,
  });
  assert.strictEqual(known, accessRequestAcknowledgement);
  assert.strictEqual(unknown, accessRequestAcknowledgement);
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM access_challenges
        WHERE revoked_at IS NOT NULL`,
      )
      .get().count,
    2,
  );
  database.close();
});

test("customer challenge consumption and rotation each have exactly one concurrent winner", async () => {
  const { database, deliveries, store } = createFixture();
  const createdAt = "2026-08-11T12:00:00.000Z";
  insertCustomer(database, "customer_a", "a@example.com", createdAt);
  insertOrder(database, {
    id: "order_a",
    orderNumber: "AJ-ORDER-A",
    customerId: "customer_a",
    email: "a@example.com",
    now: createdAt,
  });
  await store.requestCustomerSignIn({
    email: "a@example.com",
    challengeId: "challenge_customer_a",
    now: createdAt,
  });

  const consumeAt = "2026-08-11T12:01:00.000Z";
  const attempts = await Promise.all([
    store.consumeCustomerChallenge({
      rawChallengeToken: deliveries[0].rawToken,
      sessionId: "session_customer_a_1",
      now: consumeAt,
    }),
    store.consumeCustomerChallenge({
      rawChallengeToken: deliveries[0].rawToken,
      sessionId: "session_customer_a_2",
      now: consumeAt,
    }),
  ]);
  const winner = attempts.find((result) => result !== null);
  assert.equal(attempts.filter((result) => result !== null).length, 1);
  assert.ok(winner);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM customer_sessions").get().count,
    1,
  );
  const persistedSession = database
    .prepare(
      `SELECT token_hash, csrf_token_hash FROM customer_sessions
      WHERE revoked_at IS NULL`,
    )
    .get();
  assert.equal(persistedSession.token_hash.length, 64);
  assert.equal(persistedSession.csrf_token_hash.length, 64);
  assert.doesNotMatch(JSON.stringify(persistedSession), new RegExp(winner.token));
  assert.doesNotMatch(JSON.stringify(persistedSession), new RegExp(winner.csrfToken));

  const rotateAt = "2026-08-11T12:02:00.000Z";
  const rotations = await Promise.all([
    store.rotateCustomerSession({
      rawSessionToken: winner.token,
      newSessionId: "session_customer_a_rotated_1",
      now: rotateAt,
    }),
    store.rotateCustomerSession({
      rawSessionToken: winner.token,
      newSessionId: "session_customer_a_rotated_2",
      now: rotateAt,
    }),
  ]);
  assert.equal(rotations.filter((result) => result !== null).length, 1);
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM customer_sessions
        WHERE authentication_source = 'rotation'`,
      )
      .get().count,
    1,
  );
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM audit_log
        WHERE action IN ('identity_challenge_consumed', 'identity_session_started')`,
      )
      .get().count,
    3,
  );
  database.close();
});

test("customer A, customer B and guest sessions are isolated by SQL ownership", async () => {
  const { database, deliveries, store } = createFixture();
  const now = "2026-08-11T12:00:00.000Z";
  insertCustomer(database, "customer_a", "a@example.com", now);
  insertCustomer(database, "customer_b", "b@example.com", now);
  insertOrder(database, {
    id: "order_a",
    orderNumber: "AJ-ORDER-A",
    customerId: "customer_a",
    email: "a@example.com",
    now,
  });
  insertOrder(database, {
    id: "order_b",
    orderNumber: "AJ-ORDER-B",
    customerId: "customer_b",
    email: "b@example.com",
    now,
  });
  insertOrder(database, {
    id: "order_guest_a",
    orderNumber: "AJ-GUEST-A",
    email: "guest@example.com",
    now,
  });
  insertOrder(database, {
    id: "order_guest_b",
    orderNumber: "AJ-GUEST-B",
    email: "other@example.com",
    now,
  });

  await store.requestCustomerSignIn({
    email: "a@example.com",
    challengeId: "challenge_a",
    now,
  });
  const customerSession = await store.consumeCustomerChallenge({
    rawChallengeToken: deliveries.at(-1).rawToken,
    sessionId: "session_a",
    now: "2026-08-11T12:01:00.000Z",
  });
  assert.ok(customerSession);
  assert.ok(
    await store.findAccessibleOrder(
      "order_a",
      { kind: "customer", sessionToken: customerSession.token },
      "2026-08-11T12:02:00.000Z",
    ),
  );
  assert.equal(
    await store.findAccessibleOrder(
      "order_b",
      { kind: "customer", sessionToken: customerSession.token },
      "2026-08-11T12:02:00.000Z",
    ),
    null,
  );
  assert.equal(
    await store.findAccessibleOrder(
      "order_guest_a",
      { kind: "customer", sessionToken: customerSession.token },
      "2026-08-11T12:02:00.000Z",
    ),
    null,
  );

  await store.requestGuestOrderAccess({
    email: "guest@example.com",
    orderNumber: "AJ-GUEST-A",
    challengeId: "challenge_guest_a",
    now,
  });
  const guestSession = await store.consumeGuestOrderChallenge({
    rawChallengeToken: deliveries.at(-1).rawToken,
    sessionId: "session_guest_a",
    now: "2026-08-11T12:01:00.000Z",
  });
  assert.ok(guestSession);
  assert.ok(
    await store.findAccessibleOrder(
      "order_guest_a",
      { kind: "guest-order", sessionToken: guestSession.token },
      "2026-08-11T12:02:00.000Z",
    ),
  );
  for (const forbiddenOrder of ["order_guest_b", "order_a", "order_b"]) {
    assert.equal(
      await store.findAccessibleOrder(
        forbiddenOrder,
        { kind: "guest-order", sessionToken: guestSession.token },
        "2026-08-11T12:02:00.000Z",
      ),
      null,
    );
  }
  database.close();
});

test("activity refresh, logout, absolute expiry and idle expiry all fail closed", async () => {
  const { database, deliveries, store } = createFixture();
  const now = "2026-08-11T12:00:00.000Z";
  insertCustomer(database, "customer_a", "a@example.com", now);
  insertOrder(database, {
    id: "order_a",
    orderNumber: "AJ-ORDER-A",
    customerId: "customer_a",
    email: "a@example.com",
    now,
  });
  await store.requestCustomerSignIn({
    email: "a@example.com",
    challengeId: "challenge_expiry",
    now,
  });
  const session = await store.consumeCustomerChallenge({
    rawChallengeToken: deliveries[0].rawToken,
    sessionId: "session_expiry",
    now: "2026-08-11T12:01:00.000Z",
  });
  assert.ok(session);

  assert.equal(
    await store.authorizeSessionMutation(
      "customer",
      session.token,
      session.csrfToken,
      "2026-08-11T12:02:00.000Z",
    ),
    true,
  );
  const unrelatedCsrf = await createOpaqueAccessToken();
  assert.equal(
    await store.authorizeSessionMutation(
      "customer",
      session.token,
      unrelatedCsrf.token,
      "2026-08-11T12:02:00.000Z",
    ),
    false,
  );

  assert.equal(
    await store.touchSession(
      "customer",
      session.token,
      "2026-08-11T12:20:00.000Z",
    ),
    true,
  );
  assert.ok(
    await store.findAccessibleOrder(
      "order_a",
      { kind: "customer", sessionToken: session.token },
      "2026-08-11T12:40:00.000Z",
    ),
  );

  assert.equal(
    await store.findAccessibleOrder(
      "order_a",
      { kind: "customer", sessionToken: session.token },
      "2026-08-11T12:50:00.000Z",
    ),
    null,
  );
  assert.equal(
    await store.logout(
      "customer",
      session.token,
      "2026-08-11T12:41:00.000Z",
    ),
    true,
  );
  assert.equal(
    await store.logout(
      "customer",
      session.token,
      "2026-08-11T12:42:00.000Z",
    ),
    false,
  );
  assert.equal(
    await store.findAccessibleOrder(
      "order_a",
      { kind: "customer", sessionToken: session.token },
      "2026-08-11T12:43:00.000Z",
    ),
    null,
  );
  assert.equal(
    await store.findAccessibleOrder(
      "order_a",
      { kind: "customer", sessionToken: session.token },
      "2026-08-18T12:01:00.000Z",
    ),
    null,
  );
  database.close();
});

test("admin authority comes only from a current enabled MFA-backed database role", async () => {
  const subjectHash = "e".repeat(64);
  const now = "2026-08-11T12:00:00.000Z";
  const { database, store } = createFixture({
    mfaEvidence: {
      externalSubjectHash: subjectHash,
      evidenceHash: "9".repeat(64),
      aal: 2,
      authenticatedAt: now,
    },
  });
  insertOrder(database, {
    id: "order_guest",
    orderNumber: "AJ-GUEST",
    email: "guest@example.com",
    now,
  });
  database
    .prepare(
      `INSERT INTO administrators (
        id, external_subject_hash, role, enabled, authz_version,
        created_at, updated_at
      ) VALUES ('admin_operations', ?, 'operations', 1, 1, ?, ?)`,
    )
    .run(subjectHash, now, now);

  const replayAttempts = await Promise.all([
    store.createAdminSession({
      assertion: Object.freeze({ opaque: true }),
      requestedRole: "owner",
      sessionId: "admin_session_1",
      now,
    }),
    store.createAdminSession({
      assertion: Object.freeze({ opaque: true }),
      requestedRole: "owner",
      sessionId: "admin_session_replay",
      now,
    }),
  ]);
  assert.equal(replayAttempts.filter((attempt) => attempt !== null).length, 1);
  const session = replayAttempts.find((attempt) => attempt !== null);
  assert.ok(session);
  assert.equal(session.role, "operations");
  assert.deepEqual(
    {
      ...database
        .prepare(
          `SELECT COUNT(*) AS sessions, MIN(evidence_hash) AS evidence_hash
          FROM admin_sessions`,
        )
        .get(),
    },
    { sessions: 1, evidence_hash: "9".repeat(64) },
  );
  assert.ok(
    await store.findAccessibleOrder(
      "order_guest",
      { kind: "admin", sessionToken: session.token },
      "2026-08-11T12:01:00.000Z",
    ),
  );

  database
    .prepare(
      `UPDATE administrators
      SET enabled = 0, authz_version = 2, updated_at = ?
      WHERE id = 'admin_operations'`,
    )
    .run("2026-08-11T12:02:00.000Z");
  assert.equal(
    await store.findAccessibleOrder(
      "order_guest",
      { kind: "admin", sessionToken: session.token },
      "2026-08-11T12:03:00.000Z",
    ),
    null,
  );
  database
    .prepare(
      `UPDATE administrators
      SET enabled = 1, authz_version = 3, updated_at = ?
      WHERE id = 'admin_operations'`,
    )
    .run("2026-08-11T12:04:00.000Z");
  assert.equal(
    await store.findAccessibleOrder(
      "order_guest",
      { kind: "admin", sessionToken: session.token },
      "2026-08-11T12:05:00.000Z",
    ),
    null,
    "reenabling must not resurrect a stale authorization version",
  );
  const adminAudits = database
    .prepare(
      `SELECT actor_id, action, entity_id, metadata_json
      FROM audit_log WHERE entity_type IN ('administrator', 'admin_session')`,
    )
    .all();
  assert.ok(adminAudits.length >= 4);
  assert.ok(adminAudits.every((audit) => audit.metadata_json === "{}"));
  assert.doesNotMatch(JSON.stringify(adminAudits), new RegExp(subjectHash));
  database.close();
});

test("weak, stale or missing external MFA evidence never creates an admin session", async () => {
  const now = "2026-08-11T12:00:00.000Z";
  for (const [name, evidence] of [
    [
      "weak",
      {
        externalSubjectHash: "f".repeat(64),
        evidenceHash: "1".repeat(64),
        aal: 1,
        authenticatedAt: now,
      },
    ],
    [
      "stale",
      {
        externalSubjectHash: "f".repeat(64),
        evidenceHash: "2".repeat(64),
        aal: 2,
        authenticatedAt: "2026-08-11T11:54:59.000Z",
      },
    ],
    ["missing", null],
  ]) {
    const { database, store } = createFixture({ mfaEvidence: evidence });
    database
      .prepare(
        `INSERT INTO administrators (
          id, external_subject_hash, role, enabled, authz_version,
          created_at, updated_at
        ) VALUES (?, ?, 'owner', 1, 1, ?, ?)`,
      )
      .run(`admin_${name}`, "f".repeat(64), now, now);
    assert.equal(
      await store.createAdminSession({
        assertion: {},
        sessionId: `admin_session_${name}`,
        now,
      }),
      null,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM admin_sessions").get().count,
      0,
    );
    database.close();
  }
});

test("session and CSRF cookies are host-only, secure and exact-origin mutations fail closed", async () => {
  const first = await createOpaqueAccessToken();
  const second = await createOpaqueAccessToken();
  const customerCookie = buildSessionCookie("customer", first.token, 3600);
  const adminCookie = buildSessionCookie("admin", first.token, 900);
  const csrfCookie = buildCsrfCookie("customer", second.token, 900);

  assert.deepEqual(identityCookieContract, {
    customer: {
      sessionName: "__Host-aj_customer",
      csrfName: "__Host-aj_customer_csrf",
      sameSite: "Lax",
    },
    "guest-order": {
      sessionName: "__Host-aj_guest_order",
      csrfName: "__Host-aj_guest_order_csrf",
      sameSite: "Lax",
    },
    admin: {
      sessionName: "__Host-aj_admin",
      csrfName: "__Host-aj_admin_csrf",
      sameSite: "Strict",
    },
  });

  assert.equal(
    customerCookie,
    `__Host-aj_customer=${first.token}; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax`,
  );
  assert.match(adminCookie, /Secure; HttpOnly; SameSite=Strict$/);
  assert.match(csrfCookie, /Secure; SameSite=Strict$/);
  for (const cookie of [customerCookie, adminCookie, csrfCookie]) {
    assert.doesNotMatch(cookie, /Domain=/i);
  }
  assert.equal(
    clearSessionCookie("admin"),
    "__Host-aj_admin=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
  );
  assert.equal(
    clearCsrfCookie("admin"),
    "__Host-aj_admin_csrf=; Path=/; Max-Age=0; Secure; SameSite=Strict",
  );

  const allowedOrigins = ["https://ajluxurystore.com", "https://preview.example.com"];
  assert.equal(
    isTrustedMutationOrigin("https://ajluxurystore.com", allowedOrigins),
    true,
  );
  for (const origin of [
    "http://ajluxurystore.com",
    "https://ajluxurystore.com.evil.test",
    "https://ajluxurystore.com/path",
    "null",
    null,
  ]) {
    assert.equal(isTrustedMutationOrigin(origin, allowedOrigins), false);
  }
  assert.equal(isValidCsrfPair(second.token, second.token), true);
  assert.equal(isValidCsrfPair(second.token, first.token), false);
  assert.equal(
    authorizeBrowserMutation({
      method: "POST",
      origin: "https://ajluxurystore.com",
      secFetchSite: "same-origin",
      allowedOrigins,
      csrfCookieToken: second.token,
      csrfHeaderToken: second.token,
    }),
    true,
  );
  assert.equal(
    authorizeBrowserMutation({
      method: "GET",
      origin: "https://ajluxurystore.com",
      secFetchSite: "same-origin",
      allowedOrigins,
      csrfCookieToken: second.token,
      csrfHeaderToken: second.token,
    }),
    false,
  );
  assert.equal(
    authorizeBrowserMutation({
      method: "POST",
      origin: "https://ajluxurystore.com",
      secFetchSite: "cross-site",
      allowedOrigins,
      csrfCookieToken: second.token,
      csrfHeaderToken: second.token,
    }),
    false,
  );
});

test("external providers are closed by default and audit rows contain no contact or token data", async () => {
  assert.deepEqual(
    {
      available: closedIdentityAccessPorts.available,
      reason: closedIdentityAccessPorts.reason,
    },
    {
      available: false,
      reason: "external-identity-providers-not-configured",
    },
  );
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migrationPath of migrationPaths) applyMigration(database, migrationPath);
  insertCustomer(database, "customer_a", "secret@example.com");
  const closedStore = new D1IdentityAccessStore(new SQLiteD1Database(database));
  assert.strictEqual(
    await closedStore.requestCustomerSignIn({
      email: "secret@example.com",
      challengeId: "challenge_closed",
      now: "2026-08-11T12:00:00.000Z",
    }),
    accessRequestAcknowledgement,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM access_challenges").get().count,
    0,
  );
  await assert.rejects(
    () =>
      closedStore.createAdminSession({
        assertion: {},
        sessionId: "admin_closed",
        now: "2026-08-11T12:00:00.000Z",
      }),
    (error) =>
      error instanceof IdentityAccessError &&
      error.code === "DEPENDENCY_UNAVAILABLE",
  );

  const migrationSource = readFileSync(migrationPaths.at(-1), "utf8");
  const storeSource = readFileSync(
    fileURLToPath(
      new URL("../lib/commerce/identity-access-store.ts", import.meta.url),
    ),
    "utf8",
  );
  for (const source of [migrationSource, storeSource]) {
    assert.doesNotMatch(source, /console\.(?:log|warn|error)/);
    assert.doesNotMatch(source, /password|\bjwt\b|\btotp\b|webauthn/i);
  }
  assert.doesNotMatch(migrationSource, /recipient_email|user_agent|ip_address/);

  const auditRows = database.prepare("SELECT * FROM audit_log").all();
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].metadata_json, "{}");
  assert.doesNotMatch(JSON.stringify(auditRows), /secret@example\.com/);
  database.close();
});
