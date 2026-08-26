import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProductionReleaseGate } from "../lib/commerce/production-release-gate.ts";

const releaseSha = "a".repeat(40);
const candidateVersionId = "018f47ce-24bd-7b16-a1ea-4b3fc2d66b75";
const liveVersionId = "018f47ce-24bd-7b16-a1ea-4b3fc2d66b76";
const base = Object.freeze({
  APP_ENV: "production",
  COMMERCE_MODE: "sandbox",
  COMMERCE_RELEASE_SHA: releaseSha,
  CF_VERSION_METADATA: {
    id: candidateVersionId,
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
  STRIPE_SECRET_KEY: "sk_test_redacted",
  STRIPE_WEBHOOK_SECRET: "whsec_redacted",
  DELIVERY_PROVIDER: "sendcloud",
  SENDCLOUD_API_VERSION: "3",
  SENDCLOUD_PUBLIC_KEY: "public-redacted",
  SENDCLOUD_SECRET_KEY: "secret-redacted",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_redacted",
  RESEND_WEBHOOK_SECRET: "whsec_resend_redacted",
  TRANSACTIONAL_FROM_EMAIL: "commandes@ajluxurystore.com",
  SELLER_LEGAL_IDENTITY_APPROVED: "true",
  TAX_DUTY_POLICY_APPROVED: "true",
  RETURNS_POLICY_APPROVED: "true",
  BACKUP_RESTORE_DRILL_APPROVED: "true",
  MONITORING_ALERTS_APPROVED: "true",
});

test("an empty environment is closed and exposes no capability", () => {
  const gate = evaluateProductionReleaseGate({});
  assert.equal(gate.ready, false);
  assert.equal(gate.mode, "closed");
  assert.equal(gate.capabilities.publicCommerce, false);
  assert.equal(gate.capabilities.realPayment, false);
  assert.ok(gate.blockers.includes("environment-not-production"));
  assert.ok(gate.blockers.includes("jeremy-release-approval-missing"));
  assert.ok(gate.blockers.includes("stock-manifest-approval-missing"));
});

test("complete sandbox evidence remains closed until the router is wired", () => {
  const gate = evaluateProductionReleaseGate(base);
  assert.equal(gate.ready, false);
  assert.equal(gate.evidenceComplete, false);
  assert.deepEqual(gate.blockers, ["visible-legal-terms-not-ready", "commerce-router-not-wired"]);
  assert.deepEqual(gate.launchZones, ["EU"]);
  assert.equal(gate.capabilities.sandboxCheckout, false);
  assert.equal(gate.capabilities.realPayment, false);
  assert.equal(gate.capabilities.realDelivery, false);
  assert.equal(gate.capabilities.publicCommerce, false);
});

test("controlled live evidence cannot enable an absent router", () => {
  const gate = evaluateProductionReleaseGate({
    ...base,
    COMMERCE_MODE: "controlled",
    STRIPE_SECRET_KEY: "sk_live_redacted",
  });
  assert.equal(gate.ready, false);
  assert.equal(gate.evidenceComplete, false);
  assert.deepEqual(gate.blockers, ["visible-legal-terms-not-ready", "commerce-router-not-wired"]);
  assert.equal(gate.capabilities.realPayment, false);
  assert.equal(gate.capabilities.realDelivery, false);
  assert.equal(gate.capabilities.controlledOrder, false);
  assert.equal(gate.capabilities.publicCommerce, false);
});

test("public live remains closed until a controlled order proof is recorded", () => {
  const missingProof = evaluateProductionReleaseGate({
    ...base,
    COMMERCE_MODE: "live",
    STRIPE_SECRET_KEY: "sk_live_redacted",
    CF_VERSION_METADATA: { ...base.CF_VERSION_METADATA, id: liveVersionId },
  });
  assert.equal(missingProof.ready, false);
  assert.ok(missingProof.blockers.includes("controlled-order-proof-missing"));
  assert.ok(missingProof.blockers.includes("promotion-source-version-missing"));

  const configured = evaluateProductionReleaseGate({
    ...base,
    COMMERCE_MODE: "live",
    STRIPE_SECRET_KEY: "sk_live_redacted",
    COMMERCE_CONTROLLED_ORDER_PROOF_ID: "proof-controlled-order-0001",
    COMMERCE_PROMOTED_FROM_VERSION_ID: candidateVersionId,
    CF_VERSION_METADATA: { ...base.CF_VERSION_METADATA, id: liveVersionId },
  });
  assert.equal(configured.ready, false);
  assert.equal(configured.evidenceComplete, false);
  assert.deepEqual(configured.blockers, ["visible-legal-terms-not-ready", "commerce-router-not-wired"]);
  assert.equal(configured.capabilities.publicCommerce, false);

  const selfPromotion = evaluateProductionReleaseGate({
    ...base,
    COMMERCE_MODE: "live",
    STRIPE_SECRET_KEY: "sk_live_redacted",
    COMMERCE_CONTROLLED_ORDER_PROOF_ID: "proof-controlled-order-0001",
    COMMERCE_PROMOTED_FROM_VERSION_ID: liveVersionId,
    CF_VERSION_METADATA: { ...base.CF_VERSION_METADATA, id: liveVersionId },
  });
  assert.ok(selfPromotion.blockers.includes("promotion-source-version-missing"));
});

test("approvals and exact origin are bound to the release", () => {
  const gate = evaluateProductionReleaseGate({
    ...base,
    COMMERCE_ORIGIN: "https://ajluxurystore.com/shop",
    COMMERCE_JEREMY_APPROVAL_SHA: "c".repeat(40),
  });
  assert.equal(gate.ready, false);
  assert.ok(gate.blockers.includes("commerce-origin-invalid"));
  assert.ok(gate.blockers.includes("jeremy-release-approval-missing"));
});
