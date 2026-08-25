export const productionCommerceModes = Object.freeze([
  "closed",
  "sandbox",
  "controlled",
  "live",
] as const);

export type ProductionCommerceMode = (typeof productionCommerceModes)[number];

export type ProductionCommerceEnvironment = Readonly<{
  APP_ENV?: string;
  COMMERCE_MODE?: string;
  COMMERCE_RELEASE_SHA?: string;
  COMMERCE_ORIGIN?: string;
  COMMERCE_ADAM_APPROVAL_SHA?: string;
  COMMERCE_JEREMY_APPROVAL_SHA?: string;
  COMMERCE_CONTROLLED_ORDER_PROOF_ID?: string;
  COMMERCE_PROMOTED_FROM_VERSION_ID?: string;
  STOCK_MANIFEST_ID?: string;
  STOCK_MANIFEST_SHA256?: string;
  STOCK_MANIFEST_APPROVED_BY?: string;
  PAYMENT_PROVIDER?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DELIVERY_PROVIDER?: string;
  SENDCLOUD_API_VERSION?: string;
  SENDCLOUD_PUBLIC_KEY?: string;
  SENDCLOUD_SECRET_KEY?: string;
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  TRANSACTIONAL_FROM_EMAIL?: string;
  SELLER_LEGAL_IDENTITY_APPROVED?: string;
  TAX_DUTY_POLICY_APPROVED?: string;
  RETURNS_POLICY_APPROVED?: string;
  BACKUP_RESTORE_DRILL_APPROVED?: string;
  MONITORING_ALERTS_APPROVED?: string;
  CF_VERSION_METADATA?: Readonly<{
    id?: string;
    tag?: string;
    timestamp?: string;
  }>;
}>;

export type ProductionReleaseBlocker =
  | "environment-not-production"
  | "commerce-mode-invalid"
  | "release-sha-invalid"
  | "runtime-version-metadata-missing"
  | "runtime-version-release-mismatch"
  | "commerce-origin-invalid"
  | "adam-release-approval-missing"
  | "jeremy-release-approval-missing"
  | "stock-manifest-missing"
  | "stock-manifest-hash-invalid"
  | "stock-manifest-approval-missing"
  | "payment-provider-not-ready"
  | "delivery-provider-not-ready"
  | "email-provider-not-ready"
  | "seller-legal-identity-unapproved"
  | "tax-duty-policy-unapproved"
  | "returns-policy-unapproved"
  | "backup-restore-drill-unapproved"
  | "monitoring-alerts-unapproved"
  | "controlled-order-proof-missing"
  | "promotion-source-version-missing"
  | "commerce-router-not-wired";

export type ProductionReleaseGate = Readonly<{
  ready: boolean;
  evidenceComplete: boolean;
  mode: ProductionCommerceMode;
  releaseSha: string | null;
  origin: string | null;
  launchZones: readonly ["FR"];
  blockers: readonly ProductionReleaseBlocker[];
  capabilities: Readonly<{
    sandboxCheckout: boolean;
    realPayment: boolean;
    realDelivery: boolean;
    transactionalEmail: boolean;
    controlledOrder: boolean;
    publicCommerce: boolean;
  }>;
}>;

const SHA_1_PATTERN = /^[a-f0-9]{40}$/;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/;
const WORKER_VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const AJ_EMAIL_PATTERN = /^[^@\s]+@ajluxurystore\.com$/i;
const launchZones = Object.freeze(["FR"] as const);

function isApproved(value: string | undefined): boolean {
  return value === "true";
}

function isExactHttpsOrigin(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === value &&
      parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

function readMode(value: string | undefined): ProductionCommerceMode {
  return productionCommerceModes.includes(value as ProductionCommerceMode)
    ? value as ProductionCommerceMode
    : "closed";
}

export function productionEvidenceVersionId(
  env: ProductionCommerceEnvironment,
): string | null {
  const currentVersionId = env.CF_VERSION_METADATA?.id ?? "";
  if (!WORKER_VERSION_ID_PATTERN.test(currentVersionId)) return null;
  if (readMode(env.COMMERCE_MODE) !== "live") return currentVersionId;
  const candidateVersionId = env.COMMERCE_PROMOTED_FROM_VERSION_ID ?? "";
  return WORKER_VERSION_ID_PATTERN.test(candidateVersionId) &&
      candidateVersionId !== currentVersionId
    ? candidateVersionId
    : null;
}

function stripeIsReady(
  env: ProductionCommerceEnvironment,
  mode: ProductionCommerceMode,
): boolean {
  if (env.PAYMENT_PROVIDER !== "stripe") return false;
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) return false;
  if (mode === "sandbox") return env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true;
  if (mode === "controlled" || mode === "live") {
    return env.STRIPE_SECRET_KEY?.startsWith("sk_live_") === true;
  }
  return false;
}

function deliveryIsReady(env: ProductionCommerceEnvironment): boolean {
  return env.DELIVERY_PROVIDER === "sendcloud" &&
    env.SENDCLOUD_API_VERSION === "3" &&
    Boolean(env.SENDCLOUD_PUBLIC_KEY?.trim()) &&
    Boolean(env.SENDCLOUD_SECRET_KEY?.trim());
}

function emailIsReady(env: ProductionCommerceEnvironment): boolean {
  return env.EMAIL_PROVIDER === "resend" &&
    env.RESEND_API_KEY?.startsWith("re_") === true &&
    env.RESEND_WEBHOOK_SECRET?.startsWith("whsec_") === true &&
    AJ_EMAIL_PATTERN.test(env.TRANSACTIONAL_FROM_EMAIL ?? "");
}

/**
 * Pure, secret-safe release gate for the future production Worker.
 *
 * It validates presence and credential class only. It never returns or logs a
 * credential. Provider reachability and business proofs remain separate,
 * explicit release evidence.
 */
function evaluateProductionReleaseGateInternal(
  env: ProductionCommerceEnvironment,
  routerWired: boolean,
): ProductionReleaseGate {
  const blockers: ProductionReleaseBlocker[] = [];
  const requestedMode = env.COMMERCE_MODE;
  const mode = readMode(requestedMode);
  const releaseSha = SHA_1_PATTERN.test(env.COMMERCE_RELEASE_SHA ?? "")
    ? env.COMMERCE_RELEASE_SHA!
    : null;
  const origin = isExactHttpsOrigin(env.COMMERCE_ORIGIN)
    ? env.COMMERCE_ORIGIN
    : null;

  if (env.APP_ENV !== "production") blockers.push("environment-not-production");
  if (!productionCommerceModes.includes(requestedMode as ProductionCommerceMode)) {
    blockers.push("commerce-mode-invalid");
  }
  if (!releaseSha) blockers.push("release-sha-invalid");
  const versionMetadata = env.CF_VERSION_METADATA;
  if (!versionMetadata || !WORKER_VERSION_ID_PATTERN.test(versionMetadata.id ?? "") ||
    typeof versionMetadata.timestamp !== "string" ||
    !Number.isFinite(Date.parse(versionMetadata.timestamp))) {
    blockers.push("runtime-version-metadata-missing");
  } else if (!releaseSha || versionMetadata.tag !== releaseSha) {
    blockers.push("runtime-version-release-mismatch");
  }
  if (!origin) blockers.push("commerce-origin-invalid");
  if (!releaseSha || env.COMMERCE_ADAM_APPROVAL_SHA !== releaseSha) {
    blockers.push("adam-release-approval-missing");
  }
  if (!releaseSha || env.COMMERCE_JEREMY_APPROVAL_SHA !== releaseSha) {
    blockers.push("jeremy-release-approval-missing");
  }
  if (!SAFE_REFERENCE_PATTERN.test(env.STOCK_MANIFEST_ID ?? "")) {
    blockers.push("stock-manifest-missing");
  }
  if (!SHA_256_PATTERN.test(env.STOCK_MANIFEST_SHA256 ?? "")) {
    blockers.push("stock-manifest-hash-invalid");
  }
  if (env.STOCK_MANIFEST_APPROVED_BY !== "jeremy") {
    blockers.push("stock-manifest-approval-missing");
  }

  const paymentReady = stripeIsReady(env, mode);
  const deliveryReady = mode !== "closed" && deliveryIsReady(env);
  const emailReady = mode !== "closed" && emailIsReady(env);
  if (!paymentReady) blockers.push("payment-provider-not-ready");
  if (!deliveryReady) blockers.push("delivery-provider-not-ready");
  if (!emailReady) blockers.push("email-provider-not-ready");
  if (!isApproved(env.SELLER_LEGAL_IDENTITY_APPROVED)) {
    blockers.push("seller-legal-identity-unapproved");
  }
  if (!isApproved(env.TAX_DUTY_POLICY_APPROVED)) {
    blockers.push("tax-duty-policy-unapproved");
  }
  if (!isApproved(env.RETURNS_POLICY_APPROVED)) {
    blockers.push("returns-policy-unapproved");
  }
  if (!isApproved(env.BACKUP_RESTORE_DRILL_APPROVED)) {
    blockers.push("backup-restore-drill-unapproved");
  }
  if (!isApproved(env.MONITORING_ALERTS_APPROVED)) {
    blockers.push("monitoring-alerts-unapproved");
  }
  if (
    mode === "live" &&
    !SAFE_REFERENCE_PATTERN.test(env.COMMERCE_CONTROLLED_ORDER_PROOF_ID ?? "")
  ) {
    blockers.push("controlled-order-proof-missing");
  }
  if (mode === "live" && productionEvidenceVersionId(env) === null) {
    blockers.push("promotion-source-version-missing");
  }

  // Configuration can never attest that executable routing code is present.
  // Only the production router module calls the wired entry point below.
  if (!routerWired) blockers.push("commerce-router-not-wired");

  const evidenceComplete = blockers.length === 0 || (
    blockers.length === 1 && blockers[0] === "commerce-router-not-wired"
  );
  const ready = routerWired && blockers.length === 0;
  return Object.freeze({
    ready,
    evidenceComplete,
    mode,
    releaseSha,
    origin,
    launchZones,
    blockers: Object.freeze(blockers),
    capabilities: Object.freeze({
      sandboxCheckout: ready && mode === "sandbox",
      realPayment: ready && (mode === "controlled" || mode === "live"),
      realDelivery: ready && (mode === "controlled" || mode === "live"),
      transactionalEmail: ready,
      controlledOrder: ready && mode === "controlled",
      publicCommerce: ready && mode === "live",
    }),
  });
}

/**
 * Configuration-only view. It deliberately remains closed because deployment
 * variables cannot prove that the commerce router was included in the build.
 */
export function evaluateProductionReleaseGate(
  env: ProductionCommerceEnvironment,
): ProductionReleaseGate {
  return evaluateProductionReleaseGateInternal(env, false);
}

/**
 * Executable-code attestation used only by the reviewed production router.
 * Runtime port readiness is checked separately by that router before any
 * commerce capability is exposed.
 */
export function evaluateWiredProductionReleaseGate(
  env: ProductionCommerceEnvironment,
): ProductionReleaseGate {
  return evaluateProductionReleaseGateInternal(env, true);
}
