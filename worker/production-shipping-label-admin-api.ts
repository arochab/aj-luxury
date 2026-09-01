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
import { cloudflareAccessOwnerRequestAuthenticated } from "./cloudflare-access-owner.ts";
import { productionOutboundShippingRuntimeConfigured } from "./production-shipping-runtime.ts";

const ROUTE = /^\/api\/commerce\/admin\/orders\/([^/]+)\/shipping-label$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DOWNLOAD_REQUEST_HEADER = "X-AJ-Download-Request-Id";

type ShippingLabelAdminActor = Readonly<{
  administratorId: string;
  sessionId: string;
}>;

export type ProductionShippingLabelEnvironment = ProductionCommerceEnvironment & Readonly<{
  DB?: CommerceD1Database;
  COMMERCE_CONTROLLED_OWNER_EMAIL?: string;
  COMMERCE_ADMIN_ALLOWED_EMAILS_JSON?: string;
  COMMERCE_CONTROLLED_AUTH_HMAC_SECRET?: string;
  OUTBOUND_SHIPMENT_CREATION_ENABLED?: string;
  OPERATOR_ADMIN_MFA_ENABLED?: string;
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
  authorizeControlledOwner?: (
    request: Request,
    env: ProductionShippingLabelEnvironment,
  ) => Promise<boolean>;
  authorizeOwner?: (
    request: Request,
    database: CommerceD1Database,
    now: string,
    origin: string,
  ) => Promise<ShippingLabelAdminActor | null>;
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
  shipment: Pick<
    ExistingShipment,
    "id" | "order_id" | "provider_shipment_reference" | "tracking_reference"
  >,
  actor: ShippingLabelAdminActor,
  downloadRequestId: string,
  now: string,
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
    if (!SHA256.test(document.contentSha256) ||
      !SAFE_ID.test(document.providerDocumentReference) ||
      !IDEMPOTENCY.test(downloadRequestId)) {
      return fail("SHIPPING_DOCUMENT_UNAVAILABLE", 503);
    }
    const signature = new Uint8Array(await document.content.slice(0, 5).arrayBuffer());
    if (signature.length !== 5 || signature[0] !== 0x25 || signature[1] !== 0x50 ||
      signature[2] !== 0x44 || signature[3] !== 0x46 || signature[4] !== 0x2d) {
      return fail("SHIPPING_DOCUMENT_UNAVAILABLE", 503);
    }
    if (!env.DB) return fail("DATABASE_UNAVAILABLE", 503);
    const providerReferenceHash = await sha256Hex(document.providerDocumentReference);
    const documentIdentity = await sha256Hex(
      `${shipment.id}\0label\0${providerReferenceHash}`,
    );
    const auditIdentity = await sha256Hex(
      `${shipment.id}\0${actor.administratorId}\0${downloadRequestId}`,
    );
    const documentId = `shipping_document_${documentIdentity}`;
    const auditId = `audit_shipping_label_download_${auditIdentity}`;
    const auditIdempotencyKey = `shipping-label-download:${auditIdentity}`;
    const auditMetadata = JSON.stringify({
      administratorSessionId: actor.sessionId,
      byteLength: document.byteLength,
      contentSha256: document.contentSha256,
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO shipping_document_metadata (
          id, shipment_id, document_kind, media_type,
          provider_document_reference_hash, content_sha256, byte_length, created_at
        ) VALUES (?, ?, 'label', 'application/pdf', ?, ?, ?, ?)`,
      ).bind(
        documentId,
        shipment.id,
        providerReferenceHash,
        document.contentSha256,
        document.byteLength,
        now,
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO audit_log (
          id, actor_type, actor_id, action, entity_type, entity_id,
          idempotency_key, metadata_json, created_at
        ) SELECT ?, 'admin', ?, 'shipping_label_downloaded', 'shipment', ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM shipping_document_metadata
          WHERE id = ? AND shipment_id = ? AND document_kind = 'label'
            AND media_type = 'application/pdf'
            AND provider_document_reference_hash = ?
            AND content_sha256 = ? AND byte_length = ?
        )`,
      ).bind(
        auditId,
        actor.administratorId,
        shipment.id,
        auditIdempotencyKey,
        auditMetadata,
        now,
        documentId,
        shipment.id,
        providerReferenceHash,
        document.contentSha256,
        document.byteLength,
      ),
    ]);
    const [persistedDocument, persistedAudit] = await Promise.all([
      env.DB.prepare(
        `SELECT shipment_id, document_kind, media_type,
          provider_document_reference_hash, content_sha256, byte_length
        FROM shipping_document_metadata WHERE id = ?`,
      ).bind(documentId).first<{
        shipment_id: string;
        document_kind: string;
        media_type: string;
        provider_document_reference_hash: string;
        content_sha256: string;
        byte_length: number;
      }>(),
      env.DB.prepare(
        `SELECT actor_type, actor_id, action, entity_type, entity_id,
          idempotency_key, metadata_json
        FROM audit_log WHERE id = ?`,
      ).bind(auditId).first<{
        actor_type: string;
        actor_id: string | null;
        action: string;
        entity_type: string;
        entity_id: string;
        idempotency_key: string;
        metadata_json: string;
      }>(),
    ]);
    if (
      persistedDocument?.shipment_id !== shipment.id ||
      persistedDocument.document_kind !== "label" ||
      persistedDocument.media_type !== "application/pdf" ||
      persistedDocument.provider_document_reference_hash !== providerReferenceHash ||
      persistedDocument.content_sha256 !== document.contentSha256 ||
      persistedDocument.byte_length !== document.byteLength ||
      persistedAudit?.actor_type !== "admin" ||
      persistedAudit.actor_id !== actor.administratorId ||
      persistedAudit.action !== "shipping_label_downloaded" ||
      persistedAudit.entity_type !== "shipment" ||
      persistedAudit.entity_id !== shipment.id ||
      persistedAudit.idempotency_key !== auditIdempotencyKey ||
      persistedAudit.metadata_json !== auditMetadata
    ) {
      return fail("SHIPPING_DOCUMENT_PROOF_UNAVAILABLE", 503);
    }
    return new Response(document.content, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="AJL-${shipment.order_id}-A4.pdf"`,
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
  max_attempts: number;
  idempotency_key: string;
  last_error_code: string | null;
  provider_shipment_reference: string | null;
  tracking_provider_code: string | null;
  tracking_reference: string | null;
  provider_receipt_fingerprint: string | null;
  order_status?: string;
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
): Promise<ShippingLabelAdminActor | null> {
  const sessions = cookie(request, "__Host-aj_admin");
  const csrfCookies = cookie(request, "__Host-aj_admin_csrf");
  if (sessions.length !== 1 || csrfCookies.length !== 1 || !authorizeBrowserMutation({
    method: request.method,
    origin: request.headers.get("Origin"),
    secFetchSite: request.headers.get("Sec-Fetch-Site"),
    allowedOrigins: [origin],
    csrfCookieToken: csrfCookies[0],
    csrfHeaderToken: request.headers.get("X-CSRF-Token"),
  })) return null;
  const actor = await resolveD1MutationActor(database, {
    kind: "admin",
    sessionToken: sessions[0],
    csrfToken: csrfCookies[0],
  }, now);
  return actor?.kind === "admin" && actor.role === "owner"
    ? { administratorId: actor.administratorId, sessionId: actor.sessionId }
    : null;
}

type LabelRequestBody = Readonly<
  { kind: "empty" } | { kind: "failed-retry"; recipientPhone: string }
>;

async function labelRequestBody(request: Request): Promise<LabelRequestBody | null> {
  const encoding = request.headers.get("Content-Encoding");
  const declared = request.headers.get("Content-Length");
  if (encoding && encoding.toLowerCase() !== "identity") {
    await request.body?.cancel();
    return null;
  }
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 256)) {
    await request.body?.cancel();
    return null;
  }
  if (!request.body) return { kind: "empty" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 256) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (length === 0) return { kind: "empty" };
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !==
    "application/json") return null;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).length !== 1 ||
      typeof record.recipientPhone !== "string" ||
      !/^\+[1-9]\d{7,14}$/.test(record.recipientPhone)) return null;
    return { kind: "failed-retry", recipientPhone: record.recipientPhone };
  } catch {
    return null;
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
  return productionShippingLabelAdminReleaseCoreResponse(
    request,
    env,
    gate.origin,
    dependencies,
  );
}

/**
 * Operator implementation below the public release gate. It is exported so
 * its fulfillment/security contract can be tested while the real public gate
 * remains closed by unresolved legal terms. Network routers must call the
 * gated function above, never this core directly.
 */
export async function productionShippingLabelAdminReleaseCoreResponse(
  request: Request,
  env: ProductionShippingLabelEnvironment,
  origin: string,
  dependencies: ProductionShippingLabelDependencies = {},
): Promise<Response> {
  const match = ROUTE.exec(new URL(request.url).pathname);
  if (!match || request.method !== "POST") return fail("NOT_FOUND", 404);
  // Cloudflare Access is the production console identity. The legacy
  // controlled HMAC remains accepted only through this same verifier for the
  // private controlled-order rehearsal. Requiring the old platform-specific
  // `oai-*` headers in addition would make a correctly authenticated Access
  // session unable to retrieve its label.
  const releaseOwnerAuthenticated = dependencies.authorizeControlledOwner ?? (
    env.COMMERCE_MODE === "live"
      ? cloudflareAccessOwnerRequestAuthenticated
      : controlledOwnerRequestAuthenticated
  );
  if (!await releaseOwnerAuthenticated(request, env)) {
    return fail("CONTROLLED_ACCESS_REQUIRED", 403);
  }
  if (env.OUTBOUND_SHIPMENT_CREATION_ENABLED !== "true") {
    return fail("OUTBOUND_SHIPPING_NOT_ENABLED", 503);
  }
  if (!productionOutboundShippingRuntimeConfigured(env)) {
    return fail("SHIPPING_PROVIDER_UNAVAILABLE", 503);
  }
  if (!env.DB) return fail("DATABASE_UNAVAILABLE", 503);
  const now = new Date().toISOString();
  let actor: ShippingLabelAdminActor | null;
  try {
    actor = await (dependencies.authorizeOwner ?? authorizeD1Owner)(
      request,
      env.DB,
      now,
      origin,
    );
  } catch {
    return fail("OWNER_SESSION_UNAVAILABLE", 503);
  }
  if (!actor) return fail("OWNER_SESSION_REQUIRED", 403);
  const downloadRequestId = request.headers.get(DOWNLOAD_REQUEST_HEADER);
  if (!downloadRequestId || !IDEMPOTENCY.test(downloadRequestId)) {
    return fail("DOWNLOAD_REQUEST_ID_REQUIRED", 400);
  }
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || !IDEMPOTENCY.test(idempotencyKey)) {
    return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
  }
  return productionShippingLabelAdminAuthorizedResponse(
    request,
    env as ProductionShippingLabelEnvironment & { DB: CommerceD1Database },
    dependencies,
    actor,
    downloadRequestId,
    idempotencyKey,
    now,
    match[1],
  );
}

async function productionShippingLabelAdminAuthorizedResponse(
  request: Request,
  env: ProductionShippingLabelEnvironment & { DB: CommerceD1Database },
  dependencies: ProductionShippingLabelDependencies,
  actor: ShippingLabelAdminActor,
  downloadRequestId: string,
  idempotencyKey: string,
  now: string,
  encodedOrderId: string,
): Promise<Response> {
  let orderId: string;
  try {
    orderId = decodeURIComponent(encodedOrderId);
  } catch {
    return fail("INVALID_ORDER", 400);
  }
  const body = await labelRequestBody(request);
  if (!SAFE_ID.test(orderId) || !body) {
    return fail("INVALID_REQUEST", 400);
  }
  // The order is the durable business idempotency boundary. A browser refresh,
  // a copied operator link or a newly generated request key must always recover
  // the one existing shipment instead of creating a second Sendcloud parcel.
  const existingForOrder = await env.DB.prepare(
    `SELECT shipment.id, shipment.order_id, shipment.status, shipment.attempts,
      shipment.max_attempts, shipment.idempotency_key, shipment.last_error_code,
      shipment.provider_shipment_reference, shipment.tracking_provider_code,
      shipment.tracking_reference, shipment.provider_receipt_fingerprint,
      customer_order.status AS order_status
    FROM shipments AS shipment
    INNER JOIN orders AS customer_order ON customer_order.id=shipment.order_id
    WHERE shipment.order_id = ? LIMIT 1`,
  ).bind(orderId).first<ExistingShipment>();
  const existing = existingForOrder ?? await env.DB.prepare(
    `SELECT shipment.id, shipment.order_id, shipment.status, shipment.attempts,
      shipment.max_attempts, shipment.idempotency_key, shipment.last_error_code,
      shipment.provider_shipment_reference, shipment.tracking_provider_code,
      shipment.tracking_reference, shipment.provider_receipt_fingerprint,
      customer_order.status AS order_status
    FROM shipments AS shipment
    INNER JOIN orders AS customer_order ON customer_order.id=shipment.order_id
    WHERE shipment.idempotency_key = ?`,
  ).bind(idempotencyKey).first<ExistingShipment>();
  if (existing && existing.order_id !== orderId) {
    return fail("IDEMPOTENCY_CONFLICT", 409);
  }
  if (existing && !["paid", "preparing"].includes(existing.order_status ?? "")) {
    return fail("SHIPMENT_LABEL_UNAVAILABLE", 409);
  }
  if (existing?.status === "label_ready") {
    if (body.kind !== "empty") return fail("INVALID_REQUEST", 400);
    return printableLabelResponse(
      env,
      dependencies,
      existing,
      actor,
      downloadRequestId,
      now,
      200,
    );
  }
  const authorizedFailedRetry = Boolean(
    existing?.status === "failed" &&
    existing.last_error_code === "provider_rejected" &&
    existing.attempts >= 1 && existing.attempts < existing.max_attempts &&
    existing.provider_shipment_reference === null &&
    existing.tracking_provider_code === null &&
    existing.tracking_reference === null &&
    existing.provider_receipt_fingerprint === null,
  );
  if (authorizedFailedRetry && body.kind !== "failed-retry") {
    return fail("RECIPIENT_PHONE_REQUIRED", 400);
  }
  if (existing && existing.status !== "label_pending" && !authorizedFailedRetry) {
    return fail(
      existing.status === "label_claimed"
        ? "MANUAL_RECONCILIATION_REQUIRED"
        : "SHIPMENT_LABEL_UNAVAILABLE",
      409,
    );
  }
  if ((!existing || existing.status === "label_pending") && body.kind !== "empty") {
    return fail("INVALID_REQUEST", 400);
  }
  if (existing && authorizedFailedRetry && body.kind === "failed-retry") {
    const authorizationIdentity = await sha256Hex(
      `${existing.id}\0${actor.administratorId}\0${body.recipientPhone}`,
    );
    const authorizationId = `shipment_retry_${authorizationIdentity}`;
    const auditId = `audit_shipment_retry_${authorizationIdentity}`;
    const auditKey = `audit:shipment_retry_authorized:${authorizationIdentity}`;
    const metadata = JSON.stringify({
      administratorSessionId: actor.sessionId,
      previousAttempts: existing.attempts,
      reason: "legacy_missing_recipient_phone",
    });
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO shipment_retry_authorizations (
            id, shipment_id, administrator_id, recipient_phone, created_at, consumed_at
          ) VALUES (?, ?, ?, ?, ?, NULL)`,
        ).bind(
          authorizationId,
          existing.id,
          actor.administratorId,
          body.recipientPhone,
          now,
        ),
        env.DB.prepare(
          `INSERT OR IGNORE INTO audit_log (
            id, actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key, metadata_json, created_at
          ) SELECT ?, 'admin', ?, 'shipment_retry_authorized', 'shipment', ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM shipment_retry_authorizations
            WHERE id = ? AND shipment_id = ? AND administrator_id = ?
              AND recipient_phone = ? AND consumed_at IS NULL
          )`,
        ).bind(
          auditId,
          actor.administratorId,
          existing.id,
          auditKey,
          metadata,
          now,
          authorizationId,
          existing.id,
          actor.administratorId,
          body.recipientPhone,
        ),
      ]);
      const persisted = await env.DB.prepare(
        `SELECT shipment_id, administrator_id, recipient_phone, consumed_at
        FROM shipment_retry_authorizations WHERE id = ?`,
      ).bind(authorizationId).first<{
        shipment_id: string;
        administrator_id: string;
        recipient_phone: string;
        consumed_at: string | null;
      }>();
      if (persisted?.shipment_id !== existing.id ||
        persisted.administrator_id !== actor.administratorId ||
        persisted.recipient_phone !== body.recipientPhone ||
        persisted.consumed_at !== null) {
        return fail("SHIPMENT_RETRY_ALREADY_USED", 409);
      }
    } catch {
      return fail("SHIPMENT_RETRY_UNAVAILABLE", 409);
    }
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
  const shipmentId = existing?.id ??
    `shipment_${await sha256Hex(`${orderId}\0${idempotencyKey}`)}`;
  const shipmentIdempotencyKey = existing?.idempotency_key ?? idempotencyKey;
  const fulfillment = new D1FulfillmentStore(env.DB, { shippingLabel: provider });
  try {
    const shipment = await fulfillment.createShipmentLabel({
      shipmentId,
      orderId,
      idempotencyKey: shipmentIdempotencyKey,
      leaseToken: leaseToken(),
      leaseExpiresAt: new Date(Date.parse(now) + 120_000).toISOString(),
      now,
    });
    return printableLabelResponse(
      env,
      dependencies,
      shipment,
      actor,
      downloadRequestId,
      now,
      201,
    );
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
