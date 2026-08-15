import { D1FulfillmentStore } from "../lib/commerce/d1-fulfillment-store.ts";
import { resolveD1MutationActor } from "../lib/commerce/d1-actor-authorization.ts";
import type { CommerceD1Database } from "../lib/commerce/d1-port.ts";
import { FulfillmentError, sha256Hex, type ShippingLabelProviderPort } from "../lib/commerce/fulfillment-domain.ts";
import type { ShippingDocumentProviderPort } from "../lib/commerce/delivery-provider.ts";
import { authorizeBrowserMutation } from "../lib/commerce/identity-access-policy.ts";
import {
  evaluateWiredProductionReleaseGate,
  type ProductionCommerceEnvironment,
} from "../lib/commerce/production-release-gate.ts";
import { createSendcloudShippingLabelProvider } from "../lib/commerce/sendcloud-shipping-label-provider.ts";
import { createSendcloudProviderPorts } from "../lib/commerce/sendcloud-provider.ts";
import { controlledOwnerRequestAuthenticated } from "./production-commerce-api.ts";

const ROUTE = /^\/api\/commerce\/admin\/orders\/([^/]+)\/shipping-label$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

export type ProductionShippingLabelEnvironment = ProductionCommerceEnvironment & Readonly<{
  DB?: CommerceD1Database;
  COMMERCE_CONTROLLED_OWNER_EMAIL?: string;
  COMMERCE_CONTROLLED_AUTH_HMAC_SECRET?: string;
  SENDCLOUD_PUBLIC_KEY?: string;
  SENDCLOUD_SECRET_KEY?: string;
  SENDCLOUD_SENDER_ADDRESS_ID?: string;
  SENDCLOUD_SENDER_ADDRESS_ATTESTATION?: string;
  DELIVERY_REFERENCE_ENCRYPTION_KEY_BASE64?: string;
  DELIVERY_REFERENCE_KEY_VERSION?: string;
  DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON?: string;
}>; 

export type ProductionShippingLabelDependencies = Readonly<{
  shippingLabelProvider?: ShippingLabelProviderPort;
  shippingDocuments?: ShippingDocumentProviderPort;
  authorizeOwner?: (
    request: Request,
    database: CommerceD1Database,
    now: string,
    origin: string,
  ) => Promise<boolean>;
}>; 

function referenceVaultConfiguration(env: ProductionShippingLabelEnvironment): Readonly<{
  encryptionKeyBase64?: string;
  keyVersion?: string;
  decryptionKeysBase64: Record<string, string>;
}> {
  const candidate: unknown = env.DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON
    ? JSON.parse(env.DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON)
    : {};
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate) ||
    Object.values(candidate).some((value) => typeof value !== "string")) {
    throw new TypeError("The delivery reference keyring is invalid.");
  }
  return Object.freeze({
    encryptionKeyBase64: env.DELIVERY_REFERENCE_ENCRYPTION_KEY_BASE64,
    keyVersion: env.DELIVERY_REFERENCE_KEY_VERSION,
    decryptionKeysBase64: candidate as Record<string, string>,
  });
}

async function printableLabelResponse(
  env: ProductionShippingLabelEnvironment,
  dependencies: ProductionShippingLabelDependencies,
  shipment: ExistingShipment,
  status: 200 | 201,
): Promise<Response> {
  if (!shipment.provider_shipment_reference || !/^[1-9]\d{0,18}$/.test(shipment.provider_shipment_reference)) {
    return fail("SHIPPING_DOCUMENT_UNAVAILABLE", 503);
  }
  try {
    const documents = dependencies.shippingDocuments ?? createSendcloudProviderPorts({
      publicKey: env.SENDCLOUD_PUBLIC_KEY,
      secretKey: env.SENDCLOUD_SECRET_KEY,
    }).documents;
    const document = await documents.document({
      requestId: shipment.id,
      providerParcelReference: shipment.provider_shipment_reference,
      documentKind: "label",
    });
    if (document.mediaType !== "application/pdf" || document.byteLength !== document.content.size) {
      return fail("SHIPPING_DOCUMENT_UNAVAILABLE", 503);
    }
    return new Response(document.content, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="AJL-${shipment.order_id}-A6.pdf"`,
        "Content-Length": String(document.byteLength),
        "Content-Type": "application/pdf",
        "X-AJ-Document-SHA256": document.contentSha256,
        "X-AJ-Shipment-Id": shipment.id,
        "X-AJ-Tracking-Reference": shipment.tracking_reference ?? "",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return fail("SHIPPING_DOCUMENT_UNAVAILABLE", 503);
  }
}

type ExistingShipment = Readonly<{
  id: string;
  order_id: string;
  status: string;
  attempts: number;
  provider_shipment_reference: string | null;
  tracking_reference: string | null;
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

function fixedTimeEmail(actualValue: string | null, expectedValue: string | undefined): boolean {
  const actual = actualValue?.trim().toLowerCase() ?? "";
  const expected = expectedValue?.trim().toLowerCase() ?? "";
  if (!actual || !expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function ownerAuthenticated(request: Request, env: ProductionShippingLabelEnvironment): boolean {
  const id = request.headers.get("oai-authenticated-user-id")?.trim() ?? "";
  return id.length > 0 && id.length <= 512 && fixedTimeEmail(
    request.headers.get("oai-authenticated-user-email"),
    env.COMMERCE_CONTROLLED_OWNER_EMAIL,
  );
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

async function authorizeD1Owner(
  request: Request,
  database: CommerceD1Database,
  now: string,
  origin: string,
): Promise<boolean> {
  const sessions = cookie(request, "__Host-aj_admin");
  const csrfCookies = cookie(request, "__Host-aj_admin_csrf");
  if (sessions.length !== 1 || csrfCookies.length !== 1 || !authorizeBrowserMutation({
    method: request.method,
    origin: request.headers.get("Origin"),
    secFetchSite: request.headers.get("Sec-Fetch-Site"),
    allowedOrigins: [origin],
    csrfCookieToken: csrfCookies[0],
    csrfHeaderToken: request.headers.get("X-CSRF-Token"),
  })) return false;
  const actor = await resolveD1MutationActor(database, {
    kind: "admin",
    sessionToken: sessions[0],
    csrfToken: csrfCookies[0],
  }, now);
  return actor?.kind === "admin" && actor.role === "owner";
}

async function emptyBody(request: Request): Promise<boolean> {
  const encoding = request.headers.get("Content-Encoding");
  const declared = request.headers.get("Content-Length");
  if ((encoding && encoding.toLowerCase() !== "identity") ||
    (declared && (!/^\d+$/.test(declared) || Number(declared) > 0))) {
    await request.body?.cancel();
    return false;
  }
  if (!request.body) return true;
  const reader = request.body.getReader();
  try {
    const first = await reader.read();
    if (!first.done && first.value.byteLength > 0) {
      await reader.cancel();
      return false;
    }
    return first.done;
  } finally {
    reader.releaseLock();
  }
}

function leaseToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `lease_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

/**
 * Separate operator-only router. The public commerce router can call this first
 * and keep its own route table unchanged until the exact integration SHA is frozen.
 */
export async function productionShippingLabelAdminResponse(
  request: Request,
  env: ProductionShippingLabelEnvironment | undefined,
  dependencies: ProductionShippingLabelDependencies = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = ROUTE.exec(url.pathname);
  if (!match) return null;
  if (env?.APP_ENV !== "production") return fail("NOT_FOUND", 404);
  if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
  const gate = evaluateWiredProductionReleaseGate(env);
  if (
    !gate.ready || !gate.origin || !["controlled", "live"].includes(gate.mode) ||
    url.origin !== gate.origin || request.headers.get("Origin") !== gate.origin ||
    request.headers.get("Sec-Fetch-Site") !== "same-origin"
  ) {
    return fail("COMMERCE_CLOSED", 503);
  }
  if (!ownerAuthenticated(request, env)) return fail("OWNER_ACCESS_REQUIRED", 403);
  if (!await controlledOwnerRequestAuthenticated(request, env)) {
    return fail("CONTROLLED_ACCESS_REQUIRED", 403);
  }
  if (!env.DB) return fail("DATABASE_UNAVAILABLE", 503);
  const now = new Date().toISOString();
  try {
    const authorized = await (dependencies.authorizeOwner ?? authorizeD1Owner)(
      request,
      env.DB,
      now,
      gate.origin,
    );
    if (!authorized) return fail("OWNER_SESSION_REQUIRED", 403);
  } catch {
    return fail("OWNER_SESSION_UNAVAILABLE", 503);
  }
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || !IDEMPOTENCY.test(idempotencyKey)) {
    return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
  }
  let orderId: string;
  try {
    orderId = decodeURIComponent(match[1]);
  } catch {
    return fail("INVALID_ORDER", 400);
  }
  if (!SAFE_ID.test(orderId) || !(await emptyBody(request))) {
    return fail("INVALID_REQUEST", 400);
  }
  const existing = await env.DB.prepare(
    `SELECT id, order_id, status, attempts, provider_shipment_reference,
      tracking_reference FROM shipments WHERE idempotency_key = ?`,
  ).bind(idempotencyKey).first<ExistingShipment>();
  if (existing && existing.order_id !== orderId) {
    return fail("IDEMPOTENCY_CONFLICT", 409);
  }
  if (existing?.status === "label_ready") {
    return printableLabelResponse(env, dependencies, existing, 200);
  }
  if (existing && existing.status !== "label_pending") {
    return fail(
      existing.status === "label_claimed"
        ? "MANUAL_RECONCILIATION_REQUIRED"
        : "SHIPMENT_LABEL_UNAVAILABLE",
      409,
    );
  }
  let provider: ShippingLabelProviderPort;
  try {
    provider = dependencies.shippingLabelProvider ?? createSendcloudShippingLabelProvider(
      env.DB,
      {
        publicKey: env.SENDCLOUD_PUBLIC_KEY,
        secretKey: env.SENDCLOUD_SECRET_KEY,
        senderAddressId: env.SENDCLOUD_SENDER_ADDRESS_ID,
        originAddressAttestation: env.SENDCLOUD_SENDER_ADDRESS_ATTESTATION,
        referenceVault: {
          ...referenceVaultConfiguration(env),
        },
      },
    );
  } catch {
    return fail("SHIPPING_PROVIDER_UNAVAILABLE", 503);
  }
  const shipmentId = `shipment_${await sha256Hex(`${orderId}\0${idempotencyKey}`)}`;
  const fulfillment = new D1FulfillmentStore(env.DB, { shippingLabel: provider });
  try {
    const shipment = await fulfillment.createShipmentLabel({
      shipmentId,
      orderId,
      idempotencyKey,
      leaseToken: leaseToken(),
      leaseExpiresAt: new Date(Date.parse(now) + 120_000).toISOString(),
      now,
    });
    return printableLabelResponse(env, dependencies, shipment, 201);
  } catch (cause) {
    if (cause instanceof FulfillmentError) {
      if (cause.code === "PROVIDER_OUTCOME_UNKNOWN") {
        return fail("MANUAL_RECONCILIATION_REQUIRED", 503);
      }
      if (["ORDER_NOT_PAID", "INVALID_TRANSITION", "LEASE_UNAVAILABLE"].includes(cause.code)) {
        return fail("SHIPMENT_LABEL_UNAVAILABLE", 409);
      }
      if (cause.code === "DEPENDENCY_UNAVAILABLE") {
        return fail("SHIPPING_PROVIDER_UNAVAILABLE", 503);
      }
    }
    return fail("SHIPMENT_LABEL_UNAVAILABLE", 503);
  }
}
