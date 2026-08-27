import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { D1DeliveryOptionsStore } from "../lib/commerce/d1-delivery-options-store.ts";
import { D1DeliveryReferenceStore } from "../lib/commerce/d1-delivery-reference-store.ts";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import { D1ProductionDeliveryActivationStore } from "../lib/commerce/d1-production-delivery-activation-store.ts";
import {
  DeliveryReferenceVault,
  DeliveryReferenceVaultError,
} from "../lib/commerce/delivery-reference-vault.ts";

const drizzle = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrations = readdirSync(drizzle)
  .filter((name) => /^(?:000[0-7]|0009|0010|0011|0012|0013)_.+\.sql$/.test(name))
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

test("AES key rotation opens retained versions while new records use only the active key", async () => {
  const previous = vault();
  const oldRecord = await previous.seal({
    providerCode: "sendcloud",
    referenceKind: "delivery_quote",
    ownerId: "option_before_rotation",
    rawReference: "sendcloud-option-before-rotation",
  });
  const nextKey = Buffer.alloc(32, 9).toString("base64");
  const rotated = new DeliveryReferenceVault({
    encryptionKeyBase64: nextKey,
    keyVersion: 2,
    decryptionKeysBase64: { "1": KEY_BASE64 },
  });
  assert.equal(await rotated.open(oldRecord), "sendcloud-option-before-rotation");
  const newRecord = await rotated.seal({
    providerCode: "sendcloud",
    referenceKind: "service_point",
    ownerId: "point_after_rotation",
    rawReference: "sendcloud-point-after-rotation",
  });
  assert.equal(newRecord.keyVersion, 2);
  assert.equal(await rotated.open(newRecord), "sendcloud-point-after-rotation");
  await assert.rejects(
    () => previous.open(newRecord),
    (error) => error instanceof DeliveryReferenceVaultError &&
      error.code === "AUTHENTICATION_FAILED",
  );
  const withoutHistory = new DeliveryReferenceVault({
    encryptionKeyBase64: nextKey,
    keyVersion: 2,
  });
  await assert.rejects(
    () => withoutHistory.open(oldRecord),
    (error) => error instanceof DeliveryReferenceVaultError &&
      error.code === "AUTHENTICATION_FAILED",
  );
  assert.throws(
    () => new DeliveryReferenceVault({
      encryptionKeyBase64: nextKey,
      keyVersion: 2,
      decryptionKeysBase64: { "2": KEY_BASE64 },
    }),
    (error) => error instanceof DeliveryReferenceVaultError &&
      error.code === "NOT_CONFIGURED",
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

test("production relay quotes and point snapshots are atomically replayable without raw references", async () => {
  const sqlite = database();
  const d1 = new D1(sqlite);
  const now = "2099-01-01T00:00:02.000Z";
  const expiresAt = "2099-01-01T00:15:02.000Z";
  const quoteReference = '["sendcloud-config","method-42","colissimo","point"]';
  const pointReference = "sendcloud-point-raw-987654";
  const commerce = new D1CommerceStore(d1);
  await commerce.seedLaunchCatalog("2099-01-01T00:00:00.000Z");
  sqlite.exec("UPDATE inventory SET reserves_validated=1");
  await commerce.createCart({
    id: "cart_production_relay",
    customerId: null,
    email: null,
    expiresAt: "2099-01-01T01:00:00.000Z",
    now: "2099-01-01T00:00:01.000Z",
  });
  sqlite.prepare(`INSERT INTO cart_lines (
    id,cart_id,variant_id,quantity,unit_price_cents,created_at,updated_at
  ) VALUES ('line_production_relay','cart_production_relay',?,1,2999,?,?)`)
    .run("variant_boxer_pourpre_m", now, now);
  sqlite.exec(`
    INSERT INTO shipping_zone_configurations (
      id,zone,version,status,created_at,updated_at
    ) VALUES ('config_production_relay','EU',1,'draft',
      '2099-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z');
    UPDATE shipping_zone_configurations SET status='active',
      service_code='sendcloud-reviewed',price_cents=700,
      estimated_days_min=2,estimated_days_max=4,duties_terms='EU_INCLUDED',
      parcel_code='AJL_ENVELOPE_1_ITEM_V1',parcel_weight_grams=150,
      parcel_length_mm=400,parcel_width_mm=320,parcel_height_mm=40,
      origin_country_code='FR',customs_hs_code='610711',
      activated_at='2099-01-01T00:00:01.000Z',
      updated_at='2099-01-01T00:00:01.000Z'
    WHERE id='config_production_relay';
  `);
  let quoteCalls = 0;
  let pointCalls = 0;
  const provider = {
    quotes: { async quote() {
      quoteCalls += 1;
      return [{
        providerCode: "sendcloud",
        providerQuoteReference: quoteReference,
        carrierCode: "colissimo",
        serviceCode: "relay-reviewed",
        displayName: "Point relais",
        deliveryMode: "service_point",
        amountCents: 875,
        currency: "EUR",
        estimatedDaysMin: 1,
        estimatedDaysMax: 3,
        dutiesTerms: "EU_INCLUDED",
        expiresAt,
        responseFingerprint: "b".repeat(64),
      }];
    } },
    servicePoints: { async servicePoints(request) {
      pointCalls += 1;
      assert.equal(request.providerQuoteReference, quoteReference);
      return [{
        providerPointReference: pointReference,
        displayName: "Maison de la Presse",
        postalCode: "75001",
        city: "Paris",
        countryCode: "FR",
        openingHoursSummary: "Lun-Sam 09:00-19:00",
      }];
    } },
    documents: { async document() { throw new Error("not-called"); } },
    returns: {},
  };
  const store = new D1ProductionDeliveryActivationStore(d1, provider, vault());
  const address = {
    recipient: "Ada Test",
    line1: "1 rue du Test",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
  };
  const options = await store.quoteOptions({
    cartId: "cart_production_relay",
    address,
    idempotencyKey: "quote-production-relay-0001",
    now,
  });
  assert.equal(options.length, 1);
  assert.equal(options[0].deliveryMode, "service_point");
  assert.equal(options[0].amountCents, 875);
  assert.equal(options[0].estimatedDaysMin, 1);
  assert.equal(options[0].estimatedDaysMax, 3);
  assert.equal("providerQuoteReference" in options[0], false);
  assert.equal(quoteCalls, 1);
  assert.deepEqual(await store.quoteOptions({
    cartId: "cart_production_relay",
    address,
    idempotencyKey: "quote-production-relay-0001",
    now,
  }), options);
  assert.equal(quoteCalls, 1);

  const points = await store.servicePoints({
    cartId: "cart_production_relay",
    optionId: options[0].optionId,
    address,
    idempotencyKey: "points-production-relay-0001",
    now,
  });
  assert.equal(points.length, 1);
  assert.equal(points[0].optionId, options[0].optionId);
  assert.equal("providerPointReference" in points[0], false);
  assert.equal("providerPointReferenceHash" in points[0], false);
  assert.equal(pointCalls, 1);
  assert.deepEqual(await store.servicePoints({
    cartId: "cart_production_relay",
    optionId: options[0].optionId,
    address,
    idempotencyKey: "points-production-relay-0001",
    now,
  }), points);
  assert.equal(pointCalls, 1);

  await assert.rejects(() => store.selectOption({
    cartId: "cart_production_relay",
    optionId: options[0].optionId,
    servicePointId: "point_foreign",
    address,
    now,
  }), (error) => error.code === "SERVICE_POINT_NOT_FOUND");
  const selected = await store.selectOption({
    cartId: "cart_production_relay",
    optionId: options[0].optionId,
    servicePointId: points[0].servicePointId,
    address,
    now,
  });
  assert.equal(selected.optionId, options[0].optionId);
  const addressFingerprint = sqlite.prepare(`SELECT shipping_address_fingerprint
    FROM delivery_option_snapshots WHERE id=?`).get(options[0].optionId)
    .shipping_address_fingerprint;
  const prepared = await new D1DeliveryOptionsStore(d1).prepareOrderSelection({
    cartId: "cart_production_relay",
    optionId: options[0].optionId,
    servicePointId: points[0].servicePointId,
    addressFingerprint,
    now: "2099-01-01T00:00:03.000Z",
  });
  await d1.batch([
    d1.prepare(`UPDATE shipping_quotes SET selected_at=?
      WHERE id=? AND cart_id=? AND selected_at IS NULL AND expires_at>?`)
      .bind("2099-01-01T00:00:03.000Z", options[0].quoteId,
        "cart_production_relay", "2099-01-01T00:00:03.000Z"),
    prepared.statement,
    d1.prepare(`INSERT INTO orders (
      id,order_number,cart_id,customer_id,email,status,currency,subtotal_cents,
      shipping_cents,tax_cents,total_cents,shipping_country_code,
      shipping_address_json,shipping_address_fingerprint,billing_address_json,
      shipping_quote_id,terms_version,privacy_version,paid_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,'pending_payment','EUR',0,875,0,875,'FR',?,?,?,?,
      '2026-08-15','2026-08-15',NULL,?,?)`).bind(
      "order_production_relay",
      "AJ-PRODUCTION-RELAY",
      "cart_production_relay",
      null,
      "ada@example.com",
      JSON.stringify(address),
      addressFingerprint,
      JSON.stringify(address),
      options[0].quoteId,
      "2099-01-01T00:00:03.000Z",
      "2099-01-01T00:00:03.000Z",
    ),
  ]);
  assert.equal(sqlite.prepare(
    "SELECT shipping_cents FROM orders WHERE id='order_production_relay'",
  ).get().shipping_cents, 875);
  assert.deepEqual(
    { ...sqlite.prepare(`SELECT selected_at, selected_service_point_id
      FROM delivery_option_snapshots WHERE id=?`).get(options[0].optionId) },
    {
      selected_at: "2099-01-01T00:00:03.000Z",
      selected_service_point_id: points[0].servicePointId,
    },
  );
  const persisted = JSON.stringify({
    quotes: sqlite.prepare("SELECT provider_quote_reference FROM shipping_quotes").all(),
    vault: sqlite.prepare("SELECT * FROM delivery_provider_reference_vault").all(),
    points: sqlite.prepare("SELECT * FROM delivery_service_point_snapshots").all(),
  });
  assert.doesNotMatch(persisted, /sendcloud-config|method-42|point-raw-987654/);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) count FROM delivery_provider_reference_vault",
  ).get().count, 2);
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

test("0011-0024 remain additive and the journal ends at the password runtime profile", () => {
  const previous = JSON.parse(readFileSync(`${drizzle}meta/0010_snapshot.json`, "utf8"));
  const snapshot = JSON.parse(readFileSync(`${drizzle}meta/0011_snapshot.json`, "utf8"));
  const pricingSnapshot = JSON.parse(readFileSync(`${drizzle}meta/0012_snapshot.json`, "utf8"));
  const orderPricingSnapshot = JSON.parse(readFileSync(`${drizzle}meta/0013_snapshot.json`, "utf8"));
  const refundSnapshot = JSON.parse(readFileSync(`${drizzle}meta/0014_snapshot.json`, "utf8"));
  const releaseSnapshot = JSON.parse(readFileSync(`${drizzle}meta/0015_snapshot.json`, "utf8"));
  const operationsSnapshot = JSON.parse(readFileSync(`${drizzle}meta/0016_snapshot.json`, "utf8"));
  const packPricingSnapshot = JSON.parse(readFileSync(`${drizzle}meta/0017_snapshot.json`, "utf8"));
  const resendSnapshot = JSON.parse(readFileSync(`${drizzle}meta/0018_snapshot.json`, "utf8"));
  const journal = JSON.parse(readFileSync(`${drizzle}meta/_journal.json`, "utf8"));
  assert.equal(snapshot.version, "6");
  assert.equal(snapshot.dialect, "sqlite");
  assert.equal(snapshot.prevId, previous.id);
  assert.notEqual(snapshot.id, previous.id);
  assert.equal(Object.keys(snapshot.tables).length, Object.keys(previous.tables).length + 1);
  assert.ok(snapshot.tables.delivery_provider_reference_vault);
  assert.equal(
    snapshot.tables.delivery_option_snapshots.columns.selected_service_point_id.notNull,
    false,
  );
  assert.deepEqual(
    Object.keys(snapshot.tables.delivery_provider_reference_vault.checkConstraints).sort(),
    [
      "ck_delivery_reference_algorithm",
      "ck_delivery_reference_ciphertext",
      "ck_delivery_reference_hash",
      "ck_delivery_reference_iv",
      "ck_delivery_reference_key_version",
      "ck_delivery_reference_kind",
      "ck_delivery_reference_timestamp",
    ],
  );
  assert.equal(pricingSnapshot.prevId, snapshot.id);
  assert.notEqual(pricingSnapshot.id, snapshot.id);
  assert.deepEqual(pricingSnapshot.tables, snapshot.tables);
  assert.equal(orderPricingSnapshot.prevId, pricingSnapshot.id);
  assert.notEqual(orderPricingSnapshot.id, pricingSnapshot.id);
  assert.deepEqual(orderPricingSnapshot.tables, pricingSnapshot.tables);
  assert.equal(refundSnapshot.prevId, orderPricingSnapshot.id);
  assert.notEqual(refundSnapshot.id, orderPricingSnapshot.id);
  assert.equal(Object.keys(refundSnapshot.tables).length, Object.keys(orderPricingSnapshot.tables).length + 1);
  assert.ok(refundSnapshot.tables.late_payment_refund_intents);
  assert.equal(releaseSnapshot.prevId, refundSnapshot.id);
  assert.notEqual(releaseSnapshot.id, refundSnapshot.id);
  assert.equal(Object.keys(releaseSnapshot.tables).length, Object.keys(refundSnapshot.tables).length + 4);
  assert.ok(releaseSnapshot.tables.production_runtime_schema_proofs);
  assert.ok(releaseSnapshot.tables.production_launch_stock_manifests);
  assert.ok(releaseSnapshot.tables.production_launch_stock_manifest_lines);
  assert.ok(releaseSnapshot.tables.production_release_attestations);
  assert.deepEqual(
    journal.entries.find((entry) => entry.tag === "0015_production_release_attestation"),
    {
      idx: 15,
      version: "6",
      when: 1786762000000,
      tag: "0015_production_release_attestation",
      breakpoints: true,
    },
  );
  assert.equal(operationsSnapshot.prevId, releaseSnapshot.id);
  assert.notEqual(operationsSnapshot.id, releaseSnapshot.id);
  assert.equal(
    Object.keys(operationsSnapshot.tables).length,
    Object.keys(releaseSnapshot.tables).length + 1,
  );
  assert.ok(operationsSnapshot.tables.commerce_operations_schema_installations);
  assert.equal(packPricingSnapshot.prevId, operationsSnapshot.id);
  assert.notEqual(packPricingSnapshot.id, operationsSnapshot.id);
  assert.equal(
    packPricingSnapshot.tables.orders.columns.discount_cents.notNull,
    true,
  );
  assert.equal(resendSnapshot.prevId, packPricingSnapshot.id);
  assert.notEqual(resendSnapshot.id, packPricingSnapshot.id);
  assert.equal(
    Object.keys(resendSnapshot.tables).length,
    Object.keys(packPricingSnapshot.tables).length + 1,
  );
  assert.ok(resendSnapshot.tables.resend_webhook_events);
  assert.equal(
    resendSnapshot.tables.email_outbox.columns.provider_message_id.notNull,
    false,
  );
  assert.deepEqual(journal.entries.at(-1), {
    idx: 24,
    version: "6",
    when: 1788048000000,
    tag: "0024_customer_password_runtime_profile",
    breakpoints: true,
  });
});

test("0013 accepts only an exact selected provider quote with encrypted replay proof", () => {
  const migration = readFileSync(`${drizzle}0013_provider_priced_delivery_orders.sql`, "utf8");
  assert.match(migration, /provider_receipt_fingerprint` IS NULL[\s\S]+configuration\.`price_cents` = NEW\.`shipping_cents/);
  assert.match(migration, /provider_receipt_fingerprint` IS NOT NULL/);
  assert.match(migration, /provider_quote_reference` IS NULL/);
  assert.match(migration, /delivery_provider_reference_vault/);
  assert.match(migration, /option\.`selected_at` = quote\.`selected_at`/);
  assert.match(migration, /trg_orders_provider_pricing_contract/);
  assert.doesNotMatch(migration, /700|900|1200|fixture/i);
});

test("0012 accepts provider price/ETA while retaining legacy and no-raw-reference guards", () => {
  const migration = readFileSync(`${drizzle}0012_provider_priced_delivery_quotes.sql`, "utf8");
  assert.match(migration, /provider_receipt_fingerprint` IS NOT NULL/);
  assert.match(migration, /provider_quote_reference` IS NULL/);
  assert.match(migration, /provider_receipt_fingerprint` IS NULL[\s\S]+amount_cents` = configuration\.`price_cents/);
  assert.match(migration, /trg_shipping_quote_provider_pricing_contract/);
  assert.match(migration, /delivery_provider_raw_reference_forbidden/);
  assert.doesNotMatch(migration, /700|900|1200|fixture|synthetic_demo/i);
});
