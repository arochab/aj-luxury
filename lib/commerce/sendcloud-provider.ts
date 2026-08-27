import {
  DeliveryProviderError,
  type DeliveryDutiesTerms,
  type DeliveryProviderPorts,
  type DeliveryQuoteOffer,
  type DeliveryQuoteRequest,
  type DeliveryServicePoint,
  type ServicePointRequest,
  type ShippingDocumentRequest,
  type ShippingDocumentReceipt,
} from "./delivery-provider.ts";
import { sha256Hex } from "./fulfillment-domain.ts";
import {
  type ReadyReturnShipmentRequest,
  type ReturnProviderAddress,
  type ReturnShipmentReceipt,
} from "./return-provider.ts";

const PANEL_ORIGIN = "https://panel.sendcloud.sc";
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_FALLBACK_PRICE_CONCURRENCY = 4;
const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_SHIPPING_OPTION_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:,\/-]{0,159}$/;
const SAFE_PARCEL_ID = /^[1-9]\d{0,18}$/;
const EU_COUNTRY_CODES = Object.freeze([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
] as const);
const LEAD_TIME_KEYS = Object.freeze([
  "p10", "p20", "p30", "p40", "p50", "p60", "p70", "p80", "p90", "p95",
] as const);
const DELIVERY_METHOD_TYPES = Object.freeze([
  "standard_delivery",
  "same_day_delivery",
  "nominated_day_delivery",
  "service_point_delivery",
] as const);

type SendcloudConfiguration = Readonly<{
  publicKey?: string;
  secretKey?: string;
}>;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type SendcloudUnpricedOption = Readonly<{
  carrierCode: string;
  shippingOptionCode: string;
  deliveryMode: "home" | "service_point";
}>;

type SendcloudFallbackPrice = Readonly<{
  amountCents: number;
  sourceFingerprint: string;
}>;

type SendcloudFallbackPriceResolver = (
  option: SendcloudUnpricedOption,
) => Promise<SendcloudFallbackPrice | null>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, maximum = 160): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function centsFromDecimal(value: unknown): number {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) {
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Provider price is invalid.");
  }
  const [euros, decimals = ""] = value.split(".");
  const amount = Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount)) {
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Provider price is invalid.");
  }
  return amount;
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    await response.body?.cancel();
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Provider response is too large.");
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new DeliveryProviderError("MALFORMED_RESPONSE", "Provider response is too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Provider JSON is invalid.", { cause: error });
  }
}

function internalExpiry(now: string, ttlSeconds: number): string {
  const millis = Date.parse(now);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== now ||
    !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600) {
    throw new DeliveryProviderError("REJECTED", "Internal quote clock is invalid.");
  }
  return new Date(millis + ttlSeconds * 1000).toISOString();
}

function optionExpiry(now: string, ttlSeconds: number, cutOffTime: unknown): string | null {
  const ttlExpiry = internalExpiry(now, ttlSeconds);
  if (cutOffTime === null) return ttlExpiry;
  if (!safeString(cutOffTime) || !Number.isFinite(Date.parse(cutOffTime))) {
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Delivery option cut-off is invalid.");
  }
  const cutOff = new Date(Date.parse(cutOffTime)).toISOString();
  return cutOff <= now ? null : (cutOff < ttlExpiry ? cutOff : ttlExpiry);
}

/** Strict parser for Sendcloud Dynamic Checkout API V3's documented envelope. */
export async function parseSendcloudDeliveryOptions(
  value: unknown,
  context: Readonly<{
    now: string;
    ttlSeconds: number;
    dutiesTerms: DeliveryDutiesTerms;
    resolveFallbackPrice?: SendcloudFallbackPriceResolver;
  }>,
): Promise<readonly DeliveryQuoteOffer[]> {
  if (
    !record(value) || !exactKeys(value, ["configuration_id", "delivery_options"]) ||
    !safeString(value.configuration_id) || !Array.isArray(value.delivery_options) ||
    value.delivery_options.length > 100
  ) throw new DeliveryProviderError("MALFORMED_RESPONSE", "Delivery options envelope is invalid.");
  internalExpiry(context.now, context.ttlSeconds);
  const fallbackCache = new Map<string, Promise<SendcloudFallbackPrice | null>>();
  const fallbackWaiters: Array<() => void> = [];
  let activeFallbacks = 0;
  async function limitedFallback(
    option: SendcloudUnpricedOption,
  ): Promise<SendcloudFallbackPrice | null> {
    if (!context.resolveFallbackPrice) return null;
    const key = JSON.stringify([
      option.carrierCode,
      option.shippingOptionCode,
      option.deliveryMode,
    ]);
    const cached = fallbackCache.get(key);
    if (cached) return cached;
    const task = (async () => {
      if (activeFallbacks >= MAX_FALLBACK_PRICE_CONCURRENCY) {
        await new Promise<void>((resolve) => fallbackWaiters.push(resolve));
      }
      activeFallbacks += 1;
      try {
        return await context.resolveFallbackPrice!(option);
      } finally {
        activeFallbacks -= 1;
        fallbackWaiters.shift()?.();
      }
    })();
    fallbackCache.set(key, task);
    return task;
  }
  const parsed = await Promise.all(value.delivery_options.map(
    async (candidate): Promise<DeliveryQuoteOffer | null> => {
    const keys = [
      "carrier", "checkout_identifier", "cut_off_time", "delivery_dates",
      "delivery_method_type", "description", "id", "internal_title",
      "lead_time_hours", "shipping_rate", "sustainability_rating", "title",
    ];
    if (!record(candidate) || !exactKeys(candidate, keys) ||
      !safeString(candidate.id) || !safeString(candidate.title) ||
      !record(candidate.checkout_identifier) ||
      !exactKeys(candidate.checkout_identifier, ["type", "value"]) ||
      candidate.checkout_identifier.type !== "shipping_option_code" ||
      !safeString(candidate.checkout_identifier.value) ||
      !record(candidate.shipping_rate) ||
      !exactKeys(candidate.shipping_rate, ["currency", "value"]) ||
      candidate.shipping_rate.currency !== "EUR" ||
      !record(candidate.carrier) ||
      !exactKeys(candidate.carrier, ["code", "logo_url", "name"]) ||
      !safeString(candidate.carrier.code, 80) || !SAFE_CODE.test(candidate.carrier.code) ||
      !safeString(candidate.carrier.name) ||
      !(candidate.lead_time_hours === null || record(candidate.lead_time_hours)) ||
      !DELIVERY_METHOD_TYPES.includes(candidate.delivery_method_type as typeof DELIVERY_METHOD_TYPES[number])) {
      throw new DeliveryProviderError("MALFORMED_RESPONSE", "Delivery option shape is invalid.");
    }
    // Nominated-day and same-day require date/cut-off choices that our checkout
    // does not yet model. Do not silently downgrade them to home delivery.
    if (["same_day_delivery", "nominated_day_delivery"].includes(String(candidate.delivery_method_type))) {
      return null;
    }
    // The documented V3 response may explicitly return no transit percentiles.
    // We cannot safely infer these, even when a separate price endpoint is available.
    if (candidate.lead_time_hours === null) return null;
    const leadTime = candidate.lead_time_hours as Record<
      (typeof LEAD_TIME_KEYS)[number],
      unknown
    >;
    if (
      !exactKeys(leadTime, LEAD_TIME_KEYS) ||
      LEAD_TIME_KEYS.some((key) =>
        !Number.isSafeInteger(leadTime[key]) ||
        (leadTime[key] as number) < 0
      ) ||
      LEAD_TIME_KEYS.some((key, index) => index > 0 &&
        (leadTime[key] as number) <
          (leadTime[LEAD_TIME_KEYS[index - 1]] as number))
    ) {
      throw new DeliveryProviderError("MALFORMED_RESPONSE", "Delivery option lead time is invalid.");
    }
    const expiresAt = optionExpiry(context.now, context.ttlSeconds, candidate.cut_off_time);
    if (!expiresAt) return null;
    const deliveryMode = candidate.delivery_method_type === "service_point_delivery"
      ? "service_point" as const
      : "home" as const;
    let amountCents: number;
    let fallbackSourceFingerprint: string | null = null;
    if (candidate.shipping_rate.value === null) {
      const fallback = await limitedFallback({
        carrierCode: candidate.carrier.code,
        shippingOptionCode: candidate.checkout_identifier.value,
        deliveryMode,
      });
      if (!fallback) return null;
      if (
        !Number.isSafeInteger(fallback.amountCents) || fallback.amountCents <= 0 ||
        !/^[0-9a-f]{64}$/.test(fallback.sourceFingerprint)
      ) {
        throw new DeliveryProviderError("MALFORMED_RESPONSE", "Fallback price is invalid.");
      }
      amountCents = fallback.amountCents;
      fallbackSourceFingerprint = fallback.sourceFingerprint;
    } else {
      amountCents = centsFromDecimal(candidate.shipping_rate.value);
    }
    const canonical = JSON.stringify({
      carrierCode: candidate.carrier.code,
      checkoutIdentifier: candidate.checkout_identifier,
      configurationId: value.configuration_id,
      deliveryMethodType: candidate.delivery_method_type,
      fallbackSourceFingerprint,
      id: candidate.id,
      leadTimeHours: leadTime,
      shippingRate: { amountCents, currency: "EUR" },
    });
    return Object.freeze({
      providerCode: "sendcloud",
      // A delivery-method id can be shared by multiple carriers. Keep every
      // provider dimension in a non-ambiguous serialized tuple.
      providerQuoteReference: JSON.stringify([
        value.configuration_id,
        candidate.id,
        candidate.carrier.code,
        candidate.checkout_identifier.value,
      ]),
      carrierCode: candidate.carrier.code,
      serviceCode: candidate.checkout_identifier.value,
      displayName: candidate.carrier.name,
      deliveryMode,
      amountCents,
      currency: "EUR" as const,
      estimatedDaysMin: Math.max(1, Math.ceil((leadTime.p50 as number) / 24)),
      estimatedDaysMax: Math.max(1, Math.ceil((leadTime.p90 as number) / 24)),
      dutiesTerms: context.dutiesTerms,
      expiresAt,
      // Sendcloud does not claim a signed response here. This is our canonical
      // response fingerprint for replay/audit, never a provider signature.
      responseFingerprint: await sha256Hex(canonical),
    });
    },
  ));
  return Object.freeze(parsed.filter((option): option is DeliveryQuoteOffer => option !== null));
}

function expectedLastMile(mode: SendcloudUnpricedOption["deliveryMode"]): string {
  return mode === "service_point" ? "service_point" : "home_delivery";
}

function exactProductCodeMatch(option: SendcloudUnpricedOption, productCode: string): boolean {
  if (option.shippingOptionCode === productCode) return true;
  // Sendcloud exposes the same Mondial Relay locker product under two exact,
  // version-specific names. The QR variant remains a distinct workflow.
  if (option.carrierCode === "mondial_relay" &&
    option.shippingOptionCode === "mondial_relay:locker_delivery,dualapi" &&
    productCode === "mondial_relay:service_point,dualapi") return true;
  // Sendcloud V3 currently appends this account-specific Mondial Relay suffix,
  // while the V2 product endpoint exposes the underlying product code. No other
  // prefix/suffix or fuzzy matching is permitted.
  return option.carrierCode === "mondial_relay" &&
    option.shippingOptionCode.endsWith("/c2c") &&
    option.shippingOptionCode.slice(0, -4) === productCode;
}

function finiteNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function dimensionInMillimeters(value: unknown, unit: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (unit === "millimeter") return value;
  if (unit === "centimeter") return value * 10;
  if (unit === "meter") return value * 1000;
  return null;
}

function productLastMiles(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return null;
  const modes = value.filter((candidate): candidate is string =>
    candidate === "home_delivery" || candidate === "service_point"
  );
  return modes.length === value.length ? Object.freeze(modes) : null;
}

function methodMatchesParcel(
  properties: unknown,
  request: DeliveryQuoteRequest,
): boolean {
  if (!record(properties) ||
    !finiteNonNegativeInteger(properties.min_weight) ||
    !finiteNonNegativeInteger(properties.max_weight) ||
    properties.min_weight > properties.max_weight ||
    request.parcel.weightGrams < properties.min_weight ||
    request.parcel.weightGrams > properties.max_weight ||
    !record(properties.max_dimensions)) return false;
  const maximum = properties.max_dimensions;
  const maximumLength = dimensionInMillimeters(maximum.length, maximum.unit);
  const maximumWidth = dimensionInMillimeters(maximum.width, maximum.unit);
  const maximumHeight = dimensionInMillimeters(maximum.height, maximum.unit);
  return maximumLength !== null && maximumWidth !== null && maximumHeight !== null &&
    // Sendcloud uses 0 for an axis whose limit is not expressed independently
    // (for example Mondial Relay exposes only max length here). The request was
    // already filtered by all three parcel dimensions at the provider; never
    // reinterpret a positive bound, and reject a completely unbounded record.
    [maximumLength, maximumWidth, maximumHeight].some((bound) => bound > 0) &&
    (maximumLength === 0 || request.parcel.lengthMm <= maximumLength) &&
    (maximumWidth === 0 || request.parcel.widthMm <= maximumWidth) &&
    (maximumHeight === 0 || request.parcel.heightMm <= maximumHeight);
}

function exactShippingMethodId(
  value: unknown,
  option: SendcloudUnpricedOption,
  request: DeliveryQuoteRequest,
): number | null {
  if (!Array.isArray(value) || value.length > 100) {
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Shipping products response is invalid.");
  }
  const expectedMode = expectedLastMile(option.deliveryMode);
  const matches: Array<Readonly<{ id: number; minWeight: number; maxWeight: number }>> = [];
  for (const product of value) {
    if (!record(product) || !safeString(product.name) ||
      !safeString(product.code) || !SAFE_SHIPPING_OPTION_CODE.test(product.code) ||
      !safeString(product.carrier, 80) || !SAFE_CODE.test(product.carrier) ||
      !record(product.weight_range) ||
      !finiteNonNegativeInteger(product.weight_range.min_weight) ||
      !finiteNonNegativeInteger(product.weight_range.max_weight) ||
      product.weight_range.min_weight > product.weight_range.max_weight ||
      !record(product.available_functionalities) ||
      !Array.isArray(product.methods) || product.methods.length > 100) {
      throw new DeliveryProviderError("MALFORMED_RESPONSE", "Shipping product is invalid.");
    }
    if (product.carrier !== option.carrierCode ||
      !exactProductCodeMatch(option, product.code) ||
      request.parcel.weightGrams < product.weight_range.min_weight ||
      request.parcel.weightGrams > product.weight_range.max_weight) continue;
    const availableLastMiles = productLastMiles(product.available_functionalities.last_mile);
    if (!availableLastMiles || !availableLastMiles.includes(expectedMode)) continue;
    for (const method of product.methods) {
      if (!record(method) || !Number.isSafeInteger(method.id) || (method.id as number) < 1 ||
        !safeString(method.name) || !safeString(method.shipping_product_code) ||
        method.shipping_product_code !== product.code || !record(method.functionalities)) {
        throw new DeliveryProviderError("MALFORMED_RESPONSE", "Shipping product method is invalid.");
      }
      const methodLastMile = method.functionalities.last_mile;
      if (methodLastMile !== undefined && methodLastMile !== expectedMode) continue;
      // If the method omits last_mile, the product must expose one unambiguous mode.
      if (methodLastMile === undefined &&
        (availableLastMiles.length !== 1 || availableLastMiles[0] !== expectedMode)) continue;
      if (!methodMatchesParcel(method.properties, request)) continue;
      matches.push(Object.freeze({
        id: method.id as number,
        minWeight: method.properties.min_weight as number,
        maxWeight: method.properties.max_weight as number,
      }));
    }
  }
  if (matches.length < 1) return null;
  // Adjacent Sendcloud bands share the boundary value (for example 0–250 g
  // and 250–500 g). Prefer the most specific interval containing the parcel:
  // the highest lower bound, then the lowest upper bound. Identical remaining
  // methods are still ambiguous and therefore stay closed.
  const highestMinimum = Math.max(...matches.map(({ minWeight }) => minWeight));
  const minimumMatches = matches.filter(({ minWeight }) => minWeight === highestMinimum);
  const lowestMaximum = Math.min(...minimumMatches.map(({ maxWeight }) => maxWeight));
  const exactMatches = minimumMatches.filter(({ maxWeight }) => maxWeight === lowestMaximum);
  return exactMatches.length === 1 ? exactMatches[0].id : null;
}

function exactShippingPrice(
  value: unknown,
  destinationCountryCode: string,
): Readonly<{ amountCents: number; canonical: string }> | null {
  if (!Array.isArray(value) || value.length !== 1 || !record(value[0])) {
    return null;
  }
  const candidate = value[0];
  if (!safeString(candidate.to_country, 2) || candidate.to_country !== destinationCountryCode ||
    !Array.isArray(candidate.breakdown)) return null;
  if (candidate.price === null && candidate.currency === null) return null;
  if (candidate.currency !== "EUR") return null;
  const amountCents = centsFromDecimal(candidate.price);
  // A real zero price is not silently converted into a free checkout option.
  if (amountCents <= 0) return null;
  return Object.freeze({
    amountCents,
    canonical: JSON.stringify({
      breakdown: candidate.breakdown,
      currency: candidate.currency,
      price: candidate.price,
      toCountry: candidate.to_country,
    }),
  });
}

function validFallbackRequest(request: DeliveryQuoteRequest): boolean {
  return /^[A-Z]{2}$/.test(request.originCountryCode) &&
    /^[A-Z]{2}$/.test(request.destination.countryCode) &&
    safeString(request.destination.postalCode, 12) &&
    Number.isSafeInteger(request.parcel.weightGrams) && request.parcel.weightGrams > 0 &&
    Number.isSafeInteger(request.parcel.lengthMm) && request.parcel.lengthMm > 0 &&
    Number.isSafeInteger(request.parcel.widthMm) && request.parcel.widthMm > 0 &&
    Number.isSafeInteger(request.parcel.heightMm) && request.parcel.heightMm > 0;
}

async function resolveV2FallbackPrice(
  fetchImpl: FetchLike,
  auth: Readonly<{ publicKey: string; secretKey: string }>,
  request: DeliveryQuoteRequest,
  option: SendcloudUnpricedOption,
): Promise<SendcloudFallbackPrice | null> {
  if (!validFallbackRequest(request)) {
    throw new DeliveryProviderError("REJECTED", "Shipping fallback request is invalid.");
  }
  const productsUrl = new URL(`${PANEL_ORIGIN}/api/v2/shipping-products`);
  productsUrl.searchParams.set("from_country", request.originCountryCode);
  productsUrl.searchParams.set("to_country", request.destination.countryCode);
  productsUrl.searchParams.set("carrier", option.carrierCode);
  productsUrl.searchParams.set("weight", String(request.parcel.weightGrams));
  productsUrl.searchParams.set("weight_unit", "gram");
  productsUrl.searchParams.set("length", String(request.parcel.lengthMm));
  productsUrl.searchParams.set("length_unit", "millimeter");
  productsUrl.searchParams.set("width", String(request.parcel.widthMm));
  productsUrl.searchParams.set("width_unit", "millimeter");
  productsUrl.searchParams.set("height", String(request.parcel.heightMm));
  productsUrl.searchParams.set("height_unit", "millimeter");
  productsUrl.searchParams.set("to_postal_code", request.destination.postalCode);
  productsUrl.searchParams.set("last_mile", expectedLastMile(option.deliveryMode));
  const products = await providerJson(
    fetchImpl,
    auth,
    productsUrl.href,
    { method: "GET" },
  );
  const productShapes = Array.isArray(products)
    ? products.slice(0, 20).map((product) => record(product)
      ? Object.freeze({
        carrierCode: typeof product.carrier === "string"
          ? product.carrier.slice(0, 80)
          : "invalid",
        productCode: typeof product.code === "string"
          ? product.code.slice(0, 160)
          : "invalid",
        lastMile: record(product.available_functionalities) &&
            Array.isArray(product.available_functionalities.last_mile)
          ? product.available_functionalities.last_mile.slice(0, 4)
          : [],
      })
      : Object.freeze({ invalid: true }))
    : [];
  console.info(JSON.stringify({
    event: "sendcloud_fallback_product_shapes",
    carrierCode: option.carrierCode,
    deliveryMode: option.deliveryMode,
    shippingOptionCode: option.shippingOptionCode,
    productCount: productShapes.length,
    products: productShapes,
  }));
  const methodId = exactShippingMethodId(products, option, request);
  if (methodId === null) return null;

  const priceUrl = new URL(`${PANEL_ORIGIN}/api/v2/shipping-price`);
  priceUrl.searchParams.set("shipping_method_id", String(methodId));
  priceUrl.searchParams.set("from_country", request.originCountryCode);
  priceUrl.searchParams.set("to_country", request.destination.countryCode);
  priceUrl.searchParams.set("weight", String(request.parcel.weightGrams));
  priceUrl.searchParams.set("weight_unit", "gram");
  priceUrl.searchParams.set("to_postal_code", request.destination.postalCode);
  const price = exactShippingPrice(await providerJson(
    fetchImpl,
    auth,
    priceUrl.href,
    { method: "GET" },
  ), request.destination.countryCode);
  if (!price) return null;
  return Object.freeze({
    amountCents: price.amountCents,
    sourceFingerprint: await sha256Hex(JSON.stringify({
      methodId,
      price: price.canonical,
      productCode: option.shippingOptionCode,
    })),
  });
}

const WEEKDAYS = Object.freeze([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const);

function validOpeningTimes(value: unknown): value is Record<string, unknown> {
  if (!record(value) || !exactKeys(value, WEEKDAYS)) return false;
  return WEEKDAYS.every((day) => {
    const slots = value[day];
    return slots === null || (Array.isArray(slots) && slots.length <= 4 && slots.every((slot) =>
      record(slot) && exactKeys(slot, ["end_time", "start_time"]) &&
      typeof slot.start_time === "string" && /^\d{2}:\d{2}$/.test(slot.start_time) &&
      typeof slot.end_time === "string" && /^\d{2}:\d{2}$/.test(slot.end_time)
    ));
  });
}

/** Strict parser for Sendcloud's current Service Points API V3 envelope. */
export function parseSendcloudServicePoints(value: unknown): readonly DeliveryServicePoint[] {
  if (
    !record(value) || !exactKeys(value, ["data"]) || !record(value.data) ||
    !exactKeys(value.data, ["geocoding", "results"]) || !Array.isArray(value.data.results) ||
    value.data.results.length > 100 || !record(value.data.geocoding) ||
    !exactKeys(value.data.geocoding, ["formatted_address", "precision", "status"]) ||
    !["matched", "partially_matched", "not_found"].includes(String(value.data.geocoding.status)) ||
    !(value.data.geocoding.precision === null || safeString(value.data.geocoding.precision)) ||
    !(value.data.geocoding.formatted_address === null ||
      safeString(value.data.geocoding.formatted_address, 500))
  ) {
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Service-points response is invalid.");
  }
  const points = value.data.results.flatMap((candidate): DeliveryServicePoint[] => {
    const candidateKeys = [
      "address", "carrier", "carrier_service_point_id", "carrier_shop_type", "contact",
      "distance", "general_shop_type", "id", "is_expired", "is_open_tomorrow", "name",
      "next_open_at", "opening_times", "position",
    ];
    if (
      !record(candidate) || !exactKeys(candidate, candidateKeys) ||
      !Number.isSafeInteger(candidate.id) || (candidate.id as number) < 1 ||
      !safeString(candidate.name) || !record(candidate.carrier) ||
      !exactKeys(candidate.carrier, ["code", "icon_url", "logo_url", "name"]) ||
      !safeString(candidate.carrier.code, 80) || !SAFE_CODE.test(candidate.carrier.code) ||
      !safeString(candidate.carrier.name) || !safeString(candidate.carrier_service_point_id) ||
      !safeString(candidate.carrier_shop_type) ||
      !["servicepoint", "locker", "post_office", "carrier_depot"].includes(
        String(candidate.general_shop_type),
      ) ||
      !record(candidate.address) ||
      !exactKeys(candidate.address, ["city", "country_code", "house_number", "postal_code", "street"]) ||
      !safeString(candidate.address.street) || !safeString(candidate.address.house_number, 32) ||
      !safeString(candidate.address.postal_code, 32) || !safeString(candidate.address.city, 100) ||
      !safeString(candidate.address.country_code, 2) || !/^[A-Z]{2}$/.test(candidate.address.country_code) ||
      !record(candidate.position) || !exactKeys(candidate.position, ["latitude", "longitude"]) ||
      typeof candidate.position.latitude !== "number" ||
      !Number.isFinite(candidate.position.latitude) || Math.abs(candidate.position.latitude) > 90 ||
      typeof candidate.position.longitude !== "number" ||
      !Number.isFinite(candidate.position.longitude) || Math.abs(candidate.position.longitude) > 180 ||
      !record(candidate.contact) || !exactKeys(candidate.contact, ["email", "phone"]) ||
      typeof candidate.contact.email !== "string" || candidate.contact.email.length > 254 ||
      typeof candidate.contact.phone !== "string" || candidate.contact.phone.length > 32 ||
      !validOpeningTimes(candidate.opening_times) ||
      typeof candidate.is_open_tomorrow !== "boolean" || typeof candidate.is_expired !== "boolean" ||
      !(candidate.next_open_at === null ||
        (safeString(candidate.next_open_at) && Number.isFinite(Date.parse(candidate.next_open_at)))) ||
      typeof candidate.distance !== "number" || !Number.isFinite(candidate.distance) || candidate.distance < 0
    ) {
      throw new DeliveryProviderError("MALFORMED_RESPONSE", "Service-point shape is invalid.");
    }
    if (candidate.is_expired) return [];
    return [Object.freeze({
      providerPointReference: String(candidate.id),
      displayName: candidate.name,
      postalCode: candidate.address.postal_code,
      city: candidate.address.city,
      countryCode: candidate.address.country_code,
      openingHoursSummary: JSON.stringify(candidate.opening_times),
    })];
  });
  return Object.freeze(points);
}

function credentials(configuration: SendcloudConfiguration): Readonly<{ publicKey: string; secretKey: string }> {
  const publicKey = configuration.publicKey?.trim() ?? "";
  const secretKey = configuration.secretKey?.trim() ?? "";
  if (!SAFE_CODE.test(publicKey) || secretKey.length < 16 || secretKey.length > 256) {
    throw new DeliveryProviderError("NOT_CONFIGURED", "Sendcloud credentials are not configured.");
  }
  return Object.freeze({ publicKey, secretKey });
}

function basic(publicKey: string, secretKey: string): string {
  const bytes = new TextEncoder().encode(`${publicKey}:${secretKey}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

async function providerResponse(
  fetchImpl: FetchLike,
  auth: Readonly<{ publicKey: string; secretKey: string }>,
  url: string,
  init: RequestInit,
  mutation = false,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      // Cloudflare Workers does not implement `redirect: "error"`.
      // `manual` preserves the fail-closed contract because the non-2xx
      // response is rejected below without following its Location header.
      redirect: "manual",
      headers: {
        Accept: "application/json",
        Authorization: basic(auth.publicKey, auth.secretKey),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    // Never attach the transport error: custom clients may include request
    // bodies, credentials or customer PII in their error messages.
    throw new DeliveryProviderError(timeout ? "TIMEOUT" : "OUTCOME_UNKNOWN", "Provider call failed.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new DeliveryProviderError(
      mutation || response.status >= 500 ? "OUTCOME_UNKNOWN" : "REJECTED",
      "Provider rejected request.",
    );
  }
  return response;
}

async function providerJson(
  fetchImpl: FetchLike,
  auth: Readonly<{ publicKey: string; secretKey: string }>,
  url: string,
  init: RequestInit,
  mutation = false,
): Promise<unknown> {
  return boundedJson(await providerResponse(fetchImpl, auth, url, init, mutation));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function boundedDocument(response: Response): Promise<Readonly<{
  content: Blob;
  mediaType: "application/pdf" | "image/png" | "application/zpl";
  contentSha256: string;
  byteLength: number;
}>> {
  const declared = response.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_DOCUMENT_BYTES)) {
    await response.body?.cancel();
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Provider document is too large.");
  }
  const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/pdf" && mediaType !== "image/png" && mediaType !== "application/zpl") {
    await response.body?.cancel();
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Provider document type is invalid.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new DeliveryProviderError("MALFORMED_RESPONSE", "Provider document is empty.");
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_DOCUMENT_BYTES) {
        await reader.cancel();
        throw new DeliveryProviderError("MALFORMED_RESPONSE", "Provider document is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (byteLength < 1) {
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Provider document is empty.");
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Object.freeze({
    content: new Blob([bytes], { type: mediaType }),
    mediaType,
    contentSha256: bytesToHex(new Uint8Array(digest)),
    byteLength,
  });
}

function sendcloudAddress(address: ReturnProviderAddress): Record<string, string> {
  return {
    name: address.name,
    ...(address.companyName ? { company_name: address.companyName } : {}),
    address_line_1: address.addressLine1,
    ...(address.addressLine2 ? { address_line_2: address.addressLine2 } : {}),
    ...(address.houseNumber ? { house_number: address.houseNumber } : {}),
    postal_code: address.postalCode,
    city: address.city,
    ...(address.stateProvinceCode ? { state_province_code: address.stateProvinceCode } : {}),
    country_code: address.countryCode,
    ...(address.phoneNumber ? { phone_number: address.phoneNumber } : {}),
    ...(address.email ? { email: address.email } : {}),
  };
}

/** Exact API V3 payload; never enables Sendcloud emails or return rules. */
export function buildSendcloudReturnPayload(request: ReadyReturnShipmentRequest): Record<string, unknown> {
  const totalOrderCents = request.items.reduce(
    (total, item) => total + item.unitPriceCents * item.quantity,
    0,
  );
  return {
    from_address: sendcloudAddress(request.fromAddress),
    to_address: sendcloudAddress(request.toAddress),
    ship_with: {
      type: "shipping_option_code",
      shipping_option_code: request.shippingOptionCode,
    },
    dimensions: {
      length: request.parcel.lengthMm / 10,
      width: request.parcel.widthMm / 10,
      height: request.parcel.heightMm / 10,
      unit: "cm",
    },
    weight: { value: request.parcel.weightGrams, unit: "g" },
    collo_count: 1,
    parcel_items: request.items.map((item) => ({
      item_id: item.orderLineId,
      description: item.description,
      quantity: item.quantity,
      weight: { value: item.netWeightGrams, unit: "g" },
      price: { value: (item.unitPriceCents / 100).toFixed(2), currency: "EUR" },
      ...(item.hsCode ? { hs_code: item.hsCode } : {}),
      ...(item.originCountryCode ? { origin_country: item.originCountryCode } : {}),
      sku: item.sku,
      product_id: item.productId,
      ...(item.returnReasonId ? { return_reason_id: item.returnReasonId } : {}),
      ...(item.returnMessage ? { return_message: item.returnMessage } : {}),
    })),
    send_tracking_emails: false,
    order_number: request.orderNumber,
    total_order_value: { value: (totalOrderCents / 100).toFixed(2), currency: "EUR" },
    external_reference: request.idempotencyKey,
    ...(request.customsInvoiceNumber
      ? { customs_invoice_nr: request.customsInvoiceNumber }
      : {}),
    delivery_option: "drop_off_point",
    apply_rules: false,
  };
}

export async function parseSendcloudReturnReceipt(
  value: unknown,
  request: ReadyReturnShipmentRequest,
): Promise<ReturnShipmentReceipt> {
  if (
    !record(value) || !exactKeys(value, ["multi_collo_ids", "parcel_id", "return_id"]) ||
    !Number.isSafeInteger(value.return_id) || (value.return_id as number) < 1 ||
    !Number.isSafeInteger(value.parcel_id) || (value.parcel_id as number) < 1 ||
    !Array.isArray(value.multi_collo_ids) || value.multi_collo_ids.length !== 0
  ) {
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Return receipt is invalid.");
  }
  const canonical = JSON.stringify({
    idempotencyKey: request.idempotencyKey,
    parcelId: value.parcel_id,
    returnId: value.return_id,
  });
  return Object.freeze({
    providerCode: "sendcloud",
    providerReturnReference: String(value.return_id),
    providerParcelReference: String(value.parcel_id),
    idempotencyKey: request.idempotencyKey,
    receiptFingerprint: await sha256Hex(canonical),
  });
}

export function createSendcloudProviderPorts(
  configuration: SendcloudConfiguration,
  fetchImpl: FetchLike = fetch,
): DeliveryProviderPorts {
  const auth = credentials(configuration);
  return Object.freeze({
    quotes: Object.freeze({
      async quote(request: DeliveryQuoteRequest) {
        const response = await providerJson(
          fetchImpl,
          auth,
          `${PANEL_ORIGIN}/api/v3/checkout/delivery-options`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              total_weight: { value: String(request.parcel.weightGrams), unit: "g" },
              total_price: { value: (request.subtotalCents / 100).toFixed(2) },
              from_address: { country_code: request.originCountryCode },
              to_address: {
                country_code: request.destination.countryCode,
                postal_code: request.destination.postalCode,
              },
              parcel_dimensions: {
                length: String(request.parcel.lengthMm / 10),
                width: String(request.parcel.widthMm / 10),
                height: String(request.parcel.heightMm / 10),
                unit: "cm",
              },
            }),
          },
        );
        const optionShapes = record(response) && Array.isArray(response.delivery_options)
          ? response.delivery_options.slice(0, 20).map((candidate) => record(candidate)
            ? Object.freeze({
              carrierCode: record(candidate.carrier) &&
                  typeof candidate.carrier.code === "string"
                ? candidate.carrier.code.slice(0, 80)
                : "invalid",
              deliveryMethodType: typeof candidate.delivery_method_type === "string"
                ? candidate.delivery_method_type.slice(0, 80)
                : "invalid",
              shippingOptionCode: record(candidate.checkout_identifier) &&
                  typeof candidate.checkout_identifier.value === "string"
                ? candidate.checkout_identifier.value.slice(0, 160)
                : "invalid",
              leadTimeMissing: candidate.lead_time_hours === null,
              rateMissing: record(candidate.shipping_rate) &&
                candidate.shipping_rate.value === null,
            })
            : Object.freeze({ invalid: true }))
          : [];
        console.info(JSON.stringify({
          event: "sendcloud_delivery_option_shapes",
          destinationCountryCode: request.destination.countryCode,
          optionCount: optionShapes.length,
          options: optionShapes,
        }));
        return parseSendcloudDeliveryOptions(response, {
          now: request.now,
          ttlSeconds: request.ttlSeconds,
          dutiesTerms: request.dutiesTerms,
          // Keep every published Dynamic Checkout V3 price unchanged. When an
          // eligible EU option is published with a null rate (including for a
          // domestic French shipment), resolve only that exact carrier,
          // shipping-option code and last-mile mode through Sendcloud V2.
          ...(request.originCountryCode === "FR" &&
            EU_COUNTRY_CODES.includes(
              request.destination.countryCode as typeof EU_COUNTRY_CODES[number],
            )
            ? {
              resolveFallbackPrice: (option: SendcloudUnpricedOption) =>
                resolveV2FallbackPrice(fetchImpl, auth, request, option),
            }
            : {}),
        });
      },
    }),
    servicePoints: Object.freeze({
      async servicePoints(request: ServicePointRequest) {
        const url = new URL(`${PANEL_ORIGIN}/api/v3/service-points`);
        url.searchParams.set("country_code", request.countryCode);
        url.searchParams.set("carrier_code", request.carrierCode);
        url.searchParams.set("address_postal_code", request.postalCode);
        url.searchParams.set("address_city", request.city);
        url.searchParams.set("limit", "25");
        return parseSendcloudServicePoints(await providerJson(
          fetchImpl,
          auth,
          url.href,
          { method: "GET" },
        ));
      },
    }),
    documents: Object.freeze({
      async document(request: ShippingDocumentRequest): Promise<ShippingDocumentReceipt> {
        if (
          !SAFE_CODE.test(request.requestId) || !SAFE_PARCEL_ID.test(request.providerParcelReference) ||
          !["label", "customs", "return_label"].includes(String(request.documentKind))
        ) {
          throw new DeliveryProviderError("REJECTED", "Shipping document request is invalid.");
        }
        const providerKind = request.documentKind === "customs"
          ? "customs-declaration"
          : "label";
        const url = new URL(
          `${PANEL_ORIGIN}/api/v3/parcels/${request.providerParcelReference}/documents/${providerKind}`,
        );
        url.searchParams.set("dpi", "72");
        url.searchParams.set("paper_size", request.documentKind === "customs" ? "A4" : "A6");
        const file = await boundedDocument(await providerResponse(
          fetchImpl,
          auth,
          url.href,
          { method: "GET", headers: { Accept: "application/pdf" } },
        ));
        return Object.freeze({
          providerDocumentReference:
            `sendcloud:parcel:${request.providerParcelReference}:document:${providerKind}`,
          ...file,
        });
      },
    }),
    returns: Object.freeze({
      async validate(request: ReadyReturnShipmentRequest): Promise<void> {
        const response = await providerJson(
          fetchImpl,
          auth,
          `${PANEL_ORIGIN}/api/v3/returns/validate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildSendcloudReturnPayload(request)),
          },
        );
        // The documented validation response echoes addresses and other PII.
        // Verify its minimum envelope and discard it immediately.
        if (
          !record(response) || !record(response.from_address) ||
          !record(response.to_address) || !record(response.ship_with) ||
          !(typeof response.weight === "number" || record(response.weight))
        ) {
          throw new DeliveryProviderError("MALFORMED_RESPONSE", "Return validation response is invalid.");
        }
      },
      async create(request: ReadyReturnShipmentRequest): Promise<ReturnShipmentReceipt> {
        const response = await providerJson(
          fetchImpl,
          auth,
          `${PANEL_ORIGIN}/api/v3/returns`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildSendcloudReturnPayload(request)),
          },
          true,
        );
        return parseSendcloudReturnReceipt(response, request);
      },
    }),
  });
}
