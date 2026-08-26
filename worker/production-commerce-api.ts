import { accessTokenHashContexts, hashOneTimeAccessToken, isOpaqueAccessToken } from "../lib/commerce/account-security.ts";
import { CommerceError } from "../lib/commerce/backend-domain.ts";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import type { CommerceD1Database } from "../lib/commerce/d1-port.ts";
import { D1ProductionCheckoutStore, ProductionCheckoutError } from "../lib/commerce/d1-production-checkout-store.ts";
import { D1ProductionDeliveryActivationStore } from "../lib/commerce/d1-production-delivery-activation-store.ts";
import { D1LatePaymentRefundDispatcher } from "../lib/commerce/d1-late-payment-refunds.ts";
import { ProductionDeliveryError } from "../lib/commerce/d1-production-delivery-store.ts";
import { D1StripePaymentEffectsStore } from "../lib/commerce/d1-stripe-payment-effects.ts";
import {
  ProductionStockImportError,
  activateProductionLaunchStock,
  type ProductionStockImportReceipt,
} from "../lib/commerce/d1-production-stock-import.ts";
import type { DeliveryProviderPorts } from "../lib/commerce/delivery-provider.ts";
import { DeliveryReferenceVault } from "../lib/commerce/delivery-reference-vault.ts";
import { authorizeBrowserMutation, buildCsrfCookie, buildSessionCookie, clearCsrfCookie, clearSessionCookie, isTrustedMutationOrigin } from "../lib/commerce/identity-access-policy.ts";
import { PaymentProviderError, verifyAndDeliverPaymentWebhook, type PaymentProviderPorts, type PaymentWebhookEffectsPort } from "../lib/commerce/payment-provider.ts";
import { validateLaunchStockImport } from "../lib/commerce/launch-stock-import.ts";
import {
  createProductionProviderConfigurationAttestation,
  productionProviderConfigurationSchemaContractSha256,
  type ProductionProviderIdentities,
} from "../lib/commerce/production-provider-configuration.ts";
import {
  productionLaunchStockCurrentGridContractSha256,
  productionReleaseSchemaContractSha256,
} from "../lib/commerce/production-schema-contract.ts";
import { evaluateWiredProductionReleaseGate, productionEvidenceVersionId, type ProductionCommerceEnvironment } from "../lib/commerce/production-release-gate.ts";
import { recordVerifiedResendWebhook, ResendWebhookError } from "../lib/commerce/resend-webhook.ts";
import { createSendcloudProviderPorts } from "../lib/commerce/sendcloud-provider.ts";
import { createStripePaymentProviderPorts } from "../lib/commerce/stripe-payment-provider.ts";
import { LEGAL_VERSION } from "../lib/legal.ts";
import {
  productionRateLimitBindingsReady,
  type ProductionRateLimitEnvironment,
} from "./production-rate-limit.ts";
import {
  productionEmailDispatchRuntimeConfigured,
  productionOperationsRuntimeInstalled,
  productionResendRuntimeInstalled,
} from "./production-operations-runtime.ts";
import { productionOutboundShippingRuntimeConfigured } from "./production-shipping-runtime.ts";
import {
  cloudflareAccessOwnerConfigurationValid,
  cloudflareAccessOwnerRequestAuthenticated,
} from "./cloudflare-access-owner.ts";
import { isConfiguredStorefrontOrigin } from "./commerce-backend-bridge.ts";

const PREFIX = "/api/commerce/";
const routes = Object.freeze({
  health: `${PREFIX}health`, cart: `${PREFIX}cart`,
  delivery: `${PREFIX}checkout/delivery-options`,
  points: `${PREFIX}checkout/service-points`,
  select: `${PREFIX}checkout/delivery-options/select`,
  order: `${PREFIX}checkout/order`, payment: `${PREFIX}checkout/payment-session`,
  webhook: `${PREFIX}webhooks/stripe`, resendWebhook: `${PREFIX}webhooks/resend`,
  currentOrder: `${PREFIX}orders/current`,
  refundDispatch: `${PREFIX}admin/late-payment-refunds/dispatch`,
  account: `${PREFIX}account/current`, adminHealth: `${PREFIX}admin/health`,
  stockImport: `${PREFIX}admin/launch-stock-import`,
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
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  PRODUCTION_STOCK_IMPORT_ENABLED?: string;
  STRIPE_ACCOUNT_ID?: string;
  STRIPE_SETTLEMENT_MODE?: string;
  LATE_PAYMENT_REFUND_DISPATCH_ENABLED?: string;
  CONTROLLED_PAYMENT_SESSION_ENABLED?: string;
  OUTBOUND_SHIPMENT_CREATION_ENABLED?: string;
  SENDCLOUD_INTEGRATION_ID?: string;
  SENDCLOUD_SENDER_ADDRESS_ID?: string;
  SENDCLOUD_SENDER_ADDRESS_ATTESTATION?: string;
  OPERATOR_ADMIN_MFA_ENABLED?: string;
  TRANSACTIONAL_EMAIL_DISPATCH_ENABLED?: string;
  TRANSACTIONAL_EMAIL_DISPATCH_MODE?: string;
  TRANSACTIONAL_FROM_NAME?: string;
  RESEND_DOMAIN?: string;
  RETURNS_WORKFLOW_ENABLED?: string;
  SHIPMENT_HANDOVER_ENABLED?: string;
  RETURNS_LABEL_AND_REFUND_PROCESS_APPROVED?: string;
  RESERVATION_EXPIRY_ENABLED?: string;
  DELIVERY_REFERENCE_ENCRYPTION_KEY_BASE64?: string;
  DELIVERY_REFERENCE_KEY_VERSION?: string;
  DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON?: string;
  COMMERCE_BACKEND_ONLY?: string;
  COMMERCE_STOREFRONT_ORIGINS_JSON?: string;
  COMMERCE_CONTROLLED_STOREFRONT_ORIGIN?: string;
  COMMERCE_PUBLIC_STOREFRONT_ORIGINS_JSON?: string;
}>;
export type ProductionCommerceRouterDependencies = Readonly<{
  trustedStorefrontOrigin?: string;
  deliveryProvider?: DeliveryProviderPorts;
  paymentProvider?: PaymentProviderPorts;
  paymentEffects?: PaymentWebhookEffectsPort;
  stockImporter?: (
    database: CommerceD1Database,
    input: Readonly<{
      manifest: unknown;
      releaseSha: string;
      workerVersionId: string;
      activatedAt: string;
      providerIdentities: ProductionProviderIdentities;
    }>,
  ) => Promise<ProductionStockImportReceipt>;
  stockImportOwnerAuthenticator?: (
    request: Request,
    env: ProductionCommerceRuntimeEnvironment,
  ) => Promise<boolean>;
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
  if (!expected) return false;
  if (await cloudflareAccessOwnerRequestAuthenticated(request, env)) return true;
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
    if (cause.code === "MAX_QUANTITY") return fail("MAX_QUANTITY", 409);
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
export function productionCommerceRuntimeBlockers(
  env: ProductionCommerceRuntimeEnvironment,
  mode: string,
): string[] {
  const expectedSettlement = mode === "sandbox" ? "test" : "live";
  const accessConfigured = cloudflareAccessOwnerConfigurationValid(env);
  return [
    ...(!env.DB ? ["database-binding-missing"] : []),
    ...(!secret(env) ? ["cart-session-secret-missing"] : []),
    ...(!deliveryVault(env) ? ["delivery-reference-vault-not-configured"] : []),
    ...(!productionRateLimitBindingsReady(env) ? ["production-rate-limits-not-configured"] : []),
    ...(mode === "sandbox" && !accessConfigured && !controlledAuthConfigured(env)
      ? ["controlled-owner-auth-not-configured"] : []),
    ...(["controlled", "live"].includes(mode) && !accessConfigured && !controlledAuthConfigured(env)
      ? ["cloudflare-access-owner-not-configured"] : []),
    ...(settlementMode(env) !== expectedSettlement ? ["stripe-settlement-mode-mismatch"] : []),
    ...(["controlled", "live"].includes(mode)
      ? [
        ...(mode === "controlled" && env.CONTROLLED_PAYMENT_SESSION_ENABLED !== "true"
          ? ["controlled-payment-session-not-enabled"]
          : []),
        ...(env.LATE_PAYMENT_REFUND_DISPATCH_ENABLED === "true"
          ? []
          : ["late-payment-refund-dispatch-not-enabled"]),
        ...(env.OUTBOUND_SHIPMENT_CREATION_ENABLED === "true"
          ? []
          : ["outbound-shipment-creation-not-enabled"]),
        ...(productionOutboundShippingRuntimeConfigured(env)
          ? []
          : ["outbound-shipping-runtime-not-configured"]),
        // Customer checkout does not expose operator administration. Keep MFA
        // mandatory for public `live` promotion while allowing the owner-only
        // controlled acceptance order to run before the admin console opens.
        ...(mode !== "controlled" && env.OPERATOR_ADMIN_MFA_ENABLED !== "true"
          ? ["operator-admin-mfa-not-enabled"]
          : []),
        ...(productionEmailDispatchRuntimeConfigured(env)
          ? []
          : ["transactional-email-dispatch-not-enabled"]),
        ...(env.RETURNS_WORKFLOW_ENABLED === "true"
          ? []
          : ["returns-workflow-not-activated"]),
        ...(env.SHIPMENT_HANDOVER_ENABLED === "true"
          ? []
          : ["shipment-handover-not-enabled"]),
        ...(mode === "live" && env.RETURNS_LABEL_AND_REFUND_PROCESS_APPROVED !== "true"
          ? ["returns-label-and-refund-process-unapproved"] : []),
        ...(env.RESERVATION_EXPIRY_ENABLED === "true"
          ? []
          : ["reservation-expiry-not-activated"]),
      ]
      : []),
  ];
}

type InstalledCommerceSchemaObject = Readonly<{ type: string; name: string; table_name: string }>;
const deliverySchemaInventory = Object.freeze([
  "column:selected_service_point_id:delivery_option_snapshots",
  "index:idx_delivery_options_cart_expiry:delivery_option_snapshots",
  "index:idx_delivery_reference_key_version:delivery_provider_reference_vault",
  "index:idx_delivery_service_points_option_expiry:delivery_service_point_snapshots",
  "index:ux_delivery_options_quote:delivery_option_snapshots",
  "index:ux_delivery_options_selected_cart:delivery_option_snapshots",
  "index:ux_delivery_reference_owner:delivery_provider_reference_vault",
  "index:ux_delivery_service_point_provider_ref:delivery_service_point_snapshots",
  "index:ux_shipping_document_reference:shipping_document_metadata",
  "table:delivery_option_snapshots:delivery_option_snapshots",
  "table:delivery_provider_reference_vault:delivery_provider_reference_vault",
  "table:delivery_service_point_snapshots:delivery_service_point_snapshots",
  "table:shipping_document_metadata:shipping_document_metadata",
  "trigger:trg_delivery_option_initially_unselected:delivery_option_snapshots",
  "trigger:trg_delivery_option_retain:delivery_option_snapshots",
  "trigger:trg_delivery_option_select_once:delivery_option_snapshots",
  "trigger:trg_delivery_option_validate_insert:delivery_option_snapshots",
  "trigger:trg_delivery_order_requires_selected_option:orders",
  "trigger:trg_delivery_reference_immutable:delivery_provider_reference_vault",
  "trigger:trg_delivery_reference_replay_guard:delivery_provider_reference_vault",
  "trigger:trg_delivery_reference_retain:delivery_provider_reference_vault",
  "trigger:trg_delivery_reference_validate_insert:delivery_provider_reference_vault",
  "trigger:trg_delivery_service_point_immutable:delivery_service_point_snapshots",
  "trigger:trg_delivery_service_point_retain:delivery_service_point_snapshots",
  "trigger:trg_delivery_service_point_validate_insert:delivery_service_point_snapshots",
  "trigger:trg_orders_provider_pricing_contract:orders",
  "trigger:trg_orders_require_shipping_snapshot_insert:orders",
  "trigger:trg_shipping_document_immutable:shipping_document_metadata",
  "trigger:trg_shipping_document_retain:shipping_document_metadata",
  "trigger:trg_shipping_quote_provider_pricing_contract:shipping_quotes",
  "trigger:trg_shipping_quote_validate_insert:shipping_quotes",
]);

export async function productionDeliveryRuntimeInstalled(
  database: CommerceD1Database | undefined,
): Promise<boolean> {
  if (!database) return false;
  try {
    const installed = await database.prepare(
      `SELECT lower(type) AS type, lower(name) AS name,
        lower(tbl_name) AS table_name FROM sqlite_master
      WHERE lower(name) NOT GLOB 'sqlite_autoindex_*' AND (
        lower(tbl_name) IN (
          'delivery_option_snapshots',
          'delivery_provider_reference_vault',
          'delivery_service_point_snapshots',
          'shipping_document_metadata'
        ) OR (lower(type)='trigger' AND lower(name) IN (
          'trg_delivery_order_requires_selected_option',
          'trg_orders_require_shipping_snapshot_insert',
          'trg_orders_provider_pricing_contract',
          'trg_shipping_quote_validate_insert',
          'trg_shipping_quote_provider_pricing_contract'
        )))
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

const latePaymentRefundSchemaInventory = Object.freeze([
  "index:idx_late_payment_refund_dispatch:late_payment_refund_intents",
  "index:ux_late_payment_refund_active_lease:late_payment_refund_intents",
  "index:ux_late_payment_refund_idempotency:late_payment_refund_intents",
  "index:ux_late_payment_refund_order:late_payment_refund_intents",
  "index:ux_late_payment_refund_payment:late_payment_refund_intents",
  "index:ux_late_payment_refund_provider_refund:late_payment_refund_intents",
  "index:ux_late_payment_refund_webhook:late_payment_refund_intents",
  "index:ux_payments_order_active_checkout:payments",
  "table:late_payment_refund_intents:late_payment_refund_intents",
  "trigger:trg_late_payment_refund_lock_identity:late_payment_refund_intents",
  "trigger:trg_late_payment_refund_retain:late_payment_refund_intents",
  "trigger:trg_late_payment_refund_terminal_immutable:late_payment_refund_intents",
  "trigger:trg_late_payment_refund_validate_claim_time:late_payment_refund_intents",
  "trigger:trg_late_payment_refund_validate_insert:late_payment_refund_intents",
  "trigger:trg_late_payment_refund_validate_success:late_payment_refund_intents",
  "trigger:trg_late_payment_refund_validate_transition:late_payment_refund_intents",
]);

const productionReleaseSchemaInventory = Object.freeze([
  "index:ux_production_provider_configuration_digest:production_provider_configuration_attestations",
  "index:ux_production_provider_configuration_manifest:production_provider_configuration_attestations",
  "index:ux_production_release_controlled_order:production_release_attestations",
  "index:ux_production_release_stock_manifest:production_release_attestations",
  "index:ux_production_stock_manifest_payload:production_launch_stock_manifests",
  "index:ux_production_stock_manifest_position:production_launch_stock_manifest_lines",
  "index:ux_production_stock_manifest_variant:production_launch_stock_manifest_lines",
  "table:production_launch_stock_manifest_lines:production_launch_stock_manifest_lines",
  "table:production_launch_stock_manifests:production_launch_stock_manifests",
  "table:production_provider_configuration_attestations:production_provider_configuration_attestations",
  "table:production_release_attestations:production_release_attestations",
  "table:production_runtime_schema_proofs:production_runtime_schema_proofs",
  "trigger:trg_production_provider_configuration_immutable:production_provider_configuration_attestations",
  "trigger:trg_production_provider_configuration_retain:production_provider_configuration_attestations",
  "trigger:trg_production_provider_configuration_validate:production_provider_configuration_attestations",
  "trigger:trg_production_release_attestation_immutable:production_release_attestations",
  "trigger:trg_production_release_attestation_retain:production_release_attestations",
  "trigger:trg_production_release_attestation_validate:production_release_attestations",
  "trigger:trg_production_schema_proof_immutable:production_runtime_schema_proofs",
  "trigger:trg_production_schema_proof_retain:production_runtime_schema_proofs",
  "trigger:trg_production_stock_manifest_immutable:production_launch_stock_manifests",
  "trigger:trg_production_stock_manifest_line_closed:production_launch_stock_manifest_lines",
  "trigger:trg_production_stock_manifest_line_immutable:production_launch_stock_manifest_lines",
  "trigger:trg_production_stock_manifest_line_retain:production_launch_stock_manifest_lines",
  "trigger:trg_production_stock_manifest_retain:production_launch_stock_manifests",
]);

export async function productionReleaseSchemaInstalled(
  database: CommerceD1Database | undefined,
): Promise<boolean> {
  if (!database) return false;
  try {
    const [installed, releaseSentinel, providerSentinel] = await Promise.all([
      database.prepare(
        `SELECT lower(type) AS type, lower(name) AS name,
          lower(tbl_name) AS table_name FROM sqlite_master
        WHERE lower(tbl_name) IN (
          'production_launch_stock_manifest_lines',
          'production_launch_stock_manifests',
          'production_provider_configuration_attestations',
          'production_release_attestations',
          'production_runtime_schema_proofs'
        ) AND lower(name) NOT GLOB 'sqlite_autoindex_*'
        ORDER BY type, name`,
      ).all<InstalledCommerceSchemaObject>(),
      database.prepare(
        `SELECT contract_sha256 FROM production_runtime_schema_proofs
        WHERE migration_id='0015_production_release_attestation'`,
      ).first<{ contract_sha256: string }>(),
      database.prepare(
        `SELECT contract_sha256 FROM production_runtime_schema_proofs
        WHERE migration_id='0019_provider_configuration_attestation'`,
      ).first<{ contract_sha256: string }>(),
    ]);
    const actual = installed.results
      .map((row) => `${row.type}:${row.name}:${row.table_name}`)
      .sort();
    return actual.length === productionReleaseSchemaInventory.length &&
      actual.every((value, index) => value === productionReleaseSchemaInventory[index]) &&
      releaseSentinel?.contract_sha256 === productionReleaseSchemaContractSha256 &&
      providerSentinel?.contract_sha256 === productionProviderConfigurationSchemaContractSha256;
  } catch {
    return false;
  }
}

export async function productionLatePaymentRefundSchemaInstalled(
  database: CommerceD1Database | undefined,
): Promise<boolean> {
  if (!database) return false;
  try {
    const installed = await database.prepare(
      `SELECT lower(type) AS type, lower(name) AS name,
        lower(tbl_name) AS table_name FROM sqlite_master
      WHERE (lower(name) GLOB '*late_payment_refund*'
        OR lower(name)='ux_payments_order_active_checkout')
        AND lower(name) NOT GLOB 'sqlite_autoindex_*'
      ORDER BY type, name`,
    ).all<InstalledCommerceSchemaObject>();
    const actual = installed.results
      .map((row) => `${row.type}:${row.name}:${row.table_name}`)
      .sort();
    if (actual.length !== latePaymentRefundSchemaInventory.length ||
      !actual.every((value, index) => value === latePaymentRefundSchemaInventory[index])) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function productionLatePaymentRefundRuntimeReady(
  database: CommerceD1Database | undefined,
): Promise<boolean> {
  if (!await productionLatePaymentRefundSchemaInstalled(database) || !database) return false;
  try {
    const unresolved = await database.prepare(
      `SELECT COUNT(*) AS count FROM late_payment_refund_intents
      WHERE status <> 'succeeded'`,
    ).first<{ count: number }>();
    return Number(unresolved?.count ?? -1) === 0;
  } catch {
    return false;
  }
}

function productionProviderIdentities(
  env: ProductionCommerceRuntimeEnvironment,
): ProductionProviderIdentities {
  return {
    stripeAccountId: env.STRIPE_ACCOUNT_ID ?? "",
    sendcloudIntegrationId: env.SENDCLOUD_INTEGRATION_ID ?? "",
    sendcloudSenderAddressId: env.SENDCLOUD_SENDER_ADDRESS_ID ?? "",
    resendDomain: env.RESEND_DOMAIN ?? "",
    commerceOrigin: env.COMMERCE_ORIGIN ?? "",
    transactionalFromEmail: env.TRANSACTIONAL_FROM_EMAIL ?? "",
  };
}

export async function productionProviderConfigurationRuntimeAttested(
  env: ProductionCommerceRuntimeEnvironment,
): Promise<boolean> {
  const evidenceVersionId = productionEvidenceVersionId(env);
  if (!env.DB || !env.COMMERCE_RELEASE_SHA || !env.STOCK_MANIFEST_ID ||
    !evidenceVersionId) return false;
  try {
    const expected = await createProductionProviderConfigurationAttestation({
      releaseSha: env.COMMERCE_RELEASE_SHA,
      workerVersionId: evidenceVersionId,
      stockManifestId: env.STOCK_MANIFEST_ID,
      ...productionProviderIdentities(env),
    });
    const proof = await env.DB.prepare(
      `SELECT attestation.release_sha, attestation.worker_version_id,
        attestation.stock_manifest_id, attestation.protocol,
        attestation.configuration_sha256, attestation.stripe_account_id,
        attestation.sendcloud_integration_id,
        attestation.sendcloud_sender_address_id, attestation.resend_domain,
        attestation.commerce_origin, attestation.transactional_from_email,
        CASE WHEN EXISTS (
          SELECT 1 FROM production_runtime_schema_proofs
          WHERE migration_id='0019_provider_configuration_attestation'
            AND contract_sha256='${productionProviderConfigurationSchemaContractSha256}'
        ) THEN 1 ELSE 0 END AS schema_proven
      FROM production_provider_configuration_attestations AS attestation
      WHERE attestation.release_sha=?`,
    ).bind(env.COMMERCE_RELEASE_SHA).first<Record<string, string | number>>();
    return proof?.schema_proven === 1 &&
      proof.release_sha === expected.releaseSha &&
      proof.worker_version_id === expected.workerVersionId &&
      proof.stock_manifest_id === expected.stockManifestId &&
      proof.protocol === expected.protocol &&
      proof.configuration_sha256 === expected.configurationSha256 &&
      proof.stripe_account_id === expected.stripeAccountId &&
      proof.sendcloud_integration_id === expected.sendcloudIntegrationId &&
      proof.sendcloud_sender_address_id === expected.sendcloudSenderAddressId &&
      proof.resend_domain === expected.resendDomain &&
      proof.commerce_origin === expected.commerceOrigin &&
      proof.transactional_from_email === expected.transactionalFromEmail;
  } catch {
    return false;
  }
}

export async function productionStockManifestRuntimeAttested(
  env: ProductionCommerceRuntimeEnvironment,
): Promise<boolean> {
  if (!await productionProviderConfigurationRuntimeAttested(env)) return false;
  const metadata = env.CF_VERSION_METADATA;
  const evidenceVersionId = productionEvidenceVersionId(env);
  if (!env.DB || !env.STOCK_MANIFEST_ID || !env.STOCK_MANIFEST_SHA256 ||
    !env.COMMERCE_RELEASE_SHA ||
    !metadata?.id || !metadata.tag || !evidenceVersionId) return false;
  try {
    const proof = await env.DB.prepare(
      `SELECT manifest.id AS manifest_id, manifest.protocol, manifest.payload_sha256,
        manifest.counted_at, manifest.release_sha, manifest.worker_version_id,
        manifest.physical_total, manifest.variant_count,
        manifest.gifting_reserve_total, manifest.safety_reserve_total,
        manifest.sav_reserve_total, manifest.sellable_total,
        manifest.stock_owner_id, manifest.release_owner_id,
        manifest.stock_owner_signed_at, manifest.release_owner_signed_at,
        manifest.activated_at,
        CASE WHEN EXISTS (
          SELECT 1 FROM production_runtime_schema_proofs
          WHERE migration_id='0015_production_release_attestation'
            AND contract_sha256='${productionReleaseSchemaContractSha256}'
        ) AND EXISTS (
          SELECT 1 FROM production_runtime_schema_proofs
          WHERE migration_id='0020_launch_stock_current_grid'
            AND contract_sha256='${productionLaunchStockCurrentGridContractSha256}'
        ) THEN 1 ELSE 0 END AS schema_proven
      FROM production_launch_stock_manifests AS manifest
      WHERE manifest.id=? AND manifest.payload_sha256=? AND manifest.release_sha=?`,
    ).bind(
      env.STOCK_MANIFEST_ID,
      env.STOCK_MANIFEST_SHA256,
      env.COMMERCE_RELEASE_SHA,
    ).first<Record<string, string | number>>();
    if (!proof || proof.schema_proven !== 1 ||
      proof.release_sha !== env.COMMERCE_RELEASE_SHA ||
      proof.worker_version_id !== evidenceVersionId) return false;

    const rows = await env.DB.prepare(
      `SELECT line.position, line.variant_id, line.internal_reference,
        line.physical_quantity, line.gifting_reserve_quantity,
        line.safety_reserve_quantity, line.sav_reserve_quantity,
        line.sellable_quantity, stock.physical_quantity AS live_physical_quantity,
        stock.gift_reserve_quantity AS live_gifting_reserve_quantity,
        stock.safety_reserve_quantity AS live_safety_reserve_quantity,
        stock.reserves_validated AS live_reserves_validated
      FROM production_launch_stock_manifest_lines AS line
      INNER JOIN inventory AS stock ON stock.variant_id=line.variant_id
      WHERE line.manifest_id=? ORDER BY line.position`,
    ).bind(env.STOCK_MANIFEST_ID).all<Record<string, string | number>>();
    if (rows.results.length !== 12 || rows.results.some((row, index) =>
      Number(row.position) !== index ||
      Number(row.live_physical_quantity) !== Number(row.physical_quantity) ||
      Number(row.live_gifting_reserve_quantity) !== Number(row.gifting_reserve_quantity) ||
      Number(row.live_safety_reserve_quantity) !==
        Number(row.safety_reserve_quantity) + Number(row.sav_reserve_quantity) ||
      Number(row.live_reserves_validated) !== 1)) return false;
    const validated = await validateLaunchStockImport({
      protocol: proof.protocol,
      manifestId: proof.manifest_id,
      countedAt: proof.counted_at,
      variants: rows.results.map((row) => ({
        variantId: row.variant_id,
        internalReference: row.internal_reference,
        physicalQuantity: Number(row.physical_quantity),
        giftingReserveQuantity: Number(row.gifting_reserve_quantity),
        safetyReserveQuantity: Number(row.safety_reserve_quantity),
        savReserveQuantity: Number(row.sav_reserve_quantity),
      })),
      totals: {
        physicalQuantity: Number(proof.physical_total),
        giftingReserveQuantity: Number(proof.gifting_reserve_total),
        safetyReserveQuantity: Number(proof.safety_reserve_total),
        savReserveQuantity: Number(proof.sav_reserve_total),
        sellableQuantity: Number(proof.sellable_total),
      },
      approvals: [
        { role: "stock_owner", signerId: proof.stock_owner_id,
          signedAt: proof.stock_owner_signed_at, payloadSha256: proof.payload_sha256,
          attestation: "I_APPROVE_THIS_EXACT_STOCK_IMPORT" },
        { role: "release_owner", signerId: proof.release_owner_id,
          signedAt: proof.release_owner_signed_at, payloadSha256: proof.payload_sha256,
          attestation: "I_APPROVE_THIS_EXACT_STOCK_IMPORT" },
      ],
    });
    return validated.payloadSha256 === env.STOCK_MANIFEST_SHA256 &&
      validated.manifestId === env.STOCK_MANIFEST_ID;
  } catch {
    return false;
  }
}

export async function productionStockRuntimeAttested(
  env: ProductionCommerceRuntimeEnvironment,
): Promise<boolean> {
  const metadata = env.CF_VERSION_METADATA;
  const evidenceVersionId = productionEvidenceVersionId(env);
  if (!await productionStockManifestRuntimeAttested(env) || !env.DB ||
    !env.STOCK_MANIFEST_ID || !env.COMMERCE_RELEASE_SHA ||
    !env.COMMERCE_CONTROLLED_ORDER_PROOF_ID || !metadata?.id || !metadata.tag ||
    !evidenceVersionId) return false;
  try {
    const release = await env.DB.prepare(
      `SELECT release.worker_version_id, release.worker_version_tag,
        release.controlled_order_id, release.adam_approver_id,
        release.jeremy_approver_id, manifest.stock_owner_id,
        manifest.release_owner_id,
        CASE WHEN EXISTS (
          SELECT 1 FROM orders AS customer_order
          INNER JOIN payments AS payment ON payment.order_id=customer_order.id
          INNER JOIN shipments AS shipment ON shipment.order_id=customer_order.id
          INNER JOIN email_outbox AS message ON message.order_id=customer_order.id
          WHERE customer_order.id=release.controlled_order_id
            AND customer_order.status IN ('paid','preparing','shipped')
            AND customer_order.paid_at IS NOT NULL
            AND payment.provider='stripe' AND payment.status='succeeded'
            AND payment.amount_cents=customer_order.total_cents
            AND payment.currency=customer_order.currency
            AND shipment.status IN ('handed_over','in_transit','delivered')
            AND shipment.provider_shipment_reference IS NOT NULL
            AND shipment.tracking_reference IS NOT NULL
            AND shipment.provider_receipt_fingerprint IS NOT NULL
            AND shipment.label_created_at IS NOT NULL
            AND message.kind='payment_confirmation'
            AND message.status='sent' AND message.sent_at IS NOT NULL
        ) THEN 1 ELSE 0 END AS controlled_order_proven
      FROM production_release_attestations AS release
      INNER JOIN production_launch_stock_manifests AS manifest
        ON manifest.id=release.stock_manifest_id
      WHERE release.release_sha=? AND release.stock_manifest_id=?`,
    ).bind(env.COMMERCE_RELEASE_SHA, env.STOCK_MANIFEST_ID)
      .first<Record<string, string | number>>();
    return release?.controlled_order_proven === 1 &&
      release.worker_version_id === evidenceVersionId &&
      release.worker_version_tag === metadata.tag &&
      release.controlled_order_id === env.COMMERCE_CONTROLLED_ORDER_PROOF_ID &&
      release.stock_owner_id === release.jeremy_approver_id &&
      release.release_owner_id === release.adam_approver_id;
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
  if (url.pathname === routes.stockImport) {
    if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
    if (env.COMMERCE_MODE !== "controlled" ||
      env.PRODUCTION_STOCK_IMPORT_ENABLED !== "true") {
      return fail("STOCK_IMPORT_CLOSED", 503);
    }
    const stockImportOwnerAuthenticated = dependencies.stockImportOwnerAuthenticator ??
      controlledOwnerRequestAuthenticated;
    if (!await stockImportOwnerAuthenticated(request, env)) {
      return fail("CONTROLLED_ACCESS_REQUIRED", 403);
    }
    if (!env.COMMERCE_ORIGIN || url.origin !== env.COMMERCE_ORIGIN ||
      !originOk(request, env.COMMERCE_ORIGIN)) return fail("ORIGIN_REJECTED", 403);
    if (!env.DB) return fail("DATABASE_UNAVAILABLE", 503);
    const releaseSha = env.COMMERCE_RELEASE_SHA ?? "";
    const workerVersionId = env.CF_VERSION_METADATA?.id ?? "";
    if (request.headers.get("X-AJ-Release-SHA") !== releaseSha ||
      request.headers.get("X-AJ-Stock-Import-Confirmation") !==
        "IMPORT_749_CURRENT_23_GIFTS_726_SELLABLE" ||
      env.CF_VERSION_METADATA?.tag !== releaseSha ||
      env.COMMERCE_ADAM_APPROVAL_SHA !== releaseSha ||
      env.COMMERCE_JEREMY_APPROVAL_SHA !== releaseSha ||
      env.STOCK_MANIFEST_APPROVED_BY !== "jeremy") {
      return fail("STOCK_IMPORT_RELEASE_EVIDENCE_MISSING", 503);
    }
    const parsed = await body(request);
    if (!parsed || !exact(parsed, ["manifest"])) return fail("INVALID_BODY", 400);
    try {
      const validated = await validateLaunchStockImport(parsed.manifest);
      if (validated.manifestId !== env.STOCK_MANIFEST_ID ||
        validated.payloadSha256 !== env.STOCK_MANIFEST_SHA256 ||
        validated.approvedBy.stock_owner !== "jeremy" ||
        validated.approvedBy.release_owner !== "adam" ||
        request.headers.get("Idempotency-Key") !== `stock-import:${validated.manifestId}`) {
        return fail("STOCK_IMPORT_MANIFEST_EVIDENCE_MISMATCH", 409);
      }
      const result = await (dependencies.stockImporter ?? activateProductionLaunchStock)(
        env.DB,
        {
          manifest: parsed.manifest,
          releaseSha,
          workerVersionId,
          activatedAt: new Date().toISOString(),
          providerIdentities: productionProviderIdentities(env),
        },
      );
      return json({ data: result }, result.disposition === "activated" ? 201 : 200);
    } catch (cause) {
      if (cause instanceof ProductionStockImportError) {
        if (["DATABASE_NOT_EMPTY", "IMPORT_CONFLICT"].includes(cause.code)) {
          return fail("STOCK_IMPORT_CONFLICT", 409);
        }
        if (["INVALID_RELEASE", "ACTIVATION_PRECEDES_APPROVAL",
          "INVALID_PROVIDER_CONFIGURATION"].includes(cause.code)) {
          return fail("STOCK_IMPORT_RELEASE_EVIDENCE_MISSING", 503);
        }
      }
      return fail("STOCK_IMPORT_UNAVAILABLE", 503);
    }
  }
  if (url.pathname === routes.resendWebhook) {
    if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
    if (!env.DB || !env.RESEND_WEBHOOK_SECRET || !env.COMMERCE_ORIGIN ||
      url.origin !== env.COMMERCE_ORIGIN) {
      return fail("EMAIL_WEBHOOK_UNAVAILABLE", 503);
    }
    if (!await productionResendRuntimeInstalled(env.DB)) {
      return fail("EMAIL_WEBHOOK_UNAVAILABLE", 503);
    }
    const raw = await bytes(request, 64 * 1024);
    if (!raw) return fail("INVALID_WEBHOOK", 400);
    try {
      const received = await recordVerifiedResendWebhook({
        database: env.DB,
        rawBody: raw,
        signingSecret: env.RESEND_WEBHOOK_SECRET,
        eventId: request.headers.get("svix-id"),
        timestamp: request.headers.get("svix-timestamp"),
        signature: request.headers.get("svix-signature"),
        now: new Date().toISOString(),
        nowEpochSeconds: Math.floor(Date.now() / 1_000),
      });
      return json({ received: true, disposition: received.disposition });
    } catch (cause) {
      if (cause instanceof ResendWebhookError &&
        ["INVALID_SIGNATURE", "INVALID_PAYLOAD"].includes(cause.code)) {
        return fail("INVALID_WEBHOOK", 400);
      }
      return fail("EMAIL_WEBHOOK_UNAVAILABLE", 503);
    }
  }
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
  const blockers = productionCommerceRuntimeBlockers(env, gate.mode);
  if (url.pathname === routes.health) {
    if (gate.mode !== "closed" && !await productionDeliveryRuntimeInstalled(env.DB)) {
      blockers.push("delivery-schema-0013-not-installed");
    }
    if (["controlled", "live"].includes(gate.mode) &&
      !await productionLatePaymentRefundRuntimeReady(env.DB)) {
      blockers.push("late-payment-refund-schema-or-operations-not-ready");
    }
    if (["controlled", "live"].includes(gate.mode) &&
      !await productionReleaseSchemaInstalled(env.DB)) {
      blockers.push("production-release-schema-0015-not-installed");
    }
    if (["controlled", "live"].includes(gate.mode) &&
      !await productionOperationsRuntimeInstalled(env.DB)) {
      blockers.push("production-operations-schema-0016-not-installed");
    }
    if (["controlled", "live"].includes(gate.mode) &&
      !await productionResendRuntimeInstalled(env.DB)) {
      blockers.push("resend-email-schema-0018-not-installed");
    }
    if (["controlled", "live"].includes(gate.mode) &&
      !await productionStockManifestRuntimeAttested(env)) {
      blockers.push("stock-manifest-runtime-not-attested");
    }
    if (gate.mode === "live" && !await productionStockRuntimeAttested(env)) {
      blockers.push("stock-runtime-attestation-not-verified");
    }
    const ready = gate.ready && blockers.length === 0;
    return json({ status: ready ? "ready" : "closed", environment: "production", mode: gate.mode, releaseSha: gate.releaseSha, origin: gate.origin, launchZones: gate.launchZones, blockers: [...gate.blockers, ...blockers], capabilities: { sandboxCheckout: ready && gate.mode === "sandbox", realPayment: ready && ["controlled", "live"].includes(gate.mode), realDelivery: ready && ["controlled", "live"].includes(gate.mode), transactionalEmail: ready && productionEmailDispatchRuntimeConfigured(env), returns: ready && gate.mode === "live" && env.RETURNS_WORKFLOW_ENABLED === "true", controlledOrder: ready && gate.mode === "controlled", publicCommerce: ready && gate.mode === "live" }, routes: { cart: "wired", homeDelivery: "wired-provider-priced", order: "wired", paymentSession: "sandbox-controlled-or-live-behind-release-gate", servicePoint: "wired-encrypted", stripeWebhook: "atomic-d1-effects-and-late-refund-obligation", resendWebhook: "svix-signed-idempotent-audit", lateRefundDispatch: "wired-bounded-owner-only", returns: "workflow-gated" } }, ready ? 200 : 503);
  }
  if (!gate.ready || !gate.origin || url.origin !== gate.origin) return fail("COMMERCE_CLOSED", 503);
  const controlledStorefront = env.COMMERCE_BACKEND_ONLY === "true" &&
    dependencies.trustedStorefrontOrigin === env.COMMERCE_CONTROLLED_STOREFRONT_ORIGIN;
  if ((gate.mode !== "live" || controlledStorefront) &&
    !await controlledOwnerRequestAuthenticated(request, env)) {
    return fail("CONTROLLED_ACCESS_REQUIRED", 403);
  }
  if (!env.DB) return fail("DATABASE_UNAVAILABLE", 503);
  if (gate.mode !== "closed" && !await productionDeliveryRuntimeInstalled(env.DB)) {
    blockers.push("delivery-schema-0013-not-installed");
  }
  if (["controlled", "live"].includes(gate.mode) &&
    !await productionLatePaymentRefundRuntimeReady(env.DB)) {
    blockers.push("late-payment-refund-schema-or-operations-not-ready");
  }
  if (["controlled", "live"].includes(gate.mode) &&
    !await productionReleaseSchemaInstalled(env.DB)) {
    blockers.push("production-release-schema-0015-not-installed");
  }
  if (["controlled", "live"].includes(gate.mode) &&
    !await productionOperationsRuntimeInstalled(env.DB)) {
    blockers.push("production-operations-schema-0016-not-installed");
  }
  if (["controlled", "live"].includes(gate.mode) &&
    !await productionResendRuntimeInstalled(env.DB)) {
    blockers.push("resend-email-schema-0018-not-installed");
  }
  if (["controlled", "live"].includes(gate.mode) &&
    !await productionStockManifestRuntimeAttested(env)) {
    blockers.push("stock-manifest-runtime-not-attested");
  }
  if (gate.mode === "live" && !await productionStockRuntimeAttested(env)) {
    blockers.push("stock-runtime-attestation-not-verified");
  }
  if (gate.mode === "live" && blockers.length && url.pathname !== routes.refundDispatch) {
    return fail("COMMERCE_CLOSED", 503);
  }
  if (url.pathname === routes.refundDispatch) {
    if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
    if (!await controlledOwnerRequestAuthenticated(request, env)) {
      return fail("CONTROLLED_ACCESS_REQUIRED", 403);
    }
    if (!gate.origin || !originOk(request, gate.origin)) return fail("ORIGIN_REJECTED", 403);
    if (!key(request)) return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
    if (env.LATE_PAYMENT_REFUND_DISPATCH_ENABLED !== "true" ||
      !await productionLatePaymentRefundSchemaInstalled(env.DB)) {
      return fail("LATE_PAYMENT_REFUND_NOT_READY", 503);
    }
    const empty = await bytes(request, 1);
    if (!empty || empty.length) return fail("INVALID_BODY", 400);
    try {
      const mode = settlementMode(env);
      if (!mode) return fail("SETTLEMENT_UNAVAILABLE", 503);
      const provider = dependencies.paymentProvider ?? createStripePaymentProviderPorts({
        apiKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        mode,
      });
      const report = await new D1LatePaymentRefundDispatcher(
        env.DB,
        provider.refunds,
      ).dispatch({ now: new Date().toISOString(), limit: 3 });
      return json({ data: report });
    } catch {
      return fail("LATE_PAYMENT_REFUND_DISPATCH_UNAVAILABLE", 503);
    }
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
    if (!["sandbox", "controlled", "live"].includes(gate.mode)) {
      return fail("PAYMENT_SESSION_NOT_ACTIVATED", 503);
    }
    if (["controlled", "live"].includes(gate.mode) && blockers.length > 0) {
      return fail(gate.mode === "controlled"
        ? "CONTROLLED_PAYMENT_RUNTIME_NOT_READY"
        : "LIVE_PAYMENT_RUNTIME_NOT_READY", 503);
    }
    const empty = await bytes(request, 1); if (!empty || empty.length) return fail("INVALID_BODY", 400);
    try {
      const checkout = new D1ProductionCheckoutStore(env.DB);
      const returnOrigin = env.COMMERCE_BACKEND_ONLY === "true" &&
        dependencies.trustedStorefrontOrigin &&
        isConfiguredStorefrontOrigin(dependencies.trustedStorefrontOrigin, env)
        ? dependencies.trustedStorefrontOrigin
        : gate.origin;
      const prepared = await checkout.prepareCheckoutSession({ cartId: current.cartId, idempotencyKey: key(request)!, origin: returnOrigin, locale: "fr", now: now() });
      const mode = settlementMode(env);
      if (!mode) return fail("SETTLEMENT_UNAVAILABLE", 503);
      const provider = dependencies.paymentProvider ?? createStripePaymentProviderPorts({ apiKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET, mode });
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
