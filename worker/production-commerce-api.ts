import { accessTokenHashContexts, hashOneTimeAccessToken, isOpaqueAccessToken } from "../lib/commerce/account-security.ts";
import { CommerceError } from "../lib/commerce/backend-domain.ts";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import type { CommerceD1Database } from "../lib/commerce/d1-port.ts";
import { D1ProductionCheckoutStore, ProductionCheckoutError } from "../lib/commerce/d1-production-checkout-store.ts";
import { D1ProductionDeliveryActivationStore } from "../lib/commerce/d1-production-delivery-activation-store.ts";
import { ProductionDeliveryError } from "../lib/commerce/d1-production-delivery-store.ts";
import { D1StripePaymentEffectsStore } from "../lib/commerce/d1-stripe-payment-effects.ts";
import type { DeliveryProviderPorts } from "../lib/commerce/delivery-provider.ts";
import { DeliveryReferenceVault } from "../lib/commerce/delivery-reference-vault.ts";
import { authorizeBrowserMutation, buildCsrfCookie, buildSessionCookie, clearCsrfCookie, clearSessionCookie, isTrustedMutationOrigin } from "../lib/commerce/identity-access-policy.ts";
import { PaymentProviderError, verifyAndDeliverPaymentWebhook, type PaymentProviderPorts, type PaymentWebhookEffectsPort } from "../lib/commerce/payment-provider.ts";
import { evaluateWiredProductionReleaseGate, type ProductionCommerceEnvironment } from "../lib/commerce/production-release-gate.ts";
import { createSendcloudProviderPorts } from "../lib/commerce/sendcloud-provider.ts";
import { createStripePaymentProviderPorts } from "../lib/commerce/stripe-payment-provider.ts";
import { LEGAL_VERSION } from "../lib/legal.ts";
import {
  productionRateLimitBindingsReady,
  type ProductionRateLimitEnvironment,
} from "./production-rate-limit.ts";

const PREFIX = "/api/commerce/";
const routes = Object.freeze({
  health: `${PREFIX}health`, cart: `${PREFIX}cart`,
  delivery: `${PREFIX}checkout/delivery-options`,
  points: `${PREFIX}checkout/service-points`,
  select: `${PREFIX}checkout/delivery-options/select`,
  order: `${PREFIX}checkout/order`, payment: `${PREFIX}checkout/payment-session`,
  webhook: `${PREFIX}webhooks/stripe`, currentOrder: `${PREFIX}orders/current`,
  account: `${PREFIX}account/current`, adminHealth: `${PREFIX}admin/health`,
} as const);
const lineRoute = /^\/api\/commerce\/cart\/lines\/([^/]+)$/;
const known = new Set<string>(Object.values(routes));
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const CART_TTL = 7 * 24 * 60 * 60;

export type ProductionCommerceRuntimeEnvironment = ProductionCommerceEnvironment &
  ProductionRateLimitEnvironment & Readonly<{
  DB?: CommerceD1Database;
  COMMERCE_CART_HMAC_SECRET?: string;
  COMMERCE_CONTROLLED_OWNER_EMAIL?: string;
  COMMERCE_CONTROLLED_AUTH_HMAC_SECRET?: string;
  STRIPE_SETTLEMENT_MODE?: string;
  DELIVERY_REFERENCE_ENCRYPTION_KEY_BASE64?: string;
  DELIVERY_REFERENCE_KEY_VERSION?: string;
  DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON?: string;
}>;
export type ProductionCommerceRouterDependencies = Readonly<{
  deliveryProvider?: DeliveryProviderPorts;
  paymentProvider?: PaymentProviderPorts;
  paymentEffects?: PaymentWebhookEffectsPort;
}>;
type CartSession = Readonly<{ cartId: string; csrf: string }>;

function json(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return Response.json(value, { status, headers });
}
function fail(code: string, status: number, headers?: HeadersInit): Response {
  return json({ error: { code, requestId: `req_${crypto.randomUUID()}` } }, status, headers);
}
function cookie(request: Request, name: string): string[] {
  const raw = request.headers.get("Cookie");
  if (!raw) return [];
  return raw.split(";").flatMap((part) => {
    const at = part.indexOf("=");
    return at >= 0 && part.slice(0, at).trim() === name ? [part.slice(at + 1).trim()] : [];
  });
}
async function session(request: Request): Promise<CartSession | null> {
  const tokens = cookie(request, "__Host-aj_cart");
  const csrf = cookie(request, "__Host-aj_cart_csrf");
  if (!tokens.length && !csrf.length) return null;
  if (tokens.length !== 1 || csrf.length !== 1 || !isOpaqueAccessToken(tokens[0]) || !isOpaqueAccessToken(csrf[0])) throw new Error("invalid-cart-session");
  const hash = await hashOneTimeAccessToken(`${tokens[0]}:${csrf[0]}`, accessTokenHashContexts.cartSession);
  return Object.freeze({ cartId: `cart_${hash}`, csrf: csrf[0] });
}
function secret(env: ProductionCommerceRuntimeEnvironment): string | null {
  const value = env.COMMERCE_CART_HMAC_SECRET ?? "";
  return value.length >= 32 && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
}
function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function token(key: string, purpose: string, value: string): Promise<string> {
  const imported = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(`ajl-cart-v1\0${purpose}\0${value}`))));
}
function key(request: Request): string | null {
  const value = request.headers.get("Idempotency-Key");
  return value && IDEMPOTENCY.test(value) ? value : null;
}
function originOk(request: Request, origin: string): boolean {
  return request.headers.get("Sec-Fetch-Site") === "same-origin" && isTrustedMutationOrigin(request.headers.get("Origin"), [origin]);
}
function mutationOk(request: Request, origin: string, current: CartSession): boolean {
  return authorizeBrowserMutation({ method: request.method, origin: request.headers.get("Origin"), secFetchSite: request.headers.get("Sec-Fetch-Site"), allowedOrigins: [origin], csrfCookieToken: current.csrf, csrfHeaderToken: request.headers.get("X-CSRF-Token") });
}
const CONTROLLED_AUTH_WINDOW_SECONDS = 300;
const CONTROLLED_SIGNATURE = /^t=(\d{10}),v1=([0-9a-f]{64})$/;

async function hmacHex(secretValue: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secretValue),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(value),
  ));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function exactText(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export async function controlledRequestAuthorization(
  secretValue: string,
  input: Readonly<{ method: string; pathname: string; ownerEmail: string; timestamp: number }>,
): Promise<string> {
  if (secretValue.length < 32 || secretValue.length > 512 ||
    !Number.isSafeInteger(input.timestamp) || input.timestamp < 1_000_000_000 ||
    !/^[A-Z]+$/.test(input.method) || !input.pathname.startsWith("/api/commerce/")) {
    throw new TypeError("Controlled authorization input is invalid.");
  }
  const canonical = `ajl-controlled-v1\n${input.timestamp}\n${input.method}\n${input.pathname}\n${input.ownerEmail.toLowerCase()}`;
  return `t=${input.timestamp},v1=${await hmacHex(secretValue, canonical)}`;
}

export async function controlledOwnerRequestAuthenticated(
  request: Request,
  env: ProductionCommerceRuntimeEnvironment,
): Promise<boolean> {
  const expected = env.COMMERCE_CONTROLLED_OWNER_EMAIL?.trim().toLowerCase();
  const actual = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const userId = request.headers.get("oai-authenticated-user-id")?.trim();
  const secretValue = env.COMMERCE_CONTROLLED_AUTH_HMAC_SECRET ?? "";
  const authorization = request.headers.get("X-AJ-Controlled-Authorization") ?? "";
  const parsed = CONTROLLED_SIGNATURE.exec(authorization);
  if (!expected || !actual || !userId || userId.length > 512 ||
    !exactText(expected, actual) || secretValue.length < 32 || secretValue.length > 512 || !parsed) return false;
  const timestamp = Number(parsed[1]);
  const current = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestamp) || Math.abs(current - timestamp) > CONTROLLED_AUTH_WINDOW_SECONDS) return false;
  const wanted = await controlledRequestAuthorization(secretValue, {
    method: request.method,
    pathname: new URL(request.url).pathname,
    ownerEmail: expected,
    timestamp,
  });
  return exactText(wanted, authorization);
}
async function bytes(request: Request, maximum: number): Promise<Uint8Array | null> {
  const encoding = request.headers.get("Content-Encoding");
  const declared = request.headers.get("Content-Length");
  if ((encoding && encoding.toLowerCase() !== "identity") || (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum))) {
    await request.body?.cancel(); return null;
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > maximum) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}
async function body(request: Request): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) return null;
  const raw = await bytes(request, 16 * 1024); if (!raw) return null;
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(); const wanted = [...keys].sort();
  return actual.length === wanted.length && actual.every((item, index) => item === wanted[index]);
}
function map(cause: unknown): Response {
  if (cause instanceof CommerceError) {
    if (cause.code === "VARIANT_NOT_FOUND") return fail("VARIANT_NOT_FOUND", 404);
    if (cause.code === "STOCK_UNAVAILABLE") return fail("STOCK_UNAVAILABLE", 409);
    return fail("CART_UNAVAILABLE", 409);
  }
  if (cause instanceof ProductionCheckoutError) {
    if (cause.code === "INVALID_INPUT") return fail("INVALID_INPUT", 400);
    if (cause.code === "ORDER_NOT_FOUND") return fail("ORDER_NOT_FOUND", 404);
    return fail("CHECKOUT_UNAVAILABLE", cause.code === "ORDER_EXPIRED" ? 409 : 503);
  }
  if (cause instanceof ProductionDeliveryError) return fail(cause.code === "SERVICE_POINT_NOT_ACTIVATED" ? "SERVICE_POINT_NOT_ACTIVATED" : "DELIVERY_UNAVAILABLE", 503);
  return fail("COMMERCE_UNAVAILABLE", 503);
}
function settlementMode(env: ProductionCommerceRuntimeEnvironment): "test" | "live" | null {
  return env.STRIPE_SETTLEMENT_MODE === "test" || env.STRIPE_SETTLEMENT_MODE === "live"
    ? env.STRIPE_SETTLEMENT_MODE
    : null;
}
function controlledAuthConfigured(env: ProductionCommerceRuntimeEnvironment): boolean {
  const value = env.COMMERCE_CONTROLLED_AUTH_HMAC_SECRET ?? "";
  return value.length >= 32 && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value);
}
function deliveryVault(env: ProductionCommerceRuntimeEnvironment): DeliveryReferenceVault | null {
  try {
    const parsed: unknown = env.DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON
      ? JSON.parse(env.DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON)
      : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) ||
      Object.values(parsed).some((value) => typeof value !== "string")) return null;
    return new DeliveryReferenceVault({
      encryptionKeyBase64: env.DELIVERY_REFERENCE_ENCRYPTION_KEY_BASE64,
      keyVersion: env.DELIVERY_REFERENCE_KEY_VERSION,
      decryptionKeysBase64: parsed as Record<string, string>,
    });
  } catch {
    return null;
  }
}
function runtimeBlockers(env: ProductionCommerceRuntimeEnvironment, mode: string): string[] {
  const expectedSettlement = mode === "sandbox" ? "test" : "live";
  return [
    ...(!env.DB ? ["database-binding-missing"] : []),
    ...(!secret(env) ? ["cart-session-secret-missing"] : []),
    ...(!deliveryVault(env) ? ["delivery-reference-vault-not-configured"] : []),
    ...(!productionRateLimitBindingsReady(env) ? ["production-rate-limits-not-configured"] : []),
    ...(mode !== "live" && !controlledAuthConfigured(env)
      ? ["controlled-auth-hmac-not-configured"] : []),
    ...(settlementMode(env) !== expectedSettlement ? ["stripe-settlement-mode-mismatch"] : []),
    ...(["controlled", "live"].includes(mode)
      ? ["late-payment-compensation-not-activated", "outbound-shipment-creation-not-activated"]
      : []),
  ];
}

type InstalledCommerceSchemaObject = Readonly<{ type: string; name: string; table_name: string }>;
const deliverySchemaInventory = Object.freeze([
  "column:selected_service_point_id:delivery_option_snapshots",
  "table:delivery_provider_reference_vault:delivery_provider_reference_vault",
  "table:delivery_service_point_snapshots:delivery_service_point_snapshots",
  "trigger:trg_delivery_order_requires_selected_option:orders",
  "trigger:trg_orders_provider_pricing_contract:orders",
  "trigger:trg_shipping_quote_provider_pricing_contract:shipping_quotes",
]);

export async function productionDeliveryRuntimeInstalled(
  database: CommerceD1Database | undefined,
): Promise<boolean> {
  if (!database) return false;
  try {
    const installed = await database.prepare(
      `SELECT lower(type) AS type, lower(name) AS name,
        lower(tbl_name) AS table_name FROM sqlite_master
      WHERE (lower(type)='table' AND (
          lower(name) GLOB 'delivery_provider_reference_vault*'
          OR lower(name) GLOB 'delivery_service_point_snapshot*'
        )) OR (lower(type)='trigger' AND lower(name) IN (
          'trg_delivery_order_requires_selected_option',
          'trg_orders_provider_pricing_contract',
          'trg_shipping_quote_provider_pricing_contract'
        ))
      UNION ALL
      SELECT 'column' AS type, lower(name) AS name,
        'delivery_option_snapshots' AS table_name
      FROM pragma_table_info('delivery_option_snapshots')
      WHERE lower(name) GLOB 'selected_service_point_id*'
      ORDER BY type, name`,
    ).all<InstalledCommerceSchemaObject>();
    const actual = installed.results.map((row) => `${row.type}:${row.name}:${row.table_name}`).sort();
    return actual.length === deliverySchemaInventory.length &&
      actual.every((value, index) => value === deliverySchemaInventory[index]);
  } catch {
    return false;
  }
}

export async function productionStockRuntimeAttested(
  env: ProductionCommerceRuntimeEnvironment,
): Promise<boolean> {
  if (!env.DB || !env.STOCK_MANIFEST_ID || !env.STOCK_MANIFEST_SHA256) return false;
  try {
    const [stock, approvals] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) AS variant_count,
          COALESCE(SUM(physical_quantity), 0) AS physical_quantity,
          COALESCE(SUM(CASE WHEN reserves_validated=1 THEN 1 ELSE 0 END), 0) AS validated_count,
          COALESCE(SUM(CASE WHEN physical_quantity < 0
            OR gift_reserve_quantity < 0 OR safety_reserve_quantity < 0
            OR gift_reserve_quantity + safety_reserve_quantity > physical_quantity
            THEN 1 ELSE 0 END), 0) AS invalid_count
        FROM inventory`,
      ).first<{ variant_count: number; physical_quantity: number; validated_count: number; invalid_count: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS approval_count,
          COUNT(DISTINCT actor_id) AS signer_count,
          COALESCE(SUM(CASE WHEN actor_type='admin' AND actor_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS valid_actor_count,
          COALESCE(SUM(CASE WHEN json_extract(metadata_json, '$.role')='stock_owner'
            AND json_extract(metadata_json, '$.payloadSha256')=?
            AND json_extract(metadata_json, '$.attestation')='I_APPROVE_THIS_EXACT_STOCK_IMPORT'
            THEN 1 ELSE 0 END), 0) AS stock_owner_count,
          COALESCE(SUM(CASE WHEN json_extract(metadata_json, '$.role')='release_owner'
            AND json_extract(metadata_json, '$.payloadSha256')=?
            AND json_extract(metadata_json, '$.attestation')='I_APPROVE_THIS_EXACT_STOCK_IMPORT'
            THEN 1 ELSE 0 END), 0) AS release_owner_count
        FROM audit_log
        WHERE action='launch_stock_import_approved'
          AND entity_type='stock_manifest' AND entity_id=?`,
      ).bind(env.STOCK_MANIFEST_SHA256, env.STOCK_MANIFEST_SHA256, env.STOCK_MANIFEST_ID).first<{
        approval_count: number;
        signer_count: number;
        valid_actor_count: number;
        stock_owner_count: number;
        release_owner_count: number;
      }>(),
    ]);
    return Number(stock?.variant_count) === 12 &&
      Number(stock?.physical_quantity) === 756 &&
      Number(stock?.validated_count) === 12 && Number(stock?.invalid_count) === 0 &&
      Number(approvals?.approval_count) === 2 && Number(approvals?.signer_count) === 2 &&
      Number(approvals?.valid_actor_count) === 2 &&
      Number(approvals?.stock_owner_count) === 1 && Number(approvals?.release_owner_count) === 1;
  } catch {
    return false;
  }
}

export async function productionCommerceApiResponse(
  request: Request,
  env: ProductionCommerceRuntimeEnvironment | undefined,
  dependencies: ProductionCommerceRouterDependencies = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (env?.APP_ENV !== "production") return json({ error: "not-found" }, 404);
  const line = lineRoute.exec(url.pathname);
  if (!known.has(url.pathname) && !line) return json({ error: "not-found" }, 404);
  if (url.pathname === routes.webhook) {
    if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
    const configuredOrigin = env.COMMERCE_ORIGIN;
    const mode = settlementMode(env);
    if (!env.DB || !mode || typeof configuredOrigin !== "string" || url.origin !== configuredOrigin) {
      return fail("SETTLEMENT_UNAVAILABLE", 503);
    }
    const raw = await bytes(request, 64 * 1024); const signature = request.headers.get("Stripe-Signature");
    if (!raw || !signature) return fail("INVALID_WEBHOOK", 400);
    try {
      const provider = dependencies.paymentProvider ?? createStripePaymentProviderPorts({ apiKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET, mode });
      const delivered = await verifyAndDeliverPaymentWebhook(
        provider.webhooks,
        { rawBody: raw, stripeSignature: signature, receivedAtEpochSeconds: Math.floor(Date.now() / 1000) },
        dependencies.paymentEffects ?? new D1StripePaymentEffectsStore(env.DB, mode === "live"),
      );
      return json({ received: true, disposition: delivered.disposition });
    } catch (cause) {
      if (cause instanceof PaymentProviderError &&
        ["INVALID_SIGNATURE", "STALE_SIGNATURE"].includes(cause.code)) {
        return fail("INVALID_WEBHOOK", 400);
      }
      return fail("PAYMENT_EFFECTS_UNAVAILABLE", 503);
    }
  }
  const gate = evaluateWiredProductionReleaseGate(env);
  if (url.pathname === routes.health && request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
  const blockers = runtimeBlockers(env, gate.mode);
  if (gate.mode !== "closed" && !await productionDeliveryRuntimeInstalled(env.DB)) {
    blockers.push("delivery-schema-0013-not-installed");
  }
  if (gate.mode === "live" && !await productionStockRuntimeAttested(env)) {
    blockers.push("stock-runtime-attestation-not-verified");
  }
  if (url.pathname === routes.health) {
    const ready = gate.ready && blockers.length === 0;
    return json({ status: ready ? "ready" : "closed", environment: "production", mode: gate.mode, releaseSha: gate.releaseSha, origin: gate.origin, launchZones: gate.launchZones, blockers: [...gate.blockers, ...blockers], capabilities: { sandboxCheckout: ready && gate.mode === "sandbox", realPayment: false, realDelivery: false, transactionalEmail: ready, controlledOrder: ready && gate.mode === "controlled", publicCommerce: false }, routes: { cart: "wired", homeDelivery: "wired-provider-priced", order: "wired", paymentSession: "sandbox-only-live-compensation-blocked", servicePoint: "wired-encrypted", stripeWebhook: "atomic-d1-effects" } }, ready ? 200 : 503);
  }
  if (!gate.ready || !gate.origin || url.origin !== gate.origin) return fail("COMMERCE_CLOSED", 503);
  if (!env.DB) return fail("DATABASE_UNAVAILABLE", 503);
  if (gate.mode === "live" && blockers.length) return fail("COMMERCE_CLOSED", 503);
  if (gate.mode !== "live" && !await controlledOwnerRequestAuthenticated(request, env)) {
    return fail("CONTROLLED_ACCESS_REQUIRED", 403);
  }
  let current: CartSession | null;
  try { current = await session(request); } catch {
    const headers = new Headers(); headers.append("Set-Cookie", clearSessionCookie("cart")); headers.append("Set-Cookie", clearCsrfCookie("cart"));
    return fail("CART_SESSION_INVALID", 401, headers);
  }
  const commerce = new D1CommerceStore(env.DB);
  const now = () => new Date().toISOString();
  if (url.pathname === routes.cart && request.method === "GET") {
    if (!current) return json({ data: { status: "empty", currency: "EUR", expiresAt: null, itemCount: 0, subtotalCents: 0, lines: [] } });
    try { return json({ data: await commerce.getPublicCartSnapshot(current.cartId, now()) }); } catch (cause) { return map(cause); }
  }
  if (url.pathname === routes.cart && request.method === "POST") {
    const idem = key(request); const hmac = secret(env);
    if (!idem) return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
    if (!originOk(request, gate.origin)) return fail("ORIGIN_REJECTED", 403);
    const empty = await bytes(request, 1); if (!empty || empty.length) return fail("INVALID_BODY", 400);
    if (current && !mutationOk(request, gate.origin, current)) return fail("CSRF_REJECTED", 403);
    if (!hmac) return fail("CART_SESSION_UNAVAILABLE", 503);
    try {
      const cartToken = await token(hmac, "session", idem); const csrfToken = await token(hmac, "csrf", idem);
      const cartId = `cart_${await hashOneTimeAccessToken(`${cartToken}:${csrfToken}`, accessTokenHashContexts.cartSession)}`;
      const created = now();
      try { await commerce.getPublicCartSnapshot(cartId, created); } catch { await commerce.createCart({ id: cartId, expiresAt: new Date(Date.parse(created) + CART_TTL * 1000).toISOString(), now: created }); }
      const headers = new Headers(); headers.append("Set-Cookie", buildSessionCookie("cart", cartToken, CART_TTL)); headers.append("Set-Cookie", buildCsrfCookie("cart", csrfToken, CART_TTL));
      return json({ data: await commerce.getPublicCartSnapshot(cartId, created) }, 201, headers);
    } catch (cause) { return map(cause); }
  }
  if (line && (request.method === "PUT" || request.method === "DELETE")) {
    if (!current) return fail("CART_SESSION_REQUIRED", 401);
    if (!key(request)) return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
    if (!mutationOk(request, gate.origin, current)) return fail("CSRF_REJECTED", 403);
    let variantId: string; try { variantId = decodeURIComponent(line[1]); } catch { return fail("INVALID_VARIANT", 400); }
    try {
      if (request.method === "DELETE") { const empty = await bytes(request, 1); if (!empty || empty.length) return fail("INVALID_BODY", 400); return json({ data: await commerce.removeCartLine({ cartId: current.cartId, variantId, now: now() }) }); }
      const parsed = await body(request); if (!parsed || !exact(parsed, ["quantity"]) || !Number.isSafeInteger(parsed.quantity) || Number(parsed.quantity) < 1 || Number(parsed.quantity) > 3) return fail("INVALID_BODY", 400);
      return json({ data: await commerce.setCartLineQuantity({ cartId: current.cartId, variantId, quantity: Number(parsed.quantity), now: now() }) });
    } catch (cause) { return map(cause); }
  }
  if (!current) return fail("CART_SESSION_REQUIRED", 401);
  if ([routes.delivery, routes.points, routes.select, routes.order, routes.payment].includes(url.pathname as never)) {
    if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
    if (!key(request)) return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
    if (!mutationOk(request, gate.origin, current)) return fail("CSRF_REJECTED", 403);
  }
  if (url.pathname === routes.currentOrder) {
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
    try { return json({ data: await new D1ProductionCheckoutStore(env.DB).currentOrder(current.cartId) }); } catch (cause) { return map(cause); }
  }
  if (url.pathname === routes.delivery) {
    if (blockers.includes("delivery-schema-0013-not-installed")) return fail("DELIVERY_SCHEMA_NOT_READY", 503);
    const parsed = await body(request); if (!parsed || !exact(parsed, ["address"])) return fail("INVALID_BODY", 400);
    try {
      const provider = dependencies.deliveryProvider ?? createSendcloudProviderPorts({ publicKey: env.SENDCLOUD_PUBLIC_KEY, secretKey: env.SENDCLOUD_SECRET_KEY });
      const vault = deliveryVault(env); if (!vault) return fail("DELIVERY_REFERENCE_VAULT_UNAVAILABLE", 503);
      return json({ data: await new D1ProductionDeliveryActivationStore(env.DB, provider, vault).quoteOptions({ cartId: current.cartId, address: parsed.address as never, idempotencyKey: key(request)!, now: now() }) });
    } catch (cause) { return map(cause); }
  }
  if (url.pathname === routes.points) {
    if (blockers.includes("delivery-schema-0013-not-installed")) return fail("DELIVERY_SCHEMA_NOT_READY", 503);
    const parsed = await body(request); if (!parsed || !exact(parsed, ["address", "optionId"]) || typeof parsed.optionId !== "string") return fail("INVALID_BODY", 400);
    try {
      const provider = dependencies.deliveryProvider ?? createSendcloudProviderPorts({ publicKey: env.SENDCLOUD_PUBLIC_KEY, secretKey: env.SENDCLOUD_SECRET_KEY });
      const vault = deliveryVault(env); if (!vault) return fail("DELIVERY_REFERENCE_VAULT_UNAVAILABLE", 503);
      return json({ data: await new D1ProductionDeliveryActivationStore(env.DB, provider, vault).servicePoints({ cartId: current.cartId, optionId: parsed.optionId, address: parsed.address as never, idempotencyKey: key(request)!, now: now() }) });
    } catch (cause) { return map(cause); }
  }
  if (url.pathname === routes.select) {
    if (blockers.includes("delivery-schema-0013-not-installed")) return fail("DELIVERY_SCHEMA_NOT_READY", 503);
    const parsed = await body(request); const wanted = parsed && Object.hasOwn(parsed, "servicePointId") ? ["address", "optionId", "servicePointId"] : ["address", "optionId"];
    if (!parsed || !exact(parsed, wanted) || typeof parsed.optionId !== "string" || (Object.hasOwn(parsed, "servicePointId") && typeof parsed.servicePointId !== "string")) return fail("INVALID_BODY", 400);
    try {
      const provider = dependencies.deliveryProvider ?? createSendcloudProviderPorts({ publicKey: env.SENDCLOUD_PUBLIC_KEY, secretKey: env.SENDCLOUD_SECRET_KEY });
      const vault = deliveryVault(env); if (!vault) return fail("DELIVERY_REFERENCE_VAULT_UNAVAILABLE", 503);
      return json({ data: await new D1ProductionDeliveryActivationStore(env.DB, provider, vault).selectOption({ cartId: current.cartId, optionId: parsed.optionId, servicePointId: typeof parsed.servicePointId === "string" ? parsed.servicePointId : null, address: parsed.address as never, now: now() }) });
    } catch (cause) { return map(cause); }
  }
  if (url.pathname === routes.order) {
    if (blockers.includes("delivery-schema-0013-not-installed")) return fail("DELIVERY_SCHEMA_NOT_READY", 503);
    const parsed = await body(request); const wanted = parsed && Object.hasOwn(parsed, "servicePointId") ? ["address", "email", "optionId", "privacyAccepted", "quoteId", "servicePointId", "termsAccepted"] : ["address", "email", "optionId", "privacyAccepted", "quoteId", "termsAccepted"];
    if (!parsed || !exact(parsed, wanted) || typeof parsed.email !== "string" || typeof parsed.optionId !== "string" || typeof parsed.quoteId !== "string" || parsed.termsAccepted !== true || parsed.privacyAccepted !== true) return fail("INVALID_BODY", 400);
    if (Object.hasOwn(parsed, "servicePointId") && typeof parsed.servicePointId !== "string") return fail("INVALID_BODY", 400);
    try { return json({ data: await new D1ProductionCheckoutStore(env.DB).createOrder({ cartId: current.cartId, quoteId: parsed.quoteId, optionId: parsed.optionId, servicePointId: typeof parsed.servicePointId === "string" ? parsed.servicePointId : null, address: parsed.address as never, email: parsed.email, idempotencyKey: key(request)!, termsVersion: LEGAL_VERSION, privacyVersion: LEGAL_VERSION, now: now() }) }, 201); } catch (cause) { return map(cause); }
  }
  if (url.pathname === routes.payment) {
    if (gate.mode !== "sandbox") return fail("LATE_PAYMENT_COMPENSATION_NOT_ACTIVATED", 503);
    const empty = await bytes(request, 1); if (!empty || empty.length) return fail("INVALID_BODY", 400);
    try {
      const checkout = new D1ProductionCheckoutStore(env.DB);
      const prepared = await checkout.prepareCheckoutSession({ cartId: current.cartId, idempotencyKey: key(request)!, origin: gate.origin, locale: "fr", now: now() });
      const provider = dependencies.paymentProvider ?? createStripePaymentProviderPorts({ apiKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET, mode: "test" });
      const receipt = await provider.checkout.createSession(prepared);
      await checkout.recordCheckoutSession(prepared, receipt, now());
      return json({ data: { url: receipt.checkoutUrl } }, 201);
    } catch (cause) {
      if (cause instanceof PaymentProviderError && ["INVALID_REQUEST", "REJECTED"].includes(cause.code)) return fail("PAYMENT_REJECTED", 409);
      return map(cause);
    }
  }
  if (url.pathname === routes.account || url.pathname === routes.adminHealth) return fail("IDENTITY_ROUTE_NOT_ACTIVATED", 503);
  return fail("METHOD_NOT_ALLOWED", 405);
}
