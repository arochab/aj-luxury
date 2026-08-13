import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrationPaths = readdirSync(drizzleDirectory)
  .filter((name) => /^000[0-3]_.+\.sql$/.test(name))
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

function applyTrackedMigrations(database, migrationPathsToApply = migrationPaths) {
  database.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`);
  for (const migrationPath of migrationPathsToApply) {
    const name = migrationPath.split(/[\\/]/).at(-1);
    const applied = database
      .prepare("SELECT 1 FROM d1_migrations WHERE name = ?")
      .get(name);
    if (applied) continue;
    database.exec("BEGIN IMMEDIATE");
    try {
      applySqlMigration(database, migrationPath);
      database
        .prepare(
          "INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)",
        )
        .run(name, "2026-08-11T12:00:00.000Z");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  return database;
}

test("0000 through 0003 create the lean identity boundary and replay cleanly", () => {
  assert.deepEqual(
    migrationPaths.map((path) => path.split(/[\\/]/).at(-1)),
    [
      "0000_flimsy_rhino.sql",
      "0001_lock_cart_line_price_provenance.sql",
      "0002_lock_order_line_snapshots.sql",
      "0003_identity_access.sql",
    ],
  );
  const database = createDatabase();
  applyTrackedMigrations(database);
  database
    .prepare(
      `INSERT INTO audit_log (
        id, actor_type, action, entity_type, entity_id, idempotency_key,
        metadata_json, created_at
      ) VALUES (?, 'system', 'sentinel', 'migration', '0003', ?, '{}', ?)`,
    )
    .run(
      "audit_migration_sentinel",
      "migration:0003:sentinel",
      "2026-08-11T12:00:00.000Z",
    );

  applyTrackedMigrations(database);

  const tables = database
    .prepare(
      `SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations'
      ORDER BY name`,
    )
    .all()
    .map((row) => row.name);
  for (const expected of [
    "access_challenges",
    "administrators",
    "admin_sessions",
    "customer_sessions",
    "guest_order_sessions",
  ]) {
    assert.ok(tables.includes(expected), `${expected} must exist`);
  }
  assert.equal(tables.length, 19);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM d1_migrations").get().count,
    4,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM audit_log WHERE id = ?")
      .get("audit_migration_sentinel").count,
    1,
  );
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("0003 upgrades 0000 through 0002, preserves sentinels and revokes legacy sessions", () => {
  const database = createDatabase();
  applyTrackedMigrations(database, migrationPaths.slice(0, 3));
  database
    .prepare(
      `INSERT INTO customers (
        id, email, accepts_marketing, created_at, updated_at
      ) VALUES (?, ?, 0, ?, ?)` ,
    )
    .run(
      "customer_legacy",
      "legacy@example.com",
      "2026-08-10T12:00:00.000Z",
      "2026-08-10T12:00:00.000Z",
    );
  database
    .prepare(
      `INSERT INTO customer_sessions (
        id, customer_id, token_hash, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?)` ,
    )
    .run(
      "session_legacy",
      "customer_legacy",
      "a".repeat(64),
      "2026-09-10T12:00:00.000Z",
      "2026-08-10T12:00:00.000Z",
    );
  database
    .prepare(
      `INSERT INTO audit_log (
        id, actor_type, action, entity_type, entity_id, idempotency_key,
        metadata_json, created_at
      ) VALUES (?, 'system', 'before_upgrade', 'migration', '0002', ?, '{}', ?)`,
    )
    .run(
      "audit_before_identity_upgrade",
      "migration:before-identity-upgrade",
      "2026-08-10T12:00:00.000Z",
    );

  applyTrackedMigrations(database);

  assert.deepEqual(
    {
      ...database
        .prepare(
          `SELECT id, customer_id, authentication_source,
            issued_by_challenge_id, rotated_from_session_id,
            CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END AS revoked
          FROM customer_sessions WHERE id = ?`,
        )
        .get("session_legacy"),
    },
    {
      id: "session_legacy",
      customer_id: "customer_legacy",
      authentication_source: "legacy_revoked",
      issued_by_challenge_id: null,
      rotated_from_session_id: null,
      revoked: 1,
    },
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM audit_log WHERE id = ?")
      .get("audit_before_identity_upgrade").count,
    1,
  );
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("0003 constraints fail closed for guest, administrator and session provenance", () => {
  const database = createDatabase();
  applyTrackedMigrations(database);
  const now = "2026-08-11T12:00:00.000Z";
  database
    .prepare(
      `INSERT INTO customers (
        id, email, accepts_marketing, created_at, updated_at
      ) VALUES ('customer_a', 'a@example.com', 0, ?, ?)` ,
    )
    .run(now, now);

  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO access_challenges (
            id, purpose, customer_id, token_hash, expires_at, created_at
          ) VALUES ('challenge_inactive_customer', 'customer_sign_in',
            'customer_a', ?, '2026-08-11T12:15:00.000Z', ?)` ,
        )
        .run("1".repeat(64), now),
    /identity_customer_challenge_requires_enabled_account/,
  );

  database
    .prepare(
      `UPDATE customers SET account_enabled_at = ?, updated_at = ?
      WHERE id = 'customer_a'`,
    )
    .run(now, now);

  for (const [id, purpose, tokenHash] of [
    ["challenge_targetless_customer", "customer_sign_in", "2".repeat(64)],
    ["challenge_targetless_guest", "guest_order_access", "3".repeat(64)],
  ]) {
    assert.throws(
      () =>
        database
          .prepare(
            `INSERT INTO access_challenges (
              id, purpose, customer_id, order_id, token_hash, expires_at,
              created_at
            ) VALUES (?, ?, NULL, NULL, ?, '2026-08-11T12:15:00.000Z', ?)`,
          )
          .run(id, purpose, tokenHash, now),
      /identity_challenge_insert_state_not_allowed/,
    );
  }

  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO access_challenges (
            id, purpose, customer_id, token_hash, expires_at, dispatched_at,
            created_at
          ) VALUES ('challenge_predispatched', 'customer_sign_in',
            'customer_a', ?, '2026-08-11T12:15:00.000Z', ?, ?)` ,
        )
        .run("4".repeat(64), now, now),
    /identity_challenge_insert_state_not_allowed/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO access_challenges (
            id, purpose, customer_id, token_hash, expires_at, consumed_at,
            created_at
          ) VALUES ('challenge_preconsumed', 'customer_sign_in',
            'customer_a', ?, '2026-08-11T12:15:00.000Z', ?, ?)` ,
        )
        .run("5".repeat(64), now, now),
    /identity_challenge_insert_state_not_allowed/,
  );

  database
    .prepare(
      `INSERT INTO access_challenges (
        id, purpose, customer_id, token_hash, expires_at, created_at
      ) VALUES ('challenge_state', 'customer_sign_in', 'customer_a', ?,
        '2026-08-11T12:15:00.000Z', ?)` ,
    )
    .run("6".repeat(64), now);
  assert.throws(
    () =>
      database
        .prepare(
          `UPDATE access_challenges SET consumed_at = ?
          WHERE id = 'challenge_state'`,
        )
        .run("2026-08-11T12:01:00.000Z"),
    /identity_challenge_transition_not_allowed/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          `UPDATE access_challenges SET dispatched_at = ?, consumed_at = ?
          WHERE id = 'challenge_state'`,
        )
        .run(
          "2026-08-11T12:01:00.000Z",
          "2026-08-11T12:01:00.000Z",
        ),
    /identity_challenge_transition_not_allowed/,
  );
  database
    .prepare(
      `UPDATE access_challenges SET dispatched_at = ?
      WHERE id = 'challenge_state'`,
    )
    .run("2026-08-11T12:01:00.000Z");
  assert.throws(
    () =>
      database
        .prepare(
          `UPDATE access_challenges SET consumed_at = ?
          WHERE id = 'challenge_state'`,
        )
        .run("2026-08-11T12:02:00.000Z"),
    /identity_challenge_consumption_without_session/,
  );
  database
    .prepare(
      `INSERT INTO customer_sessions (
        id, customer_id, token_hash, csrf_token_hash, session_family_id,
        authentication_source, issued_by_challenge_id, rotated_from_session_id,
        expires_at, idle_expires_at, last_seen_at, revoked_at, created_at
      ) VALUES (
        'session_challenge_state', 'customer_a', ?, ?, 'family_challenge_state',
        'challenge', 'challenge_state', NULL,
        '2026-08-11T12:12:00.000Z', '2026-08-11T12:10:00.000Z',
        NULL, NULL, '2026-08-11T12:02:00.000Z'
      )`,
    )
    .run("7".repeat(64), "8".repeat(64));
  assert.equal(
    database
      .prepare(
        `SELECT consumed_at FROM access_challenges
        WHERE id = 'challenge_state'`,
      )
      .get().consumed_at,
    "2026-08-11T12:02:00.000Z",
  );
  assert.throws(
    () =>
      database
        .prepare(
          `UPDATE access_challenges SET revoked_at = ?
          WHERE id = 'challenge_state'`,
        )
        .run("2026-08-11T12:03:00.000Z"),
    /identity_challenge_transition_not_allowed/,
  );
  database
    .prepare(
      `INSERT INTO access_challenges (
        id, purpose, customer_id, token_hash, expires_at, revoked_at, created_at
      ) VALUES ('challenge_revoked', 'customer_sign_in', NULL, ?,
        '2026-08-11T12:15:00.000Z', ?, ?)` ,
    )
    .run("9".repeat(64), now, now);
  assert.throws(
    () =>
      database
        .prepare(
          `UPDATE access_challenges SET dispatched_at = ?
          WHERE id = 'challenge_revoked'`,
        )
        .run("2026-08-11T12:01:00.000Z"),
    /identity_challenge_transition_not_allowed/,
  );
  database
    .prepare(
      `INSERT INTO orders (
        id, order_number, cart_id, customer_id, email, status, currency,
        subtotal_cents, shipping_cents, tax_cents, total_cents,
        shipping_country_code, shipping_address_json, billing_address_json,
        terms_version, privacy_version, created_at, updated_at
      ) VALUES (
        'order_customer', 'AJ-CUSTOMER', NULL, 'customer_a', 'a@example.com',
        'pending_payment', 'EUR', 2999, 0, 0, 2999, 'FR', '{}', '{}',
        'terms-v1', 'privacy-v1', ?, ?
      )`,
    )
    .run(now, now);

  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO access_challenges (
            id, purpose, order_id, token_hash, expires_at, created_at
          ) VALUES ('challenge_wrong_guest', 'guest_order_access',
            'order_customer', ?, '2026-08-11T12:15:00.000Z', ?)` ,
        )
        .run("b".repeat(64), now),
    /identity_guest_challenge_requires_guest_order/,
  );

  database
    .prepare(
      `INSERT INTO administrators (
        id, external_subject_hash, role, enabled, authz_version,
        created_at, updated_at
      ) VALUES ('admin_operations', ?, 'operations', 1, 1, ?, ?)` ,
    )
    .run("c".repeat(64), now, now);
  assert.throws(
    () =>
      database
        .prepare(
          `UPDATE administrators SET role = 'owner', updated_at = ?
          WHERE id = 'admin_operations'`,
        )
        .run("2026-08-11T12:01:00.000Z"),
    /identity_admin_update_requires_version_bump/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO admin_sessions (
            id, administrator_id, token_hash, csrf_token_hash, evidence_hash,
            authz_version, aal,
            external_authenticated_at, expires_at, idle_expires_at, created_at
          ) VALUES ('admin_session_weak', 'admin_operations', ?, ?, ?, 1, 1, ?,
            '2026-08-11T20:00:00.000Z', '2026-08-11T12:15:00.000Z', ?)` ,
        )
        .run("d".repeat(64), "e".repeat(64), "f".repeat(64), now, now),
    /CHECK constraint failed/,
  );
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});
