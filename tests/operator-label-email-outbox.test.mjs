import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { D1OperatorLabelEmailDispatcher } from "../lib/commerce/operator-label-email-outbox.ts";

class Statement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }
  bind(...values) { return new Statement(this.database, this.query, values); }
  async first() { return this.database.prepare(this.query).get(...this.values) ?? null; }
  async all() {
    return { results: this.database.prepare(this.query).all(...this.values), meta: { changes: 0 } };
  }
  async run() {
    const result = this.database.prepare(this.query).run(...this.values);
    return { meta: { changes: Number(result.changes) }, results: [] };
  }
}

class D1 {
  constructor(database) { this.database = database; }
  prepare(query) { return new Statement(this.database, query); }
}

function fixture(zone = "EU") {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, order_number TEXT NOT NULL, total_cents INTEGER NOT NULL,
      currency TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE shipments (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, status TEXT NOT NULL,
      shipping_quote_id TEXT NOT NULL,
      provider_shipment_reference TEXT NOT NULL,
      tracking_provider_code TEXT NOT NULL, tracking_reference TEXT NOT NULL
    );
    CREATE TABLE shipping_quotes (id TEXT PRIMARY KEY, configuration_id TEXT NOT NULL);
    CREATE TABLE shipping_zone_configurations (id TEXT PRIMARY KEY, zone TEXT NOT NULL);
    CREATE TABLE customs_records (shipment_id TEXT UNIQUE NOT NULL, status TEXT NOT NULL);
    CREATE TABLE operator_label_email_outbox (
      id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL, order_id TEXT NOT NULL,
      recipient_email TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL,
      max_attempts INTEGER NOT NULL, next_attempt_at TEXT,
      lease_token_hash TEXT, leased_at TEXT, lease_expires_at TEXT,
      last_error_code TEXT, provider_message_id TEXT,
      attachment_sha256 TEXT, attachment_byte_length INTEGER, attachment_count INTEGER,
      idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, sent_at TEXT, terminal_at TEXT
    );
  `);
  const now = "2026-09-01T20:50:00.000Z";
  sqlite.prepare(
    "INSERT INTO orders VALUES (?,?,?,?,?)",
  ).run("order_1", "AJ-TEST0000000000000001", 5503, "EUR", "preparing");
  sqlite.prepare("INSERT INTO shipping_zone_configurations VALUES (?,?)")
    .run("config_1", zone);
  sqlite.prepare("INSERT INTO shipping_quotes VALUES (?,?)").run("quote_1", "config_1");
  sqlite.prepare(
    "INSERT INTO shipments VALUES (?,?,?,?,?,?,?)",
  ).run(
    "shipment_1", "order_1", "label_ready", "quote_1",
    "123456789", "colissimo", "TRACK123",
  );
  if (zone !== "EU") {
    sqlite.prepare("INSERT INTO customs_records VALUES (?,?)").run("shipment_1", "ready");
  }
  sqlite.prepare(
    `INSERT INTO operator_label_email_outbox (
      id,shipment_id,order_id,recipient_email,status,attempts,max_attempts,
      next_attempt_at,idempotency_key,created_at,updated_at
    ) VALUES (?,?,?,?,'pending',0,5,?,?,?,?)`,
  ).run(
    "operator_label_email_shipment_1", "shipment_1", "order_1",
    "jeremy@ajluxurystore.com", now, "operator_label_ready:shipment_1", now, now,
  );
  return { sqlite, database: new D1(sqlite), now };
}

test("one ready shipment sends one A4 PDF to Jérémy and never creates a duplicate", async () => {
  const context = fixture();
  const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
  const sha = createHash("sha256").update(pdf).digest("hex");
  const calls = [];
  const dispatcher = new D1OperatorLabelEmailDispatcher(
    context.database,
    {
      async deliver(delivery) {
        calls.push(delivery);
        return {
          idempotencyKey: delivery.idempotencyKey,
          providerMessageId: "email_operator_label_1",
        };
      },
    },
    {
      async document(request) {
        assert.deepEqual(request, {
          requestId: "operator_label_email_shipment_1",
          providerParcelReference: "123456789",
          documentKind: "label",
        });
        return {
          providerDocumentReference: "sendcloud:parcel:123456789:document:label",
          mediaType: "application/pdf",
          content: new Blob([pdf], { type: "application/pdf" }),
          byteLength: pdf.byteLength,
          contentSha256: sha,
        };
      },
    },
  );
  const first = await dispatcher.dispatch({ now: context.now, limit: 3 });
  assert.deepEqual(first, {
    staleLeasesRecovered: 0,
    claimed: 1,
    sent: 1,
    retryScheduled: 0,
    failed: 0,
    queueDrained: true,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message.recipientEmail, "jeremy@ajluxurystore.com");
  assert.equal(calls[0].idempotencyKey, "operator_label_ready:shipment_1");
  assert.equal(calls[0].attachments[0].filename, "AJL-AJ-TEST0000000000000001-ETIQUETTE-A4.pdf");
  assert.equal(Buffer.from(calls[0].attachments[0].contentBase64, "base64").compare(pdf), 0);
  assert.match(calls[0].message.payloadJson, /L’étiquette transporteur au format A4 est jointe directement/);
  const stored = context.sqlite.prepare(
    "SELECT status,attempts,provider_message_id,attachment_sha256,attachment_byte_length,attachment_count FROM operator_label_email_outbox",
  ).get();
  assert.deepEqual({ ...stored }, {
    status: "sent",
    attempts: 1,
    provider_message_id: "email_operator_label_1",
    attachment_sha256: sha,
    attachment_byte_length: pdf.byteLength,
    attachment_count: 1,
  });
  const replay = await dispatcher.dispatch({ now: context.now, limit: 3 });
  assert.equal(replay.claimed, 0);
  assert.equal(calls.length, 1);
});

test("one non-EU shipment emails the A4 label and customs document together", async () => {
  const context = fixture("US");
  const label = new TextEncoder().encode("%PDF-1.7\nlabel\n%%EOF");
  const customs = new TextEncoder().encode("%PDF-1.7\ncustoms\n%%EOF");
  const hashes = {
    label: createHash("sha256").update(label).digest("hex"),
    customs: createHash("sha256").update(customs).digest("hex"),
  };
  const calls = [];
  const documentCalls = [];
  const dispatcher = new D1OperatorLabelEmailDispatcher(
    context.database,
    {
      async deliver(delivery) {
        calls.push(delivery);
        return {
          idempotencyKey: delivery.idempotencyKey,
          providerMessageId: "email_operator_documents_1",
        };
      },
    },
    {
      async document(request) {
        documentCalls.push(request);
        const bytes = request.documentKind === "label" ? label : customs;
        return {
          providerDocumentReference: `sendcloud:parcel:123456789:document:${request.documentKind}`,
          mediaType: "application/pdf",
          content: new Blob([bytes], { type: "application/pdf" }),
          byteLength: bytes.byteLength,
          contentSha256: hashes[request.documentKind],
        };
      },
    },
  );
  const report = await dispatcher.dispatch({ now: context.now, limit: 3 });
  assert.equal(report.sent, 1);
  assert.deepEqual(documentCalls.map((call) => call.documentKind), ["label", "customs"]);
  assert.deepEqual(calls[0].attachments.map((attachment) => attachment.filename), [
    "AJL-AJ-TEST0000000000000001-ETIQUETTE-A4.pdf",
    "AJL-AJ-TEST0000000000000001-DOUANE-A4.pdf",
  ]);
  assert.match(calls[0].message.payloadJson, /document douanier A4/);
  const stored = context.sqlite.prepare(
    "SELECT status,attachment_sha256,attachment_byte_length,attachment_count FROM operator_label_email_outbox",
  ).get();
  assert.equal(stored.status, "sent");
  assert.match(stored.attachment_sha256, /^[0-9a-f]{64}$/);
  assert.equal(stored.attachment_byte_length, label.byteLength + customs.byteLength);
  assert.equal(stored.attachment_count, 2);
});
