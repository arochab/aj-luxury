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
  guestOrderGrantAvailability,
  verifyGuestOrderGrant,
} from "../lib/commerce/access-control.ts";
import { createOneTimeAccessToken } from "../lib/commerce/account-security.ts";
import {
  getLaunchVariant,
  launchVariants,
} from "../lib/commerce/catalog.ts";
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
import { products, sizes as catalogueSizes } from "../lib/products.ts";

function assertDeeplyFrozen(value, seen = new Set()) {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    seen.has(value)
  ) {
    return;
  }

  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value, seen);
    }
  }
}

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

test("deep-freezes products and launch variants at every runtime layer", () => {
  assertDeeplyFrozen(products);
  assertDeeplyFrozen(launchVariants);

  const variantId = launchVariants[0].id;
  const originalAmount = launchVariants[0].price.amountCents;
  const originalImage = products[0].gallery[0].src;
  assert.throws(() => {
    launchVariants[0].price.amountCents = 1;
  }, TypeError);
  assert.throws(() => {
    launchVariants[0].options[0].value = "MUTATED";
  }, TypeError);
  assert.throws(() => {
    products[0].gallery[0].src = "/mutated.webp";
  }, TypeError);
  assert.throws(() => {
    products[0].benefits[0].title = "MUTATED";
  }, TypeError);

  assert.equal(getLaunchVariant(variantId)?.price.amountCents, originalAmount);
  assert.equal(products[0].gallery[0].src, originalImage);
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
  assert.equal(
    resolveLaunchShippingScope({ countryCode: "US" }).reason,
    "invalid-address-input",
  );
  assert.equal(
    resolveLaunchShippingScope({ countryCode: "US", regionCode: "XX" }).reason,
    "invalid-address-input",
  );
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

test("snapshots hostile shipping inputs exactly once and fails closed on traps", () => {
  const addressReads = new Map();
  const alternatingAddress = new Proxy(
    { countryCode: "US", postalCode: undefined, regionCode: "PR" },
    {
      get(target, key, receiver) {
        addressReads.set(key, (addressReads.get(key) ?? 0) + 1);
        if (key === "regionCode") {
          return addressReads.get(key) === 1 ? "PR" : "CA";
        }
        return Reflect.get(target, key, receiver);
      },
    },
  );

  assert.equal(
    resolveLaunchShippingScope(alternatingAddress).reason,
    "special-territory-needs-explicit-validation",
  );
  assert.deepEqual(Object.fromEntries(addressReads), {
    countryCode: 1,
    postalCode: 1,
    regionCode: 1,
  });

  const activationReads = new Map();
  const countReads = (target, prefix) =>
    new Proxy(target, {
      get(object, key, receiver) {
        const label = `${prefix}${String(key)}`;
        activationReads.set(label, (activationReads.get(label) ?? 0) + 1);
        return Reflect.get(object, key, receiver);
      },
    });
  const parcel = countReads(
    {
      weightGrams: 250,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 5,
      originCountryCode: "FR",
    },
    "parcel.",
  );
  const activation = countReads(
    {
      zone: "EU",
      carrierServiceCode: "test-carrier",
      priceCents: 500,
      estimatedDaysMin: 2,
      estimatedDaysMax: 4,
      dutiesTerms: "EU_INCLUDED",
      parcel,
    },
    "input.",
  );
  assert.deepEqual(getZoneActivationBlockers(activation), []);
  for (const count of activationReads.values()) {
    assert.equal(count, 1);
  }

  const throwingAddress = new Proxy(
    {},
    {
      get() {
        throw new Error("trap");
      },
    },
  );
  assert.equal(
    resolveLaunchShippingScope(throwingAddress).reason,
    "invalid-address-input",
  );
  assert.deepEqual(
    getZoneActivationBlockers(throwingAddress),
    [
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
    ],
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

test("enforces customer ownership and lean admin roles", () => {
  const order = { orderId: "ord_1", customerId: "cus_a" };
  assert.equal(canReadOrder({ kind: "customer", customerId: "cus_a" }, order), true);
  assert.equal(canReadOrder({ kind: "customer", customerId: "cus_b" }, order), false);
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

test("keeps guest grants closed until a persistent D1 consumer exists", async () => {
  const now = new Date("2026-08-10T20:00:00.000Z");
  const token = await createOneTimeAccessToken(now);
  let callerCallbackCount = 0;
  const callerControlledCallback = async () => {
    callerCallbackCount += 1;
    return true;
  };
  const base = {
    orderId: "ord_concurrent",
    providedToken: token.token,
    storedTokenHash: token.tokenHash,
    consumedAt: null,
    revokedAt: null,
    expiresAt: token.expiresAt,
    now,
    consumeTokenAtomically: callerControlledCallback,
  };

  const results = await Promise.all([
    verifyGuestOrderGrant(base),
    verifyGuestOrderGrant(base),
  ]);

  assert.deepEqual(results, [null, null]);
  assert.equal(callerCallbackCount, 0);
  assert.deepEqual(guestOrderGrantAvailability, {
    available: false,
    reason: "persistent-d1-token-store-required",
  });

  let grantReads = 0;
  const alternatingActor = new Proxy(
    { kind: "guest-order" },
    {
      get(target, key, receiver) {
        if (key === "grant") {
          grantReads += 1;
          return grantReads % 2 === 1
            ? { orderId: "ord_source" }
            : { orderId: "ord_target" };
        }
        return Reflect.get(target, key, receiver);
      },
    },
  );
  assert.equal(
    canReadOrder(
      alternatingActor,
      { orderId: "ord_target", customerId: null },
    ),
    false,
  );
  assert.equal(grantReads, 0);
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
  assert.equal(email.deduplicationPersisted, false);
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
  assert.equal(access.deduplicationPersisted, false);

  for (const recipientEmail of [
    "client@example.com,attacker",
    "client,tag@example.com",
    "client@example.com;attacker",
  ]) {
    await assert.rejects(
      () =>
        buildTransactionalEmail({
          kind: "payment-confirmation",
          eventId: "evt_invalid_recipient",
          locale: "fr",
          recipientEmail,
          orderNumber: "AJ-2026-0001",
        }),
      /recipient/,
    );
  }

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

  const metadataWithThrowingAccessors = {
    event: "payment-reconciled",
    get rawWebhookPayload() {
      throw new Error("must never be read");
    },
    get status() {
      throw new Error("must never be invoked");
    },
  };
  assert.deepEqual(
    sanitizeCommerceLogMetadata(metadataWithThrowingAccessors),
    { event: "payment-reconciled" },
  );
  assert.deepEqual(
    sanitizeCommerceLogMetadata(
      new Proxy(
        {},
        {
          ownKeys() {
            throw new Error("hostile ownKeys trap");
          },
        },
      ),
    ),
    {},
  );
  const revokedMetadata = Proxy.revocable({}, {});
  revokedMetadata.revoke();
  assert.deepEqual(sanitizeCommerceLogMetadata(revokedMetadata.proxy), {});

  assert.equal(
    canEraseCommerceRecord({ legalRetentionRequired: true, activeDispute: false }),
    false,
  );
  assert.equal(
    canEraseCommerceRecord({ legalRetentionRequired: false, activeDispute: false }),
    true,
  );
  for (const invalidInput of [
    {},
    null,
    undefined,
    [],
    "false",
    0,
    { legalRetentionRequired: "false", activeDispute: false },
    { legalRetentionRequired: false, activeDispute: 0 },
  ]) {
    assert.equal(canEraseCommerceRecord(invalidInput), false);
  }
  assert.equal(
    canEraseCommerceRecord(
      new Proxy(
        { legalRetentionRequired: false, activeDispute: false },
        {},
      ),
    ),
    false,
  );
  assert.equal(
    canEraseCommerceRecord(
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error("hostile prototype trap");
          },
        },
      ),
    ),
    false,
  );
});
