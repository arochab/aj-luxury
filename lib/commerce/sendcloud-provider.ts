import {
  DeliveryProviderError,
  type DeliveryProviderPorts,
  type DeliveryQuoteOffer,
  type DeliveryQuoteRequest,
  type DeliveryServicePoint,
  type ServicePointRequest,
  type ShippingDocumentReceipt,
} from "./delivery-provider.ts";
import { sha256Hex } from "./fulfillment-domain.ts";

const PANEL_ORIGIN = "https://panel.sendcloud.sc";
const SERVICE_POINTS_ORIGIN = "https://servicepoints.sendcloud.sc";
const MAX_RESPONSE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
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
    dutiesTerms: "EU_INCLUDED" | "DAP";
  }>,
): Promise<readonly DeliveryQuoteOffer[]> {
  if (
    !record(value) || !exactKeys(value, ["configuration_id", "delivery_options"]) ||
    !safeString(value.configuration_id) || !Array.isArray(value.delivery_options) ||
    value.delivery_options.length > 100
  ) throw new DeliveryProviderError("MALFORMED_RESPONSE", "Delivery options envelope is invalid.");
  internalExpiry(context.now, context.ttlSeconds);
  const parsed = await Promise.all(value.delivery_options.map(async (candidate) => {
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
    // A null rate is not a zero/free rate. Omit either incomplete option only.
    if (candidate.lead_time_hours === null || candidate.shipping_rate.value === null) return null;
    if (
      !exactKeys(candidate.lead_time_hours, LEAD_TIME_KEYS) ||
      LEAD_TIME_KEYS.some((key) =>
        !Number.isSafeInteger(candidate.lead_time_hours?.[key]) ||
        (candidate.lead_time_hours?.[key] as number) < 0
      ) ||
      LEAD_TIME_KEYS.some((key, index) => index > 0 &&
        (candidate.lead_time_hours?.[key] as number) <
          (candidate.lead_time_hours?.[LEAD_TIME_KEYS[index - 1]] as number))
    ) {
      throw new DeliveryProviderError("MALFORMED_RESPONSE", "Delivery option lead time is invalid.");
    }
    const expiresAt = optionExpiry(context.now, context.ttlSeconds, candidate.cut_off_time);
    if (!expiresAt) return null;
    const canonical = JSON.stringify({
      carrierCode: candidate.carrier.code,
      checkoutIdentifier: candidate.checkout_identifier,
      configurationId: value.configuration_id,
      deliveryMethodType: candidate.delivery_method_type,
      id: candidate.id,
      leadTimeHours: candidate.lead_time_hours,
      shippingRate: candidate.shipping_rate,
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
      displayName: candidate.title,
      deliveryMode: candidate.delivery_method_type === "service_point_delivery"
        ? "service_point" as const
        : "home" as const,
      amountCents: centsFromDecimal(candidate.shipping_rate.value),
      currency: "EUR" as const,
      estimatedDaysMin: Math.max(1, Math.ceil((candidate.lead_time_hours.p50 as number) / 24)),
      estimatedDaysMax: Math.max(1, Math.ceil((candidate.lead_time_hours.p90 as number) / 24)),
      dutiesTerms: context.dutiesTerms,
      expiresAt,
      // Sendcloud does not claim a signed response here. This is our canonical
      // response fingerprint for replay/audit, never a provider signature.
      responseFingerprint: await sha256Hex(canonical),
    });
  }));
  return Object.freeze(parsed.filter((option): option is DeliveryQuoteOffer => option !== null));
}

/** Strict subset of the documented Service Points V2 list response. */
export function parseSendcloudServicePoints(value: unknown): readonly DeliveryServicePoint[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new DeliveryProviderError("MALFORMED_RESPONSE", "Service-points response is invalid.");
  }
  return Object.freeze(value.map((candidate) => {
    if (!record(candidate) ||
      !((Number.isSafeInteger(candidate.id) && (candidate.id as number) >= 0) || safeString(candidate.id)) ||
      !safeString(candidate.name) || !safeString(candidate.postal_code, 32) ||
      !safeString(candidate.city, 100) || !safeString(candidate.country, 2) ||
      !/^[A-Z]{2}$/.test(candidate.country)) {
      throw new DeliveryProviderError("MALFORMED_RESPONSE", "Service-point shape is invalid.");
    }
    return Object.freeze({
      providerPointReference: String(candidate.id),
      displayName: candidate.name,
      postalCode: candidate.postal_code,
      city: candidate.city,
      countryCode: candidate.country,
      openingHoursSummary: record(candidate.formatted_opening_times)
        ? JSON.stringify(candidate.formatted_opening_times)
        : null,
    });
  }));
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

async function providerJson(
  fetchImpl: FetchLike,
  auth: Readonly<{ publicKey: string; secretKey: string }>,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: basic(auth.publicKey, auth.secretKey),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    throw new DeliveryProviderError(timeout ? "TIMEOUT" : "OUTCOME_UNKNOWN", "Provider call failed.", { cause: error });
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new DeliveryProviderError(response.status >= 500 ? "OUTCOME_UNKNOWN" : "REJECTED", "Provider rejected request.");
  }
  return boundedJson(response);
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
              "Idempotency-Key": request.requestId,
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
        return parseSendcloudDeliveryOptions(response, {
          now: request.now,
          ttlSeconds: request.ttlSeconds,
          dutiesTerms: request.dutiesTerms,
        });
      },
    }),
    servicePoints: Object.freeze({
      async servicePoints(request: ServicePointRequest) {
        const url = new URL(`${SERVICE_POINTS_ORIGIN}/api/v2/service-points`);
        url.searchParams.set("country", request.countryCode);
        url.searchParams.set("postal_code", request.postalCode);
        url.searchParams.set("carrier", request.carrierCode);
        return parseSendcloudServicePoints(await providerJson(
          fetchImpl,
          auth,
          url.href,
          { method: "GET" },
        ));
      },
    }),
    // Label/document creation stays closed until a reviewed official contract,
    // sender identity and enabled shipping method exist. No fictional endpoint.
    documents: Object.freeze({
      async document(): Promise<ShippingDocumentReceipt> {
        throw new DeliveryProviderError("NOT_CONFIGURED", "Sendcloud shipping documents are not enabled.");
      },
    }),
  });
}
