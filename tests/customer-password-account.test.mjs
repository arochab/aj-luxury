import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { D1CustomerPasswordAccountStore } from "../lib/commerce/customer-password-account-store.ts";
import {
  customerPasswordPolicy,
  hashCustomerPassword,
  verifyCustomerPassword,
} from "../lib/commerce/password-security.ts";

const drizzle = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrations = [
  "0000_flimsy_rhino.sql",
  "0001_lock_cart_line_price_provenance.sql",
  "0002_lock_order_line_snapshots.sql",
  "0003_identity_access.sql",
  "0022_customer_password_accounts.sql",
  "0024_customer_password_runtime_profile.sql",
  "0025_customer_password_scrypt_profile.sql",
];

class Statement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }
  bind(...values) { return new Statement(this.database, this.query, values); }
  async first() { return this.database.prepare(this.query).get(...this.values) ?? null; }
  async all() {
    return { success: true, results: this.database.prepare(this.query).all(...this.values), meta: { changes: 0 } };
  }
  async run() {
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class DatabasePort {
  #tail = Promise.resolve();
  constructor(database) { this.database = database; }
  prepare(query) { return new Statement(this.database, query); }
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
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function apply(database, name) {
  for (const statement of readFileSync(`${drizzle}${name}`, "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement.trim());
  }
}

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) apply(sqlite, migration);
  return { sqlite, store: new D1CustomerPasswordAccountStore(new DatabasePort(sqlite)) };
}

test("passwords use the governed slow one-way format", async () => {
  assert.equal(customerPasswordPolicy.algorithm, "scrypt-n16384-r8-p5");
  assert.equal(customerPasswordPolicy.cost, 16_384);
  assert.equal(customerPasswordPolicy.blockSize, 8);
  assert.equal(customerPasswordPolicy.parallelization, 5);
  const password = "Satin-Pourpre-2026!";
  const stored = await hashCustomerPassword(password);
  assert.equal(await verifyCustomerPassword(password, stored), true);
  assert.equal(await verifyCustomerPassword("Satin-Pourpre-2027!", stored), false);
  assert.doesNotMatch(JSON.stringify(stored), /Satin-Pourpre/);
});

test("registration, verification, sessions, consent and recovery form one traceable account", async () => {
  const { sqlite, store } = fixture();
  const email = "adam@example.com";
  const originalPassword = "Satin-Pourpre-2026!";
  const createdAt = "2026-08-27T01:00:00.000Z";
  const registration = await store.register({
    email,
    password: originalPassword,
    acceptsMarketing: true,
    source: "account_registration",
    privacyVersion: "2026-08-26",
    now: createdAt,
  });
  assert.equal(registration.accepted, true);
  assert.ok(registration.checkoutToken);
  assert.equal(registration.emailDelivery?.purpose, "email_verification");
  const credential = sqlite.prepare(
    "SELECT salt_base64url, hash_base64url FROM customer_password_credentials",
  ).get();
  assert.doesNotMatch(JSON.stringify(credential), /Satin-Pourpre/);
  assert.ok(await store.resolveCheckoutCustomer({
    email,
    customerSessionToken: null,
    checkoutToken: registration.checkoutToken,
    now: "2026-08-27T01:05:00.000Z",
  }));

  sqlite.prepare(`INSERT INTO orders (
    id, order_number, cart_id, customer_id, email, status, currency,
    subtotal_cents, shipping_cents, tax_cents, total_cents,
    shipping_country_code, shipping_address_json, billing_address_json,
    terms_version, privacy_version, paid_at, created_at, updated_at
  ) VALUES (
    'order_pre_verification', 'AJ-PRE-VERIFY', NULL, NULL, ?,
    'pending_payment', 'EUR', 0, 0, 0, 0, 'FR', '{}', '{}',
    'terms-v1', 'privacy-v1', NULL, ?, ?
  )`).run(email, createdAt, createdAt);

  const verified = await store.verifyEmail(
    registration.emailDelivery.rawToken,
    "2026-08-27T01:06:00.000Z",
  );
  assert.ok(verified);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count
    FROM customer_account_challenges
    WHERE purpose = 'email_verification'
      AND consumed_at = '2026-08-27T01:06:00.000Z'
      AND revoked_at IS NULL`).get().count, 1);
  const immutableOrder = sqlite.prepare(
    "SELECT customer_id, updated_at FROM orders WHERE id = 'order_pre_verification'",
  ).get();
  assert.equal(immutableOrder.customer_id, null);
  assert.equal(immutableOrder.updated_at, createdAt);
  const account = await store.currentAccount(verified.token, "2026-08-27T01:07:00.000Z");
  assert.equal(account.email, email);
  assert.equal(account.acceptsMarketing, true);
  assert.equal(await store.authorizeMutation(
    verified.token,
    verified.csrfToken,
    "2026-08-27T01:08:00.000Z",
  ), true);

  assert.equal(await store.setMarketingPreference({
    rawSessionToken: verified.token,
    acceptsMarketing: false,
    privacyVersion: "2026-08-26",
    now: "2026-08-27T01:09:00.000Z",
  }), true);
  const consent = sqlite.prepare(
    "SELECT decision, source FROM customer_marketing_consents ORDER BY occurred_at DESC LIMIT 1",
  ).get();
  assert.equal(consent.decision, "withdrawn");
  assert.equal(consent.source, "account_settings");

  const reset = await store.requestPasswordReset({
    email,
    now: "2026-08-27T01:10:00.000Z",
  });
  assert.equal(reset.purpose, "password_reset");
  const newPassword = "Chrome-Lilas-2026!";
  const resetSession = await store.resetPassword({
    rawToken: reset.rawToken,
    password: newPassword,
    now: "2026-08-27T01:11:00.000Z",
  });
  assert.ok(resetSession);
  assert.equal(await store.login({
    email, password: originalPassword, now: "2026-08-27T01:12:00.000Z",
  }), null);
  assert.ok(await store.login({
    email, password: newPassword, now: "2026-08-27T01:13:00.000Z",
  }));
  assert.equal(
    sqlite.prepare(`SELECT COUNT(*) AS count
      FROM customer_sessions AS session
      INNER JOIN access_challenges AS challenge
        ON challenge.id = session.issued_by_challenge_id
      WHERE session.revoked_at IS NULL
        AND challenge.dispatched_at IS NOT NULL
        AND challenge.consumed_at IS NOT NULL`).get().count,
    2,
  );
});
