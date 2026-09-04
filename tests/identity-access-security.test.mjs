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
import {
  accessTokenHashContexts,
  createOpaqueAccessToken,
  hashOneTimeAccessToken,
  verifyOneTimeAccessToken,
} from "../lib/commerce/account-security.ts";

const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrationPaths = readdirSync(drizzleDirectory)
  .filter((name) => /^000[0-3]_.+\.sql$/.test(name))
  .sort()
  .map((name) => `${drizzleDirectory}${name}`);

class SQLiteD1Statement {
  constructor(database, query, values = [], inflateAuditChanges = false) {
    this.database = database;
    this.query = query;
    this.values = values;
    this.inflateAuditChanges = inflateAuditChanges;
  }

  bind(...values) {
    return new SQLiteD1Statement(
      this.database,
      this.query,
      values,
      this.inflateAuditChanges,
    );
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
        changes: Number(result.changes) + (
          this.inflateAuditChanges && Number(result.changes) > 0 &&
          /(?:INSERT INTO (?:customer_sessions|guest_order_sessions|admin_sessions)|UPDATE (?:customer_sessions|guest_order_sessions|admin_sessions) SET revoked_at)/i.test(this.query)
            ? 1
            : 0
        ),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}

class SQLiteD1Database {
  #tail = Promise.resolve();

  constructor(database, inflateAuditChanges = false) {
    this.database = database;
    this.inflateAuditChanges = inflateAuditChanges;
  }

  prepare(query) {
    return new SQLiteD1Statement(
      this.database,
      query,
      [],
      this.inflateAuditChanges,
    );
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
  const deliveryAttempts = [];
  const acceptedReceipts = new Map();
  const backgroundTasks = [];
  const rateLimitInputs = [];
  const externalMfaInputs = [];
  const identityCallOrder = [];
  let virtualMilliseconds = 0;
  let utcNow = options.utcNow ?? "2026-08-11T12:00:00.000Z";
  let utcClockFailure = options.utcClockFailure ?? false;
  const ports = {
    delivery: {
      async deliver(delivery) {
        deliveryAttempts.push(Object.freeze({ ...delivery }));
        if (options.deliveryGate) await options.deliveryGate;
        if (options.deliveryDelayMs) {
          await new Promise((resolvePromise) => {
            setTimeout(resolvePromise, options.deliveryDelayMs);
          });
        }
        if (options.deliveryError) {
          if (typeof options.deliveryError === "function") {
            await options.deliveryError({
              setUtcNow(value) { utcNow = value; },
              setUtcClockFailure(value) { utcClockFailure = value; },
            });
          }
          throw new Error("test delivery failure");
        }
        if (
          options.idempotentDelivery &&
          acceptedReceipts.has(delivery.idempotencyKey)
        ) {
          return acceptedReceipts.get(delivery.idempotencyKey);
        }
        if (options.afterDeliveryAccepted) {
          await options.afterDeliveryAccepted(delivery, {
            setUtcNow(value) { utcNow = value; },
            setUtcClockFailure(value) { utcClockFailure = value; },
          });
        }
        const receipt = options.deliveryReceipt?.(delivery, utcNow) ?? {
          idempotencyKey: delivery.idempotencyKey,
          providerMessageId: "email_identity_1",
          acceptedAt: utcNow,
        };
        deliveries.push(Object.freeze({ ...delivery }));
        if (options.idempotentDelivery) {
          acceptedReceipts.set(delivery.idempotencyKey, Object.freeze({ ...receipt }));
        }
        return receipt;
      },
    },
    rateLimit: {
      async take(input) {
        identityCallOrder.push("rate-limit");
        rateLimitInputs.push(Object.freeze({ ...input }));
        return options.allowRateLimit ?? true;
      },
    },
    externalMfa: {
      async verify(assertion) {
        identityCallOrder.push("external-mfa");
        externalMfaInputs.push(assertion);
        return options.mfaEvidence ?? null;
      },
    },
    background: {
      defer(task) {
        if (options.backgroundError) throw new Error("test background failure");
        backgroundTasks.push(task);
      },
    },
    timing:
      options.timing ??
      {
        monotonicMilliseconds() {
          return virtualMilliseconds;
        },
        async wait(milliseconds) {
          virtualMilliseconds += milliseconds;
        },
      },
    utcClock: {
      now() {
        if (utcClockFailure) throw new Error("test UTC clock failure");
        return utcNow;
      },
    },
  };

  return {
    backgroundTasks,
    database,
    deliveries,
    deliveryAttempts,
    duplicateNextBackgroundTask() {
      if (backgroundTasks.length === 0) throw new Error("No task to duplicate.");
      backgroundTasks.push(backgroundTasks[0]);
    },
    externalMfaInputs,
    async flushBackground() {
      while (backgroundTasks.length > 0) {
        const task = backgroundTasks.shift();
        await task();
      }
    },
    async flushBackgroundConcurrently() {
      const tasks = backgroundTasks.splice(0);
      await Promise.all(tasks.map((task) => task()));
    },
    ports,
    identityCallOrder,
    rateLimitInputs,
    setUtcClockFailure(value) { utcClockFailure = value; },
    setUtcNow(value) { utcNow = value; },
    store: new D1IdentityAccessStore(
      new SQLiteD1Database(database, options.inflateAuditChanges ?? false),
      ports,
    ),
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

function durableDatabaseDump(database) {
  const tables = database.prepare(`SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
  return JSON.stringify(tables.map(({ name }) => ({
    name,
    rows: database.prepare(`SELECT * FROM "${name}"`).all(),
  })));
}

test("known and unknown emails receive the exact same response without persisting a raw token", async () => {
  const { database, deliveries, flushBackground, store } = createFixture();
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
  await flushBackground();

  assert.strictEqual(known, accessRequestAcknowledgement);
  assert.strictEqual(unknown, accessRequestAcknowledgement);
  assert.deepEqual(known, unknown);
  assert.deepEqual(known, inactive);
  assert.equal("token" in known, false);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].destinationEmail, "known@example.com");
  assert.match(deliveries[0].rawToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(deliveries[0].idempotencyKey, "account_access:challenge_known");
  assert.equal(deliveries[0].notAfter, deliveries[0].expiresAt);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM email_outbox").get().count,
    0,
    "account access has one direct ephemeral delivery path and no durable outbox copy",
  );

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

test("customer and guest access timing is padded identically without awaiting delivery", async () => {
  let releaseDelivery;
  const deliveryGate = new Promise((resolvePromise) => {
    releaseDelivery = resolvePromise;
  });
  const waits = [];
  const clockReads = [0, 37, 120, 123, 240, 279, 360, 362];
  const timing = {
    monotonicMilliseconds() {
      return clockReads.shift();
    },
    async wait(milliseconds) {
      waits.push(milliseconds);
    },
  };
  const { database, deliveries, flushBackground, store } = createFixture({
    deliveryGate,
    timing,
  });
  const now = "2026-08-11T12:00:00.000Z";
  insertCustomer(database, "customer_timing", "timing@example.com", now);
  insertOrder(database, {
    id: "order_timing",
    orderNumber: "AJ-TIMING",
    email: "guest-timing@example.com",
    now,
  });

  async function settleBeforeBlockedDelivery(promise) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, rejectPromise) => {
          timer = setTimeout(
            () => rejectPromise(new Error("access response awaited delivery")),
            1_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  await settleBeforeBlockedDelivery(
    store.requestCustomerSignIn({
      email: "timing@example.com",
      challengeId: "challenge_timing_known",
      now,
    }),
  );
  await store.requestCustomerSignIn({
    email: "unknown-timing@example.com",
    challengeId: "challenge_timing_unknown",
    now,
  });
  await settleBeforeBlockedDelivery(
    store.requestGuestOrderAccess({
      email: "guest-timing@example.com",
      orderNumber: "AJ-TIMING",
      challengeId: "challenge_guest_timing_known",
      now,
    }),
  );
  await store.requestGuestOrderAccess({
    email: "unknown-guest-timing@example.com",
    orderNumber: "AJ-UNKNOWN",
    challengeId: "challenge_guest_timing_unknown",
    now,
  });

  assert.deepEqual(waits, [83, 117, 81, 118]);
  assert.deepEqual(
    [37, 3, 39, 2].map((elapsed, index) => elapsed + waits[index]),
    [120, 120, 120, 120],
  );
  assert.equal(clockReads.length, 0);
  assert.equal(deliveries.length, 0);
  releaseDelivery();
  await flushBackground();
  assert.equal(deliveries.length, 2);
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM access_challenges
        WHERE customer_id IS NULL AND order_id IS NULL
          AND revoked_at = created_at AND dispatched_at IS NULL`,
      )
      .get().count,
    2,
  );
  database.close();
});

test("identity hashes are domain-separated and legacy unscoped hashes fail closed", async () => {
  const rawToken = (await createOpaqueAccessToken()).token;
  const contexts = Object.values(accessTokenHashContexts);
  const contextualHashes = await Promise.all(
    contexts.map((context) => hashOneTimeAccessToken(rawToken, context)),
  );

  assert.equal(new Set(contextualHashes).size, contexts.length);
  for (let index = 0; index < contexts.length; index += 1) {
    assert.equal(
      await verifyOneTimeAccessToken(
        rawToken,
        contextualHashes[index],
        contexts[index],
      ),
      true,
    );
  }
  assert.equal(
    await verifyOneTimeAccessToken(
      rawToken,
      contextualHashes[0],
      contexts[1],
    ),
    false,
  );

  const legacyDigest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken),
  );
  const legacyUnscopedHash = Array.from(new Uint8Array(legacyDigest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  assert.equal(await verifyOneTimeAccessToken(rawToken, legacyUnscopedHash), false);
});

test("delivery failure remains enumeration-safe and revokes the unusable challenge", async () => {
  const { database, flushBackground, store } = createFixture({ deliveryError: true });
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
  await flushBackground();
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

test("an expired challenge is revoked before delivery and makes zero provider calls", async () => {
  const { database, deliveries, flushBackground, setUtcNow, store } = createFixture();
  const createdAt = "2026-08-11T12:00:00.000Z";
  insertCustomer(database, "customer_expired_before_delivery", "expired@example.com", createdAt);
  await store.requestCustomerSignIn({
    email: "expired@example.com",
    challengeId: "challenge_expired_before_delivery",
    now: createdAt,
  });
  setUtcNow("2026-08-11T12:15:00.000Z");
  await flushBackground();

  assert.equal(deliveries.length, 0);
  assert.deepEqual({ ...database.prepare(`SELECT dispatched_at, revoked_at
    FROM access_challenges WHERE id = 'challenge_expired_before_delivery'`).get() }, {
    dispatched_at: null,
    revoked_at: "2026-08-11T12:15:00.000Z",
  });
  database.close();
});

test("delivery activation requires an exact receipt and uses a fresh post-provider clock", async () => {
  const context = createFixture({
    afterDeliveryAccepted(_delivery, clock) {
      clock.setUtcNow("2026-08-11T12:00:05.000Z");
    },
    deliveryReceipt(delivery) {
      return {
        idempotencyKey: delivery.idempotencyKey,
        providerMessageId: "email_identity_2",
        acceptedAt: "2026-08-11T12:00:01.000Z",
      };
    },
  });
  const createdAt = "2026-08-11T12:00:00.000Z";
  insertCustomer(context.database, "customer_receipt", "receipt@example.com", createdAt);
  await context.store.requestCustomerSignIn({
    email: "receipt@example.com",
    challengeId: "challenge_receipt",
    now: createdAt,
  });
  await context.flushBackground();
  assert.equal(context.deliveries.length, 1);
  assert.deepEqual({ ...context.database.prepare(`SELECT dispatched_at, revoked_at
    FROM access_challenges WHERE id = 'challenge_receipt'`).get() }, {
    dispatched_at: "2026-08-11T12:00:01.000Z",
    revoked_at: null,
  });

  const invalidReceipts = [
    { id: "wrong_key", key: "account_access:wrong_challenge", acceptedAt: createdAt },
    { id: "malformed_time", acceptedAt: "not-a-time" },
    { id: "before_created", acceptedAt: "2026-08-11T11:59:59.999Z" },
    { id: "at_expiry", acceptedAt: "2026-08-11T12:15:00.000Z" },
    { id: "future_clock", acceptedAt: "2026-08-11T12:00:00.001Z" },
  ];
  for (const receiptCase of invalidReceipts) {
    const invalid = createFixture({
      deliveryReceipt(delivery) {
        return {
          idempotencyKey: receiptCase.key ?? delivery.idempotencyKey,
          acceptedAt: receiptCase.acceptedAt,
        };
      },
    });
    const email = `${receiptCase.id}@example.com`;
    const challengeId = `challenge_bad_receipt_${receiptCase.id}`;
    insertCustomer(invalid.database, `customer_${receiptCase.id}`, email, createdAt);
    await invalid.store.requestCustomerSignIn({ email, challengeId, now: createdAt });
    await invalid.flushBackground();
    assert.deepEqual({ ...invalid.database.prepare(`SELECT dispatched_at, revoked_at
      FROM access_challenges WHERE id = ?`).get(challengeId) }, {
      dispatched_at: null,
      revoked_at: createdAt,
    });
    assert.doesNotMatch(
      durableDatabaseDump(invalid.database),
      new RegExp(invalid.deliveries[0].rawToken),
    );
    invalid.database.close();
  }
  context.database.close();
});

test("expiry or UTC clock failure during provider delivery revokes without activation", async () => {
  const createdAt = "2026-08-11T12:00:00.000Z";
  for (const scenario of [
    {
      id: "expiry_during_provider",
      afterDeliveryAccepted(_delivery, clock) {
        clock.setUtcNow("2026-08-11T12:15:00.000Z");
      },
      expectedRevokedAt: "2026-08-11T12:15:00.000Z",
    },
    {
      id: "clock_failure_after_provider",
      afterDeliveryAccepted(_delivery, clock) {
        clock.setUtcClockFailure(true);
      },
      expectedRevokedAt: createdAt,
    },
    {
      id: "clock_failure_on_provider_error",
      deliveryError(clock) {
        clock.setUtcClockFailure(true);
      },
      expectedRevokedAt: createdAt,
    },
  ]) {
    const context = createFixture({
      afterDeliveryAccepted: scenario.afterDeliveryAccepted,
      deliveryError: scenario.deliveryError,
      deliveryReceipt(delivery) {
        return {
          idempotencyKey: delivery.idempotencyKey,
          providerMessageId: "email_identity_3",
          acceptedAt: "2026-08-11T12:00:01.000Z",
        };
      },
    });
    insertCustomer(
      context.database,
      `customer_${scenario.id}`,
      `${scenario.id}@example.com`,
      createdAt,
    );
    await context.store.requestCustomerSignIn({
      email: `${scenario.id}@example.com`,
      challengeId: `challenge_${scenario.id}`,
      now: createdAt,
    });
    await context.flushBackground();
    assert.deepEqual({ ...context.database.prepare(`SELECT dispatched_at, revoked_at
      FROM access_challenges WHERE id = ?`).get(`challenge_${scenario.id}`) }, {
      dispatched_at: null,
      revoked_at: scenario.expectedRevokedAt,
    });
    const rawToken = context.deliveryAttempts[0].rawToken;
    assert.doesNotMatch(durableDatabaseDump(context.database), new RegExp(rawToken));
    context.database.close();
  }

  const beforeProvider = createFixture();
  insertCustomer(beforeProvider.database, "customer_clock_before", "clock-before@example.com", createdAt);
  await beforeProvider.store.requestCustomerSignIn({
    email: "clock-before@example.com",
    challengeId: "challenge_clock_before",
    now: createdAt,
  });
  beforeProvider.setUtcClockFailure(true);
  await beforeProvider.flushBackground();
  assert.equal(beforeProvider.deliveryAttempts.length, 0);
  assert.equal(beforeProvider.database.prepare(`SELECT revoked_at
    FROM access_challenges WHERE id = 'challenge_clock_before'`).get().revoked_at, createdAt);
  beforeProvider.database.close();
});

test("concurrent duplicate tasks have one provider effect under the mandatory idempotency contract", async () => {
  let releaseDelivery;
  const deliveryGate = new Promise((resolvePromise) => {
    releaseDelivery = resolvePromise;
  });
  const context = createFixture({ deliveryGate, idempotentDelivery: true });
  const createdAt = "2026-08-11T12:00:00.000Z";
  insertCustomer(context.database, "customer_duplicate", "duplicate@example.com", createdAt);
  await context.store.requestCustomerSignIn({
    email: "duplicate@example.com",
    challengeId: "challenge_duplicate",
    now: createdAt,
  });
  context.duplicateNextBackgroundTask();
  const pending = context.flushBackgroundConcurrently();
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(context.deliveryAttempts.length, 2);
  releaseDelivery();
  await pending;
  assert.equal(context.deliveries.length, 1);
  assert.equal(context.database.prepare(`SELECT dispatched_at
    FROM access_challenges WHERE id = 'challenge_duplicate'`).get().dispatched_at, createdAt);
  context.database.close();
});

test("consume cannot beat activation and expiry cannot be resurrected by an in-flight delivery", async () => {
  const createdAt = "2026-08-11T12:00:00.000Z";
  for (const expiresDuringDelivery of [false, true]) {
    let releaseDelivery;
    const deliveryGate = new Promise((resolvePromise) => {
      releaseDelivery = resolvePromise;
    });
    const context = createFixture({ deliveryGate });
    const suffix = expiresDuringDelivery ? "expired" : "activated";
    insertCustomer(context.database, `customer_race_${suffix}`, `race-${suffix}@example.com`, createdAt);
    await context.store.requestCustomerSignIn({
      email: `race-${suffix}@example.com`,
      challengeId: `challenge_race_${suffix}`,
      now: createdAt,
    });
    const delivery = context.flushBackgroundConcurrently();
    await new Promise((resolvePromise) => setImmediate(resolvePromise));
    const rawToken = context.deliveryAttempts[0].rawToken;
    assert.equal(await context.store.consumeCustomerChallenge({
      rawChallengeToken: rawToken,
      sessionId: `session_race_early_${suffix}`,
      now: "2026-08-11T12:00:01.000Z",
    }), null);
    if (expiresDuringDelivery) context.setUtcNow("2026-08-11T12:15:00.000Z");
    releaseDelivery();
    await delivery;
    const after = await context.store.consumeCustomerChallenge({
      rawChallengeToken: rawToken,
      sessionId: `session_race_after_${suffix}`,
      now: expiresDuringDelivery
        ? "2026-08-11T12:15:00.000Z"
        : "2026-08-11T12:00:02.000Z",
    });
    assert.equal(after !== null, !expiresDuringDelivery);
    assert.doesNotMatch(durableDatabaseDump(context.database), new RegExp(rawToken));
    context.database.close();
  }
});

test("synchronous background scheduling failure keeps the acknowledgement generic and revokes safely", async () => {
  const context = createFixture({ backgroundError: true });
  const createdAt = "2026-08-11T12:00:00.000Z";
  insertCustomer(context.database, "customer_background_failure", "background@example.com", createdAt);
  const known = await context.store.requestCustomerSignIn({
    email: "background@example.com",
    challengeId: "challenge_background_failure",
    now: createdAt,
  });
  const unknown = await context.store.requestCustomerSignIn({
    email: "unknown-background@example.com",
    challengeId: "challenge_unknown_background_failure",
    now: createdAt,
  });
  assert.strictEqual(known, accessRequestAcknowledgement);
  assert.deepEqual(known, unknown);
  assert.equal(context.deliveryAttempts.length, 0);
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count
    FROM access_challenges WHERE revoked_at = created_at`).get().count, 2);
  context.database.close();
});

test("customer challenge consumption and rotation each have exactly one concurrent winner", async () => {
  const { database, deliveries, flushBackground, store } = createFixture();
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
  await flushBackground();

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

test("customer challenge consumption and rotation trust persisted state with D1 audit counts", async () => {
  const { database, deliveries, flushBackground, store } = createFixture({
    inflateAuditChanges: true,
  });
  const createdAt = "2026-08-11T12:00:00.000Z";
  insertCustomer(database, "customer_trigger_counts", "trigger@example.com", createdAt);
  await store.requestCustomerSignIn({
    email: "trigger@example.com",
    challengeId: "challenge_trigger_counts",
    now: createdAt,
  });
  await flushBackground();
  const session = await store.consumeCustomerChallenge({
    rawChallengeToken: deliveries[0].rawToken,
    sessionId: "session_trigger_counts",
    now: "2026-08-11T12:01:00.000Z",
  });
  assert.ok(session);
  const rotated = await store.rotateCustomerSession({
    rawSessionToken: session.token,
    newSessionId: "session_trigger_counts_rotated",
    now: "2026-08-11T12:02:00.000Z",
  });
  assert.ok(rotated);
  assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM customer_sessions
    WHERE revoked_at IS NULL`).get().count, 1);
  assert.equal(await store.logout(
    "customer",
    rotated.token,
    "2026-08-11T12:03:00.000Z",
  ), true);
  assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM customer_sessions
    WHERE revoked_at IS NULL`).get().count, 0);
  database.close();
});

test("a persistence failure rolls back both session creation and challenge consumption", async () => {
  const { database, deliveries, flushBackground, store } = createFixture();
  const createdAt = "2026-08-11T12:00:00.000Z";
  insertCustomer(
    database,
    "customer_atomic_rollback",
    "atomic-rollback@example.com",
    createdAt,
  );
  await store.requestCustomerSignIn({
    email: "atomic-rollback@example.com",
    challengeId: "challenge_atomic_rollback",
    now: createdAt,
  });
  await flushBackground();
  database
    .prepare(
      `INSERT INTO audit_log (
        id, actor_type, action, entity_type, entity_id, idempotency_key,
        metadata_json, created_at
      ) VALUES (?, 'system', 'atomicity_sentinel', 'access_challenge', ?, ?, '{}', ?)`,
    )
    .run(
      "audit_identity_challenge_consumed_challenge_atomic_rollback",
      "challenge_atomic_rollback",
      "identity:test:atomic-rollback",
      createdAt,
    );

  assert.equal(
    await store.consumeCustomerChallenge({
      rawChallengeToken: deliveries[0].rawToken,
      sessionId: "session_atomic_rollback",
      now: "2026-08-11T12:01:00.000Z",
    }),
    null,
  );
  assert.deepEqual(
    {
      ...database
        .prepare(
          `SELECT consumed_at,
            (SELECT COUNT(*) FROM customer_sessions
              WHERE id = 'session_atomic_rollback') AS sessions
          FROM access_challenges WHERE id = 'challenge_atomic_rollback'`,
        )
        .get(),
    },
    { consumed_at: null, sessions: 0 },
  );
  database.close();
});

test("guest challenge consumption is atomic under concurrent replay", async () => {
  const { database, deliveries, flushBackground, store } = createFixture();
  const createdAt = "2026-08-11T12:00:00.000Z";
  insertOrder(database, {
    id: "order_guest_concurrency",
    orderNumber: "AJ-GUEST-CONCURRENCY",
    email: "guest-concurrency@example.com",
    now: createdAt,
  });
  await store.requestGuestOrderAccess({
    email: "guest-concurrency@example.com",
    orderNumber: "AJ-GUEST-CONCURRENCY",
    challengeId: "challenge_guest_concurrency",
    now: createdAt,
  });
  await flushBackground();

  const attempts = await Promise.all([
    store.consumeGuestOrderChallenge({
      rawChallengeToken: deliveries[0].rawToken,
      sessionId: "session_guest_concurrency_1",
      now: "2026-08-11T12:01:00.000Z",
    }),
    store.consumeGuestOrderChallenge({
      rawChallengeToken: deliveries[0].rawToken,
      sessionId: "session_guest_concurrency_2",
      now: "2026-08-11T12:01:00.000Z",
    }),
  ]);

  assert.equal(attempts.filter((attempt) => attempt !== null).length, 1);
  assert.deepEqual(
    {
      ...database
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM guest_order_sessions) AS sessions,
            (SELECT COUNT(*) FROM access_challenges
              WHERE id = 'challenge_guest_concurrency'
                AND consumed_at = '2026-08-11T12:01:00.000Z') AS consumed`,
        )
        .get(),
    },
    { sessions: 1, consumed: 1 },
  );
  database.close();
});

test("customer A, customer B and guest sessions are isolated by SQL ownership", async () => {
  const { database, deliveries, flushBackground, store } = createFixture();
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
  await flushBackground();
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
  await flushBackground();
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

test("customer logout-all is atomic, audited and cannot cross accounts", async () => {
  const { database, deliveries, flushBackground, store } = createFixture();
  const createdAt = "2026-08-11T12:00:00.000Z";
  insertCustomer(database, "customer_logout_a", "logout-a@example.com", createdAt);
  insertCustomer(database, "customer_logout_b", "logout-b@example.com", createdAt);

  async function issueSession(email, challengeId, sessionId, consumeAt) {
    await store.requestCustomerSignIn({ email, challengeId, now: createdAt });
    await flushBackground();
    const result = await store.consumeCustomerChallenge({
      rawChallengeToken: deliveries.at(-1).rawToken,
      sessionId,
      now: consumeAt,
    });
    assert.ok(result);
    return result;
  }

  const firstA = await issueSession(
    "logout-a@example.com",
    "challenge_logout_a_1",
    "session_logout_a_1",
    "2026-08-11T12:01:00.000Z",
  );
  const secondA = await issueSession(
    "logout-a@example.com",
    "challenge_logout_a_2",
    "session_logout_a_2",
    "2026-08-11T12:01:01.000Z",
  );
  const sessionB = await issueSession(
    "logout-b@example.com",
    "challenge_logout_b_1",
    "session_logout_b_1",
    "2026-08-11T12:01:02.000Z",
  );

  const results = await Promise.all([
    store.logoutAllCustomerSessions(
      firstA.token,
      "2026-08-11T12:02:00.000Z",
    ),
    store.logoutAllCustomerSessions(
      secondA.token,
      "2026-08-11T12:02:00.000Z",
    ),
  ]);
  assert.deepEqual(results.sort((left, right) => left - right), [0, 2]);

  assert.deepEqual(
    database
      .prepare(
        `SELECT id, CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END AS revoked
        FROM customer_sessions ORDER BY id`,
      )
      .all()
      .map((row) => ({ ...row })),
    [
      { id: "session_logout_a_1", revoked: 1 },
      { id: "session_logout_a_2", revoked: 1 },
      { id: "session_logout_b_1", revoked: 0 },
    ],
  );
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM audit_log
        WHERE action = 'identity_session_revoked'
          AND entity_id IN ('session_logout_a_1', 'session_logout_a_2')`,
      )
      .get().count,
    2,
  );
  assert.equal(
    await store.authorizeSessionMutation(
      "customer",
      sessionB.token,
      sessionB.csrfToken,
      "2026-08-11T12:03:00.000Z",
    ),
    true,
  );
  database.close();
});

test("activity refresh, logout, absolute expiry and idle expiry all fail closed", async () => {
  const { database, deliveries, flushBackground, store } = createFixture();
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
  await flushBackground();
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
  const { database, rateLimitInputs, store } = createFixture({
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
  assert.equal(rateLimitInputs.length, 2);
  assert.ok(rateLimitInputs.every((input) => input.scope === "admin_sign_in"));
  assert.ok(
    rateLimitInputs.every(
      (input) =>
        input.discriminatorHash ===
        rateLimitInputs[0].discriminatorHash &&
        input.discriminatorHash !== subjectHash &&
        /^[0-9a-f]{64}$/.test(input.discriminatorHash),
    ),
  );
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

test("admin rate limiting runs before external MFA and any session state", async () => {
  const now = "2026-08-11T12:00:00.000Z";
  const externalSubjectHash = "a".repeat(64);
  const {
    database,
    externalMfaInputs,
    identityCallOrder,
    rateLimitInputs,
    store,
  } = createFixture({
    allowRateLimit: false,
    mfaEvidence: {
      externalSubjectHash,
      evidenceHash: "b".repeat(64),
      aal: 2,
      authenticatedAt: now,
    },
  });
  database
    .prepare(
      `INSERT INTO administrators (
        id, external_subject_hash, role, enabled, authz_version,
        created_at, updated_at
      ) VALUES ('admin_rate_limited', ?, 'owner', 1, 1, ?, ?)`,
    )
    .run(externalSubjectHash, now, now);
  const auditCountBefore = database
    .prepare("SELECT COUNT(*) AS count FROM audit_log")
    .get().count;
  const expensiveInvalidAssertion = new Proxy(
    {},
    {
      get() {
        throw new Error("assertion must not be inspected before local limiting");
      },
    },
  );

  assert.equal(
    await store.createAdminSession({
      assertion: expensiveInvalidAssertion,
      sessionId: "admin_session_rate_limited",
      now,
    }),
    null,
  );
  assert.deepEqual(rateLimitInputs, [
    {
      scope: "admin_sign_in",
      discriminatorHash: await hashOneTimeAccessToken(
        "admin-sign-in-pre-mfa",
        accessTokenHashContexts.adminRateLimit,
      ),
      now,
    },
  ]);
  assert.deepEqual(identityCallOrder, ["rate-limit"]);
  assert.equal(externalMfaInputs.length, 0);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM admin_sessions").get().count,
    0,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM audit_log").get().count,
    auditCountBefore,
  );
  assert.equal(
    database.prepare(
      `SELECT COUNT(*) AS count FROM audit_log
      WHERE action = 'identity_admin_session_started'`,
    ).get().count,
    0,
  );
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
  const cartCookie = buildSessionCookie("cart", first.token, 604800);
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
    cart: {
      sessionName: "__Host-aj_cart",
      csrfName: "__Host-aj_cart_csrf",
      sameSite: "Lax",
    },
  });

  assert.equal(
    customerCookie,
    `__Host-aj_customer=${first.token}; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax`,
  );
  assert.match(adminCookie, /Secure; HttpOnly; SameSite=Strict$/);
  assert.equal(
    cartCookie,
    `__Host-aj_cart=${first.token}; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax`,
  );
  assert.match(csrfCookie, /Secure; SameSite=Strict$/);
  for (const cookie of [customerCookie, adminCookie, cartCookie, csrfCookie]) {
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
