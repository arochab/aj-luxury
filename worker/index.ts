/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { createStaticFileSignal } from "vinext/server/request-pipeline";
import {
  accessTokenHashContexts,
  createOpaqueAccessToken,
  hashOneTimeAccessToken,
  isOpaqueAccessToken,
} from "../lib/commerce/account-security.ts";
import { CommerceError } from "../lib/commerce/backend-domain.ts";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";
import type { PublicCartSnapshot } from "../lib/commerce/d1-commerce-store.ts";
import {
  D1DeliveryOptionsStore,
  DeliveryOptionStoreError,
  type DeliveryOptionSnapshotRow,
} from "../lib/commerce/d1-delivery-options-store.ts";
import { deliveryProviderClosed } from "../lib/commerce/delivery-provider.ts";
import {
  D1FulfillmentStore,
  type ShippingQuoteParcelSnapshotRow,
} from "../lib/commerce/d1-fulfillment-store.ts";
import {
  D1PreprodCheckoutStore,
  PreprodCheckoutError,
} from "../lib/commerce/d1-preprod-checkout-store.ts";
import {
  derivePreprodOwner,
  D1PreprodOwnerDemoStore,
  type PreprodOwner,
} from "../lib/commerce/d1-preprod-owner-demo-store.ts";
import { verifyPreprodTestPaymentEvent } from "../lib/commerce/preprod-test-payment-adapter.internal.ts";
import type {
  CommerceD1Database,
  CommerceD1Result,
} from "../lib/commerce/d1-port.ts";
import {
  FulfillmentError,
  normalizeShippingAddress,
  sha256Hex,
  type ShippingAddressInput,
} from "../lib/commerce/fulfillment-domain.ts";
import {
  CLIENT_VALIDATED_PARCEL_MIGRATION,
  parcelSnapshotMatchesProfile,
  resolveClientValidatedParcelProfile,
} from "../lib/commerce/parcel-profiles.ts";
import {
  authorizeBrowserMutation,
  buildCsrfCookie,
  buildSessionCookie,
  clearCsrfCookie,
  clearSessionCookie,
  isTrustedMutationOrigin,
} from "../lib/commerce/identity-access-policy.ts";
import { LEGAL_VERSION } from "../lib/legal.ts";
import {
  isExactSyntheticDemoAddress,
  SYNTHETIC_DEMO_DATASET_KIND,
  SYNTHETIC_DEMO_EMAIL,
  SYNTHETIC_DEMO_EXPIRES_AT,
  SYNTHETIC_DEMO_FIXTURE_VERSION,
  SYNTHETIC_DEMO_MIGRATION,
} from "../lib/preprod/synthetic-demo.ts";
import { productionCommerceApiResponse } from "./production-commerce-api.ts";
import {
  productionOperationsApiResponse,
  runProductionScheduledOperations,
} from "./production-operations-api.ts";
import { productionShippingLabelAdminResponse } from "./production-shipping-label-admin-api.ts";
import { productionCommerceRateLimitResponse } from "./production-rate-limit.ts";

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS?: Fetcher;
  DB: CommerceD1Database;
  APP_ENV?: string;
  PREPROD_ORIGIN?: string;
  PREPROD_DEMO_DATASET?: string;
  PREPROD_OWNER_EMAIL?: string;
  TRANSACTIONAL_EMAIL_DISPATCH_ENABLED?: string;
  TRANSACTIONAL_EMAIL_DISPATCH_MODE?: string;
  TRANSACTIONAL_FROM_NAME?: string;
  TRANSACTIONAL_REPLY_TO?: string;
  RETURNS_WORKFLOW_ENABLED?: string;
  RESERVATION_EXPIRY_ENABLED?: string;
  COMMERCE_REPORTING_ENABLED?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

type RuntimeEnv = Env | undefined;

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  scheduledTime: number;
}

const STATIC_ASSET_PREFIXES = [
  "/assets/",
  "/fonts/",
  "/i18n/",
  "/images/",
  "/videos/",
];
const MEDIA_ASSET_PREFIX = "/media/";
const MEDIA_ASSET_ROOTS = new Set(["i18n", "images", "videos"]);
const CACHEABLE_HTML_ROUTES = new Set([
  "/",
  "/contact",
  "/cookies",
  "/legal-notice",
  "/notre-histoire",
  "/privacy",
  "/shipping-returns",
  "/shop",
  "/terms",
  "/withdrawal",
]);
// Bump this namespace whenever cacheable server-rendered content changes so a
// deployment never inherits HTML written by an older Worker version.
const HTML_CACHE_VERSION = "2026-08-21-hero-v6";
const PREPROD_API_PREFIX = "/api/preprod/";
const PREPROD_CART_PATH = `${PREPROD_API_PREFIX}cart`;
const PREPROD_CART_LINE_PATTERN = /^\/api\/preprod\/cart\/lines\/([^/]+)$/;
const PREPROD_SHIPPING_QUOTE_PATH =
  `${PREPROD_API_PREFIX}checkout/shipping-quote`;
const PREPROD_DELIVERY_OPTIONS_PATH =
  `${PREPROD_API_PREFIX}checkout/delivery-options`;
const PREPROD_DELIVERY_SERVICE_POINTS_PATH =
  `${PREPROD_API_PREFIX}checkout/service-points`;
const PREPROD_DELIVERY_SELECT_PATH =
  `${PREPROD_API_PREFIX}checkout/delivery-options/select`;
const PREPROD_ORDER_PATH = `${PREPROD_API_PREFIX}checkout/order`;
const PREPROD_CURRENT_ORDER_PATH = `${PREPROD_API_PREFIX}orders/current`;
const PREPROD_TEST_PAYMENT_PATH = `${PREPROD_API_PREFIX}checkout/test-payment`;
const PREPROD_ACCOUNT_PATH = `${PREPROD_API_PREFIX}account/current`;
const PREPROD_DIAGNOSTICS_PATH = `${PREPROD_API_PREFIX}diagnostics`;
const PREPROD_TRACKING_ADVANCE_PATH =
  `${PREPROD_API_PREFIX}orders/current/tracking/advance`;
const CART_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const CART_MAX_QUANTITY = 5;
const CART_MAX_ACTIVE_SESSIONS = 250;
const CART_MAX_CREATIONS_PER_MINUTE = 30;
const CART_RETENTION_DAYS = 30;
const SHIPPING_QUOTE_BODY_MAX_BYTES = 4 * 1024;
const ORDER_BODY_MAX_BYTES = 8 * 1024;
const SHIPPING_QUOTE_TTL_MS = 15 * 60 * 1_000;
const SHIPPING_QUOTE_IDEMPOTENCY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

type SyntheticDemoGate = Readonly<{
  required: boolean;
  ready: boolean;
  reason:
    | "ready"
    | "flag-disabled"
    | "sentinel-missing"
    | "sentinel-invalid"
    | "installation-proof-invalid"
    | "dataset-expired"
    | "database-unavailable";
  latestMigration: string | null;
  expiresAt: string | null;
}>;

const SYNTHETIC_DEMO_TRIGGER_INVENTORY = Object.freeze({
  trg_preprod_demo_cart_active_delete: "carts",
  trg_preprod_demo_cart_active_insert: "carts",
  trg_preprod_demo_cart_active_update: "carts",
  trg_preprod_demo_cart_line_active_delete: "cart_lines",
  trg_preprod_demo_cart_line_active_insert: "cart_lines",
  trg_preprod_demo_cart_line_active_update: "cart_lines",
  trg_preprod_demo_dataset_immutable_delete: "preprod_demo_dataset",
  trg_preprod_demo_dataset_immutable_update: "preprod_demo_dataset",
  trg_preprod_demo_order_active_insert: "orders",
  trg_preprod_demo_order_active_update: "orders",
  trg_preprod_demo_payment_active_insert: "payments",
  trg_preprod_demo_reservation_active_insert: "stock_reservations",
  trg_preprod_demo_reservation_active_update: "stock_reservations",
  trg_preprod_demo_shipping_quote_active_insert: "shipping_quotes",
  trg_preprod_demo_shipping_quote_active_update: "shipping_quotes",
  trg_preprod_demo_webhook_active_insert: "webhook_events",
} as const);

const SYNTHETIC_DEMO_TABLE_INVENTORY = Object.freeze({
  preprod_demo_dataset: "preprod_demo_dataset",
} as const);

const SHIPPING_PARCEL_TRIGGER_INVENTORY = Object.freeze({
  trg_shipping_quote_parcel_snapshot_immutable_update:
    "shipping_quote_parcel_snapshots",
  trg_shipping_quote_parcel_snapshot_matches_cart:
    "shipping_quote_parcel_snapshots",
  trg_shipping_quote_parcel_snapshot_retain_delete:
    "shipping_quote_parcel_snapshots",
} as const);

const SHIPPING_PARCEL_TABLE_INVENTORY = Object.freeze({
  shipping_quote_parcel_snapshots: "shipping_quote_parcel_snapshots",
} as const);

const PROVIDER_PRICED_DELIVERY_MIGRATION =
  "0013_provider_priced_delivery_orders.sql" as const;
const LATE_PAYMENT_REFUND_MIGRATION =
  "0014_late_payment_refund_compensation.sql" as const;
const MULTICARRIER_TABLE_INVENTORY = Object.freeze({
  delivery_option_snapshots: "delivery_option_snapshots",
  delivery_provider_reference_vault: "delivery_provider_reference_vault",
  delivery_service_point_snapshots: "delivery_service_point_snapshots",
  shipping_document_metadata: "shipping_document_metadata",
} as const);
const MULTICARRIER_INDEX_INVENTORY = Object.freeze({
  idx_delivery_options_cart_expiry: "delivery_option_snapshots",
  idx_delivery_reference_key_version: "delivery_provider_reference_vault",
  idx_delivery_service_points_option_expiry:
    "delivery_service_point_snapshots",
  ux_delivery_options_quote: "delivery_option_snapshots",
  ux_delivery_options_selected_cart: "delivery_option_snapshots",
  ux_delivery_reference_owner: "delivery_provider_reference_vault",
  ux_delivery_service_point_provider_ref:
    "delivery_service_point_snapshots",
  ux_shipping_document_reference: "shipping_document_metadata",
} as const);
const MULTICARRIER_TRIGGER_INVENTORY = Object.freeze({
  trg_delivery_order_requires_selected_option: "orders",
  trg_delivery_option_initially_unselected: "delivery_option_snapshots",
  trg_delivery_option_retain: "delivery_option_snapshots",
  trg_delivery_option_select_once: "delivery_option_snapshots",
  trg_delivery_option_validate_insert: "delivery_option_snapshots",
  trg_delivery_reference_immutable: "delivery_provider_reference_vault",
  trg_delivery_reference_replay_guard: "delivery_provider_reference_vault",
  trg_delivery_reference_retain: "delivery_provider_reference_vault",
  trg_delivery_reference_validate_insert: "delivery_provider_reference_vault",
  trg_delivery_service_point_immutable: "delivery_service_point_snapshots",
  trg_delivery_service_point_retain: "delivery_service_point_snapshots",
  trg_delivery_service_point_validate_insert:
    "delivery_service_point_snapshots",
  trg_shipping_document_immutable: "shipping_document_metadata",
  trg_shipping_document_retain: "shipping_document_metadata",
  trg_shipping_quote_provider_pricing_contract: "shipping_quotes",
  trg_orders_provider_pricing_contract: "orders",
} as const);
const LATE_PAYMENT_REFUND_TABLE_INVENTORY = Object.freeze({
  late_payment_refund_intents: "late_payment_refund_intents",
} as const);
const LATE_PAYMENT_REFUND_INDEX_INVENTORY = Object.freeze({
  idx_late_payment_refund_dispatch: "late_payment_refund_intents",
  ux_late_payment_refund_active_lease: "late_payment_refund_intents",
  ux_late_payment_refund_idempotency: "late_payment_refund_intents",
  ux_late_payment_refund_order: "late_payment_refund_intents",
  ux_late_payment_refund_payment: "late_payment_refund_intents",
  ux_late_payment_refund_provider_refund: "late_payment_refund_intents",
  ux_late_payment_refund_webhook: "late_payment_refund_intents",
  ux_payments_order_active_checkout: "payments",
} as const);
const LATE_PAYMENT_REFUND_TRIGGER_INVENTORY = Object.freeze({
  trg_late_payment_refund_lock_identity: "late_payment_refund_intents",
  trg_late_payment_refund_retain: "late_payment_refund_intents",
  trg_late_payment_refund_terminal_immutable: "late_payment_refund_intents",
  trg_late_payment_refund_validate_claim_time: "late_payment_refund_intents",
  trg_late_payment_refund_validate_insert: "late_payment_refund_intents",
  trg_late_payment_refund_validate_success: "late_payment_refund_intents",
  trg_late_payment_refund_validate_transition: "late_payment_refund_intents",
} as const);

type InstalledSchemaObject = Readonly<{
  type: string;
  name: string;
  table_name: string;
}>;

function matchesExactSchemaInventory(
  installed: readonly InstalledSchemaObject[],
  type: "table" | "index" | "trigger",
  expectedTableByName: Readonly<Record<string, string>>,
): boolean {
  const actual = [...installed].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  );
  const expected = Object.entries(expectedTableByName).sort(
    ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
  );
  return actual.length === expected.length && actual.every((row, index) =>
    row.type === type &&
    row.name === expected[index]?.[0] &&
    row.table_name === expected[index]?.[1]
  );
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

async function readPreprodOwner(
  request: Request,
  env: Env,
): Promise<PreprodOwner | null> {
  const configured = env.PREPROD_OWNER_EMAIL?.trim().toLowerCase();
  const authenticatedEmail = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  const authenticatedUserId = request.headers
    .get("oai-authenticated-user-id")
    ?.trim();
  if (
    !configured || !authenticatedEmail || !authenticatedUserId ||
    !constantTimeTextEqual(authenticatedEmail, configured) ||
    authenticatedUserId.length > 512
  ) {
    return null;
  }
  try {
    return await derivePreprodOwner(configured);
  } catch {
    return null;
  }
}

function cartPersistenceDiagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/preprod_demo_dataset_inactive/i.test(message)) return "dataset-inactive";
  if (/commerce_cart|constraint failed/i.test(message)) return "cart-invariant-rejected";
  if (/D1_ERROR|database|SQLITE/i.test(message)) return "database-write-rejected";
  return "unexpected-cart-write-failure";
}

function logPreprodUnavailable(
  event: "preprod_health_unavailable" | "preprod_cart_gate_unavailable",
  request: Request,
  reason: string,
  latestMigration: string | null,
): void {
  const candidateRay = request.headers.get("cf-ray");
  const ray = candidateRay && /^[A-Za-z0-9-]{1,80}$/.test(candidateRay)
    ? candidateRay
    : null;
  console.error(JSON.stringify({
    event,
    reason,
    latestMigration,
    requestId: `req_${crypto.randomUUID()}`,
    ...(ray ? { ray } : {}),
  }));
}

async function ownerCartDiagnosticResponse(
  request: Request,
  env: Env,
  error: unknown,
): Promise<Response> {
  const diagnostic = cartPersistenceDiagnostic(error);
  const requestId = `req_${crypto.randomUUID()}`;
  if (await readPreprodOwner(request, env)) {
    console.error(JSON.stringify({
      event: "preprod_cart_write_failed",
      diagnostic,
      requestId,
    }));
    return jsonResponse({
      error: {
        code: "CART_PERSISTENCE_REJECTED",
        message: "Le diagnostic privé a identifié un refus du stockage du panier.",
        requestId,
        diagnostic,
      },
    }, { status: 503 });
  }
  return cartErrorResponse(
    "DATABASE_UNAVAILABLE",
    "Le panier est momentanément indisponible.",
    503,
  );
}

async function readSyntheticDemoGate(
  env: Env,
  now: string,
): Promise<SyntheticDemoGate> {
  const flagEnabled = env.PREPROD_DEMO_DATASET === SYNTHETIC_DEMO_FIXTURE_VERSION;
  let sentinel: { dataset_kind: string; fixture_version: string; expires_at: string } | null;
  try {
    sentinel = await env.DB.prepare(
      `SELECT dataset_kind, fixture_version, expires_at
      FROM preprod_demo_dataset WHERE singleton = 1`,
    ).first<{ dataset_kind: string; fixture_version: string; expires_at: string }>();
  } catch {
    return flagEnabled
      ? Object.freeze({ required: true, ready: false, reason: "sentinel-missing", latestMigration: null, expiresAt: null })
      : Object.freeze({ required: false, ready: false, reason: "flag-disabled", latestMigration: null, expiresAt: null });
  }
  if (!flagEnabled) {
    return Object.freeze({ required: true, ready: false, reason: "flag-disabled", latestMigration: null, expiresAt: sentinel?.expires_at ?? null });
  }
  if (!sentinel) {
    return Object.freeze({ required: true, ready: false, reason: "sentinel-missing", latestMigration: null, expiresAt: null });
  }
  if (
    sentinel.dataset_kind !== SYNTHETIC_DEMO_DATASET_KIND ||
    sentinel.fixture_version !== SYNTHETIC_DEMO_FIXTURE_VERSION ||
    sentinel.expires_at !== SYNTHETIC_DEMO_EXPIRES_AT
  ) {
    return Object.freeze({ required: true, ready: false, reason: "sentinel-invalid", latestMigration: null, expiresAt: sentinel.expires_at });
  }
  if (sentinel.expires_at <= now) {
    return Object.freeze({ required: true, ready: false, reason: "dataset-expired", latestMigration: null, expiresAt: sentinel.expires_at });
  }
  try {
    // Sites does not expose its internal migration ledger to the Worker.
    // Prove 0008 from its immutable sentinel plus its exhaustive guard
    // inventory, then prove 0009 through 0014 from exact schema inventories.
    // Any missing, renamed or prefix-colliding object keeps the runtime closed.
    const installed = await env.DB.prepare(
      `SELECT type, name, tbl_name AS table_name FROM sqlite_master
      WHERE (type = 'trigger' AND (
          lower(name) GLOB 'trg_preprod_demo_*'
          OR lower(name) GLOB 'trg_shipping_quote_parcel_snapshot_*'
          OR lower(name) GLOB 'trg_delivery_option_*'
          OR lower(name) GLOB 'trg_delivery_order_*'
          OR lower(name) GLOB 'trg_delivery_reference_*'
          OR lower(name) GLOB 'trg_delivery_service_point_*'
          OR lower(name) GLOB 'trg_shipping_document_*'
          OR lower(name) GLOB 'trg_late_payment_refund_*'
          OR lower(name) = 'trg_shipping_quote_provider_pricing_contract'
          OR lower(name) = 'trg_orders_provider_pricing_contract'
          OR lower(tbl_name) IN (
            'preprod_demo_dataset',
            'shipping_quote_parcel_snapshots',
            'delivery_option_snapshots',
            'delivery_provider_reference_vault',
            'delivery_service_point_snapshots',
            'shipping_document_metadata',
            'late_payment_refund_intents'
          )
        ))
        OR (type = 'table' AND (
          lower(name) GLOB 'preprod_demo_dataset*'
          OR lower(name) GLOB 'shipping_quote_parcel_snapshot*'
          OR lower(name) GLOB 'delivery_option_snapshot*'
          OR lower(name) GLOB 'delivery_provider_reference_vault*'
          OR lower(name) GLOB 'delivery_service_point_snapshot*'
          OR lower(name) GLOB 'shipping_document_metadata*'
          OR lower(name) GLOB 'late_payment_refund_intent*'
        ))
        OR (type = 'index' AND lower(name) NOT GLOB 'sqlite_autoindex_*' AND (
          lower(name) GLOB 'idx_delivery_*'
          OR lower(name) GLOB 'ux_delivery_*'
          OR lower(name) GLOB 'ux_shipping_document_*'
          OR lower(name) GLOB 'idx_late_payment_refund_*'
          OR lower(name) GLOB 'ux_late_payment_refund_*'
          OR lower(name) = 'ux_payments_order_active_checkout'
          OR lower(tbl_name) IN (
            'delivery_option_snapshots',
            'delivery_provider_reference_vault',
            'delivery_service_point_snapshots',
            'shipping_document_metadata',
            'late_payment_refund_intents'
          )
        ))
      ORDER BY type, name`,
    ).all<InstalledSchemaObject>();
    const syntheticTables = installed.results
      .filter((row) =>
        row.type === "table" &&
        row.name.toLowerCase().startsWith("preprod_demo_dataset")
      );
    const syntheticTriggers = installed.results
      .filter((row) =>
        row.type === "trigger" &&
        (row.name.toLowerCase().startsWith("trg_preprod_demo_") ||
          row.table_name.toLowerCase() === "preprod_demo_dataset")
      );
    if (
      !matchesExactSchemaInventory(
        syntheticTables,
        "table",
        SYNTHETIC_DEMO_TABLE_INVENTORY,
      ) ||
      !matchesExactSchemaInventory(
        syntheticTriggers,
        "trigger",
        SYNTHETIC_DEMO_TRIGGER_INVENTORY,
      )
    ) {
      return Object.freeze({
        required: true,
        ready: false,
        reason: "installation-proof-invalid",
        latestMigration: null,
        expiresAt: sentinel.expires_at,
      });
    }
    const parcelTables = installed.results
      .filter((row) =>
        row.type === "table" &&
        row.name.toLowerCase().startsWith("shipping_quote_parcel_snapshot")
      );
    const parcelTriggers = installed.results
      .filter((row) =>
        row.type === "trigger" &&
        (row.name.toLowerCase().startsWith(
          "trg_shipping_quote_parcel_snapshot_",
        ) || row.table_name.toLowerCase() ===
          "shipping_quote_parcel_snapshots")
      );
    if (
      !matchesExactSchemaInventory(
        parcelTables,
        "table",
        SHIPPING_PARCEL_TABLE_INVENTORY,
      ) ||
      !matchesExactSchemaInventory(
        parcelTriggers,
        "trigger",
        SHIPPING_PARCEL_TRIGGER_INVENTORY,
      )
    ) {
      return Object.freeze({
        required: true,
        ready: false,
        reason: "installation-proof-invalid",
        latestMigration: SYNTHETIC_DEMO_MIGRATION,
        expiresAt: sentinel.expires_at,
      });
    }
    const multicarrierTables = installed.results
      .filter((row) => row.type === "table" && (
        row.name.toLowerCase().startsWith("delivery_option_snapshot") ||
        row.name.toLowerCase().startsWith("delivery_provider_reference_vault") ||
        row.name.toLowerCase().startsWith("delivery_service_point_snapshot") ||
        row.name.toLowerCase().startsWith("shipping_document_metadata")
      ));
    const multicarrierTriggers = installed.results
      .filter((row) => row.type === "trigger" && (
        row.name.toLowerCase().startsWith("trg_delivery_option_") ||
        row.name.toLowerCase().startsWith("trg_delivery_order_") ||
        row.name.toLowerCase().startsWith("trg_delivery_reference_") ||
        row.name.toLowerCase().startsWith("trg_delivery_service_point_") ||
        row.name.toLowerCase().startsWith("trg_shipping_document_") ||
        row.name.toLowerCase() ===
          "trg_shipping_quote_provider_pricing_contract" ||
        row.name.toLowerCase() === "trg_orders_provider_pricing_contract" ||
        Object.hasOwn(
          MULTICARRIER_TABLE_INVENTORY,
          row.table_name.toLowerCase(),
        )
      ));
    const multicarrierIndexes = installed.results
      .filter((row) => row.type === "index" && (
        row.name.toLowerCase().startsWith("idx_delivery_") ||
        row.name.toLowerCase().startsWith("ux_delivery_") ||
        row.name.toLowerCase().startsWith("ux_shipping_document_") ||
        Object.hasOwn(MULTICARRIER_TABLE_INVENTORY, row.table_name.toLowerCase())
      ));
    if (
      !matchesExactSchemaInventory(
        multicarrierTables,
        "table",
        MULTICARRIER_TABLE_INVENTORY,
      ) ||
      !matchesExactSchemaInventory(
        multicarrierIndexes,
        "index",
        MULTICARRIER_INDEX_INVENTORY,
      ) ||
      !matchesExactSchemaInventory(
        multicarrierTriggers,
        "trigger",
        MULTICARRIER_TRIGGER_INVENTORY,
      )
    ) {
      return Object.freeze({
        required: true,
        ready: false,
        reason: "installation-proof-invalid",
        latestMigration: CLIENT_VALIDATED_PARCEL_MIGRATION,
        expiresAt: sentinel.expires_at,
      });
    }
    const latePaymentRefundTables = installed.results.filter((row) =>
      row.type === "table" &&
      row.name.toLowerCase().startsWith("late_payment_refund_intent")
    );
    const latePaymentRefundIndexes = installed.results.filter((row) =>
      row.type === "index" &&
      (row.name.toLowerCase().includes("late_payment_refund") ||
        row.name.toLowerCase() === "ux_payments_order_active_checkout")
    );
    const latePaymentRefundTriggers = installed.results.filter((row) =>
      row.type === "trigger" &&
      row.name.toLowerCase().startsWith("trg_late_payment_refund_")
    );
    if (
      !matchesExactSchemaInventory(
        latePaymentRefundTables,
        "table",
        LATE_PAYMENT_REFUND_TABLE_INVENTORY,
      ) ||
      !matchesExactSchemaInventory(
        latePaymentRefundIndexes,
        "index",
        LATE_PAYMENT_REFUND_INDEX_INVENTORY,
      ) ||
      !matchesExactSchemaInventory(
        latePaymentRefundTriggers,
        "trigger",
        LATE_PAYMENT_REFUND_TRIGGER_INVENTORY,
      )
    ) {
      return Object.freeze({
        required: true,
        ready: false,
        reason: "installation-proof-invalid",
        latestMigration: PROVIDER_PRICED_DELIVERY_MIGRATION,
        expiresAt: sentinel.expires_at,
      });
    }
    return Object.freeze({
      required: true,
      ready: true,
      reason: "ready",
      latestMigration: LATE_PAYMENT_REFUND_MIGRATION,
      expiresAt: sentinel.expires_at,
    });
  } catch {
    return Object.freeze({ required: true, ready: false, reason: "database-unavailable", latestMigration: null, expiresAt: sentinel?.expires_at ?? null });
  }
}

// These limits are a private-preproduction circuit breaker, not a public
// anti-bot control. A public launch still requires a separately approved edge
// rate-limit/Turnstile gate and production-sized capacity settings.

type CartSession = Readonly<{ cartId: string; addressProofKey: string }>;

type PublicShippingCartSnapshot = Readonly<{
  status: "open";
  currency: "EUR";
  expiresAt: string;
  itemCount: number;
  subtotalCents: number;
  lines: readonly Readonly<Omit<PublicCartSnapshot["lines"][number], "stockState">>[];
}>;

function jsonResponse(
  value: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return Response.json(value, { ...init, headers });
}

function cartErrorResponse(
  code: string,
  message: string,
  status: number,
  headers?: HeadersInit,
): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
        requestId: `req_${crypto.randomUUID()}`,
      },
    },
    { status, headers },
  );
}

function emptyCartResponse(): Response {
  return jsonResponse({
    data: {
      status: "empty",
      currency: "EUR",
      expiresAt: null,
      itemCount: 0,
      subtotalCents: 0,
      lines: [],
    },
  });
}

function cookieValues(request: Request, name: string): string[] {
  const header = request.headers.get("Cookie");
  if (!header) return [];
  return header.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) return [];
    return [part.slice(separator + 1).trim()];
  });
}

async function readCartSession(request: Request): Promise<CartSession | null> {
  const values = cookieValues(request, "__Host-aj_cart");
  if (values.length === 0) return null;
  const csrfValues = cookieValues(request, "__Host-aj_cart_csrf");
  if (
    values.length !== 1 ||
    csrfValues.length !== 1 ||
    !isOpaqueAccessToken(values[0]) ||
    !isOpaqueAccessToken(csrfValues[0])
  ) {
    throw new CommerceError("INVALID_INPUT", "The cart session is invalid.");
  }
  const tokenHash = await hashOneTimeAccessToken(
    `${values[0]}:${csrfValues[0]}`,
    accessTokenHashContexts.cartSession,
  );
  return Object.freeze({
    cartId: `cart_${tokenHash}`,
    // The raw opaque session token remains request-local and is never written
    // to D1. It keys address proofs so a database reader cannot guess them.
    addressProofKey: values[0],
  });
}

async function hmacSha256Hex(key: string, value: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function clearCartCookieHeaders(): Headers {
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie("cart"));
  headers.append("Set-Cookie", clearCsrfCookie("cart"));
  return headers;
}

function mutationOriginIsTrusted(request: Request, env: Env): boolean {
  return (
    typeof env.PREPROD_ORIGIN === "string" &&
    request.headers.get("Sec-Fetch-Site") === "same-origin" &&
    isTrustedMutationOrigin(request.headers.get("Origin"), [env.PREPROD_ORIGIN])
  );
}

function mutationIsAuthorized(request: Request, env: Env): boolean {
  const csrfValues = cookieValues(request, "__Host-aj_cart_csrf");
  return (
    csrfValues.length === 1 &&
    authorizeBrowserMutation({
      method: request.method,
      origin: request.headers.get("Origin"),
      secFetchSite: request.headers.get("Sec-Fetch-Site"),
      allowedOrigins: [env.PREPROD_ORIGIN ?? ""],
      csrfCookieToken: csrfValues[0],
      csrfHeaderToken: request.headers.get("X-CSRF-Token"),
    })
  );
}

async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const contentEncoding = request.headers.get("Content-Encoding");
  const declaredLength = request.headers.get("Content-Length");
  if (
    (contentEncoding !== null && contentEncoding.toLowerCase() !== "identity") ||
    (declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes))
  ) {
    try {
      await request.body?.cancel();
    } catch {
      // The request is rejected regardless of transport cancellation support.
    }
    return null;
  }

  if (!request.body) return new Uint8Array();
  const body = new Uint8Array(maxBytes);
  const reader = request.body.getReader();
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.byteLength > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size gate already rejected the request.
        }
        return null;
      }
      body.set(value, length);
      length += value.byteLength;
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // A broken request body is invalid whether cancellation succeeds or not.
    }
    return null;
  } finally {
    reader.releaseLock();
  }
  return body.slice(0, length);
}

async function requireEmptyBody(request: Request): Promise<boolean> {
  const body = await readBoundedBody(request, 0);
  return body !== null && body.byteLength === 0;
}

async function parseCartQuantity(request: Request): Promise<number | null> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim();
  if (contentType !== "application/json") return null;

  let body: unknown;
  try {
    const bytes = await readBoundedBody(request, 1024);
    if (bytes === null) return null;
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.getPrototypeOf(body) !== Object.prototype ||
    Object.keys(body).length !== 1 ||
    !("quantity" in body)
  ) {
    return null;
  }
  const quantity = (body as { quantity?: unknown }).quantity;
  return Number.isSafeInteger(quantity) &&
    (quantity as number) >= 1 &&
    (quantity as number) <= CART_MAX_QUANTITY
    ? (quantity as number)
    : null;
}

function mapCartError(error: unknown): Response {
  if (!(error instanceof CommerceError)) {
    return cartErrorResponse(
      "DATABASE_UNAVAILABLE",
      "Le panier est momentanément indisponible.",
      503,
    );
  }
  switch (error.code) {
    case "CART_NOT_FOUND":
      return cartErrorResponse(
        "CART_SESSION_INVALID",
        "Le panier n’est plus disponible.",
        401,
        clearCartCookieHeaders(),
      );
    case "CART_CLOSED":
      return cartErrorResponse(
        "CART_CLOSED",
        "Le panier est fermé.",
        409,
        clearCartCookieHeaders(),
      );
    case "CART_EXPIRED":
      return cartErrorResponse(
        "CART_EXPIRED",
        "Le panier a expiré.",
        409,
        clearCartCookieHeaders(),
      );
    case "VARIANT_NOT_FOUND":
      return cartErrorResponse(
        "VARIANT_NOT_FOUND",
        "Cette variante n’est pas disponible.",
        404,
      );
    case "STOCK_UNAVAILABLE":
      return cartErrorResponse(
        "OUT_OF_STOCK",
        "La quantité demandée n’est pas disponible.",
        409,
      );
    case "INVALID_INPUT":
      return cartErrorResponse(
        "CART_SESSION_INVALID",
        "La session panier est invalide.",
        401,
        clearCartCookieHeaders(),
      );
    default:
      return cartErrorResponse(
        "CART_CONFLICT",
        "Le panier ne peut pas être modifié.",
        409,
      );
  }
}

type ShippingQuoteAddressBody = Readonly<{
  address: ShippingAddressInput;
}>;

type CartQuoteReadiness = Readonly<{
  revision: number;
  insufficientCount: number;
  lineCount: number;
  itemCount: number;
}>;

function shippingQuoteErrorResponse(
  code: string,
  message: string,
  status: number,
  headers?: HeadersInit,
): Response {
  return cartErrorResponse(code, message, status, headers);
}

function exactObjectKeys(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  return keys.every(
    (key) => typeof key === "string" && allowedKeys.has(key),
  );
}

async function parseShippingQuoteBody(
  request: Request,
): Promise<
  | Readonly<{ ok: true; value: ShippingQuoteAddressBody }>
  | Readonly<{ ok: false; code: "BODY_TOO_LARGE" | "INVALID_JSON" }>
> {
  const declaredLength = request.headers.get("Content-Length");
  if (
    declaredLength !== null &&
    (/^\d+$/.test(declaredLength) === false ||
      Number(declaredLength) > SHIPPING_QUOTE_BODY_MAX_BYTES)
  ) {
    try {
      await request.body?.cancel();
    } catch {
      // The size gate is authoritative even when transport cancellation fails.
    }
    return Object.freeze({ ok: false, code: "BODY_TOO_LARGE" });
  }
  const contentType = request.headers.get("Content-Type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  const contentEncoding = request.headers.get("Content-Encoding");
  if (
    contentType !== "application/json" ||
    (contentEncoding !== null && contentEncoding.toLowerCase() !== "identity")
  ) {
    try {
      await request.body?.cancel();
    } catch {
      // Invalid content metadata is rejected regardless of cancellation support.
    }
    return Object.freeze({ ok: false, code: "INVALID_JSON" });
  }

  const bytes = await readBoundedBody(request, SHIPPING_QUOTE_BODY_MAX_BYTES);
  if (bytes === null) {
    return Object.freeze({ ok: false, code: "BODY_TOO_LARGE" });
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return Object.freeze({ ok: false, code: "INVALID_JSON" });
  }
  if (
    !exactObjectKeys(body, new Set(["address"])) ||
    Object.keys(body).length !== 1 ||
    !("address" in body)
  ) {
    return Object.freeze({ ok: false, code: "INVALID_JSON" });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({ address: body.address as ShippingAddressInput }),
  });
}

async function getCartQuoteReadiness(
  database: CommerceD1Database,
  cartId: string,
): Promise<CartQuoteReadiness | null> {
  const row = await database
    .prepare(
      `SELECT cart.fulfillment_revision AS revision,
        COUNT(line.id) AS line_count,
        COALESCE(SUM(line.quantity), 0) AS item_count,
        COALESCE(SUM(CASE
          WHEN stock.physical_quantity - stock.gift_reserve_quantity
            - stock.safety_reserve_quantity - stock.active_reserved_quantity
            - stock.sold_quantity < line.quantity THEN 1 ELSE 0 END), 0)
          AS insufficient_count
      FROM carts AS cart
      LEFT JOIN cart_lines AS line ON line.cart_id = cart.id
      LEFT JOIN inventory AS stock ON stock.variant_id = line.variant_id
      WHERE cart.id = ?
      GROUP BY cart.id`,
    )
    .bind(cartId)
    .first<{
      revision: number;
      line_count: number;
      item_count: number;
      insufficient_count: number;
    }>();
  if (!row) return null;
  return Object.freeze({
    revision: Number(row.revision),
    lineCount: Number(row.line_count),
    itemCount: Number(row.item_count),
    insufficientCount: Number(row.insufficient_count),
  });
}

function mapShippingQuoteError(error: unknown): Response {
  if (error instanceof CommerceError) {
    switch (error.code) {
      case "CART_NOT_FOUND":
        return shippingQuoteErrorResponse(
          "CART_NOT_FOUND",
          "Le panier n’est plus disponible.",
          401,
          clearCartCookieHeaders(),
        );
      case "CART_EXPIRED":
        return shippingQuoteErrorResponse(
          "CART_EXPIRED",
          "Le panier a expiré.",
          409,
          clearCartCookieHeaders(),
        );
      case "CART_CLOSED":
        return shippingQuoteErrorResponse(
          "CART_CHANGED",
          "Le panier a changé. Actualisez avant de continuer.",
          409,
        );
      case "STOCK_UNAVAILABLE":
        return shippingQuoteErrorResponse(
          "OUT_OF_STOCK",
          "Un article n’est plus disponible dans la quantité demandée.",
          409,
        );
      default:
        return shippingQuoteErrorResponse(
          "INTERNAL_ERROR",
          "Le devis de livraison est momentanément indisponible.",
          503,
        );
    }
  }
  if (error instanceof FulfillmentError) {
    switch (error.code) {
      case "INVALID_INPUT":
        return shippingQuoteErrorResponse(
          "INVALID_ADDRESS",
          "L’adresse de livraison est invalide.",
          400,
        );
      case "DESTINATION_UNAVAILABLE":
        return shippingQuoteErrorResponse(
          "DESTINATION_UNAVAILABLE",
          "Cette destination n’est pas disponible au lancement.",
          422,
        );
      case "CONFIGURATION_UNAVAILABLE":
      case "DEPENDENCY_UNAVAILABLE":
        return shippingQuoteErrorResponse(
          "CONFIGURATION_UNAVAILABLE",
          "Les tarifs de livraison ne sont pas encore configurés.",
          503,
        );
      case "QUOTE_MISMATCH":
        return shippingQuoteErrorResponse(
          "IDEMPOTENCY_CONFLICT",
          "Cette tentative ne correspond plus au même devis.",
          409,
        );
      case "QUOTE_EXPIRED":
        return shippingQuoteErrorResponse(
          "CART_CHANGED",
          "Le devis a expiré. Demandez un nouveau tarif.",
          409,
        );
      default:
        return shippingQuoteErrorResponse(
          "INTERNAL_ERROR",
          "Le devis de livraison est momentanément indisponible.",
          503,
        );
    }
  }
  return shippingQuoteErrorResponse(
    "INTERNAL_ERROR",
    "Le devis de livraison est momentanément indisponible.",
    503,
  );
}

function publicShippingQuoteResponse(
  quote: Readonly<{
    id: string;
    amount_cents: number;
    currency: "EUR";
    estimated_days_min: number;
    estimated_days_max: number;
    duties_terms: "EU_INCLUDED" | "DAP" | "DDP";
    expires_at: string;
  }>,
  zone: "EU" | "UK" | "US" | "CA",
  cart: PublicCartSnapshot,
  parcel: ShippingQuoteParcelSnapshotRow,
): Response {
  const stableCart: PublicShippingCartSnapshot = Object.freeze({
    status: cart.status,
    currency: cart.currency,
    expiresAt: cart.expiresAt,
    itemCount: cart.itemCount,
    subtotalCents: cart.subtotalCents,
    lines: Object.freeze(cart.lines.map((line) => Object.freeze({
      variantId: line.variantId,
      productId: line.productId,
      productSlug: line.productSlug,
      colorKey: line.colorKey,
      colorName: line.colorName,
      size: line.size,
      imageUrl: line.imageUrl,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
    }))),
  });
  return jsonResponse({
    data: {
      quoteId: quote.id,
      simulation: true,
      carrierConnected: false,
      zone,
      amountCents: quote.amount_cents,
      currency: quote.currency,
      estimatedDaysMin: quote.estimated_days_min,
      estimatedDaysMax: quote.estimated_days_max,
      dutiesTerms: quote.duties_terms,
      expiresAt: quote.expires_at,
      parcel: {
        profileCode: parcel.profile_code,
        itemCount: parcel.item_count,
        weightGrams: parcel.weight_grams,
        lengthCm: parcel.length_mm / 10,
        widthCm: parcel.width_mm / 10,
        heightCm: parcel.height_mm / 10,
      },
      cart: stableCart,
    },
  });
}

function publicDeliveryOption(
  option: DeliveryOptionSnapshotRow,
  zone: "EU" | "UK" | "US" | "CA",
) {
  return Object.freeze({
    optionId: option.id,
    quoteId: option.shipping_quote_id,
    simulation: option.proof_kind === "synthetic_demo",
    providerConnected: false,
    provider: option.provider_code === "synthetic_demo"
      ? "not-connected"
      : option.provider_code,
    carrierCode: option.carrier_code,
    serviceCode: option.service_code,
    displayName: option.display_name,
    deliveryMode: option.delivery_mode,
    zone,
    amountCents: option.amount_cents,
    currency: option.currency,
    estimatedDaysMin: option.estimated_days_min,
    estimatedDaysMax: option.estimated_days_max,
    dutiesTerms: option.duties_terms,
    expiresAt: option.expires_at,
    selected: option.selected_at !== null,
  });
}

async function handleShippingQuoteApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const deliveryOptionsRequest = url.pathname === PREPROD_DELIVERY_OPTIONS_PATH;
  if (url.pathname !== PREPROD_SHIPPING_QUOTE_PATH && !deliveryOptionsRequest) {
    return null;
  }
  if (request.method !== "POST") {
    return shippingQuoteErrorResponse(
      "METHOD_NOT_ALLOWED",
      "Méthode non autorisée.",
      405,
      { Allow: "POST" },
    );
  }
  if (!mutationOriginIsTrusted(request, env)) {
    return shippingQuoteErrorResponse(
      "ORIGIN_REJECTED",
      "La requête n’est pas autorisée.",
      403,
    );
  }
  let session: CartSession | null;
  try {
    session = await readCartSession(request);
  } catch {
    return shippingQuoteErrorResponse(
      "CART_NOT_FOUND",
      "Le panier n’est plus disponible.",
      401,
      clearCartCookieHeaders(),
    );
  }
  if (!session) {
    return shippingQuoteErrorResponse(
      "CART_NOT_FOUND",
      "Le panier doit être initialisé.",
      401,
    );
  }
  if (!mutationIsAuthorized(request, env)) {
    return shippingQuoteErrorResponse(
      "CSRF_REJECTED",
      "La requête n’est pas autorisée.",
      403,
    );
  }
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (
    idempotencyKey === null ||
    !SHIPPING_QUOTE_IDEMPOTENCY_PATTERN.test(idempotencyKey)
  ) {
    return shippingQuoteErrorResponse(
      "IDEMPOTENCY_CONFLICT",
      "Une clé de tentative valide est requise.",
      409,
    );
  }
  const parsedBody = await parseShippingQuoteBody(request);
  if (!parsedBody.ok) {
    return shippingQuoteErrorResponse(
      parsedBody.code,
      parsedBody.code === "BODY_TOO_LARGE"
        ? "Le formulaire de livraison est trop volumineux."
        : "Le formulaire de livraison est invalide.",
      parsedBody.code === "BODY_TOO_LARGE" ? 413 : 400,
    );
  }

  const commerce = new D1CommerceStore(env.DB);
  const fulfillment = new D1FulfillmentStore(env.DB);
  try {
    const now = new Date().toISOString();
    const [cart, normalizedAddress] = await Promise.all([
      commerce.getPublicCartSnapshot(session.cartId, now),
      normalizeShippingAddress(parsedBody.value.address),
    ]);
    if (env.PREPROD_DEMO_DATASET === SYNTHETIC_DEMO_FIXTURE_VERSION &&
      !isExactSyntheticDemoAddress(normalizedAddress.zone, normalizedAddress.canonicalJson)) {
      return shippingQuoteErrorResponse(
        "INVALID_ADDRESS",
        "Seules les quatre adresses fictives verrouillées sont acceptées.",
        400,
      );
    }
    if (cart.lines.length === 0) {
      return shippingQuoteErrorResponse(
        "CART_EMPTY",
        "Le panier est vide.",
        409,
      );
    }
    const readiness = await getCartQuoteReadiness(env.DB, session.cartId);
    if (!readiness || readiness.lineCount !== cart.lines.length) {
      return shippingQuoteErrorResponse(
        "CART_CHANGED",
        "Le panier a changé. Actualisez avant de continuer.",
        409,
      );
    }
    if (readiness.insufficientCount > 0) {
      return shippingQuoteErrorResponse(
        "OUT_OF_STOCK",
        "Un article n’est plus disponible dans la quantité demandée.",
        409,
      );
    }
    const parcelProfile = resolveClientValidatedParcelProfile(cart.lines);
    if (!parcelProfile) {
      return shippingQuoteErrorResponse(
        "PARCEL_CONFIGURATION_UNAVAILABLE",
        "Ce panier dépasse les profils colis validés. Limitez-le à trois articles.",
        422,
      );
    }
    if (
      readiness.itemCount !== cart.itemCount ||
      readiness.itemCount !== parcelProfile.itemCount
    ) {
      return shippingQuoteErrorResponse(
        "CART_CHANGED",
        "Le panier a changé. Actualisez avant de continuer.",
        409,
      );
    }

    const quoteId = `quote_${await sha256Hex(
      `${session.cartId}\u0000${idempotencyKey}`,
    )}`;
    const addressProofFingerprint = await hmacSha256Hex(
      session.addressProofKey,
      normalizedAddress.canonicalJson,
    );
    const existing = await fulfillment.getShippingQuote(quoteId);
    if (
      existing &&
      (existing.cart_id !== session.cartId ||
        existing.shipping_address_fingerprint !== addressProofFingerprint)
    ) {
      return shippingQuoteErrorResponse(
        "IDEMPOTENCY_CONFLICT",
        "Cette tentative ne correspond plus au même devis.",
        409,
      );
    }
    await fulfillment.purgeExpiredUnselectedShippingQuotes({
      expiredBefore: now,
      now,
    });
    if (existing && existing.cart_revision !== readiness.revision) {
      return shippingQuoteErrorResponse(
        "CART_CHANGED",
        "Le panier a changé. Demandez un nouveau devis.",
        409,
      );
    }
    if (existing && existing.expires_at <= now) {
      return shippingQuoteErrorResponse(
        "CART_CHANGED",
        "Le devis a expiré. Demandez un nouveau devis.",
        409,
      );
    }
    const expiresAt = existing?.expires_at ?? new Date(
      Math.min(
        Date.parse(now) + SHIPPING_QUOTE_TTL_MS,
        Date.parse(cart.expiresAt),
      ),
    ).toISOString();
    const quote = existing ?? await fulfillment.createShippingQuote({
        id: quoteId,
        cartId: session.cartId,
        address: parsedBody.value.address,
        addressFingerprint: addressProofFingerprint,
        parcelProfile,
        expiresAt,
        now,
      });
    const [verifiedCart, verifiedReadiness, parcelSnapshot] = await Promise.all([
      commerce.getPublicCartSnapshot(session.cartId, now),
      getCartQuoteReadiness(env.DB, session.cartId),
      fulfillment.getShippingQuoteParcelSnapshot(quote.id),
    ]);
    const verifiedParcelProfile = resolveClientValidatedParcelProfile(
      verifiedCart.lines,
    );
    if (
      !verifiedReadiness ||
      !verifiedParcelProfile ||
      verifiedReadiness.revision !== quote.cart_revision ||
      verifiedReadiness.insufficientCount > 0 ||
      verifiedReadiness.lineCount !== verifiedCart.lines.length ||
      verifiedReadiness.itemCount !== verifiedCart.itemCount ||
      verifiedParcelProfile.profileCode !== parcelProfile.profileCode ||
      !parcelSnapshot ||
      !parcelSnapshotMatchesProfile(parcelSnapshot, verifiedParcelProfile)
    ) {
      return shippingQuoteErrorResponse(
        verifiedReadiness?.insufficientCount
          ? "OUT_OF_STOCK"
          : "CART_CHANGED",
        verifiedReadiness?.insufficientCount
          ? "Un article n’est plus disponible dans la quantité demandée."
          : "Le panier a changé. Demandez un nouveau devis.",
        409,
      );
    }
    const option = await new D1DeliveryOptionsStore(env.DB).recordSyntheticOption({
      optionId: `option_${quote.id.slice("quote_".length)}`,
      cartId: session.cartId,
      quoteId: quote.id,
      cartRevision: quote.cart_revision,
      addressFingerprint: quote.shipping_address_fingerprint,
      amountCents: quote.amount_cents,
      estimatedDaysMin: quote.estimated_days_min,
      estimatedDaysMax: quote.estimated_days_max,
      dutiesTerms: quote.duties_terms,
      quotedAt: quote.created_at,
      expiresAt: quote.expires_at,
    });
    if (!deliveryOptionsRequest) {
      return publicShippingQuoteResponse(
        quote,
        normalizedAddress.zone,
        verifiedCart,
        parcelSnapshot,
      );
    }
    const legacy = await publicShippingQuoteResponse(
      quote,
      normalizedAddress.zone,
      verifiedCart,
      parcelSnapshot,
    ).json() as { data: { cart: unknown; parcel: unknown } };
    return jsonResponse({
      data: {
        simulation: true,
        connectorReady: deliveryProviderClosed.connectorReady,
        providerConnected: false,
        options: [publicDeliveryOption(option, normalizedAddress.zone)],
        parcel: legacy.data.parcel,
        cart: legacy.data.cart,
      },
    });
  } catch (error) {
    return mapShippingQuoteError(error);
  }
}

async function parseExactJsonBody(
  request: Request,
  keys: readonly string[],
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]
    .trim().toLowerCase();
  if (contentType !== "application/json") return null;
  const bytes = await readBoundedBody(request, SHIPPING_QUOTE_BODY_MAX_BYTES);
  if (!bytes) return null;
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!exactObjectKeys(body, new Set(keys)) || Object.keys(body).length !== keys.length) {
    return null;
  }
  return body;
}

function mapDeliveryOptionError(error: unknown): Response {
  if (error instanceof DeliveryOptionStoreError) {
    const status = error.code === "OPTION_NOT_FOUND" ? 404 : 409;
    return cartErrorResponse(error.code, "Cette option de livraison n'est plus disponible.", status);
  }
  if (error instanceof FulfillmentError) return mapShippingQuoteError(error);
  return cartErrorResponse(
    "DELIVERY_OPTION_UNAVAILABLE",
    "Les options de livraison sont momentanément indisponibles.",
    503,
  );
}

async function handleDeliveryOptionMutationApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const isSelect = url.pathname === PREPROD_DELIVERY_SELECT_PATH;
  const isServicePoints = url.pathname === PREPROD_DELIVERY_SERVICE_POINTS_PATH;
  if (!isSelect && !isServicePoints) return null;
  if (request.method !== "POST") {
    return cartErrorResponse("METHOD_NOT_ALLOWED", "Méthode non autorisée.", 405, { Allow: "POST" });
  }
  const authorized = await requireCheckoutMutation(request, env);
  if (authorized instanceof Response) return authorized;
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || !SHIPPING_QUOTE_IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    return cartErrorResponse("IDEMPOTENCY_CONFLICT", "Une clé de tentative valide est requise.", 409);
  }
  const body = await parseExactJsonBody(
    request,
    isSelect ? ["address", "optionId"] : ["optionId"],
  );
  if (!body || typeof body.optionId !== "string") {
    return cartErrorResponse("INVALID_BODY", "Le choix de livraison est invalide.", 400);
  }
  const store = new D1DeliveryOptionsStore(env.DB);
  try {
    const now = new Date().toISOString();
    if (isServicePoints) {
      return jsonResponse({
        data: {
          optionId: body.optionId,
          servicePoints: await store.servicePoints(
            body.optionId,
            authorized.cartId,
            now,
          ),
        },
      });
    }
    const normalized = await normalizeShippingAddress(body.address as ShippingAddressInput);
    if (
      env.PREPROD_DEMO_DATASET === SYNTHETIC_DEMO_FIXTURE_VERSION &&
      !isExactSyntheticDemoAddress(normalized.zone, normalized.canonicalJson)
    ) {
      return cartErrorResponse("INVALID_ADDRESS", "L'adresse de livraison a changé.", 400);
    }
    const addressFingerprint = await hmacSha256Hex(
      authorized.addressProofKey,
      normalized.canonicalJson,
    );
    const selected = await store.selectOption({
      optionId: body.optionId,
      cartId: authorized.cartId,
      addressFingerprint,
      now,
    });
    return jsonResponse({
      data: {
        optionId: selected.id,
        quoteId: selected.shipping_quote_id,
        validated: true,
        expiresAt: selected.expires_at,
      },
    });
  } catch (error) {
    return mapDeliveryOptionError(error);
  }
}

type CreateOrderBody = Readonly<{
  quoteId: string;
  address: ShippingAddressInput;
  email: string;
  termsAccepted: true;
  privacyAccepted: true;
  simulationAcknowledged: true;
}>;

async function parseCreateOrderBody(
  request: Request,
): Promise<CreateOrderBody | null> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]
    .trim().toLowerCase();
  if (contentType !== "application/json") return null;
  const bytes = await readBoundedBody(request, ORDER_BODY_MAX_BYTES);
  if (!bytes) return null;
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (
    !exactObjectKeys(body, new Set([
      "quoteId", "address", "email", "termsAccepted", "privacyAccepted",
      "simulationAcknowledged",
    ])) ||
    Object.keys(body).length !== 6 ||
    typeof body.quoteId !== "string" ||
    typeof body.email !== "string" ||
    body.termsAccepted !== true || body.privacyAccepted !== true ||
    body.simulationAcknowledged !== true
  ) return null;
  return Object.freeze({
    quoteId: body.quoteId,
    address: body.address as ShippingAddressInput,
    email: body.email,
    termsAccepted: true,
    privacyAccepted: true,
    simulationAcknowledged: true,
  });
}

function mapCheckoutError(error: unknown): Response {
  if (!(error instanceof PreprodCheckoutError)) {
    return cartErrorResponse(
      "CHECKOUT_UNAVAILABLE",
      "La simulation de commande est momentanément indisponible.",
      503,
    );
  }
  switch (error.code) {
    case "INVALID_INPUT":
      return cartErrorResponse("INVALID_BODY", "Le formulaire est invalide.", 400);
    case "ORDER_NOT_FOUND":
      return cartErrorResponse("ORDER_NOT_FOUND", "Aucune commande de test n’est liée à cette session.", 404);
    case "ORDER_EXPIRED":
      return cartErrorResponse("ORDER_EXPIRED", "La réservation de stock a expiré.", 409);
    case "ORDER_CONFLICT":
    case "PAYMENT_CONFLICT":
      return cartErrorResponse("IDEMPOTENCY_CONFLICT", "Cette tentative ne correspond pas au même parcours.", 409);
    default:
      return cartErrorResponse("CHECKOUT_UNAVAILABLE", "Le parcours reste fermé tant que ses prérequis ne sont pas validés.", 503);
  }
}

async function requireCheckoutMutation(
  request: Request,
  env: Env,
): Promise<CartSession | Response> {
  if (!mutationOriginIsTrusted(request, env) || !mutationIsAuthorized(request, env)) {
    return cartErrorResponse("REQUEST_REJECTED", "La requête n’est pas autorisée.", 403);
  }
  try {
    const session = await readCartSession(request);
    return session ?? cartErrorResponse("CART_NOT_FOUND", "Le panier doit être initialisé.", 401);
  } catch {
    return cartErrorResponse("CART_NOT_FOUND", "Le panier n’est plus disponible.", 401, clearCartCookieHeaders());
  }
}

async function handleOwnerAccountApi(
  request: Request,
  env: Env,
  url: URL,
  owner: PreprodOwner | null,
): Promise<Response | null> {
  if (
    url.pathname !== PREPROD_ACCOUNT_PATH &&
    url.pathname !== PREPROD_TRACKING_ADVANCE_PATH &&
    url.pathname !== PREPROD_DIAGNOSTICS_PATH
  ) return null;

  const expectedMethod = url.pathname === PREPROD_TRACKING_ADVANCE_PATH
    ? "POST"
    : "GET";
  if (request.method !== expectedMethod) {
    return cartErrorResponse(
      "METHOD_NOT_ALLOWED",
      "Méthode non autorisée.",
      405,
      { Allow: expectedMethod },
    );
  }
  if (!owner) return jsonResponse({ error: "not-found" }, { status: 404 });
  if (url.pathname === PREPROD_DIAGNOSTICS_PATH) {
    try {
      const [clock, carts] = await Promise.all([
        env.DB.prepare(
          `SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS database_now,
            fixture_version, expires_at
          FROM preprod_demo_dataset WHERE singleton = 1`,
        ).first<{
          database_now: string;
          fixture_version: string;
          expires_at: string;
        }>(),
        env.DB.prepare(
          `SELECT
            SUM(CASE WHEN status = 'open' AND expires_at >
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 ELSE 0 END)
              AS active_count,
            SUM(CASE WHEN created_at >=
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')
              THEN 1 ELSE 0 END) AS recent_count
          FROM carts`,
        ).first<{ active_count: number | null; recent_count: number | null }>(),
      ]);
      if (!clock || !carts) throw new Error("diagnostic-unavailable");
      return jsonResponse({ data: {
        status: "ready",
        environment: "preproduction",
        database: "reachable",
        ownerAccess: "recognized",
        dataset: {
          fixtureVersion: clock.fixture_version,
          databaseNow: clock.database_now,
          expiresAt: clock.expires_at,
          active: clock.expires_at > clock.database_now,
        },
        cartCapacity: {
          active: carts.active_count ?? 0,
          activeLimit: CART_MAX_ACTIVE_SESSIONS,
          createdLastMinute: carts.recent_count ?? 0,
          perMinuteLimit: CART_MAX_CREATIONS_PER_MINUTE,
        },
        simulation: {
          account: true,
          order: true,
          payment: true,
          tracking: true,
          emailSent: false,
          externalCarrierContacted: false,
          parcelSent: false,
        },
      } });
    } catch {
      return cartErrorResponse(
        "DIAGNOSTICS_UNAVAILABLE",
        "Le diagnostic privé est indisponible.",
        503,
      );
    }
  }
  const store = new D1PreprodOwnerDemoStore(env.DB, env.APP_ENV);
  try {
    if (url.pathname === PREPROD_ACCOUNT_PATH) {
      return jsonResponse({ data: await store.readAccount(owner) });
    }
    const authorized = await requireCheckoutMutation(request, env);
    if (authorized instanceof Response) return authorized;
    if (!(await requireEmptyBody(request))) {
      return cartErrorResponse(
        "INVALID_BODY",
        "Le corps doit être strictement vide.",
        400,
      );
    }
    return jsonResponse({
      data: await store.advanceCurrentOrder(
        owner,
        authorized.cartId,
        new Date().toISOString(),
      ),
    });
  } catch {
    return cartErrorResponse(
      "ACCOUNT_SIMULATION_UNAVAILABLE",
      "L’espace client de démonstration est momentanément indisponible.",
      503,
    );
  }
}

async function handleOrderPaymentApi(
  request: Request,
  env: Env,
  url: URL,
  prevalidatedOwner: PreprodOwner | null,
): Promise<Response | null> {
  if (
    url.pathname !== PREPROD_ORDER_PATH &&
    url.pathname !== PREPROD_CURRENT_ORDER_PATH &&
    url.pathname !== PREPROD_TEST_PAYMENT_PATH
  ) {
    return null;
  }
  const store = new D1PreprodCheckoutStore(env.DB);
  if (url.pathname === PREPROD_CURRENT_ORDER_PATH && request.method === "GET") {
    let session: CartSession | null;
    try {
      session = await readCartSession(request);
    } catch {
      return cartErrorResponse("CART_NOT_FOUND", "Le panier n’est plus disponible.", 401, clearCartCookieHeaders());
    }
    if (!session) return jsonResponse({ data: null });
    try {
      return jsonResponse({ data: await store.getCurrentOrder(session.cartId) });
    } catch (error) {
      return mapCheckoutError(error);
    }
  }
  if (
    (url.pathname === PREPROD_ORDER_PATH && request.method !== "POST") ||
    (url.pathname === PREPROD_CURRENT_ORDER_PATH && request.method !== "GET") ||
    (url.pathname === PREPROD_TEST_PAYMENT_PATH && request.method !== "POST")
  ) {
    return cartErrorResponse("METHOD_NOT_ALLOWED", "Méthode non autorisée.", 405, { Allow: url.pathname === PREPROD_CURRENT_ORDER_PATH ? "GET" : "POST" });
  }
  const authorized = await requireCheckoutMutation(request, env);
  if (authorized instanceof Response) return authorized;
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || !SHIPPING_QUOTE_IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    return cartErrorResponse("IDEMPOTENCY_CONFLICT", "Une clé de tentative valide est requise.", 409);
  }
  try {
    if (url.pathname === PREPROD_ORDER_PATH) {
      const owner = prevalidatedOwner ?? await readPreprodOwner(request, env);
      const ownerRequired = typeof env.PREPROD_OWNER_EMAIL === "string" &&
        env.PREPROD_OWNER_EMAIL.trim().length > 0;
      if (ownerRequired && !owner) {
        return cartErrorResponse(
          "OWNER_ACCESS_REQUIRED",
          "La commande de démonstration est réservée au compte propriétaire.",
          403,
        );
      }
      const body = await parseCreateOrderBody(request);
      if (!body) return cartErrorResponse("INVALID_BODY", "Le formulaire est invalide ou trop volumineux.", 400);
      const normalizedAddress = await normalizeShippingAddress(body.address);
      if (env.PREPROD_DEMO_DATASET === SYNTHETIC_DEMO_FIXTURE_VERSION &&
        !isExactSyntheticDemoAddress(normalizedAddress.zone, normalizedAddress.canonicalJson)) {
        return cartErrorResponse(
          "INVALID_ADDRESS",
          "Seules les quatre adresses fictives verrouillées sont acceptées.",
          400,
        );
      }
      if (
        env.PREPROD_DEMO_DATASET === SYNTHETIC_DEMO_FIXTURE_VERSION &&
        body.email.trim().toLowerCase() !== SYNTHETIC_DEMO_EMAIL
      ) {
        return cartErrorResponse(
          "INVALID_BODY",
          "Seule l’adresse e-mail fictive verrouillée est acceptée.",
          400,
        );
      }
      const addressFingerprint = await hmacSha256Hex(
        authorized.addressProofKey,
        normalizedAddress.canonicalJson,
      );
      const now = new Date().toISOString();
      if (owner) {
        await new D1PreprodOwnerDemoStore(env.DB, env.APP_ENV)
          .ensureOwner(owner, now);
      }
      return jsonResponse({
        data: await store.createOrder({
          cartId: authorized.cartId,
          quoteId: body.quoteId,
          addressJson: normalizedAddress.canonicalJson,
          addressFingerprint,
          countryCode: normalizedAddress.address.countryCode,
          email: body.email,
          customerId: owner?.customerId ?? null,
          idempotencyKey,
          termsVersion: LEGAL_VERSION,
          privacyVersion: LEGAL_VERSION,
          now,
        }),
      });
    }
    if (!(await requireEmptyBody(request))) {
      return cartErrorResponse("INVALID_BODY", "Le corps doit être strictement vide.", 400);
    }
    const prepared = await store.prepareTestPayment({
      cartId: authorized.cartId,
      idempotencyKey,
      requestedAt: new Date().toISOString(),
    });
    if (!("claims" in prepared)) return jsonResponse({ data: prepared });
    const verified = verifyPreprodTestPaymentEvent(env.APP_ENV, prepared.claims);
    return jsonResponse({ data: await store.completeTestPayment(prepared, verified) });
  } catch (error) {
    if (error instanceof FulfillmentError) return mapShippingQuoteError(error);
    return mapCheckoutError(error);
  }
}

async function handleCartApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const isCartPath = url.pathname === PREPROD_CART_PATH;
  const lineMatch = PREPROD_CART_LINE_PATTERN.exec(url.pathname);
  if (!isCartPath && !lineMatch) return null;

  const allowedMethods = isCartPath ? "GET, POST" : "PUT, DELETE";
  if (!allowedMethods.split(", ").includes(request.method)) {
    const headers = new Headers({ Allow: allowedMethods });
    return cartErrorResponse(
      "METHOD_NOT_ALLOWED",
      "Méthode non autorisée.",
      405,
      headers,
    );
  }

  const store = new D1CommerceStore(env.DB);
  let session: CartSession | null;
  try {
    session = await readCartSession(request);
  } catch (error) {
    return mapCartError(error);
  }

  if (isCartPath && request.method === "GET") {
    if (!session) return emptyCartResponse();
    try {
      return jsonResponse({
        data: await store.getPublicCartSnapshot(
          session.cartId,
          new Date().toISOString(),
        ),
      });
    } catch (error) {
      return mapCartError(error);
    }
  }

  if (
    typeof env.PREPROD_ORIGIN !== "string" ||
    env.PREPROD_ORIGIN.length === 0
  ) {
    return cartErrorResponse(
      "ORIGIN_NOT_CONFIGURED",
      "L’origine de préproduction n’est pas configurée.",
      503,
    );
  }
  if (!mutationOriginIsTrusted(request, env)) {
    return cartErrorResponse(
      "ORIGIN_REJECTED",
      "La requête n’est pas autorisée.",
      403,
    );
  }

  if (isCartPath && request.method === "POST") {
    if (!(await requireEmptyBody(request))) {
      return cartErrorResponse("INVALID_BODY", "Le corps doit être vide.", 400);
    }
    if (session) {
      if (!mutationIsAuthorized(request, env)) {
        return cartErrorResponse(
          "CSRF_REJECTED",
          "La requête n’est pas autorisée.",
          403,
        );
      }
      try {
        return jsonResponse({
          data: await store.getPublicCartSnapshot(
            session.cartId,
            new Date().toISOString(),
          ),
        });
      } catch (error) {
        return mapCartError(error);
      }
    }

    try {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + CART_MAX_AGE_SECONDS * 1000,
      ).toISOString();
      const [cartToken, csrfToken] = await Promise.all([
        createOpaqueAccessToken(accessTokenHashContexts.cartSession),
        createOpaqueAccessToken(accessTokenHashContexts.cartCsrf),
      ]);
      const cartId = `cart_${await hashOneTimeAccessToken(
        `${cartToken.token}:${csrfToken.token}`,
        accessTokenHashContexts.cartSession,
      )}`;
      const nowIso = now.toISOString();
      const minuteAgo = new Date(now.getTime() - 60_000).toISOString();
      const retentionCutoff = new Date(
        now.getTime() - CART_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const createCartStatement = () => env.DB
        .prepare(
          `INSERT INTO carts (
            id, customer_id, email, status, currency, expires_at,
            created_at, updated_at
          )
          SELECT ?, NULL, NULL, 'open', 'EUR', ?, ?, ?
          WHERE (
            SELECT COUNT(*) FROM carts
            WHERE length(id) = 69
              AND substr(id, 1, 5) = 'cart_'
              AND substr(id, 6) = lower(substr(id, 6))
              AND substr(id, 6) NOT GLOB '*[^0-9a-f]*'
              AND status = 'open' AND expires_at > ?
          ) < ? AND (
            SELECT COUNT(*) FROM carts
            WHERE length(id) = 69
              AND substr(id, 1, 5) = 'cart_'
              AND substr(id, 6) = lower(substr(id, 6))
              AND substr(id, 6) NOT GLOB '*[^0-9a-f]*'
              AND created_at >= ?
          ) < ?`,
        )
        .bind(
          cartId,
          expiresAt,
          nowIso,
          nowIso,
          nowIso,
          CART_MAX_ACTIVE_SESSIONS,
          minuteAgo,
          CART_MAX_CREATIONS_PER_MINUTE,
        );
      let created: CommerceD1Result<{ id: string }>;
      try {
        [, , , , created] = await env.DB.batch<[
        Record<string, never>,
        Record<string, never>,
        Record<string, never>,
        Record<string, never>,
        { id: string },
      ]>([
        env.DB
          .prepare(
            `DELETE FROM cart_lines WHERE cart_id IN (
              SELECT cart.id FROM carts AS cart
              WHERE length(cart.id) = 69
                AND substr(cart.id, 1, 5) = 'cart_'
                AND substr(cart.id, 6) = lower(substr(cart.id, 6))
                AND substr(cart.id, 6) NOT GLOB '*[^0-9a-f]*'
                AND cart.customer_id IS NULL AND cart.email IS NULL
                AND cart.status = 'expired' AND cart.expires_at <= ?
                AND NOT EXISTS (SELECT 1 FROM orders WHERE orders.cart_id = cart.id)
                AND NOT EXISTS (
                  SELECT 1 FROM stock_reservations
                  WHERE stock_reservations.cart_id = cart.id
                )
                AND NOT EXISTS (
                  SELECT 1 FROM shipping_quotes
                  WHERE shipping_quotes.cart_id = cart.id
                )
              ORDER BY cart.expires_at LIMIT 100
            )`,
          )
          .bind(retentionCutoff),
        env.DB
          .prepare(
            `DELETE FROM carts WHERE id IN (
              SELECT cart.id FROM carts AS cart
              WHERE length(cart.id) = 69
                AND substr(cart.id, 1, 5) = 'cart_'
                AND substr(cart.id, 6) = lower(substr(cart.id, 6))
                AND substr(cart.id, 6) NOT GLOB '*[^0-9a-f]*'
                AND cart.customer_id IS NULL AND cart.email IS NULL
                AND cart.status = 'expired' AND cart.expires_at <= ?
                AND NOT EXISTS (
                  SELECT 1 FROM cart_lines WHERE cart_lines.cart_id = cart.id
                )
                AND NOT EXISTS (SELECT 1 FROM orders WHERE orders.cart_id = cart.id)
                AND NOT EXISTS (
                  SELECT 1 FROM stock_reservations
                  WHERE stock_reservations.cart_id = cart.id
                )
                AND NOT EXISTS (
                  SELECT 1 FROM shipping_quotes
                  WHERE shipping_quotes.cart_id = cart.id
                )
              ORDER BY cart.expires_at LIMIT 100
            )`,
          )
          .bind(retentionCutoff),
        env.DB
          .prepare(
            `UPDATE carts SET status = 'expired', updated_at = ?
            WHERE length(id) = 69
              AND substr(id, 1, 5) = 'cart_'
              AND substr(id, 6) = lower(substr(id, 6))
              AND substr(id, 6) NOT GLOB '*[^0-9a-f]*'
              AND status = 'open' AND expires_at <= ?`,
          )
          .bind(nowIso, nowIso),
        createCartStatement(),
        env.DB.prepare("SELECT id FROM carts WHERE id = ?").bind(cartId),
      ]);
      } catch (maintenanceError) {
        // Cart availability must not depend on opportunistic retention work.
        // D1 still enforces the exact dataset, capacity and cart invariants on
        // this smaller atomic retry; no guard is bypassed.
        try {
          [, created] = await env.DB.batch<[
            Record<string, never>,
            { id: string },
          ]>([
            createCartStatement(),
            env.DB.prepare("SELECT id FROM carts WHERE id = ?").bind(cartId),
          ]);
        } catch (createError) {
          throw new Error(
            `${cartPersistenceDiagnostic(maintenanceError)};${cartPersistenceDiagnostic(createError)}`,
            { cause: createError },
          );
        }
      }
      if (!created.results[0]) {
        return cartErrorResponse(
          "CART_CAPACITY_REACHED",
          "Le panier est momentanément indisponible.",
          503,
          { "Retry-After": "60" },
        );
      }
      const headers = new Headers();
      headers.append(
        "Set-Cookie",
        buildSessionCookie("cart", cartToken.token, CART_MAX_AGE_SECONDS),
      );
      headers.append(
        "Set-Cookie",
        buildCsrfCookie("cart", csrfToken.token, CART_MAX_AGE_SECONDS),
      );
      return jsonResponse(
        { data: await store.getPublicCartSnapshot(cartId, nowIso) },
        { status: 201, headers },
      );
    } catch (error) {
      return ownerCartDiagnosticResponse(request, env, error);
    }
  }

  if (lineMatch && (request.method === "PUT" || request.method === "DELETE")) {
    if (!session) {
      return cartErrorResponse(
        "CART_SESSION_INVALID",
        "Le panier doit être initialisé.",
        401,
      );
    }
    if (!mutationIsAuthorized(request, env)) {
      return cartErrorResponse(
        "CSRF_REJECTED",
        "La requête n’est pas autorisée.",
        403,
      );
    }
    let variantId: string;
    try {
      variantId = decodeURIComponent(lineMatch[1]);
    } catch {
      return cartErrorResponse("INVALID_BODY", "La variante est invalide.", 400);
    }

    try {
      const now = new Date().toISOString();
      let snapshot;
      if (request.method === "PUT") {
        const quantity = await parseCartQuantity(request);
        if (quantity === null) {
          return cartErrorResponse(
            "INVALID_BODY",
            "La quantité doit être un entier compris entre 1 et 5.",
            400,
          );
        }
        snapshot = await store.setCartLineQuantity({
          cartId: session.cartId,
          variantId,
          quantity,
          now,
        });
      } else {
        if (!(await requireEmptyBody(request))) {
          return cartErrorResponse(
            "INVALID_BODY",
            "Le corps doit être vide.",
            400,
          );
        }
        snapshot = await store.removeCartLine({
          cartId: session.cartId,
          variantId,
          now,
        });
      }
      return jsonResponse({ data: snapshot });
    } catch (error) {
      if (error instanceof CommerceError && error.code === "INVALID_INPUT") {
        return cartErrorResponse(
          "INVALID_BODY",
          "La quantité doit être un entier compris entre 1 et 5.",
          400,
        );
      }
      return mapCartError(error);
    }
  }

  return null;
}

export async function preprodApiResponse(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREPROD_API_PREFIX)) return null;

  if (env?.APP_ENV !== "preproduction") {
    return jsonResponse({ error: "not-found" }, { status: 404 });
  }

  if (
    typeof env.PREPROD_ORIGIN !== "string" ||
    !isTrustedMutationOrigin(url.origin, [env.PREPROD_ORIGIN])
  ) {
    return jsonResponse({ error: "not-found" }, { status: 404 });
  }

  const ownerEndpoint =
    url.pathname === PREPROD_ACCOUNT_PATH ||
    url.pathname === PREPROD_TRACKING_ADVANCE_PATH ||
    url.pathname === PREPROD_DIAGNOSTICS_PATH;
  const ownerCheckout =
    url.pathname === PREPROD_ORDER_PATH &&
    request.method === "POST" &&
    typeof env.PREPROD_OWNER_EMAIL === "string" &&
    env.PREPROD_OWNER_EMAIL.trim().length > 0;
  // Owner-exclusive requests are rejected from authenticated edge headers
  // before the first D1 query. The configured address alone never grants
  // access and unauthorized callers cannot use these paths as DB oracles.
  const prevalidatedOwner = ownerEndpoint || ownerCheckout
    ? await readPreprodOwner(request, env)
    : null;
  if ((ownerEndpoint || ownerCheckout) && !prevalidatedOwner) {
    return jsonResponse({ error: "not-found" }, { status: 404 });
  }

  if (!env.DB) {
    if (url.pathname === `${PREPROD_API_PREFIX}health`) {
      logPreprodUnavailable(
        "preprod_health_unavailable",
        request,
        "preproduction-database-not-bound",
        null,
      );
    } else if (
      url.pathname === PREPROD_CART_PATH ||
      PREPROD_CART_LINE_PATTERN.test(url.pathname)
    ) {
      logPreprodUnavailable(
        "preprod_cart_gate_unavailable",
        request,
        "preproduction-database-not-bound",
        null,
      );
    }
    return jsonResponse(
      { status: "unavailable", reason: "preproduction-database-not-bound" },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  const syntheticGate = await readSyntheticDemoGate(env, now);

  if (url.pathname === `${PREPROD_API_PREFIX}health`) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method-not-allowed" }, { status: 405 });
    }
    return (async () => {
      const database = env.DB;
      const unavailable = (latestMigration: string | null, reason: string) => {
        logPreprodUnavailable(
          "preprod_health_unavailable",
          request,
          reason,
          latestMigration,
        );
        return jsonResponse({
          status: "unavailable",
          environment: "preproduction",
          capabilities: {
            catalog: false,
            cart: false,
            shippingQuotes: false,
            shippingQuoteZones: { EU: false, UK: false, US: false, CA: false },
            shippingQuoteSimulation: false,
            shippingQuoteSimulationZones: { EU: false, UK: false, US: false, CA: false },
            payment: false,
            orderCreation: false,
            reservesValidated: false,
            syntheticReservesReady: false,
            orderSimulation: false,
            paymentTestSimulation: false,
            emailCaptureSimulation: false,
            emailDelivery: false,
            carrier: false,
            stockSimulation: false,
            shippingSimulation: false,
            deliveryConnectorReady: false,
            deliveryProviderConnected: false,
            realShippingRates: false,
            realShippingLabels: false,
            deliveryLive: false,
            launchReadiness: false,
          },
          latestMigration,
          stockProjection: [],
          syntheticDataset: {
            active: false,
            reason,
            fixtureVersion: SYNTHETIC_DEMO_FIXTURE_VERSION,
            expiresAt: syntheticGate.expiresAt,
          },
        }, { status: 503 });
      };
      const latestMigration = syntheticGate.latestMigration;
      if (syntheticGate.required && !syntheticGate.ready) {
        return unavailable(latestMigration, syntheticGate.reason);
      }
      if (
        !syntheticGate.ready ||
        latestMigration !== LATE_PAYMENT_REFUND_MIGRATION
      ) {
        return unavailable(latestMigration, "installation-proof-invalid");
      }
      try {
        const [stock, shippingConfigurations, reserveValidation] = await Promise.all([
          database
            .prepare(
              `SELECT variant.id AS variant_id,
                stock.physical_quantity - stock.gift_reserve_quantity
                  - stock.safety_reserve_quantity - stock.active_reserved_quantity
                  - stock.sold_quantity AS available_to_sell
              FROM variants AS variant
              INNER JOIN inventory AS stock ON stock.variant_id = variant.id
              WHERE variant.color_key = ?
              ORDER BY variant.sort_order`,
            )
            .bind("rose")
            .all<{ variant_id: string; available_to_sell: number }>(),
          database
            .prepare(
              `SELECT zone FROM shipping_zone_configurations
              WHERE status = 'active'
              GROUP BY zone`,
            )
            .all<{ zone: string }>(),
          database
            .prepare(
              `SELECT COUNT(*) AS total,
                SUM(CASE WHEN reserves_validated = 1 THEN 1 ELSE 0 END) AS validated
              FROM inventory`,
            )
            .first<{ total: number; validated: number }>(),
        ]);
        const configuredZones = new Set(
          shippingConfigurations.results.map((row) => row.zone),
        );
        const shippingQuoteZones = Object.freeze({
          EU: configuredZones.has("EU"),
          UK: configuredZones.has("UK"),
          US: configuredZones.has("US"),
          CA: configuredZones.has("CA"),
        });
        const shippingQuotesReady = Object.values(shippingQuoteZones)
          .every(Boolean);
        const reservesReady = Boolean(
          reserveValidation && reserveValidation.total > 0 &&
          reserveValidation.total === reserveValidation.validated,
        );
        const sellableStockReady = stock.results.some(
          (position: { available_to_sell: number }) => position.available_to_sell > 0,
        );
        const testCheckoutReady = shippingQuotesReady && reservesReady &&
          sellableStockReady;
        return jsonResponse(
          {
            status: "partial",
            environment: "preproduction",
            capabilities: {
              catalog: true,
              cart: true,
              shippingQuotes: syntheticGate.required ? false : shippingQuotesReady,
              shippingQuoteZones: syntheticGate.required
                ? { EU: false, UK: false, US: false, CA: false }
                : shippingQuoteZones,
              shippingQuoteSimulation: syntheticGate.required && shippingQuotesReady,
              shippingQuoteSimulationZones: syntheticGate.required
                ? shippingQuoteZones
                : { EU: false, UK: false, US: false, CA: false },
              payment: false,
              reservesValidated: syntheticGate.required ? false : reservesReady,
              syntheticReservesReady: syntheticGate.required && reservesReady,
              orderCreation: syntheticGate.required ? false : testCheckoutReady,
              orderSimulation: syntheticGate.required && testCheckoutReady,
              paymentTestSimulation: testCheckoutReady,
              emailCaptureSimulation: testCheckoutReady,
              emailDelivery: false,
              carrier: false,
              stockSimulation: syntheticGate.required,
              shippingSimulation: syntheticGate.required,
              deliveryConnectorReady: deliveryProviderClosed.connectorReady,
              deliveryProviderConnected: deliveryProviderClosed.providerConnected,
              realShippingRates: deliveryProviderClosed.realRates,
              realShippingLabels: deliveryProviderClosed.realLabels,
              deliveryLive: deliveryProviderClosed.live,
              launchReadiness: false,
            },
            latestMigration,
            stockProjection: stock.results.map((position: {
              variant_id: string;
              available_to_sell: number;
            }) => ({
              variantId: position.variant_id,
              state: position.available_to_sell <= 0
                  ? "sold-out"
                  : position.available_to_sell <= 5
                    ? "low-stock"
                    : "available",
            })),
            syntheticDataset: {
              active: true,
              reason: "ready",
              fixtureVersion: SYNTHETIC_DEMO_FIXTURE_VERSION,
              expiresAt: syntheticGate.expiresAt,
            },
          },
          { status: 200 },
        );
      } catch {
        return unavailable(latestMigration, "readiness-query-failed");
      }
    })();
  }

  if (syntheticGate.required && !syntheticGate.ready) {
    if (
      url.pathname === PREPROD_CART_PATH ||
      PREPROD_CART_LINE_PATTERN.test(url.pathname)
    ) {
      logPreprodUnavailable(
        "preprod_cart_gate_unavailable",
        request,
        syntheticGate.reason,
        syntheticGate.latestMigration,
      );
    }
    return cartErrorResponse(
      "SYNTHETIC_DEMO_UNAVAILABLE",
      "La démonstration privée est fermée.",
      503,
      { "Retry-After": "60" },
    );
  }

  const accountResponse = await handleOwnerAccountApi(
    request,
    env,
    url,
    prevalidatedOwner,
  );
  if (accountResponse) return accountResponse;

  const orderPaymentResponse = await handleOrderPaymentApi(
    request,
    env,
    url,
    prevalidatedOwner,
  );
  if (orderPaymentResponse) return orderPaymentResponse;

  const deliveryOptionMutationResponse = await handleDeliveryOptionMutationApi(
    request,
    env,
    url,
  );
  if (deliveryOptionMutationResponse) return deliveryOptionMutationResponse;

  const shippingQuoteResponse = await handleShippingQuoteApi(request, env, url);
  if (shippingQuoteResponse) return shippingQuoteResponse;

  const cartResponse = await handleCartApi(request, env, url);
  if (cartResponse) return cartResponse;

  return jsonResponse({ error: "not-found" }, { status: 404 });
}

function withSecurityHeaders(
  response: Response,
  pathname: string,
  environment: string | undefined,
): Response {
  const headers = new Headers(response.headers);
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (environment === "production") {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  if (environment === "preproduction") {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  if (environment === "preproduction" && pathname.startsWith(PREPROD_API_PREFIX)) {
    headers.set("Cache-Control", "no-store");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

type ByteRange = {
  start: number;
  end: number;
};

function mediaAssetPath(pathname: string): string | null {
  if (!pathname.startsWith(MEDIA_ASSET_PREFIX)) return null;

  const relativePath = pathname.slice(MEDIA_ASSET_PREFIX.length);
  const root = relativePath.split("/", 1)[0];
  if (!root || !MEDIA_ASSET_ROOTS.has(root)) return null;

  return `/${relativePath}`;
}

function isStaticAsset(pathname: string): boolean {
  return (
    mediaAssetPath(pathname) !== null ||
    STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function contentTypeFor(pathname: string): string | null {
  if (pathname.endsWith(".avif")) return "image/avif";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  return null;
}

function localStaticPath(pathname: string): string {
  if (typeof process !== "undefined" && process.platform === "win32") {
    return `/${pathname.slice(1).replaceAll("/", "\\")}`;
  }

  return pathname;
}

function normalizedPathname(pathname: string): string {
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
}

function isCacheableHtmlRequest(request: Request): boolean {
  const pathname = normalizedPathname(new URL(request.url).pathname);
  const isPublicRoute =
    CACHEABLE_HTML_ROUTES.has(pathname) || pathname.startsWith("/products/");

  return (
    request.method === "GET" &&
    isPublicRoute &&
    (request.headers.get("Accept")?.includes("text/html") ?? false) &&
    !request.headers.has("Authorization") &&
    !request.headers.has("Cookie") &&
    !request.headers.has("RSC")
  );
}

function rewrittenAssetRequest(request: Request): Request {
  const url = new URL(request.url);
  const physicalPath = mediaAssetPath(url.pathname);
  if (!physicalPath) return request;

  url.pathname = physicalPath;
  return new Request(url, {
    method: request.method,
    headers: request.headers,
  });
}

function parseContentLength(response: Response): number | null {
  const rawLength = response.headers.get("Content-Length");
  if (!rawLength || !/^\d+$/.test(rawLength)) return null;

  const length = Number(rawLength);
  return Number.isSafeInteger(length) ? length : null;
}

function parseSingleByteRange(
  rangeHeader: string,
  totalLength: number,
): ByteRange | null {
  if (!Number.isSafeInteger(totalLength) || totalLength <= 0) return null;

  const match = /^bytes\s*=\s*(\d*)\s*-\s*(\d*)$/i.exec(
    rangeHeader.trim(),
  );
  if (!match || (!match[1] && !match[2])) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;

    return {
      start: Math.max(totalLength - suffixLength, 0),
      end: totalLength - 1,
    };
  }

  const start = Number(rawStart);
  if (!Number.isSafeInteger(start) || start >= totalLength) return null;

  if (!rawEnd) return { start, end: totalLength - 1 };

  const requestedEnd = Number(rawEnd);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return null;

  return { start, end: Math.min(requestedEnd, totalLength - 1) };
}

function rangeHeaders(
  response: Response,
  range: ByteRange | null,
  totalLength: number,
): Headers {
  const headers = new Headers(response.headers);
  headers.delete("Content-Encoding");
  headers.set("Accept-Ranges", "bytes");

  if (!range) {
    headers.set("Content-Range", `bytes */${totalLength}`);
    headers.set("Content-Length", "0");
    return headers;
  }

  headers.set(
    "Content-Range",
    `bytes ${range.start}-${range.end}/${totalLength}`,
  );
  headers.set("Content-Length", String(range.end - range.start + 1));
  return headers;
}

async function serveMp4Range(
  request: Request,
  assetRequest: Request,
  assets: Fetcher,
): Promise<Response> {
  const rangeHeader = request.headers.get("Range");
  if (!rangeHeader) return assets.fetch(assetRequest);

  const fullHeaders = new Headers(assetRequest.headers);
  fullHeaders.delete("Range");
  let fullResponse = await assets.fetch(
    new Request(assetRequest.url, {
      method: request.method,
      headers: fullHeaders,
    }),
  );
  if (!fullResponse.ok) return fullResponse;

  let totalLength = parseContentLength(fullResponse);
  let fullBytes: ArrayBuffer | null = null;

  if (request.method === "GET") {
    const fetchedBytes = await fullResponse.arrayBuffer();
    fullBytes = fetchedBytes;
    totalLength = fetchedBytes.byteLength;
  } else if (totalLength === null) {
    const getResponse = await assets.fetch(
      new Request(assetRequest.url, { method: "GET", headers: fullHeaders }),
    );
    if (!getResponse.ok) return fullResponse;

    const fetchedBytes = await getResponse.arrayBuffer();
    fullBytes = fetchedBytes;
    totalLength = fetchedBytes.byteLength;
    fullResponse = new Response(null, {
      status: fullResponse.status,
      statusText: fullResponse.statusText,
      headers: getResponse.headers,
    });
  }

  if (totalLength === null) {
    return new Response(null, {
      status: 416,
      statusText: "Range Not Satisfiable",
      headers: rangeHeaders(fullResponse, null, 0),
    });
  }

  const range = parseSingleByteRange(rangeHeader, totalLength);
  if (!range) {
    return new Response(null, {
      status: 416,
      statusText: "Range Not Satisfiable",
      headers: rangeHeaders(fullResponse, null, totalLength),
    });
  }

  const body =
    request.method === "HEAD"
      ? null
      : fullBytes?.slice(range.start, range.end + 1) ?? null;

  return new Response(body, {
    status: 206,
    statusText: "Partial Content",
    headers: rangeHeaders(fullResponse, range, totalLength),
  });
}

async function serveStaticAsset(
  request: Request,
  assets: Fetcher,
): Promise<Response> {
  const url = new URL(request.url);
  const assetRequest = rewrittenAssetRequest(request);
  const isMp4RangeRequest =
    url.pathname.endsWith(".mp4") &&
    (request.method === "GET" || request.method === "HEAD") &&
    request.headers.has("Range");
  const response = isMp4RangeRequest
    ? await serveMp4Range(request, assetRequest, assets)
    : await assets.fetch(assetRequest);
  const headers = new Headers(response.headers);
  const contentType = contentTypeFor(url.pathname);
  const assetVersion = url.searchParams.get("v");
  const immutable =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/fonts/") ||
    /^v\d+$/.test(assetVersion ?? "");

  if (contentType) headers.set("Content-Type", contentType);
  if (url.pathname.endsWith(".mp4") && response.ok) {
    headers.set("Accept-Ranges", "bytes");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Cache-Control",
    response.ok || response.status === 206 || response.status === 304
      ? immutable
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600, stale-while-revalidate=86400"
      : "no-store",
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function serveApplication(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const cacheableRequest = isCacheableHtmlRequest(request);
  const response = await handler.fetch(request, env, ctx);
  const acceptsHtml = request.headers.get("Accept")?.includes("text/html") ?? false;
  const returnsHtml =
    response.headers.get("Content-Type")?.includes("text/html") ?? false;
  const hasPrivateContext =
    request.headers.has("Authorization") || request.headers.has("Cookie");

  if (
    request.method !== "GET" ||
    !acceptsHtml ||
    !returnsHtml ||
    hasPrivateContext ||
    request.headers.has("RSC") ||
    response.headers.has("Set-Cookie") ||
    !cacheableRequest ||
    !response.ok
  ) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
  );
  headers.set("Cache-Tag", `aj-luxury-html,aj-luxury-html-${HTML_CACHE_VERSION}`);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  scheduled(
    controller: ScheduledController,
    env: RuntimeEnv,
    ctx: ExecutionContext,
  ): void {
    const now = Number.isFinite(controller.scheduledTime)
      ? new Date(controller.scheduledTime).toISOString()
      : "invalid";
    ctx.waitUntil(
      runProductionScheduledOperations(env, { now })
        .then((result) => {
          console.log(JSON.stringify({
            event: "production_scheduled_operations",
            reservations: result.reservations,
            email: result.email,
            lateRefunds: result.lateRefunds,
          }));
        })
        .catch(() => {
          console.error(JSON.stringify({
            event: "production_scheduled_operations_failed",
          }));
        }),
    );
  },

  async fetch(
    request: Request,
    env: RuntimeEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    const productionRateLimitResponse = await productionCommerceRateLimitResponse(request, env);
    if (productionRateLimitResponse) {
      return withSecurityHeaders(
        productionRateLimitResponse,
        url.pathname,
        env?.APP_ENV,
      );
    }

    const productionOperationsResponse = await productionOperationsApiResponse(request, env);
    if (productionOperationsResponse) {
      return withSecurityHeaders(
        productionOperationsResponse,
        url.pathname,
        env?.APP_ENV,
      );
    }

    const productionShippingResponse = await productionShippingLabelAdminResponse(request, env);
    if (productionShippingResponse) {
      return withSecurityHeaders(
        productionShippingResponse,
        url.pathname,
        env?.APP_ENV,
      );
    }

    const productionCommerceResponse = await productionCommerceApiResponse(request, env);
    if (productionCommerceResponse) {
      return withSecurityHeaders(
        productionCommerceResponse,
        url.pathname,
        env?.APP_ENV,
      );
    }

    const preprodResponse = await preprodApiResponse(request, env);
    if (preprodResponse) {
      return withSecurityHeaders(await preprodResponse, url.pathname, env?.APP_ENV);
    }

    if (isStaticAsset(url.pathname)) {
      if (env?.ASSETS) return serveStaticAsset(request, env.ASSETS);

      if (env === undefined) {
        const physicalPath = mediaAssetPath(url.pathname) ?? url.pathname;
        const staticHeaders = new Headers();
        const contentType = contentTypeFor(url.pathname);
        if (contentType) staticHeaders.set("Content-Type", contentType);
        if (url.pathname.endsWith(".mp4")) {
          // vinext start currently maps MP4 to application/octet-stream and
          // strips an explicit Content-Type from static-file signals. Avoid
          // nosniff only in this local fallback so browsers may decode it.
          staticHeaders.set("Accept-Ranges", "bytes");
        } else {
          staticHeaders.set("X-Content-Type-Options", "nosniff");
        }
        return createStaticFileSignal(localStaticPath(physicalPath), {
          headers: staticHeaders,
          status: null,
        });
      }
    }

    const assets = env?.ASSETS;
    if (url.pathname === "/_vinext/image" && assets && env?.IMAGES) {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => assets.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return withSecurityHeaders(
      await serveApplication(request, env, ctx),
      url.pathname,
      env?.APP_ENV,
    );
  },
};

export default worker;
