import {
  DeliveryProviderError,
  type DeliveryDutiesTerms,
} from "./delivery-provider.ts";
import { createSendcloudProviderPorts } from "./sendcloud-provider.ts";

const SENDER_ADDRESSES_URL =
  "https://panel.sendcloud.sc/api/v3/addresses/sender-addresses?page_size=100";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,190}$/;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type SendcloudConnectionSample = Readonly<{
  countryCode: string;
  postalCode: string;
  city: string;
  dutiesTerms: DeliveryDutiesTerms;
}>;

export type SendcloudConnectionResult = Readonly<{
  credentialsValid: boolean;
  senderAddressReady: boolean;
  senderAddressId: string | null;
  dynamicCheckoutReady: boolean;
  homeDeliveryReady: boolean;
  relayDeliveryReady: boolean;
  internationalQuoteReady: boolean;
  reason:
    | "ready"
    | "credentials-not-configured"
    | "credentials-rejected"
    | "sender-address-unavailable"
    | "belmont-sender-address-missing"
    | "dynamic-checkout-unavailable"
    | "provider-response-invalid";
}>;

type SenderAddress = Readonly<{
  id: string;
  companyName: string;
  addressLine1: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  countryCode: string;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function compact(value: string): string {
  return normalized(value).replace(/\s/g, "");
}

function basic(publicKey: string, secretKey: string): string {
  const bytes = new TextEncoder().encode(`${publicKey}:${secretKey}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    await response.body?.cancel();
    throw new Error("response-too-large");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error("response-too-large");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export function parseSendcloudSenderAddresses(value: unknown): readonly SenderAddress[] {
  if (!record(value) || !Array.isArray(value.data) || value.data.length > 100) {
    throw new Error("sender-address-envelope-invalid");
  }
  return Object.freeze(value.data.map((candidate) => {
    if (!record(candidate) || !Number.isSafeInteger(candidate.id) || Number(candidate.id) < 1) {
      throw new Error("sender-address-invalid");
    }
    const fields = [
      "company_name", "address_line_1", "house_number", "postal_code", "city", "country_code",
    ] as const;
    if (fields.some((field) => typeof candidate[field] !== "string" || candidate[field].length > 190)) {
      throw new Error("sender-address-invalid");
    }
    return Object.freeze({
      id: String(candidate.id),
      companyName: candidate.company_name as string,
      addressLine1: candidate.address_line_1 as string,
      houseNumber: candidate.house_number as string,
      postalCode: candidate.postal_code as string,
      city: candidate.city as string,
      countryCode: candidate.country_code as string,
    });
  }));
}

function isBelmontOrigin(address: SenderAddress): boolean {
  return normalized(address.companyName) === "aj luxury" &&
    normalized(address.addressLine1) === "rue principale" &&
    compact(address.houseNumber) === "3a" &&
    compact(address.postalCode) === "67130" &&
    normalized(address.city) === "belmont" &&
    address.countryCode === "FR";
}

async function senderAddresses(
  publicKey: string,
  secretKey: string,
  fetchImpl: FetchLike,
): Promise<readonly SenderAddress[]> {
  const response = await fetchImpl(SENDER_ADDRESSES_URL, {
    method: "GET",
    redirect: "error",
    headers: { Accept: "application/json", Authorization: basic(publicKey, secretKey) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(response.status === 401 || response.status === 403
      ? "credentials-rejected"
      : "sender-address-unavailable");
  }
  return parseSendcloudSenderAddresses(await boundedJson(response));
}

function result(
  values: Omit<SendcloudConnectionResult, "reason">,
  reason: SendcloudConnectionResult["reason"],
): SendcloudConnectionResult {
  return Object.freeze({ ...values, reason });
}

const EMPTY = Object.freeze({
  credentialsValid: false,
  senderAddressReady: false,
  senderAddressId: null,
  dynamicCheckoutReady: false,
  homeDeliveryReady: false,
  relayDeliveryReady: false,
  internationalQuoteReady: false,
} as const);

/**
 * Read-only Sendcloud connection drill. It never creates a shipment, label,
 * tracking event or return and never returns credentials or customer PII.
 */
export async function checkSendcloudControlledConnection(
  configuration: Readonly<{ publicKey?: string; secretKey?: string }>,
  franceSample: SendcloudConnectionSample,
  fetchImpl: FetchLike = fetch,
): Promise<SendcloudConnectionResult> {
  const publicKey = configuration.publicKey?.trim() ?? "";
  const secretKey = configuration.secretKey?.trim() ?? "";
  if (!SAFE_KEY.test(publicKey) || secretKey.length < 16 || secretKey.length > 256) {
    return result(EMPTY, "credentials-not-configured");
  }

  let addresses: readonly SenderAddress[];
  try {
    addresses = await senderAddresses(publicKey, secretKey, fetchImpl);
  } catch (error) {
    const reason = error instanceof Error && error.message === "credentials-rejected"
      ? "credentials-rejected"
      : error instanceof Error && error.message === "sender-address-unavailable"
      ? "sender-address-unavailable"
      : "provider-response-invalid";
    return result({ ...EMPTY, credentialsValid: reason !== "credentials-rejected" }, reason);
  }
  const sender = addresses.find(isBelmontOrigin);
  if (!sender) {
    return result({ ...EMPTY, credentialsValid: true }, "belmont-sender-address-missing");
  }

  const provider = createSendcloudProviderPorts({ publicKey, secretKey }, fetchImpl);
  const now = new Date().toISOString();
  const parcel = Object.freeze({
    profileCode: "AJL_ENVELOPE_1_ITEM_V1",
    sourceVersion: "client-validated-2026-08-13",
    itemCount: 1,
    weightGrams: 150,
    lengthMm: 400,
    widthMm: 320,
    heightMm: 40,
  } as const);
  try {
    const offers = await provider.quotes.quote({
      requestId: "sendcloud-connection-france",
      now,
      ttlSeconds: 900,
      originCountryCode: "FR",
      dutiesTerms: franceSample.dutiesTerms,
      subtotalCents: 2999,
      destination: franceSample,
      parcel,
    });
    const homeDeliveryReady = offers.some((offer) => offer.deliveryMode === "home");
    const relayOffer = offers.find((offer) => offer.deliveryMode === "service_point");
    let relayDeliveryReady = false;
    if (relayOffer) {
      const points = await provider.servicePoints.servicePoints({
        requestId: "sendcloud-connection-relay",
        providerQuoteReference: relayOffer.providerQuoteReference,
        countryCode: franceSample.countryCode,
        postalCode: franceSample.postalCode,
        city: franceSample.city,
        carrierCode: relayOffer.carrierCode,
      });
      relayDeliveryReady = points.length > 0;
    }

    let internationalQuoteReady = false;
    try {
      const international = await provider.quotes.quote({
        requestId: "sendcloud-connection-international",
        now,
        ttlSeconds: 900,
        originCountryCode: "FR",
        dutiesTerms: "DAP",
        subtotalCents: 2999,
        destination: { countryCode: "US", postalCode: "10001", city: "New York" },
        parcel,
      });
      internationalQuoteReady = international.some((offer) => offer.deliveryMode === "home");
    } catch {
      // A missing international option is a closed capability, not a failed
      // France connection and never triggers a shipment side effect.
    }

    const dynamicCheckoutReady = homeDeliveryReady || Boolean(relayOffer);
    return result({
      credentialsValid: true,
      senderAddressReady: true,
      senderAddressId: sender.id,
      dynamicCheckoutReady,
      homeDeliveryReady,
      relayDeliveryReady,
      internationalQuoteReady,
    }, dynamicCheckoutReady ? "ready" : "dynamic-checkout-unavailable");
  } catch (error) {
    const reason = error instanceof DeliveryProviderError && error.code === "MALFORMED_RESPONSE"
      ? "provider-response-invalid"
      : "dynamic-checkout-unavailable";
    return result({
      ...EMPTY,
      credentialsValid: true,
      senderAddressReady: true,
      senderAddressId: sender.id,
    }, reason);
  }
}
