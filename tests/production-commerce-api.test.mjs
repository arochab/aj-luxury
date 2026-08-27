import assert from "node:assert/strict";
import test from "node:test";
import {
  controlledRequestAuthorization,
  productionCommerceRuntimeBlockers,
  productionCommerceApiResponse,
  productionDeliveryRuntimeInstalled,
  productionLatePaymentRefundRuntimeReady,
  productionStockRuntimeAttested,
} from "../worker/production-commerce-api.ts";
import { launchVariantSeed } from "../db/seed.ts";
import { getLaunchInventoryPosition } from "../lib/commerce/launch-inventory.ts";
import { createLaunchStockPayloadSha256 } from "../lib/commerce/launch-stock-import.ts";
import {
  productionControlledOrderRuntimeProvenanceContract,
  productionControlledOrderRuntimeProvenanceContractSha256,
  productionLaunchStockCurrentGridContract,
  productionLaunchStockCurrentGridContractSha256,
  productionReleaseSchemaContract,
  productionReleaseSchemaContractSha256,
} from "../lib/commerce/production-schema-contract.ts";
import {
  createProductionProviderConfigurationAttestation,
  productionProviderConfigurationSchemaContract,
  productionProviderConfigurationSchemaContractSha256,
} from "../lib/commerce/production-provider-configuration.ts";

const releaseSha = "a".repeat(40);
const controlledSecret = "controlled-auth-secret-value-0001";
const controlled = Object.freeze({
  APP_ENV: "production",
  COMMERCE_MODE: "controlled",
  COMMERCE_RELEASE_SHA: releaseSha,
  CF_VERSION_METADATA: {
    id: "018f47ce-24bd-7b16-a1ea-4b3fc2d66b75",
    tag: releaseSha,
    timestamp: "2026-08-15T01:00:00.000Z",
  },
  COMMERCE_ORIGIN: "https://ajluxurystore.com",
  COMMERCE_ADAM_APPROVAL_SHA: releaseSha,
  COMMERCE_JEREMY_APPROVAL_SHA: releaseSha,
  STOCK_MANIFEST_ID: "stock-launch-20260815",
  STOCK_MANIFEST_SHA256: "b".repeat(64),
  STOCK_MANIFEST_APPROVED_BY: "jeremy",
  PAYMENT_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: "sk_live_redacted",
  STRIPE_WEBHOOK_SECRET: "whsec_redacted",
  STRIPE_SETTLEMENT_MODE: "live",
  STRIPE_ACCOUNT_ID: "acct_1U4iFTC0NIklfc9C",
  DELIVERY_PROVIDER: "sendcloud",
  SENDCLOUD_API_VERSION: "3",
  SENDCLOUD_PUBLIC_KEY: "public-redacted",
  SENDCLOUD_SECRET_KEY: "secret-redacted-secret",
  SENDCLOUD_INTEGRATION_ID: "612109",
  SENDCLOUD_SENDER_ADDRESS_ID: "884432",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_redacted",
  RESEND_WEBHOOK_SECRET: "whsec_resend_redacted",
  RESEND_DOMAIN: "ajluxurystore.com",
  TRANSACTIONAL_FROM_EMAIL: "commandes@ajluxurystore.com",
  SELLER_LEGAL_IDENTITY_APPROVED: "true",
  TAX_DUTY_POLICY_APPROVED: "true",
  RETURNS_POLICY_APPROVED: "true",
  BACKUP_RESTORE_DRILL_APPROVED: "true",
  MONITORING_ALERTS_APPROVED: "true",
  COMMERCE_CART_HMAC_SECRET: "x".repeat(32),
  COMMERCE_CONTROLLED_OWNER_EMAIL: "owner@example.com",
  COMMERCE_CONTROLLED_AUTH_HMAC_SECRET: controlledSecret,
  DB: {},
});

const ownerHeaders = Object.freeze({
  "oai-authenticated-user-email": "owner@example.com",
  "oai-authenticated-user-id": "owner-1",
});

test("production release schema sentinel is bound to its canonical contract", async () => {
  for (const [contract, expected] of [
    [productionReleaseSchemaContract, productionReleaseSchemaContractSha256],
    [productionLaunchStockCurrentGridContract,
      productionLaunchStockCurrentGridContractSha256],
    [productionProviderConfigurationSchemaContract,
      productionProviderConfigurationSchemaContractSha256],
    [productionControlledOrderRuntimeProvenanceContract,
      productionControlledOrderRuntimeProvenanceContractSha256],
  ]) {
    const digest = new Uint8Array(await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(contract),
    ));
    assert.equal(
      Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      expected,
    );
  }
});

async function authenticatedOwnerHeaders(method, pathname) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    ...ownerHeaders,
    "X-AJ-Controlled-Authorization": await controlledRequestAuthorization(
      controlledSecret,
      { method, pathname, ownerEmail: "owner@example.com", timestamp },
    ),
  };
}

async function approvedProductionStockManifest() {
  const variants = launchVariantSeed.map((variant, index) => ({
    variantId: variant.id,
    internalReference: variant.internalReference,
    physicalQuantity: getLaunchInventoryPosition(
      variant.sourceSlug,
      variant.size,
    ).currentPhysicalQuantity,
    giftingReserveQuantity: index === 9 ? 1 : 2,
    safetyReserveQuantity: 0,
    savReserveQuantity: 0,
  }));
  const unsigned = {
    protocol: "ajl-launch-stock-import-v2",
    manifestId: "stock-launch-20260825",
    countedAt: "2026-08-25T08:00:00.000Z",
    variants,
    totals: {
      physicalQuantity: 749,
      giftingReserveQuantity: 23,
      safetyReserveQuantity: 0,
      savReserveQuantity: 0,
      sellableQuantity: 726,
    },
  };
  const payloadSha256 = await createLaunchStockPayloadSha256(unsigned);
  return {
    manifest: {
      ...unsigned,
      approvals: [
        {
          role: "stock_owner", signerId: "jeremy",
          signedAt: "2026-08-25T08:30:00.000Z", payloadSha256,
          attestation: "I_APPROVE_THIS_EXACT_STOCK_IMPORT",
        },
        {
          role: "release_owner", signerId: "adam",
          signedAt: "2026-08-25T08:31:00.000Z", payloadSha256,
          attestation: "I_APPROVE_THIS_EXACT_STOCK_IMPORT",
        },
      ],
    },
    payloadSha256,
  };
}

test("the production namespace is invisible outside production", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://preprod.example/api/commerce/health"),
    { APP_ENV: "preproduction" },
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not-found" });
});

test("production health fails closed without release evidence", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/health"),
    { APP_ENV: "production", COMMERCE_MODE: "closed" },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const payload = await response.json();
  assert.equal(payload.status, "closed");
  assert.equal(payload.capabilities.publicCommerce, false);
  assert.ok(payload.blockers.includes("release-sha-invalid"));
  assert.doesNotMatch(JSON.stringify(payload), /sk_(?:test|live)|whsec|secret-redacted/);
});

test("unknown production commerce routes stay hidden", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/checkout", { method: "POST" }),
    { APP_ENV: "production", COMMERCE_MODE: "live" },
  );
  assert.equal(response.status, 404);
});

test("health rejects non-GET methods", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/health", { method: "POST" }),
    { APP_ENV: "production" },
  );
  assert.equal(response.status, 405);
});

test("controlled runtime does not require the public-only admin MFA gate", () => {
  const blockers = productionCommerceRuntimeBlockers({
    ...controlled,
    MONITORING_ALERTS_APPROVED: undefined,
    OPERATOR_ADMIN_MFA_ENABLED: undefined,
  }, "controlled");
  assert.equal(blockers.includes("operator-admin-mfa-not-enabled"), false);
});

test("the one-shot stock importer is wired before the stock gate but bound to owner, SHA and exact manifest", async () => {
  const { manifest, payloadSha256 } = await approvedProductionStockManifest();
  const pathname = "/api/commerce/admin/launch-stock-import";
  const auth = await authenticatedOwnerHeaders("POST", pathname);
  let calls = 0;
  const env = {
    ...controlled,
    PRODUCTION_STOCK_IMPORT_ENABLED: "true",
    STOCK_MANIFEST_ID: manifest.manifestId,
    STOCK_MANIFEST_SHA256: payloadSha256,
  };
  const request = (confirmation) => new Request(`https://ajluxurystore.com${pathname}`, {
    method: "POST",
    headers: {
      ...auth,
      Origin: "https://ajluxurystore.com",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      "Idempotency-Key": `stock-import:${manifest.manifestId}`,
      "X-AJ-Release-SHA": releaseSha,
      "X-AJ-Stock-Import-Confirmation": confirmation,
    },
    body: JSON.stringify({ manifest }),
  });
  const hmacAuthenticatedBeforeEvidence = await productionCommerceApiResponse(
    request("WRONG"), env,
    { stockImporter: async () => { calls += 1; throw new Error("not-called"); } },
  );
  assert.equal(hmacAuthenticatedBeforeEvidence.status, 503);
  assert.equal(
    (await hmacAuthenticatedBeforeEvidence.json()).error.code,
    "STOCK_IMPORT_RELEASE_EVIDENCE_MISSING",
  );
  assert.equal(calls, 0);

  const rejected = await productionCommerceApiResponse(
    request("WRONG"), env,
    {
      stockImportOwnerAuthenticator: async () => true,
      stockImporter: async () => { calls += 1; throw new Error("not-called"); },
    },
  );
  assert.equal(rejected.status, 503);
  assert.equal(calls, 0);

  const accepted = await productionCommerceApiResponse(
    request("IMPORT_749_CURRENT_23_GIFTS_726_SELLABLE"), env,
    {
      stockImportOwnerAuthenticator: async () => true,
      stockImporter: async (_database, input) => {
      calls += 1;
      assert.equal(input.releaseSha, releaseSha);
      assert.equal(input.workerVersionId, controlled.CF_VERSION_METADATA.id);
      assert.deepEqual(input.providerIdentities, {
        stripeAccountId: controlled.STRIPE_ACCOUNT_ID,
        sendcloudIntegrationId: controlled.SENDCLOUD_INTEGRATION_ID,
        sendcloudSenderAddressId: controlled.SENDCLOUD_SENDER_ADDRESS_ID,
        resendDomain: controlled.RESEND_DOMAIN,
        commerceOrigin: controlled.COMMERCE_ORIGIN,
        transactionalFromEmail: controlled.TRANSACTIONAL_FROM_EMAIL,
      });
      return {
        disposition: "activated",
        manifestId: manifest.manifestId,
        payloadSha256,
        releaseSha,
        workerVersionId: controlled.CF_VERSION_METADATA.id,
        providerConfigurationSha256: "d".repeat(64),
        physicalQuantity: 749,
        giftingReserveQuantity: 23,
        sellableQuantity: 726,
      };
      },
    },
  );
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).data.sellableQuantity, 726);
  assert.equal(calls, 1);
});

test("live runtime opens only after the manual returns label and refund process is approved", () => {
  const base = {
    ...controlled,
    COMMERCE_MODE: "live",
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://aj-luxury.cloudflareaccess.com",
    CLOUDFLARE_ACCESS_AUD: "accessAudience_1234567890",
    COMMERCE_CART_HMAC_SECRET: "x".repeat(32),
    DELIVERY_REFERENCE_ENCRYPTION_KEY_BASE64: btoa("x".repeat(32)),
    DELIVERY_REFERENCE_KEY_VERSION: "key-version-0001",
    DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON: JSON.stringify({
      "key-version-0001": btoa("x".repeat(32)),
    }),
    COMMERCE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    PROVIDER_RATE_LIMITER: { limit: async () => ({ success: true }) },
    WEBHOOK_RATE_LIMITER: { limit: async () => ({ success: true }) },
    OPERATOR_RATE_LIMITER: { limit: async () => ({ success: true }) },
    LATE_PAYMENT_REFUND_DISPATCH_ENABLED: "true",
    OUTBOUND_SHIPMENT_CREATION_ENABLED: "true",
    OPERATOR_ADMIN_MFA_ENABLED: "true",
    TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: "true",
    TRANSACTIONAL_EMAIL_DISPATCH_MODE: "resend",
    RETURNS_WORKFLOW_ENABLED: "true",
    RESERVATION_EXPIRY_ENABLED: "true",
  };
  assert.ok(productionCommerceRuntimeBlockers(base, "live")
    .includes("returns-label-and-refund-process-unapproved"));
  assert.equal(productionCommerceRuntimeBlockers({
    ...base,
    RETURNS_LABEL_AND_REFUND_PROCESS_APPROVED: "true",
  }, "live").includes("returns-label-and-refund-process-unapproved"), false);
});

test("public live runtime still requires operator admin MFA", () => {
  const live = {
    ...controlled,
    COMMERCE_MODE: "live",
    LATE_PAYMENT_REFUND_DISPATCH_ENABLED: "true",
    OUTBOUND_SHIPMENT_CREATION_ENABLED: "true",
    TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: "true",
    TRANSACTIONAL_EMAIL_DISPATCH_MODE: "resend",
    RETURNS_WORKFLOW_ENABLED: "true",
    SHIPMENT_HANDOVER_ENABLED: "true",
    RESERVATION_EXPIRY_ENABLED: "true",
  };
  assert.ok(productionCommerceRuntimeBlockers(live, "live")
    .includes("operator-admin-mfa-not-enabled"));
});

test("controlled cart reaches origin validation after public-only legal gates are deferred", async () => {
  const headers = await authenticatedOwnerHeaders("POST", "/api/commerce/cart");
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/cart", {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": "cart-create-0001" },
    }),
    controlled,
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "ORIGIN_REJECTED");
});

test("controlled service-point purchase reaches delivery schema validation", async () => {
  const cartToken = "A".repeat(43);
  const csrfToken = "B".repeat(43);
  const headers = await authenticatedOwnerHeaders("POST", "/api/commerce/checkout/service-points");
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/checkout/service-points", {
      method: "POST",
      headers: {
        ...headers,
        Cookie: `__Host-aj_cart=${cartToken}; __Host-aj_cart_csrf=${csrfToken}`,
        Origin: "https://ajluxurystore.com",
        "Sec-Fetch-Site": "same-origin",
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": "service-points-0001",
      },
    }),
    controlled,
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "DELIVERY_SCHEMA_NOT_READY");
});

test("delivery runtime proof rejects missing and prefix-colliding 0013 objects", async () => {
  const exact = [
    { type: "column", name: "selected_service_point_id", table_name: "delivery_option_snapshots" },
    { type: "index", name: "idx_delivery_options_cart_expiry", table_name: "delivery_option_snapshots" },
    { type: "index", name: "idx_delivery_reference_key_version", table_name: "delivery_provider_reference_vault" },
    { type: "index", name: "idx_delivery_service_points_option_expiry", table_name: "delivery_service_point_snapshots" },
    { type: "index", name: "ux_delivery_options_quote", table_name: "delivery_option_snapshots" },
    { type: "index", name: "ux_delivery_options_selected_cart", table_name: "delivery_option_snapshots" },
    { type: "index", name: "ux_delivery_reference_owner", table_name: "delivery_provider_reference_vault" },
    { type: "index", name: "ux_delivery_service_point_provider_ref", table_name: "delivery_service_point_snapshots" },
    { type: "index", name: "ux_shipping_document_reference", table_name: "shipping_document_metadata" },
    { type: "table", name: "delivery_option_snapshots", table_name: "delivery_option_snapshots" },
    { type: "table", name: "delivery_provider_reference_vault", table_name: "delivery_provider_reference_vault" },
    { type: "table", name: "delivery_service_point_snapshots", table_name: "delivery_service_point_snapshots" },
    { type: "table", name: "shipping_document_metadata", table_name: "shipping_document_metadata" },
    { type: "trigger", name: "trg_delivery_option_initially_unselected", table_name: "delivery_option_snapshots" },
    { type: "trigger", name: "trg_delivery_option_retain", table_name: "delivery_option_snapshots" },
    { type: "trigger", name: "trg_delivery_option_select_once", table_name: "delivery_option_snapshots" },
    { type: "trigger", name: "trg_delivery_option_validate_insert", table_name: "delivery_option_snapshots" },
    { type: "trigger", name: "trg_delivery_order_requires_selected_option", table_name: "orders" },
    { type: "trigger", name: "trg_delivery_reference_immutable", table_name: "delivery_provider_reference_vault" },
    { type: "trigger", name: "trg_delivery_reference_replay_guard", table_name: "delivery_provider_reference_vault" },
    { type: "trigger", name: "trg_delivery_reference_retain", table_name: "delivery_provider_reference_vault" },
    { type: "trigger", name: "trg_delivery_reference_validate_insert", table_name: "delivery_provider_reference_vault" },
    { type: "trigger", name: "trg_delivery_service_point_immutable", table_name: "delivery_service_point_snapshots" },
    { type: "trigger", name: "trg_delivery_service_point_retain", table_name: "delivery_service_point_snapshots" },
    { type: "trigger", name: "trg_delivery_service_point_validate_insert", table_name: "delivery_service_point_snapshots" },
    { type: "trigger", name: "trg_orders_provider_pricing_contract", table_name: "orders" },
    { type: "trigger", name: "trg_orders_require_shipping_snapshot_insert", table_name: "orders" },
    { type: "trigger", name: "trg_shipping_document_immutable", table_name: "shipping_document_metadata" },
    { type: "trigger", name: "trg_shipping_document_retain", table_name: "shipping_document_metadata" },
    { type: "trigger", name: "trg_shipping_quote_provider_pricing_contract", table_name: "shipping_quotes" },
    { type: "trigger", name: "trg_shipping_quote_validate_insert", table_name: "shipping_quotes" },
  ];
  const database = (results) => ({ prepare() { return { async all() { return { results }; } }; } });
  assert.equal(await productionDeliveryRuntimeInstalled(database(exact)), true);
  assert.equal(await productionDeliveryRuntimeInstalled(database(exact.slice(1))), false);
  assert.equal(await productionDeliveryRuntimeInstalled(database([...exact, { ...exact[1], name: "delivery_provider_reference_vault_shadow" }])), false);
});

function stockProofDatabase(proof, lines, releaseProof, providerProof) {
  return {
    prepare(query) {
      return {
        bind() { return this; },
        async first() {
          if (query.includes("FROM production_launch_stock_manifests")) return proof;
          if (query.includes("FROM production_provider_configuration_attestations")) return providerProof;
          if (query.includes("FROM production_release_attestations")) return releaseProof;
          return null;
        },
        async all() { return { results: lines }; },
      };
    },
  };
}

test("live stock attestation recomputes the exact 12-line manifest and controlled-order proof", async () => {
  const countedAt = "2026-08-15T01:00:00.000Z";
  const variants = launchVariantSeed.map((variant, index) => ({
    variantId: variant.id,
    internalReference: variant.internalReference,
    physicalQuantity: getLaunchInventoryPosition(
      variant.sourceSlug,
      variant.size,
    ).currentPhysicalQuantity,
    giftingReserveQuantity: index === 9 ? 1 : 2,
    safetyReserveQuantity: 0,
    savReserveQuantity: 0,
  }));
  const unsigned = {
    protocol: "ajl-launch-stock-import-v2",
    manifestId: "stock-launch-20260815",
    countedAt,
    variants,
    totals: { physicalQuantity: 749, giftingReserveQuantity: 23, safetyReserveQuantity: 0, savReserveQuantity: 0, sellableQuantity: 726 },
  };
  const payload = await createLaunchStockPayloadSha256(unsigned);
  const proof = {
    manifest_id: unsigned.manifestId, protocol: unsigned.protocol, payload_sha256: payload,
    counted_at: countedAt, release_sha: releaseSha,
    worker_version_id: controlled.CF_VERSION_METADATA.id,
    physical_total: 749, variant_count: 12, gifting_reserve_total: 23,
    safety_reserve_total: 0, sav_reserve_total: 0, sellable_total: 726,
    stock_owner_id: "jeremy", release_owner_id: "adam",
    stock_owner_signed_at: "2026-08-15T01:01:00.000Z",
    release_owner_signed_at: "2026-08-15T01:02:00.000Z",
    schema_proven: 1,
  };
  const lines = variants.map((variant, position) => ({
    position, variant_id: variant.variantId, internal_reference: variant.internalReference,
    physical_quantity: variant.physicalQuantity,
    gifting_reserve_quantity: variant.giftingReserveQuantity,
    safety_reserve_quantity: 0, sav_reserve_quantity: 0,
    sellable_quantity: variant.physicalQuantity - variant.giftingReserveQuantity,
    live_physical_quantity: variant.physicalQuantity,
    live_gifting_reserve_quantity: variant.giftingReserveQuantity,
    live_safety_reserve_quantity: 0,
    live_reserves_validated: 1,
  }));
  const releaseProof = {
    worker_version_id: controlled.CF_VERSION_METADATA.id,
    worker_version_tag: releaseSha, controlled_order_id: "order-controlled-0001",
    stock_owner_id: "jeremy", release_owner_id: "adam",
    jeremy_approver_id: "jeremy", adam_approver_id: "adam",
    controlled_release_sha: "e".repeat(40),
    controlled_worker_version_id: "018f47ce-24bd-7b16-a1ea-4b3fc2d66b74",
    controlled_commerce_mode: "controlled",
    controlled_settlement_mode: "live",
    controlled_order_proven: 1,
  };
  const provider = await createProductionProviderConfigurationAttestation({
    releaseSha,
    workerVersionId: controlled.CF_VERSION_METADATA.id,
    stockManifestId: unsigned.manifestId,
    stripeAccountId: controlled.STRIPE_ACCOUNT_ID,
    sendcloudIntegrationId: controlled.SENDCLOUD_INTEGRATION_ID,
    sendcloudSenderAddressId: controlled.SENDCLOUD_SENDER_ADDRESS_ID,
    resendDomain: controlled.RESEND_DOMAIN,
    commerceOrigin: controlled.COMMERCE_ORIGIN,
    transactionalFromEmail: controlled.TRANSACTIONAL_FROM_EMAIL,
  });
  const providerProof = {
    release_sha: provider.releaseSha,
    worker_version_id: provider.workerVersionId,
    stock_manifest_id: provider.stockManifestId,
    protocol: provider.protocol,
    configuration_sha256: provider.configurationSha256,
    stripe_account_id: provider.stripeAccountId,
    sendcloud_integration_id: provider.sendcloudIntegrationId,
    sendcloud_sender_address_id: provider.sendcloudSenderAddressId,
    resend_domain: provider.resendDomain,
    commerce_origin: provider.commerceOrigin,
    transactional_from_email: provider.transactionalFromEmail,
    schema_proven: 1,
  };
  const env = {
    ...controlled,
    DB: stockProofDatabase(proof, lines, releaseProof, providerProof), STOCK_MANIFEST_ID: unsigned.manifestId,
    STOCK_MANIFEST_SHA256: payload, COMMERCE_RELEASE_SHA: "d".repeat(40),
    COMMERCE_CONTROLLED_ORDER_PROOF_ID: "order-controlled-0001",
    COMMERCE_MODE: "live",
    COMMERCE_PROMOTED_FROM_RELEASE_SHA: "e".repeat(40),
    COMMERCE_PROMOTED_FROM_VERSION_ID: "018f47ce-24bd-7b16-a1ea-4b3fc2d66b74",
    COMMERCE_STOCK_EVIDENCE_RELEASE_SHA: releaseSha,
    COMMERCE_STOCK_EVIDENCE_VERSION_ID: controlled.CF_VERSION_METADATA.id,
    CF_VERSION_METADATA: {
      ...controlled.CF_VERSION_METADATA,
      id: "018f47ce-24bd-7b16-a1ea-4b3fc2d66b76",
      tag: "d".repeat(40),
    },
  };
  assert.equal(await productionStockRuntimeAttested(env), true);
  const redistributed = lines.map((line, index) => index === 0
    ? { ...line, live_physical_quantity: line.live_physical_quantity + 1 }
    : line);
  assert.equal(await productionStockRuntimeAttested({ ...env, DB: stockProofDatabase(proof, redistributed, releaseProof, providerProof) }), false);
  assert.equal(await productionStockRuntimeAttested({ ...env, DB: stockProofDatabase({ ...proof, worker_version_id: crypto.randomUUID() }, lines, releaseProof, providerProof) }), false);
  assert.equal(await productionStockRuntimeAttested({ ...env, STOCK_MANIFEST_SHA256: "c".repeat(64) }), false);
  assert.equal(await productionStockRuntimeAttested({ ...env, COMMERCE_PROMOTED_FROM_VERSION_ID: env.CF_VERSION_METADATA.id }), false);
  assert.equal(await productionStockRuntimeAttested({ ...env, COMMERCE_PROMOTED_FROM_VERSION_ID: crypto.randomUUID() }), false);
  assert.equal(await productionStockRuntimeAttested({ ...env, COMMERCE_PROMOTED_FROM_RELEASE_SHA: "f".repeat(40) }), false);
  assert.equal(await productionStockRuntimeAttested({ ...env, DB: stockProofDatabase(proof, lines, { ...releaseProof, controlled_commerce_mode: "sandbox", controlled_settlement_mode: "test" }, providerProof) }), false);
  assert.equal(await productionStockRuntimeAttested({ ...env, COMMERCE_STOCK_EVIDENCE_RELEASE_SHA: undefined }), false);
  assert.equal(await productionStockRuntimeAttested({ ...env, STRIPE_ACCOUNT_ID: "acct_DIFFERENT123456" }), false);
});

test("controlled payment session reaches its dedicated runtime validation", async () => {
  const cartToken = "A".repeat(43);
  const csrfToken = "B".repeat(43);
  const headers = await authenticatedOwnerHeaders("POST", "/api/commerce/checkout/payment-session");
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/checkout/payment-session", {
      method: "POST",
      headers: {
        ...headers,
        Cookie: `__Host-aj_cart=${cartToken}; __Host-aj_cart_csrf=${csrfToken}`,
        Origin: "https://ajluxurystore.com",
        "Sec-Fetch-Site": "same-origin",
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": "payment-session-0001",
      },
    }),
    controlled,
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "CONTROLLED_PAYMENT_RUNTIME_NOT_READY");
});

test("late-refund runtime proof rejects terminal debt and prefix-colliding 0014 objects", async () => {
  const exact = [
    { type: "index", name: "idx_late_payment_refund_dispatch", table_name: "late_payment_refund_intents" },
    { type: "index", name: "ux_late_payment_refund_active_lease", table_name: "late_payment_refund_intents" },
    { type: "index", name: "ux_late_payment_refund_idempotency", table_name: "late_payment_refund_intents" },
    { type: "index", name: "ux_late_payment_refund_order", table_name: "late_payment_refund_intents" },
    { type: "index", name: "ux_late_payment_refund_payment", table_name: "late_payment_refund_intents" },
    { type: "index", name: "ux_late_payment_refund_provider_refund", table_name: "late_payment_refund_intents" },
    { type: "index", name: "ux_late_payment_refund_webhook", table_name: "late_payment_refund_intents" },
    { type: "index", name: "ux_payments_order_active_checkout", table_name: "payments" },
    { type: "table", name: "late_payment_refund_intents", table_name: "late_payment_refund_intents" },
    { type: "trigger", name: "trg_late_payment_refund_lock_identity", table_name: "late_payment_refund_intents" },
    { type: "trigger", name: "trg_late_payment_refund_retain", table_name: "late_payment_refund_intents" },
    { type: "trigger", name: "trg_late_payment_refund_terminal_immutable", table_name: "late_payment_refund_intents" },
    { type: "trigger", name: "trg_late_payment_refund_validate_claim_time", table_name: "late_payment_refund_intents" },
    { type: "trigger", name: "trg_late_payment_refund_validate_insert", table_name: "late_payment_refund_intents" },
    { type: "trigger", name: "trg_late_payment_refund_validate_success", table_name: "late_payment_refund_intents" },
    { type: "trigger", name: "trg_late_payment_refund_validate_transition", table_name: "late_payment_refund_intents" },
  ];
  const database = (results, attention = 0) => ({
    prepare(query) {
      return query.includes("sqlite_master")
        ? { async all() { return { results }; } }
        : { async first() { return { count: attention }; } };
    },
  });
  assert.equal(await productionLatePaymentRefundRuntimeReady(database(exact)), true);
  assert.equal(await productionLatePaymentRefundRuntimeReady(database(exact, 1)), false);
  assert.equal(await productionLatePaymentRefundRuntimeReady(database([
    ...exact,
    { type: "table", name: "late_payment_refund_intents_shadow", table_name: "late_payment_refund_intents_shadow" },
  ])), false);
});

test("a verified Stripe webhook is never acknowledged without atomic effects", async () => {
  let verifications = 0;
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/webhooks/stripe", {
      method: "POST",
      headers: {
        "Stripe-Signature": "t=1,v1=" + "a".repeat(64),
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    controlled,
    {
      paymentProvider: {
        checkout: { async createSession() { throw new Error("not-called"); } },
        refunds: { async createRefund() { throw new Error("not-called"); } },
        webhooks: { async verify() {
          verifications += 1;
          return {
            provider: "stripe", providerEventId: "evt_paid_1",
            eventType: "checkout.session.completed",
            occurredAt: new Date().toISOString(), livemode: true,
            kind: "payment", orderId: "order_1", providerPaymentId: "pi_1",
            providerCheckoutSessionId: "cs_live_1", state: "paid",
            amountCents: 2999, currency: "EUR", providerFailureCode: null,
            semanticKey: "stripe:payment:pi_1:paid",
          };
        } },
      },
    },
  );
  assert.equal(verifications, 1);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "PAYMENT_EFFECTS_UNAVAILABLE");
});

test("webhook provider misconfiguration remains retryable 503", async () => {
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/webhooks/stripe", {
      method: "POST",
      headers: { "Stripe-Signature": "t=1,v1=" + "a".repeat(64) },
      body: "{}",
    }),
    {
      APP_ENV: "production",
      COMMERCE_MODE: "closed",
      COMMERCE_ORIGIN: "https://ajluxurystore.com",
      STRIPE_SETTLEMENT_MODE: "live",
      DB: {},
    },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "PAYMENT_EFFECTS_UNAVAILABLE");
});

test("a signed existing payment settles after commerce is closed without owner headers", async () => {
  let effects = 0;
  const closedAfterSession = {
    APP_ENV: "production",
    COMMERCE_MODE: "closed",
    COMMERCE_ORIGIN: "https://ajluxurystore.com",
    STRIPE_SETTLEMENT_MODE: "live",
    DB: {},
  };
  const response = await productionCommerceApiResponse(
    new Request("https://ajluxurystore.com/api/commerce/webhooks/stripe", {
      method: "POST",
      headers: {
        "Stripe-Signature": "t=1,v1=" + "a".repeat(64),
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    closedAfterSession,
    {
      paymentProvider: {
        checkout: { async createSession() { throw new Error("not-called"); } },
        refunds: { async createRefund() { throw new Error("not-called"); } },
        webhooks: { async verify() {
          return {
            provider: "stripe", providerEventId: "evt_paid_closed_1",
            eventType: "checkout.session.completed",
            occurredAt: new Date().toISOString(), livemode: true,
            kind: "payment", orderId: "order_1", providerPaymentId: "pi_1",
            providerCheckoutSessionId: "cs_live_1", state: "paid",
            amountCents: 2999, currency: "EUR", providerFailureCode: null,
            semanticKey: "stripe:payment:pi_1:paid",
          };
        } },
      },
      paymentEffects: { async applyVerified() { effects += 1; return "applied"; } },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(effects, 1);
  assert.deepEqual(await response.json(), { received: true, disposition: "applied" });
});
