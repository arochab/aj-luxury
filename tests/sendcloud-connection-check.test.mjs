import assert from "node:assert/strict";
import test from "node:test";
import {
  checkSendcloudControlledConnection,
  parseSendcloudSenderAddresses,
} from "../lib/commerce/sendcloud-connection-check.ts";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function offer(id, mode, carrier = "colissimo") {
  return {
    id,
    title: mode === "service_point_delivery" ? "Point relais" : "Domicile",
    internal_title: id,
    description: "Option de test",
    delivery_method_type: mode,
    cut_off_time: null,
    checkout_identifier: { type: "shipping_option_code", value: `${carrier}:${id}` },
    shipping_rate: { value: "7.00", currency: "EUR" },
    carrier: { code: carrier, name: carrier, logo_url: "https://example.test/logo.svg" },
    delivery_dates: null,
    lead_time_hours: {
      p10: 24, p20: 24, p30: 48, p40: 48, p50: 48,
      p60: 72, p70: 72, p80: 96, p90: 96, p95: 120,
    },
    sustainability_rating: null,
  };
}

function point() {
  return {
    id: 123,
    name: "Bureau de poste",
    carrier: { code: "colissimo", name: "Colissimo", logo_url: "https://example.test/logo", icon_url: "https://example.test/icon" },
    carrier_service_point_id: "FR-123",
    carrier_shop_type: "post_office",
    general_shop_type: "post_office",
    address: { street: "Rue test", house_number: "1", postal_code: "75001", city: "Paris", country_code: "FR" },
    position: { latitude: 48.8, longitude: 2.3 },
    contact: { email: "", phone: "" },
    opening_times: { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null },
    is_open_tomorrow: true,
    next_open_at: null,
    is_expired: false,
    distance: 100,
  };
}

test("controlled Sendcloud check proves origin, France home, relay and international without mutations", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    if (String(url).includes("sender-addresses")) return json({ data: [{
      id: 42,
      company_name: "AJ Luxury",
      name: "Jeremy",
      country_code: "FR",
      email: "masked@example.invalid",
      house_number: "3 A",
      address_line_2: "",
      postal_code: "67130",
      address_line_1: "Rue Principale",
      phone_number: "+33000000000",
      city: "Belmont",
      state_province_code: null,
      tax_numbers: [],
      signature: { full_name: "", initials: "" },
    }] });
    if (String(url).includes("delivery-options")) {
      const body = JSON.parse(init.body);
      return json({
        configuration_id: "configuration_1",
        delivery_options: body.to_address.country_code === "US"
          ? [offer("us-home", "standard_delivery", "ups")]
          : [offer("fr-home", "standard_delivery"), offer("fr-relay", "service_point_delivery")],
      });
    }
    if (String(url).includes("service-points")) {
      return json({ data: { results: [point()], geocoding: { status: "matched", precision: "postal_code", formatted_address: "75001 Paris, France" } } });
    }
    throw new Error("unexpected-call");
  };

  const checked = await checkSendcloudControlledConnection({
    publicKey: "public_key_123",
    secretKey: "secret_key_1234567890",
  }, { countryCode: "FR", postalCode: "75001", city: "Paris", dutiesTerms: "EU_INCLUDED" }, fetchImpl);

  assert.deepEqual(checked, {
    credentialsValid: true,
    senderAddressReady: true,
    senderAddressId: "42",
    dynamicCheckoutReady: true,
    homeDeliveryReady: true,
    relayDeliveryReady: true,
    internationalQuoteReady: true,
    reason: "ready",
  });
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ url }) => !/shipments|returns|documents/.test(url)));
});

test("controlled Sendcloud check fails closed without credentials", async () => {
  let touched = false;
  const checked = await checkSendcloudControlledConnection({}, {
    countryCode: "FR", postalCode: "75001", city: "Paris", dutiesTerms: "EU_INCLUDED",
  }, async () => { touched = true; throw new Error("must-not-call"); });
  assert.equal(checked.reason, "credentials-not-configured");
  assert.equal(touched, false);
});

test("sender parser rejects an unbounded or malformed envelope", () => {
  assert.throws(() => parseSendcloudSenderAddresses({ data: new Array(101).fill({}) }));
  assert.throws(() => parseSendcloudSenderAddresses({ data: [{ id: "1" }] }));
});
