import { isCanonicalUtcTimestamp, isOpaqueAccessToken } from "../lib/commerce/account-security.ts";
import {
  resolveD1MutationActor,
  type D1MutationActor,
} from "../lib/commerce/d1-actor-authorization.ts";
import {
  CommerceReportingError,
  readCommerceOperationsReport,
} from "../lib/commerce/d1-commerce-reporting.ts";
import { CommerceError } from "../lib/commerce/backend-domain.ts";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import { D1FulfillmentStore } from "../lib/commerce/d1-fulfillment-store.ts";
import type { CommerceD1Database } from "../lib/commerce/d1-port.ts";
import { D1LatePaymentRefundDispatcher } from "../lib/commerce/d1-late-payment-refunds.ts";
import {
  D1EmailDeliveryReconciler,
  EmailDeliveryReconciliationError,
} from "../lib/commerce/email-delivery-reconciliation.ts";
import { D1EmailOutbox } from "../lib/commerce/email-outbox.ts";
import { dispatchTransactionalEmailBatch } from "../lib/commerce/email-outbox-dispatcher.ts";
import type { TransactionalEmailProviderPort } from "../lib/commerce/email-outbox.ts";
import type { RefundPaymentProviderPort } from "../lib/commerce/payment-provider.ts";
import { FulfillmentError, sha256Hex } from "../lib/commerce/fulfillment-domain.ts";
import type { ShippingLabelProviderPort } from "../lib/commerce/fulfillment-domain.ts";
import { createSendcloudShippingLabelProvider } from "../lib/commerce/sendcloud-shipping-label-provider.ts";
import {
  authorizeBrowserMutation,
  isTrustedMutationOrigin,
  isValidCsrfPair,
} from "../lib/commerce/identity-access-policy.ts";
import type { ProductionCommerceEnvironment } from "../lib/commerce/production-release-gate.ts";
import { ResendEmailProvider } from "../lib/commerce/resend-email-provider.ts";
import { createStripePaymentProviderPorts } from "../lib/commerce/stripe-payment-provider.ts";
import {
  controlledOwnerRequestAuthenticated,
  productionLatePaymentRefundSchemaInstalled,
} from "./production-commerce-api.ts";
import {
  productionEmailDispatchRuntimeConfigured,
  productionEmailReconciliationRuntimeConfigured,
  productionEmailReconciliationRuntimeInstalled,
  productionOperationsRuntimeInstalled,
  productionResendRuntimeInstalled,
} from "./production-operations-runtime.ts";
import {
  productionScheduledRateLimit,
  type ProductionRateLimitEnvironment,
} from "./production-rate-limit.ts";
import { productionOutboundShippingRuntimeConfigured } from "./production-shipping-runtime.ts";

const RETURN_ROUTE = "/api/commerce/returns";
const APPROVE_ROUTE = /^\/api\/commerce\/admin\/returns\/([^/]+)\/approve$/;
const INSPECT_ROUTE = /^\/api\/commerce\/admin\/returns\/([^/]+)\/inspect$/;
const HANDOVER_ROUTE = /^\/api\/commerce\/admin\/shipments\/([^/]+)\/handover$/;
const EMAIL_RECONCILIATION_ROUTE =
  /^\/api\/commerce\/admin\/email-outbox\/([^/]+)\/reconcile$/;
const REPORT_ROUTE = "/api/commerce/admin/reporting";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const RETURN_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;
const MAX_RETURN_LINES = 3;
const RELEASE_SHA = /^[a-f0-9]{40}$/;

export type ProductionOperationsEnvironment = ProductionCommerceEnvironment &
  ProductionRateLimitEnvironment & Readonly<{
  DB?: CommerceD1Database;
  COMMERCE_CONTROLLED_OWNER_EMAIL?: string;
  COMMERCE_ADMIN_ALLOWED_EMAILS_JSON?: string;
  COMMERCE_CONTROLLED_AUTH_HMAC_SECRET?: string;
  RETURNS_WORKFLOW_ENABLED?: string;
  RESERVATION_EXPIRY_ENABLED?: string;
  COMMERCE_REPORTING_ENABLED?: string;
  OPERATOR_ADMIN_MFA_ENABLED?: string;
  SHIPMENT_HANDOVER_ENABLED?: string;
  TRANSACTIONAL_EMAIL_DISPATCH_ENABLED?: string;
  TRANSACTIONAL_EMAIL_DISPATCH_MODE?: string;
  TRANSACTIONAL_EMAIL_RECONCILIATION_ENABLED?: string;
  TRANSACTIONAL_FROM_NAME?: string;
  TRANSACTIONAL_REPLY_TO?: string;
  LATE_PAYMENT_REFUND_DISPATCH_ENABLED?: string;
  STRIPE_SETTLEMENT_MODE?: string;
  OUTBOUND_SHIPMENT_CREATION_ENABLED?: string;
  AUTOMATIC_OUTBOUND_SHIPMENT_ENABLED?: string;
  SENDCLOUD_SENDER_ADDRESS_ID?: string;
  SENDCLOUD_SENDER_ADDRESS_ATTESTATION?: string;
  DELIVERY_REFERENCE_ENCRYPTION_KEY_BASE64?: string;
  DELIVERY_REFERENCE_KEY_VERSION?: string;
  DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON?: string;
}>;

type ReturnRequestResult = Readonly<{
  id: string;
  order_id: string;
  kind: "return" | "withdrawal";
  status: string;
}>;

type ReturnOperationsPort = Readonly<{
  createReturnRequest(input: Readonly<{
    id: string;
    orderId: string;
    kind: "return" | "withdrawal";
    lines: readonly Readonly<{ orderLineId: string; quantity: number }>[];
    actor: D1MutationActor;
    locale: "fr" | "en";
    now: string;
  }>): Promise<ReturnRequestResult>;
  approveReturnRequest(input: Readonly<{
    requestId: string;
    actor: D1MutationActor;
    now: string;
  }>): Promise<ReturnRequestResult>;
  completeReturnInspection(input: Readonly<{
    requestId: string;
    lines: readonly Readonly<{
      returnLineId: string;
      receivedQuantity: number;
      sellableQuantity: number;
      nonSellableQuantity: number;
      restockedQuantity: number;
    }>[];
    actor: D1MutationActor;
    now: string;
  }>): Promise<void>;
}>;

type ShipmentOperationsPort = Readonly<{
  handoverShipment(input: Readonly<{
    shipmentId: string;
    eventId: string;
    actor: D1MutationActor;
    locale: "fr" | "en";
    now: string;
  }>): Promise<{ created: boolean }>;
}>;

type EmailReconciliationOperationsPort = Readonly<{
  reconcile(input: Readonly<{
    outboxId: string;
    providerMessageId: string;
    actor: D1MutationActor;
    now: string;
  }>): Promise<Readonly<{
    outboxId: string;
    kind: "order_confirmation" | "payment_confirmation";
    providerMessageId: string;
    providerLastEvent: "delivered" | "opened" | "clicked";
    created: boolean;
  }>>;
}>;

export type ProductionOperationsDependencies = Readonly<{
  returns?: ReturnOperationsPort;
  shipments?: ShipmentOperationsPort;
  emailReconciliation?: EmailReconciliationOperationsPort;
  authorizeOwner?: (
    actor: D1MutationActor,
    database: CommerceD1Database,
    now: string,
  ) => Promise<boolean>;
  readReport?: typeof readCommerceOperationsReport;
  now?: () => string;
}>;

export type ProductionEmailDispatchDependencies = Readonly<{
  provider?: TransactionalEmailProviderPort;
  verifiedPaidOrderOutbox?: Pick<
    D1EmailOutbox,
    "claimNextForVerifiedPaidOrder" | "deliverClaim"
  >;
}>;

export type ProductionScheduledOperationsDependencies =
  ProductionEmailDispatchDependencies & Readonly<{
    refundProvider?: RefundPaymentProviderPort;
    shippingLabelProvider?: ShippingLabelProviderPort;
    fulfillment?: Pick<D1FulfillmentStore, "createShipmentLabel">;
  }>;

type ExpiredReservationCandidate = Readonly<{ id: string }>;
type PaidShipmentCandidate = Readonly<{ id: string }>;

type ReturnEligibilityRow = Readonly<{
  status: string;
  paid_at: string | null;
  payment_succeeded: number;
  shipment_status: string | null;
  delivered_at: string | null;
  existing_order_id: string | null;
}>;

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function fail(code: string, status: number): Response {
  return json({ error: { code, requestId: `req_${crypto.randomUUID()}` } }, status);
}

function exactProductionOperationsConfiguration(
  env: ProductionOperationsEnvironment,
): Readonly<{ mode: string; origin: string }> | null {
  if (
    env.APP_ENV !== "production" ||
    !["closed", "sandbox", "controlled", "live"].includes(env.COMMERCE_MODE ?? "") ||
    !RELEASE_SHA.test(env.COMMERCE_RELEASE_SHA ?? "") ||
    env.COMMERCE_ADAM_APPROVAL_SHA !== env.COMMERCE_RELEASE_SHA ||
    env.COMMERCE_JEREMY_APPROVAL_SHA !== env.COMMERCE_RELEASE_SHA
  ) return null;
  try {
    const origin = new URL(env.COMMERCE_ORIGIN ?? "");
    if (
      origin.protocol !== "https:" || origin.origin !== env.COMMERCE_ORIGIN ||
      origin.username !== "" || origin.password !== ""
    ) return null;
    return Object.freeze({ mode: env.COMMERCE_MODE!, origin: origin.origin });
  } catch {
    return null;
  }
}

function exactObject(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function cookie(request: Request, name: string): string[] {
  const raw = request.headers.get("Cookie");
  if (!raw) return [];
  return raw.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    return separator >= 0 && part.slice(0, separator).trim() === name
      ? [part.slice(separator + 1).trim()]
      : [];
  });
}

async function boundedJsonBody(
  request: Request,
  maximum = 16 * 1_024,
): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) {
    return null;
  }
  const encoding = request.headers.get("Content-Encoding");
  const declared = request.headers.get("Content-Length");
  if (
    (encoding && encoding.toLowerCase() !== "identity") ||
    (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum))
  ) {
    await request.body?.cancel();
    return null;
  }
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(decoded);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function emptyBody(request: Request): Promise<boolean> {
  const encoding = request.headers.get("Content-Encoding");
  const declared = request.headers.get("Content-Length");
  if (
    (encoding && encoding.toLowerCase() !== "identity") ||
    (declared && (!/^\d+$/.test(declared) || Number(declared) > 0))
  ) {
    await request.body?.cancel();
    return false;
  }
  if (!request.body) return true;
  const reader = request.body.getReader();
  try {
    const first = await reader.read();
    if (!first.done && first.value.byteLength > 0) await reader.cancel();
    return first.done;
  } finally {
    reader.releaseLock();
  }
}

function decodeIdentifier(encoded: string): string | null {
  try {
    const decoded = decodeURIComponent(encoded);
    return SAFE_ID.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function idempotencyKey(request: Request): string | null {
  const value = request.headers.get("Idempotency-Key");
  return value && IDEMPOTENCY.test(value) ? value : null;
}

function sessionActor(
  request: Request,
  origin: string,
  kind: "customer" | "guest-order" | "admin",
): D1MutationActor | null {
  const suffix = kind === "guest-order" ? "guest_order" : kind;
  const sessions = cookie(request, `__Host-aj_${suffix}`);
  const csrf = cookie(request, `__Host-aj_${suffix}_csrf`);
  if (
    sessions.length !== 1 || csrf.length !== 1 ||
    !isOpaqueAccessToken(sessions[0]) || !isOpaqueAccessToken(csrf[0])
  ) return null;
  if (!authorizeBrowserMutation({
    method: request.method,
    origin: request.headers.get("Origin"),
    secFetchSite: request.headers.get("Sec-Fetch-Site"),
    allowedOrigins: [origin],
    csrfCookieToken: csrf[0],
    csrfHeaderToken: request.headers.get("X-CSRF-Token"),
  })) return null;
  return Object.freeze({ kind, sessionToken: sessions[0], csrfToken: csrf[0] });
}

function customerActor(request: Request, origin: string): D1MutationActor | null {
  const customer = sessionActor(request, origin, "customer");
  const guest = sessionActor(request, origin, "guest-order");
  return customer && guest ? null : customer ?? guest;
}

function adminActorWithCsrf(request: Request, origin: string): D1MutationActor | null {
  const sessions = cookie(request, "__Host-aj_admin");
  const csrf = cookie(request, "__Host-aj_admin_csrf");
  if (
    sessions.length !== 1 || csrf.length !== 1 ||
    !isOpaqueAccessToken(sessions[0]) || !isOpaqueAccessToken(csrf[0]) ||
    request.headers.get("Sec-Fetch-Site") !== "same-origin" ||
    !isTrustedMutationOrigin(request.headers.get("Origin"), [origin]) ||
    !isValidCsrfPair(csrf[0], request.headers.get("X-CSRF-Token"))
  ) return null;
  return Object.freeze({
    kind: "admin",
    sessionToken: sessions[0],
    csrfToken: csrf[0],
  });
}

async function defaultAuthorizeOwner(
  actor: D1MutationActor,
  database: CommerceD1Database,
  now: string,
): Promise<boolean> {
  const resolved = await resolveD1MutationActor(database, actor, now);
  return resolved?.kind === "admin" && resolved.role === "owner";
}

function parseReturnLines(value: unknown): readonly Readonly<{
  orderLineId: string;
  quantity: number;
}>[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RETURN_LINES) {
    return null;
  }
  let total = 0;
  const seen = new Set<string>();
  const lines: { orderLineId: string; quantity: number }[] = [];
  for (const candidate of value) {
    if (
      !candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
      !exactObject(candidate as Record<string, unknown>, ["orderLineId", "quantity"])
    ) return null;
    const line = candidate as Record<string, unknown>;
    if (
      typeof line.orderLineId !== "string" || !SAFE_ID.test(line.orderLineId) ||
      seen.has(line.orderLineId) || !Number.isSafeInteger(line.quantity) ||
      Number(line.quantity) < 1 || Number(line.quantity) > 3
    ) return null;
    total += Number(line.quantity);
    if (total > 3) return null;
    seen.add(line.orderLineId);
    lines.push({ orderLineId: line.orderLineId, quantity: Number(line.quantity) });
  }
  return Object.freeze(lines.map((line) => Object.freeze(line)));
}

function parseInspectionLines(value: unknown): readonly Readonly<{
  returnLineId: string;
  receivedQuantity: number;
  sellableQuantity: number;
  nonSellableQuantity: number;
  restockedQuantity: number;
}>[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RETURN_LINES) {
    return null;
  }
  const keys = [
    "nonSellableQuantity",
    "receivedQuantity",
    "restockedQuantity",
    "returnLineId",
    "sellableQuantity",
  ];
  const seen = new Set<string>();
  const lines: {
    returnLineId: string;
    receivedQuantity: number;
    sellableQuantity: number;
    nonSellableQuantity: number;
    restockedQuantity: number;
  }[] = [];
  for (const candidate of value) {
    if (
      !candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
      !exactObject(candidate as Record<string, unknown>, keys)
    ) return null;
    const line = candidate as Record<string, unknown>;
    if (
      typeof line.returnLineId !== "string" || !SAFE_ID.test(line.returnLineId) ||
      seen.has(line.returnLineId)
    ) return null;
    const quantities = [
      line.receivedQuantity,
      line.sellableQuantity,
      line.nonSellableQuantity,
      line.restockedQuantity,
    ];
    if (quantities.some((quantity) => !Number.isSafeInteger(quantity) || Number(quantity) < 0 || Number(quantity) > 3)) {
      return null;
    }
    const receivedQuantity = Number(line.receivedQuantity);
    const sellableQuantity = Number(line.sellableQuantity);
    const nonSellableQuantity = Number(line.nonSellableQuantity);
    const restockedQuantity = Number(line.restockedQuantity);
    if (
      sellableQuantity + nonSellableQuantity !== receivedQuantity ||
      restockedQuantity > sellableQuantity
    ) return null;
    seen.add(line.returnLineId);
    lines.push({
      returnLineId: line.returnLineId,
      receivedQuantity,
      sellableQuantity,
      nonSellableQuantity,
      restockedQuantity,
    });
  }
  return Object.freeze(lines.map((line) => Object.freeze(line)));
}

async function returnEligibility(
  database: CommerceD1Database,
  input: Readonly<{
    requestId: string;
    orderId: string;
    kind: "return" | "withdrawal";
    now: string;
  }>,
): Promise<"eligible" | "window-closed" | "unavailable" | "conflict"> {
  const row = await database.prepare(
    `SELECT customer_order.status, customer_order.paid_at,
      EXISTS(SELECT 1 FROM payments WHERE order_id = customer_order.id
        AND status = 'succeeded') AS payment_succeeded,
      (SELECT status FROM shipments WHERE order_id = customer_order.id LIMIT 1)
        AS shipment_status,
      (SELECT delivered_at FROM shipments WHERE order_id = customer_order.id LIMIT 1)
        AS delivered_at,
      (SELECT order_id FROM return_requests WHERE id = ? LIMIT 1)
        AS existing_order_id
    FROM orders AS customer_order WHERE customer_order.id = ?`,
  ).bind(input.requestId, input.orderId).first<ReturnEligibilityRow>();
  if (!row) return "unavailable";
  if (row.existing_order_id !== null) {
    return row.existing_order_id === input.orderId ? "eligible" : "conflict";
  }
  if (
    !["paid", "preparing", "shipped"].includes(row.status) ||
    row.payment_succeeded !== 1 || !isCanonicalUtcTimestamp(row.paid_at) ||
    row.paid_at > input.now
  ) return "unavailable";
  if (row.delivered_at !== null) {
    if (
      !isCanonicalUtcTimestamp(row.delivered_at) || row.delivered_at > input.now ||
      Date.parse(input.now) - Date.parse(row.delivered_at) > RETURN_WINDOW_MS
    ) return "window-closed";
  }
  if (input.kind === "return" && (
    row.shipment_status !== "delivered" || row.delivered_at === null
  )) return "unavailable";
  return "eligible";
}

function mapFulfillmentError(cause: unknown): Response {
  if (!(cause instanceof FulfillmentError)) return fail("OPERATIONS_UNAVAILABLE", 503);
  if (cause.code === "SESSION_REQUIRED") return fail("SESSION_REQUIRED", 403);
  if (cause.code === "RETURN_WINDOW_CLOSED") return fail("RETURN_WINDOW_CLOSED", 409);
  if ([
    "RETURN_QUANTITY_EXCEEDED", "INVALID_TRANSITION", "INSPECTION_INCOMPLETE",
    "TRACKING_EVENT_CONFLICT", "CUSTOMS_NOT_READY",
  ].includes(cause.code)) {
    return fail(cause.code, 409);
  }
  if (cause.code === "INVALID_INPUT") return fail("INVALID_INPUT", 400);
  return fail("OPERATIONS_UNAVAILABLE", 503);
}

function mapEmailReconciliationError(cause: unknown): Response {
  if (!(cause instanceof EmailDeliveryReconciliationError)) {
    return fail("EMAIL_RECONCILIATION_UNAVAILABLE", 503);
  }
  if (cause.code === "INVALID_INPUT") return fail("INVALID_INPUT", 400);
  if (cause.code === "OWNER_REQUIRED") return fail("OWNER_ACCESS_REQUIRED", 403);
  if (cause.code === "OUTBOX_NOT_ELIGIBLE") {
    return fail("EMAIL_RECONCILIATION_NOT_ELIGIBLE", 409);
  }
  if (cause.code === "PROVIDER_EVIDENCE_INCONCLUSIVE") {
    return fail("EMAIL_PROVIDER_EVIDENCE_INCONCLUSIVE", 409);
  }
  if (cause.code === "RECONCILIATION_CONFLICT") {
    return fail("EMAIL_RECONCILIATION_CONFLICT", 409);
  }
  return fail("EMAIL_RECONCILIATION_UNAVAILABLE", 503);
}

async function authorizedOperatorActor(
  actor: D1MutationActor,
  env: ProductionOperationsEnvironment,
  now: string,
  authorizeOwner: NonNullable<ProductionOperationsDependencies["authorizeOwner"]>,
): Promise<D1MutationActor | null> {
  if (!env.DB) return null;
  return await authorizeOwner(actor, env.DB, now) ? actor : null;
}

/**
 * Return, shipment-handover and reporting routes. Handover records a physical
 * carrier transfer only after a label already supplied the tracking reference;
 * it never creates a provider label or synthesizes a carrier receipt.
 */
export async function productionOperationsApiResponse(
  request: Request,
  env: ProductionOperationsEnvironment | undefined,
  dependencies: ProductionOperationsDependencies = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const approveMatch = APPROVE_ROUTE.exec(url.pathname);
  const inspectMatch = INSPECT_ROUTE.exec(url.pathname);
  const handoverMatch = HANDOVER_ROUTE.exec(url.pathname);
  const emailReconciliationMatch = EMAIL_RECONCILIATION_ROUTE.exec(url.pathname);
  const recognized = url.pathname === RETURN_ROUTE || url.pathname === REPORT_ROUTE ||
    Boolean(approveMatch) || Boolean(inspectMatch) || Boolean(handoverMatch) ||
    Boolean(emailReconciliationMatch);
  if (!recognized) return null;
  if (env?.APP_ENV !== "production") return fail("NOT_FOUND", 404);
  const configuration = exactProductionOperationsConfiguration(env);
  if (!configuration || url.origin !== configuration.origin) {
    return fail("OPERATIONS_CLOSED", 503);
  }
  const isCustomerReturn = url.pathname === RETURN_ROUTE;
  const isReporting = url.pathname === REPORT_ROUTE;
  if (
    (isCustomerReturn && request.method !== "POST") ||
    (isReporting && request.method !== "GET") ||
    (!isCustomerReturn && !isReporting && request.method !== "POST")
  ) return fail("METHOD_NOT_ALLOWED", 405);
  if (isReporting && env.COMMERCE_REPORTING_ENABLED !== "true") {
    return fail("OPERATIONS_NOT_ACTIVATED", 503);
  }
  if (handoverMatch && env.SHIPMENT_HANDOVER_ENABLED !== "true") {
    return fail("SHIPMENT_HANDOVER_NOT_ACTIVATED", 503);
  }
  if (
    emailReconciliationMatch &&
    env.TRANSACTIONAL_EMAIL_RECONCILIATION_ENABLED !== "true"
  ) {
    return fail("EMAIL_RECONCILIATION_NOT_ACTIVATED", 503);
  }
  if (
    !isReporting && !handoverMatch && !emailReconciliationMatch &&
    env.RETURNS_WORKFLOW_ENABLED !== "true"
  ) {
    return fail("OPERATIONS_NOT_ACTIVATED", 503);
  }
  if (
    !isCustomerReturn && !await controlledOwnerRequestAuthenticated(request, env)
  ) return fail("OWNER_ACCESS_REQUIRED", 403);
  if (
    isCustomerReturn && ["sandbox", "controlled"].includes(configuration.mode) &&
    !await controlledOwnerRequestAuthenticated(request, env)
  ) return fail("CONTROLLED_ACCESS_REQUIRED", 403);
  if (
    !isCustomerReturn &&
    (request.headers.get("Sec-Fetch-Site") !== "same-origin" || url.origin !== configuration.origin)
  ) return fail("OWNER_ACCESS_REQUIRED", 403);
  let actor = isCustomerReturn
    ? customerActor(request, configuration.origin)
    : isReporting
      ? adminActorWithCsrf(request, configuration.origin)
      : sessionActor(request, configuration.origin, "admin");
  if (!actor) {
    return fail(isCustomerReturn ? "SESSION_REQUIRED" : "OWNER_ACCESS_REQUIRED", 403);
  }
  if (!env.DB) return fail("DATABASE_UNAVAILABLE", 503);
  if (!await productionOperationsRuntimeInstalled(env.DB)) {
    return fail("OPERATIONS_SCHEMA_NOT_READY", 503);
  }
  if (
    emailReconciliationMatch &&
    (!productionEmailReconciliationRuntimeConfigured(env) ||
      !await productionEmailReconciliationRuntimeInstalled(env.DB))
  ) {
    return fail("EMAIL_RECONCILIATION_SCHEMA_NOT_READY", 503);
  }
  const now = dependencies.now?.() ?? new Date().toISOString();
  if (!isCanonicalUtcTimestamp(now)) return fail("CLOCK_UNAVAILABLE", 503);
  const returns = dependencies.returns ?? new D1FulfillmentStore(env.DB);

  if (isCustomerReturn) {
    const idem = idempotencyKey(request);
    const parsed = await boundedJsonBody(request);
    if (!idem) return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
    if (!parsed || !exactObject(parsed, ["kind", "lines", "locale", "orderId"])) {
      return fail("INVALID_BODY", 400);
    }
    const kind = parsed.kind;
    const locale = parsed.locale;
    const orderId = parsed.orderId;
    const lines = parseReturnLines(parsed.lines);
    if (
      (kind !== "return" && kind !== "withdrawal") ||
      (locale !== "fr" && locale !== "en") ||
      typeof orderId !== "string" || !SAFE_ID.test(orderId) || !lines
    ) return fail("INVALID_BODY", 400);
    const requestId = `return_${await sha256Hex(`${orderId}\0${idem}`)}`;
    let eligibility: Awaited<ReturnType<typeof returnEligibility>>;
    try {
      eligibility = await returnEligibility(env.DB, { requestId, orderId, kind, now });
    } catch {
      return fail("RETURN_ELIGIBILITY_UNAVAILABLE", 503);
    }
    if (eligibility === "window-closed") return fail("RETURN_WINDOW_CLOSED", 409);
    if (eligibility === "conflict") return fail("IDEMPOTENCY_CONFLICT", 409);
    if (eligibility !== "eligible") return fail("RETURN_NOT_ELIGIBLE", 409);
    try {
      const created = await returns.createReturnRequest({
        id: requestId,
        orderId,
        kind,
        lines,
        actor,
        locale,
        now,
      });
      return json({
        data: {
          requestId: created.id,
          orderId: created.order_id,
          kind: created.kind,
          status: created.status,
          refundCreated: false,
          returnLabelCreated: false,
        },
      }, 201);
    } catch (cause) {
      return mapFulfillmentError(cause);
    }
  }

  const authorizeOwner = dependencies.authorizeOwner ?? defaultAuthorizeOwner;
  actor = await authorizedOperatorActor(
    actor,
    env,
    now,
    authorizeOwner,
  );
  if (!actor) return fail("OWNER_ACCESS_REQUIRED", 403);

  if (isReporting) {
    if (!await emptyBody(request)) return fail("INVALID_REQUEST", 400);
    const keys = [...url.searchParams.keys()];
    const starts = url.searchParams.getAll("start");
    const ends = url.searchParams.getAll("endExclusive");
    if (
      keys.length !== 2 || new Set(keys).size !== 2 ||
      starts.length !== 1 || ends.length !== 1
    ) return fail("INVALID_PERIOD", 400);
    try {
      const report = await (dependencies.readReport ?? readCommerceOperationsReport)(
        env.DB,
        { start: starts[0], endExclusive: ends[0], generatedAt: now },
      );
      return json({ data: report });
    } catch (cause) {
      if (cause instanceof CommerceReportingError && cause.code === "INVALID_PERIOD") {
        return fail("INVALID_PERIOD", 400);
      }
      return fail("REPORT_UNAVAILABLE", 503);
    }
  }

  if (handoverMatch) {
    const shipmentId = decodeIdentifier(handoverMatch[1]);
    const idem = idempotencyKey(request);
    const parsed = await boundedJsonBody(request);
    if (!shipmentId) return fail("INVALID_SHIPMENT", 400);
    if (!parsed || !exactObject(parsed, ["eventId", "locale"])) {
      return fail("INVALID_BODY", 400);
    }
    const eventId = parsed.eventId;
    const locale = parsed.locale;
    if (
      typeof eventId !== "string" || !SAFE_ID.test(eventId) ||
      (locale !== "fr" && locale !== "en")
    ) return fail("INVALID_BODY", 400);
    if (!idem || idem !== `shipment-handover:${eventId}`) {
      return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
    }
    try {
      const shipments = dependencies.shipments ?? new D1FulfillmentStore(env.DB);
      const result = await shipments.handoverShipment({
        shipmentId,
        eventId,
        actor,
        locale,
        now,
      });
      return json({
        data: {
          shipmentId,
          status: "handed_over",
          confirmationQueued: true,
          replayed: !result.created,
        },
      });
    } catch (cause) {
      return mapFulfillmentError(cause);
    }
  }

  if (emailReconciliationMatch) {
    const outboxId = decodeIdentifier(emailReconciliationMatch[1]);
    const parsed = await boundedJsonBody(request);
    if (!outboxId || !parsed || !exactObject(parsed, ["providerMessageId"])) {
      return fail("INVALID_BODY", 400);
    }
    const providerMessageId = parsed.providerMessageId;
    if (typeof providerMessageId !== "string" || !SAFE_ID.test(providerMessageId)) {
      return fail("INVALID_BODY", 400);
    }
    const idem = idempotencyKey(request);
    const expectedIdem = `email-reconcile:${await sha256Hex(
      `${outboxId}\0${providerMessageId}`,
    )}`;
    if (!idem || idem !== expectedIdem) {
      return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
    }
    let reconciliation = dependencies.emailReconciliation;
    if (!reconciliation) {
      const provider = resendEmailProvider(env);
      if (!provider) return fail("EMAIL_RECONCILIATION_UNAVAILABLE", 503);
      reconciliation = new D1EmailDeliveryReconciler(env.DB, provider);
    }
    try {
      const result = await reconciliation.reconcile({
        outboxId,
        providerMessageId,
        actor,
        now,
      });
      return json({
        data: {
          outboxId: result.outboxId,
          kind: result.kind,
          providerMessageId: result.providerMessageId,
          providerLastEvent: result.providerLastEvent,
          evidenceRecorded: true,
          replayed: !result.created,
          emailResent: false,
        },
      });
    } catch (cause) {
      return mapEmailReconciliationError(cause);
    }
  }

  const encodedRequestId = approveMatch?.[1] ?? inspectMatch?.[1];
  const requestId = encodedRequestId ? decodeIdentifier(encodedRequestId) : null;
  if (!requestId) return fail("INVALID_RETURN_REQUEST", 400);
  const idem = idempotencyKey(request);
  const operation = approveMatch ? "approve" : "inspect";
  if (!idem || idem !== `return-${operation}:${requestId}`) {
    return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
  }
  try {
    if (approveMatch) {
      if (!await emptyBody(request)) return fail("INVALID_REQUEST", 400);
      const approved = await returns.approveReturnRequest({ requestId, actor, now });
      return json({
        data: {
          requestId: approved.id,
          status: approved.status,
          refundCreated: false,
          returnLabelCreated: false,
        },
      });
    }
    const parsed = await boundedJsonBody(request);
    const lines = parsed && exactObject(parsed, ["lines"])
      ? parseInspectionLines(parsed.lines)
      : null;
    if (!lines) return fail("INVALID_BODY", 400);
    await returns.completeReturnInspection({ requestId, lines, actor, now });
    return json({
      data: {
        requestId,
        status: "inspected",
        refundCreated: false,
        returnLabelCreated: false,
      },
    });
  } catch (cause) {
    return mapFulfillmentError(cause);
  }
}

function emailProvider(
  env: ProductionOperationsEnvironment,
  dependencies: ProductionEmailDispatchDependencies,
): TransactionalEmailProviderPort | null {
  if (dependencies.provider) return dependencies.provider;
  return resendEmailProvider(env);
}

function resendEmailProvider(
  env: ProductionOperationsEnvironment,
): ResendEmailProvider | null {
  if (
    env.EMAIL_PROVIDER !== "resend" || !env.RESEND_API_KEY ||
    !env.TRANSACTIONAL_FROM_EMAIL || !env.TRANSACTIONAL_FROM_NAME
  ) return null;
  try {
    return new ResendEmailProvider({
      apiKey: env.RESEND_API_KEY,
      fromEmail: env.TRANSACTIONAL_FROM_EMAIL,
      fromName: env.TRANSACTIONAL_FROM_NAME,
      ...(env.TRANSACTIONAL_REPLY_TO ? { replyTo: env.TRANSACTIONAL_REPLY_TO } : {}),
    });
  } catch {
    return null;
  }
}

async function randomLeaseHash(): Promise<string> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", random));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function expireProductionReservations(
  env: ProductionOperationsEnvironment | undefined,
  input: Readonly<{ now: string }>,
): Promise<Readonly<{
  closed: boolean;
  reason: string | null;
  candidates: number;
  expired: number;
  raced: number;
  queueDrained: boolean;
}>> {
  const closed = (reason: string) => Object.freeze({
    closed: true,
    reason,
    candidates: 0,
    expired: 0,
    raced: 0,
    queueDrained: false,
  });
  if (!env || env.APP_ENV !== "production" || !env.DB) {
    return closed("production-reservation-runtime-not-configured");
  }
  // Stock cleanup is a safety invariant, not a sales capability: reservations
  // created before an incident must still expire after commerce is closed.
  // Only accept an explicit production commerce mode so a malformed runtime
  // remains fail-closed without coupling cleanup to external provider gates.
  if (!exactProductionOperationsConfiguration(env)) {
    return closed("production-reservation-configuration-invalid");
  }
  if (env.RESERVATION_EXPIRY_ENABLED !== "true") {
    return closed("production-reservation-expiry-not-activated");
  }
  if (!isCanonicalUtcTimestamp(input.now)) {
    return closed("production-reservation-clock-invalid");
  }
  const rateLimit = await productionScheduledRateLimit(env, "reservation-expiry");
  if (rateLimit !== "allowed") {
    return closed(`production-reservation-rate-limit-${rateLimit}`);
  }
  const candidates = await env.DB.prepare(
    `SELECT id FROM stock_reservations
    WHERE status = 'active' AND expires_at <= ?
    ORDER BY expires_at, id LIMIT 25`,
  ).bind(input.now).all<ExpiredReservationCandidate>();
  const store = new D1CommerceStore(env.DB);
  let expired = 0;
  let raced = 0;
  for (const reservation of candidates.results) {
    if (!SAFE_ID.test(reservation.id)) {
      throw new CommerceError("INVALID_INPUT", "Expired reservation id is invalid.");
    }
    try {
      await store.expireReservation({
        reservationId: reservation.id,
        idempotencyKey: `scheduled-expire:${reservation.id}`,
        now: input.now,
      });
      expired += 1;
    } catch (cause) {
      if (
        cause instanceof CommerceError &&
        ["INVALID_RESERVATION_TRANSITION", "RESERVATION_NOT_EXPIRED"].includes(cause.code)
      ) {
        raced += 1;
        continue;
      }
      throw cause;
    }
  }
  return Object.freeze({
    closed: false,
    reason: null,
    candidates: candidates.results.length,
    expired,
    raced,
    queueDrained: candidates.results.length < 25,
  });
}

export async function dispatchProductionTransactionalEmails(
  env: ProductionOperationsEnvironment | undefined,
  input: Readonly<{ now: string }>,
  dependencies: ProductionEmailDispatchDependencies = {},
): Promise<Readonly<{
  closed: boolean;
  reason: string | null;
  staleLeasesRecovered: number;
  claimed: number;
  sent: number;
  retryScheduled: number;
  failed: number;
  queueDrained: boolean;
}>> {
  if (!env || env.APP_ENV !== "production" || !env.DB) {
    return Object.freeze({
      closed: true,
      reason: "production-email-runtime-not-configured",
      staleLeasesRecovered: 0,
      claimed: 0,
      sent: 0,
      retryScheduled: 0,
      failed: 0,
      queueDrained: false,
    });
  }
  const configuration = exactProductionOperationsConfiguration(env);
  if (!configuration || !productionEmailDispatchRuntimeConfigured(env, true)) {
    return Object.freeze({
      closed: true,
      reason: "transactional-email-dispatch-not-activated",
      staleLeasesRecovered: 0,
      claimed: 0,
      sent: 0,
      retryScheduled: 0,
      failed: 0,
      queueDrained: false,
    });
  }
  if (!await productionResendRuntimeInstalled(env.DB)) {
    return Object.freeze({
      closed: true,
      reason: "transactional-email-schema-0018-not-installed",
      staleLeasesRecovered: 0,
      claimed: 0,
      sent: 0,
      retryScheduled: 0,
      failed: 0,
      queueDrained: false,
    });
  }
  if (!isCanonicalUtcTimestamp(input.now)) {
    return Object.freeze({
      closed: true,
      reason: "transactional-email-clock-invalid",
      staleLeasesRecovered: 0,
      claimed: 0,
      sent: 0,
      retryScheduled: 0,
      failed: 0,
      queueDrained: false,
    });
  }
  const rateLimit = await productionScheduledRateLimit(env, "transactional-email-dispatch");
  if (rateLimit !== "allowed") {
    return Object.freeze({
      closed: true,
      reason: `transactional-email-rate-limit-${rateLimit}`,
      staleLeasesRecovered: 0,
      claimed: 0,
      sent: 0,
      retryScheduled: 0,
      failed: 0,
      queueDrained: false,
    });
  }
  const provider = emailProvider(env, dependencies);
  if (!provider) {
    return Object.freeze({
      closed: true,
      reason: "transactional-email-provider-not-configured",
      staleLeasesRecovered: 0,
      claimed: 0,
      sent: 0,
      retryScheduled: 0,
      failed: 0,
      queueDrained: false,
    });
  }
  const outbox = new D1EmailOutbox(env.DB, provider);
  const stale = await env.DB.prepare(
    `SELECT id FROM email_outbox
    WHERE status = 'sending' AND kind <> 'account_access'
      AND lease_expires_at <= ? ORDER BY lease_expires_at, id LIMIT 10`,
  ).bind(input.now).all<{ id: string }>();
  let staleLeasesRecovered = 0;
  for (const row of stale.results) {
    if (await outbox.recoverStaleLease(row.id, input.now)) staleLeasesRecovered += 1;
  }
  const dispatched = await dispatchTransactionalEmailBatch(
    outbox,
    { next: randomLeaseHash },
    { now: input.now, maxMessages: 10, leaseSeconds: 120 },
  );
  return Object.freeze({ staleLeasesRecovered, ...dispatched });
}

export async function dispatchProductionVerifiedPaidOrderEmails(
  env: ProductionOperationsEnvironment | undefined,
  input: Readonly<{ now: string; orderId: string }>,
  dependencies: ProductionEmailDispatchDependencies = {},
): Promise<Readonly<{
  closed: boolean;
  reason: string | null;
  claimed: number;
  sent: number;
  retryScheduled: number;
  failed: number;
  processingErrors: number;
  queueDrained: boolean;
}>> {
  const closed = (reason: string) => Object.freeze({
    closed: true,
    reason,
    claimed: 0,
    sent: 0,
    retryScheduled: 0,
    failed: 0,
    processingErrors: 0,
    queueDrained: false,
  });
  if (!env || env.APP_ENV !== "production" || !env.DB) {
    return closed("production-email-runtime-not-configured");
  }
  if (!SAFE_ID.test(input.orderId) || !isCanonicalUtcTimestamp(input.now)) {
    return closed("verified-paid-order-email-input-invalid");
  }
  if (!exactProductionOperationsConfiguration(env) ||
    !productionEmailDispatchRuntimeConfigured(env, true)) {
    return closed("transactional-email-dispatch-not-activated");
  }
  if (!await productionResendRuntimeInstalled(env.DB)) {
    return closed("transactional-email-schema-0018-not-installed");
  }
  const provider = emailProvider(env, dependencies);
  if (!provider) return closed("transactional-email-provider-not-configured");

  const outbox = dependencies.verifiedPaidOrderOutbox ?? new D1EmailOutbox(env.DB, provider);
  const counters = {
    claimed: 0,
    sent: 0,
    retryScheduled: 0,
    failed: 0,
    processingErrors: 0,
  };
  let queueDrained = false;
  const leaseExpiresAt = new Date(Date.parse(input.now) + 120_000).toISOString();
  // A successful order creates at most the order and payment confirmations.
  for (let index = 0; index < 2; index += 1) {
    let claim;
    try {
      claim = await outbox.claimNextForVerifiedPaidOrder({
        orderId: input.orderId,
        leaseTokenHash: await randomLeaseHash(),
        now: input.now,
        leaseExpiresAt,
      });
    } catch {
      counters.processingErrors += 1;
      continue;
    }
    if (!claim) {
      queueDrained = true;
      break;
    }
    counters.claimed += 1;
    let outcome: "sent" | "retry" | "failed";
    try {
      outcome = await outbox.deliverClaim(claim, input.now);
    } catch {
      // The durable lease remains recoverable. One malformed or raced message
      // must never prevent the independent confirmation from being attempted.
      counters.processingErrors += 1;
      continue;
    }
    if (outcome === "sent") counters.sent += 1;
    else if (outcome === "retry") counters.retryScheduled += 1;
    else counters.failed += 1;
  }
  return Object.freeze({
    closed: false,
    reason: null,
    ...counters,
    queueDrained,
  });
}

export async function dispatchProductionOutboundShipments(
  env: ProductionOperationsEnvironment | undefined,
  input: Readonly<{ now: string; orderId?: string }>,
  dependencies: Readonly<{
    shippingLabelProvider?: ShippingLabelProviderPort;
    fulfillment?: Pick<D1FulfillmentStore, "createShipmentLabel">;
  }> = {},
): Promise<Readonly<{
  closed: boolean;
  reason: string | null;
  candidates: number;
  created: number;
  alreadyReady: number;
  attentionRequired: number;
}>> {
  const closed = (reason: string) => Object.freeze({
    closed: true,
    reason,
    candidates: 0,
    created: 0,
    alreadyReady: 0,
    attentionRequired: 0,
  });
  if (!env || env.APP_ENV !== "production" || !env.DB) {
    return closed("production-shipping-runtime-not-configured");
  }
  if (!isCanonicalUtcTimestamp(input.now) ||
    (input.orderId !== undefined && !SAFE_ID.test(input.orderId))) {
    return closed("production-shipping-input-invalid");
  }
  if (!exactProductionOperationsConfiguration(env) ||
    env.OUTBOUND_SHIPMENT_CREATION_ENABLED !== "true" ||
    env.AUTOMATIC_OUTBOUND_SHIPMENT_ENABLED !== "true" ||
    !productionOutboundShippingRuntimeConfigured(env)) {
    return closed("production-shipping-dispatch-not-activated");
  }
  const rateLimit = await productionScheduledRateLimit(env, "outbound-shipment-dispatch");
  if (rateLimit !== "allowed") {
    return closed(`production-shipping-rate-limit-${rateLimit}`);
  }
  let fulfillment = dependencies.fulfillment;
  if (!fulfillment) {
    try {
      const provider = dependencies.shippingLabelProvider ?? createSendcloudShippingLabelProvider(
        env.DB,
        {
          publicKey: env.SENDCLOUD_PUBLIC_KEY,
          secretKey: env.SENDCLOUD_SECRET_KEY,
          senderAddressId: env.SENDCLOUD_SENDER_ADDRESS_ID,
          originAddressAttestation: env.SENDCLOUD_SENDER_ADDRESS_ATTESTATION,
          referenceVault: {
            encryptionKeyBase64: env.DELIVERY_REFERENCE_ENCRYPTION_KEY_BASE64,
            keyVersion: env.DELIVERY_REFERENCE_KEY_VERSION,
            decryptionKeysBase64: env.DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON
              ? JSON.parse(env.DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON) as Record<string, string>
              : {},
          },
        },
      );
      fulfillment = new D1FulfillmentStore(env.DB, { shippingLabel: provider });
    } catch {
      return closed("production-shipping-provider-not-configured");
    }
  }
  const candidates = await env.DB.prepare(
    `SELECT customer_order.id
    FROM orders AS customer_order
    WHERE customer_order.status = 'paid' AND customer_order.paid_at IS NOT NULL
      AND (? IS NULL OR customer_order.id = ?)
      AND EXISTS (
        SELECT 1 FROM payments AS payment
        WHERE payment.order_id = customer_order.id
          AND payment.status = 'succeeded'
          AND payment.amount_cents = customer_order.total_cents
          AND payment.currency = customer_order.currency
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM shipments WHERE shipments.order_id = customer_order.id
        )
        OR EXISTS (
          SELECT 1 FROM shipments
          WHERE shipments.order_id = customer_order.id
            AND shipments.status = 'label_pending'
            AND shipments.attempts = 0
            AND shipments.lease_token_hash IS NULL
            AND shipments.provider_shipment_reference IS NULL
            AND shipments.tracking_reference IS NULL
        )
      )
    ORDER BY customer_order.paid_at, customer_order.id LIMIT 3`,
  ).bind(input.orderId ?? null, input.orderId ?? null).all<PaidShipmentCandidate>();
  let created = 0;
  let alreadyReady = 0;
  let attentionRequired = 0;
  for (const candidate of candidates.results) {
    try {
      const hash = await sha256Hex(`outbound-shipment\0${candidate.id}`);
      const shipment = await fulfillment.createShipmentLabel({
        shipmentId: `shipment_${hash}`,
        orderId: candidate.id,
        idempotencyKey: `outbound-label:${hash}`,
        leaseToken: `lease_${crypto.randomUUID()}`,
        leaseExpiresAt: new Date(Date.parse(input.now) + 120_000).toISOString(),
        now: input.now,
      });
      if (shipment.status === "label_ready") created += 1;
      else alreadyReady += 1;
    } catch (cause) {
      // An ambiguous provider boundary is intentionally never retried here.
      // Sendcloud must be reconciled manually before any new mutation.
      if (cause instanceof FulfillmentError && [
        "PROVIDER_OUTCOME_UNKNOWN",
        "LEASE_UNAVAILABLE",
        "INVALID_TRANSITION",
      ].includes(cause.code)) {
        attentionRequired += 1;
        continue;
      }
      throw cause;
    }
  }
  return Object.freeze({
    closed: false,
    reason: null,
    candidates: candidates.results.length,
    created,
    alreadyReady,
    attentionRequired,
  });
}

export async function dispatchProductionLatePaymentRefunds(
  env: ProductionOperationsEnvironment | undefined,
  input: Readonly<{ now: string }>,
  dependencies: Readonly<{ refundProvider?: RefundPaymentProviderPort }> = {},
): Promise<Readonly<{
  closed: boolean;
  reason: string | null;
  claimed: number;
  succeeded: number;
  rejected: number;
  unknown: number;
  attentionRequired: number;
}>> {
  const closed = (reason: string) => Object.freeze({
    closed: true,
    reason,
    claimed: 0,
    succeeded: 0,
    rejected: 0,
    unknown: 0,
    attentionRequired: 0,
  });
  const configuration = env ? exactProductionOperationsConfiguration(env) : null;
  if (!env || !env.DB || !configuration) {
    return closed("production-late-refund-runtime-not-configured");
  }
  const expectedSettlement = configuration.mode === "sandbox" ? "test" : "live";
  if (env.LATE_PAYMENT_REFUND_DISPATCH_ENABLED !== "true" ||
    env.STRIPE_SETTLEMENT_MODE !== expectedSettlement ||
    !isCanonicalUtcTimestamp(input.now)) {
    return closed("production-late-refund-dispatch-not-activated");
  }
  const rateLimit = await productionScheduledRateLimit(env, "late-payment-refund-dispatch");
  if (rateLimit !== "allowed") {
    return closed(`production-late-refund-rate-limit-${rateLimit}`);
  }
  if (!await productionLatePaymentRefundSchemaInstalled(env.DB)) {
    return closed("production-late-refund-schema-not-installed");
  }
  try {
    const provider = dependencies.refundProvider ?? createStripePaymentProviderPorts({
      apiKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      mode: env.STRIPE_SETTLEMENT_MODE as "test" | "live",
    }).refunds;
    const report = await new D1LatePaymentRefundDispatcher(env.DB, provider)
      .dispatch({ now: input.now, limit: 3 });
    return Object.freeze({ closed: false, reason: null, ...report });
  } catch {
    return closed("production-late-refund-dispatch-unavailable");
  }
}

export async function runProductionScheduledOperations(
  env: ProductionOperationsEnvironment | undefined,
  input: Readonly<{ now: string }>,
  dependencies: ProductionScheduledOperationsDependencies = {},
): Promise<Readonly<{
  reservations: Awaited<ReturnType<typeof expireProductionReservations>>;
  email: Awaited<ReturnType<typeof dispatchProductionTransactionalEmails>>;
  lateRefunds: Awaited<ReturnType<typeof dispatchProductionLatePaymentRefunds>>;
  shipments: Awaited<ReturnType<typeof dispatchProductionOutboundShipments>>;
}>> {
  // Confirmation messages are claimed before an order can advance to
  // `preparing`, preserving the immediate paid-order path.
  const email = await dispatchProductionTransactionalEmails(env, input, dependencies).catch(() => Object.freeze({
    closed: true, reason: "production-email-dispatch-unavailable",
    staleLeasesRecovered: 0, claimed: 0, sent: 0,
    retryScheduled: 0, failed: 0, queueDrained: false,
  }));
  const [lateRefunds, reservations, shipments] = await Promise.all([
    dispatchProductionLatePaymentRefunds(env, input, dependencies).catch(() => Object.freeze({
      closed: true, reason: "production-late-refund-dispatch-unavailable",
      claimed: 0, succeeded: 0, rejected: 0, unknown: 0, attentionRequired: 0,
    })),
    expireProductionReservations(env, input).catch(() => Object.freeze({
      closed: true, reason: "production-reservation-dispatch-unavailable",
      candidates: 0, expired: 0, raced: 0, queueDrained: false,
    })),
    dispatchProductionOutboundShipments(env, input, dependencies).catch(() => Object.freeze({
      closed: true, reason: "production-shipping-dispatch-unavailable",
      candidates: 0, created: 0, alreadyReady: 0, attentionRequired: 0,
    })),
  ]);
  return Object.freeze({ reservations, email, lateRefunds, shipments });
}
