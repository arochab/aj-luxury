import type { CommerceD1Database } from "./d1-port.ts";

const INVOICE_NUMBER = /^AJL-(20\d{2}|[3-9]\d{3})-[0-9]{6}$/;
const CREDIT_NOTE_NUMBER = /^AJL-AV-(20\d{2}|[3-9]\d{3})-[0-9]{6}$/;
const ORDER_NUMBER = /^AJ-[0-9A-F]{20}$/;
const CUSTOMER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const invoiceRuntimeInventory = Object.freeze([
  ...[
    "billing_address_json", "buyer_email", "created_at", "currency",
    "discount_cents", "id", "invoice_number", "invoice_sequence", "invoice_year",
    "issued_at", "line_items_json", "mediator_snapshot_json",
    "merchandise_gross_cents", "merchandise_net_cents", "order_id", "order_number",
    "payment_confirmed_at", "promotion_code", "promotion_discount_cents",
    "seller_snapshot_json", "shipping_cents", "tax_cents", "tax_mention",
    "terms_version", "total_cents",
  ].map((name) => `column:${name}:order_invoices`),
  "index:idx_order_invoices_issued_at:order_invoices",
  "index:ux_order_invoices_number:order_invoices",
  "index:ux_order_invoices_order:order_invoices",
  "index:ux_order_invoices_year_sequence:order_invoices",
  "table:invoice_sequences:invoice_sequences",
  "table:order_invoices:order_invoices",
  "trigger:trg_invoice_sequences_guard_update:invoice_sequences",
  "trigger:trg_invoice_sequences_retain_delete:invoice_sequences",
  "trigger:trg_order_invoices_immutable_update:order_invoices",
  "trigger:trg_order_invoices_retain_delete:order_invoices",
  "trigger:trg_order_invoices_validate_insert:order_invoices",
  "trigger:trg_orders_create_invoice_after_payment:orders",
].sort());

const creditNoteRuntimeInventory = Object.freeze([
  ...[
    "billing_address_json", "buyer_email", "created_at", "credit_amount_cents",
    "credit_lines_json",
    "credit_note_number", "credit_note_sequence", "credit_note_year", "currency",
    "id", "invoice_id", "issued_at", "mediator_snapshot_json", "order_id",
    "order_number", "original_invoice_issued_at", "original_invoice_number",
    "original_total_cents", "refund_id", "refund_provider_reference",
    "refund_reason", "refund_succeeded_at", "remaining_balance_cents",
    "seller_snapshot_json", "tax_credit_cents", "tax_mention",
  ].map((name) => `column:${name}:order_credit_notes`),
  "index:idx_order_credit_notes_invoice:order_credit_notes",
  "index:ux_order_credit_notes_number:order_credit_notes",
  "index:ux_order_credit_notes_refund:order_credit_notes",
  "index:ux_order_credit_notes_year_sequence:order_credit_notes",
  "table:credit_note_sequences:credit_note_sequences",
  "table:order_credit_notes:order_credit_notes",
  "trigger:trg_credit_note_sequences_guard_update:credit_note_sequences",
  "trigger:trg_credit_note_sequences_retain_delete:credit_note_sequences",
  "trigger:trg_order_credit_notes_immutable_update:order_credit_notes",
  "trigger:trg_order_credit_notes_retain_delete:order_credit_notes",
  "trigger:trg_order_credit_notes_validate_insert:order_credit_notes",
].sort());

const invoiceSelect = `SELECT
  invoice.id, invoice.order_id, invoice.order_number, invoice.invoice_number,
  invoice.invoice_year, invoice.invoice_sequence, invoice.issued_at,
  invoice.payment_confirmed_at, invoice.seller_snapshot_json,
  invoice.mediator_snapshot_json, invoice.buyer_email,
  invoice.billing_address_json, invoice.currency,
  invoice.merchandise_gross_cents, invoice.discount_cents,
  invoice.promotion_code, invoice.promotion_discount_cents,
  invoice.merchandise_net_cents, invoice.shipping_cents, invoice.tax_cents,
  invoice.total_cents, invoice.tax_mention, invoice.line_items_json,
  invoice.terms_version
FROM order_invoices AS invoice`;

const creditNoteSelect = `SELECT
  note.id, note.refund_id, note.invoice_id, note.order_id, note.order_number,
  note.original_invoice_number, note.original_invoice_issued_at,
  note.credit_note_number, note.credit_note_year, note.credit_note_sequence,
  note.issued_at, note.refund_succeeded_at, note.refund_reason,
  note.refund_provider_reference, note.seller_snapshot_json,
  note.mediator_snapshot_json, note.buyer_email, note.billing_address_json,
  note.currency, note.original_total_cents, note.credit_amount_cents,
  note.credit_lines_json, note.tax_credit_cents, note.remaining_balance_cents,
  note.tax_mention
FROM order_credit_notes AS note`;

type InvoiceRow = Readonly<{
  id: string;
  order_id: string;
  order_number: string;
  invoice_number: string;
  invoice_year: number;
  invoice_sequence: number;
  issued_at: string;
  payment_confirmed_at: string;
  seller_snapshot_json: string;
  mediator_snapshot_json: string;
  buyer_email: string;
  billing_address_json: string;
  currency: string;
  merchandise_gross_cents: number;
  discount_cents: number;
  promotion_code: string | null;
  promotion_discount_cents: number;
  merchandise_net_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  tax_mention: string;
  line_items_json: string;
  terms_version: string;
}>;

type CreditNoteRow = Readonly<{
  id: string;
  refund_id: string;
  invoice_id: string;
  order_id: string;
  order_number: string;
  original_invoice_number: string;
  original_invoice_issued_at: string;
  credit_note_number: string;
  credit_note_year: number;
  credit_note_sequence: number;
  issued_at: string;
  refund_succeeded_at: string;
  refund_reason: string;
  refund_provider_reference: string;
  seller_snapshot_json: string;
  mediator_snapshot_json: string;
  buyer_email: string;
  billing_address_json: string;
  currency: string;
  original_total_cents: number;
  credit_amount_cents: number;
  credit_lines_json: string;
  tax_credit_cents: number;
  remaining_balance_cents: number;
  tax_mention: string;
}>;

type InvoiceSeller = Readonly<{
  brand: string;
  legalName: string;
  legalForm: string;
  registeredOffice: string;
  registration: string;
  contactEmail: string;
  contactPhone: string;
}>;

type InvoiceMediator = Readonly<{
  name: string;
  address: string;
  website: string;
  filingUrl: string;
}>;

type InvoiceAddress = Readonly<{
  recipient: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
}>;

type InvoiceLine = Readonly<{
  internalReference: string;
  productName: string;
  colorName: string;
  size: "S" | "M" | "L" | "XL";
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}>;

export type OrderInvoice = Readonly<{
  id: string;
  orderId: string;
  orderNumber: string;
  invoiceNumber: string;
  invoiceYear: number;
  invoiceSequence: number;
  issuedAt: string;
  paymentConfirmedAt: string;
  seller: InvoiceSeller;
  mediator: InvoiceMediator;
  buyerEmail: string;
  billingAddress: InvoiceAddress;
  currency: "EUR";
  merchandiseGrossCents: number;
  discountCents: number;
  promotionCode: string | null;
  promotionDiscountCents: number;
  merchandiseNetCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  taxMention: string;
  lines: readonly InvoiceLine[];
  termsVersion: string;
}>;

export type OrderCreditNote = Readonly<{
  id: string;
  refundId: string;
  invoiceId: string;
  orderId: string;
  orderNumber: string;
  originalInvoiceNumber: string;
  originalInvoiceIssuedAt: string;
  creditNoteNumber: string;
  creditNoteYear: number;
  creditNoteSequence: number;
  issuedAt: string;
  refundSucceededAt: string;
  refundReason: "return" | "withdrawal";
  refundProviderReference: string;
  seller: InvoiceSeller;
  mediator: InvoiceMediator;
  buyerEmail: string;
  billingAddress: InvoiceAddress;
  currency: "EUR";
  originalTotalCents: number;
  creditAmountCents: number;
  lines: readonly CreditNoteLine[];
  taxCreditCents: number;
  remainingBalanceCents: number;
  taxMention: string;
}>;

export type CreditNoteLine = Readonly<{
  kind: "item";
  orderLineId: string;
  internalReference: string;
  productName: string;
  colorName: string;
  size: "S" | "M" | "L" | "XL";
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}> | Readonly<{
  kind: "adjustment";
  label: "Ajustement / remboursement livraison";
  amountCents: number;
}>;

export type CreditNoteSummary = Readonly<{
  creditNoteNumber: string;
  issuedAt: string;
  creditAmountCents: number;
}>;

export class OrderInvoiceError extends Error {
  readonly code: "RUNTIME_NOT_READY" | "CORRUPT_SNAPSHOT";

  constructor(code: OrderInvoiceError["code"], options?: ErrorOptions) {
    super(code, options);
    this.name = "OrderInvoiceError";
    this.code = code;
  }
}

export async function productionInvoiceRuntimeInstalled(
  database: CommerceD1Database | undefined,
): Promise<boolean> {
  if (!database) return false;
  try {
    const installed = await database.prepare(
      `SELECT lower(type) AS type, lower(name) AS name,
        lower(tbl_name) AS table_name FROM sqlite_master
      WHERE lower(name) NOT GLOB 'sqlite_autoindex_*' AND (
        lower(tbl_name) IN ('invoice_sequences','order_invoices')
        OR lower(name) = 'trg_orders_create_invoice_after_payment'
      )
      UNION ALL
      SELECT 'column' AS type, lower(name) AS name,
        'order_invoices' AS table_name FROM pragma_table_info('order_invoices')
      ORDER BY type, name`,
    ).all<{ type: string; name: string; table_name: string }>();
    const actual = installed.results
      .map((row) => `${row.type}:${row.name}:${row.table_name}`)
      .sort();
    return actual.length === invoiceRuntimeInventory.length &&
      actual.every((value, index) => value === invoiceRuntimeInventory[index]);
  } catch {
    return false;
  }
}

export async function productionCreditNoteRuntimeInstalled(
  database: CommerceD1Database | undefined,
): Promise<boolean> {
  if (!database) return false;
  try {
    const [installed, missing] = await Promise.all([
      database.prepare(
        `SELECT lower(type) AS type, lower(name) AS name,
          lower(tbl_name) AS table_name FROM sqlite_master
        WHERE lower(name) NOT GLOB 'sqlite_autoindex_*' AND (
          lower(tbl_name) IN ('credit_note_sequences','order_credit_notes')
        )
        UNION ALL
        SELECT 'column' AS type, lower(name) AS name,
          'order_credit_notes' AS table_name
        FROM pragma_table_info('order_credit_notes')
        ORDER BY type, name`,
      ).all<{ type: string; name: string; table_name: string }>(),
      database.prepare(
        `SELECT COUNT(*) AS count
        FROM refunds AS refund
        WHERE refund.status='succeeded' AND NOT EXISTS (
          SELECT 1 FROM order_credit_notes AS note WHERE note.refund_id=refund.id
        )`,
      ).first<{ count: number }>(),
    ]);
    const actual = installed.results
      .map((row) => `${row.type}:${row.name}:${row.table_name}`)
      .sort();
    return actual.length === creditNoteRuntimeInventory.length &&
      actual.every((value, index) => value === creditNoteRuntimeInventory[index]) &&
      missing?.count === 0;
  } catch {
    return false;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (cause) {
    throw new OrderInvoiceError("CORRUPT_SNAPSHOT", { cause });
  }
}

function boundedString(value: unknown, maximum = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function amount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function parseSeller(value: string): InvoiceSeller {
  const parsed = parseJson(value);
  const keys = [
    "brand", "contactEmail", "contactPhone", "legalForm", "legalName",
    "registeredOffice", "registration",
  ];
  if (!record(parsed) || !exact(parsed, keys) ||
    keys.some((key) => !boundedString(parsed[key]))) {
    throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
  }
  return Object.freeze(parsed as InvoiceSeller);
}

function parseMediator(value: string): InvoiceMediator {
  const parsed = parseJson(value);
  const keys = ["address", "filingUrl", "name", "website"];
  if (!record(parsed) || !exact(parsed, keys) ||
    keys.some((key) => !boundedString(parsed[key]))) {
    throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
  }
  for (const key of ["filingUrl", "website"] as const) {
    try {
      const url = new URL(parsed[key] as string);
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error("unsafe invoice mediator URL");
      }
    } catch (cause) {
      throw new OrderInvoiceError("CORRUPT_SNAPSHOT", { cause });
    }
  }
  return Object.freeze(parsed as InvoiceMediator);
}

function parseAddress(value: string): InvoiceAddress {
  const parsed = parseJson(value);
  const keys = ["city", "countryCode", "line1", "line2", "postalCode", "recipient"];
  if (!record(parsed) || !exact(parsed, keys) ||
    !boundedString(parsed.recipient, 120) || !boundedString(parsed.line1, 160) ||
    !(parsed.line2 === null || boundedString(parsed.line2, 160)) ||
    !boundedString(parsed.postalCode, 16) || !boundedString(parsed.city, 120) ||
    typeof parsed.countryCode !== "string" || !/^[A-Z]{2}$/.test(parsed.countryCode)) {
    throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
  }
  return Object.freeze(parsed as InvoiceAddress);
}

function parseLines(value: string): readonly InvoiceLine[] {
  const parsed = parseJson(value);
  const keys = [
    "colorName", "internalReference", "lineTotalCents", "productName",
    "quantity", "size", "unitPriceCents",
  ];
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 3) {
    throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
  }
  const lines = parsed.map((line): InvoiceLine => {
    if (!record(line) || !exact(line, keys) ||
      !boundedString(line.internalReference, 191) ||
      !boundedString(line.productName, 160) || !boundedString(line.colorName, 120) ||
      !["S", "M", "L", "XL"].includes(String(line.size)) ||
      !Number.isSafeInteger(line.quantity) || Number(line.quantity) < 1 ||
      Number(line.quantity) > 3 || !amount(line.unitPriceCents) ||
      !amount(line.lineTotalCents) ||
      line.lineTotalCents !== Number(line.unitPriceCents) * Number(line.quantity)) {
      throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
    }
    return Object.freeze(line as InvoiceLine);
  });
  return Object.freeze(lines);
}

function parseInvoice(row: InvoiceRow): OrderInvoice {
  const seller = parseSeller(row.seller_snapshot_json);
  const mediator = parseMediator(row.mediator_snapshot_json);
  const billingAddress = parseAddress(row.billing_address_json);
  const lines = parseLines(row.line_items_json);
  const grossFromLines = lines.reduce((total, line) => total + line.lineTotalCents, 0);
  if (!boundedString(row.id, 256) || !boundedString(row.order_id, 256) ||
    !ORDER_NUMBER.test(row.order_number) || !INVOICE_NUMBER.test(row.invoice_number) ||
    !Number.isSafeInteger(row.invoice_year) || row.invoice_year < 2020 ||
    !Number.isSafeInteger(row.invoice_sequence) || row.invoice_sequence < 1 ||
    row.invoice_number !==
      `AJL-${String(row.invoice_year).padStart(4, "0")}-${String(row.invoice_sequence).padStart(6, "0")}` ||
    !CANONICAL_UTC.test(row.issued_at) || !CANONICAL_UTC.test(row.payment_confirmed_at) ||
    row.issued_at < row.payment_confirmed_at || !boundedString(row.buyer_email, 254) ||
    row.currency !== "EUR" || !amount(row.merchandise_gross_cents) ||
    !amount(row.discount_cents) || !amount(row.promotion_discount_cents) ||
    !amount(row.merchandise_net_cents) || !amount(row.shipping_cents) ||
    !amount(row.tax_cents) || !amount(row.total_cents) ||
    row.merchandise_gross_cents !== grossFromLines ||
    row.merchandise_gross_cents - row.discount_cents !== row.merchandise_net_cents ||
    row.discount_cents < row.promotion_discount_cents ||
    ((row.promotion_code === null) !== (row.promotion_discount_cents === 0)) ||
    row.merchandise_net_cents + row.shipping_cents + row.tax_cents !== row.total_cents ||
    !boundedString(row.tax_mention, 160) || !boundedString(row.terms_version, 64)) {
    throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
  }
  return Object.freeze({
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    invoiceNumber: row.invoice_number,
    invoiceYear: row.invoice_year,
    invoiceSequence: row.invoice_sequence,
    issuedAt: row.issued_at,
    paymentConfirmedAt: row.payment_confirmed_at,
    seller,
    mediator,
    buyerEmail: row.buyer_email,
    billingAddress,
    currency: "EUR",
    merchandiseGrossCents: row.merchandise_gross_cents,
    discountCents: row.discount_cents,
    promotionCode: row.promotion_code,
    promotionDiscountCents: row.promotion_discount_cents,
    merchandiseNetCents: row.merchandise_net_cents,
    shippingCents: row.shipping_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    taxMention: row.tax_mention,
    lines,
    termsVersion: row.terms_version,
  });
}

function parseCreditLines(value: string): readonly CreditNoteLine[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 16) {
    throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
  }
  const orderLineIds = new Set<string>();
  let adjustmentSeen = false;
  const lines = parsed.map((line): CreditNoteLine => {
    if (!record(line) || line.kind === undefined) {
      throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
    }
    if (line.kind === "adjustment") {
      if (adjustmentSeen || !exact(line, ["amountCents", "kind", "label"]) ||
        line.label !== "Ajustement / remboursement livraison" ||
        !amount(line.amountCents) || Number(line.amountCents) < 1) {
        throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
      }
      adjustmentSeen = true;
      return Object.freeze(line as CreditNoteLine);
    }
    const keys = [
      "amountCents", "colorName", "internalReference", "kind", "orderLineId",
      "productName", "quantity", "size", "unitPriceCents",
    ];
    if (line.kind !== "item" || !exact(line, keys) ||
      !boundedString(line.orderLineId, 191) || orderLineIds.has(line.orderLineId) ||
      !boundedString(line.internalReference, 191) ||
      !boundedString(line.productName, 160) || !boundedString(line.colorName, 120) ||
      !["S", "M", "L", "XL"].includes(String(line.size)) ||
      !Number.isSafeInteger(line.quantity) || Number(line.quantity) < 1 ||
      Number(line.quantity) > 3 || !amount(line.unitPriceCents) ||
      !amount(line.amountCents) ||
      line.amountCents !== Number(line.unitPriceCents) * Number(line.quantity)) {
      throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
    }
    orderLineIds.add(line.orderLineId);
    return Object.freeze(line as CreditNoteLine);
  });
  return Object.freeze(lines);
}

function parseCreditNote(row: CreditNoteRow): OrderCreditNote {
  const seller = parseSeller(row.seller_snapshot_json);
  const mediator = parseMediator(row.mediator_snapshot_json);
  const billingAddress = parseAddress(row.billing_address_json);
  const lines = parseCreditLines(row.credit_lines_json);
  const creditedFromLines = lines.reduce((total, line) => total + line.amountCents, 0);
  if (!boundedString(row.id, 256) || !boundedString(row.refund_id, 256) ||
    !boundedString(row.invoice_id, 256) || !boundedString(row.order_id, 256) ||
    !ORDER_NUMBER.test(row.order_number) ||
    !INVOICE_NUMBER.test(row.original_invoice_number) ||
    !CREDIT_NOTE_NUMBER.test(row.credit_note_number) ||
    !Number.isSafeInteger(row.credit_note_year) || row.credit_note_year < 2020 ||
    !Number.isSafeInteger(row.credit_note_sequence) || row.credit_note_sequence < 1 ||
    row.credit_note_number !==
      `AJL-AV-${String(row.credit_note_year).padStart(4, "0")}-${String(row.credit_note_sequence).padStart(6, "0")}` ||
    !CANONICAL_UTC.test(row.original_invoice_issued_at) ||
    !CANONICAL_UTC.test(row.issued_at) ||
    !CANONICAL_UTC.test(row.refund_succeeded_at) ||
    row.issued_at !== row.refund_succeeded_at ||
    !["return", "withdrawal"].includes(row.refund_reason) ||
    !boundedString(row.refund_provider_reference, 191) ||
    !boundedString(row.buyer_email, 254) || row.currency !== "EUR" ||
    !amount(row.original_total_cents) || row.original_total_cents < 1 ||
    !amount(row.credit_amount_cents) || row.credit_amount_cents < 1 ||
    row.credit_amount_cents > row.original_total_cents ||
    creditedFromLines !== row.credit_amount_cents ||
    row.tax_credit_cents !== 0 || !amount(row.remaining_balance_cents) ||
    row.remaining_balance_cents >= row.original_total_cents ||
    row.credit_amount_cents + row.remaining_balance_cents > row.original_total_cents ||
    !boundedString(row.tax_mention, 160)) {
    throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
  }
  return Object.freeze({
    id: row.id,
    refundId: row.refund_id,
    invoiceId: row.invoice_id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    originalInvoiceNumber: row.original_invoice_number,
    originalInvoiceIssuedAt: row.original_invoice_issued_at,
    creditNoteNumber: row.credit_note_number,
    creditNoteYear: row.credit_note_year,
    creditNoteSequence: row.credit_note_sequence,
    issuedAt: row.issued_at,
    refundSucceededAt: row.refund_succeeded_at,
    refundReason: row.refund_reason as "return" | "withdrawal",
    refundProviderReference: row.refund_provider_reference,
    seller,
    mediator,
    buyerEmail: row.buyer_email,
    billingAddress,
    currency: "EUR",
    originalTotalCents: row.original_total_cents,
    creditAmountCents: row.credit_amount_cents,
    lines,
    taxCreditCents: row.tax_credit_cents,
    remainingBalanceCents: row.remaining_balance_cents,
    taxMention: row.tax_mention,
  });
}

async function firstInvoice(
  database: CommerceD1Database,
  query: string,
  values: readonly string[],
): Promise<OrderInvoice | null> {
  try {
    const row = await database.prepare(query).bind(...values).first<InvoiceRow>();
    return row ? parseInvoice(row) : null;
  } catch (cause) {
    if (cause instanceof OrderInvoiceError) throw cause;
    throw new OrderInvoiceError("RUNTIME_NOT_READY", { cause });
  }
}

async function firstCreditNote(
  database: CommerceD1Database,
  query: string,
  values: readonly string[],
): Promise<OrderCreditNote | null> {
  try {
    const row = await database.prepare(query).bind(...values).first<CreditNoteRow>();
    return row ? parseCreditNote(row) : null;
  } catch (cause) {
    if (cause instanceof OrderInvoiceError) throw cause;
    throw new OrderInvoiceError("RUNTIME_NOT_READY", { cause });
  }
}

export async function customerOrderInvoice(
  database: CommerceD1Database,
  orderNumber: string,
  customerId: string,
): Promise<OrderInvoice | null> {
  if (!ORDER_NUMBER.test(orderNumber) || !CUSTOMER_ID.test(customerId)) return null;
  return firstInvoice(
    database,
    `${invoiceSelect}
    INNER JOIN orders AS customer_order ON customer_order.id = invoice.order_id
    WHERE invoice.order_number = ? AND customer_order.customer_id = ?
      AND customer_order.status IN ('paid','preparing','shipped','refunded')
    LIMIT 1`,
    [orderNumber, customerId],
  );
}

export async function administratorOrderInvoice(
  database: CommerceD1Database,
  orderId: string,
): Promise<OrderInvoice | null> {
  if (!CUSTOMER_ID.test(orderId)) return null;
  return firstInvoice(
    database,
    `${invoiceSelect}
    INNER JOIN orders AS customer_order ON customer_order.id = invoice.order_id
    WHERE invoice.order_id = ?
      AND customer_order.status IN ('paid','preparing','shipped','refunded')
    LIMIT 1`,
    [orderId],
  );
}

export async function customerOrderCreditNote(
  database: CommerceD1Database,
  creditNoteNumber: string,
  customerId: string,
): Promise<OrderCreditNote | null> {
  if (!CREDIT_NOTE_NUMBER.test(creditNoteNumber) || !CUSTOMER_ID.test(customerId)) {
    return null;
  }
  return firstCreditNote(
    database,
    `${creditNoteSelect}
    INNER JOIN orders AS customer_order ON customer_order.id = note.order_id
    WHERE note.credit_note_number = ? AND customer_order.customer_id = ?
    LIMIT 1`,
    [creditNoteNumber, customerId],
  );
}

export async function administratorOrderCreditNote(
  database: CommerceD1Database,
  orderId: string,
  creditNoteNumber: string,
): Promise<OrderCreditNote | null> {
  if (!CUSTOMER_ID.test(orderId) || !CREDIT_NOTE_NUMBER.test(creditNoteNumber)) {
    return null;
  }
  return firstCreditNote(
    database,
    `${creditNoteSelect}
    WHERE note.order_id = ? AND note.credit_note_number = ?
    LIMIT 1`,
    [orderId, creditNoteNumber],
  );
}

export async function invoiceCreditNoteSummaries(
  database: CommerceD1Database,
  invoiceId: string,
): Promise<readonly CreditNoteSummary[]> {
  if (!CUSTOMER_ID.test(invoiceId)) return Object.freeze([]);
  try {
    const notes = await database.prepare(
      `SELECT credit_note_number, issued_at, credit_amount_cents
      FROM order_credit_notes WHERE invoice_id=?
      ORDER BY issued_at, id`,
    ).bind(invoiceId).all<{
      credit_note_number: string;
      issued_at: string;
      credit_amount_cents: number;
    }>();
    const parsed = notes.results.map((note): CreditNoteSummary => {
      if (!CREDIT_NOTE_NUMBER.test(note.credit_note_number) ||
        !CANONICAL_UTC.test(note.issued_at) || !amount(note.credit_amount_cents) ||
        note.credit_amount_cents < 1) {
        throw new OrderInvoiceError("CORRUPT_SNAPSHOT");
      }
      return Object.freeze({
        creditNoteNumber: note.credit_note_number,
        issuedAt: note.issued_at,
        creditAmountCents: note.credit_amount_cents,
      });
    });
    return Object.freeze(parsed);
  } catch (cause) {
    if (cause instanceof OrderInvoiceError) throw cause;
    throw new OrderInvoiceError("RUNTIME_NOT_READY", { cause });
  }
}

export async function invoiceCreditNotes(
  database: CommerceD1Database,
  invoiceId: string,
): Promise<readonly OrderCreditNote[]> {
  if (!CUSTOMER_ID.test(invoiceId)) return Object.freeze([]);
  try {
    const notes = await database.prepare(
      `${creditNoteSelect}
      WHERE note.invoice_id=? ORDER BY note.issued_at, note.id`,
    ).bind(invoiceId).all<CreditNoteRow>();
    return Object.freeze(notes.results.map(parseCreditNote));
  } catch (cause) {
    if (cause instanceof OrderInvoiceError) throw cause;
    throw new OrderInvoiceError("RUNTIME_NOT_READY", { cause });
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function money(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function dateFr(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function orderInvoiceHtmlResponse(
  invoice: OrderInvoice,
  creditNotes: readonly OrderCreditNote[] = Object.freeze([]),
  audience: "customer" | "administrator" = "customer",
): Response {
  const nonce = randomNonce();
  const address = invoice.billingAddress;
  const addressLines = [
    address.recipient,
    address.line1,
    address.line2,
    `${address.postalCode} ${address.city}`,
    address.countryCode,
    invoice.buyerEmail,
  ].filter((line): line is string => Boolean(line)).map(escapeHtml).join("<br>");
  const rows = invoice.lines.map((line) => `<tr>
    <td><strong>${escapeHtml(line.productName)}</strong><br><small>${escapeHtml(line.colorName)} · ${escapeHtml(line.size)} · ${escapeHtml(line.internalReference)}</small></td>
    <td class="number">${line.quantity}</td>
    <td class="number">${escapeHtml(money(line.unitPriceCents))}</td>
    <td class="number">${escapeHtml(money(line.lineTotalCents))}</td>
  </tr>`).join("");
  const promotion = invoice.promotionCode
    ? `<p>Code promotionnel appliqué : <strong>${escapeHtml(invoice.promotionCode)}</strong> (${escapeHtml(money(invoice.promotionDiscountCents))})</p>`
    : "";
  const creditNoteLinks = creditNotes.length > 0
    ? `<section class="credits"><p class="label">Avoirs liés à cette facture</p><ul>${creditNotes.map((note) => {
      const href = audience === "administrator"
        ? `/api/commerce/admin/orders/${encodeURIComponent(invoice.orderId)}/credit-notes/${encodeURIComponent(note.creditNoteNumber)}`
        : `/api/commerce/account/credit-notes/${encodeURIComponent(note.creditNoteNumber)}`;
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(note.creditNoteNumber)}</a> · ${escapeHtml(dateFr(note.issuedAt))} · ${escapeHtml(money(note.creditAmountCents))}</li>`;
    }).join("")}</ul></section>`
    : "";
  const creditPages = creditNotes.map((note) => {
    const creditRows = note.lines.map((line) => line.kind === "item"
      ? `<tr><td><strong>${escapeHtml(line.productName)}</strong><br><small>${escapeHtml(line.colorName)} · ${escapeHtml(line.size)} · ${escapeHtml(line.internalReference)}</small></td><td class="number">${line.quantity}</td><td class="number">${escapeHtml(money(line.unitPriceCents))}</td><td class="number">− ${escapeHtml(money(line.amountCents))}</td></tr>`
      : `<tr><td><strong>${escapeHtml(line.label)}</strong><br><small>Inclut le cas échéant les frais de livraison remboursés.</small></td><td class="number">1</td><td class="number">—</td><td class="number">− ${escapeHtml(money(line.amountCents))}</td></tr>`)
      .join("");
    return `<article class="sheet credit-page"><header class="top"><div><div class="brand">AJ LUXURY</div><p>${escapeHtml(note.seller.legalName)}<br>${escapeHtml(note.seller.registeredOffice)}</p></div><div><p class="label">Avoir de remboursement</p><h1>${escapeHtml(note.creditNoteNumber)}</h1><p>Émis le ${escapeHtml(dateFr(note.issuedAt))}<br>Facture initiale ${escapeHtml(note.originalInvoiceNumber)}<br>Commande ${escapeHtml(note.orderNumber)}</p></div></header><p><strong>Remboursement confirmé le ${escapeHtml(dateFr(note.refundSucceededAt))}</strong></p><table><thead><tr><th>Calcul de l’avoir</th><th class="number">Qté</th><th class="number">Prix unitaire</th><th class="number">Montant crédité</th></tr></thead><tbody>${creditRows}</tbody></table><section class="totals"><div><span>Total de la facture initiale</span><strong>${escapeHtml(money(note.originalTotalCents))}</strong></div><div class="grand"><span>Montant de cet avoir</span><strong>− ${escapeHtml(money(note.creditAmountCents))}</strong></div><div><span>Solde après cet avoir</span><strong>${escapeHtml(money(note.remainingBalanceCents))}</strong></div></section><footer class="legal"><p><strong>${escapeHtml(note.taxMention)}</strong></p><p>Cet avoir rectifie la facture initiale sans la supprimer.</p></footer></article>`;
  }).join("");
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>Facture ${escapeHtml(invoice.invoiceNumber)} · AJ Luxury</title>
<style nonce="${nonce}">
@page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;background:#eee;color:#111;font:14px/1.45 Arial,sans-serif}.sheet{width:210mm;min-height:297mm;margin:20px auto;padding:18mm;background:#fff}.credit-page{break-before:page;page-break-before:always}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #111;padding-bottom:18px}.brand{font-size:32px;letter-spacing:.18em}.muted{color:#555}.addresses{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:28px 0}.label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:12px 8px;border-bottom:1px solid #ccc;text-align:left}.number{text-align:right;white-space:nowrap}.totals{width:52%;margin-left:auto}.totals div{display:flex;justify-content:space-between;padding:6px 0}.totals .grand{font-size:18px;font-weight:700;border-top:2px solid #111;margin-top:8px;padding-top:12px}.credits{border:1px solid #ccc;margin-top:28px;padding:16px}.credits ul{margin:8px 0 0;padding-left:20px}.credits a{color:#111}.legal{border-top:1px solid #bbb;margin-top:34px;padding-top:16px;font-size:11px;color:#444}.actions{width:210mm;margin:18px auto;display:flex;justify-content:flex-end}.actions button{border:0;background:#111;color:#fff;padding:12px 18px;cursor:pointer;font-weight:700}@media print{body{background:#fff}.actions{display:none}.sheet{margin:0;width:auto;min-height:auto;padding:0}.credit-page{break-before:page;page-break-before:always}}@media(max-width:800px){.sheet{width:100%;min-height:0;margin:0;padding:24px}.actions{width:100%;padding:0 24px}.top,.addresses{display:block}.top>*,.addresses>*{margin-bottom:20px}.totals{width:100%}}
</style></head><body><div class="actions"><button id="print-invoice" type="button">Imprimer ou enregistrer en PDF</button></div>
<main class="sheet"><header class="top"><div><div class="brand">AJ LUXURY</div><p>${escapeHtml(invoice.seller.legalName)}<br>${escapeHtml(invoice.seller.registeredOffice)}</p></div><div><p class="label">Facture acquittée</p><h1>${escapeHtml(invoice.invoiceNumber)}</h1><p>Émise le ${escapeHtml(dateFr(invoice.issuedAt))}<br>Commande ${escapeHtml(invoice.orderNumber)}<br>Paiement confirmé le ${escapeHtml(dateFr(invoice.paymentConfirmedAt))}</p></div></header>
<section class="addresses"><div><p class="label">Vendeur</p><p>${escapeHtml(invoice.seller.legalForm)}<br>${escapeHtml(invoice.seller.registration)}<br>${escapeHtml(invoice.seller.contactEmail)}<br>${escapeHtml(invoice.seller.contactPhone)}</p></div><div><p class="label">Facturer à</p><p>${addressLines}</p></div></section>
<table><thead><tr><th>Désignation</th><th class="number">Qté</th><th class="number">Prix unitaire</th><th class="number">Montant</th></tr></thead><tbody>${rows}</tbody></table>
${promotion}<section class="totals"><div><span>Marchandises avant remise</span><strong>${escapeHtml(money(invoice.merchandiseGrossCents))}</strong></div><div><span>Remises</span><strong>− ${escapeHtml(money(invoice.discountCents))}</strong></div><div><span>Sous-total marchandises</span><strong>${escapeHtml(money(invoice.merchandiseNetCents))}</strong></div><div><span>Livraison</span><strong>${escapeHtml(money(invoice.shippingCents))}</strong></div><div><span>TVA</span><strong>${escapeHtml(money(invoice.taxCents))}</strong></div><div class="grand"><span>Total réglé</span><strong>${escapeHtml(money(invoice.totalCents))}</strong></div></section>${creditNoteLinks}
<footer class="legal"><p><strong>${escapeHtml(invoice.taxMention)}</strong></p><p>Conditions de vente acceptées : version ${escapeHtml(invoice.termsVersion)}.</p><p>Réclamation préalable : ${escapeHtml(invoice.seller.contactEmail)}. Médiation de la consommation : ${escapeHtml(invoice.mediator.name)}, ${escapeHtml(invoice.mediator.address)}, ${escapeHtml(invoice.mediator.website)}.</p><p>Cette facture est un document comptable distinct de l’étiquette transporteur.</p></footer></main>${creditPages}
<script nonce="${nonce}">document.getElementById("print-invoice")?.addEventListener("click",()=>window.print());</script></body></html>`;
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": `inline; filename="facture-${invoice.invoiceNumber}.html"`,
    "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    "Content-Type": "text/html; charset=utf-8",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });
  return new Response(html, { status: 200, headers });
}

export function orderCreditNoteHtmlResponse(
  note: OrderCreditNote,
  audience: "customer" | "administrator" = "customer",
): Response {
  const nonce = randomNonce();
  const address = note.billingAddress;
  const addressLines = [
    address.recipient,
    address.line1,
    address.line2,
    `${address.postalCode} ${address.city}`,
    address.countryCode,
    note.buyerEmail,
  ].filter((line): line is string => Boolean(line)).map(escapeHtml).join("<br>");
  const invoiceHref = audience === "administrator"
    ? `/api/commerce/admin/orders/${encodeURIComponent(note.orderId)}/invoice`
    : `/api/commerce/account/invoices/${encodeURIComponent(note.orderNumber)}`;
  const reason = note.refundReason === "withdrawal"
    ? "Rétractation du client"
    : "Retour produit accepté";
  const rows = note.lines.map((line) => line.kind === "item"
    ? `<tr><td><strong>${escapeHtml(line.productName)}</strong><br><small>${escapeHtml(line.colorName)} · ${escapeHtml(line.size)} · ${escapeHtml(line.internalReference)}</small></td><td class="number">${line.quantity}</td><td class="number">${escapeHtml(money(line.unitPriceCents))}</td><td class="number">− ${escapeHtml(money(line.amountCents))}</td></tr>`
    : `<tr><td><strong>${escapeHtml(line.label)}</strong><br><small>Écart entre les articles crédités et le remboursement confirmé, incluant le cas échéant les frais de livraison.</small></td><td class="number">1</td><td class="number">—</td><td class="number">− ${escapeHtml(money(line.amountCents))}</td></tr>`)
    .join("");
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>Avoir ${escapeHtml(note.creditNoteNumber)} · AJ Luxury</title>
<style nonce="${nonce}">
@page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;background:#eee;color:#111;font:14px/1.45 Arial,sans-serif}.sheet{width:210mm;min-height:297mm;margin:20px auto;padding:18mm;background:#fff}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #111;padding-bottom:18px}.brand{font-size:32px;letter-spacing:.18em}.addresses{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:28px 0}.label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666}.reason{border:1px solid #ccc;padding:18px;margin:26px 0}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:12px 8px;border-bottom:1px solid #ccc;text-align:left}.number{text-align:right;white-space:nowrap}.totals{width:55%;margin:26px 0 26px auto}.totals div{display:flex;justify-content:space-between;padding:7px 0}.totals .grand{font-size:18px;font-weight:700;border-top:2px solid #111;margin-top:8px;padding-top:12px}.invoice-link{margin:26px 0}.invoice-link a{color:#111}.legal{border-top:1px solid #bbb;margin-top:34px;padding-top:16px;font-size:11px;color:#444}.actions{width:210mm;margin:18px auto;display:flex;justify-content:flex-end}.actions button{border:0;background:#111;color:#fff;padding:12px 18px;cursor:pointer;font-weight:700}@media print{body{background:#fff}.actions{display:none}.sheet{margin:0;width:auto;min-height:auto;padding:0}}@media(max-width:800px){.sheet{width:100%;min-height:0;margin:0;padding:24px}.actions{width:100%;padding:0 24px}.top,.addresses{display:block}.top>*,.addresses>*{margin-bottom:20px}.totals{width:100%}}
</style></head><body><div class="actions"><button id="print-credit-note" type="button">Imprimer ou enregistrer en PDF</button></div>
<main class="sheet"><header class="top"><div><div class="brand">AJ LUXURY</div><p>${escapeHtml(note.seller.legalName)}<br>${escapeHtml(note.seller.registeredOffice)}</p></div><div><p class="label">Avoir de remboursement</p><h1>${escapeHtml(note.creditNoteNumber)}</h1><p>Émis le ${escapeHtml(dateFr(note.issuedAt))}<br>Facture initiale ${escapeHtml(note.originalInvoiceNumber)} du ${escapeHtml(dateFr(note.originalInvoiceIssuedAt))}<br>Commande ${escapeHtml(note.orderNumber)}</p></div></header>
<section class="addresses"><div><p class="label">Vendeur</p><p>${escapeHtml(note.seller.legalForm)}<br>${escapeHtml(note.seller.registration)}<br>${escapeHtml(note.seller.contactEmail)}<br>${escapeHtml(note.seller.contactPhone)}</p></div><div><p class="label">Client</p><p>${addressLines}</p></div></section>
<section class="reason"><p class="label">Motif</p><p><strong>${escapeHtml(reason)}</strong></p><p>Remboursement confirmé le ${escapeHtml(dateFr(note.refundSucceededAt))}. Référence prestataire : ${escapeHtml(note.refundProviderReference)}.</p></section>
<table><thead><tr><th>Calcul de l’avoir</th><th class="number">Qté</th><th class="number">Prix unitaire</th><th class="number">Montant crédité</th></tr></thead><tbody>${rows}</tbody></table>
<section class="totals"><div><span>Total de la facture initiale</span><strong>${escapeHtml(money(note.originalTotalCents))}</strong></div><div><span>TVA régularisée</span><strong>${escapeHtml(money(note.taxCreditCents))}</strong></div><div class="grand"><span>Montant de cet avoir</span><strong>− ${escapeHtml(money(note.creditAmountCents))}</strong></div><div><span>Solde après cet avoir</span><strong>${escapeHtml(money(note.remainingBalanceCents))}</strong></div></section>
<p class="invoice-link"><a href="${escapeHtml(invoiceHref)}">Consulter la facture initiale ${escapeHtml(note.originalInvoiceNumber)}</a></p>
<footer class="legal"><p><strong>${escapeHtml(note.taxMention)}</strong></p><p>Cet avoir rectifie partiellement ou totalement la facture initiale sans la supprimer. Il est distinct de la confirmation Stripe et de l’étiquette transporteur.</p><p>Réclamation préalable : ${escapeHtml(note.seller.contactEmail)}. Médiation de la consommation : ${escapeHtml(note.mediator.name)}, ${escapeHtml(note.mediator.address)}, ${escapeHtml(note.mediator.website)}.</p></footer></main>
<script nonce="${nonce}">document.getElementById("print-credit-note")?.addEventListener("click",()=>window.print());</script></body></html>`;
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": `inline; filename="avoir-${note.creditNoteNumber}.html"`,
    "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    "Content-Type": "text/html; charset=utf-8",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });
  return new Response(html, { status: 200, headers });
}
