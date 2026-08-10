import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInternalVariantReference,
  isProductSize,
  parseInternalVariantReference,
} from "../lib/commerce/internal-reference.ts";
import {
  getZoneActivationBlockers,
  launchShippingZones,
  resolveLaunchShippingScope,
} from "../lib/commerce/shipping-policy.ts";
import {
  adminRoles,
  adminHasCapability,
  canCreateRefund,
  canReadOrder,
  verifyGuestOrderGrant,
} from "../lib/commerce/access-control.ts";
import { createOneTimeAccessToken } from "../lib/commerce/account-security.ts";
import { launchVariants } from "../lib/commerce/catalog.ts";
import { iso3166Alpha2CountryCodes } from "../lib/commerce/iso-country-codes.ts";
import {
  buildTransactionalEmail,
  transactionalEmailKinds,
} from "../lib/commerce/transactional-email.ts";
import {
  allowedCommerceLogFields,
  canEraseCommerceRecord,
  prohibitedOperationalLogFields,
  sanitizeCommerceLogMetadata,
} from "../lib/commerce/privacy-policy.ts";
import { sizes as catalogueSizes } from "../lib/products.ts";

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

test("keeps exported security lists immutable at runtime", () => {
  for (const list of [
    adminRoles,
    launchShippingZones,
    catalogueSizes,
    transactionalEmailKinds,
    allowedCommerceLogFields,
    prohibitedOperationalLogFields,
    iso3166Alpha2CountryCodes,
  ]) {
    assert.equal(Object.isFrozen(list), true);
    assert.throws(() => list.push("MUTATED"), TypeError);
  }

  assert.equal(isProductSize("S"), true);
  assert.equal(isProductSize("MUTATED"), false);
  assert.equal(iso3166Alpha2CountryCodes.length, 249);
  assert.equal(new Set(iso3166Alpha2CountryCodes).size, 249);
  assert.equal(iso3166Alpha2CountryCodes.includes("ZZ"), false);
  assert.equal(iso3166Alpha2CountryCodes.includes("XK"), false);
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
  assert.equal(resolveLaunchShippingScope(null).reason, "invalid-address-input");
  assert.equal(
    resolveLaunchShippingScope({ countryCode: "GB", postalCode: 75001 }).reason,
    "invalid-address-input",
  );
  assert.equal(
    resolveLaunchShippingScope({ countryCode: "ZZ" }).reason,
    "invalid-country-code",
  );

  for (const postalCode of ["JE1 1AA", "GY1 1AA", "IM1 1AA", "GX11 1AA"]) {
    assert.equal(
      resolveLaunchShippingScope({ countryCode: "GB", postalCode }).reason,
      "special-territory-needs-explicit-validation",
    );
  }
  for (const regionCode of ["AA", "AE", "AP"]) {
    assert.equal(
      resolveLaunchShippingScope({ countryCode: "US", regionCode }).reason,
      "special-territory-needs-explicit-validation",
    );
  }
  for (const postalCode of ["63086", "GR-63086"]) {
    assert.equal(
      resolveLaunchShippingScope({ countryCode: "GR", postalCode }).reason,
      "special-territory-needs-explicit-validation",
    );
  }
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
  assert.ok(
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
        originCountryCode: "ZZ",
      },
    }).includes("origin-country"),
  );
  assert.deepEqual(getZoneActivationBlockers(null), [
    "zone",
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
});

test("enforces customer ownership and lean admin roles", async () => {
  const order = { orderId: "ord_1", customerId: "cus_a" };
  assert.equal(canReadOrder({ kind: "customer", customerId: "cus_a" }, order), true);
  assert.equal(canReadOrder({ kind: "customer", customerId: "cus_b" }, order), false);
  const now = new Date("2026-08-10T20:00:00.000Z");
  const token = await createOneTimeAccessToken(now);
  let invalidTokenConsumerCalled = false;
  assert.equal(
    await verifyGuestOrderGrant({
      orderId: "ord_1",
      providedToken: "invalid",
      storedTokenHash: token.tokenHash,
      consumedAt: null,
      revokedAt: null,
      expiresAt: token.expiresAt,
      now,
      consumeTokenAtomically: async () => {
        invalidTokenConsumerCalled = true;
        return true;
      },
    }),
    null,
  );
  assert.equal(invalidTokenConsumerCalled, false);
  let consumed = false;
  const grant = await verifyGuestOrderGrant({
    orderId: "ord_1",
    providedToken: token.token,
    storedTokenHash: token.tokenHash,
    consumedAt: null,
    revokedAt: null,
    expiresAt: token.expiresAt,
    now,
    consumeTokenAtomically: async ({ expectedTokenHash }) => {
      if (consumed || expectedTokenHash !== token.tokenHash) return false;
      consumed = true;
      return true;
    },
  });
  assert.notEqual(grant, null);
  assert.equal(canReadOrder({ kind: "guest-order", grant }, order), true);
  assert.equal(
    canReadOrder({ kind: "guest-order", grant: { orderId: "ord_1" } }, order),
    false,
  );
  assert.equal(
    canReadOrder({ kind: "guest-order", grant: { ...grant } }, order),
    false,
  );
  assert.equal(
    canReadOrder(
      { kind: "customer", customerId: "" },
      { orderId: "ord_1", customerId: "" },
    ),
    false,
  );
  assert.equal(
    canReadOrder(
      { kind: "unknown" },
      { orderId: "ord_1", customerId: null },
    ),
    false,
  );
  assert.equal(
    canReadOrder(
      { kind: "guest-order", grant: null },
      { orderId: "ord_1", customerId: null },
    ),
    false,
  );
  assert.equal(canReadOrder(null, null), false);
  assert.equal(adminHasCapability("operations", "orders:write"), true);
  assert.equal(adminHasCapability("operations", "admins:manage"), false);
  assert.equal(adminHasCapability("invalid", "orders:read"), false);
  assert.equal(canCreateRefund("operations"), false);
  assert.equal(canCreateRefund("owner"), true);
});

test("requires one atomic token consumer and issues one grant under concurrency", async () => {
  const now = new Date("2026-08-10T20:00:00.000Z");
  const token = await createOneTimeAccessToken(now);
  const base = {
    orderId: "ord_concurrent",
    providedToken: token.token,
    storedTokenHash: token.tokenHash,
    consumedAt: null,
    revokedAt: null,
    expiresAt: token.expiresAt,
    now,
  };

  assert.equal(await verifyGuestOrderGrant(base), null);

  let consumed = false;
  const consumeTokenAtomically = async () => {
    if (consumed) return false;
    consumed = true;
    return true;
  };
  const results = await Promise.all([
    verifyGuestOrderGrant({ ...base, consumeTokenAtomically }),
    verifyGuestOrderGrant({ ...base, consumeTokenAtomically }),
  ]);

  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(
    results.filter((grant) =>
      canReadOrder(
        { kind: "guest-order", grant },
        { orderId: "ord_concurrent", customerId: null },
      ),
    ).length,
    1,
  );
});

test("builds deterministic transactional messages and rejects incomplete input", async () => {
  const email = await buildTransactionalEmail({
    kind: "payment-confirmation",
    eventId: "evt_payment_1",
    locale: "fr",
    recipientEmail: " CLIENT@EXAMPLE.COM ",
    orderNumber: "AJ-2026-0001",
  });
  assert.equal(email.recipientEmail, "client@example.com");
  assert.match(
    email.deduplicationKey,
    /^payment-confirmation:evt_payment_1:AJ-2026-0001:[0-9a-f]{64}$/,
  );
  assert.match(email.subject, /AJ-2026-0001/);
  await assert.rejects(
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
    /server-owned carrier policy/,
  );
  await assert.rejects(
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
  const accessToken = "A".repeat(43);
  const access = await buildTransactionalEmail({
    kind: "account-access",
    eventId: "evt_access_1",
    locale: "fr",
    recipientEmail: "client@example.com",
    accessUrl: `https://ajluxurystore.com/account/access?token=${accessToken}`,
  });
  assert.match(
    access.deduplicationKey,
    /^account-access:evt_access_1:[0-9a-f]{64}$/,
  );
  assert.doesNotMatch(access.deduplicationKey, /token|client@/i);

  await assert.rejects(
    () =>
      buildTransactionalEmail({
        kind: "account-access",
        eventId: "evt_access_evil",
        locale: "fr",
        recipientEmail: "client@example.com",
        accessUrl: `https://evil.example/account/access?token=${accessToken}`,
        allowedUrlHosts: ["evil.example"],
      }),
    /accessUrl/,
  );
  await assert.rejects(
    () =>
      buildTransactionalEmail({
        kind: "account-access",
        eventId: "evt_access_www",
        locale: "fr",
        recipientEmail: "client@example.com",
        accessUrl: `https://www.ajluxurystore.com/account/access?token=${accessToken}`,
      }),
    /accessUrl/,
  );
  await assert.rejects(
    () =>
      buildTransactionalEmail({
        kind: "unknown-kind",
        eventId: "evt_invalid_kind",
        locale: "fr",
        recipientEmail: "client@example.com",
      }),
    /kind/,
  );
  await assert.rejects(
    () =>
      buildTransactionalEmail({
        kind: "payment-confirmation",
        eventId: "evt_invalid_locale",
        locale: "de",
        recipientEmail: "client@example.com",
        orderNumber: "AJ-2026-0001",
      }),
    /locale/,
  );

  const differentOrder = await buildTransactionalEmail({
    kind: "payment-confirmation",
    eventId: "evt_payment_1",
    locale: "fr",
    recipientEmail: "client@example.com",
    orderNumber: "AJ-2026-0002",
  });
  const differentRecipient = await buildTransactionalEmail({
    kind: "payment-confirmation",
    eventId: "evt_payment_1",
    locale: "fr",
    recipientEmail: "other@example.com",
    orderNumber: "AJ-2026-0001",
  });
  assert.notEqual(email.deduplicationKey, differentOrder.deduplicationKey);
  assert.notEqual(email.deduplicationKey, differentRecipient.deduplicationKey);
});

test("allowlists operational logs and preserves legal-retention gates", () => {
  assert.deepEqual(sanitizeCommerceLogMetadata(null), {});
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
  assert.deepEqual(
    sanitizeCommerceLogMetadata({
      event: "payment-reconciled",
      zone: 75001,
      attempt: 75001,
      durationMs: 612345678,
      status: "Adam",
      provider: "ok",
      providerEventType: "evt",
      errorCode: "E1",
    }),
    { event: "payment-reconciled" },
  );
  assert.deepEqual(
    sanitizeCommerceLogMetadata({
      event: "secret",
      status: "Bob",
      zone: "secret",
      attempt: "2",
      durationMs: "20",
      provider: "sk_live_secret",
      providerEventType: "bearer-secret",
      errorCode: "token",
    }),
    {},
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
