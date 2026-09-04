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

function shippingProduct({
  carrier = "colissimo",
  code = "colissimo:international/home_delivery,signature",
  lastMile = "home_delivery",
  methodIds = [8101],
  methodLastMile,
  maxDimensions = { length: 100, width: 70, height: 58, unit: "centimeter" },
} = {}) {
  return {
    name: `${carrier} product`,
    code,
    carrier,
    service_points_carrier: carrier,
    weight_range: { min_weight: 1, max_weight: 30_000 },
    available_functionalities: { last_mile: [lastMile] },
    methods: methodIds.map((id) => ({
      id,
      name: `${carrier} method ${id}`,
      functionalities: methodLastMile === undefined ? {} : { last_mile: methodLastMile },
      shipping_product_code: code,
      properties: {
        min_weight: 1,
        max_weight: 30_000,
        max_dimensions: maxDimensions,
      },
      lead_time_hours: { FR: { DE: 48 } },
    })),
  };
}

function standaloneShippingOption({
  code = "colissimo:international/home_delivery,signature",
  carrierCode = "colissimo",
  carrierName = "Colissimo",
  price = "18.42",
  leadTime = 120,
} = {}) {
  return {
    code,
    name: `${carrierName} international`,
    carrier: { code: carrierCode, name: carrierName },
    product: { code: `${carrierCode}:international`, name: `${carrierName} international` },
    functionalities: { last_mile: "home_delivery" },
    contract: { id: 60, client_id: "", carrier_code: carrierCode, name: "Sendcloud" },
    weight: {
      min: { value: "0.001", unit: "kg" },
      max: { value: "30.000", unit: "kg" },
    },
    max_dimensions: { length: "100.00", width: "70.00", height: "58.00", unit: "cm" },
    billed_weight: { unit: "kg", value: "0.250", volumetric: false },
    requirements: { fields: [], export_documents: true, is_service_point_required: false },
    charging_type: "label_creation",
    quotes: [{
      weight: {
        min: { value: "0.001", unit: "kg" },
        max: { value: "30.000", unit: "kg" },
      },
      price: {
        breakdown: [{
          type: "price_without_insurance",
          label: "Label",
          price: { value: price, currency: "EUR" },
        }],
        total: { value: price, currency: "EUR" },
      },
      lead_time: leadTime,
    }],
  };
}

function quoteRequest(overrides = {}) {
  return {
    requestId: "quote-attempt-eu-fallback",
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
    ...overrides,
  };
}

function nullRateOffer({
  id,
  carrierCode,
  carrierName,
  shippingOptionCode,
  deliveryMethodType,
}) {
  return offer({
    id,
    carrier: { code: carrierCode, logo_url: `https://example.test/${carrierCode}.svg`, name: carrierName },
    checkout_identifier: { type: "shipping_option_code", value: shippingOptionCode },
    delivery_method_type: deliveryMethodType,
    cut_off_time: null,
    shipping_rate: { value: null, currency: "EUR" },
  });
}

test("Sendcloud delivery parser accepts only the documented V3 option shape", async () => {
  const parsed = await parseSendcloudDeliveryOptions({
    configuration_id: "configuration_1",
    delivery_options: [offer()],
  }, { now: "2024-11-27T12:00:00.000Z", ttlSeconds: 1800, dutiesTerms: "EU_INCLUDED" });
  assert.equal(parsed[0].providerCode, "sendcloud");
  assert.equal(parsed[0].displayName, "DHL");
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

test("Sendcloud deduplicates V2 price lookups and bounds fallback concurrency", async () => {
  let active = 0;
  let peak = 0;
  let calls = 0;
  const uniqueOptions = Array.from({ length: 12 }, (_, index) => ({
    carrierCode: `carrier${index}`,
    carrierName: `Carrier ${index}`,
    shippingOptionCode: `carrier${index}:home`,
  }));
  const deliveryOptions = uniqueOptions.flatMap((option, index) => [
    nullRateOffer({
      ...option,
      id: `option-${index}-a`,
      deliveryMethodType: "standard_delivery",
    }),
    nullRateOffer({
      ...option,
      id: `option-${index}-b`,
      deliveryMethodType: "standard_delivery",
    }),
  ]);
  const parsed = await parseSendcloudDeliveryOptions({
    configuration_id: "configuration_bounded_fallback",
    delivery_options: deliveryOptions,
  }, {
    now: "2024-11-27T12:00:00.000Z",
    ttlSeconds: 1800,
    dutiesTerms: "EU_INCLUDED",
    async resolveFallbackPrice() {
      calls += 1;
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { amountCents: 500, sourceFingerprint: "a".repeat(64) };
    },
  });
  assert.equal(parsed.length, 24);
  assert.equal(calls, 12);
  assert.equal(peak, 4);
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
  assert.equal(call.init.redirect, "manual");
  assert.equal(call.init.credentials, undefined);
  assert.match(call.init.headers.Authorization, /^Basic /);
});

test("Sendcloud retries one transient read failure and only the failing provider call", async (t) => {
  const request = {
    requestId: "service-point-retry-0001",
    providerQuoteReference: "rate_123",
    countryCode: "FR",
    postalCode: "75001",
    city: "Paris",
    carrierCode: "colissimo",
  };

  await t.test("network failure then success", async () => {
    let calls = 0;
    const ports = createSendcloudProviderPorts(
      { publicKey: "public_key", secretKey: "x".repeat(32) },
      async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("transient network failure");
        return Response.json(servicePointEnvelope([]));
      },
    );
    assert.deepEqual(await ports.servicePoints.servicePoints(request), []);
    assert.equal(calls, 2);
  });

  await t.test("503 then success", async () => {
    let calls = 0;
    const ports = createSendcloudProviderPorts(
      { publicKey: "public_key", secretKey: "x".repeat(32) },
      async () => {
        calls += 1;
        return calls === 1
          ? new Response("temporarily unavailable", { status: 503 })
          : Response.json(servicePointEnvelope([]));
      },
    );
    assert.deepEqual(await ports.servicePoints.servicePoints(request), []);
    assert.equal(calls, 2);
  });

  await t.test("400 stays fail-closed without retry", async () => {
    let calls = 0;
    const ports = createSendcloudProviderPorts(
      { publicKey: "public_key", secretKey: "x".repeat(32) },
      async () => {
        calls += 1;
        return new Response("invalid request", { status: 400 });
      },
    );
    await assert.rejects(
      () => ports.servicePoints.servicePoints(request),
      (error) => error instanceof DeliveryProviderError && error.code === "REJECTED",
    );
    assert.equal(calls, 1);
  });

  await t.test("two transient failures remain bounded", async () => {
    let calls = 0;
    const ports = createSendcloudProviderPorts(
      { publicKey: "public_key", secretKey: "x".repeat(32) },
      async () => {
        calls += 1;
        return new Response("temporarily unavailable", { status: 503 });
      },
    );
    await assert.rejects(
      () => ports.servicePoints.servicePoints(request),
      (error) => error instanceof DeliveryProviderError && error.code === "OUTCOME_UNKNOWN",
    );
    assert.equal(calls, 2);
  });
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
    to_address: { country_code: "DE", postal_code: "10115", city: "Berlin" },
    parcel_dimensions: { length: "40", width: "32", height: "4", unit: "cm" },
  });
  assert.equal(call.init.headers["Idempotency-Key"], undefined);
});

test("Sendcloud uses the attested sender for precise Belgium and United States quotes", async (t) => {
  const cases = [
    {
      name: "Belgium",
      destination: { countryCode: "BE", postalCode: "1000", city: "Bruxelles" },
      dutiesTerms: "EU_INCLUDED",
      price: "7.42",
    },
    {
      name: "United States",
      destination: { countryCode: "US", postalCode: "94105", city: "San Francisco" },
      dutiesTerms: "DAP",
      price: "18.42",
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const calls = [];
      const ports = createSendcloudProviderPorts(
        {
          publicKey: "public_key",
          secretKey: "x".repeat(32),
          senderAddressId: "12345",
          senderAddressAttestation: "3 A rue Principale|67130|Belmont|FR",
        },
        async (input, init) => {
          const url = new URL(String(input));
          calls.push({ url, init });
          if (url.pathname === "/api/v3/checkout/delivery-options") {
            return Response.json({
              configuration_id: `configuration_${scenario.destination.countryCode.toLowerCase()}`,
              delivery_options: [nullRateOffer({
                id: `colissimo-${scenario.destination.countryCode.toLowerCase()}-home`,
                carrierCode: "colissimo",
                carrierName: "Colissimo",
                shippingOptionCode: "colissimo:international/home_delivery,signature",
                deliveryMethodType: "standard_delivery",
              })],
            });
          }
          if (url.pathname === "/api/v2/shipping-products") {
            return Response.json([shippingProduct({ methodIds: [7601] })]);
          }
          if (url.pathname === "/api/v2/shipping-price") {
            return Response.json([{
              price: scenario.price,
              currency: "EUR",
              to_country: scenario.destination.countryCode,
              breakdown: [],
            }]);
          }
          return Response.json({}, { status: 404 });
        },
      );

      const quotes = await ports.quotes.quote(quoteRequest({
        requestId: `quote-${scenario.destination.countryCode.toLowerCase()}-precise-origin`,
        dutiesTerms: scenario.dutiesTerms,
        destination: scenario.destination,
      }));
      assert.equal(quotes.length, 1);
      assert.equal(quotes[0].carrierCode, "colissimo");
      assert.equal(quotes[0].deliveryMode, "home");
      assert.equal(quotes[0].dutiesTerms, scenario.dutiesTerms);
      assert.equal(quotes[0].amountCents, Number(scenario.price.replace(".", "")));

      const checkoutCall = calls.find(({ url }) =>
        url.pathname === "/api/v3/checkout/delivery-options");
      assert.deepEqual(JSON.parse(checkoutCall.init.body).from_address, {
        sender_address_id: 12345,
      });
      assert.deepEqual(JSON.parse(checkoutCall.init.body).to_address, {
        country_code: scenario.destination.countryCode,
        postal_code: scenario.destination.postalCode,
        city: scenario.destination.city,
      });
      for (const { url } of calls.filter(({ url }) =>
        url.pathname === "/api/v2/shipping-products" ||
        url.pathname === "/api/v2/shipping-price")) {
        assert.equal(url.searchParams.get("from_country"), "FR");
        assert.equal(url.searchParams.get("from_postal_code"), "67130");
        assert.equal(url.searchParams.get("to_country"), scenario.destination.countryCode);
        assert.equal(url.searchParams.get("to_postal_code"), scenario.destination.postalCode);
      }
    });
  }
});

test("Sendcloud rejects a partial or country-mismatched sender configuration before quoting", async (t) => {
  await t.test("partial attestation", () => {
    assert.throws(
      () => createSendcloudProviderPorts({
        publicKey: "public_key",
        secretKey: "x".repeat(32),
        senderAddressId: "12345",
      }),
      (error) => error instanceof DeliveryProviderError && error.code === "NOT_CONFIGURED",
    );
  });
  await t.test("country mismatch", async () => {
    let calls = 0;
    const ports = createSendcloudProviderPorts({
      publicKey: "public_key",
      secretKey: "x".repeat(32),
      senderAddressId: "12345",
      senderAddressAttestation: "1 Main Street|10001|New York|US",
    }, async () => {
      calls += 1;
      return Response.json({ configuration_id: "unused", delivery_options: [] });
    });
    await assert.rejects(
      () => ports.quotes.quote(quoteRequest()),
      (error) => error instanceof DeliveryProviderError && error.code === "REJECTED",
    );
    assert.equal(calls, 0);
  });
});

test("Sendcloud resolves null EU V3 rates from exact V2 products and EUR prices", async () => {
  const calls = [];
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      if (url.pathname === "/api/v3/checkout/delivery-options") {
        return Response.json({
          configuration_id: "configuration_eu",
          delivery_options: [
            nullRateOffer({
              id: "colissimo-home",
              carrierCode: "colissimo",
              carrierName: "Colissimo",
              shippingOptionCode: "colissimo:international/home_delivery,signature",
              deliveryMethodType: "standard_delivery",
            }),
            nullRateOffer({
              id: "mondial-point",
              carrierCode: "mondial_relay",
              carrierName: "Mondial Relay",
              shippingOptionCode: "mondial_relay:service_point,international_dualapi/c2c",
              deliveryMethodType: "service_point_delivery",
            }),
          ],
        });
      }
      if (url.pathname === "/api/v2/shipping-products") {
        const carrier = url.searchParams.get("carrier");
        const lastMile = url.searchParams.get("last_mile");
        if (carrier === "colissimo" && lastMile === "home_delivery") {
          return Response.json([shippingProduct({ methodIds: [8101] })]);
        }
        if (carrier === "mondial_relay" && lastMile === "service_point") {
          return Response.json([shippingProduct({
            carrier: "mondial_relay",
            code: "mondial_relay:service_point,international_dualapi",
            lastMile: "service_point",
            methodIds: [8202],
            maxDimensions: { length: 120, width: 0, height: 0, unit: "centimeter" },
          })]);
        }
      }
      if (url.pathname === "/api/v2/shipping-price") {
        const methodId = url.searchParams.get("shipping_method_id");
        return Response.json([{
          price: methodId === "8101" ? "10.27" : "5.33",
          currency: "EUR",
          to_country: "DE",
          breakdown: [{ type: "price_without_insurance", label: "Label", value: 10.27 }],
        }]);
      }
      return Response.json({}, { status: 404 });
    },
  );

  const quotes = await ports.quotes.quote(quoteRequest());
  assert.deepEqual(quotes.map((quote) => ({
    amountCents: quote.amountCents,
    carrierCode: quote.carrierCode,
    deliveryMode: quote.deliveryMode,
  })), [
    { amountCents: 1027, carrierCode: "colissimo", deliveryMode: "home" },
    { amountCents: 533, carrierCode: "mondial_relay", deliveryMode: "service_point" },
  ]);
  assert.equal(calls.length, 5);
  const productCalls = calls.filter(({ url }) => url.pathname === "/api/v2/shipping-products");
  assert.equal(productCalls.length, 2);
  for (const { url, init } of productCalls) {
    assert.equal(url.searchParams.get("from_country"), "FR");
    assert.equal(url.searchParams.get("to_country"), "DE");
    assert.equal(url.searchParams.get("to_postal_code"), "10115");
    assert.equal(url.searchParams.get("weight"), "250");
    assert.equal(url.searchParams.get("weight_unit"), "gram");
    assert.equal(url.searchParams.get("length"), "400");
    assert.equal(url.searchParams.get("length_unit"), "millimeter");
    assert.equal(url.searchParams.get("width"), "320");
    assert.equal(url.searchParams.get("height"), "40");
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "manual");
  }
  const priceCalls = calls.filter(({ url }) => url.pathname === "/api/v2/shipping-price");
  assert.deepEqual(
    priceCalls.map(({ url }) => url.searchParams.get("shipping_method_id")).sort(),
    ["8101", "8202"],
  );
  for (const { url } of priceCalls) {
    assert.equal(url.searchParams.get("from_country"), "FR");
    assert.equal(url.searchParams.get("to_country"), "DE");
    assert.equal(url.searchParams.get("to_postal_code"), "10115");
    assert.equal(url.searchParams.get("weight"), "250");
    assert.equal(url.searchParams.get("weight_unit"), "gram");
  }
});

test("Sendcloud maps Belgium's live Mondial Relay V3 code to its exact international V2 product", async () => {
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v3/checkout/delivery-options") {
        return Response.json({
          configuration_id: "configuration_be",
          delivery_options: [nullRateOffer({
            id: "mondial-point-be",
            carrierCode: "mondial_relay",
            carrierName: "Mondial Relay",
            shippingOptionCode: "mondial_relay:locker_delivery,dualapi",
            deliveryMethodType: "service_point_delivery",
          })],
        });
      }
      if (url.pathname === "/api/v2/shipping-products") {
        return Response.json([shippingProduct({
          carrier: "mondial_relay",
          code: "mondial_relay:service_point,international_dualapi",
          lastMile: "service_point",
          methodIds: [27726],
          maxDimensions: { length: 120, width: 0, height: 0, unit: "centimeter" },
        })]);
      }
      if (url.pathname === "/api/v2/shipping-price") {
        return Response.json([{
          price: "5.33", currency: "EUR", to_country: "BE", breakdown: [],
        }]);
      }
      return Response.json({}, { status: 404 });
    },
  );
  const quotes = await ports.quotes.quote(quoteRequest({
    destination: { countryCode: "BE", postalCode: "1000", city: "Bruxelles" },
  }));
  assert.deepEqual(quotes.map((quote) => ({
    amountCents: quote.amountCents,
    carrierCode: quote.carrierCode,
    deliveryMode: quote.deliveryMode,
    serviceCode: quote.serviceCode,
  })), [{
    amountCents: 533,
    carrierCode: "mondial_relay",
    deliveryMode: "service_point",
    serviceCode: "mondial_relay:locker_delivery,dualapi",
  }]);
});

test("Sendcloud resolves an empty non-EU checkout configuration through exact V3 shipping options", async () => {
  const calls = [];
  const ports = createSendcloudProviderPorts(
    {
      publicKey: "public_key",
      secretKey: "x".repeat(32),
      senderAddressId: "12345",
      senderAddressAttestation: "3 A rue Principale|67130|Belmont|FR",
    },
    async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      if (url.pathname === "/api/v3/checkout/delivery-options") {
        return Response.json({ configuration_id: "configuration_us", delivery_options: [] });
      }
      if (url.pathname === "/api/v3/shipping-options") {
        return Response.json({
          data: [
            standaloneShippingOption(),
            standaloneShippingOption({
              code: "ups:standard",
              carrierCode: "ups",
              carrierName: "UPS",
              price: "12.00",
            }),
          ],
          message: null,
        });
      }
      return Response.json({}, { status: 404 });
    },
  );
  const quotes = await ports.quotes.quote(quoteRequest({
    requestId: "quote-us-standalone",
    dutiesTerms: "DAP",
    destination: { countryCode: "US", postalCode: "10001", city: "New York" },
  }));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url.pathname, "/api/v3/shipping-options");
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    from_address: { country_code: "FR", postal_code: "67130", city: "Belmont" },
    to_address: { country_code: "US", postal_code: "10001", city: "New York" },
    parcels: [{
      dimensions: { length: "40.00", width: "32.00", height: "4.00", unit: "cm" },
      weight: { value: "0.250", unit: "kg" },
    }],
    functionalities: { last_mile: "home_delivery" },
    calculate_quotes: true,
  });
  assert.deepEqual(quotes.map((quote) => ({
    amountCents: quote.amountCents,
    carrierCode: quote.carrierCode,
    deliveryMode: quote.deliveryMode,
    dutiesTerms: quote.dutiesTerms,
    estimatedDaysMin: quote.estimatedDaysMin,
    estimatedDaysMax: quote.estimatedDaysMax,
  })), [{
    amountCents: 1842,
    carrierCode: "colissimo",
    deliveryMode: "home",
    dutiesTerms: "DAP",
    estimatedDaysMin: 5,
    estimatedDaysMax: 5,
  }]);
  assert.deepEqual(JSON.parse(quotes[0].providerQuoteReference), [
    "shipping-options-v3",
    "colissimo:international/home_delivery,signature",
    "colissimo",
    "colissimo:international/home_delivery,signature",
  ]);
  assert.match(quotes[0].responseFingerprint, /^[0-9a-f]{64}$/);
});

test("Sendcloud adds an account-enabled home choice beside a published EU relay choice", async () => {
  const ports = createSendcloudProviderPorts(
    {
      publicKey: "public_key",
      secretKey: "x".repeat(32),
      senderAddressId: "12345",
      senderAddressAttestation: "3 A rue Principale|67130|Belmont|FR",
    },
    async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v3/checkout/delivery-options") {
        return Response.json({
          configuration_id: "configuration_fr_relay",
          delivery_options: [offer({
            id: "mondial-relay-fr",
            carrier: {
              code: "mondial_relay",
              name: "Mondial Relay",
              logo_url: "https://example.test/mondial-relay.svg",
            },
            checkout_identifier: {
              type: "shipping_option_code",
              value: "mondial_relay:locker_delivery,dualapi",
            },
            delivery_method_type: "service_point_delivery",
            cut_off_time: null,
            shipping_rate: { value: "3.44", currency: "EUR" },
          })],
        });
      }
      if (url.pathname === "/api/v3/shipping-options") {
        return Response.json({
          data: [standaloneShippingOption({
            code: "colissimo:home/fr",
            price: "6.61",
            leadTime: 48,
          })],
          message: null,
        });
      }
      return Response.json({}, { status: 404 });
    },
  );
  const quotes = await ports.quotes.quote(quoteRequest({
    requestId: "quote-fr-home-and-relay",
    destination: { countryCode: "FR", postalCode: "75001", city: "Paris" },
  }));
  assert.deepEqual(quotes.map((quote) => ({
    amountCents: quote.amountCents,
    carrierCode: quote.carrierCode,
    deliveryMode: quote.deliveryMode,
  })), [
    { amountCents: 344, carrierCode: "mondial_relay", deliveryMode: "service_point" },
    { amountCents: 661, carrierCode: "colissimo", deliveryMode: "home" },
  ]);
});

test("Sendcloud standalone fallback stays closed on duplicate or unpriced shipping codes", async () => {
  const option = standaloneShippingOption();
  const ports = createSendcloudProviderPorts(
    {
      publicKey: "public_key",
      secretKey: "x".repeat(32),
      senderAddressId: "12345",
      senderAddressAttestation: "3 A rue Principale|67130|Belmont|FR",
    },
    async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v3/checkout/delivery-options") {
        return Response.json({ configuration_id: "configuration_us", delivery_options: [] });
      }
      return Response.json({
        data: [option, { ...option }, standaloneShippingOption({
          code: "chronopost:unpriced",
          carrierCode: "chronopost",
          carrierName: "Chronopost",
          price: "0.00",
        })],
        message: null,
      });
    },
  );
  assert.deepEqual(await ports.quotes.quote(quoteRequest({
    dutiesTerms: "DAP",
    destination: { countryCode: "US", postalCode: "10001", city: "New York" },
  })), []);
});

test("Sendcloud preserves all four published France carrier and delivery-mode combinations", async () => {
  const calls = [];
  const methodByCombination = new Map([
    ["colissimo:home_delivery", 7101],
    ["colissimo:service_point", 7102],
    ["mondial_relay:home_delivery", 7201],
    ["mondial_relay:service_point", 7202],
  ]);
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname === "/api/v3/checkout/delivery-options") {
        return Response.json({
          configuration_id: "configuration_fr",
          delivery_options: [
            nullRateOffer({
              id: "colissimo-home",
              carrierCode: "colissimo",
              carrierName: "Colissimo",
              shippingOptionCode: "colissimo:france/home_delivery",
              deliveryMethodType: "standard_delivery",
            }),
            nullRateOffer({
              id: "colissimo-point",
              carrierCode: "colissimo",
              carrierName: "Colissimo",
              shippingOptionCode: "colissimo:france/service_point",
              deliveryMethodType: "service_point_delivery",
            }),
            nullRateOffer({
              id: "mondial-home",
              carrierCode: "mondial_relay",
              carrierName: "Mondial Relay",
              shippingOptionCode: "mondial_relay:france/home_delivery/c2c",
              deliveryMethodType: "standard_delivery",
            }),
            nullRateOffer({
              id: "mondial-point",
              carrierCode: "mondial_relay",
              carrierName: "Mondial Relay",
              shippingOptionCode: "mondial_relay:france/service_point/c2c",
              deliveryMethodType: "service_point_delivery",
            }),
          ],
        });
      }
      if (url.pathname === "/api/v2/shipping-products") {
        const carrier = url.searchParams.get("carrier");
        const lastMile = url.searchParams.get("last_mile");
        const methodId = methodByCombination.get(`${carrier}:${lastMile}`);
        if (!methodId) return Response.json([]);
        const v3Code = carrier === "colissimo"
          ? `colissimo:france/${lastMile === "home_delivery" ? "home_delivery" : "service_point"}`
          : `mondial_relay:france/${lastMile === "home_delivery" ? "home_delivery" : "service_point"}`;
        return Response.json([shippingProduct({
          carrier,
          code: v3Code,
          lastMile,
          methodIds: [methodId],
        })]);
      }
      if (url.pathname === "/api/v2/shipping-price") {
        const methodId = Number(url.searchParams.get("shipping_method_id"));
        return Response.json([{
          price: (methodId / 1000).toFixed(2),
          currency: "EUR",
          to_country: "FR",
          breakdown: [],
        }]);
      }
      return Response.json({}, { status: 404 });
    },
  );
  const quotes = await ports.quotes.quote(quoteRequest({
    destination: { countryCode: "FR", postalCode: "75001", city: "Paris" },
  }));
  assert.deepEqual(quotes.map((quote) => ({
    carrierCode: quote.carrierCode,
    deliveryMode: quote.deliveryMode,
  })), [
    { carrierCode: "colissimo", deliveryMode: "home" },
    { carrierCode: "colissimo", deliveryMode: "service_point" },
    { carrierCode: "mondial_relay", deliveryMode: "home" },
    { carrierCode: "mondial_relay", deliveryMode: "service_point" },
  ]);
  assert.equal(calls.filter(({ pathname }) => pathname === "/api/v2/shipping-products").length, 4);
  assert.equal(calls.filter(({ pathname }) => pathname === "/api/v2/shipping-price").length, 4);
});

test("Sendcloud maps the live France V3 codes to one exact V2 price band", async () => {
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v3/checkout/delivery-options") {
        return Response.json({
          configuration_id: "configuration_fr_live",
          delivery_options: [
            nullRateOffer({
              id: "colissimo-home-live",
              carrierCode: "colissimo",
              carrierName: "Colissimo",
              shippingOptionCode: "colissimo:home/fr",
              deliveryMethodType: "standard_delivery",
            }),
            nullRateOffer({
              id: "mondial-point-live",
              carrierCode: "mondial_relay",
              carrierName: "Mondial Relay",
              shippingOptionCode: "mondial_relay:locker_delivery,dualapi",
              deliveryMethodType: "service_point_delivery",
            }),
          ],
        });
      }
      if (url.pathname === "/api/v2/shipping-products") {
        if (url.searchParams.get("carrier") === "colissimo") {
          const product = shippingProduct({ code: "colissimo:home/fr", methodIds: [] });
          return Response.json([{
            ...product,
            methods: [
              {
                id: 7301,
                name: "Colissimo Home 0-0.25kg",
                functionalities: {},
                shipping_product_code: "colissimo:home/fr",
                properties: {
                  min_weight: 1,
                  max_weight: 251,
                  max_dimensions: { length: 100, width: 70, height: 58, unit: "centimeter" },
                },
              },
              {
                id: 7302,
                name: "Colissimo Home Signature 0-0.25kg",
                functionalities: {},
                shipping_product_code: "colissimo:home/fr",
                properties: {
                  min_weight: 1,
                  max_weight: 251,
                  max_dimensions: { length: 100, width: 70, height: 58, unit: "centimeter" },
                },
              },
            ],
          }]);
        }
        return Response.json([
          shippingProduct({
            carrier: "mondial_relay",
            code: "mondial_relay:service_point,dualapi",
            lastMile: "service_point",
            methodIds: [7401],
          }),
          shippingProduct({
            carrier: "mondial_relay",
            code: "mondial_relay:service_point_qr,dualapi",
            lastMile: "service_point",
            methodIds: [7402],
          }),
        ]);
      }
      if (url.pathname === "/api/v2/shipping-price") {
        const methodId = Number(url.searchParams.get("shipping_method_id"));
        return Response.json([{
          price: methodId === 7301 ? "6.61" : methodId === 7302 ? "8.65" : "3.50",
          currency: "EUR",
          to_country: "FR",
          breakdown: [],
        }]);
      }
      return Response.json({}, { status: 404 });
    },
  );
  const quotes = await ports.quotes.quote(quoteRequest({
    destination: { countryCode: "FR", postalCode: "67130", city: "Belmont" },
  }));
  assert.deepEqual(quotes.map((quote) => ({
    amountCents: quote.amountCents,
    carrierCode: quote.carrierCode,
    deliveryMode: quote.deliveryMode,
  })), [
    { amountCents: 661, carrierCode: "colissimo", deliveryMode: "home" },
    { amountCents: 350, carrierCode: "mondial_relay", deliveryMode: "service_point" },
  ]);
});

test("Sendcloud prefers a real V3 rate and resolves an exact non-EU null rate", async (t) => {
  await t.test("priced EU option", async () => {
    let calls = 0;
    const ports = createSendcloudProviderPorts(
      { publicKey: "public_key", secretKey: "x".repeat(32) },
      async () => {
        calls += 1;
        return Response.json({
          configuration_id: "configuration_de",
          delivery_options: [offer({
            cut_off_time: null,
            carrier: {
              code: "colissimo", logo_url: "https://example.test/colissimo.svg", name: "Colissimo",
            },
            checkout_identifier: {
              type: "shipping_option_code",
              value: "colissimo:international/home_delivery,signature",
            },
            shipping_rate: { value: "10.27", currency: "EUR" },
          })],
        });
      },
    );
    const quotes = await ports.quotes.quote(quoteRequest());
    assert.equal(quotes[0].amountCents, 1027);
    assert.equal(calls, 1);
  });

  await t.test("non-EU null option", async () => {
    let calls = 0;
    const ports = createSendcloudProviderPorts(
      { publicKey: "public_key", secretKey: "x".repeat(32) },
      async (input) => {
        calls += 1;
        const url = new URL(String(input));
        if (url.pathname === "/api/v2/shipping-products") {
          assert.equal(url.searchParams.get("to_country"), "GB");
          assert.equal(url.searchParams.get("to_postal_code"), "SW1A 1AA");
          return Response.json([shippingProduct({
            carrier: "colissimo",
            code: "colissimo:international/home_delivery,signature",
            lastMile: "home_delivery",
            methodIds: [7601],
          })]);
        }
        if (url.pathname === "/api/v2/shipping-price") {
          assert.equal(url.searchParams.get("to_country"), "GB");
          return Response.json([{
            price: "18.42", currency: "EUR", to_country: "GB", breakdown: [],
          }]);
        }
        return Response.json({
          configuration_id: "configuration_gb",
          delivery_options: [nullRateOffer({
            id: "gb-null-rate",
            carrierCode: "colissimo",
            carrierName: "Colissimo",
            shippingOptionCode: "colissimo:international/home_delivery,signature",
            deliveryMethodType: "standard_delivery",
          })],
        });
      },
    );
    const quotes = await ports.quotes.quote(quoteRequest({
      dutiesTerms: "DAP",
      destination: { countryCode: "GB", postalCode: "SW1A 1AA", city: "London" },
    }));
    assert.equal(quotes[0].amountCents, 1842);
    assert.equal(quotes[0].dutiesTerms, "DAP");
    assert.equal(calls, 3);
  });
});

test("Sendcloud EU fallback refuses ambiguous, inexact and cross-mode products", async (t) => {
  const cases = [
    {
      name: "ambiguous matching methods",
      products: [shippingProduct({ methodIds: [8101, 8102] })],
      expectedPriceCalls: 2,
    },
    {
      name: "inexact product prefix",
      products: [shippingProduct({ code: "colissimo:international/home_delivery" })],
    },
    {
      name: "c2c normalization on a non-Mondial-Relay carrier",
      products: [shippingProduct({ code: "colissimo:international/home_delivery,signature/c2c" })],
    },
    {
      name: "cross-mode product",
      products: [shippingProduct({ lastMile: "service_point" })],
    },
    {
      name: "cross-mode method override",
      products: [shippingProduct({ methodLastMile: "service_point" })],
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      let priceCalls = 0;
      const ports = createSendcloudProviderPorts(
        { publicKey: "public_key", secretKey: "x".repeat(32) },
        async (input) => {
          const url = new URL(String(input));
          if (url.pathname === "/api/v3/checkout/delivery-options") {
            return Response.json({
              configuration_id: "configuration_eu",
              delivery_options: [nullRateOffer({
                id: "colissimo-home",
                carrierCode: "colissimo",
                carrierName: "Colissimo",
                shippingOptionCode: "colissimo:international/home_delivery,signature",
                deliveryMethodType: "standard_delivery",
              })],
            });
          }
          if (url.pathname === "/api/v2/shipping-products") {
            return Response.json(scenario.products);
          }
          priceCalls += 1;
          const methodId = url.searchParams.get("shipping_method_id");
          return Response.json([{
            price: methodId === "8101" ? "10.27" : "10.28",
            currency: "EUR", to_country: "DE", breakdown: [],
          }]);
        },
      );
      assert.deepEqual(await ports.quotes.quote(quoteRequest()), []);
      assert.equal(priceCalls, scenario.expectedPriceCalls ?? 0);
    });
  }
});

test("Sendcloud EU fallback refuses null, free, non-EUR and ambiguous prices", async (t) => {
  const cases = [
    {
      name: "null provider price",
      prices: [{ price: null, currency: null, to_country: "DE", breakdown: [] }],
    },
    {
      name: "zero provider price",
      prices: [{ price: "0.00", currency: "EUR", to_country: "DE", breakdown: [] }],
    },
    {
      name: "unsupported currency",
      prices: [{ price: "10.27", currency: "USD", to_country: "DE", breakdown: [] }],
    },
    {
      name: "multiple destination prices",
      prices: [
        { price: "10.27", currency: "EUR", to_country: "DE", breakdown: [] },
        { price: "9.00", currency: "EUR", to_country: "DE", breakdown: [] },
      ],
    },
    {
      name: "wrong destination",
      prices: [{ price: "10.27", currency: "EUR", to_country: "BE", breakdown: [] }],
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const ports = createSendcloudProviderPorts(
        { publicKey: "public_key", secretKey: "x".repeat(32) },
        async (input) => {
          const url = new URL(String(input));
          if (url.pathname === "/api/v3/checkout/delivery-options") {
            return Response.json({
              configuration_id: "configuration_eu",
              delivery_options: [nullRateOffer({
                id: "colissimo-home",
                carrierCode: "colissimo",
                carrierName: "Colissimo",
                shippingOptionCode: "colissimo:international/home_delivery,signature",
                deliveryMethodType: "standard_delivery",
              })],
            });
          }
          if (url.pathname === "/api/v2/shipping-products") {
            return Response.json([shippingProduct()]);
          }
          return Response.json(scenario.prices);
        },
      );
      assert.deepEqual(await ports.quotes.quote(quoteRequest()), []);
    });
  }
});

test("Sendcloud EU fallback rejects malformed product responses instead of guessing", async () => {
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v3/checkout/delivery-options") {
        return Response.json({
          configuration_id: "configuration_eu",
          delivery_options: [nullRateOffer({
            id: "colissimo-home",
            carrierCode: "colissimo",
            carrierName: "Colissimo",
            shippingOptionCode: "colissimo:international/home_delivery,signature",
            deliveryMethodType: "standard_delivery",
          })],
        });
      }
      return Response.json([{ carrier: "colissimo", code: "colissimo:international" }]);
    },
  );
  await assert.rejects(
    () => ports.quotes.quote(quoteRequest()),
    (error) => error instanceof DeliveryProviderError && error.code === "MALFORMED_RESPONSE",
  );
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
