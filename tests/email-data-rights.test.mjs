import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { D1DataRightsStore } from "../lib/commerce/data-rights.ts";
import {
  D1EmailOutbox,
  transactionalEmailProviderClosed,
} from "../lib/commerce/email-outbox.ts";
import { D1IdentityAccessStore } from "../lib/commerce/identity-access-store.ts";
import { D1RetentionPolicyStore } from "../lib/commerce/retention-policy.ts";

const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrations = readdirSync(drizzleDirectory)
  .filter((name) => /^000[0-4]_.+\.sql$/.test(name))
  .sort()
  .map((name) => `${drizzleDirectory}${name}`);

class SQLiteD1Statement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }
  bind(...values) { return new SQLiteD1Statement(this.database, this.query, values); }
  async first() { return this.database.prepare(this.query).get(...this.values) ?? null; }
  async all() {
    return { success: true, results: this.database.prepare(this.query).all(...this.values), meta: { changes: 0 } };
  }
  async run() {
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async executeForBatch() {
    if (/^\s*(?:SELECT|PRAGMA|WITH\b)/i.test(this.query)) return this.all();
    return this.run();
  }
}

class SQLiteD1Database {
  #tail = Promise.resolve();
  constructor(database) { this.database = database; }
  prepare(query) { return new SQLiteD1Statement(this.database, query); }
  batch(statements) {
    const execute = () => this.#runBatch(statements);
    const result = this.#tail.then(execute, execute);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }
  async #runBatch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.executeForBatch());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function applyMigrations(database) {
  for (const path of migrations) {
    for (const statement of readFileSync(path, "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement.trim());
    }
  }
}

function fixture(options = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  applyMigrations(database);
  const d1 = new SQLiteD1Database(database);
  const deliveries = [];
  const identity = new D1IdentityAccessStore(d1, {
    delivery: { async deliver(message) { deliveries.push(message); } },
    rateLimit: { async take() { return true; } },
    externalMfa: { async verify() { return options.mfaEvidence ?? null; } },
  });
  return { database, d1, deliveries, identity };
}

function insertCustomer(database, id, email, now = "2026-08-11T12:00:00.000Z") {
  database.prepare(`INSERT INTO customers (
    id, email, accepts_marketing, created_at, updated_at, account_enabled_at
  ) VALUES (?, ?, 0, ?, ?, ?)`)
    .run(id, email, now, now, now);
}

function insertOrder(database, input) {
  database.prepare(`INSERT INTO orders (
    id, order_number, customer_id, email, status, currency, subtotal_cents,
    shipping_cents, tax_cents, total_cents, shipping_country_code,
    shipping_address_json, billing_address_json, terms_version, privacy_version,
    paid_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, 'EUR', 2999, 0, 0, 2999, 'FR', ?, ?,
    'terms-v1', 'privacy-v1', ?, ?, ?)`)
    .run(
      input.id, input.number, input.customerId ?? null, input.email,
      input.status ?? "pending_payment",
      JSON.stringify({ firstName: "Ada", line1: "1 rue Test", postalCode: "75001", city: "Paris", countryCode: "FR", forbidden: "drop" }),
      JSON.stringify({ firstName: "Ada", line1: "1 rue Test", postalCode: "75001", city: "Paris", countryCode: "FR" }),
      input.status === "paid" ? input.now : null, input.now, input.now,
    );
}

function insertSucceededPayment(database, orderId, providerId, now) {
  database.prepare(`INSERT INTO webhook_events (
    id, provider, provider_event_id, event_type, payload_fingerprint,
    verification_method, verified_at, order_id, provider_payment_id,
    amount_cents, currency, status, attempts, received_at
  ) VALUES (?, 'test', ?, 'payment.succeeded', ?, 'test_adapter', ?, ?, ?,
    2999, 'EUR', 'verified', 0, ?)`)
    .run(`webhook_${providerId}`, `event_${providerId}`, `sha256:${providerId}`,
      now, orderId, providerId, now);
  database.prepare(`INSERT INTO payments (
    id, order_id, provider, provider_session_id, status, amount_cents,
    currency, idempotency_key, created_at, updated_at
  ) VALUES (?, ?, 'test', ?, 'succeeded', 2999, 'EUR', ?, ?, ?)`)
    .run(`payment_${providerId}`, orderId, providerId, `payment:${providerId}`, now, now);
}

async function createCustomerActor(context, id, email) {
  const now = "2026-08-11T12:00:00.000Z";
  insertCustomer(context.database, id, email, now);
  await context.identity.requestCustomerSignIn({ email, challengeId: `challenge_${id}`, now });
  const token = context.deliveries.at(-1).rawToken;
  const session = await context.identity.consumeCustomerChallenge({
    rawChallengeToken: token,
    sessionId: `session_${id}`,
    now: "2026-08-11T12:01:00.000Z",
  });
  assert.ok(session);
  return { kind: "customer", sessionToken: session.token, csrfToken: session.csrfToken };
}

async function createGuestActor(context, orderId, email) {
  const now = "2026-08-11T12:00:00.000Z";
  insertOrder(context.database, { id: orderId, number: `AJ-${orderId.toUpperCase()}`, email, now });
  await context.identity.requestGuestOrderAccess({
    email, orderNumber: `AJ-${orderId.toUpperCase()}`,
    challengeId: `challenge_${orderId}`, now,
  });
  const session = await context.identity.consumeGuestOrderChallenge({
    rawChallengeToken: context.deliveries.at(-1).rawToken,
    sessionId: `session_${orderId}`,
    now: "2026-08-11T12:01:00.000Z",
  });
  assert.ok(session);
  return { kind: "guest-order", sessionToken: session.token, csrfToken: session.csrfToken };
}

async function createOwnerActor(context, subjectHash = "e".repeat(64)) {
  const now = "2026-08-11T12:00:00.000Z";
  context.database.prepare(`INSERT INTO administrators (
    id, external_subject_hash, role, enabled, authz_version, created_at, updated_at
  ) VALUES ('admin_owner', ?, 'owner', 1, 1, ?, ?)`)
    .run(subjectHash, now, now);
  const session = await context.identity.createAdminSession({
    assertion: {}, sessionId: "session_admin_owner", now,
  });
  assert.ok(session);
  return { kind: "admin", sessionToken: session.token, csrfToken: session.csrfToken };
}

test("ten concurrent workers claim one lease, retry safely and never change the paid sale", async () => {
  const context = fixture();
  const now = "2026-08-11T12:00:00.000Z";
  insertOrder(context.database, { id: "order_paid", number: "AJ-PAID", email: "paid@example.com", status: "paid", now });
  insertSucceededPayment(context.database, "order_paid", "provider_paid", now);
  const outbox = new D1EmailOutbox(context.d1, { async deliver() { throw new Error("ambiguous provider failure with private payload"); } });
  assert.deepEqual(await outbox.enqueue({
    id: "email_paid", kind: "payment_confirmation", sourceEventId: "provider_paid",
    recipientEmail: "paid@example.com", orderId: "order_paid", locale: "fr",
    templateVersion: "payment-v1", subject: "Paiement confirme", text: "Paiement confirme.",
    idempotencyKey: "email:payment:provider_paid", createdAt: now,
  }), { id: "email_paid", created: true });
  assert.deepEqual(await outbox.enqueue({
    id: "email_paid", kind: "payment_confirmation", sourceEventId: "provider_paid",
    recipientEmail: "paid@example.com", orderId: "order_paid", locale: "fr",
    templateVersion: "payment-v1", subject: "Paiement confirme", text: "Paiement confirme.",
    idempotencyKey: "email:payment:provider_paid", createdAt: now,
  }), { id: "email_paid", created: false });
  const leases = await Promise.all(Array.from({ length: 10 }, (_, index) => outbox.claimNext({
    leaseTokenHash: index.toString(16).padStart(64, "0"),
    now,
    leaseExpiresAt: "2026-08-11T12:00:30.000Z",
  })));
  assert.equal(leases.filter(Boolean).length, 1);
  const claim = leases.find(Boolean);
  assert.equal(await outbox.deliverClaim(claim, "2026-08-11T12:00:01.000Z"), "retry");
  assert.deepEqual({ ...context.database.prepare(
    "SELECT status, total_cents, paid_at FROM orders WHERE id = 'order_paid'",
  ).get() }, { status: "paid", total_cents: 2999, paid_at: now });
  assert.equal(context.database.prepare(
    "SELECT status FROM payments WHERE order_id = 'order_paid'",
  ).get().status, "succeeded");
  assert.equal(context.database.prepare(
    "SELECT status FROM email_outbox WHERE id = 'email_paid'",
  ).get().status, "pending");
  context.database.close();
});

test("stale leases fail closed for account access and revoke the one-time challenge", async () => {
  const context = fixture();
  const actor = await createCustomerActor(context, "customer_access", "access@example.com");
  void actor;
  context.database.prepare(`INSERT INTO access_challenges (
    id, purpose, customer_id, token_hash, expires_at, created_at
  ) VALUES ('challenge_email_access', 'customer_sign_in', 'customer_access', ?,
    '2026-08-11T12:17:00.000Z', '2026-08-11T12:02:00.000Z')`)
    .run("7".repeat(64));
  const outbox = new D1EmailOutbox(context.d1);
  await outbox.enqueue({
    id: "email_access", kind: "account_access", sourceEventId: "challenge_email_access",
    recipientEmail: "access@example.com", accessChallengeId: "challenge_email_access",
    locale: "fr", templateVersion: "access-v1", subject: "Acces au compte",
    text: "Utilisez le lien temporaire remis par le canal securise.",
    idempotencyKey: "email:access:challenge_email_access",
    createdAt: "2026-08-11T12:02:00.000Z",
  });
  const claim = await outbox.claimNext({
    leaseTokenHash: "a".repeat(64), now: "2026-08-11T12:02:00.000Z",
    leaseExpiresAt: "2026-08-11T12:02:30.000Z",
  });
  assert.ok(claim);
  assert.equal(await outbox.recoverStaleLease("email_access", "2026-08-11T12:02:31.000Z"), "failed");
  const state = { ...context.database.prepare(
    "SELECT status, attempts, max_attempts, last_error_code FROM email_outbox WHERE id = 'email_access'",
  ).get() };
  assert.deepEqual(state, { status: "failed", attempts: 1, max_attempts: 1, last_error_code: "delivery_ambiguous" });
  assert.ok(context.database.prepare(
    "SELECT revoked_at FROM access_challenges WHERE id = 'challenge_email_access'",
  ).get().revoked_at);
  context.database.close();
});

test("terminal content purge is disabled without policy and activates only after explicit owner policy", async () => {
  const evidence = { externalSubjectHash: "d".repeat(64), evidenceHash: "6".repeat(64), aal: 2, authenticatedAt: "2026-08-11T12:00:00.000Z" };
  const context = fixture({ mfaEvidence: evidence });
  const ownerActor = await createOwnerActor(context, "d".repeat(64));
  const now = "2026-08-11T12:02:00.000Z";
  insertOrder(context.database, { id: "order_purge", number: "AJ-PURGE", email: "purge@example.com", status: "paid", now });
  insertSucceededPayment(context.database, "order_purge", "provider_purge", now);
  const outbox = new D1EmailOutbox(context.d1);
  await outbox.enqueue({ id: "email_purge", kind: "payment_confirmation",
    sourceEventId: "provider_purge", recipientEmail: "purge@example.com",
    orderId: "order_purge", locale: "fr", templateVersion: "payment-v1",
    subject: "Paiement confirme", text: "Contenu a purger.",
    idempotencyKey: "email:purge", createdAt: now });
  const claim = await outbox.claimNext({ leaseTokenHash: "b".repeat(64), now,
    leaseExpiresAt: "2026-08-11T12:02:30.000Z" });
  assert.ok(claim);
  await outbox.markSent(claim, "2026-08-11T12:02:01.000Z");
  assert.equal(await outbox.purgeEligibleTerminalContent("2026-08-11T12:03:00.000Z"), 0);
  assert.equal(context.database.prepare(
    "SELECT recipient_email FROM email_outbox WHERE id = 'email_purge'",
  ).get().recipient_email, "purge@example.com");
  await new D1RetentionPolicyStore(context.d1).activate({
    id: "rule_email_content_v1", recordClass: "email_content",
    policyVersion: "email-content-v1", retentionSeconds: 0,
    effectiveAt: "2026-08-11T12:03:00.000Z", actor: ownerActor,
    now: "2026-08-11T12:03:00.000Z",
  });
  assert.equal(await outbox.purgeEligibleTerminalContent("2026-08-11T12:03:00.000Z"), 1);
  assert.deepEqual({ ...context.database.prepare(
    "SELECT recipient_email, payload_json, purged_at FROM email_outbox WHERE id = 'email_purge'",
  ).get() }, {
    recipient_email: null,
    payload_json: null,
    purged_at: "2026-08-11T12:03:00.000Z",
  });
  context.database.close();
});

test("customer and guest exports are ownership-scoped and omit secrets, stock and internal references", async () => {
  const context = fixture();
  const actorA = await createCustomerActor(context, "customer_a", "a@example.com");
  const actorB = await createCustomerActor(context, "customer_b", "b@example.com");
  const now = "2026-08-11T12:02:00.000Z";
  insertOrder(context.database, { id: "order_a", number: "AJ-ORDER-A", customerId: "customer_a", email: "a@example.com", now });
  insertOrder(context.database, { id: "order_b", number: "AJ-ORDER-B", customerId: "customer_b", email: "b@example.com", now });
  const guestActor = await createGuestActor(context, "order_guest", "guest@example.com");
  const rights = new D1DataRightsStore(context.d1);
  await rights.createRequest({ id: "request_export_a", kind: "export", actor: actorA,
    idempotencyKey: "rights:export:a", now });
  const exportA = await rights.exportAllowlistedData({ requestId: "request_export_a", actor: actorA, now });
  const serializedA = JSON.stringify(exportA);
  assert.match(serializedA, /AJ-ORDER-A/);
  assert.doesNotMatch(serializedA, /AJ-ORDER-B|b@example\.com|token_hash|csrf|physical_quantity|gift_reserve|internal_reference|forbidden/);
  await assert.rejects(
    () => rights.exportAllowlistedData({ requestId: "request_export_a", actor: actorB, now }),
    /ownership mismatch/i,
  );
  await rights.createRequest({ id: "request_export_guest", kind: "export", actor: guestActor,
    idempotencyKey: "rights:export:guest", now });
  const guestExport = JSON.stringify(await rights.exportAllowlistedData({
    requestId: "request_export_guest", actor: guestActor, now,
  }));
  assert.match(guestExport, /AJ-ORDER_GUEST/);
  assert.doesNotMatch(guestExport, /AJ-ORDER-A|AJ-ORDER-B/);
  context.database.close();
});

test("rectification is allowlisted and erasure remains a no-op until an owner activates policy", async () => {
  const evidence = { externalSubjectHash: "e".repeat(64), evidenceHash: "9".repeat(64), aal: 2, authenticatedAt: "2026-08-11T12:00:00.000Z" };
  const context = fixture({ mfaEvidence: evidence });
  const customerActor = await createCustomerActor(context, "customer_rights", "rights@example.com");
  const ownerActor = await createOwnerActor(context);
  const rights = new D1DataRightsStore(context.d1);
  const now = "2026-08-11T12:02:00.000Z";
  await rights.createRequest({
    id: "request_rectification", kind: "rectification", actor: customerActor,
    rectificationFields: ["firstName"], idempotencyKey: "rights:rectification:1", now,
  });
  await assert.rejects(() => rights.applyProfileRectification({
    requestId: "request_rectification", actor: customerActor, now,
    changes: { lastName: "Forbidden" },
  }), /outside the request/i);
  await rights.applyProfileRectification({
    requestId: "request_rectification", actor: customerActor, now,
    changes: { firstName: "Adam" },
  });
  assert.equal(context.database.prepare(
    "SELECT first_name FROM customers WHERE id = 'customer_rights'",
  ).get().first_name, "Adam");
  await rights.createRequest({
    id: "request_erasure", kind: "erasure", actor: customerActor,
    idempotencyKey: "rights:erasure:1", now,
  });
  assert.deepEqual(await rights.applySoftAnonymization({
    requestId: "request_erasure", actor: customerActor, now,
  }), { applied: false, reason: "policy-missing" });
  assert.equal(context.database.prepare(
    "SELECT email FROM customers WHERE id = 'customer_rights'",
  ).get().email, "rights@example.com");
  const policies = new D1RetentionPolicyStore(context.d1);
  await policies.activate({
    id: "rule_customer_profile_v1", recordClass: "customer_profile",
    policyVersion: "customer-profile-v1", retentionSeconds: 0,
    effectiveAt: now, actor: ownerActor, now,
  });
  assert.deepEqual(await rights.recordErasureDecision({
    requestId: "request_erasure", actor: ownerActor, activeDispute: false, now,
  }), { decision: "erase" });
  assert.deepEqual(await rights.applySoftAnonymization({
    requestId: "request_erasure", actor: ownerActor, now,
  }), { applied: true });
  const anonymized = context.database.prepare(
    "SELECT email, first_name, last_name, deleted_at FROM customers WHERE id = 'customer_rights'",
  ).get();
  assert.match(anonymized.email, /^anonymized\+[0-9a-f]{24}@invalid\.example$/);
  assert.equal(anonymized.first_name, null);
  assert.equal(anonymized.last_name, null);
  assert.equal(anonymized.deleted_at, now);
  context.database.close();
});

test("anonymization is transactional and audit rows never contain contact, token or provider payload", async () => {
  const evidence = { externalSubjectHash: "f".repeat(64), evidenceHash: "8".repeat(64), aal: 2, authenticatedAt: "2026-08-11T12:00:00.000Z" };
  const context = fixture({ mfaEvidence: evidence });
  const customerActor = await createCustomerActor(context, "customer_rollback", "rollback@example.com");
  const rawSession = customerActor.sessionToken;
  const ownerActor = await createOwnerActor(context, "f".repeat(64));
  const rights = new D1DataRightsStore(context.d1);
  const policies = new D1RetentionPolicyStore(context.d1);
  const now = "2026-08-11T12:02:00.000Z";
  await policies.activate({ id: "rule_profile", recordClass: "customer_profile",
    policyVersion: "profile-v1", retentionSeconds: 0, effectiveAt: now,
    actor: ownerActor, now });
  await rights.createRequest({ id: "request_rollback", kind: "erasure",
    actor: customerActor, idempotencyKey: "rights:rollback", now });
  await rights.recordErasureDecision({ requestId: "request_rollback", actor: ownerActor,
    activeDispute: false, now });
  context.database.exec(`CREATE TRIGGER test_force_anonymization_rollback
    BEFORE UPDATE OF status ON data_rights_requests
    WHEN NEW.id = 'request_rollback' AND NEW.status = 'completed'
    BEGIN SELECT RAISE(ABORT, 'forced_rollback'); END`);
  await assert.rejects(() => rights.applySoftAnonymization({
    requestId: "request_rollback", actor: ownerActor, now,
  }), /forced_rollback/);
  assert.equal(context.database.prepare(
    "SELECT email, deleted_at FROM customers WHERE id = 'customer_rollback'",
  ).get().email, "rollback@example.com");
  assert.equal(context.database.prepare(
    "SELECT status FROM data_rights_requests WHERE id = 'request_rollback'",
  ).get().status, "pending");
  const audits = JSON.stringify(context.database.prepare(
    "SELECT actor_type, actor_id, action, entity_type, entity_id, metadata_json FROM audit_log",
  ).all());
  assert.doesNotMatch(audits, /rollback@example\.com|raw-provider|1 rue Test/);
  assert.doesNotMatch(audits, new RegExp(rawSession));
  assert.ok(context.database.prepare(
    "SELECT metadata_json FROM audit_log",
  ).all().every((row) => row.metadata_json === "{}"));
  assert.deepEqual(transactionalEmailProviderClosed, {
    available: false,
    reason: "transactional-email-provider-not-configured",
  });
  context.database.close();
});
