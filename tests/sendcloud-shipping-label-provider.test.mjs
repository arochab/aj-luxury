import assert from "node:assert/strict";
import test from "node:test";

import {
  FulfillmentProviderError,
  normalizeShippingAddress,
} from "../lib/commerce/fulfillment-domain.ts";
import { createSendcloudShippingLabelProvider } from "../lib/commerce/sendcloud-shipping-label-provider.ts";
import { productionShippingLabelAdminResponse } from "../worker/production-shipping-label-admin-api.ts";

const request = Object.freeze({
  shipmentId: "shipment_test_1",
  orderId: "order_test_1",
  shippingQuoteId: "quote_test_1",
  idempotencyKey: "shipment:test:0001",
});

class Statement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }
  bind(...values) { return new Statement(this.database, this.query, values); }
  async first() {
    if (this.query.includes("FROM shipments AS shipment")) return this.database.context;
    if (this.query.includes("FROM shipments WHERE idempotency_key")) return this.database.existing ?? null;
    throw new Error(`unexpected first query: ${this.query}`);
  }
  async all() {
    if (this.query.includes("FROM order_lines")) {
      return { success: true, results: this.database.lines, meta: { changes: 0 } };
    }
    throw new Error(`unexpected all query: ${this.query}`);
  }
  async run() { throw new Error(`unexpected run query: ${this.query}`); }
}

class Database {
  constructor(context, lines) {
    this.context = context;
    this.lines = lines;
    this.existing = null;
  }
  prepare(query) { return new Statement(this, query); }
  async batch() { throw new Error("unexpected batch"); }
}

const configuration = Object.freeze({
  publicKey: "public-test-key",
  secretKey: "secret-test-key-at-least-16",
  senderAddressId: "12345",
  originAddressAttestation: "3 A rue Principale|67130|Belmont|FR",
  referenceVault: {},
});

function references(overrides = {}) {
  return {
    async open(kind, ownerId) {
      if (kind === "delivery_quote") {
        return JSON.stringify(["checkout-config", "delivery-method", "colissimo", "colissimo:home"]);
      }
      if (kind === "service_point" && ownerId === "point_internal_1") return "98765";
      throw new Error("reference unavailable");
    },
    ...overrides,
  };
}

async function fixture(overrides = {}) {
  const address = await normalizeShippingAddress(overrides.address ?? {
    recipient: "Ada Client",
    line1: "1 rue du Test",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
  });
  const context = {
    attempts: 1,
    order_number: "AJ-TEST-0001",
    email: "client@example.com",
    status: "paid",
    currency: "EUR",
    subtotal_cents: 2999,
    total_cents: 3699,
    shipping_address_json: address.canonicalJson,
    shipping_address_fingerprint: address.fingerprint,
    option_id: "delivery_option_1",
    provider_code: "sendcloud",
    carrier_code: "colissimo",
    service_code: "colissimo:home",
    delivery_mode: "home",
    selected_service_point_id: null,
    zone: address.zone,
    profile_code: "AJL_ENVELOPE_1_ITEM_V1",
    source_version: "client-validated-2026-08-13",
    item_count: 1,
    weight_grams: 150,
    length_mm: 400,
    width_mm: 320,
    height_mm: 40,
    ...overrides.context,
  };
  const lines = overrides.lines ?? [{
    id: "order_line_1",
    internal_reference: "AJL-BOXER-POURPRE-M",
    product_name: "Boxer AJ Luxury",
    color_name: "Pourpre",
    size: "M",
    quantity: 1,
    unit_price_cents: 2999,
    line_total_cents: 2999,
  }];
  return { address, context, database: new Database(context, lines) };
}

function receipt(overrides = {}) {
  const parcelId = overrides.parcelId ?? 383707309;
  const tracking = overrides.tracking ?? "3S123456789";
  return {
    data: {
      id: "sendcloud-shipment-1",
      label_details: { mime_type: "application/pdf", dpi: 72 },
      order_number: "AJ-TEST-0001",
      parcels: [{
        id: parcelId,
        status: { code: "READY_TO_SEND", message: "Ready" },
        documents: [{
          type: "label",
          size: "a6",
          link: `https://panel.sendcloud.sc/api/v3/parcels/${parcelId}/documents/label`,
        }],
        tracking_number: tracking,
        tracking_numbers: [{ tracking_number: tracking }],
      }],
      carrier: { code: "colissimo", name: "Colissimo" },
      errors: [],
      ...overrides.data,
    },
  };
}

test("Sendcloud v3 announces one EU parcel with exact external id and proves one A6 PDF label", async () => {
  const context = await fixture();
  let captured;
  const provider = createSendcloudShippingLabelProvider(
    context.database,
    configuration,
    async (url, init) => {
      captured = { url: String(url), init, body: JSON.parse(init.body) };
      return Response.json(receipt(), { status: 201 });
    },
    references(),
  );
  const result = await provider.createLabel(request);
  assert.equal(captured.url, "https://panel.sendcloud.sc/api/v3/shipments/announce");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.body.external_reference_id, request.idempotencyKey);
  assert.equal(captured.body.reference, request.shipmentId);
  assert.deepEqual(captured.body.label_details, { mime_type: "application/pdf", dpi: 72 });
  assert.deepEqual(captured.body.from_address, { sender_address_id: 12345 });
  assert.deepEqual(captured.body.ship_with, {
    type: "shipping_option_code",
    properties: { shipping_option_code: "colissimo:home" },
  });
  assert.equal(captured.body.parcels.length, 1);
  assert.deepEqual(captured.body.parcels[0], {
    dimensions: { length: "40.00", width: "32.00", height: "4.00", unit: "cm" },
    weight: { value: "0.150", unit: "kg" },
  });
  assert.equal("to_service_point" in captured.body, false);
  assert.equal("customs_information" in captured.body, false);
  assert.equal(result.providerCode, "sendcloud");
  assert.equal(result.providerShipmentReference, "sendcloud-shipment-1");
  assert.equal(result.trackingReference, "3S123456789");
  assert.match(result.receiptFingerprint, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(result), /documents\/label|panel\.sendcloud/);
});

test("relay delivery decrypts and sends only the exact selected Sendcloud point", async () => {
  const context = await fixture({
    context: {
      delivery_mode: "service_point",
      selected_service_point_id: "point_internal_1",
    },
  });
  let body;
  const provider = createSendcloudShippingLabelProvider(
    context.database,
    configuration,
    async (_url, init) => {
      body = JSON.parse(init.body);
      return Response.json(receipt(), { status: 201 });
    },
    references(),
  );
  await provider.createLabel(request);
  assert.deepEqual(body.to_service_point, { id: 98765 });
});

test("UK, US and Canada remain hard-closed before any carrier call", async () => {
  const context = await fixture({
    address: {
      recipient: "Ada Client",
      line1: "1 Test Street",
      postalCode: "SW1A 1AA",
      city: "London",
      countryCode: "GB",
    },
  });
  let calls = 0;
  const provider = createSendcloudShippingLabelProvider(
    context.database,
    configuration,
    async () => { calls += 1; throw new Error("must not call"); },
    references(),
  );
  await assert.rejects(
    () => provider.createLabel(request),
    (error) => error instanceof FulfillmentProviderError && error.outcome === "rejected",
  );
  assert.equal(calls, 0);
});

test("a second lease after an unknown outcome never performs a blind retry", async () => {
  const context = await fixture({ context: { attempts: 2 } });
  let calls = 0;
  const provider = createSendcloudShippingLabelProvider(
    context.database,
    configuration,
    async () => { calls += 1; return Response.json(receipt(), { status: 201 }); },
    references(),
  );
  await assert.rejects(
    () => provider.createLabel(request),
    (error) => error instanceof FulfillmentProviderError && error.outcome === "ambiguous",
  );
  assert.equal(calls, 0);
});

test("timeout, 5xx, unparsed 409 and malformed success all require manual reconciliation", async (t) => {
  for (const [name, fetchImpl] of [
    ["timeout", async () => { throw new DOMException("timeout", "TimeoutError"); }],
    ["5xx", async () => Response.json({ error: "temporary" }, { status: 503 })],
    ["throttled", async () => Response.json({ error: "rate-limited" }, { status: 429 })],
    ["unexpected-async", async () => Response.json({ data: { status: "queued" } }, { status: 202 })],
    ["409", async () => Response.json(receipt(), { status: 409 })],
    ["malformed-success", async () => Response.json(receipt({ data: { errors: [{ code: "x" }] } }), { status: 201 })],
    ["non-a6", async () => {
      const value = receipt();
      value.data.parcels[0].documents[0].size = "a4";
      return Response.json(value, { status: 201 });
    }],
  ]) {
    await t.test(name, async () => {
      const context = await fixture();
      const provider = createSendcloudShippingLabelProvider(
        context.database,
        configuration,
        fetchImpl,
        references(),
      );
      await assert.rejects(
        () => provider.createLabel(request),
        (error) => error instanceof FulfillmentProviderError && error.outcome === "ambiguous",
      );
    });
  }
});

const releaseSha = "a".repeat(40);
const adminEnv = Object.freeze({
  APP_ENV: "production",
  COMMERCE_MODE: "controlled",
  COMMERCE_RELEASE_SHA: releaseSha,
  COMMERCE_ORIGIN: "https://ajluxurystore.com",
  COMMERCE_ADAM_APPROVAL_SHA: releaseSha,
  COMMERCE_JEREMY_APPROVAL_SHA: releaseSha,
  STOCK_MANIFEST_ID: "stock-launch-20260815",
  STOCK_MANIFEST_SHA256: "b".repeat(64),
  STOCK_MANIFEST_APPROVED_BY: "jeremy",
  PAYMENT_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: "sk_live_redacted",
  STRIPE_WEBHOOK_SECRET: "whsec_redacted",
  DELIVERY_PROVIDER: "sendcloud",
  SENDCLOUD_API_VERSION: "3",
  SENDCLOUD_PUBLIC_KEY: "public-redacted",
  SENDCLOUD_SECRET_KEY: "secret-redacted-at-least-16",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_redacted",
  RESEND_WEBHOOK_SECRET: "whsec_resend_redacted",
  TRANSACTIONAL_FROM_EMAIL: "commandes@ajluxurystore.com",
  SELLER_LEGAL_IDENTITY_APPROVED: "true",
  TAX_DUTY_POLICY_APPROVED: "true",
  RETURNS_POLICY_APPROVED: "true",
  BACKUP_RESTORE_DRILL_APPROVED: "true",
  MONITORING_ALERTS_APPROVED: "true",
  COMMERCE_CONTROLLED_OWNER_EMAIL: "adam@example.com",
});

function adminRequest(headers = {}) {
  return new Request(
    "https://ajluxurystore.com/api/commerce/admin/orders/order_test_1/shipping-label",
    {
      method: "POST",
      headers: {
        Origin: "https://ajluxurystore.com",
        "Sec-Fetch-Site": "same-origin",
        "Idempotency-Key": "shipment:test:0001",
        "oai-authenticated-user-email": "adam@example.com",
        "oai-authenticated-user-id": "owner-1",
        ...headers,
      },
    },
  );
}

test("operator route is owner-only and never touches D1 for an unauthenticated caller", async () => {
  const DB = { prepare() { throw new Error("D1 must not be touched"); }, batch() { throw new Error("D1 must not be touched"); } };
  const response = await productionShippingLabelAdminResponse(
    adminRequest({ "oai-authenticated-user-email": "intruder@example.com" }),
    { ...adminEnv, DB },
  );
  assert.equal(response.status, 403);
});

test("platform owner headers alone cannot bypass the durable owner session and CSRF gate", async () => {
  const DB = { prepare() { throw new Error("D1 must not be touched without cookies"); }, batch() { throw new Error("D1 must not be touched"); } };
  const response = await productionShippingLabelAdminResponse(
    adminRequest(),
    { ...adminEnv, DB },
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "OWNER_SESSION_REQUIRED");
});

test("operator route hard-stops an already claimed shipment for manual reconciliation", async () => {
  const DB = new Database(null, []);
  DB.existing = {
    id: "shipment_test_1",
    order_id: "order_test_1",
    status: "label_claimed",
    attempts: 1,
    provider_shipment_reference: null,
    tracking_reference: null,
  };
  let providerCalls = 0;
  const response = await productionShippingLabelAdminResponse(
    adminRequest(),
    { ...adminEnv, DB },
    {
      authorizeOwner: async () => true,
      shippingLabelProvider: { async createLabel() { providerCalls += 1; throw new Error("must not call"); } },
    },
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "MANUAL_RECONCILIATION_REQUIRED");
  assert.equal(providerCalls, 0);
});
