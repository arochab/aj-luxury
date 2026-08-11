import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrationPaths = readdirSync(drizzleDirectory)
  .filter((name) => /^000[0-4]_.+\.sql$/.test(name))
  .sort()
  .map((name) => `${drizzleDirectory}${name}`);

function applySqlMigration(database, migrationPath) {
  for (const statement of readFileSync(migrationPath, "utf8").split(
    "--> statement-breakpoint",
  )) {
    const sql = statement.trim();
    if (sql) database.exec(sql);
  }
}

function applyTracked(database, paths = migrationPaths) {
  database.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`);
  for (const path of paths) {
    const name = path.split(/[\\/]/).at(-1);
    if (database.prepare("SELECT 1 FROM d1_migrations WHERE name = ?").get(name)) continue;
    database.exec("BEGIN IMMEDIATE");
    try {
      applySqlMigration(database, path);
      database.prepare(
        "INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)",
      ).run(name, "2026-08-11T12:00:00.000Z");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function insertOrder(db, id, number, status = "paid") {
  const now = "2026-08-11T12:00:00.000Z";
  db.prepare(`INSERT INTO orders (
    id, order_number, email, status, currency, subtotal_cents, shipping_cents,
    tax_cents, total_cents, shipping_country_code, shipping_address_json,
    billing_address_json, terms_version, privacy_version, paid_at, created_at, updated_at
  ) VALUES (?, ?, 'customer@example.com', 'pending_payment', 'EUR', 2999, 0, 0, 2999,
    'FR', '{}', '{}', 'terms-v1', 'privacy-v1', NULL, ?, ?)`)
    .run(id, number, now, now);
  if (!["paid", "pending_payment"].includes(status)) {
    throw new Error(`Unsupported test order status: ${status}`);
  }
}

function insertSucceededPayment(db, orderId, paymentId) {
  const now = "2026-08-11T12:00:00.000Z";
  const paidAt = "2026-08-11T12:00:01.000Z";
  db.prepare(`INSERT INTO webhook_events (
    id, provider, provider_event_id, event_type, payload_fingerprint,
    verification_method, verified_at, order_id, provider_payment_id,
    amount_cents, currency, status, attempts, received_at
  ) VALUES (?, 'test', ?, 'payment.succeeded', ?, 'test_adapter', ?, ?, ?,
    2999, 'EUR', 'verified', 0, ?)`)
    .run(`webhook_${paymentId}`, `event_${paymentId}`, `sha256:${paymentId}`, now,
      orderId, paymentId, now);
  db.prepare(`INSERT INTO payments (
    id, order_id, provider, provider_session_id, status, amount_cents,
    currency, idempotency_key, created_at, updated_at
  ) VALUES (?, ?, 'test', ?, 'succeeded', 2999, 'EUR', ?, ?, ?)`)
    .run(`payment_${paymentId}`, orderId, paymentId, `payment:${paymentId}`, now, now);
  const paidTransitionTrigger = db.prepare(`SELECT sql FROM sqlite_schema
    WHERE type = 'trigger' AND name = 'trg_orders_validate_paid_transition'`).get().sql;
  db.exec("DROP TRIGGER trg_orders_validate_paid_transition");
  db.prepare(`UPDATE orders SET status = 'paid', paid_at = ?, updated_at = ?
    WHERE id = ?`).run(paidAt, paidAt, orderId);
  db.exec(paidTransitionTrigger);
}

test("0000 through 0004 create and replay the single outbox and data-rights boundary", () => {
  assert.deepEqual(migrationPaths.map((path) => path.split(/[\\/]/).at(-1)), [
    "0000_flimsy_rhino.sql",
    "0001_lock_cart_line_price_provenance.sql",
    "0002_lock_order_line_snapshots.sql",
    "0003_identity_access.sql",
    "0004_email_outbox_data_rights.sql",
  ]);
  const db = database();
  applyTracked(db);
  db.prepare(`INSERT INTO audit_log (
    id, actor_type, action, entity_type, entity_id, idempotency_key,
    metadata_json, created_at
  ) VALUES ('audit_d02_sentinel', 'system', 'sentinel', 'migration', '0004',
    'migration:d02:sentinel', '{}', '2026-08-11T12:00:00.000Z')`).run();
  applyTracked(db);
  const tables = db.prepare(
    `SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  ).all().map((row) => row.name);
  for (const name of ["email_outbox", "data_rights_requests", "data_retention_rules"]) {
    assert.ok(tables.includes(name), `${name} must exist`);
  }
  assert.equal(tables.includes("email_outbox_legacy_d02"), false);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM d1_migrations").get().count, 5);
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS count FROM audit_log WHERE id = 'audit_d02_sentinel'",
  ).get().count, 1);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("0004 converts only verified post-payment confirmations and invalidates unsafe legacy states", () => {
  const db = database();
  applyTracked(db, migrationPaths.slice(0, 4));
  insertOrder(db, "order_paid", "AJ-PAID");
  insertOrder(db, "order_unpaid", "AJ-UNPAID", "pending_payment");
  insertSucceededPayment(db, "order_paid", "session_paid");
  const insert = db.prepare(`INSERT INTO email_outbox (
    id, kind, recipient_email, order_id, locale, template_version, payload_json,
    status, attempts, next_attempt_at, last_error_code, idempotency_key, created_at, sent_at
  ) VALUES (?, ?, ?, ?, 'fr', 'v1', ?, ?, ?, ?, ?, ?, ?, ?)`);
  const now = "2026-08-11T12:00:00.000Z";
  insert.run("legacy_magic_pending", "magic_link", "secret-pending@example.com", null, '{"token":"raw-pending"}', "pending", 0, now, null, "legacy:magic:pending", now, null);
  insert.run("legacy_magic_sending", "magic_link", "secret-sending@example.com", null, '{"token":"raw-sending"}', "sending", 1, now, "raw-provider-error", "legacy:magic:sending", now, null);
  insert.run("legacy_magic_sent", "magic_link", "secret-sent@example.com", null, '{"token":"raw-sent"}', "sent", 1, now, null, "legacy:magic:sent", now, now);
  insert.run("legacy_magic_failed", "magic_link", "secret-failed@example.com", null, '{"token":"raw-failed"}', "failed", 1, now, "raw-provider-error", "legacy:magic:failed", now, null);
  insert.run("legacy_paid", "order_confirmation", "paid@example.com", "order_paid", '{}', "pending", 0, now, null, "legacy:paid", now, null);
  insert.run("legacy_paid_duplicate", "order_confirmation", "paid@example.com", "order_paid", '{}', "sent", 1, now, null, "legacy:paid:duplicate", now, now);
  insert.run("legacy_unpaid", "order_confirmation", "unpaid@example.com", "order_unpaid", '{}', "pending", 0, now, null, "legacy:unpaid", now, null);
  insert.run("legacy_unpaid_sent", "order_confirmation", "unpaid@example.com", "order_unpaid", '{}', "sent", 1, now, null, "legacy:unpaid:sent", now, now);
  insert.run("legacy_sending", "payment_failed", "ambiguous@example.com", "order_unpaid", '{}', "sending", 1, now, "raw-provider-error", "legacy:sending", now, null);

  applyTracked(db);
  const rows = db.prepare(`SELECT id, kind, transaction_intent, status,
    recipient_email, payload_json, access_challenge_id, last_error_code,
    provider_idempotency_key, attempts, max_attempts, sent_at, terminal_at, purged_at
    FROM email_outbox ORDER BY id`).all();
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(byId.legacy_paid.kind, "payment_confirmation");
  assert.equal(byId.legacy_paid.transaction_intent, "payment_succeeded");
  assert.equal(byId.legacy_paid.status, "pending");
  assert.deepEqual(
    {
      kind: byId.legacy_paid_duplicate.kind,
      status: byId.legacy_paid_duplicate.status,
      error: byId.legacy_paid_duplicate.last_error_code,
      sentAt: byId.legacy_paid_duplicate.sent_at,
    },
    {
      kind: "order_confirmation",
      status: "cancelled",
      error: "legacy_duplicate_intent",
      sentAt: null,
    },
  );
  assert.deepEqual(
    {
      status: byId.legacy_unpaid.status,
      error: byId.legacy_unpaid.last_error_code,
    },
    { status: "cancelled", error: "legacy_unverified_payment_intent" },
  );
  assert.deepEqual(
    {
      kind: byId.legacy_unpaid_sent.kind,
      status: byId.legacy_unpaid_sent.status,
      error: byId.legacy_unpaid_sent.last_error_code,
      sentAt: byId.legacy_unpaid_sent.sent_at,
      terminal: byId.legacy_unpaid_sent.terminal_at !== null,
      providerKey: byId.legacy_unpaid_sent.provider_idempotency_key,
    },
    {
      kind: "order_confirmation",
      status: "cancelled",
      error: "legacy_unverified_payment_intent",
      sentAt: null,
      terminal: true,
      providerKey: "legacy_email:legacy_unpaid_sent",
    },
  );
  assert.deepEqual(
    {
      status: byId.legacy_magic_pending.status,
      recipient: byId.legacy_magic_pending.recipient_email,
      payload: byId.legacy_magic_pending.payload_json,
      error: byId.legacy_magic_pending.last_error_code,
      purged: byId.legacy_magic_pending.purged_at !== null,
    },
    {
      status: "cancelled",
      recipient: null,
      payload: null,
      error: "legacy_magic_link_invalidated",
      purged: true,
    },
  );
  assert.deepEqual(
    ["legacy_magic_pending", "legacy_magic_sending", "legacy_magic_sent", "legacy_magic_failed"]
      .map((id) => ({
        id,
        status: byId[id].status,
        error: byId[id].last_error_code,
        attempts: byId[id].attempts,
        maxAttempts: byId[id].max_attempts,
        sent: byId[id].sent_at !== null,
        terminal: byId[id].terminal_at !== null,
        purged: byId[id].purged_at !== null,
        recipient: byId[id].recipient_email,
        payload: byId[id].payload_json,
      })),
    [
      { id: "legacy_magic_pending", status: "cancelled", error: "legacy_magic_link_invalidated", attempts: 0, maxAttempts: 1, sent: false, terminal: true, purged: true, recipient: null, payload: null },
      { id: "legacy_magic_sending", status: "failed", error: "legacy_ambiguous_delivery", attempts: 1, maxAttempts: 1, sent: false, terminal: true, purged: true, recipient: null, payload: null },
      { id: "legacy_magic_sent", status: "sent", error: null, attempts: 1, maxAttempts: 1, sent: true, terminal: true, purged: true, recipient: null, payload: null },
      { id: "legacy_magic_failed", status: "failed", error: "provider_rejected", attempts: 1, maxAttempts: 1, sent: false, terminal: true, purged: true, recipient: null, payload: null },
    ],
  );
  assert.deepEqual(
    { status: byId.legacy_sending.status, error: byId.legacy_sending.last_error_code },
    { status: "failed", error: "legacy_ambiguous_delivery" },
  );
  assert.doesNotMatch(JSON.stringify(db.prepare("SELECT * FROM audit_log").all()),
    /secret-(?:pending|sending|sent|failed)@example\.com|raw-(?:pending|sending|sent|failed)|ambiguous@example\.com|raw-provider-error/);
  assert.throws(() => db.prepare(`INSERT INTO email_outbox (
    id, kind, transaction_intent, source_event_id, recipient_email,
    access_challenge_id, locale, template_version, payload_json, status,
    attempts, max_attempts, next_attempt_at, idempotency_key,
    provider_idempotency_key, created_at, updated_at
  ) VALUES ('forbidden_account_access', 'account_access',
    'account_access_challenge', 'forbidden:account-access', 'forbidden@example.com',
    NULL, 'fr', 'access-v1', '{}', 'pending', 0, 1, ?,
    'forbidden:account-access', 'account_access:forbidden', ?, ?)`)
    .run(now, now, now), /email_outbox_account_access_is_historical_only/);
  assert.throws(() => db.prepare(`UPDATE email_outbox SET status = 'failed',
    last_error_code = 'attempts_exhausted', terminal_at = ?, updated_at = ?
    WHERE id = 'legacy_magic_pending'`).run(now, now),
  /email_outbox_account_access_is_historical_only/);
  assert.throws(() => db.prepare(
    "DELETE FROM email_outbox WHERE id = 'legacy_magic_pending'",
  ).run(), /email_outbox_evidence_is_immutable/);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("retention is inactive by default and terminal outbox rows are append-only", () => {
  const db = database();
  applyTracked(db);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM data_retention_rules").get().count, 0);
  insertOrder(db, "order_paid", "AJ-PAID");
  insertSucceededPayment(db, "order_paid", "session_paid");
  db.prepare(`INSERT INTO email_outbox (
    id, kind, recipient_email, order_id, locale, template_version,
    payload_json, status, attempts, next_attempt_at, idempotency_key, created_at
  ) VALUES ('email_compat', 'order_confirmation', 'customer@example.com',
    'order_paid', 'fr', 'order-confirmation-v1', '{}', 'pending', 0, ?,
    'email:compat:paid', ?)`)
    .run("2026-08-11T12:00:00.000Z", "2026-08-11T12:00:00.000Z");
  assert.deepEqual({ ...db.prepare(
    "SELECT kind, transaction_intent, source_event_id FROM email_outbox WHERE id = 'email_compat'",
  ).get() }, {
    kind: "payment_confirmation",
    transaction_intent: "payment_succeeded",
    source_event_id: "payment:order_paid",
  });
  db.prepare(`UPDATE email_outbox SET status = 'cancelled', next_attempt_at = NULL,
    terminal_at = ?, updated_at = ? WHERE id = 'email_compat'`)
    .run("2026-08-11T12:01:00.000Z", "2026-08-11T12:01:00.000Z");
  assert.throws(() => db.prepare(
    "UPDATE email_outbox SET status = 'pending', next_attempt_at = ? WHERE id = 'email_compat'",
  ).run("2026-08-11T12:02:00.000Z"), /email_outbox_(?:transition_not_allowed|terminal_is_append_only)|CHECK constraint/);
  assert.throws(() => db.prepare(
    "UPDATE email_outbox SET recipient_email = 'other@example.com' WHERE id = 'email_compat'",
  ).run(), /email_outbox_(?:identity_is_immutable|transition_not_allowed)/);
  assert.throws(() => db.prepare(
    "DELETE FROM email_outbox WHERE id = 'email_compat'",
  ).run(), /email_outbox_evidence_is_immutable/);
  db.close();
});
