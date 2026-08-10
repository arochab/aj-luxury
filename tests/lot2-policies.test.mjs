import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInternalVariantReference,
  parseInternalVariantReference,
} from "../lib/commerce/internal-reference.ts";
import {
  getZoneActivationBlockers,
  resolveLaunchShippingScope,
} from "../lib/commerce/shipping-policy.ts";
import {
  adminHasCapability,
  canCreateRefund,
  canReadOrder,
  verifyGuestOrderGrant,
} from "../lib/commerce/access-control.ts";
import { createOneTimeAccessToken } from "../lib/commerce/account-security.ts";
import { launchVariants } from "../lib/commerce/catalog.ts";
import {
  buildTransactionalEmail,
} from "../lib/commerce/transactional-email.ts";
import {
  canEraseCommerceRecord,
  sanitizeCommerceLogMetadata,
} from "../lib/commerce/privacy-policy.ts";

test("generates twelve stable internal references without EAN input", () => {
  const colors = ["pourpre", "rose-pale", "lilas-bleu-clair"];
  const sizes = ["S", "M", "L", "XL"];
  const references = colors.flatMap((color) =>
    sizes.map((size) => buildInternalVariantReference(color, size)),
  );

  assert.equal(new Set(references).size, 12);
  assert.deepEqual(references.slice(0, 4), [
    "AJ-APO-POU-S",
    "AJ-APO-POU-M",
    "AJ-APO-POU-L",
    "AJ-APO-POU-XL",
  ]);
  assert.deepEqual(parseInternalVariantReference("AJ-APO-LIL-M"), {
    colorSlug: "lilas-bleu-clair",
    size: "M",
  });
  assert.equal(parseInternalVariantReference("1234567890123"), null);
  assert.throws(
    () => buildInternalVariantReference("unknown", "S"),
    /Unsupported AJ Luxury launch variant/,
  );
  assert.deepEqual(
    launchVariants.map((variant) => variant.sku),
    references,
  );
  assert.equal(launchVariants.some((variant) => variant.sku.startsWith("AJ-BOX-")), false);
});

test("recognizes only launch zones and blocks special territories", () => {
  assert.deepEqual(resolveLaunchShippingScope({ countryCode: "FR", postalCode: "75001" }), {
    inScope: true,
    zone: "EU",
    checkoutEnabled: false,
    reason: "carrier-and-rate-configuration-pending",
  });
  assert.equal(resolveLaunchShippingScope({ countryCode: "DE" }).zone, "EU");
  assert.equal(resolveLaunchShippingScope({ countryCode: "GB" }).zone, "UK");
  assert.equal(resolveLaunchShippingScope({ countryCode: "US", regionCode: "CA" }).zone, "US");
  assert.equal(resolveLaunchShippingScope({ countryCode: "CA" }).zone, "CA");
  assert.equal(
    resolveLaunchShippingScope({ countryCode: "FR", postalCode: "97100" }).reason,
    "special-territory-needs-explicit-validation",
  );
  assert.equal(
    resolveLaunchShippingScope({ countryCode: "US", regionCode: "PR" }).reason,
    "special-territory-needs-explicit-validation",
  );
  assert.equal(
    resolveLaunchShippingScope({ countryCode: "CH" }).reason,
    "country-outside-launch-scope",
  );
  assert.equal(
    resolveLaunchShippingScope({ countryCode: "France" }).reason,
    "invalid-country-code",
  );
});

test("keeps every shipping zone disabled until real configuration exists", () => {
  const blockers = getZoneActivationBlockers({
    zone: "US",
    carrierServiceCode: null,
    priceCents: null,
    estimatedDaysMin: null,
    estimatedDaysMax: null,
    dutiesTerms: null,
    parcel: {
      weightGrams: null,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
      originCountryCode: null,
    },
  });

  assert.deepEqual(blockers, [
    "carrier-service",
    "price",
    "minimum-delivery-time",
    "maximum-delivery-time",
    "duties-terms",
    "weight",
    "length",
    "width",
    "height",
    "origin-country",
  ]);

  assert.deepEqual(
    getZoneActivationBlockers({
      zone: "EU",
      carrierServiceCode: "test-carrier",
      priceCents: 500,
      estimatedDaysMin: 2,
      estimatedDaysMax: 4,
      dutiesTerms: "EU_INCLUDED",
      parcel: {
        weightGrams: 250,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 5,
        originCountryCode: "FR",
      },
    }),
    [],
  );

  assert.deepEqual(
    getZoneActivationBlockers({
      zone: "ZZ",
      carrierServiceCode: "test-carrier",
      priceCents: Number.NaN,
      estimatedDaysMin: Number.POSITIVE_INFINITY,
      estimatedDaysMax: Number.POSITIVE_INFINITY,
      dutiesTerms: "DAP",
      parcel: {
        weightGrams: Number.POSITIVE_INFINITY,
        lengthCm: Number.NaN,
        widthCm: Number.POSITIVE_INFINITY,
        heightCm: -1,
        originCountryCode: "FR",
      },
    }),
    [
      "zone",
      "price",
      "minimum-delivery-time",
      "maximum-delivery-time",
      "weight",
      "length",
      "width",
      "height",
    ],
  );
  assert.ok(
    getZoneActivationBlockers({
      zone: "EU",
      carrierServiceCode: "carrier\r\nsecret",
      priceCents: 500,
      estimatedDaysMin: 2,
      estimatedDaysMax: 4,
      dutiesTerms: "EU_INCLUDED",
      parcel: {
        weightGrams: 250,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 5,
        originCountryCode: "FR",
      },
    }).includes("carrier-service"),
  );
});

test("enforces customer ownership and lean admin roles", async () => {
  const order = { orderId: "ord_1", customerId: "cus_a" };
  assert.equal(canReadOrder({ kind: "customer", customerId: "cus_a" }, order), true);
  assert.equal(canReadOrder({ kind: "customer", customerId: "cus_b" }, order), false);
  const now = new Date("2026-08-10T20:00:00.000Z");
  const token = await createOneTimeAccessToken(now);
  assert.equal(
    await verifyGuestOrderGrant({
      orderId: "ord_1",
      providedToken: "invalid",
      storedTokenHash: token.tokenHash,
      consumedAt: null,
      revokedAt: null,
      expiresAt: token.expiresAt,
      now,
    }),
    null,
  );
  const grant = await verifyGuestOrderGrant({
    orderId: "ord_1",
    providedToken: token.token,
    storedTokenHash: token.tokenHash,
    consumedAt: null,
    revokedAt: null,
    expiresAt: token.expiresAt,
    now,
  });
  assert.notEqual(grant, null);
  assert.equal(canReadOrder({ kind: "guest-order", grant }, order), true);
  assert.equal(
    canReadOrder({ kind: "guest-order", grant: { orderId: "ord_1" } }, order),
    false,
  );
  assert.equal(
    canReadOrder(
      { kind: "customer", customerId: "" },
      { orderId: "ord_1", customerId: "" },
    ),
    false,
  );
  assert.equal(adminHasCapability("operations", "orders:write"), true);
  assert.equal(adminHasCapability("operations", "admins:manage"), false);
  assert.equal(adminHasCapability("invalid", "orders:read"), false);
  assert.equal(canCreateRefund("operations"), false);
  assert.equal(canCreateRefund("owner"), true);
});

test("builds deterministic transactional messages and rejects incomplete input", () => {
  const email = buildTransactionalEmail({
    kind: "payment-confirmation",
    eventId: "evt_payment_1",
    locale: "fr",
    recipientEmail: " CLIENT@EXAMPLE.COM ",
    orderNumber: "AJ-2026-0001",
  });
  assert.equal(email.recipientEmail, "client@example.com");
  assert.equal(email.deduplicationKey, "payment-confirmation:evt_payment_1");
  assert.match(email.subject, /AJ-2026-0001/);
  assert.throws(
    () =>
      buildTransactionalEmail({
        kind: "shipment-confirmation",
        eventId: "evt_shipment_1",
        locale: "fr",
        recipientEmail: "client@example.com",
        orderNumber: "AJ-2026-0001",
        trackingUrl: "javascript:alert(1)",
        allowedUrlHosts: ["tracking.example.com"],
      }),
    /trackingUrl/,
  );
  assert.throws(
    () =>
      buildTransactionalEmail({
        kind: "payment-confirmation",
        eventId: "evt_payment_2",
        locale: "fr",
        recipientEmail: "client@example.com",
        orderNumber: "AJ-2026-0001\r\nBcc:private@example.com",
      }),
    /orderNumber/,
  );
  const access = buildTransactionalEmail({
    kind: "account-access",
    eventId: "evt_access_1",
    locale: "fr",
    recipientEmail: "client@example.com",
    accessUrl: "https://ajluxurystore.com/account/access?token=secret",
    allowedUrlHosts: ["ajluxurystore.com"],
  });
  assert.equal(access.deduplicationKey, "account-access:evt_access_1");
  assert.doesNotMatch(access.deduplicationKey, /token|client@/i);
});

test("allowlists operational logs and preserves legal-retention gates", () => {
  assert.deepEqual(
    sanitizeCommerceLogMetadata({
      event: "payment-reconciled",
      status: "paid",
      email: "client@example.com",
      address: "private",
      rawWebhookPayload: "secret",
      attempt: 2,
      provider: "sk_live_secret",
      errorCode: "0612345678",
      durationMs: Number.NaN,
      arbitrary: "drop-me",
    }),
    { event: "payment-reconciled", status: "paid", attempt: 2 },
  );
  assert.equal(
    canEraseCommerceRecord({ legalRetentionRequired: true, activeDispute: false }),
    false,
  );
  assert.equal(
    canEraseCommerceRecord({ legalRetentionRequired: false, activeDispute: false }),
    true,
  );
});
