import assert from "node:assert/strict";
import test from "node:test";
import {
  createSendcloudProviderPorts,
  parseSendcloudDeliveryOptions,
  parseSendcloudServicePoints,
} from "../lib/commerce/sendcloud-provider.ts";
import { DeliveryProviderError } from "../lib/commerce/delivery-provider.ts";

// Response fixture follows Sendcloud's documented StandardDeliveryOption example.
function offer(overrides = {}) {
  return {
    id: "431c1736-9a8f-480a-bf27-234016918417",
    title: "DHL Delivery - Standard",
    internal_title: "standard_delivery_dhl",
    description: "Reliable and cost-effective delivery for your order",
    delivery_method_type: "standard_delivery",
    cut_off_time: "2024-11-27T15:00:00+01:00",
    checkout_identifier: { type: "shipping_option_code", value: "dhl:complete/standard" },
    shipping_rate: { value: "5.00", currency: "EUR" },
    carrier: { code: "dhl", name: "DHL", logo_url: "https://sendcloud.example/dhl/logo.svg" },
    delivery_dates: null,
    lead_time_hours: {
      p10: 48, p20: 48, p30: 72, p40: 72, p50: 96,
      p60: 96, p70: 120, p80: 120, p90: 144, p95: 168,
    },
    sustainability_rating: "high",
    ...overrides,
  };
}

function servicePoint(overrides = {}) {
  const openingTimes = {
    monday: [{ start_time: "09:00", end_time: "18:00" }],
    tuesday: [{ start_time: "09:00", end_time: "18:00" }],
    wednesday: [{ start_time: "09:00", end_time: "18:00" }],
    thursday: [{ start_time: "09:00", end_time: "18:00" }],
    friday: [{ start_time: "09:00", end_time: "18:00" }],
    saturday: null,
    sunday: null,
  };
  return {
    id: 123,
    name: "Bureau de poste démo",
    carrier: { code: "colissimo", name: "Colissimo", logo_url: "https://example.test/logo", icon_url: "https://example.test/icon" },
    carrier_service_point_id: "FR-123",
    carrier_shop_type: "post_office",
    general_shop_type: "post_office",
    address: { street: "Rue de Rivoli", house_number: "1", postal_code: "75001", city: "Paris", country_code: "FR" },
    position: { latitude: 48.8566, longitude: 2.3522 },
    contact: { email: "", phone: "" },
    opening_times: openingTimes,
    is_open_tomorrow: true,
    next_open_at: "2099-08-15T09:00:00+02:00",
    is_expired: false,
    distance: 85,
    ...overrides,
  };
}

function servicePointEnvelope(results) {
  return {
    data: {
      results,
      geocoding: { status: "matched", precision: "postal_code", formatted_address: "75001 Paris, France" },
    },
  };
}

test("Sendcloud delivery parser accepts only the documented V3 option shape", async () => {
  const parsed = await parseSendcloudDeliveryOptions({
    configuration_id: "configuration_1",
    delivery_options: [offer()],
  }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" });
  assert.equal(parsed[0].providerCode, "sendcloud");
  assert.equal(parsed[0].amountCents, 500);
  assert.equal(parsed[0].estimatedDaysMax, 6);
  assert.equal(parsed[0].expiresAt, "2024-11-27T12:30:00.000Z");
  assert.match(parsed[0].responseFingerprint, /^[0-9a-f]{64}$/);
  const integerPrice = await parseSendcloudDeliveryOptions({
    configuration_id: "configuration_1",
    delivery_options: [offer({ shipping_rate: { value: "5", currency: "EUR" } })],
  }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" });
  const singleDecimalPrice = await parseSendcloudDeliveryOptions({
    configuration_id: "configuration_1",
    delivery_options: [offer({ shipping_rate: { value: "5.0", currency: "EUR" } })],
  }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" });
  assert.equal(integerPrice[0].amountCents, 500);
  assert.equal(singleDecimalPrice[0].amountCents, 500);
  await assert.rejects(
    () => parseSendcloudDeliveryOptions({ configuration_id: "configuration_1", delivery_options: [offer({ shipping_rate: { value: "12.999", currency: "EUR" } })] }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" }),
    DeliveryProviderError,
  );
  await assert.rejects(
    () => parseSendcloudDeliveryOptions({
      configuration_id: "configuration_1",
      delivery_options: [offer({ lead_time_hours: { ...offer().lead_time_hours, p50: 96.5 } })],
    }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" }),
    DeliveryProviderError,
  );
  await assert.rejects(
    () => parseSendcloudDeliveryOptions({
      configuration_id: "configuration_1",
      delivery_options: [offer({ lead_time_hours: { ...offer().lead_time_hours, p95: Number.MAX_VALUE } })],
    }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" }),
    DeliveryProviderError,
  );
  await assert.rejects(
    () => parseSendcloudDeliveryOptions({ configuration_id: "configuration_1", delivery_options: [offer({ injected: true })] }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" }),
    DeliveryProviderError,
  );
});

test("Sendcloud parser omits only options whose documented lead time or rate is null", async () => {
  const parsed = await parseSendcloudDeliveryOptions({
    configuration_id: "configuration_1",
    delivery_options: [
      offer({ id: "without-lead-time", lead_time_hours: null }),
      offer({ id: "without-rate", shipping_rate: { value: null, currency: "EUR" } }),
      offer(),
    ],
  }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].deliveryMode, "home");
});

test("Sendcloud parser bounds expiry by cut-off and closes unmodelled delivery types", async () => {
  const parsed = await parseSendcloudDeliveryOptions({
    configuration_id: "configuration_1",
    delivery_options: [
      offer({ id: "same-day", delivery_method_type: "same_day_delivery" }),
      offer({ id: "nominated", delivery_method_type: "nominated_day_delivery" }),
      offer({ id: "standard", cut_off_time: "2024-11-27T12:10:00.000Z" }),
    ],
  }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].expiresAt, "2024-11-27T12:10:00.000Z");
  const expired = await parseSendcloudDeliveryOptions({
    configuration_id: "configuration_1",
    delivery_options: [offer({ cut_off_time: "2024-11-27T11:59:59.000Z" })],
  }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" });
  assert.deepEqual(expired, []);
});

test("Sendcloud provider references distinguish carriers sharing one delivery-method id", async () => {
  const sharedId = "shared-delivery-method";
  const parsed = await parseSendcloudDeliveryOptions({
    configuration_id: "configuration_1",
    delivery_options: [
      offer({ id: sharedId }),
      offer({
        id: sharedId,
        carrier: { code: "ups", name: "UPS", logo_url: "https://sendcloud.example/ups/logo.svg" },
        checkout_identifier: { type: "shipping_option_code", value: "ups:standard" },
      }),
    ],
  }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" });
  assert.equal(parsed.length, 2);
  assert.notEqual(parsed[0].providerQuoteReference, parsed[1].providerQuoteReference);
});

test("Sendcloud service-point parser rejects malformed responses", () => {
  const points = parseSendcloudServicePoints(servicePointEnvelope([servicePoint()]));
  assert.equal(points[0].countryCode, "FR");
  assert.deepEqual(
    parseSendcloudServicePoints(servicePointEnvelope([servicePoint({ is_expired: true })])),
    [],
  );
  assert.throws(
    () => parseSendcloudServicePoints([{ name: "missing id" }]),
    DeliveryProviderError,
  );
  for (const id of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    assert.throws(
      () => parseSendcloudServicePoints(servicePointEnvelope([servicePoint({ id })])),
      DeliveryProviderError,
    );
  }
});

test("Sendcloud cancels an oversized declared response before reading", async () => {
  let cancelled = false;
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async () => new Response(new ReadableStream({
      cancel() { cancelled = true; },
    }), { headers: { "Content-Length": String(300 * 1024) } }),
  );
  await assert.rejects(() => ports.servicePoints.servicePoints({
    requestId: "service-point-oversized",
    providerQuoteReference: "rate_123",
    countryCode: "FR",
    postalCode: "75001",
    city: "Paris",
    carrierCode: "colissimo",
  }), (error) => error instanceof DeliveryProviderError && error.code === "MALFORMED_RESPONSE");
  assert.equal(cancelled, true);
});

test("real Sendcloud ports fail before network when credentials are absent", () => {
  let called = false;
  assert.throws(
    () => createSendcloudProviderPorts({}, async () => {
      called = true;
      return Response.json({});
    }),
    (error) => error instanceof DeliveryProviderError && error.code === "NOT_CONFIGURED",
  );
  assert.equal(called, false);
});

test("Sendcloud service points use current V3 and never follow redirects", async () => {
  let call;
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async (url, init) => {
      call = { url, init };
      return Response.json(servicePointEnvelope([]));
    },
  );
  await ports.servicePoints.servicePoints({
    requestId: "service-point-attempt-0001",
    providerQuoteReference: "rate_123",
    countryCode: "FR",
    postalCode: "75001",
    city: "Paris",
    carrierCode: "colissimo",
  });
  assert.match(call.url, /^https:\/\/panel\.sendcloud\.sc\/api\/v3\/service-points\?/);
  assert.match(call.url, /country_code=FR/);
  assert.match(call.url, /carrier_code=colissimo/);
  assert.match(call.url, /address_postal_code=75001/);
  assert.match(call.url, /address_city=Paris/);
  assert.match(call.url, /limit=25/);
  assert.equal(call.init.method, "GET");
  assert.equal(call.init.redirect, "error");
  assert.equal(call.init.credentials, undefined);
  assert.match(call.init.headers.Authorization, /^Basic /);
});

test("Sendcloud quote request matches the documented V3 request contract", async () => {
  let call;
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async (url, init) => {
      call = { url, init };
      return Response.json({ configuration_id: "configuration_1", delivery_options: [] });
    },
  );
  await ports.quotes.quote({
    requestId: "quote-attempt-0001",
    now: "2099-08-14T12:00:00.000Z",
    ttlSeconds: 1800,
    originCountryCode: "FR",
    dutiesTerms: "EU_INCLUDED",
    subtotalCents: 5998,
    destination: { countryCode: "DE", postalCode: "10115", city: "Berlin" },
    parcel: {
      profileCode: "AJL_ENVELOPE_2_ITEMS_V1",
      sourceVersion: "client-validated-2026-08-13",
      itemCount: 2,
      weightGrams: 250,
      lengthMm: 400,
      widthMm: 320,
      heightMm: 40,
    },
  });
  assert.equal(call.url, "https://panel.sendcloud.sc/api/v3/checkout/delivery-options");
  assert.deepEqual(JSON.parse(call.init.body), {
    total_weight: { value: "250", unit: "g" },
    total_price: { value: "59.98" },
    from_address: { country_code: "FR" },
    to_address: { country_code: "DE", postal_code: "10115" },
    parcel_dimensions: { length: "40", width: "32", height: "4", unit: "cm" },
  });
  assert.equal(call.init.headers["Idempotency-Key"], undefined);
});

test("Sendcloud response streaming cancels above the byte limit without Content-Length", async () => {
  let cancelled = false;
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(200 * 1024));
        controller.enqueue(new Uint8Array(100 * 1024));
      },
      cancel() { cancelled = true; },
    })),
  );
  await assert.rejects(() => ports.quotes.quote({
    requestId: "quote-attempt-oversized",
    now: "2024-11-27T12:00:00.000Z",
    ttlSeconds: 1800,
    originCountryCode: "FR",
    dutiesTerms: "EU_INCLUDED",
    subtotalCents: 5998,
    destination: { countryCode: "DE", postalCode: "10115", city: "Berlin" },
    parcel: {
      profileCode: "AJL_ENVELOPE_1_ITEM_V1",
      sourceVersion: "client-validated-2026-08-13",
      itemCount: 1,
      weightGrams: 150,
      lengthMm: 400,
      widthMm: 320,
      heightMm: 40,
    },
  }), (error) => error instanceof DeliveryProviderError && error.code === "MALFORMED_RESPONSE");
  assert.equal(cancelled, true);
});
