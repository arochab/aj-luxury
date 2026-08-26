import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { launchVariantSeed } from "../db/seed.ts";
import { getLaunchInventoryPosition } from "../lib/commerce/launch-inventory.ts";
import {
  CommerceReportingError,
  readCommerceOperationsReport,
} from "../lib/commerce/d1-commerce-reporting.ts";
import {
  TransactionalEmailDispatchError,
  dispatchTransactionalEmailBatch,
} from "../lib/commerce/email-outbox-dispatcher.ts";
import {
  LaunchStockImportError,
  createLaunchStockPayloadSha256,
  launchStockImportProtocol,
  validateLaunchStockImport,
} from "../lib/commerce/launch-stock-import.ts";

function stockPayload() {
  const variants = launchVariantSeed.map((variant, index) => ({
    variantId: variant.id,
    internalReference: variant.internalReference,
    physicalQuantity: getLaunchInventoryPosition(
      variant.sourceSlug,
      variant.size,
    ).currentPhysicalQuantity,
    giftingReserveQuantity: index === 9 ? 1 : 2,
    safetyReserveQuantity: 0,
    savReserveQuantity: 0,
  }));
  return {
    protocol: launchStockImportProtocol,
    manifestId: "ajl-stock-20260815",
    countedAt: "2026-08-15",
    variants,
    totals: {
      physicalQuantity: 749,
      giftingReserveQuantity: 23,
      safetyReserveQuantity: 0,
      savReserveQuantity: 0,
      sellableQuantity: 726,
    },
  };
}

async function approvedStockManifest() {
  const payload = stockPayload();
  const digest = await createLaunchStockPayloadSha256(payload);
  return {
    ...payload,
    approvals: [
      {
        role: "stock_owner",
        signerId: "ajl-stock-owner",
        signedAt: "2026-08-15T08:30:00.000Z",
        payloadSha256: digest,
        attestation: "I_APPROVE_THIS_EXACT_STOCK_IMPORT",
      },
      {
        role: "release_owner",
        signerId: "ajl-release-owner",
        signedAt: "2026-08-15T08:31:00.000Z",
        payloadSha256: digest,
        attestation: "I_APPROVE_THIS_EXACT_STOCK_IMPORT",
      },
    ],
  };
}

test("stock import reconciles the exact 12-variant current grid and reserve buckets", async () => {
  const validated = await validateLaunchStockImport(await approvedStockManifest());
  assert.equal(validated.variants.length, 12);
  assert.equal(validated.totals.physicalQuantity, 749);
  assert.equal(validated.totals.giftingReserveQuantity, 23);
  assert.equal(validated.totals.sellableQuantity, 726);
  assert.equal(validated.variants[0].sellableQuantity, 24);
  assert.equal(validated.variants[1].sellableQuantity, 100);
  assert.equal(validated.variants[11].sellableQuantity, 33);
  assert.equal(validated.variants[1].d1SafetyReserveQuantity, 0);
  assert.deepEqual(validated.approvedBy, {
    stock_owner: "ajl-stock-owner",
    release_owner: "ajl-release-owner",
  });
  assert.match(validated.payloadSha256, /^[0-9a-f]{64}$/);
  assert.equal(validated.countedAt, "2026-08-15");
});

test("stock import fails closed on unsigned, reordered, overallocated or tampered inputs", async (t) => {
  await t.test("missing approvals", async () => {
    const manifest = { ...(await approvedStockManifest()), approvals: [] };
    await assert.rejects(
      () => validateLaunchStockImport(manifest),
      (error) =>
        error instanceof LaunchStockImportError && error.code === "APPROVAL_MISSING",
    );
  });
  await t.test("impossible calendar date", async () => {
    const manifest = await approvedStockManifest();
    manifest.countedAt = "2026-02-30";
    await assert.rejects(
      () => validateLaunchStockImport(manifest),
      (error) =>
        error instanceof LaunchStockImportError && error.code === "INVALID_MANIFEST",
    );
  });
  await t.test("reordered variants", async () => {
    const manifest = await approvedStockManifest();
    [manifest.variants[0], manifest.variants[1]] = [
      manifest.variants[1],
      manifest.variants[0],
    ];
    await assert.rejects(
      () => validateLaunchStockImport(manifest),
      (error) =>
        error instanceof LaunchStockImportError && error.code === "CATALOG_MISMATCH",
    );
  });
  await t.test("reserve over physical", async () => {
    const manifest = await approvedStockManifest();
    manifest.variants[0].savReserveQuantity = 100;
    await assert.rejects(
      () => validateLaunchStockImport(manifest),
      (error) =>
        error instanceof LaunchStockImportError && error.code === "TOTAL_MISMATCH",
    );
  });
  await t.test("payload changed after approval", async () => {
    const manifest = await approvedStockManifest();
    manifest.manifestId = "ajl-stock-20260815-tampered";
    await assert.rejects(
      () => validateLaunchStockImport(manifest),
      (error) =>
        error instanceof LaunchStockImportError && error.code === "DIGEST_MISMATCH",
    );
  });
  await t.test("fully re-signed zero-gift allocation", async () => {
    const manifest = await approvedStockManifest();
    for (const variant of manifest.variants) {
      variant.giftingReserveQuantity = 0;
    }
    manifest.totals.giftingReserveQuantity = 0;
    manifest.totals.sellableQuantity = 749;
    const digest = await createLaunchStockPayloadSha256({
      protocol: manifest.protocol,
      manifestId: manifest.manifestId,
      countedAt: manifest.countedAt,
      variants: manifest.variants,
      totals: manifest.totals,
    });
    for (const approval of manifest.approvals) approval.payloadSha256 = digest;
    await assert.rejects(
      () => validateLaunchStockImport(manifest),
      (error) =>
        error instanceof LaunchStockImportError && error.code === "CATALOG_MISMATCH",
    );
  });
  await t.test("one person cannot approve both roles", async () => {
    const manifest = await approvedStockManifest();
    manifest.approvals[1].signerId = manifest.approvals[0].signerId;
    await assert.rejects(
      () => validateLaunchStockImport(manifest),
      (error) =>
        error instanceof LaunchStockImportError && error.code === "APPROVAL_MISSING",
    );
  });
});

function emailClaim(id) {
  return Object.freeze({
    id,
    kind: "payment_confirmation",
    sourceEventId: `event_${id}`,
    recipientEmail: "private@example.com",
    orderId: `order_${id}`,
    locale: "fr",
    templateVersion: "payment-v1",
    payloadJson: "{}",
    attempts: 1,
    maxAttempts: 5,
    leaseTokenHash: "a".repeat(64),
    providerIdempotencyKey: `payment_confirmation:order_${id}`,
  });
}

test("email dispatcher does not claim when the provider is closed", async () => {
  let claimed = 0;
  let hashes = 0;
  const result = await dispatchTransactionalEmailBatch(
    {
      deliveryReadiness() {
        return { available: false, reason: "provider_not_configured" };
      },
      async claimNext() { claimed += 1; return null; },
      async deliverClaim() { throw new Error("must not deliver"); },
    },
    { async next() { hashes += 1; return "a".repeat(64); } },
    { now: "2026-08-15T09:00:00.000Z" },
  );
  assert.deepEqual(result, {
    closed: true,
    reason: "provider_not_configured",
    claimed: 0,
    sent: 0,
    retryScheduled: 0,
    failed: 0,
    queueDrained: false,
  });
  assert.equal(claimed, 0);
  assert.equal(hashes, 0);
});

test("email dispatcher is bounded and returns only aggregate outcomes", async () => {
  const claims = [emailClaim("1"), emailClaim("2"), emailClaim("3")];
  const outcomes = ["sent", "retry", "failed"];
  let lease = 0;
  const result = await dispatchTransactionalEmailBatch(
    {
      deliveryReadiness() { return { available: true }; },
      async claimNext() { return claims.shift() ?? null; },
      async deliverClaim() { return outcomes.shift(); },
    },
    {
      async next() {
        lease += 1;
        return lease.toString(16).padStart(64, "0");
      },
    },
    { now: "2026-08-15T09:00:00.000Z", maxMessages: 4, leaseSeconds: 60 },
  );
  assert.deepEqual(result, {
    closed: false,
    reason: null,
    claimed: 3,
    sent: 1,
    retryScheduled: 1,
    failed: 1,
    queueDrained: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /private|example|order_|event_/i);
});

test("email dispatcher sanitizes dependency failures", async () => {
  await assert.rejects(
    () => dispatchTransactionalEmailBatch(
      {
        deliveryReadiness() { return { available: true }; },
        async claimNext() { throw new Error("private@example.com secret-value"); },
        async deliverClaim() { return "sent"; },
      },
      { async next() { return "a".repeat(64); } },
      { now: "2026-08-15T09:00:00.000Z" },
    ),
    (error) => {
      assert.ok(error instanceof TransactionalEmailDispatchError);
      assert.equal(error.code, "DEPENDENCY_FAILURE");
      assert.doesNotMatch(error.message, /private|example|secret/i);
      return true;
    },
  );
});

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
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

class SQLiteD1Database {
  constructor(database) {
    this.database = database;
    this.queries = [];
  }
  prepare(query) {
    this.queries.push(query);
    return new SQLiteD1Statement(this.database, query);
  }
  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.all());
    return results;
  }
}

function reportingFixture() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE orders (id TEXT, status TEXT, total_cents INTEGER,
      created_at TEXT, updated_at TEXT, paid_at TEXT);
    CREATE TABLE payments (id TEXT, order_id TEXT, status TEXT,
      amount_cents INTEGER, updated_at TEXT);
    CREATE TABLE inventory (physical_quantity INTEGER, gift_reserve_quantity INTEGER,
      safety_reserve_quantity INTEGER, active_reserved_quantity INTEGER,
      sold_quantity INTEGER, reserves_validated INTEGER);
    CREATE TABLE shipments (status TEXT, created_at TEXT, updated_at TEXT,
      label_created_at TEXT, handed_over_at TEXT, delivered_at TEXT);
    CREATE TABLE shipment_tracking_events (event_type TEXT, occurred_at TEXT);
    CREATE TABLE return_requests (id TEXT, kind TEXT, status TEXT,
      requested_at TEXT, resolved_at TEXT);
    CREATE TABLE return_lines (return_request_id TEXT, requested_quantity INTEGER,
      restocked_quantity INTEGER);
    CREATE TABLE refunds (status TEXT, amount_cents INTEGER, succeeded_at TEXT);
    CREATE TABLE email_outbox (status TEXT, sent_at TEXT, terminal_at TEXT);
    INSERT INTO orders VALUES
      ('o1','paid',3000,'2026-08-01T01:00:00.000Z','2026-08-01T02:00:00.000Z','2026-08-01T02:00:00.000Z'),
      ('o2','refunded',4000,'2026-08-02T01:00:00.000Z','2026-08-04T02:00:00.000Z','2026-08-02T02:00:00.000Z'),
      ('o3','cancelled',2000,'2026-08-03T01:00:00.000Z','2026-08-03T02:00:00.000Z',NULL);
    INSERT INTO payments VALUES
      ('p1','o1','succeeded',3000,'2026-08-01T02:00:00.000Z'),
      ('p2','o2','refunded',4000,'2026-08-04T02:00:00.000Z'),
      ('p3','o3','failed',2000,'2026-08-03T02:00:00.000Z');
    INSERT INTO inventory VALUES (10,1,2,1,3,0);
    INSERT INTO shipments VALUES
      ('delivered','2026-08-01T03:00:00.000Z','2026-08-04T03:00:00.000Z',
        '2026-08-01T04:00:00.000Z','2026-08-02T04:00:00.000Z','2026-08-04T03:00:00.000Z'),
      ('failed','2026-08-02T03:00:00.000Z','2026-08-03T03:00:00.000Z',NULL,NULL,NULL);
    INSERT INTO shipment_tracking_events VALUES ('exception','2026-08-03T04:00:00.000Z');
    INSERT INTO return_requests VALUES
      ('r1','return','resolved','2026-08-05T01:00:00.000Z','2026-08-06T01:00:00.000Z'),
      ('r2','withdrawal','received','2026-08-06T01:00:00.000Z',NULL);
    INSERT INTO return_lines VALUES ('r1',2,1),('r2',1,0);
    INSERT INTO refunds VALUES ('succeeded',1000,'2026-08-06T02:00:00.000Z');
    INSERT INTO email_outbox VALUES
      ('sent','2026-08-01T05:00:00.000Z','2026-08-01T05:00:00.000Z'),
      ('failed',NULL,'2026-08-02T05:00:00.000Z'),
      ('pending',NULL,NULL);
  `);
  return { database, d1: new SQLiteD1Database(database) };
}

test("D1 reporting returns first-party aggregate commerce KPIs without PII", async () => {
  const { database, d1 } = reportingFixture();
  const report = await readCommerceOperationsReport(d1, {
    start: "2026-08-01T00:00:00.000Z",
    endExclusive: "2026-08-08T00:00:00.000Z",
    generatedAt: "2026-08-15T09:00:00.000Z",
  });
  assert.deepEqual(report.commerce, {
    ordersCreated: 3,
    ordersPaid: 2,
    ordersCancelled: 1,
    grossPaidCents: 7000,
    refundsSucceeded: 1,
    refundedCents: 1000,
    netPaidCents: 6000,
    averagePaidOrderCents: 3500,
    paymentFailures: 1,
  });
  assert.deepEqual(report.stock, {
    variants: 1,
    physicalUnits: 10,
    giftingReserveUnits: 1,
    safetyAndSavReserveUnits: 2,
    activeReservedUnits: 1,
    soldUnits: 3,
    sellableUnits: 3,
    variantsAwaitingReserveApproval: 1,
  });
  assert.deepEqual(report.delivery, {
    shipmentsCreated: 2,
    labelsReady: 1,
    parcelsHandedOver: 1,
    parcelsDelivered: 1,
    shipmentFailures: 1,
    deliveryExceptions: 1,
  });
  assert.deepEqual(report.returns, {
    requestsReceived: 2,
    withdrawalsReceived: 1,
    requestedUnits: 3,
    requestsResolved: 1,
    requestsRejected: 0,
    unitsRestocked: 1,
    openRequestBacklog: 1,
  });
  assert.deepEqual(report.notifications, {
    sent: 1,
    terminalFailures: 1,
    pendingBacklog: 1,
  });
  assert.deepEqual(report.privacy, {
    containsPersonalData: false,
    grain: "period_totals",
    thirdPartyTrackingRequired: false,
  });
  assert.equal(
    d1.queries.some((query) =>
      /recipient_email|shipping_address|billing_address|tracking_reference|payload_json|user_agent|ip_address/i.test(query),
    ),
    false,
  );
  assert.doesNotMatch(JSON.stringify(report), /@|address|trackingReference|customerId/i);
  database.close();
});

test("D1 reporting rejects future, inverted and overlong periods before database access", async () => {
  const { database, d1 } = reportingFixture();
  for (const input of [
    {
      start: "2026-08-08T00:00:00.000Z",
      endExclusive: "2026-08-01T00:00:00.000Z",
      generatedAt: "2026-08-15T09:00:00.000Z",
    },
    {
      start: "2026-08-01T00:00:00.000Z",
      endExclusive: "2026-08-16T00:00:00.000Z",
      generatedAt: "2026-08-15T09:00:00.000Z",
    },
    {
      start: "2025-01-01T00:00:00.000Z",
      endExclusive: "2026-08-01T00:00:00.000Z",
      generatedAt: "2026-08-15T09:00:00.000Z",
    },
  ]) {
    await assert.rejects(
      () => readCommerceOperationsReport(d1, input),
      (error) =>
        error instanceof CommerceReportingError && error.code === "INVALID_PERIOD",
    );
  }
  assert.equal(d1.queries.length, 0);
  database.close();
});
