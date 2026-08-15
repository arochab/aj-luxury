import { accessTokenHashContexts, hashOneTimeAccessToken, isOpaqueAccessToken } from "../lib/commerce/account-security.ts";
import { CommerceError } from "../lib/commerce/backend-domain.ts";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import type { CommerceD1Database } from "../lib/commerce/d1-port.ts";
import { D1ProductionCheckoutStore, ProductionCheckoutError } from "../lib/commerce/d1-production-checkout-store.ts";
import { D1ProductionDeliveryStore, ProductionDeliveryError } from "../lib/commerce/d1-production-delivery-store.ts";
import type { DeliveryProviderPorts } from "../lib/commerce/delivery-provider.ts";
import { authorizeBrowserMutation, buildCsrfCookie, buildSessionCookie, clearCsrfCookie, clearSessionCookie, isTrustedMutationOrigin } from "../lib/commerce/identity-access-policy.ts";
import type { PaymentProviderPorts } from "../lib/commerce/payment-provider.ts";
import { evaluateWiredProductionReleaseGate, type ProductionCommerceEnvironment } from "../lib/commerce/production-release-gate.ts";
import { createSendcloudProviderPorts } from "../lib/commerce/sendcloud-provider.ts";
import { createStripePaymentProviderPorts } from "../lib/commerce/stripe-payment-provider.ts";
import { LEGAL_VERSION } from "../lib/legal.ts";

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

export type ProductionCommerceRuntimeEnvironment = ProductionCommerceEnvironment & Readonly<{
  DB?: CommerceD1Database;
  COMMERCE_CART_HMAC_SECRET?: string;
  COMMERCE_CONTROLLED_OWNER_EMAIL?: string;
}>;
export type ProductionCommerceRouterDependencies = Readonly<{
  deliveryProvider?: DeliveryProviderPorts;
  paymentProvider?: PaymentProviderPorts;
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
function ownerOk(request: Request, env: ProductionCommerceRuntimeEnvironment): boolean {
  const expected = env.COMMERCE_CONTROLLED_OWNER_EMAIL?.trim().toLowerCase();
  const actual = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const userId = request.headers.get("oai-authenticated-user-id")?.trim();
  if (!expected || !actual || !userId || userId.length > 512 || expected.length !== actual.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return diff === 0;
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
function runtimeBlockers(env: ProductionCommerceRuntimeEnvironment): string[] {
  return [...(!env.DB ? ["database-binding-missing"] : []), ...(!secret(env) ? ["cart-session-secret-missing"] : []), "service-point-not-activated", "payment-webhook-effects-not-activated", "outbound-shipment-creation-not-activated"];
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
  const gate = evaluateWiredProductionReleaseGate(env);
  const blockers = runtimeBlockers(env);
  if (url.pathname === routes.health) {
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
    const ready = gate.ready && blockers.length === 0;
    return json({ status: ready ? "ready" : "closed", environment: "production", mode: gate.mode, releaseSha: gate.releaseSha, origin: gate.origin, launchZones: gate.launchZones, blockers: [...gate.blockers, ...blockers], capabilities: { sandboxCheckout: false, realPayment: false, realDelivery: false, transactionalEmail: false, controlledOrder: false, publicCommerce: false }, routes: { cart: "wired", homeDelivery: "wired", order: "wired", paymentSession: "blocked-by-webhook-effects", servicePoint: "blocked-by-0011", stripeWebhook: "verify-only-no-ack" } }, ready ? 200 : 503);
  }
  if (!gate.ready || !gate.origin || url.origin !== gate.origin) return fail("COMMERCE_CLOSED", 503);
  if (gate.mode === "live" && blockers.length) return fail("COMMERCE_CLOSED", 503);
  if (gate.mode !== "live" && !ownerOk(request, env)) return fail("CONTROLLED_ACCESS_REQUIRED", 403);
  if (!env.DB) return fail("DATABASE_UNAVAILABLE", 503);
  if (url.pathname === routes.points) return fail("SERVICE_POINT_NOT_ACTIVATED", 503);
  if (url.pathname === routes.webhook) {
    if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
    const raw = await bytes(request, 64 * 1024); const signature = request.headers.get("Stripe-Signature");
    if (!raw || !signature) return fail("INVALID_WEBHOOK", 400);
    try {
      const provider = dependencies.paymentProvider ?? createStripePaymentProviderPorts({ apiKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET, mode: gate.mode === "sandbox" ? "test" : "live" });
      await provider.webhooks.verify({ rawBody: raw, stripeSignature: signature, receivedAtEpochSeconds: Math.floor(Date.now() / 1000) });
      return fail("PAYMENT_EFFECTS_NOT_ACTIVATED", 503);
    } catch { return fail("INVALID_WEBHOOK", 400); }
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
  if ([routes.delivery, routes.select, routes.order, routes.payment].includes(url.pathname as never)) {
    if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
    if (!key(request)) return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
    if (!mutationOk(request, gate.origin, current)) return fail("CSRF_REJECTED", 403);
  }
  if (url.pathname === routes.currentOrder) {
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
    try { return json({ data: await new D1ProductionCheckoutStore(env.DB).currentOrder(current.cartId) }); } catch (cause) { return map(cause); }
  }
  if (url.pathname === routes.delivery) {
    if (gate.mode === "sandbox") return fail("REAL_PROVIDER_DISABLED_IN_SANDBOX", 503);
    const parsed = await body(request); if (!parsed || !exact(parsed, ["address"])) return fail("INVALID_BODY", 400);
    try {
      const provider = dependencies.deliveryProvider ?? createSendcloudProviderPorts({ publicKey: env.SENDCLOUD_PUBLIC_KEY, secretKey: env.SENDCLOUD_SECRET_KEY });
      return json({ data: await new D1ProductionDeliveryStore(env.DB, provider).quoteHomeOptions({ cartId: current.cartId, address: parsed.address as never, idempotencyKey: key(request)!, now: now() }) });
    } catch (cause) { return map(cause); }
  }
  if (url.pathname === routes.select) {
    const parsed = await body(request); if (!parsed || !exact(parsed, ["address", "optionId"]) || typeof parsed.optionId !== "string") return fail("INVALID_BODY", 400);
    try {
      const provider = dependencies.deliveryProvider ?? createSendcloudProviderPorts({ publicKey: env.SENDCLOUD_PUBLIC_KEY, secretKey: env.SENDCLOUD_SECRET_KEY });
      return json({ data: await new D1ProductionDeliveryStore(env.DB, provider).selectHomeOption({ cartId: current.cartId, optionId: parsed.optionId, address: parsed.address as never, now: now() }) });
    } catch (cause) { return map(cause); }
  }
  if (url.pathname === routes.order) {
    const parsed = await body(request); const wanted = ["address", "email", "optionId", "privacyAccepted", "quoteId", "termsAccepted"];
    if (!parsed || !exact(parsed, wanted) || typeof parsed.email !== "string" || typeof parsed.optionId !== "string" || typeof parsed.quoteId !== "string" || parsed.termsAccepted !== true || parsed.privacyAccepted !== true) return fail("INVALID_BODY", 400);
    try { return json({ data: await new D1ProductionCheckoutStore(env.DB).createOrder({ cartId: current.cartId, quoteId: parsed.quoteId, optionId: parsed.optionId, address: parsed.address as never, email: parsed.email, idempotencyKey: key(request)!, termsVersion: LEGAL_VERSION, privacyVersion: LEGAL_VERSION, now: now() }) }, 201); } catch (cause) { return map(cause); }
  }
  if (url.pathname === routes.payment) return fail("PAYMENT_WEBHOOK_EFFECTS_NOT_ACTIVATED", 503);
  if (url.pathname === routes.account || url.pathname === routes.adminHealth) return fail("IDENTITY_ROUTE_NOT_ACTIVATED", 503);
  return fail("METHOD_NOT_ALLOWED", 405);
}
