import { isCanonicalUtcTimestamp } from "../lib/commerce/account-security.ts";
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

const SESSION_ROUTE = "/api/commerce/admin/session";
const ORDERS_ROUTE = "/api/commerce/admin/orders";
const MFA_ATTESTATION = "independent-mfa:required-every-login";
const MAX_FRESH_AUTH_MS = 5 * 60_000;

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
  order_email_status: string | null;
  payment_email_status: string | null;
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
    env.OPERATOR_ADMIN_MFA_ENABLED === "true" &&
    env.OPERATOR_CONSOLE_ENABLED === "true" &&
    env.CLOUDFLARE_ACCESS_MFA_ATTESTATION === MFA_ATTESTATION &&
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

async function accessIdentity(
  request: Request,
  env: ProductionOperatorConsoleEnvironment,
  dependencies: ProductionOperatorConsoleDependencies,
): Promise<CloudflareAccessOwnerIdentity | null> {
  return await (dependencies.accessIdentity ?? cloudflareAccessOwnerIdentity)(request, env);
}

async function createSession(
  request: Request,
  env: ProductionOperatorConsoleEnvironment & { DB: CommerceD1Database },
  identity: CloudflareAccessOwnerIdentity,
  now: string,
): Promise<Response> {
  if (!sameOriginMutation(request, env.COMMERCE_ORIGIN!) || !(await emptyBody(request))) {
    return fail("INVALID_REQUEST", 400);
  }
  const authenticatedAt = identity.authenticatedAt;
  if (!isCanonicalUtcTimestamp(authenticatedAt) || authenticatedAt > now ||
    Date.parse(now) - Date.parse(authenticatedAt) > MAX_FRESH_AUTH_MS) {
    return fail("FRESH_MFA_REQUIRED", 403);
  }
  const externalSubjectHash = await sha256(
    `ajl-access-subject-v1\0${identity.issuer}\0${identity.subject}`,
  );
  const evidenceHash = await sha256(
    `ajl-access-mfa-v1\0${identity.assertion}\0${MFA_ATTESTATION}`,
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
        shipment.status AS shipment_status,
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
  if (![SESSION_ROUTE, ORDERS_ROUTE].includes(url.pathname)) return null;
  if (!configured(env, url)) return fail("OPERATOR_CONSOLE_CLOSED", 503);
  const now = dependencies.now?.() ?? new Date().toISOString();
  if (!isCanonicalUtcTimestamp(now)) return fail("CLOCK_UNAVAILABLE", 503);
  const identity = await accessIdentity(request, env, dependencies);
  if (!identity) return fail("CLOUDFLARE_ACCESS_REQUIRED", 403);
  if (url.pathname === ORDERS_ROUTE) {
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
    return listOrders(request, env.DB, now);
  }
  if (request.method === "POST") return createSession(request, env, identity, now);
  if (request.method === "DELETE") return logout(request, env, now);
  return fail("METHOD_NOT_ALLOWED", 405);
}
