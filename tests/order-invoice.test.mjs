import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  administratorOrderCreditNote,
  administratorOrderInvoice,
  customerOrderCreditNote,
  customerOrderInvoice,
  orderCreditNoteHtmlResponse,
  orderInvoiceHtmlResponse,
  productionCreditNoteRuntimeInstalled,
  productionInvoiceRuntimeInstalled,
} from "../lib/commerce/order-invoice.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const migration = readFileSync(
  `${root}drizzle/0029_slippery_ironclad.sql`,
  "utf8",
);
const creditNoteMigration = readFileSync(
  `${root}drizzle/0030_striped_skin.sql`,
  "utf8",
);

class Statement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }
  bind(...values) { return new Statement(this.database, this.query, values); }
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
    } catch (cause) {
      this.database.exec("ROLLBACK");
      throw cause;
    }
  }
}

const address = JSON.stringify({
  recipient: "Ada Lovelace",
  line1: "1 rue des Tests",
  line2: null,
  postalCode: "75001",
  city: "Paris",
  countryCode: "FR",
});

function createCoreDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, order_number TEXT NOT NULL, customer_id TEXT,
      email TEXT NOT NULL, status TEXT NOT NULL, currency TEXT NOT NULL,
      subtotal_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL,
      promotion_code TEXT, promotion_discount_cents INTEGER NOT NULL,
      shipping_cents INTEGER NOT NULL, tax_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL, billing_address_json TEXT NOT NULL,
      terms_version TEXT NOT NULL, paid_at TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE order_lines (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, internal_reference TEXT NOT NULL,
      product_name TEXT NOT NULL, color_name TEXT NOT NULL, size TEXT NOT NULL,
      quantity INTEGER NOT NULL, unit_price_cents INTEGER NOT NULL,
      line_total_cents INTEGER NOT NULL
    );
    CREATE TABLE payments (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, status TEXT NOT NULL,
      amount_cents INTEGER NOT NULL, currency TEXT NOT NULL
    );
    CREATE TABLE return_requests (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, status TEXT NOT NULL,
      resolution TEXT
    );
    CREATE TABLE return_lines (
      id TEXT PRIMARY KEY, return_request_id TEXT NOT NULL,
      order_line_id TEXT NOT NULL, received_quantity INTEGER NOT NULL,
      inspection_result TEXT
    );
    CREATE TABLE refunds (
      id TEXT PRIMARY KEY, payment_id TEXT NOT NULL,
      return_request_id TEXT NOT NULL, reason TEXT NOT NULL,
      amount_cents INTEGER NOT NULL, currency TEXT NOT NULL,
      status TEXT NOT NULL, provider_refund_reference TEXT,
      provider_receipt_fingerprint TEXT, succeeded_at TEXT
    );`);
  return sqlite;
}

function seedOrder(sqlite, input) {
  sqlite.prepare(`INSERT INTO orders (
    id,order_number,customer_id,email,status,currency,subtotal_cents,
    discount_cents,promotion_code,promotion_discount_cents,shipping_cents,
    tax_cents,total_cents,billing_address_json,terms_version,paid_at,updated_at
  ) VALUES (?,?,?,?,?,'EUR',5000,500,NULL,0,700,0,5700,?,'2026-09-01',?,?)`).run(
    input.id,
    input.orderNumber,
    input.customerId,
    input.email,
    input.status,
    address,
    input.paidAt,
    input.updatedAt,
  );
  sqlite.prepare(`INSERT INTO order_lines VALUES (
    ?,?,'AJL-POURPRE-S','Appolon','Pourpre impérial','S',1,5500,5500
  )`).run(`line:${input.id}`, input.id);
  if (input.payment) {
    sqlite.prepare(`INSERT INTO payments VALUES (?,?,'succeeded',5700,'EUR')`)
      .run(`payment:${input.id}`, input.id);
  }
}

function applyInvoiceMigration(sqlite) {
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) sqlite.exec(statement.trim());
  }
}

function applyCreditNoteMigration(sqlite) {
  for (const statement of creditNoteMigration.split("--> statement-breakpoint")) {
    if (statement.trim()) sqlite.exec(statement.trim());
  }
}

test("0029 backfills paid orders and keeps an independent chronological yearly sequence", () => {
  const sqlite = createCoreDatabase();
  try {
    seedOrder(sqlite, {
      id: "order_a", orderNumber: "AJ-AAAAAAAAAAAAAAAAAAAA",
      customerId: "customer_ada", email: "ada@example.com", status: "paid",
      paidAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z",
      payment: true,
    });
    seedOrder(sqlite, {
      id: "order_b", orderNumber: "AJ-BBBBBBBBBBBBBBBBBBBB",
      customerId: "customer_ada", email: "ada@example.com", status: "preparing",
      paidAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T11:00:00.000Z",
      payment: true,
    });
    seedOrder(sqlite, {
      id: "order_c", orderNumber: "AJ-CCCCCCCCCCCCCCCCCCCC",
      customerId: "customer_ada", email: "ada@example.com", status: "paid",
      paidAt: "2027-01-02T10:00:00.000Z", updatedAt: "2027-01-02T10:00:00.000Z",
      payment: true,
    });
    applyInvoiceMigration(sqlite);
    assert.deepEqual(
      sqlite.prepare(`SELECT order_id,invoice_number FROM order_invoices
        ORDER BY invoice_year,invoice_sequence`).all().map((row) => ({ ...row })),
      [
        { order_id: "order_a", invoice_number: "AJL-2026-000001" },
        { order_id: "order_b", invoice_number: "AJL-2026-000002" },
        { order_id: "order_c", invoice_number: "AJL-2027-000001" },
      ],
    );
  } finally {
    sqlite.close();
  }
});

test("a confirmed payment atomically creates one immutable invoice snapshot", async () => {
  const sqlite = createCoreDatabase();
  try {
    applyInvoiceMigration(sqlite);
    seedOrder(sqlite, {
      id: "order_d", orderNumber: "AJ-DDDDDDDDDDDDDDDDDDDD",
      customerId: "customer_ada", email: "ada@example.com",
      status: "pending_payment", paidAt: null,
      updatedAt: "2026-09-01T12:00:00.000Z", payment: true,
    });
    sqlite.prepare(`UPDATE orders SET status='paid',
      paid_at='2026-09-01T12:00:00.000Z',updated_at='2026-09-01T12:00:01.000Z'
      WHERE id='order_d'`).run();
    const database = new D1(sqlite);
    assert.equal(await productionInvoiceRuntimeInstalled(database), true);
    const invoice = await customerOrderInvoice(
      database,
      "AJ-DDDDDDDDDDDDDDDDDDDD",
      "customer_ada",
    );
    assert.equal(invoice?.invoiceNumber, "AJL-2026-000001");
    assert.equal(invoice?.orderNumber, "AJ-DDDDDDDDDDDDDDDDDDDD");
    assert.equal(invoice?.issuedAt, "2026-09-01T12:00:01.000Z");
    assert.equal(invoice?.paymentConfirmedAt, "2026-09-01T12:00:00.000Z");
    assert.equal(invoice?.merchandiseGrossCents, 5500);
    assert.equal(invoice?.discountCents, 500);
    assert.equal(invoice?.totalCents, 5700);
    assert.equal(await customerOrderInvoice(
      database,
      "AJ-DDDDDDDDDDDDDDDDDDDD",
      "customer_other",
    ), null);
    assert.equal((await administratorOrderInvoice(database, "order_d"))?.id, invoice?.id);
    assert.throws(
      () => sqlite.prepare("UPDATE order_invoices SET total_cents=1").run(),
      /commerce_invoice_is_immutable/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM order_invoices").run(),
      /commerce_invoice_must_be_retained/,
    );
    const response = orderInvoiceHtmlResponse(invoice);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.match(response.headers.get("cache-control"), /no-store/);
    const html = await response.text();
    assert.match(html, /AJL-2026-000001/);
    assert.match(html, /Facture acquittée/);
    assert.match(html, /Total réglé/);
    assert.match(html, /distinct de l’étiquette transporteur/);
  } finally {
    sqlite.close();
  }
});

test("the paid transition rolls back if payment evidence is missing", () => {
  const sqlite = createCoreDatabase();
  try {
    applyInvoiceMigration(sqlite);
    seedOrder(sqlite, {
      id: "order_e", orderNumber: "AJ-EEEEEEEEEEEEEEEEEEEE",
      customerId: "customer_ada", email: "ada@example.com",
      status: "pending_payment", paidAt: null,
      updatedAt: "2026-09-01T13:00:00.000Z", payment: false,
    });
    assert.throws(
      () => sqlite.prepare(`UPDATE orders SET status='paid',
        paid_at='2026-09-01T13:00:00.000Z',updated_at='2026-09-01T13:00:01.000Z'
        WHERE id='order_e'`).run(),
      /commerce_invoice_generation_failed/,
    );
    assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id='order_e'").get().status, "pending_payment");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM order_invoices").get().count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM invoice_sequences").get().count, 0);
  } finally {
    sqlite.close();
  }
});

test("the 0029 runtime proof fails closed on missing or shadow objects", async () => {
  const sqlite = createCoreDatabase();
  try {
    const database = new D1(sqlite);
    assert.equal(await productionInvoiceRuntimeInstalled(database), false);
    applyInvoiceMigration(sqlite);
    assert.equal(await productionInvoiceRuntimeInstalled(database), true);
    sqlite.exec("CREATE TABLE order_invoices_shadow (id TEXT PRIMARY KEY)");
    assert.equal(
      await productionInvoiceRuntimeInstalled(database),
      true,
      "unrelated prefixed objects must not satisfy or poison the exact inventory",
    );
    sqlite.exec("DROP TABLE order_invoices_shadow");
    sqlite.exec("DROP INDEX idx_order_invoices_issued_at");
    assert.equal(await productionInvoiceRuntimeInstalled(database), false);
  } finally {
    sqlite.close();
  }
});

test("0030 backfills a detailed immutable credit note and enforces customer ownership", async () => {
  const sqlite = createCoreDatabase();
  try {
    seedOrder(sqlite, {
      id: "order_f", orderNumber: "AJ-FFFFFFFFFFFFFFFFFFFF",
      customerId: "customer_ada", email: "ada@example.com", status: "paid",
      paidAt: "2026-09-01T14:00:00.000Z", updatedAt: "2026-09-01T14:00:00.000Z",
      payment: true,
    });
    applyInvoiceMigration(sqlite);
    sqlite.prepare(`INSERT INTO return_requests VALUES
      ('return_f','order_f','resolved','refund')`).run();
    sqlite.prepare(`INSERT INTO return_lines VALUES
      ('return_line_f','return_f','line:order_f',1,'complete')`).run();
    sqlite.prepare(`INSERT INTO refunds VALUES
      ('refund_f','payment:order_f','return_f','withdrawal',5700,'EUR','succeeded',
       'provider_refund_f',?, '2026-09-02T14:00:00.000Z')`).run("a".repeat(64));
    applyCreditNoteMigration(sqlite);
    const database = new D1(sqlite);
    assert.equal(await productionCreditNoteRuntimeInstalled(database), true);
    const note = await customerOrderCreditNote(
      database,
      "AJL-AV-2026-000001",
      "customer_ada",
    );
    assert.equal(note?.originalInvoiceNumber, "AJL-2026-000001");
    assert.equal(note?.creditAmountCents, 5700);
    assert.equal(note?.remainingBalanceCents, 0);
    assert.deepEqual(note?.lines.map((line) => line.kind), ["item", "adjustment"]);
    assert.equal(
      note?.lines.reduce((total, line) => total + line.amountCents, 0),
      5700,
    );
    assert.equal(await customerOrderCreditNote(
      database,
      "AJL-AV-2026-000001",
      "customer_other",
    ), null);
    assert.equal((await administratorOrderCreditNote(
      database,
      "order_f",
      "AJL-AV-2026-000001",
    ))?.id, note?.id);
    assert.throws(
      () => sqlite.prepare("UPDATE order_credit_notes SET credit_amount_cents=1").run(),
      /commerce_credit_note_is_immutable/,
    );
    const response = orderCreditNoteHtmlResponse(note);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.match(response.headers.get("cache-control"), /no-store/);
    const html = await response.text();
    assert.match(html, /AJL-AV-2026-000001/);
    assert.match(html, /AJL-2026-000001/);
    assert.match(html, /Ajustement \/ remboursement livraison/);
    const invoice = await administratorOrderInvoice(database, "order_f");
    const dossierHtml = await orderInvoiceHtmlResponse(invoice, [note], "administrator").text();
    assert.match(dossierHtml, /class="sheet credit-page"/);
    assert.match(dossierHtml, /AJL-AV-2026-000001/);
    assert.match(dossierHtml, /break-before:page/);
    sqlite.exec("DROP INDEX idx_order_credit_notes_invoice");
    assert.equal(await productionCreditNoteRuntimeInstalled(database), false);
  } finally {
    sqlite.close();
  }
});
