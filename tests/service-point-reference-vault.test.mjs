import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { D1DeliveryOptionsStore } from "../lib/commerce/d1-delivery-options-store.ts";
import { D1DeliveryReferenceStore } from "../lib/commerce/d1-delivery-reference-store.ts";
import {
  DeliveryReferenceVault,
  DeliveryReferenceVaultError,
} from "../lib/commerce/delivery-reference-vault.ts";

const drizzle = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrations = readdirSync(drizzle)
  .filter((name) => /^(?:000[0-7]|0009|0010|0011)_.+\.sql$/.test(name))
  .sort();
const KEY_BASE64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const HASH = "a".repeat(64);

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
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

class D1 {
  constructor(database) { this.database = database; }
  prepare(query) { return new Statement(this.database, query); }
  async batch(statements) {
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

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const name of migrations) {
    const sql = readFileSync(`${drizzle}${name}`, "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  return sqlite;
}

function vault() {
  return new DeliveryReferenceVault({
    encryptionKeyBase64: KEY_BASE64,
    keyVersion: "1",
  });
}

test("AES-256-GCM seals provider references with random IV and authenticated owner context", async () => {
  const referenceVault = vault();
  const rawReference = '["configuration","method","carrier","service"]';
  const input = {
    providerCode: "sendcloud",
    referenceKind: "delivery_quote",
    ownerId: "option_crypto_proof",
    rawReference,
  };
  const first = await referenceVault.seal(input);
  const second = await referenceVault.seal(input);

  assert.equal(await referenceVault.open(first), rawReference);
  assert.equal(first.referenceSha256, second.referenceSha256);
  assert.notEqual(first.ivBase64, second.ivBase64);
  assert.notEqual(first.ciphertextBase64, second.ciphertextBase64);
  assert.doesNotMatch(JSON.stringify(first), /configuration|method|carrier|service/);

  await assert.rejects(
    () => referenceVault.open({ ...first, ownerId: "option_other" }),
    (error) => error instanceof DeliveryReferenceVaultError &&
      error.code === "AUTHENTICATION_FAILED" && !error.message.includes(rawReference),
  );
  await assert.rejects(
    () => referenceVault.open({
      ...first,
      ciphertextBase64: `${first.ciphertextBase64[0] === "A" ? "B" : "A"}${first.ciphertextBase64.slice(1)}`,
    }),
    (error) => error instanceof DeliveryReferenceVaultError &&
      error.code === "AUTHENTICATION_FAILED",
  );
  assert.throws(
    () => new DeliveryReferenceVault({ encryptionKeyBase64: "too-short", keyVersion: 1 }),
    (error) => error instanceof DeliveryReferenceVaultError && error.code === "NOT_CONFIGURED",
  );
});

test("0011 persists only ciphertext and binds an exact service point to the order atomically", async () => {
  const sqlite = database();
  const d1 = new D1(sqlite);
  const referenceVault = vault();
  const references = new D1DeliveryReferenceStore(d1, referenceVault);
  const options = new D1DeliveryOptionsStore(d1);
  const now = new Date(Date.now() + 60_000).toISOString();
  const activatedAt = new Date(Date.parse(now) + 1).toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const cartExpiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const addressFingerprint = "1".repeat(64);
  const quoteReference = '["config-1","method-1","postnl","point"]';
  const pointReference = "sendcloud-point-987654";
  const sealedQuote = await referenceVault.seal({
    providerCode: "sendcloud",
    referenceKind: "delivery_quote",
    ownerId: "option_service_point_1",
    rawReference: quoteReference,
  });
  const sealedPoint = await referenceVault.seal({
    providerCode: "sendcloud",
    referenceKind: "service_point",
    ownerId: "point_service_point_1",
    rawReference: pointReference,
  });

  sqlite.exec(`
    INSERT INTO carts (id,status,currency,expires_at,created_at,updated_at)
    VALUES ('cart_service_point_1','open','EUR','${cartExpiresAt}','${now}','${now}');
    INSERT INTO shipping_zone_configurations (
      id,zone,version,status,service_code,price_cents,currency,
      estimated_days_min,estimated_days_max,duties_terms,parcel_code,
      parcel_weight_grams,parcel_length_mm,parcel_width_mm,parcel_height_mm,
      origin_country_code,activated_at,created_at,updated_at
    ) VALUES (
      'config_service_point_1','EU',1,'draft','sendcloud-point',700,'EUR',
      2,4,'EU_INCLUDED','AJL_ENVELOPE_1_ITEM_V1',150,400,320,40,'FR',
      NULL,'${now}','${now}'
    );
    UPDATE shipping_zone_configurations
    SET status='active',customs_hs_code='610711',activated_at='${activatedAt}',
      updated_at='${activatedAt}'
    WHERE id='config_service_point_1';
    INSERT INTO shipping_quotes (
      id,cart_id,cart_fingerprint,cart_revision,configuration_id,
      shipping_address_json,shipping_address_fingerprint,
      provider_quote_reference,provider_receipt_fingerprint,amount_cents,
      currency,estimated_days_min,estimated_days_max,duties_terms,
      expires_at,selected_at,created_at
    ) VALUES (
      'quote_service_point_1','cart_service_point_1','${HASH}',0,
      'config_service_point_1','{"countryCode":"FR","postalCode":"75001","regionCode":null}',
      '${addressFingerprint}',NULL,'${HASH}',700,'EUR',2,4,'EU_INCLUDED',
      '${expiresAt}',NULL,'${now}'
    );
    INSERT INTO delivery_option_snapshots (
      id,cart_id,cart_revision,shipping_quote_id,shipping_address_fingerprint,
      provider_code,carrier_code,service_code,display_name,delivery_mode,
      amount_cents,currency,estimated_days_min,estimated_days_max,duties_terms,
      proof_kind,provider_quote_reference_hash,provider_receipt_fingerprint,
      quoted_at,expires_at,selected_at,created_at
    ) VALUES (
      'option_service_point_1','cart_service_point_1',0,'quote_service_point_1',
      '${addressFingerprint}','sendcloud','postnl','point','Point partenaire',
      'service_point',700,'EUR',2,4,'EU_INCLUDED','provider_api_response',
      '${sealedQuote.referenceSha256}','${HASH}','${now}','${expiresAt}',NULL,'${now}'
    );
    INSERT INTO delivery_service_point_snapshots (
      id,delivery_option_id,provider_point_reference_hash,display_name,
      postal_code,city,country_code,opening_hours_summary,expires_at,created_at
    ) VALUES (
      'point_service_point_1','option_service_point_1','${sealedPoint.referenceSha256}',
      'Point partenaire','75001','Paris','FR',NULL,'${expiresAt}','${now}'
    );
  `);

  await references.put(sealedQuote, now);
  await references.put(sealedPoint, now);
  assert.equal(await references.open("delivery_quote", "option_service_point_1"), quoteReference);
  assert.equal(await references.open("service_point", "point_service_point_1"), pointReference);
  const persisted = JSON.stringify(sqlite.prepare(
    "SELECT * FROM delivery_provider_reference_vault ORDER BY reference_kind",
  ).all());
  assert.doesNotMatch(persisted, /config-1|method-1|postnl|987654/);

  const prepared = await options.prepareOrderSelection({
    optionId: "option_service_point_1",
    cartId: "cart_service_point_1",
    addressFingerprint,
    servicePointId: "point_service_point_1",
    now,
  });
  await d1.batch([
    d1.prepare(`UPDATE shipping_quotes SET selected_at=?
      WHERE id=? AND cart_id=? AND selected_at IS NULL AND expires_at>?`)
      .bind(now, "quote_service_point_1", "cart_service_point_1", now),
    prepared.statement,
    d1.prepare(`INSERT INTO orders (
      id,order_number,cart_id,customer_id,email,status,currency,subtotal_cents,
      shipping_cents,tax_cents,total_cents,shipping_country_code,
      shipping_address_json,shipping_address_fingerprint,billing_address_json,
      shipping_quote_id,terms_version,privacy_version,paid_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,'pending_payment','EUR',0,700,0,700,'FR',?,?,?,?,
      'terms-v1','privacy-v1',NULL,?,?)`).bind(
      "order_service_point_1",
      "AJ-SERVICE-POINT-1",
      "cart_service_point_1",
      null,
      "buyer@example.com",
      JSON.stringify({
        recipient: "Client Test",
        line1: "1 rue de Test",
        postalCode: "75001",
        city: "Paris",
        countryCode: "FR",
      }),
      addressFingerprint,
      "{}",
      "quote_service_point_1",
      now,
      now,
    ),
  ]);
  assert.deepEqual(
    { ...sqlite.prepare(`SELECT selected_at,selected_service_point_id
      FROM delivery_option_snapshots WHERE id='option_service_point_1'`).get() },
    { selected_at: now, selected_service_point_id: "point_service_point_1" },
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM orders").get().count, 1);
  assert.throws(
    () => sqlite.exec("DELETE FROM delivery_provider_reference_vault"),
    /delivery_provider_reference_retain/,
  );
  sqlite.close();
});

test("0011 fails closed for a missing, foreign, expired or unsealed service point", async () => {
  const migration = readFileSync(`${drizzle}0011_service_point_reference_vault.sql`, "utf8");
  assert.match(migration, /AES-256-GCM/);
  assert.match(migration, /selected_service_point_id/);
  assert.match(migration, /point\.`delivery_option_id` = NEW\.`id`/);
  assert.match(migration, /point\.`expires_at` > NEW\.`selected_at`/);
  assert.match(migration, /sealed_point\.`reference_sha256` = point\.`provider_point_reference_hash`/);
  assert.match(migration, /quote\.`selected_at` = option\.`selected_at`/);
  assert.doesNotMatch(migration, /provider_reference` text|raw_reference|api[_-]?key|secret[_-]?key/i);
});
