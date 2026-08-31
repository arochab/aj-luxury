import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import { FulfillmentError } from "../lib/commerce/fulfillment-domain.ts";
import {
  dispatchProductionOutboundShipments,
  dispatchProductionVerifiedPaidOrderEmails,
  dispatchProductionTransactionalEmails,
  dispatchProductionLatePaymentRefunds,
  expireProductionReservations,
  productionOperationsApiResponse,
} from "../worker/production-operations-api.ts";
import {
  productionEmailDispatchRuntimeConfigured,
  productionEmailReconciliationRuntimeConfigured,
  productionEmailReconciliationRuntimeInstalled,
  productionOperationsRuntimeInstalled,
  productionResendRuntimeInstalled,
} from "../worker/production-operations-runtime.ts";
import {
  controlledRequestAuthorization,
} from "../worker/production-commerce-api.ts";

const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));

const releaseSha = "a".repeat(40);
const controlledSecret = "controlled-auth-secret-value-ops-0001";
const origin = "https://ajluxurystore.com";
const schemaObjects = Object.freeze([
  { type: "table", name: "commerce_operations_schema_installations", table_name: "commerce_operations_schema_installations" },
  { type: "trigger", name: "trg_commerce_operations_schema_0016_immutable_update", table_name: "commerce_operations_schema_installations" },
  { type: "trigger", name: "trg_commerce_operations_schema_0016_retain_delete", table_name: "commerce_operations_schema_installations" },
  { type: "trigger", name: "trg_return_requests_transition", table_name: "return_requests" },
]);
const sentinel = Object.freeze({
  version: "0016_return_operator_state_machine",
  contract: "received-approved-goods_received-inspected-v1",
  installed_at: "2026-08-15T00:00:00.000Z",
});
const resendSchemaObjects = Object.freeze([
  { type: "index", name: "idx_resend_webhook_message_time", table_name: "resend_webhook_events" },
  { type: "index", name: "ux_email_outbox_provider_message_id", table_name: "email_outbox" },
  { type: "table", name: "resend_webhook_events", table_name: "resend_webhook_events" },
  { type: "trigger", name: "trg_email_outbox_provider_message_transition", table_name: "email_outbox" },
  { type: "trigger", name: "trg_resend_webhook_events_immutable_update", table_name: "resend_webhook_events" },
  { type: "trigger", name: "trg_resend_webhook_events_retain_delete", table_name: "resend_webhook_events" },
  { type: "trigger", name: "trg_resend_webhook_events_validate_insert", table_name: "resend_webhook_events" },
]);
const resendSchemaColumns = Object.freeze([
  "email_outbox:provider_message_id",
  "resend_webhook_events:event_type",
  "resend_webhook_events:id",
  "resend_webhook_events:occurred_at",
  "resend_webhook_events:payload_sha256",
  "resend_webhook_events:provider_message_id",
  "resend_webhook_events:received_at",
]);
const reconciliationSchemaObjects = Object.freeze([
  { type: "index", name: "idx_email_delivery_provider_evidence_time", table_name: "email_delivery_provider_evidence" },
  { type: "index", name: "ux_email_delivery_provider_evidence_message", table_name: "email_delivery_provider_evidence" },
  { type: "index", name: "ux_email_delivery_provider_evidence_outbox", table_name: "email_delivery_provider_evidence" },
  { type: "table", name: "email_delivery_provider_evidence", table_name: "email_delivery_provider_evidence" },
  { type: "trigger", name: "trg_email_delivery_provider_evidence_immutable_update", table_name: "email_delivery_provider_evidence" },
  { type: "trigger", name: "trg_email_delivery_provider_evidence_retain_delete", table_name: "email_delivery_provider_evidence" },
  { type: "trigger", name: "trg_email_delivery_provider_evidence_validate_insert", table_name: "email_delivery_provider_evidence" },
]);
const reconciliationSchemaColumns = Object.freeze([
  "id",
  "outbox_id",
  "provider_created_at",
  "provider_last_event",
  "provider_message_id",
  "reconciled_at",
  "reconciled_by_admin_id",
  "reconciliation_source",
]);

function statement(database, query, values = []) {
  return {
    bind(...next) { return statement(database, query, next); },
    async all() {
      if (/idx_email_delivery_provider_evidence_time/.test(query)) {
        return { success: true, results: reconciliationSchemaObjects, meta: { changes: 0 } };
      }
      if (/pragma_table_info\('email_delivery_provider_evidence'\)/.test(query)) {
        return {
          success: true,
          results: reconciliationSchemaColumns.map((name) => ({ name })),
          meta: { changes: 0 },
        };
      }
      if (/idx_resend_webhook_message_time/.test(query)) {
        return { success: true, results: resendSchemaObjects, meta: { changes: 0 } };
      }
      if (/pragma_table_info\('resend_webhook_events'\)/.test(query)) {
        return {
          success: true,
          results: resendSchemaColumns.map((signature) => ({ signature })),
          meta: { changes: 0 },
        };
      }
      if (/sqlite_master/.test(query)) return { success: true, results: schemaObjects, meta: { changes: 0 } };
      if (/status = 'sending'/.test(query)) return { success: true, results: [], meta: { changes: 0 } };
      throw new Error(`Unexpected all query: ${query}`);
    },
    async first() {
      if (/commerce_operations_schema_installations/.test(query)) return sentinel;
      if (/AS payment_succeeded/.test(query)) {
        return {
          status: "paid",
          paid_at: "2026-08-15T08:00:00.000Z",
          payment_succeeded: 1,
          shipment_status: "delivered",
          delivered_at: "2026-08-15T08:30:00.000Z",
          existing_order_id: null,
        };
      }
      throw new Error(`Unexpected first query: ${query} ${JSON.stringify(values)}`);
    },
    async run() { throw new Error(`Unexpected run query: ${query}`); },
  };
}

function database() {
  const db = {
    queries: [],
    prepare(query) {
      this.queries.push(query);
      return statement(this, query);
    },
    async batch(statements) {
      return statements.map(() => ({
        success: true,
        results: [],
        meta: { changes: 0 },
      }));
    },
  };
  return db;
}

class SQLiteD1Statement {
  constructor(sqlite, query, values = []) {
    this.sqlite = sqlite;
    this.query = query;
    this.values = values;
  }
  bind(...values) { return new SQLiteD1Statement(this.sqlite, this.query, values); }
  async first() { return this.sqlite.prepare(this.query).get(...this.values) ?? null; }
  async all() {
    return {
      success: true,
      results: this.sqlite.prepare(this.query).all(...this.values),
      meta: { changes: 0 },
    };
  }
  async run() {
    const result = this.sqlite.prepare(this.query).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
  async executeForBatch() {
    return /^\s*(?:SELECT|PRAGMA|WITH\b)/i.test(this.query)
      ? this.all()
      : this.run();
  }
}

class SQLiteD1Database {
  #tail = Promise.resolve();
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(query) { return new SQLiteD1Statement(this.sqlite, query); }
  batch(statements) {
    const execute = () => this.#runBatch(statements);
    const result = this.#tail.then(execute, execute);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }
  async #runBatch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.executeForBatch());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

function reservationExpiryFixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const name of readdirSync(drizzleDirectory)
    .filter((candidate) => /^000[0-4]_.+\.sql$/.test(candidate))
    .sort()) {
    const migration = readFileSync(`${drizzleDirectory}${name}`, "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement.trim());
    }
  }
  const d1 = new SQLiteD1Database(sqlite);
  return { sqlite, d1, store: new D1CommerceStore(d1) };
}

function controlledEnv(db = database()) {
  return {
    APP_ENV: "production",
    COMMERCE_MODE: "controlled",
    COMMERCE_RELEASE_SHA: releaseSha,
    COMMERCE_ORIGIN: origin,
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
    SENDCLOUD_SECRET_KEY: "secret-redacted",
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_redacted",
    RESEND_WEBHOOK_SECRET: "whsec_resend_redacted",
    TRANSACTIONAL_FROM_EMAIL: "commandes@ajluxurystore.com",
    TRANSACTIONAL_FROM_NAME: "AJ Luxury",
    SELLER_LEGAL_IDENTITY_APPROVED: "true",
    TAX_DUTY_POLICY_APPROVED: "true",
    RETURNS_POLICY_APPROVED: "true",
    BACKUP_RESTORE_DRILL_APPROVED: "true",
    MONITORING_ALERTS_APPROVED: "true",
    COMMERCE_CONTROLLED_OWNER_EMAIL: "owner@example.com",
    COMMERCE_CONTROLLED_AUTH_HMAC_SECRET: controlledSecret,
    RETURNS_WORKFLOW_ENABLED: "true",
    RESERVATION_EXPIRY_ENABLED: "true",
    COMMERCE_REPORTING_ENABLED: "true",
    SHIPMENT_HANDOVER_ENABLED: "true",
    OPERATOR_RATE_LIMITER: {
      async limit() { return { success: true }; },
    },
    DB: db,
  };
}

function automaticShippingEnv(db = database()) {
  return {
    ...controlledEnv(db),
    OUTBOUND_SHIPMENT_CREATION_ENABLED: "true",
    AUTOMATIC_OUTBOUND_SHIPMENT_ENABLED: "true",
    SENDCLOUD_SECRET_KEY: "sendcloud-secret-redacted-0001",
    SENDCLOUD_SENDER_ADDRESS_ID: "123456",
    SENDCLOUD_SENDER_ADDRESS_ATTESTATION: "3 A rue Principale|67130|Belmont|FR",
    DELIVERY_REFERENCE_ENCRYPTION_KEY_BASE64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    DELIVERY_REFERENCE_KEY_VERSION: "1",
    DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON: "{}",
  };
}

async function ownerHeaders(method, pathname) {
  const timestamp = Math.floor(Date.now() / 1_000);
  return {
    "oai-authenticated-user-email": "owner@example.com",
    "oai-authenticated-user-id": "owner-ops-1",
    "X-AJ-Controlled-Authorization": await controlledRequestAuthorization(
      controlledSecret,
      { method, pathname, ownerEmail: "owner@example.com", timestamp },
    ),
  };
}

function guestHeaders(csrf = "B".repeat(43)) {
  return {
    Cookie: `__Host-aj_guest_order=${"A".repeat(43)}; __Host-aj_guest_order_csrf=${csrf}`,
    Origin: origin,
    "Sec-Fetch-Site": "same-origin",
    "X-CSRF-Token": csrf,
  };
}

function adminHeaders(csrf = "D".repeat(43)) {
  return {
    Cookie: `__Host-aj_admin=${"C".repeat(43)}; __Host-aj_admin_csrf=${csrf}`,
    Origin: origin,
    "Sec-Fetch-Site": "same-origin",
    "X-CSRF-Token": csrf,
  };
}

test("operations schema proof rejects missing, altered and prefix-colliding sentinels", async () => {
  assert.equal(await productionOperationsRuntimeInstalled(database()), true);
  const altered = database();
  altered.prepare = function prepare(query) {
    if (/sqlite_master/.test(query)) {
      return { async all() { return { results: [...schemaObjects, { ...schemaObjects[0], name: `${schemaObjects[0].name}_shadow` }] }; } };
    }
    return { async first() { return sentinel; } };
  };
  assert.equal(await productionOperationsRuntimeInstalled(altered), false);
  const wrongSentinel = database();
  wrongSentinel.prepare = function prepare(query) {
    if (/sqlite_master/.test(query)) return { async all() { return { results: schemaObjects }; } };
    return { async first() { return { ...sentinel, contract: "weaker-contract" }; } };
  };
  assert.equal(await productionOperationsRuntimeInstalled(wrongSentinel), false);
});

test("Resend runtime proof requires the exact 0018 objects and columns", async () => {
  assert.equal(await productionResendRuntimeInstalled(database()), true);
  const missingTrigger = database();
  missingTrigger.prepare = function prepare(query) {
    if (/idx_resend_webhook_message_time/.test(query)) {
      return {
        async all() {
          return { results: resendSchemaObjects.filter((row) => row.type !== "trigger") };
        },
      };
    }
    if (/pragma_table_info\('resend_webhook_events'\)/.test(query)) {
      return {
        async all() {
          return { results: resendSchemaColumns.map((signature) => ({ signature })) };
        },
      };
    }
    throw new Error(`Unexpected query: ${query}`);
  };
  assert.equal(await productionResendRuntimeInstalled(missingTrigger), false);
});

test("Resend runtime proof accepts the real 0018 migration objects", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const name of ["0000_flimsy_rhino.sql", "0018_volatile_blob.sql"]) {
    const migration = readFileSync(`${drizzleDirectory}${name}`, "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement.trim());
    }
  }
  assert.equal(
    await productionResendRuntimeInstalled(new SQLiteD1Database(sqlite)),
    true,
  );
  sqlite.close();
});

test("email reconciliation runtime proof requires the exact immutable evidence schema", async () => {
  assert.equal(await productionEmailReconciliationRuntimeInstalled(database()), true);
  const missingRetentionTrigger = database();
  missingRetentionTrigger.prepare = function prepare(query) {
    if (/idx_email_delivery_provider_evidence_time/.test(query)) {
      return {
        async all() {
          return {
            results: reconciliationSchemaObjects.filter((row) =>
              row.name !== "trg_email_delivery_provider_evidence_retain_delete"),
          };
        },
      };
    }
    if (/pragma_table_info\('email_delivery_provider_evidence'\)/.test(query)) {
      return {
        async all() {
          return { results: reconciliationSchemaColumns.map((name) => ({ name })) };
        },
      };
    }
    throw new Error(`Unexpected query: ${query}`);
  };
  assert.equal(
    await productionEmailReconciliationRuntimeInstalled(missingRetentionTrigger),
    false,
  );
});

test("email reconciliation runtime proof accepts the real 0027 migration objects", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const name of ["0000_flimsy_rhino.sql", "0027_puzzling_war_machine.sql"]) {
    const migration = readFileSync(`${drizzleDirectory}${name}`, "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement.trim());
    }
  }
  assert.equal(
    await productionEmailReconciliationRuntimeInstalled(new SQLiteD1Database(sqlite)),
    true,
  );
  sqlite.close();
});

test("email readiness matches the scheduled dispatcher configuration exactly", () => {
  const active = {
    ...controlledEnv(),
    TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: "true",
    TRANSACTIONAL_EMAIL_DISPATCH_MODE: "controlled",
  };
  assert.equal(productionEmailDispatchRuntimeConfigured(active), true);
  assert.equal(productionEmailDispatchRuntimeConfigured({ ...active, TRANSACTIONAL_FROM_NAME: "" }), false);
  assert.equal(productionEmailDispatchRuntimeConfigured({ ...active, TRANSACTIONAL_EMAIL_DISPATCH_MODE: "live" }), false);
  assert.equal(productionEmailDispatchRuntimeConfigured({ ...active, TRANSACTIONAL_FROM_EMAIL: "orders@example.com" }), false);
  assert.equal(productionEmailDispatchRuntimeConfigured({ ...active, TRANSACTIONAL_REPLY_TO: "invalid mailbox" }), false);
  assert.equal(productionEmailDispatchRuntimeConfigured({ ...active, COMMERCE_MODE: "closed" }), false);
  assert.equal(productionEmailDispatchRuntimeConfigured({ ...active, COMMERCE_MODE: "closed" }, true), true);

  const reconciliation = {
    ...controlledEnv(),
    TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: "false",
    TRANSACTIONAL_EMAIL_RECONCILIATION_ENABLED: "true",
  };
  assert.equal(productionEmailReconciliationRuntimeConfigured(reconciliation), true);
  assert.equal(productionEmailReconciliationRuntimeConfigured({
    ...reconciliation,
    COMMERCE_MODE: "closed",
  }), true);
  assert.equal(productionEmailReconciliationRuntimeConfigured({
    ...reconciliation,
    TRANSACTIONAL_EMAIL_RECONCILIATION_ENABLED: "false",
  }), false);
});

test("customer return is bound to an exact guest session, paid delivery and idempotency key", async () => {
  const path = "/api/commerce/returns";
  const seen = [];
  const response = await productionOperationsApiResponse(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: {
        ...(await ownerHeaders("POST", path)),
        ...guestHeaders(),
        "Content-Type": "application/json",
        "Idempotency-Key": "return-create-0001",
      },
      body: JSON.stringify({
        orderId: "order_paid_1",
        kind: "return",
        locale: "fr",
        lines: [{ orderLineId: "order_line_1", quantity: 1 }],
      }),
    }),
    controlledEnv(),
    {
      now: () => "2026-08-15T09:00:00.000Z",
      returns: {
        async createReturnRequest(input) {
          seen.push(input);
          return {
            id: input.id,
            order_id: input.orderId,
            kind: input.kind,
            status: "received",
          };
        },
        async approveReturnRequest() { throw new Error("not-called"); },
        async completeReturnInspection() { throw new Error("not-called"); },
      },
    },
  );
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.match(payload.data.requestId, /^return_[0-9a-f]{64}$/);
  assert.deepEqual({
    orderId: payload.data.orderId,
    status: payload.data.status,
    refundCreated: payload.data.refundCreated,
    returnLabelCreated: payload.data.returnLabelCreated,
  }, {
    orderId: "order_paid_1",
    status: "received",
    refundCreated: false,
    returnLabelCreated: false,
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].actor.kind, "guest-order");
  assert.doesNotMatch(JSON.stringify(payload), /@|address|tracking|provider/i);
});

test("return route rejects duplicate sessions, excess lines and unauthenticated controlled calls", async () => {
  const path = "/api/commerce/returns";
  const baseBody = JSON.stringify({
    orderId: "order_paid_1",
    kind: "return",
    locale: "fr",
    lines: [{ orderLineId: "order_line_1", quantity: 1 }],
  });
  const unauthenticatedDatabase = database();
  const unauthenticated = await productionOperationsApiResponse(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: {
        ...guestHeaders(),
        "Content-Type": "application/json",
        "Idempotency-Key": "return-create-0002",
      },
      body: baseBody,
    }),
    controlledEnv(unauthenticatedDatabase),
  );
  assert.equal(unauthenticated.status, 403);
  assert.equal(unauthenticatedDatabase.queries.length, 0);

  const duplicate = await productionOperationsApiResponse(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: {
        ...(await ownerHeaders("POST", path)),
        ...guestHeaders(),
        Cookie: `${guestHeaders().Cookie}; __Host-aj_guest_order=${"E".repeat(43)}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "return-create-0003",
      },
      body: baseBody,
    }),
    controlledEnv(),
  );
  assert.equal(duplicate.status, 403);

  const excess = await productionOperationsApiResponse(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: {
        ...(await ownerHeaders("POST", path)),
        ...guestHeaders(),
        "Content-Type": "application/json",
        "Idempotency-Key": "return-create-0004",
      },
      body: JSON.stringify({
        orderId: "order_paid_1",
        kind: "return",
        locale: "fr",
        lines: [
          { orderLineId: "line_1", quantity: 1 },
          { orderLineId: "line_2", quantity: 1 },
          { orderLineId: "line_3", quantity: 1 },
          { orderLineId: "line_4", quantity: 1 },
        ],
      }),
    }),
    controlledEnv(),
  );
  assert.equal(excess.status, 400);
});

test("owner approval and inspection require HMAC plus D1 owner session and create no provider side effect", async () => {
  const requestId = `return_${"1".repeat(64)}`;
  const approvals = [];
  const inspections = [];
  const returns = {
    async createReturnRequest() { throw new Error("not-called"); },
    async approveReturnRequest(input) {
      approvals.push(input);
      return { id: input.requestId, order_id: "order_1", kind: "return", status: "approved" };
    },
    async completeReturnInspection(input) { inspections.push(input); },
  };
  const approvePath = `/api/commerce/admin/returns/${requestId}/approve`;
  const approve = await productionOperationsApiResponse(
    new Request(`${origin}${approvePath}`, {
      method: "POST",
      headers: {
        ...(await ownerHeaders("POST", approvePath)),
        ...adminHeaders(),
        "Idempotency-Key": `return-approve:${requestId}`,
      },
    }),
    controlledEnv(),
    {
      now: () => "2026-08-15T09:00:00.000Z",
      authorizeOwner: async () => true,
      returns,
    },
  );
  assert.equal(approve.status, 200);
  assert.equal((await approve.json()).data.refundCreated, false);
  assert.equal(approvals.length, 1);

  const inspectPath = `/api/commerce/admin/returns/${requestId}/inspect`;
  const inspect = await productionOperationsApiResponse(
    new Request(`${origin}${inspectPath}`, {
      method: "POST",
      headers: {
        ...(await ownerHeaders("POST", inspectPath)),
        ...adminHeaders(),
        "Content-Type": "application/json",
        "Idempotency-Key": `return-inspect:${requestId}`,
      },
      body: JSON.stringify({
        lines: [{
          returnLineId: `return_line_${"2".repeat(64)}`,
          receivedQuantity: 1,
          sellableQuantity: 1,
          nonSellableQuantity: 0,
          restockedQuantity: 1,
        }],
      }),
    }),
    controlledEnv(),
    {
      now: () => "2026-08-15T09:01:00.000Z",
      authorizeOwner: async () => true,
      returns,
    },
  );
  assert.equal(inspect.status, 200);
  assert.deepEqual(await inspect.json(), {
    data: {
      requestId,
      status: "inspected",
      refundCreated: false,
      returnLabelCreated: false,
    },
  });
  assert.equal(inspections.length, 1);

  const wrongHmacDatabase = database();
  const wrongHmac = await productionOperationsApiResponse(
    new Request(`${origin}${approvePath}`, {
      method: "POST",
      headers: {
        ...adminHeaders(),
        "Idempotency-Key": `return-approve:${requestId}`,
      },
    }),
    controlledEnv(wrongHmacDatabase),
  );
  assert.equal(wrongHmac.status, 403);
  assert.equal(wrongHmacDatabase.queries.length, 0);
});

test("owner handover route records one real handover and queues confirmation idempotently", async () => {
  const shipmentId = "shipment_paid_1";
  const eventId = "handover_receipt_1";
  const path = `/api/commerce/admin/shipments/${shipmentId}/handover`;
  const calls = [];
  const shipments = {
    async handoverShipment(input) {
      calls.push(input);
      return { created: calls.length === 1 };
    },
  };
  const makeRequest = async () => new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      ...(await ownerHeaders("POST", path)),
      ...adminHeaders(),
      "Content-Type": "application/json",
      "Idempotency-Key": `shipment-handover:${eventId}`,
    },
    body: JSON.stringify({ eventId, locale: "fr" }),
  });
  const first = await productionOperationsApiResponse(
    await makeRequest(),
    controlledEnv(),
    {
      now: () => "2026-08-15T09:00:00.000Z",
      authorizeOwner: async () => true,
      shipments,
    },
  );
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    data: {
      shipmentId,
      status: "handed_over",
      confirmationQueued: true,
      replayed: false,
    },
  });
  const replay = await productionOperationsApiResponse(
    await makeRequest(),
    controlledEnv(),
    {
      now: () => "2026-08-15T09:01:00.000Z",
      authorizeOwner: async () => true,
      shipments,
    },
  );
  assert.deepEqual((await replay.json()).data, {
    shipmentId,
    status: "handed_over",
    confirmationQueued: true,
    replayed: true,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].shipmentId, shipmentId);
  assert.equal(calls[0].eventId, eventId);
  assert.equal(calls[0].actor.kind, "admin");

  const disabledDatabase = database();
  const disabled = await productionOperationsApiResponse(
    await makeRequest(),
    { ...controlledEnv(disabledDatabase), SHIPMENT_HANDOVER_ENABLED: "false" },
  );
  assert.equal(disabled.status, 503);
  assert.equal((await disabled.json()).error.code, "SHIPMENT_HANDOVER_NOT_ACTIVATED");
  assert.equal(disabledDatabase.queries.length, 0);

  const unauthenticatedDatabase = database();
  const unauthenticated = await productionOperationsApiResponse(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: {
        ...adminHeaders(),
        "Content-Type": "application/json",
        "Idempotency-Key": `shipment-handover:${eventId}`,
      },
      body: JSON.stringify({ eventId, locale: "fr" }),
    }),
    controlledEnv(unauthenticatedDatabase),
  );
  assert.equal(unauthenticated.status, 403);
  assert.equal(unauthenticatedDatabase.queries.length, 0);

  const liveWithoutMfaDatabase = database();
  const liveWithoutMfa = await productionOperationsApiResponse(
    await makeRequest(),
    { ...controlledEnv(liveWithoutMfaDatabase), COMMERCE_MODE: "live" },
  );
  assert.equal(liveWithoutMfa.status, 503);
  assert.equal((await liveWithoutMfa.json()).error.code, "OPERATOR_MFA_NOT_ACTIVATED");
  assert.equal(liveWithoutMfaDatabase.queries.length, 0);
});

test("owner email reconciliation records exact provider evidence and never resends", async () => {
  const outboxId = "outbox_payment_1";
  const providerMessageId = "email_delivered_1";
  const path = `/api/commerce/admin/email-outbox/${outboxId}/reconcile`;
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${outboxId}\0${providerMessageId}`),
  ));
  const identity = Array.from(
    digest,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const calls = [];
  const response = await productionOperationsApiResponse(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: {
        ...(await ownerHeaders("POST", path)),
        ...adminHeaders(),
        "Content-Type": "application/json",
        "Idempotency-Key": `email-reconcile:${identity}`,
      },
      body: JSON.stringify({ providerMessageId }),
    }),
    {
      ...controlledEnv(),
      TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: "false",
      TRANSACTIONAL_EMAIL_RECONCILIATION_ENABLED: "true",
    },
    {
      now: () => "2026-08-31T10:00:00.000Z",
      authorizeOwner: async () => true,
      emailReconciliation: {
        async reconcile(input) {
          calls.push(input);
          return {
            outboxId,
            kind: "payment_confirmation",
            providerMessageId,
            providerLastEvent: "delivered",
            created: true,
          };
        },
      },
    },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    data: {
      outboxId,
      kind: "payment_confirmation",
      providerMessageId,
      providerLastEvent: "delivered",
      evidenceRecorded: true,
      replayed: false,
      emailResent: false,
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actor.kind, "admin");
  assert.doesNotMatch(JSON.stringify(body), /@|recipient|payload|secret/i);

  const disabledDatabase = database();
  const disabled = await productionOperationsApiResponse(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: {
        ...(await ownerHeaders("POST", path)),
        ...adminHeaders(),
        "Content-Type": "application/json",
        "Idempotency-Key": `email-reconcile:${identity}`,
      },
      body: JSON.stringify({ providerMessageId }),
    }),
    {
      ...controlledEnv(disabledDatabase),
      TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: "true",
      TRANSACTIONAL_EMAIL_DISPATCH_MODE: "controlled",
      TRANSACTIONAL_EMAIL_RECONCILIATION_ENABLED: "false",
    },
  );
  assert.equal(disabled.status, 503);
  assert.equal((await disabled.json()).error.code, "EMAIL_RECONCILIATION_NOT_ACTIVATED");
  assert.equal(disabledDatabase.queries.length, 0);
});

test("reporting is owner-only, aggregate-only and period-bounded", async () => {
  const path = "/api/commerce/admin/reporting";
  const report = {
    protocol: "ajl-commerce-report-v1",
    privacy: {
      containsPersonalData: false,
      grain: "period_totals",
      thirdPartyTrackingRequired: false,
    },
    commerce: { ordersPaid: 1, grossPaidCents: 3699 },
  };
  const response = await productionOperationsApiResponse(
    new Request(`${origin}${path}?start=2026-08-01T00%3A00%3A00.000Z&endExclusive=2026-08-15T00%3A00%3A00.000Z`, {
      headers: {
        ...(await ownerHeaders("GET", path)),
        ...adminHeaders(),
      },
    }),
    controlledEnv(),
    {
      now: () => "2026-08-15T09:00:00.000Z",
      authorizeOwner: async () => true,
      async readReport(_database, input) {
        assert.deepEqual(input, {
          start: "2026-08-01T00:00:00.000Z",
          endExclusive: "2026-08-15T00:00:00.000Z",
          generatedAt: "2026-08-15T09:00:00.000Z",
        });
        return report;
      },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: report });
  assert.doesNotMatch(JSON.stringify(report), /@|address|customerId|trackingReference/i);
});

test("scheduled email dispatch remains closed before activation without touching D1", async () => {
  const db = database();
  const result = await dispatchProductionTransactionalEmails(
    controlledEnv(db),
    { now: "2026-08-15T09:00:00.000Z" },
  );
  assert.deepEqual(result, {
    closed: true,
    reason: "transactional-email-dispatch-not-activated",
    staleLeasesRecovered: 0,
    claimed: 0,
    sent: 0,
    retryScheduled: 0,
    failed: 0,
    queueDrained: false,
  });
  assert.equal(db.queries.length, 0);
});

test("verified paid-order dispatch is bounded to two durable confirmations and returns no PII", async () => {
  const db = database();
  const result = await dispatchProductionVerifiedPaidOrderEmails(
    {
      ...controlledEnv(db),
      TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: "true",
      TRANSACTIONAL_EMAIL_DISPATCH_MODE: "controlled",
    },
    { now: "2026-08-15T09:00:00.000Z", orderId: "order_paid_signal_1" },
    {
      provider: {
        async deliver() { throw new Error("queue-is-empty"); },
      },
    },
  );
  assert.deepEqual(result, {
    closed: false,
    reason: null,
    claimed: 0,
    sent: 0,
    retryScheduled: 0,
    failed: 0,
    processingErrors: 0,
    queueDrained: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /@|recipient|payload|secret/i);
});

test("verified paid-order dispatch isolates one confirmation failure from the other", async () => {
  const db = database();
  const claims = [
    { id: "outbox_order", kind: "order_confirmation" },
    { id: "outbox_payment", kind: "payment_confirmation" },
  ];
  let claimIndex = 0;
  const delivered = [];
  const result = await dispatchProductionVerifiedPaidOrderEmails(
    {
      ...controlledEnv(db),
      TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: "true",
      TRANSACTIONAL_EMAIL_DISPATCH_MODE: "controlled",
    },
    { now: "2026-08-15T09:00:00.000Z", orderId: "order_paid_signal_2" },
    {
      provider: {
        async deliver() { throw new Error("not-used"); },
      },
      verifiedPaidOrderOutbox: {
        async claimNextForVerifiedPaidOrder() {
          return claims[claimIndex++] ?? null;
        },
        async deliverClaim(claim) {
          delivered.push(claim.id);
          if (claim.id === "outbox_order") throw new Error("isolated-first-confirmation");
          return "sent";
        },
      },
    },
  );
  assert.deepEqual(delivered, ["outbox_order", "outbox_payment"]);
  assert.deepEqual(result, {
    closed: false,
    reason: null,
    claimed: 2,
    sent: 1,
    retryScheduled: 0,
    failed: 0,
    processingErrors: 1,
    queueDrained: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /@|recipient|payload|secret/i);
});

test("automatic outbound shipment stays closed until both explicit activation flags are true", async () => {
  const db = database();
  const result = await dispatchProductionOutboundShipments(
    controlledEnv(db),
    { now: "2026-08-15T09:00:00.000Z", orderId: "order_paid_signal_1" },
    {
      fulfillment: {
        async createShipmentLabel() {
          throw new Error("must-not-create-a-label");
        },
      },
    },
  );
  assert.deepEqual(result, {
    closed: true,
    reason: "production-shipping-dispatch-not-activated",
    candidates: 0,
    created: 0,
    alreadyReady: 0,
    attentionRequired: 0,
  });
  assert.equal(db.queries.length, 0);
});

test("automatic outbound shipment uses a deterministic idempotency identity for one paid order", async () => {
  const queries = [];
  const db = {
    prepare(query) {
      queries.push(query);
      return {
        bind(...values) {
          assert.deepEqual(values, ["order_paid_signal_1", "order_paid_signal_1"]);
          return {
            async all() {
              return { success: true, results: [{ id: "order_paid_signal_1" }] };
            },
          };
        },
      };
    },
  };
  const calls = [];
  const dependencies = {
    fulfillment: {
      async createShipmentLabel(input) {
        calls.push(input);
        return { status: "label_ready" };
      },
    },
  };
  const first = await dispatchProductionOutboundShipments(
    automaticShippingEnv(db),
    { now: "2026-08-15T09:00:00.000Z", orderId: "order_paid_signal_1" },
    dependencies,
  );
  const replay = await dispatchProductionOutboundShipments(
    automaticShippingEnv(db),
    { now: "2026-08-15T09:01:00.000Z", orderId: "order_paid_signal_1" },
    dependencies,
  );
  assert.deepEqual(first, {
    closed: false,
    reason: null,
    candidates: 1,
    created: 1,
    alreadyReady: 0,
    attentionRequired: 0,
  });
  assert.deepEqual(replay, first);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].shipmentId, calls[1].shipmentId);
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  assert.match(calls[0].shipmentId, /^shipment_[a-f0-9]{64}$/);
  assert.match(calls[0].idempotencyKey, /^outbound-label:[a-f0-9]{64}$/);
  assert.equal(calls[0].orderId, "order_paid_signal_1");
  assert.notEqual(calls[0].leaseToken, calls[1].leaseToken);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /status = 'paid'/);
  assert.match(queries[0], /payment\.status = 'succeeded'/);
  assert.match(queries[0], /NOT EXISTS[\s\S]*FROM shipments/);
});

test("ambiguous carrier outcome is isolated for manual attention and never blindly retried", async () => {
  const db = {
    prepare() {
      return {
        bind() {
          return {
            async all() {
              return { success: true, results: [{ id: "order_paid_signal_2" }] };
            },
          };
        },
      };
    },
  };
  let attempts = 0;
  const result = await dispatchProductionOutboundShipments(
    automaticShippingEnv(db),
    { now: "2026-08-15T09:00:00.000Z", orderId: "order_paid_signal_2" },
    {
      fulfillment: {
        async createShipmentLabel() {
          attempts += 1;
          throw new FulfillmentError(
            "PROVIDER_OUTCOME_UNKNOWN",
            "provider result requires reconciliation",
          );
        },
      },
    },
  );
  assert.deepEqual(result, {
    closed: false,
    reason: null,
    candidates: 1,
    created: 0,
    alreadyReady: 0,
    attentionRequired: 1,
  });
  assert.equal(attempts, 1);
});

test("scheduled late-refund recovery stays closed before activation without touching D1", async () => {
  const db = database();
  const result = await dispatchProductionLatePaymentRefunds(
    controlledEnv(db),
    { now: "2026-08-15T09:00:00.000Z" },
  );
  assert.deepEqual(result, {
    closed: true,
    reason: "production-late-refund-dispatch-not-activated",
    claimed: 0,
    succeeded: 0,
    rejected: 0,
    unknown: 0,
    attentionRequired: 0,
  });
  assert.equal(db.queries.length, 0);
});

test("scheduled reservation expiry returns stock once and is replay-safe", async () => {
  const context = reservationExpiryFixture();
  const variantId = "variant_boxer_pourpre_s";
  await context.store.seedLaunchCatalog("2099-08-15T08:00:00.000Z");
  context.sqlite.exec("UPDATE inventory SET reserves_validated = 1");
  await context.store.createCart({
    id: "cart_scheduled_expiry",
    expiresAt: "2099-08-15T10:00:00.000Z",
    now: "2099-08-15T08:00:00.000Z",
  });
  await context.store.setCartLineQuantity({
    cartId: "cart_scheduled_expiry",
    variantId,
    quantity: 2,
    now: "2099-08-15T08:00:30.000Z",
  });
  await context.store.reserveStock({
    reservationId: "reservation_scheduled_expiry",
    cartId: "cart_scheduled_expiry",
    variantId,
    quantity: 2,
    idempotencyKey: "reserve:scheduled-expiry",
    expiresAt: "2099-08-15T08:30:00.000Z",
    now: "2099-08-15T08:01:00.000Z",
  });
  assert.equal(context.sqlite.prepare(
    "SELECT active_reserved_quantity FROM inventory WHERE variant_id = ?",
  ).get(variantId).active_reserved_quantity, 2);

  // Cleanup must survive a commerce kill switch: otherwise reservations made
  // before closure would strand stock indefinitely.
  const env = {
    ...controlledEnv(context.d1),
    COMMERCE_MODE: "closed",
  };
  const first = await expireProductionReservations(env, {
    now: "2099-08-15T09:00:00.000Z",
  });
  assert.deepEqual(first, {
    closed: false,
    reason: null,
    candidates: 1,
    expired: 1,
    raced: 0,
    queueDrained: true,
  });
  assert.deepEqual({ ...context.sqlite.prepare(
    `SELECT status, last_transition_key FROM stock_reservations WHERE id = ?`,
  ).get("reservation_scheduled_expiry") }, {
    status: "expired",
    last_transition_key: "scheduled-expire:reservation_scheduled_expiry",
  });
  assert.equal(context.sqlite.prepare(
    "SELECT active_reserved_quantity FROM inventory WHERE variant_id = ?",
  ).get(variantId).active_reserved_quantity, 0);
  assert.equal(context.sqlite.prepare(
    `SELECT COUNT(*) AS count FROM inventory_movements
    WHERE reference_type = 'expiration' AND reference_id = ?`,
  ).get("reservation_scheduled_expiry").count, 1);

  const replay = await expireProductionReservations(env, {
    now: "2099-08-15T09:01:00.000Z",
  });
  assert.deepEqual(replay, {
    closed: false,
    reason: null,
    candidates: 0,
    expired: 0,
    raced: 0,
    queueDrained: true,
  });
  assert.equal(context.sqlite.prepare(
    `SELECT COUNT(*) AS count FROM inventory_movements
    WHERE reference_type = 'expiration' AND reference_id = ?`,
  ).get("reservation_scheduled_expiry").count, 1);
  context.sqlite.close();
});

test("activated scheduled dispatcher drains after commerce closes and returns no recipient data", async () => {
  const db = database();
  const result = await dispatchProductionTransactionalEmails(
    {
      ...controlledEnv(db),
      COMMERCE_MODE: "closed",
      TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: "true",
      TRANSACTIONAL_EMAIL_DISPATCH_MODE: "controlled",
    },
    { now: "2026-08-15T09:00:00.000Z" },
    {
      provider: {
        async deliver() { throw new Error("queue-is-empty"); },
      },
    },
  );
  assert.deepEqual(result, {
    closed: false,
    reason: null,
    staleLeasesRecovered: 0,
    claimed: 0,
    sent: 0,
    retryScheduled: 0,
    failed: 0,
    queueDrained: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /@|recipient|payload|secret/i);
});
