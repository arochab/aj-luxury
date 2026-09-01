import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  accessTokenHashContexts,
  createOpaqueAccessToken,
} from "../lib/commerce/account-security.ts";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import { D1DataRightsStore } from "../lib/commerce/data-rights.ts";
import { D1FulfillmentStore } from "../lib/commerce/d1-fulfillment-store.ts";
import { D1IdentityAccessStore } from "../lib/commerce/identity-access-store.ts";
import {
  FulfillmentProviderError,
  normalizeShippingAddress,
} from "../lib/commerce/fulfillment-domain.ts";
import { resolveClientValidatedParcelProfile } from "../lib/commerce/parcel-profiles.ts";
import { assertVerifiedCarrierEvent } from "../lib/commerce/verified-carrier-event.ts";
import {
  createVerifiedSendcloudTrackingPort,
  sendcloudTrackingCandidate,
  verifySendcloudTrackingWebhook,
} from "../lib/commerce/sendcloud-tracking-webhook.ts";
import { verifyTestCarrierEvent } from "./support/test-carrier-event.ts";
import { verifyTestPaymentEvent } from "./support/test-payment-event.ts";
import { productionCommerceApiResponse } from "../worker/production-commerce-api.ts";

const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrations = readdirSync(drizzleDirectory)
  .filter((name) => /^(?:000(?:[0-5]|9)|001[67]|002[89]|003[01])_.+\.sql$/.test(name))
  .sort()
  .map((name) => `${drizzleDirectory}${name}`);
const liveClockBase = Date.now();
const liveIso = (offsetMilliseconds = 0) =>
  new Date(liveClockBase + offsetMilliseconds).toISOString();

class SQLiteD1Statement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }
  bind(...values) { return new SQLiteD1Statement(this.database, this.query, values); }
  async first() { return this.database.prepare(this.query).get(...this.values) ?? null; }
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
  async executeForBatch() {
    return /^\s*(?:SELECT|PRAGMA|WITH\b)/i.test(this.query)
      ? this.all()
      : this.run();
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

function interleaveBeforeQuoteSelection(database, mutation) {
  let armed = true;
  return {
    prepare(query) {
      const statement = database.prepare(query);
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          if (!/UPDATE shipping_quotes SET selected_at/.test(query)) return bound;
          return {
            first: () => bound.first(),
            all: () => bound.all(),
            async run() {
              if (armed) {
                armed = false;
                mutation();
              }
              return bound.run();
            },
          };
        },
      };
    },
    batch(statements) { return database.batch(statements); },
  };
}

function applyMigrations(database) {
  for (const path of migrations) {
    for (const statement of readFileSync(path, "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement.trim());
    }
  }
  // This focused store suite deliberately installs only the fulfillment-era
  // schema. Mirror the current order-state guard so label creation is exercised
  // against the production paid -> preparing contract as well.
  database.exec(`DROP TRIGGER trg_orders_guard_payment_state;
    CREATE TRIGGER trg_orders_guard_payment_state
    BEFORE UPDATE OF status ON orders
    WHEN OLD.status <> NEW.status AND NOT (
      (OLD.status='pending_payment' AND NEW.status='paid')
      OR (OLD.status='pending_payment' AND NEW.status='cancelled'
        AND NOT EXISTS (SELECT 1 FROM payments WHERE order_id=OLD.id AND status IN ('succeeded','refunded'))
        AND NOT EXISTS (SELECT 1 FROM stock_reservations WHERE cart_id=OLD.cart_id AND status IN ('active','converted')))
      OR (OLD.status='paid' AND NEW.status='preparing'
        AND EXISTS (SELECT 1 FROM shipments WHERE order_id=OLD.id AND status='label_ready'))
      OR (OLD.status='preparing' AND NEW.status='shipped'
        AND EXISTS (SELECT 1 FROM shipments WHERE order_id=OLD.id AND status IN ('handed_over','in_transit','delivered')))
    )
    BEGIN SELECT RAISE(ABORT,'commerce_invalid_order_transition'); END;`);
}

function parcelProfileForCart(context, cartId) {
  const lines = context.database.prepare(
    "SELECT quantity FROM cart_lines WHERE cart_id=? ORDER BY id",
  ).all(cartId);
  const profile = resolveClientValidatedParcelProfile(lines);
  assert.ok(profile, `cart ${cartId} must have a validated parcel profile`);
  return profile;
}

function fixture(ports = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  applyMigrations(database);
  const d1 = new SQLiteD1Database(database);
  const background = [];
  const deliveries = [];
  let clock = "2026-08-11T12:00:00.000Z";
  let monotonic = 0;
  const identity = new D1IdentityAccessStore(d1, {
    delivery: {
      async deliver(message) {
        deliveries.push(message);
        return { idempotencyKey: message.idempotencyKey, providerMessageId: `email_${deliveries.length}`, acceptedAt: clock };
      },
    },
    rateLimit: { async take() { return true; } },
    externalMfa: { async verify() { return null; } },
    background: { defer(task) { background.push(task); } },
    timing: {
      monotonicMilliseconds() { return monotonic; },
      async wait(milliseconds) { monotonic += milliseconds; },
    },
    utcClock: { now() { return clock; } },
  });
  return {
    database,
    d1,
    commerce: new D1CommerceStore(d1),
    fulfillment: new D1FulfillmentStore(d1, ports),
    identity,
    deliveries,
    setClock(value) { clock = value; },
    async flushBackground() {
      while (background.length > 0) await background.shift()();
    },
  };
}

async function rejectsCode(operation, code) {
  await assert.rejects(operation, (error) => error?.code === code);
}

async function addressFingerprint(value) {
  return (await normalizeShippingAddress(value)).fingerprint;
}

function activateConfiguration(context, zone, suffix, priceCents = 1200) {
  const createdAt = "2026-08-11T12:00:00.000Z";
  const activatedAt = "2026-08-11T12:00:01.000Z";
  const id = `config_${zone.toLowerCase()}_${suffix}`;
  context.database.prepare(`INSERT INTO shipping_zone_configurations (
    id, zone, version, status, created_at, updated_at
  ) VALUES (?, ?, 1, 'draft', ?, ?)`).run(id, zone, createdAt, createdAt);
  context.database.prepare(`UPDATE shipping_zone_configurations SET
    status='active', service_code=?, price_cents=?, estimated_days_min=2,
    estimated_days_max=5, duties_terms=?, parcel_code='boxer_standard',
    parcel_weight_grams=250, parcel_length_mm=240, parcel_width_mm=180,
    parcel_height_mm=40, origin_country_code='FR', customs_hs_code='610711',
    activated_at=?, updated_at=? WHERE id=?`).run(
    `service_${suffix}`,
    priceCents,
    zone === "EU" ? "EU_INCLUDED" : "DAP",
    activatedAt,
    activatedAt,
    id,
  );
  return id;
}

function address(zone) {
  if (zone === "US") {
    return {
      recipient: "Ada Test",
      line1: "1 Fifth Avenue",
      postalCode: "10001",
      city: "New York",
      regionCode: "NY",
      countryCode: "US",
      phone: "+12025550123",
    };
  }
  return {
    recipient: "Ada Test",
    line1: "1 rue du Test",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
  };
}

async function seed(context) {
  if (context.database.prepare("SELECT COUNT(*) AS count FROM products").get().count === 0) {
    await context.commerce.seedLaunchCatalog("2026-08-11T12:00:00.000Z");
    context.database.exec("UPDATE inventory SET reserves_validated=1");
  }
}

async function createCartWithLines(context, suffix, lines, options = {}) {
  await seed(context);
  const now = options.now ?? "2026-08-11T12:00:10.000Z";
  const cartId = `cart_${suffix}`;
  await context.commerce.createCart({
    id: cartId,
    customerId: options.customerId ?? null,
    email: `${suffix}@example.com`,
    expiresAt: options.cartExpiresAt ?? "2099-01-01T00:00:00.000Z",
    now,
  });
  const statement = context.database.prepare(`INSERT INTO cart_lines (
    id, cart_id, variant_id, quantity, unit_price_cents, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 2999, ?, ?)`);
  lines.forEach((line, index) => statement.run(
    `${cartId}_line_${index}`,
    cartId,
    line.variantId,
    line.quantity,
    now,
    now,
  ));
  return cartId;
}

async function createPaidOrder(context, {
  suffix,
  zone,
  lines,
  customerId = null,
  pay = true,
  quoteTimes = {},
  reservationNow = "2026-08-11T12:00:20.000Z",
  reservationExpiresAt = "2026-08-11T13:00:00.000Z",
  paymentOccurredAt = "2026-08-11T12:10:00.000Z",
  paymentVerifiedAt = "2026-08-11T12:10:01.000Z",
}) {
  const cartId = await createCartWithLines(context, suffix, lines, { customerId });
  await Promise.all(lines.map((line, index) => context.commerce.reserveStock({
    reservationId: `reservation_${suffix}_${index}`,
    cartId,
    variantId: line.variantId,
    quantity: line.quantity,
    idempotencyKey: `reserve_${suffix}_${index}`,
    expiresAt: reservationExpiresAt,
    now: reservationNow,
  })));
  const shippingAddress = address(zone);
  const quoteNow = quoteTimes.createdAt ?? liveIso(-60_000);
  const quoteSelectedAt = quoteTimes.selectedAt ?? liveIso();
  const quoteExpiresAt = quoteTimes.expiresAt ?? liveIso(20 * 60_000);
  const quote = await context.fulfillment.createShippingQuote({
    id: `quote_${suffix}`,
    cartId,
    address: shippingAddress,
    parcelProfile: parcelProfileForCart(context, cartId),
    expiresAt: quoteExpiresAt,
    now: quoteNow,
  });
  const selectedQuote = await context.fulfillment.selectShippingQuote({
    quoteId: quote.id,
    cartId,
    address: shippingAddress,
    addressFingerprint: await addressFingerprint(shippingAddress),
    now: quoteSelectedAt,
  });
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * 2999, 0);
  const total = subtotal + quote.amount_cents;
  const orderId = `order_${suffix}`;
  context.database.prepare(`INSERT INTO orders (
    id, order_number, cart_id, customer_id, email, status, currency, subtotal_cents,
    shipping_cents, tax_cents, total_cents, shipping_country_code,
    shipping_address_json, shipping_address_fingerprint, billing_address_json,
    shipping_quote_id, terms_version, privacy_version, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, 'pending_payment', 'EUR', ?, ?, 0, ?, ?, ?, ?, ?, ?,
    'terms-v1', 'privacy-v1', ?, ?)`).run(
    orderId,
    `AJ-${suffix.toUpperCase()}`,
    cartId,
    customerId,
    `${suffix}@example.com`,
    subtotal,
    quote.amount_cents,
    total,
    shippingAddress.countryCode,
    quote.shipping_address_json,
    quote.shipping_address_fingerprint,
    quote.shipping_address_json,
    quote.id,
    "2026-08-11T12:02:00.000Z",
    "2026-08-11T12:02:00.000Z",
  );
  const snapshot = context.database.prepare(`SELECT variant.internal_reference,
    variant.color_name, variant.size, product.name AS product_name
    FROM variants AS variant INNER JOIN products AS product
      ON product.id=variant.product_id WHERE variant.id=?`);
  const insertLine = context.database.prepare(`INSERT INTO order_lines (
    id, order_id, variant_id, internal_reference, product_name, color_name,
    size, quantity, unit_price_cents, line_total_cents, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2999, ?, ?)`);
  lines.forEach((line, index) => {
    const value = snapshot.get(line.variantId);
    insertLine.run(
      `${orderId}_line_${index}`,
      orderId,
      line.variantId,
      value.internal_reference,
      value.product_name,
      value.color_name,
      value.size,
      line.quantity,
      line.quantity * 2999,
      "2026-08-11T12:02:00.000Z",
    );
  });
  if (pay) {
    const event = await verifyTestPaymentEvent({
      providerEventId: `event_${suffix}`,
      providerPaymentId: `pay_${suffix}`,
      orderId,
      amountCents: total,
      currency: "EUR",
      occurredAt: paymentOccurredAt,
      verifiedAt: paymentVerifiedAt,
    });
    await context.commerce.processPaymentSucceeded(event);
  }
  return {
    cartId,
    orderId,
    orderNumber: `AJ-${suffix.toUpperCase()}`,
    paymentId: pay ? `payment_test_pay_${suffix}` : null,
    quote: selectedQuote,
    total,
    orderLineIds: lines.map((_, index) => `${orderId}_line_${index}`),
  };
}

async function createAdminActor(context, { role = "owner", suffix = "d03" } = {}) {
  const [session, csrf] = await Promise.all([
    createOpaqueAccessToken(accessTokenHashContexts.adminSession),
    createOpaqueAccessToken(accessTokenHashContexts.adminCsrf),
  ]);
  const now = "2026-08-11T12:10:00.000Z";
  const administratorId = `admin_${suffix}`;
  const sessionId = `admin_session_${suffix}`;
  const alternate = suffix === "d03" ? "a" : "c";
  const evidence = suffix === "d03" ? "b" : "d";
  context.database.prepare(`INSERT INTO administrators (
    id, external_subject_hash, role, enabled, authz_version, created_at, updated_at
  ) VALUES (?, ?, ?, 1, 1, ?, ?)`).run(
    administratorId,
    alternate.repeat(64),
    role,
    now,
    now,
  );
  context.database.prepare(`INSERT INTO admin_sessions (
    id, administrator_id, token_hash, csrf_token_hash, evidence_hash,
    authz_version, aal, external_authenticated_at, expires_at, idle_expires_at,
    created_at
  ) VALUES (?, ?, ?, ?, ?, 1, 2, ?, ?, ?, ?)`).run(
    sessionId,
    administratorId,
    session.tokenHash,
    csrf.tokenHash,
    evidence.repeat(64),
    now,
    "2026-08-11T20:10:00.000Z",
    "2026-08-11T12:25:00.000Z",
    now,
  );
  return { kind: "admin", sessionToken: session.token, csrfToken: csrf.token };
}

async function createGuestActor(context, order) {
  context.setClock("2026-08-11T12:16:00.000Z");
  await context.identity.requestGuestOrderAccess({
    email: order.orderId.replace("order_", "") + "@example.com",
    orderNumber: order.orderNumber,
    challengeId: `challenge_${order.orderId}`,
    now: "2026-08-11T12:16:00.000Z",
  });
  await context.flushBackground();
  const delivery = context.deliveries.at(-1);
  assert.ok(delivery);
  const session = await context.identity.consumeGuestOrderChallenge({
    rawChallengeToken: delivery.rawToken,
    sessionId: `guest_session_${order.orderId}`,
    now: "2026-08-11T12:16:30.000Z",
  });
  assert.ok(session);
  return {
    kind: "guest-order",
    sessionToken: session.token,
    csrfToken: session.csrfToken,
  };
}

test("D1 configurations and quotes fail closed, freeze selected carts and replay safely", async () => {
  const context = fixture();
  const quoteNow = liveIso(-60_000);
  const quoteSelectedAt = liveIso();
  const quoteExpiresAt = liveIso(20 * 60_000);
  const cartId = await createCartWithLines(context, "quote", [
    { variantId: "variant_boxer_pourpre_s", quantity: 1 },
  ]);
  await rejectsCode(() => context.fulfillment.createShippingQuote({
    id: "quote_without_config",
    cartId,
    address: address("EU"),
    parcelProfile: parcelProfileForCart(context, cartId),
    expiresAt: quoteExpiresAt,
    now: quoteNow,
  }), "CONFIGURATION_UNAVAILABLE");

  context.database.prepare(`INSERT INTO shipping_zone_configurations (
    id, zone, version, status, created_at, updated_at
  ) VALUES ('config_incomplete', 'EU', 9, 'draft', ?, ?)`).run(
    "2026-08-11T12:00:00.000Z",
    "2026-08-11T12:00:00.000Z",
  );
  assert.throws(() => context.database.prepare(`UPDATE shipping_zone_configurations
    SET status='active', activated_at=?, updated_at=? WHERE id='config_incomplete'`).run(
    "2026-08-11T12:00:01.000Z",
    "2026-08-11T12:00:01.000Z",
  ), /fulfillment_configuration_incomplete/);
  context.database.prepare(`INSERT INTO shipping_zone_configurations (
    id, zone, version, status, created_at, updated_at
  ) VALUES ('config_ddp', 'US', 10, 'draft', ?, ?)`).run(
    "2026-08-11T12:00:00.000Z",
    "2026-08-11T12:00:00.000Z",
  );
  assert.throws(() => context.database.prepare(`UPDATE shipping_zone_configurations SET
    status='active', service_code='service_ddp', price_cents=1200,
    estimated_days_min=2, estimated_days_max=5, duties_terms='DDP',
    parcel_code='boxer_standard', parcel_weight_grams=250,
    parcel_length_mm=240, parcel_width_mm=180, parcel_height_mm=40,
    origin_country_code='FR', customs_hs_code='610711', activated_at=?, updated_at=?
    WHERE id='config_ddp'`).run(
    "2026-08-11T12:00:01.000Z",
    "2026-08-11T12:00:01.000Z",
  ), /fulfillment_configuration_ddp_unavailable/);
  activateConfiguration(context, "EU", "quote");
  const cartRevision = context.database.prepare(
    "SELECT fulfillment_revision FROM carts WHERE id=?",
  ).get(cartId).fulfillment_revision;

  const excluded = JSON.stringify({
    recipient: "Ada Test", company: null, line1: "1 rue Test", line2: null,
    postalCode: "97100", city: "Basse-Terre", regionCode: null, countryCode: "FR",
  });
  assert.throws(() => context.database.prepare(`INSERT INTO shipping_quotes (
    id, cart_id, cart_fingerprint, cart_revision, configuration_id, shipping_address_json,
    shipping_address_fingerprint, amount_cents, currency, estimated_days_min,
    estimated_days_max, duties_terms, expires_at, created_at
  ) VALUES ('quote_raw_excluded', ?, ?, ?, 'config_eu_quote', ?, ?, 1200, 'EUR',
    2, 5, 'EU_INCLUDED', ?, ?)`).run(
    cartId,
    "c".repeat(64),
    cartRevision,
    excluded,
    "d".repeat(64),
    quoteExpiresAt,
    quoteNow,
  ), /fulfillment_destination_unavailable/);

  const matrixConfigurations = {
    EU: "config_eu_quote",
    UK: activateConfiguration(context, "UK", "quote_matrix"),
    US: activateConfiguration(context, "US", "quote_matrix"),
    CA: activateConfiguration(context, "CA", "quote_matrix"),
  };
  const insertRawQuote = (id, zone, rawAddress) => context.database.prepare(`INSERT INTO shipping_quotes (
    id, cart_id, cart_fingerprint, cart_revision, configuration_id, shipping_address_json,
    shipping_address_fingerprint, amount_cents, currency, estimated_days_min,
    estimated_days_max, duties_terms, expires_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 1200, 'EUR', 2, 5, ?, ?, ?)`).run(
    id,
    cartId,
    "a".repeat(64),
    cartRevision,
    matrixConfigurations[zone],
    JSON.stringify({
      recipient: "Ada Test", company: null, line1: "1 Test", line2: null,
      city: "Test", ...rawAddress,
    }),
    "b".repeat(64),
    zone === "EU" ? "EU_INCLUDED" : "DAP",
    quoteExpiresAt,
    quoteNow,
  );
  const excludedMatrix = [
    ["FR", "EU", { countryCode: "FR", postalCode: "97100", regionCode: null }],
    ["GB", "UK", { countryCode: "GB", postalCode: "JE2 3AA", regionCode: null }],
    ["US", "US", { countryCode: "US", postalCode: "00901", regionCode: "PR" }],
    ["GR", "EU", { countryCode: "GR", postalCode: "63086", regionCode: null }],
    ["ES", "EU", { countryCode: "ES", postalCode: "35001", regionCode: null }],
    ["PT", "EU", { countryCode: "PT", postalCode: "9000-001", regionCode: null }],
    ["FI", "EU", { countryCode: "FI", postalCode: "22100", regionCode: null }],
    ["DE", "EU", { countryCode: "DE", postalCode: "27498", regionCode: null }],
    ["IT", "EU", { countryCode: "IT", postalCode: "22061", regionCode: null }],
  ];
  for (const [country, zone, rawAddress] of excludedMatrix) {
    assert.throws(
      () => insertRawQuote(`quote_excluded_${country}`, zone, rawAddress),
      /fulfillment_destination_unavailable/,
    );
  }
  const allowedMatrix = [
    ["EU", { countryCode: "FR", postalCode: "75001", regionCode: null }],
    ["UK", { countryCode: "GB", postalCode: "SW1A 1AA", regionCode: null }],
    ["US", { countryCode: "US", postalCode: "10001", regionCode: "NY" }],
    ["CA", { countryCode: "CA", postalCode: "H2Y 1C6", regionCode: "QC" }],
  ];
  for (const [zone, rawAddress] of allowedMatrix) {
    assert.equal(insertRawQuote(`quote_allowed_${zone}`, zone, rawAddress).changes, 1);
  }

  const equalityCart = await createCartWithLines(context, "equality", [
    { variantId: "variant_boxer_pourpre_m", quantity: 1 },
  ]);
  const equalityQuote = await context.fulfillment.createShippingQuote({
    id: "quote_expiry_equality",
    cartId: equalityCart,
    address: address("EU"),
    parcelProfile: parcelProfileForCart(context, equalityCart),
    expiresAt: quoteExpiresAt,
    now: quoteNow,
  });
  assert.throws(() => context.database.prepare(
    "UPDATE shipping_quotes SET selected_at=expires_at WHERE id=?",
  ).run(equalityQuote.id), /fulfillment_quote_expired/);

  const casCart = await createCartWithLines(context, "cas", [
    { variantId: "variant_boxer_pourpre_xl", quantity: 1 },
  ]);
  const casQuote = await context.fulfillment.createShippingQuote({
    id: "quote_cas_exact",
    cartId: casCart,
    address: address("EU"),
    parcelProfile: parcelProfileForCart(context, casCart),
    expiresAt: quoteExpiresAt,
    now: quoteNow,
  });
  const casResults = await Promise.all([
    context.fulfillment.selectShippingQuote({
      quoteId: casQuote.id, cartId: casCart, address: address("EU"),
      addressFingerprint: await addressFingerprint(address("EU")),
      now: quoteSelectedAt,
    }),
    context.fulfillment.selectShippingQuote({
      quoteId: casQuote.id, cartId: casCart, address: address("EU"),
      addressFingerprint: await addressFingerprint(address("EU")),
      now: quoteSelectedAt,
    }),
  ]);
  assert.ok(casResults.every((value) => value.selected_at === quoteSelectedAt));

  const changedBeforeSelectionCart = await createCartWithLines(context, "changed_before_selection", [
    { variantId: "variant_boxer_rose-pale_m", quantity: 1 },
  ]);
  const changedBeforeSelectionQuote = await context.fulfillment.createShippingQuote({
    id: "quote_changed_before_selection",
    cartId: changedBeforeSelectionCart,
    address: address("EU"),
    parcelProfile: parcelProfileForCart(context, changedBeforeSelectionCart),
    expiresAt: quoteExpiresAt,
    now: quoteNow,
  });
  context.database.prepare(`UPDATE cart_lines SET quantity=2, updated_at=?
    WHERE cart_id=?`).run(
    "2026-08-11T12:00:11.000Z",
    changedBeforeSelectionCart,
  );
  await rejectsCode(() => context.fulfillment.selectShippingQuote({
    quoteId: changedBeforeSelectionQuote.id,
    cartId: changedBeforeSelectionCart,
    address: address("EU"),
    addressFingerprint: changedBeforeSelectionQuote.shipping_address_fingerprint,
    now: quoteSelectedAt,
  }), "QUOTE_MISMATCH");
  assert.equal((await context.fulfillment.getShippingQuote(
    changedBeforeSelectionQuote.id,
  )).selected_at, null);

  const crossedCart = await createCartWithLines(context, "crossed_quote", [
    { variantId: "variant_boxer_pourpre_m", quantity: 1 },
  ]);
  const otherCart = await createCartWithLines(context, "other_quote", [
    { variantId: "variant_boxer_pourpre_l", quantity: 1 },
  ]);
  const crossedQuote = await context.fulfillment.createShippingQuote({
    id: "quote_crossed_cart_address",
    cartId: crossedCart,
    address: address("EU"),
    parcelProfile: parcelProfileForCart(context, crossedCart),
    expiresAt: quoteExpiresAt,
    now: quoteNow,
  });
  await rejectsCode(() => context.fulfillment.selectShippingQuote({
    quoteId: crossedQuote.id,
    cartId: otherCart,
    address: address("EU"),
    addressFingerprint: crossedQuote.shipping_address_fingerprint,
    now: quoteSelectedAt,
  }), "QUOTE_MISMATCH");
  const changedAddressFingerprint = await addressFingerprint({
    ...address("EU"),
    line1: "2 rue du Test",
  });
  await rejectsCode(() => context.fulfillment.selectShippingQuote({
    quoteId: crossedQuote.id,
    cartId: crossedCart,
    address: { ...address("EU"), line1: "2 rue du Test" },
    addressFingerprint: changedAddressFingerprint,
    now: quoteSelectedAt,
  }), "QUOTE_MISMATCH");
  assert.equal((await context.fulfillment.getShippingQuote(crossedQuote.id)).selected_at, null);

  const competingCart = await createCartWithLines(context, "competing_quotes", [
    { variantId: "variant_boxer_rose-pale_l", quantity: 1 },
  ]);
  const competingQuotes = await Promise.all(["a", "b"].map((suffix) =>
    context.fulfillment.createShippingQuote({
      id: `quote_competing_${suffix}`,
      cartId: competingCart,
      address: address("EU"),
      parcelProfile: parcelProfileForCart(context, competingCart),
      expiresAt: quoteExpiresAt,
      now: quoteNow,
    })));
  const competingSelections = await Promise.allSettled(competingQuotes.map((candidate) =>
    context.fulfillment.selectShippingQuote({
      quoteId: candidate.id,
      cartId: competingCart,
      address: address("EU"),
      addressFingerprint: candidate.shipping_address_fingerprint,
      now: quoteSelectedAt,
    })));
  assert.equal(competingSelections.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(competingSelections.filter((result) =>
    result.status === "rejected" && result.reason?.code === "QUOTE_MISMATCH").length, 1);
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM shipping_quotes
    WHERE cart_id=? AND selected_at IS NOT NULL`).get(competingCart).count, 1);

  const interleavedCart = await createCartWithLines(context, "interleaved_quote", [
    { variantId: "variant_boxer_rose-pale_xl", quantity: 1 },
  ]);
  const interleavedQuote = await context.fulfillment.createShippingQuote({
    id: "quote_interleaved_cart_mutation",
    cartId: interleavedCart,
    address: address("EU"),
    parcelProfile: parcelProfileForCart(context, interleavedCart),
    expiresAt: quoteExpiresAt,
    now: quoteNow,
  });
  const revisionBeforeRace = context.database.prepare(
    "SELECT fulfillment_revision FROM carts WHERE id=?",
  ).get(interleavedCart).fulfillment_revision;
  let interleavedMutations = 0;
  const racingStore = new D1FulfillmentStore(interleaveBeforeQuoteSelection(
    context.d1,
    () => {
      context.database.prepare(`UPDATE cart_lines SET quantity=2, updated_at=?
        WHERE cart_id=?`).run("2026-08-11T12:00:11.000Z", interleavedCart);
      interleavedMutations += 1;
    },
  ));
  await rejectsCode(() => racingStore.selectShippingQuote({
    quoteId: interleavedQuote.id,
    cartId: interleavedCart,
    address: address("EU"),
    addressFingerprint: interleavedQuote.shipping_address_fingerprint,
    now: quoteSelectedAt,
  }), "QUOTE_MISMATCH");
  assert.equal(interleavedMutations, 1);
  assert.deepEqual({ ...context.database.prepare(`SELECT cart.fulfillment_revision,
    quote.cart_revision, quote.selected_at FROM carts AS cart
    INNER JOIN shipping_quotes AS quote ON quote.cart_id=cart.id
    WHERE quote.id=?`).get(interleavedQuote.id) }, {
    fulfillment_revision: revisionBeforeRace + 1,
    cart_revision: revisionBeforeRace,
    selected_at: null,
  });
  assert.throws(() => context.database.prepare(
    "UPDATE shipping_quotes SET selected_at=? WHERE id=?",
  ).run(quoteSelectedAt, interleavedQuote.id), /fulfillment_quote_mismatch/);

  const shortCart = await createCartWithLines(context, "short", [
    { variantId: "variant_boxer_pourpre_l", quantity: 1 },
  ], {
    cartExpiresAt: "2099-08-11T12:01:00.000Z",
    now: "2099-08-11T12:00:10.000Z",
  });
  await rejectsCode(() => context.fulfillment.createShippingQuote({
    id: "quote_outlives_cart",
    cartId: shortCart,
    address: address("EU"),
    parcelProfile: parcelProfileForCart(context, shortCart),
    expiresAt: "2099-08-11T12:02:00.000Z",
    now: "2099-08-11T12:00:30.000Z",
  }), "INVALID_INPUT");

  const quote = await context.fulfillment.createShippingQuote({
    id: "quote_selected",
    cartId,
    address: address("EU"),
    parcelProfile: parcelProfileForCart(context, cartId),
    expiresAt: quoteExpiresAt,
    now: quoteNow,
  });
  await context.fulfillment.selectShippingQuote({
    quoteId: quote.id,
    cartId,
    address: address("EU"),
    addressFingerprint: quote.shipping_address_fingerprint,
    now: quoteSelectedAt,
  });
  assert.throws(() => context.database.prepare(
    "UPDATE cart_lines SET quantity=2 WHERE cart_id=?",
  ).run(cartId), /fulfillment_quote_mismatch/);
  await rejectsCode(() => context.fulfillment.selectShippingQuote({
    quoteId: quote.id,
    cartId,
    address: address("EU"),
    addressFingerprint: quote.shipping_address_fingerprint,
    now: liveIso(30 * 60_000),
  }), "QUOTE_EXPIRED");

  const oldCart = await createCartWithLines(context, "oldquote", [
    { variantId: "variant_boxer_rose-pale_s", quantity: 1 },
  ], {
    now: "2000-01-01T00:00:00.000Z",
    cartExpiresAt: "2099-01-01T00:00:00.000Z",
  });
  await context.fulfillment.createShippingQuote({
    id: "quote_expired_unselected",
    cartId: oldCart,
    address: address("EU"),
    parcelProfile: parcelProfileForCart(context, oldCart),
    expiresAt: "2000-01-01T01:00:00.000Z",
    now: "2000-01-01T00:01:00.000Z",
  });
  assert.throws(() => context.database.prepare(`UPDATE shipping_quotes
    SET selected_at='2000-01-01T00:30:00.000Z'
    WHERE id='quote_expired_unselected'`).run(), /fulfillment_quote_expired/);
  assert.equal(await context.fulfillment.purgeExpiredUnselectedShippingQuotes({
    expiredBefore: "2000-01-01T01:00:00.000Z",
    now: "2026-08-11T23:59:59.000Z",
  }), 1);
  assert.equal(await context.fulfillment.getShippingQuote("quote_expired_unselected"), null);
  assert.ok(await context.fulfillment.getShippingQuote(quote.id));
  assert.deepEqual(context.database.prepare("PRAGMA foreign_key_check").all(), []);
  context.database.close();
});

test("raw D1 vetoes zero-line refunds, false withdrawals and return-id contamination", async () => {
  const context = fixture();
  activateConfiguration(context, "EU", "return");
  const order = await createPaidOrder(context, {
    suffix: "return",
    zone: "EU",
    lines: [
      { variantId: "variant_boxer_pourpre_m", quantity: 2 },
      { variantId: "variant_boxer_rose-pale_l", quantity: 1 },
    ],
  });
  const admin = await createAdminActor(context);
  context.database.prepare(`INSERT INTO shipments (
    id, order_id, shipping_quote_id, status, idempotency_key,
    attempts, max_attempts, created_at, updated_at
  ) VALUES ('shipment_lease_guard', ?, ?, 'label_pending',
    'shipment:lease-guard', 0, 5, ?, ?)`).run(
    order.orderId,
    order.quote.id,
    "2026-08-11T12:10:02.000Z",
    "2026-08-11T12:10:02.000Z",
  );
  assert.throws(() => context.database.prepare(`UPDATE shipments SET
    status='label_claimed', lease_token_hash=?, leased_at=?, lease_expires_at=?,
    attempts=attempts+1, updated_at=? WHERE id='shipment_lease_guard'`).run(
    "5".repeat(64),
    "2026-08-11T12:10:03.000Z",
    "2027-08-11T12:10:03.000Z",
    "2026-08-11T12:10:03.000Z",
  ), /fulfillment_invalid_transition/);
  assert.throws(() => context.database.prepare(`UPDATE shipments SET
    status='label_claimed', lease_token_hash=?, leased_at=?, lease_expires_at=?,
    attempts=attempts+1, updated_at=? WHERE id='shipment_lease_guard'`).run(
    "5".repeat(64),
    "2099-08-11T12:10:03.000Z",
    "2099-08-11T12:11:03.000Z",
    "2099-08-11T12:10:03.000Z",
  ), /fulfillment_invalid_transition/);
  assert.equal(context.database.prepare(`SELECT status FROM shipments
    WHERE id='shipment_lease_guard'`).get().status, "label_pending");
  context.database.prepare(`INSERT INTO return_requests (
    id, order_id, kind, source, actor_admin_id, declaration_fingerprint,
    declared_line_count, status, resolution, requested_at, created_at, updated_at
  ) VALUES ('return_zero', ?, 'return', 'admin', 'admin_d03', ?, 1, 'received',
    'pending', ?, ?, ?)`).run(
    order.orderId,
    "e".repeat(64),
    "2026-08-11T12:11:00.000Z",
    "2026-08-11T12:11:00.000Z",
    "2026-08-11T12:11:00.000Z",
  );
  assert.throws(() => context.database.prepare(`UPDATE return_requests
    SET status='inspected', updated_at=? WHERE id='return_zero'`).run(
    "2026-08-11T12:11:01.000Z",
  ), /fulfillment_(inspection_incomplete|invalid_transition)/);
  assert.throws(() => context.database.prepare(`INSERT INTO refunds (
    id, payment_id, return_request_id, reason, amount_cents, currency, status,
    idempotency_key, attempts, max_attempts, created_at, updated_at
  ) VALUES ('refund_zero', ?, 'return_zero', 'return', 100, 'EUR', 'pending',
    'refund:zero', 0, 5, ?, ?)`).run(
    order.paymentId,
    "2026-08-11T12:11:02.000Z",
    "2026-08-11T12:11:02.000Z",
  ), /fulfillment_refund_limit_exceeded/);

  const first = await context.fulfillment.createReturnRequest({
    id: "return_exact",
    orderId: order.orderId,
    kind: "return",
    lines: [{ orderLineId: order.orderLineIds[0], quantity: 2 }],
    actor: admin,
    locale: "fr",
    now: "2026-08-11T12:12:00.000Z",
  });
  const replay = await context.fulfillment.createReturnRequest({
    id: "return_exact",
    orderId: order.orderId,
    kind: "return",
    lines: [{ orderLineId: order.orderLineIds[0], quantity: 2 }],
    actor: admin,
    locale: "fr",
    now: "2026-08-11T12:12:30.000Z",
  });
  assert.equal(replay.id, first.id);
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM return_lines WHERE return_request_id='return_exact'",
  ).get().count, 1);
  await rejectsCode(() => context.fulfillment.createReturnRequest({
    id: "return_exact",
    orderId: order.orderId,
    kind: "withdrawal",
    lines: [{ orderLineId: order.orderLineIds[0], quantity: 1 }],
    actor: admin,
    locale: "fr",
    now: "2026-08-11T12:13:00.000Z",
  }), "INVALID_TRANSITION");
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM return_lines WHERE return_request_id='return_exact'",
  ).get().count, 1);
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM email_outbox WHERE source_event_id='return_exact'",
  ).get().count, 1);
  assert.deepEqual({ ...context.database.prepare(`SELECT kind, transaction_intent
    FROM email_outbox WHERE source_event_id='return_exact'`).get() }, {
    kind: "return_acknowledgement",
    transaction_intent: "return_received",
  });
  await rejectsCode(() => context.fulfillment.createReturnRequest({
    id: "return_overbooked",
    orderId: order.orderId,
    kind: "return",
    lines: [{ orderLineId: order.orderLineIds[0], quantity: 1 }],
    actor: admin,
    locale: "fr",
    now: "2026-08-11T12:12:31.000Z",
  }), "RETURN_QUANTITY_EXCEEDED");
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM return_requests WHERE id='return_overbooked'",
  ).get().count, 0);
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM return_lines WHERE return_request_id='return_overbooked'",
  ).get().count, 0);
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM email_outbox WHERE source_event_id='return_overbooked'",
  ).get().count, 0);
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM audit_log
    WHERE entity_type='return_request' AND entity_id='return_overbooked'`).get().count, 0);
  assert.throws(() => context.database.prepare(`INSERT INTO return_lines (
    id, return_request_id, order_line_id, requested_quantity,
    received_quantity, sellable_quantity, non_sellable_quantity,
    restocked_quantity, inspection_result, created_at, updated_at
  ) VALUES ('late_return_line', 'return_exact', ?, 1, 0, 0, 0, 0,
    'pending', ?, ?)`).run(
    order.orderLineIds[1],
    "2026-08-11T12:12:31.000Z",
    "2026-08-11T12:12:31.000Z",
  ), /fulfillment_return_declaration_sealed/);
  await rejectsCode(() => context.fulfillment.completeReturnInspection({
    requestId: "missing_return",
    lines: [],
    actor: admin,
    now: "2026-08-11T12:12:32.000Z",
  }), "INSPECTION_INCOMPLETE");
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM audit_log
    WHERE id='audit_inspection_missing_return'`).get().count, 0);

  const racedReturn = await context.fulfillment.createReturnRequest({
    id: "return_inspection_race",
    orderId: order.orderId,
    kind: "return",
    lines: [{ orderLineId: order.orderLineIds[1], quantity: 1 }],
    actor: admin,
    locale: "fr",
    now: "2026-08-11T12:12:33.000Z",
  });
  const racedLine = context.database.prepare(`SELECT id FROM return_lines
    WHERE return_request_id=?`).get(racedReturn.id);
  await context.fulfillment.approveReturnRequest({
    requestId: racedReturn.id,
    actor: admin,
    now: "2026-08-11T12:12:33.500Z",
  });
  const inspectionBase = {
    requestId: racedReturn.id,
    actor: admin,
    now: "2026-08-11T12:12:34.000Z",
  };
  const inspectionRace = await Promise.allSettled([
    context.fulfillment.completeReturnInspection({
      ...inspectionBase,
      lines: [{
        returnLineId: racedLine.id,
        receivedQuantity: 1,
        sellableQuantity: 1,
        nonSellableQuantity: 0,
        restockedQuantity: 1,
      }],
    }),
    context.fulfillment.completeReturnInspection({
      ...inspectionBase,
      lines: [{
        returnLineId: racedLine.id,
        receivedQuantity: 1,
        sellableQuantity: 0,
        nonSellableQuantity: 1,
        restockedQuantity: 0,
      }],
    }),
  ]);
  assert.equal(inspectionRace.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(inspectionRace.filter((result) =>
    result.status === "rejected" && result.reason?.code === "INVALID_TRANSITION").length, 1);
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM audit_log
    WHERE id=?`).get(`audit_inspection_${racedReturn.id}`).count, 1);
  const operations = await createAdminActor(context, {
    role: "operations",
    suffix: "operations_refund",
  });
  await rejectsCode(() => context.fulfillment.createRefund({
    id: "refund_operations_forbidden",
    paymentId: order.paymentId,
    returnRequestId: racedReturn.id,
    amountCents: 100,
    idempotencyKey: "refund:operations-forbidden",
    actor: operations,
    now: "2026-08-11T12:12:35.000Z",
  }), "SESSION_REQUIRED");
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM refunds WHERE id='refund_operations_forbidden'",
  ).get().count, 0);
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM email_outbox WHERE source_event_id='refund_operations_forbidden'",
  ).get().count, 0);
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM audit_log
    WHERE entity_id='refund_operations_forbidden'`).get().count, 0);
  const artifactlessRefund = await context.fulfillment.createRefund({
    id: "refund_without_terminal_artifacts",
    paymentId: order.paymentId,
    returnRequestId: racedReturn.id,
    amountCents: 100,
    idempotencyKey: "refund:without-terminal-artifacts",
    actor: admin,
    now: "2026-08-11T12:12:35.000Z",
  });
  context.database.prepare(`UPDATE refunds SET status='claimed',
    lease_token_hash=?, leased_at=?, lease_expires_at=?, attempts=attempts+1,
    updated_at=? WHERE id=?`).run(
    "7".repeat(64),
    "2026-08-11T12:12:36.000Z",
    "2026-08-11T12:13:36.000Z",
    "2026-08-11T12:12:36.000Z",
    artifactlessRefund.id,
  );
  context.database.prepare(`UPDATE refunds SET status='succeeded',
    provider_refund_reference='provider_refund_artifactless',
    provider_receipt_fingerprint=?, lease_token_hash=NULL, leased_at=NULL,
    lease_expires_at=NULL, succeeded_at=?, updated_at=? WHERE id=?`).run(
    "6".repeat(64),
    "2026-08-11T12:12:37.000Z",
    "2026-08-11T12:12:37.000Z",
    artifactlessRefund.id,
  );
  const terminalVerifier = new D1FulfillmentStore(context.d1, {
    refund: { async refund() { throw new Error("terminal replay must not call provider"); } },
  });
  await rejectsCode(() => terminalVerifier.executeRefund({
    refundId: artifactlessRefund.id,
    leaseToken: "unused_terminal_replay_lease",
    leaseExpiresAt: "2026-08-11T12:14:00.000Z",
    locale: "fr",
    now: "2026-08-11T12:13:00.000Z",
  }), "PERSISTENCE_FAILURE");
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM email_outbox
    WHERE source_event_id=?`).get(artifactlessRefund.id).count, 0);
  const guardedRefund = await context.fulfillment.createRefund({
    id: "refund_lease_guard",
    paymentId: order.paymentId,
    returnRequestId: racedReturn.id,
    amountCents: 100,
    idempotencyKey: "refund:lease-guard",
    actor: admin,
    now: "2026-08-11T12:13:01.000Z",
  });
  assert.throws(() => context.database.prepare(`UPDATE refunds SET
    status='claimed', lease_token_hash=?, leased_at=?, lease_expires_at=?,
    attempts=attempts+1, updated_at=? WHERE id=?`).run(
    "8".repeat(64),
    "2026-08-11T12:13:02.000Z",
    "2027-08-11T12:13:02.000Z",
    "2026-08-11T12:13:02.000Z",
    guardedRefund.id,
  ), /fulfillment_invalid_transition/);
  assert.throws(() => context.database.prepare(`UPDATE refunds SET
    status='claimed', lease_token_hash=?, leased_at=?, lease_expires_at=?,
    attempts=attempts+1, updated_at=? WHERE id=?`).run(
    "8".repeat(64),
    "2099-08-11T12:13:02.000Z",
    "2099-08-11T12:14:02.000Z",
    "2099-08-11T12:13:02.000Z",
    guardedRefund.id,
  ), /fulfillment_invalid_transition/);
  assert.equal(context.database.prepare(`SELECT status FROM refunds
    WHERE id=?`).get(guardedRefund.id).status, "pending");
  assert.throws(() => context.database.prepare(`INSERT INTO email_outbox (
    id, kind, transaction_intent, source_event_id, recipient_email, order_id,
    locale, template_version, payload_json, status, attempts, max_attempts,
    next_attempt_at, idempotency_key, provider_idempotency_key, created_at, updated_at
  ) VALUES ('false_withdrawal', 'withdrawal_acknowledgement', 'withdrawal_received',
    'return_exact', ?, ?, 'fr', 'v1', '{}', 'pending', 0, 5, ?,
    'email:false-withdrawal', 'withdrawal_acknowledgement:return_exact', ?, ?)`).run(
    "return@example.com",
    order.orderId,
    "2026-08-11T12:13:01.000Z",
    "2026-08-11T12:13:01.000Z",
    "2026-08-11T12:13:01.000Z",
  ), /email_outbox_transaction_intent_not_verified/);
  context.database.close();
});

test("return mutations reject expired, crossed and wrong-order sessions without artifacts", async () => {
  const context = fixture();
  activateConfiguration(context, "EU", "auth");
  const firstOrder = await createPaidOrder(context, {
    suffix: "auth_a",
    zone: "EU",
    lines: [{ variantId: "variant_boxer_pourpre_s", quantity: 1 }],
  });
  const secondOrder = await createPaidOrder(context, {
    suffix: "auth_b",
    zone: "EU",
    lines: [{ variantId: "variant_boxer_rose-pale_s", quantity: 1 }],
  });
  const firstGuest = await createGuestActor(context, firstOrder);
  const secondGuest = await createGuestActor(context, secondOrder);
  const admin = await createAdminActor(context);
  const cases = [
    {
      id: "auth_wrong_order",
      actor: secondGuest,
      now: "2026-08-11T12:17:00.000Z",
    },
    {
      id: "auth_crossed_tokens",
      actor: {
        kind: "guest-order",
        sessionToken: firstGuest.sessionToken,
        csrfToken: secondGuest.csrfToken,
      },
      now: "2026-08-11T12:17:00.000Z",
    },
    {
      id: "auth_expired_guest",
      actor: firstGuest,
      now: "2026-08-13T12:17:00.000Z",
    },
    {
      id: "auth_expired_admin",
      actor: admin,
      now: "2026-08-12T12:17:00.000Z",
    },
  ];
  for (const invalidCase of cases) {
    await rejectsCode(() => context.fulfillment.createReturnRequest({
      id: invalidCase.id,
      orderId: firstOrder.orderId,
      kind: "return",
      lines: [{ orderLineId: firstOrder.orderLineIds[0], quantity: 1 }],
      actor: invalidCase.actor,
      locale: "fr",
      now: invalidCase.now,
    }), "SESSION_REQUIRED");
  }
  const customerNow = "2026-08-11T12:18:00.000Z";
  context.database.prepare(`INSERT INTO customers (
    id, email, accepts_marketing, account_enabled_at, created_at, updated_at
  ) VALUES ('customer_auth_a', 'customer-auth-a@example.com', 0, ?, ?, ?)`).run(
    customerNow,
    customerNow,
    customerNow,
  );
  await createPaidOrder(context, {
    suffix: "auth_customer_a",
    zone: "EU",
    customerId: "customer_auth_a",
    lines: [{ variantId: "variant_boxer_pourpre_m", quantity: 1 }],
  });
  context.setClock(customerNow);
  await context.identity.requestCustomerSignIn({
    email: "customer-auth-a@example.com",
    challengeId: "challenge_customer_auth_a",
    now: customerNow,
  });
  await context.flushBackground();
  const customerSession = await context.identity.consumeCustomerChallenge({
    rawChallengeToken: context.deliveries.at(-1).rawToken,
    sessionId: "customer_session_auth_a",
    now: "2026-08-11T12:18:30.000Z",
  });
  assert.ok(customerSession);
  await rejectsCode(() => context.fulfillment.createReturnRequest({
    id: "auth_customer_wrong_order",
    orderId: secondOrder.orderId,
    kind: "return",
    lines: [{ orderLineId: secondOrder.orderLineIds[0], quantity: 1 }],
    actor: {
      kind: "customer",
      sessionToken: customerSession.token,
      csrfToken: customerSession.csrfToken,
    },
    locale: "fr",
    now: "2026-08-11T12:19:00.000Z",
  }), "SESSION_REQUIRED");
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count
    FROM return_requests WHERE id LIKE 'auth_%'`).get().count, 0);
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count
    FROM email_outbox WHERE source_event_id LIKE 'auth_%'`).get().count, 0);
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count
    FROM audit_log WHERE entity_type='return_request'
      AND entity_id LIKE 'auth_%'`).get().count, 0);
  context.database.close();
});

test("carrier verification is a private non-forgeable capability", async () => {
  const claims = {
    shipmentId: "shipment_authority",
    providerCode: "carrier_test",
    providerEventId: "event_authority",
    trackingReference: "tracking_authority",
    eventType: "in_transit",
    eventFingerprint: "a".repeat(64),
    occurredAt: "2026-08-11T12:00:00.000Z",
    receivedAt: "2026-08-11T12:00:01.000Z",
  };
  const verified = await verifyTestCarrierEvent(claims);
  assert.doesNotThrow(() => assertVerifiedCarrierEvent(verified));
  assert.equal(Object.getOwnPropertySymbols(verified).length, 0);
  assert.throws(
    () => assertVerifiedCarrierEvent(Object.freeze({ ...verified })),
    (error) => error?.code === "TRACKING_VERIFICATION_REQUIRED",
  );
  assert.throws(
    () => assertVerifiedCarrierEvent(claims),
    (error) => error?.code === "TRACKING_VERIFICATION_REQUIRED",
  );
  const context = fixture({
    tracking: {
      async verifyEvent() {
        return Object.freeze({
          ...claims,
          receiptFingerprint: "b".repeat(64),
          verificationMethod: "test_adapter",
          verifiedAt: claims.receivedAt,
        });
      },
    },
  });
  await rejectsCode(() => context.fulfillment.recordTrackingEvent(
    claims,
    claims.receivedAt,
  ), "TRACKING_VERIFICATION_REQUIRED");
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM carrier_event_receipts",
  ).get().count, 0);
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM shipment_tracking_events",
  ).get().count, 0);
  context.database.close();
});

test("selected quotes survive later payment while unpaid orders never reach the carrier", async () => {
  const labelCalls = [];
  const context = fixture({
    shippingLabel: {
      async createLabel(request) {
        labelCalls.push(request);
        return {
          shipmentId: request.shipmentId,
          orderId: request.orderId,
          idempotencyKey: request.idempotencyKey,
          providerCode: "carrier_test",
          providerShipmentReference: `provider_${request.shipmentId}`,
          trackingReference: `tracking_${request.shipmentId}`,
          receiptFingerprint: "c".repeat(64),
        };
      },
    },
  });
  activateConfiguration(context, "EU", "payment_timing");
  const selectedAt = liveIso();
  const quoteExpiresAt = liveIso(2_000);
  const paidAt = liveIso(3_000);
  const paidOrder = await createPaidOrder(context, {
    suffix: "paid_after_quote_expiry",
    zone: "EU",
    lines: [{ variantId: "variant_boxer_pourpre_s", quantity: 1 }],
    quoteTimes: {
      createdAt: liveIso(-60_000),
      selectedAt,
      expiresAt: quoteExpiresAt,
    },
    reservationNow: liveIso(-2 * 60_000),
    reservationExpiresAt: liveIso(15 * 60_000),
    paymentOccurredAt: paidAt,
    paymentVerifiedAt: liveIso(3_500),
  });
  assert.deepEqual({ ...context.database.prepare(`SELECT quote.selected_at,
    quote.expires_at, customer_order.paid_at FROM orders AS customer_order
    INNER JOIN shipping_quotes AS quote ON quote.id=customer_order.shipping_quote_id
    WHERE customer_order.id=?`).get(paidOrder.orderId) }, {
    selected_at: selectedAt,
    expires_at: quoteExpiresAt,
    paid_at: paidAt,
  });
  const shipment = await context.fulfillment.createShipmentLabel({
    shipmentId: "shipment_paid_after_quote_expiry",
    orderId: paidOrder.orderId,
    idempotencyKey: "shipment:paid-after-quote-expiry",
    leaseToken: "lease_paid_after_quote_expiry",
    leaseExpiresAt: liveIso(64_000),
    now: liveIso(4_000),
  });
  assert.equal(shipment.status, "label_ready");
  assert.equal(labelCalls.length, 1);

  const unpaidOrder = await createPaidOrder(context, {
    suffix: "unpaid_shipment",
    zone: "EU",
    pay: false,
    lines: [{ variantId: "variant_boxer_rose-pale_s", quantity: 1 }],
  });
  await rejectsCode(() => context.fulfillment.createShipmentLabel({
    shipmentId: "shipment_unpaid_rejected",
    orderId: unpaidOrder.orderId,
    idempotencyKey: "shipment:unpaid-rejected",
    leaseToken: "lease_unpaid_rejected",
    leaseExpiresAt: liveIso(50_000),
    now: liveIso(-10_000),
  }), "ORDER_NOT_PAID");
  assert.equal(labelCalls.length, 1);
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM shipments WHERE id='shipment_unpaid_rejected'",
  ).get().count, 0);
  context.database.close();
});

test("a proven provider rejection permits exactly one owner-authorized legacy-phone retry", async () => {
  let reject = true;
  let calls = 0;
  const context = fixture({
    shippingLabel: {
      async createLabel(request) {
        calls += 1;
        if (reject) throw new FulfillmentProviderError("rejected", "recipient phone missing");
        return {
          shipmentId: request.shipmentId,
          orderId: request.orderId,
          idempotencyKey: request.idempotencyKey,
          providerCode: "sendcloud",
          providerShipmentReference: "383707310",
          trackingReference: "8NLAJ123456790",
          receiptFingerprint: "d".repeat(64),
        };
      },
    },
  });
  activateConfiguration(context, "EU", "legacy_phone_retry");
  const order = await createPaidOrder(context, {
    suffix: "legacy_phone_retry",
    zone: "EU",
    lines: [{ variantId: "variant_boxer_pourpre_m", quantity: 1 }],
  });
  const input = {
    shipmentId: "shipment_legacy_phone_retry",
    orderId: order.orderId,
    idempotencyKey: "shipment:legacy-phone-retry",
  };
  await rejectsCode(() => context.fulfillment.createShipmentLabel({
    ...input,
    leaseToken: "lease_legacy_phone_first",
    leaseExpiresAt: liveIso(50_000),
    now: liveIso(-10_000),
  }), "INVALID_TRANSITION");
  assert.deepEqual({ ...context.database.prepare(
    "SELECT status, attempts, last_error_code FROM shipments WHERE id=?",
  ).get(input.shipmentId) }, {
    status: "failed",
    attempts: 1,
    last_error_code: "provider_rejected",
  });
  context.database.prepare(`INSERT INTO administrators (
    id, external_subject_hash, role, enabled, authz_version, created_at, updated_at
  ) VALUES ('admin_retry_owner', ?, 'owner', 1, 1, ?, ?)`).run(
    "a".repeat(64),
    liveIso(-9_000),
    liveIso(-9_000),
  );
  context.database.prepare(`INSERT INTO shipment_retry_authorizations (
    id, shipment_id, administrator_id, recipient_phone, created_at, consumed_at
  ) VALUES ('shipment_retry_legacy_phone', ?, 'admin_retry_owner', '+33659006025', ?, NULL)`).run(
    input.shipmentId,
    liveIso(-8_000),
  );
  reject = false;
  const completed = await context.fulfillment.createShipmentLabel({
    ...input,
    leaseToken: "lease_legacy_phone_retry",
    leaseExpiresAt: liveIso(52_000),
    now: liveIso(-7_000),
  });
  assert.equal(completed.status, "label_ready");
  assert.equal(completed.attempts, 2);
  assert.equal(calls, 2);
  assert.equal(context.database.prepare(
    "SELECT consumed_at FROM shipment_retry_authorizations WHERE shipment_id=?",
  ).get(input.shipmentId).consumed_at, liveIso(-7_000));
  await assert.rejects(
    () => context.d1.prepare(
      "UPDATE shipment_retry_authorizations SET consumed_at=NULL WHERE shipment_id=?",
    ).bind(input.shipmentId).run(),
    /shipment_retry_not_authorized/,
  );
  context.database.close();
});

test("the first signed Sendcloud possession scan proves handover exactly once", async () => {
  let verifiedTrackingPort;
  const context = fixture({
    shippingLabel: {
      async createLabel(request) {
        return {
          shipmentId: request.shipmentId,
          orderId: request.orderId,
          idempotencyKey: request.idempotencyKey,
          providerCode: "sendcloud",
          providerShipmentReference: "383707309",
          trackingReference: "8NLAJ123456789",
          receiptFingerprint: "c".repeat(64),
        };
      },
    },
    tracking: {
      verifyEvent(candidate) {
        assert.ok(verifiedTrackingPort, "the signed carrier port must be installed first");
        return verifiedTrackingPort.verifyEvent(candidate);
      },
    },
  });
  activateConfiguration(context, "EU", "schandover");
  const order = await createPaidOrder(context, {
    suffix: "schandover",
    zone: "EU",
    lines: [{ variantId: "variant_boxer_pourpre_m", quantity: 1 }],
  });
  const shipment = await context.fulfillment.createShipmentLabel({
    shipmentId: "shipment_sendcloud_handover",
    orderId: order.orderId,
    idempotencyKey: "shipment:sendcloud-handover",
    leaseToken: "lease_sendcloud_handover",
    leaseExpiresAt: "2026-08-31T12:05:00.000Z",
    now: "2026-08-31T11:58:00.000Z",
  });
  assert.equal(shipment.status, "label_ready");

  const rawBody = new TextEncoder().encode(JSON.stringify({
    action: "parcel_status_changed",
    timestamp: 1788177540,
    carrier_status_change_timestamp: 1788177540,
    parcel: {
      id: 383707309,
      tracking_number: "8NLAJ123456789",
      status: { id: 11, message: "Shipment picked up by driver" },
    },
  }));
  const secret = "sendcloud-webhook-secret-value-2026";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Buffer.from(
    await crypto.subtle.sign("HMAC", key, rawBody),
  ).toString("hex");
  const receivedAt = "2026-08-31T12:00:00.000Z";
  const signal = await verifySendcloudTrackingWebhook({
    rawBody,
    signature,
    secret,
    receivedAt,
  });
  verifiedTrackingPort = createVerifiedSendcloudTrackingPort(signal, shipment.id);
  const candidate = sendcloudTrackingCandidate(signal, shipment.id);
  const verified = await verifiedTrackingPort.verifyEvent({ ...candidate, receivedAt });

  assert.deepEqual(await context.fulfillment.handoverShipmentFromVerifiedCarrierEvent({
    event: verified,
    locale: "fr",
  }), { created: true });
  assert.deepEqual(await context.fulfillment.recordTrackingEvent(
    candidate,
    receivedAt,
  ), { created: true });
  assert.deepEqual(await context.fulfillment.handoverShipmentFromVerifiedCarrierEvent({
    event: verified,
    locale: "fr",
  }), { created: false });

  const replayReceivedAt = "2026-08-31T12:10:00.000Z";
  const replaySignal = await verifySendcloudTrackingWebhook({
    rawBody,
    signature,
    secret,
    receivedAt: replayReceivedAt,
  });
  verifiedTrackingPort = createVerifiedSendcloudTrackingPort(replaySignal, shipment.id);
  assert.deepEqual(await context.fulfillment.recordTrackingEvent(
    sendcloudTrackingCandidate(replaySignal, shipment.id),
    replayReceivedAt,
  ), { created: false });
  assert.deepEqual({ ...context.database.prepare(`SELECT shipment.status AS shipment_status,
    customer_order.status AS order_status FROM shipments AS shipment
    INNER JOIN orders AS customer_order ON customer_order.id=shipment.order_id
    WHERE shipment.id=?`).get(shipment.id) }, {
    shipment_status: "in_transit",
    order_status: "shipped",
  });
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM email_outbox
    WHERE order_id=? AND kind='shipment_confirmation'`).get(order.orderId).count, 1);
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM audit_log
    WHERE entity_id=? AND action='shipment_handed_over'
      AND actor_type='system'`).get(shipment.id).count, 1);
  context.database.close();
});

test("the production Sendcloud route applies one signed possession scan and returns duplicate on retry", async () => {
  const context = fixture({
    shippingLabel: {
      async createLabel(request) {
        return {
          shipmentId: request.shipmentId,
          orderId: request.orderId,
          idempotencyKey: request.idempotencyKey,
          providerCode: "sendcloud",
          providerShipmentReference: "383707310",
          trackingReference: "8NLAJ123456790",
          receiptFingerprint: "d".repeat(64),
        };
      },
    },
  });
  activateConfiguration(context, "EU", "routehandover");
  const order = await createPaidOrder(context, {
    suffix: "routehandover",
    zone: "EU",
    lines: [{ variantId: "variant_boxer_pourpre_l", quantity: 1 }],
  });
  const shipment = await context.fulfillment.createShipmentLabel({
    shipmentId: "shipment_sendcloud_route",
    orderId: order.orderId,
    idempotencyKey: "shipment:sendcloud-route",
    leaseToken: "lease_sendcloud_route",
    leaseExpiresAt: "2026-08-31T12:05:00.000Z",
    now: "2026-08-31T11:58:00.000Z",
  });
  assert.equal(shipment.status, "label_ready");

  const rawBody = new TextEncoder().encode(JSON.stringify({
    action: "parcel_status_changed",
    timestamp: Math.floor(Date.now() / 1_000) - 30,
    carrier_status_change_timestamp: Math.floor(Date.now() / 1_000) - 30,
    parcel: {
      id: 383707310,
      tracking_number: "8NLAJ123456790",
      status: { id: 11, message: "Shipment picked up by driver" },
    },
  }));
  const secret = "sendcloud-route-webhook-secret-2026";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, rawBody)).toString("hex");
  const env = {
    APP_ENV: "production",
    COMMERCE_ORIGIN: "https://ajluxurystore.com",
    SENDCLOUD_SECRET_KEY: secret,
    DB: context.d1,
  };
  const request = () => new Request(
    "https://ajluxurystore.com/api/commerce/webhooks/sendcloud",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Sendcloud-Signature": signature,
      },
      body: rawBody,
    },
  );
  const first = await productionCommerceApiResponse(request(), env);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { received: true, disposition: "applied" });
  const replay = await productionCommerceApiResponse(request(), env);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { received: true, disposition: "duplicate" });
  assert.deepEqual({ ...context.database.prepare(`SELECT shipment.status AS shipment_status,
    customer_order.status AS order_status FROM shipments AS shipment
    INNER JOIN orders AS customer_order ON customer_order.id=shipment.order_id
    WHERE shipment.id=?`).get(shipment.id) }, {
    shipment_status: "in_transit",
    order_status: "shipped",
  });
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM email_outbox
    WHERE order_id=? AND kind='shipment_confirmation'`).get(order.orderId).count, 1);
  context.database.close();
});

test("withdrawal is acknowledged before any shipment or delivery exists", async () => {
  const context = fixture();
  activateConfiguration(context, "EU", "withdrawal_before_delivery");
  const order = await createPaidOrder(context, {
    suffix: "withdrawal_before_delivery",
    zone: "EU",
    lines: [{ variantId: "variant_boxer_pourpre_xl", quantity: 1 }],
  });
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM shipments WHERE order_id=?",
  ).get(order.orderId).count, 0);
  const guest = await createGuestActor(context, order);
  const withdrawal = await context.fulfillment.createReturnRequest({
    id: "withdrawal_before_delivery",
    orderId: order.orderId,
    kind: "withdrawal",
    lines: [{ orderLineId: order.orderLineIds[0], quantity: 1 }],
    actor: guest,
    locale: "fr",
    now: "2026-08-11T12:17:00.000Z",
  });
  assert.equal(withdrawal.status, "received");
  assert.deepEqual({ ...context.database.prepare(`SELECT kind, transaction_intent
    FROM email_outbox WHERE source_event_id=?`).get(withdrawal.id) }, {
    kind: "withdrawal_acknowledgement",
    transaction_intent: "withdrawal_received",
  });
  assert.equal(context.database.prepare(
    "SELECT COUNT(*) AS count FROM shipments WHERE order_id=?",
  ).get(order.orderId).count, 0);
  context.database.close();
});

test("full fulfillment flow is leased, append-only, mixed-unit safe and keeps payment truth", async () => {
  const labelCalls = [];
  let labelMode = "ambiguous";
  const refundCalls = [];
  const refundModes = ["ambiguous", "mismatch", "success"];
  const ports = {
    shippingLabel: {
      async createLabel(request) {
        labelCalls.push(request);
        if (labelMode === "ambiguous") throw new Error("unknown provider outcome");
        return {
          shipmentId: request.shipmentId,
          orderId: request.orderId,
          idempotencyKey: request.idempotencyKey,
          providerCode: "carrier_test",
          providerShipmentReference: "provider_shipment_flow",
          trackingReference: "tracking_flow",
          customsDocumentReference: "carrier_test:customs:shipment_flow:a4",
          receiptFingerprint: "1".repeat(64),
        };
      },
    },
    tracking: {
      async verifyEvent(candidate) {
        return verifyTestCarrierEvent(candidate);
      },
    },
    refund: {
      async refund(request) {
        refundCalls.push(request);
        const mode = refundModes.shift();
        if (mode === "ambiguous") {
          throw new FulfillmentProviderError("ambiguous", "unknown refund outcome");
        }
        return {
          refundId: mode === "mismatch" ? "refund_crossed" : request.refundId,
          paymentId: request.paymentId,
          amountCents: request.amountCents,
          currency: request.currency,
          idempotencyKey: request.idempotencyKey,
          providerRefundReference: mode === "collision"
            ? "provider_refund_refund_flow"
            : `provider_refund_${request.refundId}`,
          receiptFingerprint: "2".repeat(64),
        };
      },
    },
  };
  const context = fixture(ports);
  activateConfiguration(context, "US", "flow");
  const order = await createPaidOrder(context, {
    suffix: "flow",
    zone: "US",
    lines: [
      { variantId: "variant_boxer_pourpre_l", quantity: 2 },
      { variantId: "variant_boxer_rose-pale_m", quantity: 1 },
    ],
  });
  await rejectsCode(() => context.fulfillment.selectShippingQuote({
    quoteId: order.quote.id,
    cartId: order.cartId,
    address: address("US"),
    addressFingerprint: order.quote.shipping_address_fingerprint,
    now: "2026-08-11T12:10:02.000Z",
  }), "QUOTE_MISMATCH");
  await rejectsCode(() => context.fulfillment.createShipmentLabel({
    shipmentId: "shipment_flow",
    orderId: order.orderId,
    idempotencyKey: "shipment:flow",
    leaseToken: "lease_label_first",
    leaseExpiresAt: "2026-08-11T12:11:00.000Z",
    now: "2026-08-11T12:10:10.000Z",
  }), "PROVIDER_OUTCOME_UNKNOWN");
  await rejectsCode(() => context.fulfillment.createShipmentLabel({
    shipmentId: "shipment_flow",
    orderId: order.orderId,
    idempotencyKey: "shipment:flow",
    leaseToken: "lease_label_early",
    leaseExpiresAt: "2026-08-11T12:11:10.000Z",
    now: "2026-08-11T12:10:20.000Z",
  }), "LEASE_UNAVAILABLE");
  labelMode = "success";
  const shipment = await context.fulfillment.createShipmentLabel({
    shipmentId: "shipment_flow",
    orderId: order.orderId,
    idempotencyKey: "shipment:flow",
    leaseToken: "lease_label_retry",
    leaseExpiresAt: "2026-08-11T12:12:00.000Z",
    now: "2026-08-11T12:11:01.000Z",
  });
  assert.equal(shipment.status, "label_ready");
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM email_outbox
    WHERE order_id = ? AND kind = 'shipment_confirmation'`).get(order.orderId).count, 0);
  assert.equal(new Set(labelCalls.filter((call) => call.shipmentId === shipment.id)
    .map((call) => call.idempotencyKey)).size, 1);
  const collisionOrder = await createPaidOrder(context, {
    suffix: "label_collision",
    zone: "US",
    lines: [{ variantId: "variant_boxer_rose-pale_xl", quantity: 1 }],
  });
  await rejectsCode(() => context.fulfillment.createShipmentLabel({
    shipmentId: "shipment_label_collision",
    orderId: collisionOrder.orderId,
    idempotencyKey: "shipment:label-collision",
    leaseToken: "lease_label_collision",
    leaseExpiresAt: "2026-08-11T12:12:00.000Z",
    now: "2026-08-11T12:11:01.000Z",
  }), "PROVIDER_RECEIPT_MISMATCH");
  assert.deepEqual({ ...context.database.prepare(`SELECT status,
    provider_shipment_reference, tracking_reference FROM shipments
    WHERE id='shipment_label_collision'`).get() }, {
    status: "label_claimed",
    provider_shipment_reference: null,
    tracking_reference: null,
  });
  const admin = await createAdminActor(context);
  assert.deepEqual({ ...context.database.prepare(`SELECT status, manual_reference
    FROM customs_records WHERE shipment_id=?`).get(shipment.id) }, {
    status: "ready",
    manual_reference: "carrier_test:customs:shipment_flow:a4",
  });
  assert.deepEqual(await context.fulfillment.handoverShipment({
    shipmentId: shipment.id,
    eventId: "handover_flow",
    actor: admin,
    locale: "fr",
    now: "2026-08-11T12:12:20.000Z",
  }), { created: true });
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM email_outbox
    WHERE order_id = ? AND kind = 'shipment_confirmation'`).get(order.orderId).count, 1);
  assert.deepEqual(await context.fulfillment.handoverShipment({
    shipmentId: shipment.id,
    eventId: "handover_flow",
    actor: admin,
    locale: "fr",
    now: "2026-08-11T12:13:20.000Z",
  }), { created: false });
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM email_outbox
    WHERE order_id = ? AND kind = 'shipment_confirmation'`).get(order.orderId).count, 1);
  assert.throws(() => context.database.prepare(`INSERT INTO shipment_tracking_events (
    id, shipment_id, provider_code, provider_event_id, event_type,
    tracking_reference, event_fingerprint, occurred_at, received_at
  ) VALUES ('raw_transit_flow', 'shipment_flow', 'carrier_test', 'raw_transit_flow',
    'in_transit', 'forged_tracking', ?, ?, ?)`).run(
    "3".repeat(64),
    "2026-08-11T12:13:00.000Z",
    "2026-08-11T12:13:01.000Z",
  ), /fulfillment_tracking_event_conflict|ck_tracking_events_receipt_shape/);
  assert.throws(() => context.database.prepare(`INSERT INTO shipment_tracking_events (
    id, shipment_id, provider_code, provider_event_id, event_type,
    tracking_reference, event_fingerprint, occurred_at, received_at
  ) VALUES ('raw_bound_flow', 'shipment_flow', 'carrier_test', 'raw_bound_flow',
    'in_transit', 'tracking_flow', ?, ?, ?)`).run(
    "3".repeat(64),
    "2026-08-11T12:13:00.000Z",
    "2026-08-11T12:13:01.000Z",
  ), /fulfillment_tracking_event_conflict|ck_tracking_events_receipt_shape/);
  assert.throws(() => context.database.prepare(`UPDATE shipments SET
    status='in_transit', updated_at=? WHERE id='shipment_flow'`).run(
    "2026-08-11T12:13:01.000Z",
  ), /fulfillment_invalid_transition/);
  context.database.prepare(`INSERT INTO carrier_event_receipts (
    id, shipment_id, provider_code, provider_event_id, tracking_reference,
    event_type, event_fingerprint, receipt_fingerprint, verification_method,
    occurred_at, received_at, verified_at, status, consumed_at
  ) VALUES ('raw_orphan_receipt', 'shipment_flow', 'carrier_test',
    'raw_orphan_event', 'tracking_flow', 'in_transit', ?, ?, 'test_adapter',
    ?, ?, ?, 'verified', NULL)`).run(
    "3".repeat(64),
    "7".repeat(64),
    "2026-08-11T12:13:00.000Z",
    "2026-08-11T12:13:01.000Z",
    "2026-08-11T12:13:01.000Z",
  );
  assert.throws(() => context.database.prepare(`UPDATE shipments SET
    status='in_transit', updated_at=? WHERE id='shipment_flow'`).run(
    "2026-08-11T12:13:01.000Z",
  ), /fulfillment_invalid_transition/);
  assert.throws(() => context.database.prepare(`UPDATE carrier_event_receipts
    SET status='consumed', consumed_at=received_at
    WHERE id='raw_orphan_receipt'`).run(), /fulfillment_tracking_event_conflict/);
  assert.throws(() => context.database.prepare(`UPDATE shipments SET
    status='in_transit', tracking_reference='tampered', updated_at=?
    WHERE id='shipment_flow'`).run("2026-08-11T12:13:01.000Z"),
  /fulfillment_invalid_transition/);
  const transit = {
    shipmentId: shipment.id,
    providerCode: "carrier_test",
    providerEventId: "transit_flow",
    trackingReference: "tracking_flow",
    eventType: "in_transit",
    eventFingerprint: "4".repeat(64),
    occurredAt: "2026-08-11T12:14:00.000Z",
  };
  assert.deepEqual(await context.fulfillment.recordTrackingEvent(
    transit,
    "2026-08-11T12:14:01.000Z",
  ), { created: true });
  const transitProof = context.database.prepare(`SELECT event.carrier_receipt_id,
    receipt.status, receipt.shipment_id, receipt.provider_code,
    receipt.provider_event_id, receipt.tracking_reference, receipt.event_type,
    receipt.event_fingerprint, receipt.occurred_at, receipt.received_at,
    receipt.consumed_at
    FROM shipment_tracking_events AS event
    INNER JOIN carrier_event_receipts AS receipt
      ON receipt.id=event.carrier_receipt_id
    WHERE event.provider_code=? AND event.provider_event_id=?`).get(
    transit.providerCode,
    transit.providerEventId,
  );
  assert.deepEqual({ ...transitProof }, {
    carrier_receipt_id: transitProof.carrier_receipt_id,
    status: "consumed",
    shipment_id: transit.shipmentId,
    provider_code: transit.providerCode,
    provider_event_id: transit.providerEventId,
    tracking_reference: transit.trackingReference,
    event_type: transit.eventType,
    event_fingerprint: transit.eventFingerprint,
    occurred_at: transit.occurredAt,
    received_at: "2026-08-11T12:14:01.000Z",
    consumed_at: "2026-08-11T12:14:01.000Z",
  });
  assert.throws(() => context.database.prepare(`INSERT INTO shipment_tracking_events (
    id, shipment_id, provider_code, provider_event_id, carrier_receipt_id,
    event_type, tracking_reference, event_fingerprint, occurred_at, received_at
  ) VALUES ('raw_reused_receipt', 'shipment_flow', 'carrier_test',
    'raw_reused_receipt', ?, 'out_for_delivery', 'tracking_flow', ?, ?, ?)`).run(
    transitProof.carrier_receipt_id,
    transit.eventFingerprint,
    transit.occurredAt,
    "2026-08-11T12:14:01.000Z",
  ), /fulfillment_tracking_event_conflict|UNIQUE constraint failed/);
  assert.throws(() => context.database.prepare(
    "DELETE FROM carrier_event_receipts WHERE id=?",
  ).run(transitProof.carrier_receipt_id), /fulfillment_tracking_event_is_immutable/);
  assert.deepEqual(await context.fulfillment.recordTrackingEvent(
    transit,
    "2026-08-11T12:14:01.000Z",
  ), { created: false });
  await rejectsCode(() => context.fulfillment.recordTrackingEvent(
    transit,
    "2026-08-11T12:14:02.000Z",
  ), "TRACKING_EVENT_CONFLICT");
  await rejectsCode(() => context.fulfillment.recordTrackingEvent({
    ...transit,
    eventFingerprint: "9".repeat(64),
  }, "2026-08-11T12:14:03.000Z"), "TRACKING_EVENT_CONFLICT");
  const concurrentTracking = {
    ...transit,
    providerEventId: "exception_flow",
    eventType: "exception",
    eventFingerprint: "8".repeat(64),
    occurredAt: "2026-08-11T12:14:04.000Z",
  };
  const concurrentResults = await Promise.all([
    context.fulfillment.recordTrackingEvent(concurrentTracking, "2026-08-11T12:14:05.000Z"),
    context.fulfillment.recordTrackingEvent(concurrentTracking, "2026-08-11T12:14:05.000Z"),
  ]);
  assert.deepEqual(concurrentResults.map((value) => value.created).sort(), [false, true]);
  await context.fulfillment.recordTrackingEvent({
    ...transit,
    providerEventId: "delivered_flow",
    eventType: "delivered",
    eventFingerprint: "5".repeat(64),
    occurredAt: "2026-08-11T12:13:30.000Z",
  }, "2026-08-11T12:15:00.000Z");
  await context.fulfillment.recordTrackingEvent({
    ...transit,
    providerEventId: "late_flow",
    eventType: "out_for_delivery",
    eventFingerprint: "6".repeat(64),
    occurredAt: "2026-08-11T12:13:10.000Z",
  }, "2026-08-11T12:15:10.000Z");
  assert.equal(context.database.prepare(
    "SELECT status FROM shipments WHERE id='shipment_flow'",
  ).get().status, "delivered");

  const guest = await createGuestActor(context, order);
  const withdrawal = await context.fulfillment.createReturnRequest({
    id: "withdrawal_flow",
    orderId: order.orderId,
    kind: "withdrawal",
    lines: [
      { orderLineId: order.orderLineIds[0], quantity: 2 },
      { orderLineId: order.orderLineIds[1], quantity: 1 },
    ],
    actor: guest,
    locale: "fr",
    now: "2026-08-11T12:17:00.000Z",
  });
  const returnLines = context.database.prepare(`SELECT id, order_line_id
    FROM return_lines WHERE return_request_id=? ORDER BY order_line_id`).all(withdrawal.id);
  await context.fulfillment.approveReturnRequest({
    requestId: withdrawal.id,
    actor: admin,
    now: "2026-08-11T12:17:30.000Z",
  });
  await rejectsCode(() => context.fulfillment.completeReturnInspection({
    requestId: withdrawal.id,
    lines: [{
      returnLineId: returnLines[0].id,
      receivedQuantity: 2,
      sellableQuantity: 1,
      nonSellableQuantity: 1,
      restockedQuantity: 1,
    }],
    actor: admin,
    now: "2026-08-11T12:18:00.000Z",
  }), "INSPECTION_INCOMPLETE");
  const before = returnLines.map((line) => context.database.prepare(`SELECT
    inventory.physical_quantity FROM inventory INNER JOIN order_lines
      ON order_lines.variant_id=inventory.variant_id WHERE order_lines.id=?`).get(
    line.order_line_id,
  ).physical_quantity);
  const inspection = [
    {
      returnLineId: returnLines[0].id,
      receivedQuantity: 2,
      sellableQuantity: 1,
      nonSellableQuantity: 1,
      restockedQuantity: 1,
    },
    {
      returnLineId: returnLines[1].id,
      receivedQuantity: 1,
      sellableQuantity: 1,
      nonSellableQuantity: 0,
      restockedQuantity: 1,
    },
  ];
  await context.fulfillment.completeReturnInspection({
    requestId: withdrawal.id,
    lines: inspection,
    actor: admin,
    now: "2026-08-11T12:18:10.000Z",
  });
  await context.fulfillment.completeReturnInspection({
    requestId: withdrawal.id,
    lines: inspection,
    actor: admin,
    now: "2026-08-11T12:18:20.000Z",
  });
  const movements = context.database.prepare(`SELECT kind, reference_type,
    reference_id, quantity, actor_type, actor_id, idempotency_key
    FROM inventory_movements WHERE idempotency_key LIKE 'return-restock:%'
    ORDER BY reference_id`).all();
  assert.equal(movements.length, 2);
  assert.deepEqual(movements.map((movement) => ({
    kind: movement.kind,
    referenceType: movement.reference_type,
    quantity: movement.quantity,
    actorType: movement.actor_type,
    actorId: movement.actor_id,
  })).sort((left, right) => left.quantity - right.quantity), [
    { kind: "adjustment", referenceType: "physical_increase", quantity: 1, actorType: "system", actorId: null },
    { kind: "adjustment", referenceType: "physical_increase", quantity: 1, actorType: "system", actorId: null },
  ]);
  returnLines.forEach((line, index) => {
    const physical = context.database.prepare(`SELECT inventory.physical_quantity
      FROM inventory INNER JOIN order_lines ON order_lines.variant_id=inventory.variant_id
      WHERE order_lines.id=?`).get(line.order_line_id).physical_quantity;
    assert.equal(physical, before[index] + inspection[index].restockedQuantity);
  });

  const refund = await context.fulfillment.createRefund({
    id: "refund_flow",
    paymentId: order.paymentId,
    returnRequestId: withdrawal.id,
    amountCents: 5000,
    idempotencyKey: "refund:flow",
    actor: admin,
    now: "2026-08-11T12:19:00.000Z",
  });
  await rejectsCode(() => context.fulfillment.createRefund({
    id: "refund_over_flow",
    paymentId: order.paymentId,
    returnRequestId: withdrawal.id,
    amountCents: order.total,
    idempotencyKey: "refund:over-flow",
    actor: admin,
    now: "2026-08-11T12:19:01.000Z",
  }), "REFUND_LIMIT_EXCEEDED");
  await rejectsCode(() => context.fulfillment.executeRefund({
    refundId: refund.id,
    leaseToken: "refund_lease_one",
    leaseExpiresAt: "2026-08-11T12:20:30.000Z",
    locale: "fr",
    now: "2026-08-11T12:20:00.000Z",
  }), "PROVIDER_OUTCOME_UNKNOWN");
  assert.throws(() => context.database.prepare(`UPDATE refunds SET
    status='claimed', lease_token_hash=?, leased_at=?, lease_expires_at=?,
    attempts=attempts+1, provider_refund_reference='tampered', updated_at=?
    WHERE id=?`).run(
    "7".repeat(64),
    "2026-08-11T12:20:31.000Z",
    "2026-08-11T12:21:01.000Z",
    "2026-08-11T12:20:31.000Z",
    refund.id,
  ), /fulfillment_invalid_transition/);
  await rejectsCode(() => context.fulfillment.executeRefund({
    refundId: refund.id,
    leaseToken: "refund_lease_two",
    leaseExpiresAt: "2026-08-11T12:21:01.000Z",
    locale: "fr",
    now: "2026-08-11T12:20:31.000Z",
  }), "PROVIDER_RECEIPT_MISMATCH");
  const completedRefund = await context.fulfillment.executeRefund({
    refundId: refund.id,
    leaseToken: "refund_lease_three",
    leaseExpiresAt: "2026-08-11T12:21:32.000Z",
    locale: "fr",
    now: "2026-08-11T12:21:02.000Z",
  });
  assert.equal(completedRefund.status, "succeeded");
  assert.equal(new Set(refundCalls.filter((call) => call.refundId === refund.id)
    .map((call) => call.idempotencyKey)).size, 1);
  refundModes.push("success");
  const secondPartial = await context.fulfillment.createRefund({
    id: "refund_partial_two",
    paymentId: order.paymentId,
    returnRequestId: withdrawal.id,
    amountCents: 4000,
    idempotencyKey: "refund:partial-two",
    actor: admin,
    now: "2026-08-11T12:21:03.000Z",
  });
  const secondCompleted = await context.fulfillment.executeRefund({
    refundId: secondPartial.id,
    leaseToken: "refund_lease_partial_two",
    leaseExpiresAt: "2026-08-11T12:22:00.000Z",
    locale: "fr",
    now: "2026-08-11T12:21:04.000Z",
  });
  assert.equal(secondCompleted.status, "succeeded");
  assert.equal((await context.fulfillment.executeRefund({
    refundId: secondPartial.id,
    leaseToken: "refund_lease_partial_two_replay",
    leaseExpiresAt: "2026-08-11T12:22:30.000Z",
    locale: "fr",
    now: "2026-08-11T12:21:05.000Z",
  })).status, "succeeded");
  const creditNotes = context.database.prepare(`SELECT refund_id,
    credit_note_number, credit_amount_cents, credit_lines_json,
    original_total_cents, remaining_balance_cents
    FROM order_credit_notes WHERE order_id=? ORDER BY credit_note_sequence`).all(
    order.orderId,
  );
  assert.equal(creditNotes.length, 2, "a succeeded refund replay must not duplicate its credit note");
  assert.deepEqual(creditNotes.map((note) => note.credit_note_number), [
    "AJL-AV-2026-000001",
    "AJL-AV-2026-000002",
  ]);
  assert.deepEqual(creditNotes.map((note) => note.refund_id), [refund.id, secondPartial.id]);
  assert.equal(
    creditNotes.reduce((total, note) => total + note.credit_amount_cents, 0),
    9000,
  );
  for (const note of creditNotes) {
    const lines = JSON.parse(note.credit_lines_json);
    assert.equal(
      lines.reduce((total, line) => total + line.amountCents, 0),
      note.credit_amount_cents,
      "the immutable line snapshot must explain the exact credited amount",
    );
    assert.ok(lines.every((line) => line.kind === "item" || (
      line.kind === "adjustment" &&
      line.label === "Ajustement / remboursement livraison"
    )));
  }
  assert.equal(
    creditNotes.at(-1).remaining_balance_cents,
    creditNotes.at(-1).original_total_cents - 9000,
  );
  assert.throws(
    () => context.database.prepare(`UPDATE order_credit_notes
      SET credit_amount_cents=1 WHERE refund_id=?`).run(refund.id),
    /commerce_credit_note_is_immutable/,
  );
  refundModes.push("collision");
  const collisionRefund = await context.fulfillment.createRefund({
    id: "refund_provider_collision",
    paymentId: order.paymentId,
    returnRequestId: withdrawal.id,
    amountCents: 1000,
    idempotencyKey: "refund:provider-collision",
    actor: admin,
    now: "2026-08-11T12:21:05.000Z",
  });
  await rejectsCode(() => context.fulfillment.executeRefund({
    refundId: collisionRefund.id,
    leaseToken: "refund_lease_provider_collision",
    leaseExpiresAt: "2026-08-11T12:22:01.000Z",
    locale: "fr",
    now: "2026-08-11T12:21:06.000Z",
  }), "PROVIDER_RECEIPT_MISMATCH");
  assert.equal(context.database.prepare(`SELECT status FROM refunds
    WHERE id=?`).get(collisionRefund.id).status, "claimed");
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM email_outbox
    WHERE source_event_id=?`).get(collisionRefund.id).count, 0);
  assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM audit_log
    WHERE id=?`).get(`audit_refund_${collisionRefund.id}`).count, 0);
  assert.deepEqual({ ...context.database.prepare(`SELECT orders.status AS order_status,
    payments.status AS payment_status FROM orders INNER JOIN payments
      ON payments.order_id=orders.id WHERE orders.id=?`).get(order.orderId) }, {
    order_status: "shipped",
    payment_status: "succeeded",
  });

  const d03Emails = context.database.prepare(`SELECT kind, source_event_id,
    template_version, payload_json
    FROM email_outbox WHERE kind IN (
      'withdrawal_acknowledgement','shipment_confirmation','refund_confirmation'
    ) ORDER BY kind`).all();
  assert.deepEqual(d03Emails.map((email) => email.kind), [
    "refund_confirmation",
    "refund_confirmation",
    "shipment_confirmation",
    "withdrawal_acknowledgement",
  ]);
  const refundEmails = d03Emails.filter((email) => email.kind === "refund_confirmation");
  assert.ok(refundEmails.every((email) => email.template_version === "refund-success-v2"));
  assert.ok(refundEmails.every((email) => /AJL-AV-2026-00000[12]/.test(email.payload_json)));
  const rights = new D1DataRightsStore(context.d1);
  await rights.createRequest({
    id: "rights_flow",
    kind: "export",
    actor: guest,
    idempotencyKey: "rights:flow",
    now: "2026-08-11T12:22:00.000Z",
  });
  const exported = await rights.exportAllowlistedData({
    requestId: "rights_flow",
    actor: guest,
    now: "2026-08-11T12:22:01.000Z",
  });
  assert.equal(exported.order.fulfillment.shipment.status, "delivered");
  assert.equal(exported.order.fulfillment.returns.length, 2);
  assert.equal(exported.order.fulfillment.refunds[0].status, "succeeded");
  assert.doesNotMatch(JSON.stringify(exported), /receiptFingerprint|providerShipment|actor_admin|sessionId|manualReference|metadata_json/i);
  assert.doesNotMatch(
    context.database.prepare("SELECT group_concat(metadata_json, '') AS value FROM audit_log").get().value,
    /CUSTOMS-FLOW-1|@example\.com|tracking_flow|provider_/i,
  );
  assert.deepEqual(context.database.prepare("PRAGMA foreign_key_check").all(), []);
  context.database.close();
});
