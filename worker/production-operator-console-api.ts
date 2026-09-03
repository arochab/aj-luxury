import { isCanonicalUtcTimestamp } from "../lib/commerce/account-security.ts";
import { D1CustomerPasswordAccountStore } from "../lib/commerce/customer-password-account-store.ts";
import { resolveD1MutationActor } from "../lib/commerce/d1-actor-authorization.ts";
import type { CommerceD1Database } from "../lib/commerce/d1-port.ts";
import { D1IdentityAccessStore } from "../lib/commerce/identity-access-store.ts";
import {
  authorizeBrowserMutation,
  buildCsrfCookie,
  buildSessionCookie,
  clearCsrfCookie,
  clearSessionCookie,
} from "../lib/commerce/identity-access-policy.ts";
import {
  cloudflareAccessOwnerIdentity,
  type CloudflareAccessOwnerEnvironment,
  type CloudflareAccessOwnerIdentity,
} from "./cloudflare-access-owner.ts";
import { adminEmailAllowed, configuredAdminEmails } from "./admin-email-allowlist.ts";
import { normalizePromotionCode, PromotionCodeError } from "../lib/commerce/promotion-code.ts";
import {
  administratorOrderCreditNote,
  administratorOrderInvoice,
  invoiceCreditNotes,
  orderCreditNoteHtmlResponse,
  orderInvoiceHtmlResponse,
  OrderInvoiceError,
} from "../lib/commerce/order-invoice.ts";

const SESSION_ROUTE = "/api/commerce/admin/session";
const ORDERS_ROUTE = "/api/commerce/admin/orders";
const INVENTORY_ROUTE = "/api/commerce/admin/inventory";
const PROMOTIONS_ROUTE = "/api/commerce/admin/promotions";
const ORDER_DETAIL_ROUTE = /^\/api\/commerce\/admin\/orders\/([^/]+)$/;
const ORDER_INVOICE_ROUTE =
  /^\/api\/commerce\/admin\/orders\/([^/]+)\/invoice$/;
const ORDER_CREDIT_NOTE_ROUTE =
  /^\/api\/commerce\/admin\/orders\/([^/]+)\/credit-notes\/([^/]+)$/;
const PROMOTION_STATUS_ROUTE = /^\/api\/commerce\/admin\/promotions\/([^/]+)\/status$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const ACCESS_SESSION_ATTESTATION = "cloudflare-access:allowlisted-email";
const NATIVE_SESSION_ATTESTATION = "aj-luxury:verified-email-password-allowlist";
const MAX_FRESH_AUTH_MS = 5 * 60_000;

type AdminAuthenticationIdentity = Readonly<{
  issuer: string;
  subject: string;
  email: string;
  authenticatedAt: string;
  assertion: string;
  attestation: string;
}>;

export type ProductionOperatorConsoleEnvironment = CloudflareAccessOwnerEnvironment & Readonly<{
  APP_ENV?: string;
  COMMERCE_MODE?: string;
  COMMERCE_ORIGIN?: string;
  OPERATOR_ADMIN_MFA_ENABLED?: string;
  OPERATOR_CONSOLE_ENABLED?: string;
  CLOUDFLARE_ACCESS_MFA_ATTESTATION?: string;
  DB?: CommerceD1Database;
}>;

export type ProductionOperatorConsoleDependencies = Readonly<{
  accessIdentity?: (
    request: Request,
    env: ProductionOperatorConsoleEnvironment,
  ) => Promise<CloudflareAccessOwnerIdentity | null>;
  now?: () => string;
}>;

type OrderRow = Readonly<{
  id: string;
  order_number: string;
  status: string;
  currency: string;
  total_cents: number;
  paid_at: string | null;
  created_at: string;
  shipment_id: string | null;
  shipment_status: string | null;
  shipment_attempts: number | null;
  shipment_max_attempts: number | null;
  shipment_last_error_code: string | null;
  shipment_provider_reference: string | null;
  shipment_tracking_provider_code: string | null;
  shipment_tracking_reference: string | null;
  shipment_receipt_fingerprint: string | null;
  shipment_label_email_status: string | null;
  shipment_zone: string | null;
  shipment_customs_status: string | null;
  shipping_phone_type: string | null;
  retry_authorization_id: string | null;
  retry_authorization_consumed_at: string | null;
  order_email_status: string | null;
  payment_email_status: string | null;
}>;

type OrderDetailRow = Readonly<{
  id: string;
  order_number: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  shipping_address_json: string;
  paid_at: string | null;
  created_at: string;
  shipment_id: string | null;
  shipment_status: string | null;
  tracking_provider_code: string | null;
  tracking_reference: string | null;
  shipment_zone: string | null;
  shipment_customs_status: string | null;
}>;

type OrderLineRow = Readonly<{
  internal_reference: string;
  product_name: string;
  color_name: string;
  size: string;
  quantity: number;
}>;

type PromotionListRow = Readonly<{
  id: string;
  code: string;
  kind: "percentage" | "fixed";
  percentage_basis_points: number | null;
  fixed_discount_cents: number | null;
  minimum_subtotal_cents: number;
  maximum_discount_cents: number | null;
  maximum_redemptions: number | null;
  active: number;
  starts_at: string;
  ends_at: string | null;
  reserved_count: number;
  redeemed_count: number;
}>;

type InventoryRow = Readonly<{
  internal_reference: string;
  product_name: string;
  color_name: string;
  size: string;
  physical_quantity: number;
  gift_reserve_quantity: number;
  safety_reserve_quantity: number;
  active_reserved_quantity: number;
  sold_quantity: number;
  available_quantity: number;
  updated_at: string;
}>;

type OperatorShippingAddress = Readonly<{
  recipient: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
}>;

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("X-Robots-Tag", "noindex, nofollow");
  return Response.json(value, {
    status,
    headers: responseHeaders,
  });
}

function fail(code: string, status: number): Response {
  return json({ error: { code, requestId: `req_${crypto.randomUUID()}` } }, status);
}

function cookie(request: Request, name: string): string | null {
  const values = (request.headers.get("Cookie") ?? "").split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    return separator >= 1 && part.slice(0, separator).trim() === name
      ? [part.slice(separator + 1).trim()]
      : [];
  });
  return values.length === 1 ? values[0] : null;
}

function operatorShippingAddress(value: string): OperatorShippingAddress | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const recipient = record.recipient;
    const line1 = record.line1;
    const line2 = record.line2;
    const postalCode = record.postalCode;
    const city = record.city;
    const countryCode = record.countryCode;
    if (
      typeof recipient !== "string" || recipient.length < 1 || recipient.length > 120 ||
      typeof line1 !== "string" || line1.length < 1 || line1.length > 160 ||
      (line2 !== null && line2 !== undefined &&
        (typeof line2 !== "string" || line2.length > 160)) ||
      typeof postalCode !== "string" || postalCode.length < 1 || postalCode.length > 16 ||
      typeof city !== "string" || city.length < 1 || city.length > 120 ||
      typeof countryCode !== "string" || !/^[A-Z]{2}$/.test(countryCode)
    ) return null;
    return Object.freeze({
      recipient,
      line1,
      line2: typeof line2 === "string" && line2.length > 0 ? line2 : null,
      postalCode,
      city,
      countryCode,
    });
  } catch {
    return null;
  }
}

function decodedIdentifier(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return SAFE_ID.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  ));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function configured(
  env: ProductionOperatorConsoleEnvironment | undefined,
  url: URL,
): env is ProductionOperatorConsoleEnvironment & { DB: CommerceD1Database } {
  return Boolean(
    env?.APP_ENV === "production" &&
    ["controlled", "live"].includes(env.COMMERCE_MODE ?? "") &&
    env.COMMERCE_ORIGIN === url.origin &&
    env.OPERATOR_CONSOLE_ENABLED === "true" &&
    configuredAdminEmails(env) !== null &&
    env.DB,
  );
}

function sameOriginMutation(request: Request, origin: string): boolean {
  return request.headers.get("Origin") === origin &&
    request.headers.get("Sec-Fetch-Site") === "same-origin";
}

async function emptyBody(request: Request): Promise<boolean> {
  if (!request.body) return true;
  const bytes = new Uint8Array(await request.arrayBuffer());
  return bytes.byteLength === 0;
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) {
    return null;
  }
  const declared = request.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 8_192)) return null;
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > 8_192) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

async function accessIdentity(
  request: Request,
  env: ProductionOperatorConsoleEnvironment,
  dependencies: ProductionOperatorConsoleDependencies,
): Promise<CloudflareAccessOwnerIdentity | null> {
  return await (dependencies.accessIdentity ?? cloudflareAccessOwnerIdentity)(request, env);
}

async function persistAdminSession(
  env: ProductionOperatorConsoleEnvironment & { DB: CommerceD1Database },
  identity: AdminAuthenticationIdentity,
  now: string,
): Promise<Response> {
  const authenticatedAt = identity.authenticatedAt;
  if (!isCanonicalUtcTimestamp(authenticatedAt) || authenticatedAt > now ||
    Date.parse(now) - Date.parse(authenticatedAt) > MAX_FRESH_AUTH_MS) {
    return fail("FRESH_ACCESS_REQUIRED", 403);
  }
  const externalSubjectHash = await sha256(
    `ajl-access-subject-v1\0${identity.issuer}\0${identity.subject}`,
  );
  const evidenceHash = await sha256(
    `ajl-admin-session-v2\0${identity.assertion}\0${identity.attestation}`,
  );
  const administratorId = `admin_${externalSubjectHash.slice(0, 48)}`;
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO administrators (
        id, external_subject_hash, role, enabled, authz_version, created_at, updated_at
      ) VALUES (?, ?, 'owner', 1, 1, ?, ?)`,
    ).bind(administratorId, externalSubjectHash, now, now).run();
    const store = new D1IdentityAccessStore(env.DB, {
      delivery: { async deliver() { throw new Error("not available"); } },
      rateLimit: { async take(input) { return input.scope === "admin_sign_in"; } },
      externalMfa: {
        async verify(assertion) {
          return assertion === identity.assertion
            // The short-lived admin session remains bound to the successful
            // authentication proof and to the exact three-address allowlist.
            ? { externalSubjectHash, evidenceHash, aal: 2, authenticatedAt }
            : null;
        },
      },
      background: { defer() { throw new Error("not available"); } },
      timing: {
        monotonicMilliseconds() { return performance.now(); },
        async wait() {},
      },
      utcClock: { now() { return now; } },
    });
    const session = await store.createAdminSession({
      assertion: identity.assertion,
      sessionId: `admin_session_${crypto.randomUUID().replaceAll("-", "")}`,
      now,
    });
    if (!session || session.role !== "owner") return fail("OWNER_SESSION_UNAVAILABLE", 503);
    const maxAge = Math.max(60, Math.floor((Date.parse(session.expiresAt) - Date.parse(now)) / 1_000));
    const headers = new Headers();
    headers.append("Set-Cookie", buildSessionCookie("admin", session.token, maxAge));
    headers.append("Set-Cookie", buildCsrfCookie("admin", session.csrfToken, maxAge));
    return json({
      data: {
        role: session.role,
        expiresAt: session.expiresAt,
        csrfToken: session.csrfToken,
      },
    }, 201, headers);
  } catch {
    return fail("OWNER_SESSION_UNAVAILABLE", 503);
  }
}

async function createAccessSession(
  request: Request,
  env: ProductionOperatorConsoleEnvironment & { DB: CommerceD1Database },
  identity: CloudflareAccessOwnerIdentity,
  now: string,
): Promise<Response> {
  if (!sameOriginMutation(request, env.COMMERCE_ORIGIN!) || !(await emptyBody(request))) {
    return fail("INVALID_REQUEST", 400);
  }
  return persistAdminSession(env, {
    ...identity,
    attestation: ACCESS_SESSION_ATTESTATION,
  }, now);
}

async function createNativeSession(
  request: Request,
  env: ProductionOperatorConsoleEnvironment & { DB: CommerceD1Database },
  now: string,
): Promise<Response> {
  if (!sameOriginMutation(request, env.COMMERCE_ORIGIN!)) {
    return fail("INVALID_ADMIN_CREDENTIALS", 401);
  }
  const parsed = await jsonBody(request);
  if (!parsed || !exact(parsed, ["email", "password"]) ||
    typeof parsed.email !== "string" || typeof parsed.password !== "string" ||
    parsed.email.length > 320 || parsed.password.length < 12 || parsed.password.length > 128) {
    return fail("INVALID_ADMIN_CREDENTIALS", 401);
  }
  const store = new D1CustomerPasswordAccountStore(env.DB);
  let customerSession: Awaited<ReturnType<typeof store.login>> = null;
  try {
    customerSession = await store.login({
      email: parsed.email,
      password: parsed.password,
      now,
    });
    if (!customerSession) return fail("INVALID_ADMIN_CREDENTIALS", 401);
    const account = await store.currentAccount(customerSession.token, now);
    if (!account || !adminEmailAllowed(account.email, env)) {
      return fail("INVALID_ADMIN_CREDENTIALS", 401);
    }
    return await persistAdminSession(env, {
      issuer: `${env.COMMERCE_ORIGIN}/native-admin`,
      subject: account.customerId,
      email: account.email,
      authenticatedAt: now,
      assertion: customerSession.token,
      attestation: NATIVE_SESSION_ATTESTATION,
    }, now);
  } catch {
    return fail("INVALID_ADMIN_CREDENTIALS", 401);
  } finally {
    if (customerSession) {
      await store.logout(customerSession.token, now).catch(() => undefined);
    }
  }
}

async function adminActor(
  request: Request,
  database: CommerceD1Database,
  now: string,
): Promise<Readonly<{ administratorId: string; sessionId: string }> | null> {
  const sessionToken = cookie(request, "__Host-aj_admin");
  const csrfToken = cookie(request, "__Host-aj_admin_csrf");
  if (!sessionToken || !csrfToken) return null;
  const actor = await resolveD1MutationActor(database, {
    kind: "admin",
    sessionToken,
    csrfToken,
  }, now);
  return actor?.kind === "admin" && actor.role === "owner"
    ? { administratorId: actor.administratorId, sessionId: actor.sessionId }
    : null;
}

async function listOrders(
  request: Request,
  database: CommerceD1Database,
  now: string,
): Promise<Response> {
  if (!(await adminActor(request, database, now))) return fail("OWNER_SESSION_REQUIRED", 403);
  if (request.headers.get("Origin") !== null &&
    request.headers.get("Origin") !== new URL(request.url).origin) {
    return fail("ORIGIN_REJECTED", 403);
  }
  try {
    const rows = await database.prepare(
      `SELECT customer_order.id, customer_order.order_number, customer_order.status,
        customer_order.currency, customer_order.total_cents, customer_order.paid_at,
        customer_order.created_at, shipment.id AS shipment_id,
        shipment.status AS shipment_status, shipment.attempts AS shipment_attempts,
        shipment.max_attempts AS shipment_max_attempts,
        shipment.last_error_code AS shipment_last_error_code,
        shipment.provider_shipment_reference AS shipment_provider_reference,
        shipment.tracking_provider_code AS shipment_tracking_provider_code,
        shipment.tracking_reference AS shipment_tracking_reference,
        shipment.provider_receipt_fingerprint AS shipment_receipt_fingerprint,
        configuration.zone AS shipment_zone,
        customs.status AS shipment_customs_status,
        (SELECT message.status FROM operator_label_email_outbox AS message
          WHERE message.shipment_id=shipment.id LIMIT 1
        ) AS shipment_label_email_status,
        json_type(customer_order.shipping_address_json, '$.phone') AS shipping_phone_type,
        retry_authorization.id AS retry_authorization_id,
        retry_authorization.consumed_at AS retry_authorization_consumed_at,
        (SELECT CASE WHEN message.status='sent' OR EXISTS (
          SELECT 1 FROM email_delivery_provider_evidence AS evidence
          WHERE evidence.outbox_id=message.id
        ) THEN CASE WHEN message.status='sent' THEN 'sent' ELSE 'confirmed' END
        ELSE message.status END FROM email_outbox AS message
          WHERE message.order_id=customer_order.id AND message.kind='order_confirmation'
          ORDER BY message.created_at DESC LIMIT 1) AS order_email_status,
        (SELECT CASE WHEN message.status='sent' OR EXISTS (
          SELECT 1 FROM email_delivery_provider_evidence AS evidence
          WHERE evidence.outbox_id=message.id
        ) THEN CASE WHEN message.status='sent' THEN 'sent' ELSE 'confirmed' END
        ELSE message.status END FROM email_outbox AS message
          WHERE message.order_id=customer_order.id AND message.kind='payment_confirmation'
          ORDER BY message.created_at DESC LIMIT 1) AS payment_email_status
      FROM orders AS customer_order
      LEFT JOIN shipments AS shipment ON shipment.order_id=customer_order.id
      LEFT JOIN shipping_quotes AS quote ON quote.id=shipment.shipping_quote_id
      LEFT JOIN shipping_zone_configurations AS configuration
        ON configuration.id=quote.configuration_id
      LEFT JOIN customs_records AS customs ON customs.shipment_id=shipment.id
      LEFT JOIN shipment_retry_authorizations AS retry_authorization
        ON retry_authorization.shipment_id=shipment.id
      WHERE customer_order.status IN ('paid','preparing','shipped','refunded')
      ORDER BY COALESCE(customer_order.paid_at, customer_order.created_at) DESC,
        customer_order.id DESC LIMIT 50`,
    ).all<OrderRow>();
    return json({
      data: rows.results.map((row) => ({
        orderId: row.id,
        orderNumber: row.order_number,
        status: row.status,
        currency: row.currency,
        totalCents: row.total_cents,
        paidAt: row.paid_at,
        createdAt: row.created_at,
        shipment: row.shipment_id ? {
          id: row.shipment_id,
          status: row.shipment_status,
          labelEmailStatus: row.shipment_label_email_status,
          zone: row.shipment_zone,
          customsStatus: row.shipment_customs_status,
          retryAllowed: row.shipment_status === "failed" &&
            row.shipment_last_error_code === "provider_rejected" &&
            (row.shipment_attempts ?? 0) >= 1 &&
            (row.shipment_attempts ?? 0) < (row.shipment_max_attempts ?? 0) &&
            row.shipment_provider_reference === null &&
            row.shipment_tracking_provider_code === null &&
            row.shipment_tracking_reference === null &&
            row.shipment_receipt_fingerprint === null &&
            row.shipping_phone_type === null &&
            row.retry_authorization_id === null &&
            row.retry_authorization_consumed_at === null,
        } : null,
        emails: {
          orderConfirmation: row.order_email_status,
          paymentConfirmation: row.payment_email_status,
        },
      })),
    });
  } catch {
    return fail("ORDERS_UNAVAILABLE", 503);
  }
}

async function listInventory(
  request: Request,
  database: CommerceD1Database,
  now: string,
): Promise<Response> {
  if (!(await adminActor(request, database, now))) return fail("OWNER_SESSION_REQUIRED", 403);
  if (request.headers.get("Origin") !== null &&
    request.headers.get("Origin") !== new URL(request.url).origin) {
    return fail("ORIGIN_REJECTED", 403);
  }
  try {
    const result = await database.prepare(
      `SELECT variant.internal_reference, product.name AS product_name,
        variant.color_name, variant.size, inventory.physical_quantity,
        inventory.gift_reserve_quantity, inventory.safety_reserve_quantity,
        inventory.active_reserved_quantity, inventory.sold_quantity,
        inventory.physical_quantity - inventory.gift_reserve_quantity -
          inventory.safety_reserve_quantity - inventory.active_reserved_quantity -
          inventory.sold_quantity AS available_quantity,
        inventory.updated_at
      FROM inventory
      INNER JOIN variants AS variant ON variant.id=inventory.variant_id
      INNER JOIN products AS product ON product.id=variant.product_id
      WHERE variant.active=1 AND product.status='active'
      ORDER BY variant.sort_order, variant.color_name, variant.size, variant.internal_reference`,
    ).all<InventoryRow>();
    const items = result.results.map((row) => ({
      internalReference: row.internal_reference,
      productName: row.product_name,
      colorName: row.color_name,
      size: row.size,
      physicalQuantity: row.physical_quantity,
      giftReserveQuantity: row.gift_reserve_quantity,
      safetyReserveQuantity: row.safety_reserve_quantity,
      activeReservedQuantity: row.active_reserved_quantity,
      soldQuantity: row.sold_quantity,
      availableQuantity: row.available_quantity,
      updatedAt: row.updated_at,
    }));
    const totals = items.reduce((summary, item) => ({
      physicalQuantity: summary.physicalQuantity + item.physicalQuantity,
      giftReserveQuantity: summary.giftReserveQuantity + item.giftReserveQuantity,
      safetyReserveQuantity: summary.safetyReserveQuantity + item.safetyReserveQuantity,
      activeReservedQuantity: summary.activeReservedQuantity + item.activeReservedQuantity,
      soldQuantity: summary.soldQuantity + item.soldQuantity,
      availableQuantity: summary.availableQuantity + item.availableQuantity,
    }), {
      physicalQuantity: 0,
      giftReserveQuantity: 0,
      safetyReserveQuantity: 0,
      activeReservedQuantity: 0,
      soldQuantity: 0,
      availableQuantity: 0,
    });
    return json({ data: { totals, items } });
  } catch {
    return fail("INVENTORY_UNAVAILABLE", 503);
  }
}

async function orderDetail(
  request: Request,
  database: CommerceD1Database,
  now: string,
  orderId: string,
): Promise<Response> {
  if (!(await adminActor(request, database, now))) return fail("OWNER_SESSION_REQUIRED", 403);
  if (request.headers.get("Origin") !== null &&
    request.headers.get("Origin") !== new URL(request.url).origin) {
    return fail("ORIGIN_REJECTED", 403);
  }
  try {
    const [order, lines] = await Promise.all([
      database.prepare(
        `SELECT customer_order.id, customer_order.order_number, customer_order.status,
          customer_order.currency, customer_order.subtotal_cents,
          customer_order.shipping_cents, customer_order.total_cents,
          customer_order.shipping_address_json, customer_order.paid_at,
          customer_order.created_at, shipment.id AS shipment_id,
          shipment.status AS shipment_status,
          shipment.tracking_provider_code, shipment.tracking_reference,
          configuration.zone AS shipment_zone,
          customs.status AS shipment_customs_status
        FROM orders AS customer_order
        LEFT JOIN shipments AS shipment ON shipment.order_id=customer_order.id
        LEFT JOIN shipping_quotes AS quote ON quote.id=shipment.shipping_quote_id
        LEFT JOIN shipping_zone_configurations AS configuration
          ON configuration.id=quote.configuration_id
        LEFT JOIN customs_records AS customs ON customs.shipment_id=shipment.id
        WHERE customer_order.id = ?
          AND customer_order.status IN ('paid','preparing','shipped','refunded')
        LIMIT 1`,
      ).bind(orderId).first<OrderDetailRow>(),
      database.prepare(
        `SELECT internal_reference, product_name, color_name, size, quantity
        FROM order_lines WHERE order_id = ? ORDER BY id`,
      ).bind(orderId).all<OrderLineRow>(),
    ]);
    if (!order) return fail("ORDER_NOT_FOUND", 404);
    const address = operatorShippingAddress(order.shipping_address_json);
    if (!address || lines.results.length < 1) return fail("ORDER_DETAIL_UNAVAILABLE", 503);
    return json({
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        currency: order.currency,
        subtotalCents: order.subtotal_cents,
        shippingCents: order.shipping_cents,
        totalCents: order.total_cents,
        paidAt: order.paid_at,
        createdAt: order.created_at,
        shippingAddress: address,
        items: lines.results.map((line) => ({
          internalReference: line.internal_reference,
          productName: line.product_name,
          colorName: line.color_name,
          size: line.size,
          quantity: line.quantity,
        })),
        shipment: order.shipment_id ? {
          id: order.shipment_id,
          status: order.shipment_status,
          trackingProviderCode: order.tracking_provider_code,
          trackingReference: order.tracking_reference,
          zone: order.shipment_zone,
          customsStatus: order.shipment_customs_status,
        } : null,
      },
    });
  } catch {
    return fail("ORDER_DETAIL_UNAVAILABLE", 503);
  }
}

async function orderInvoice(
  request: Request,
  database: CommerceD1Database,
  now: string,
  orderId: string,
): Promise<Response> {
  if (!(await adminActor(request, database, now))) {
    return fail("OWNER_SESSION_REQUIRED", 403);
  }
  if (request.headers.get("Origin") !== null &&
    request.headers.get("Origin") !== new URL(request.url).origin) {
    return fail("ORIGIN_REJECTED", 403);
  }
  try {
    const invoice = await administratorOrderInvoice(database, orderId);
    const notes = invoice
      ? await invoiceCreditNotes(database, invoice.id)
      : Object.freeze([]);
    return invoice
      ? orderInvoiceHtmlResponse(invoice, notes, "administrator")
      : fail("INVOICE_NOT_FOUND", 404);
  } catch (cause) {
    return fail(
      cause instanceof OrderInvoiceError && cause.code === "CORRUPT_SNAPSHOT"
        ? "INVOICE_CORRUPT"
        : "INVOICE_RUNTIME_NOT_READY",
      503,
    );
  }
}

async function orderCreditNote(
  request: Request,
  database: CommerceD1Database,
  now: string,
  orderId: string,
  creditNoteNumber: string,
): Promise<Response> {
  if (!(await adminActor(request, database, now))) {
    return fail("OWNER_SESSION_REQUIRED", 403);
  }
  if (request.headers.get("Origin") !== null &&
    request.headers.get("Origin") !== new URL(request.url).origin) {
    return fail("ORIGIN_REJECTED", 403);
  }
  try {
    const note = await administratorOrderCreditNote(
      database,
      orderId,
      creditNoteNumber,
    );
    return note
      ? orderCreditNoteHtmlResponse(note, "administrator")
      : fail("CREDIT_NOTE_NOT_FOUND", 404);
  } catch (cause) {
    return fail(
      cause instanceof OrderInvoiceError && cause.code === "CORRUPT_SNAPSHOT"
        ? "CREDIT_NOTE_CORRUPT"
        : "CREDIT_NOTE_RUNTIME_NOT_READY",
      503,
    );
  }
}

function promotionPayload(row: PromotionListRow) {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    percentageBasisPoints: row.percentage_basis_points,
    fixedDiscountCents: row.fixed_discount_cents,
    minimumSubtotalCents: row.minimum_subtotal_cents,
    maximumDiscountCents: row.maximum_discount_cents,
    maximumRedemptions: row.maximum_redemptions,
    active: row.active === 1,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reservedCount: row.reserved_count,
    redeemedCount: row.redeemed_count,
  };
}

async function listPromotions(
  request: Request,
  database: CommerceD1Database,
  now: string,
): Promise<Response> {
  if (!(await adminActor(request, database, now))) return fail("OWNER_SESSION_REQUIRED", 403);
  if (request.headers.get("Origin") !== null &&
    request.headers.get("Origin") !== new URL(request.url).origin) {
    return fail("ORIGIN_REJECTED", 403);
  }
  try {
    const result = await database.prepare(
      `SELECT promotion.id, promotion.code, promotion.kind,
        promotion.percentage_basis_points, promotion.fixed_discount_cents,
        promotion.minimum_subtotal_cents, promotion.maximum_discount_cents,
        promotion.maximum_redemptions, promotion.active, promotion.starts_at,
        promotion.ends_at,
        SUM(CASE WHEN redemption.status='reserved' THEN 1 ELSE 0 END) AS reserved_count,
        SUM(CASE WHEN redemption.status='redeemed' THEN 1 ELSE 0 END) AS redeemed_count
      FROM promotion_codes AS promotion
      LEFT JOIN promotion_redemptions AS redemption
        ON redemption.promotion_code_id=promotion.id
      GROUP BY promotion.id
      ORDER BY promotion.created_at DESC, promotion.id DESC LIMIT 100`,
    ).all<PromotionListRow>();
    return json({ data: result.results.map(promotionPayload) });
  } catch {
    return fail("PROMOTIONS_UNAVAILABLE", 503);
  }
}

function promotionMutationAuthorized(
  request: Request,
  origin: string,
): boolean {
  const csrfToken = cookie(request, "__Host-aj_admin_csrf");
  return Boolean(csrfToken && authorizeBrowserMutation({
    method: request.method,
    origin: request.headers.get("Origin"),
    secFetchSite: request.headers.get("Sec-Fetch-Site"),
    allowedOrigins: [origin],
    csrfCookieToken: csrfToken,
    csrfHeaderToken: request.headers.get("X-CSRF-Token"),
  }));
}

async function createPromotion(
  request: Request,
  env: ProductionOperatorConsoleEnvironment & { DB: CommerceD1Database },
  now: string,
): Promise<Response> {
  const actor = await adminActor(request, env.DB, now);
  if (!actor || !promotionMutationAuthorized(request, env.COMMERCE_ORIGIN!)) {
    return fail("OWNER_SESSION_REQUIRED", 403);
  }
  const parsed = await jsonBody(request);
  const keys = [
    "code", "endsAt", "fixedDiscountCents", "kind", "maximumDiscountCents",
    "maximumRedemptions", "minimumSubtotalCents", "percentageBasisPoints", "startsAt",
  ];
  if (!parsed || !exact(parsed, keys)) return fail("INVALID_PROMOTION", 400);
  let code: string;
  try {
    code = normalizePromotionCode(parsed.code);
  } catch (cause) {
    if (cause instanceof PromotionCodeError) return fail("INVALID_PROMOTION", 400);
    throw cause;
  }
  const integerOrNull = (value: unknown, minimum: number, maximum: number) =>
    value === null || (Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum);
  if (
    (parsed.kind !== "percentage" && parsed.kind !== "fixed") ||
    !integerOrNull(parsed.percentageBasisPoints, 1, 10_000) ||
    !integerOrNull(parsed.fixedDiscountCents, 1, 1_000_000) ||
    !Number.isSafeInteger(parsed.minimumSubtotalCents) || Number(parsed.minimumSubtotalCents) < 0 ||
    Number(parsed.minimumSubtotalCents) > 1_000_000 ||
    !integerOrNull(parsed.maximumDiscountCents, 1, 1_000_000) ||
    !integerOrNull(parsed.maximumRedemptions, 1, 1_000_000) ||
    typeof parsed.startsAt !== "string" || !isCanonicalUtcTimestamp(parsed.startsAt) ||
    !(parsed.endsAt === null || (typeof parsed.endsAt === "string" &&
      isCanonicalUtcTimestamp(parsed.endsAt) && parsed.endsAt > parsed.startsAt)) ||
    (parsed.kind === "percentage" &&
      (parsed.percentageBasisPoints === null || parsed.fixedDiscountCents !== null)) ||
    (parsed.kind === "fixed" &&
      (parsed.fixedDiscountCents === null || parsed.percentageBasisPoints !== null))
  ) return fail("INVALID_PROMOTION", 400);
  const kind = parsed.kind as "percentage" | "fixed";
  const percentageBasisPoints = parsed.percentageBasisPoints === null
    ? null
    : Number(parsed.percentageBasisPoints);
  const fixedDiscountCents = parsed.fixedDiscountCents === null
    ? null
    : Number(parsed.fixedDiscountCents);
  const minimumSubtotalCents = Number(parsed.minimumSubtotalCents);
  const maximumDiscountCents = parsed.maximumDiscountCents === null
    ? null
    : Number(parsed.maximumDiscountCents);
  const maximumRedemptions = parsed.maximumRedemptions === null
    ? null
    : Number(parsed.maximumRedemptions);
  const startsAt = String(parsed.startsAt);
  const endsAt = parsed.endsAt === null ? null : String(parsed.endsAt);
  const id = `promotion_${(await sha256(`ajl-promotion-v1\0${code}`)).slice(0, 48)}`;
  try {
    await env.DB.prepare(
      `INSERT INTO promotion_codes (
        id, code, kind, percentage_basis_points, fixed_discount_cents,
        minimum_subtotal_cents, maximum_discount_cents, maximum_redemptions,
        active, starts_at, ends_at, created_by_administrator_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      code,
      kind,
      percentageBasisPoints,
      fixedDiscountCents,
      minimumSubtotalCents,
      maximumDiscountCents,
      maximumRedemptions,
      startsAt,
      endsAt,
      actor.administratorId,
      now,
      now,
    ).run();
    return json({ data: { id, code, active: true } }, 201);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return /UNIQUE constraint failed/i.test(message)
      ? fail("PROMOTION_ALREADY_EXISTS", 409)
      : fail("PROMOTION_CREATE_FAILED", 503);
  }
}

async function setPromotionStatus(
  request: Request,
  env: ProductionOperatorConsoleEnvironment & { DB: CommerceD1Database },
  now: string,
  promotionId: string,
): Promise<Response> {
  const actor = await adminActor(request, env.DB, now);
  if (!actor || !promotionMutationAuthorized(request, env.COMMERCE_ORIGIN!)) {
    return fail("OWNER_SESSION_REQUIRED", 403);
  }
  const parsed = await jsonBody(request);
  if (!parsed || !exact(parsed, ["active"]) || typeof parsed.active !== "boolean") {
    return fail("INVALID_PROMOTION", 400);
  }
  try {
    const result = await env.DB.prepare(
      `UPDATE promotion_codes SET active=?, updated_at=? WHERE id=? AND active<>?`,
    ).bind(parsed.active ? 1 : 0, now, promotionId, parsed.active ? 1 : 0).run();
    const changed = result.meta?.changes ?? 0;
    if (changed === 0) {
      const exists = await env.DB.prepare(
        `SELECT active FROM promotion_codes WHERE id=?`,
      ).bind(promotionId).first<{ active: number }>();
      if (!exists) return fail("PROMOTION_NOT_FOUND", 404);
    }
    return json({ data: { id: promotionId, active: parsed.active } });
  } catch {
    return fail("PROMOTION_UPDATE_FAILED", 503);
  }
}

async function logout(
  request: Request,
  env: ProductionOperatorConsoleEnvironment & { DB: CommerceD1Database },
  now: string,
): Promise<Response> {
  const sessionToken = cookie(request, "__Host-aj_admin");
  const csrfToken = cookie(request, "__Host-aj_admin_csrf");
  if (!sessionToken || !csrfToken || !authorizeBrowserMutation({
    method: request.method,
    origin: request.headers.get("Origin"),
    secFetchSite: request.headers.get("Sec-Fetch-Site"),
    allowedOrigins: [env.COMMERCE_ORIGIN!],
    csrfCookieToken: csrfToken,
    csrfHeaderToken: request.headers.get("X-CSRF-Token"),
  })) return fail("OWNER_SESSION_REQUIRED", 403);
  const store = new D1IdentityAccessStore(env.DB);
  await store.logout("admin", sessionToken, now).catch(() => false);
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie("admin"));
  headers.append("Set-Cookie", clearCsrfCookie("admin"));
  return json({ data: { signedOut: true } }, 200, headers);
}

export async function productionOperatorConsoleApiResponse(
  request: Request,
  env: ProductionOperatorConsoleEnvironment | undefined,
  dependencies: ProductionOperatorConsoleDependencies = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const orderDetailMatch = ORDER_DETAIL_ROUTE.exec(url.pathname);
  const orderInvoiceMatch = ORDER_INVOICE_ROUTE.exec(url.pathname);
  const orderCreditNoteMatch = ORDER_CREDIT_NOTE_ROUTE.exec(url.pathname);
  const promotionStatusMatch = PROMOTION_STATUS_ROUTE.exec(url.pathname);
  if (![SESSION_ROUTE, ORDERS_ROUTE, INVENTORY_ROUTE, PROMOTIONS_ROUTE].includes(url.pathname) &&
    !orderDetailMatch && !orderInvoiceMatch && !orderCreditNoteMatch &&
    !promotionStatusMatch) return null;
  if (!configured(env, url)) return fail("OPERATOR_CONSOLE_CLOSED", 503);
  const now = dependencies.now?.() ?? new Date().toISOString();
  if (!isCanonicalUtcTimestamp(now)) return fail("CLOCK_UNAVAILABLE", 503);
  if (url.pathname === ORDERS_ROUTE) {
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
    return listOrders(request, env.DB, now);
  }
  if (url.pathname === INVENTORY_ROUTE) {
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
    return listInventory(request, env.DB, now);
  }
  if (url.pathname === PROMOTIONS_ROUTE) {
    if (request.method === "GET") return listPromotions(request, env.DB, now);
    if (request.method === "POST") return createPromotion(request, env, now);
    return fail("METHOD_NOT_ALLOWED", 405);
  }
  if (promotionStatusMatch) {
    if (request.method !== "PUT") return fail("METHOD_NOT_ALLOWED", 405);
    const promotionId = decodedIdentifier(promotionStatusMatch[1]);
    if (!promotionId) return fail("INVALID_PROMOTION", 400);
    return setPromotionStatus(request, env, now, promotionId);
  }
  if (orderInvoiceMatch) {
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
    const orderId = decodedIdentifier(orderInvoiceMatch[1]);
    if (!orderId) return fail("INVALID_ORDER", 400);
    return orderInvoice(request, env.DB, now, orderId);
  }
  if (orderCreditNoteMatch) {
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
    const orderId = decodedIdentifier(orderCreditNoteMatch[1]);
    const creditNoteNumber = decodedIdentifier(orderCreditNoteMatch[2]);
    if (!orderId) return fail("INVALID_ORDER", 400);
    if (!creditNoteNumber) return fail("INVALID_CREDIT_NOTE", 400);
    return orderCreditNote(request, env.DB, now, orderId, creditNoteNumber);
  }
  if (orderDetailMatch) {
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
    const orderId = decodedIdentifier(orderDetailMatch[1]);
    if (!orderId) return fail("INVALID_ORDER", 400);
    return orderDetail(request, env.DB, now, orderId);
  }
  if (request.method === "POST") {
    if (/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) {
      return createNativeSession(request, env, now);
    }
    const identity = await accessIdentity(request, env, dependencies);
    if (!identity) return fail("CLOUDFLARE_ACCESS_REQUIRED", 403);
    return createAccessSession(request, env, identity, now);
  }
  if (request.method === "DELETE") return logout(request, env, now);
  return fail("METHOD_NOT_ALLOWED", 405);
}
