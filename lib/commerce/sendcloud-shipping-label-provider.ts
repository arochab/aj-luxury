import { D1DeliveryReferenceStore } from "./d1-delivery-reference-store.ts";
import type { CommerceD1Database } from "./d1-port.ts";
import { DeliveryReferenceVault, type DeliveryReferenceVaultConfiguration } from "./delivery-reference-vault.ts";
import {
  FulfillmentProviderError,
  normalizeShippingAddress,
  sha256Hex,
  type ShippingLabelProviderPort,
  type ShippingLabelReceipt,
  type ShippingLabelRequest,
} from "./fulfillment-domain.ts";

const PANEL_ORIGIN = "https://panel.sendcloud.sc";
const ANNOUNCE_URL = `${PANEL_ORIGIN}/api/v3/shipments/announce`;
const MAX_RESPONSE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,190}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,190}$/;
const SAFE_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,189}$/;
const BELMONT_ORIGIN_ATTESTATION = "3 A rue Principale|67130|Belmont|FR";

export type SendcloudShippingLabelConfiguration = Readonly<{
  publicKey?: string;
  secretKey?: string;
  senderAddressId?: string | number;
  /** Must attest that senderAddressId is the verified Sendcloud sender at Belmont. */
  originAddressAttestation?: string;
  referenceVault: DeliveryReferenceVaultConfiguration;
}>;

export type SendcloudShippingLabelFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ReferenceReader = Readonly<{
  open(kind: "delivery_quote" | "service_point", ownerId: string): Promise<string>;
}>;

type ShipmentContextRow = Readonly<{
  attempts: number;
  order_number: string;
  email: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  total_cents: number;
  shipping_address_json: string;
  shipping_address_fingerprint: string;
  option_id: string;
  provider_code: string;
  carrier_code: string;
  service_code: string;
  delivery_mode: "home" | "service_point";
  selected_service_point_id: string | null;
  zone: "EU" | "UK" | "US" | "CA";
  profile_code: string;
  source_version: string;
  item_count: number;
  weight_grams: number;
  length_mm: number;
  width_mm: number;
  height_mm: number;
}>;

type OrderLineRow = Readonly<{
  id: string;
  internal_reference: string;
  product_name: string;
  color_name: string;
  size: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}>;

type StoredAddress = Readonly<{
  recipient: string;
  company: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  regionCode: string | null;
  countryCode: string;
}>;

type ProviderCredentials = Readonly<{
  publicKey: string;
  secretKey: string;
  senderAddressId: number;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, maximum = 191): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function configuration(input: SendcloudShippingLabelConfiguration): ProviderCredentials {
  const publicKey = input.publicKey?.trim() ?? "";
  const secretKey = input.secretKey?.trim() ?? "";
  const senderAddressId = typeof input.senderAddressId === "string" && /^[1-9]\d{0,17}$/.test(input.senderAddressId)
    ? Number(input.senderAddressId)
    : input.senderAddressId;
  if (
    !SAFE_CODE.test(publicKey) || secretKey.length < 16 || secretKey.length > 256 ||
    !Number.isSafeInteger(senderAddressId) || Number(senderAddressId) < 1 ||
    input.originAddressAttestation !== BELMONT_ORIGIN_ATTESTATION
  ) {
    throw new FulfillmentProviderError("rejected", "Sendcloud shipment creation is not configured.");
  }
  return Object.freeze({ publicKey, secretKey, senderAddressId: Number(senderAddressId) });
}

function basic(credentials: ProviderCredentials): string {
  const bytes = new TextEncoder().encode(`${credentials.publicKey}:${credentials.secretKey}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

async function boundedJson(response: Response): Promise<unknown> {
  const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    await response.body?.cancel();
    throw new FulfillmentProviderError("ambiguous", "Sendcloud shipment receipt media type is invalid.");
  }
  const declared = response.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    await response.body?.cancel();
    throw new FulfillmentProviderError("ambiguous", "Sendcloud shipment receipt is not safely bounded.");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new FulfillmentProviderError("ambiguous", "Sendcloud shipment receipt is empty.");
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new FulfillmentProviderError("ambiguous", "Sendcloud shipment receipt is not safely bounded.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new FulfillmentProviderError("ambiguous", "Sendcloud shipment receipt is malformed.");
  }
}

function parseQuoteReference(
  raw: string,
  context: ShipmentContextRow,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FulfillmentProviderError("rejected", "The selected Sendcloud quote cannot be authenticated.");
  }
  if (
    !Array.isArray(parsed) || parsed.length !== 4 ||
    !parsed.every((part) => safeString(part)) ||
    parsed[2] !== context.carrier_code || parsed[3] !== context.service_code
  ) {
    throw new FulfillmentProviderError("rejected", "The selected Sendcloud quote cannot be authenticated.");
  }
  return String(parsed[3]);
}

function parseStoredAddress(value: string): StoredAddress {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new FulfillmentProviderError("rejected", "The paid order address is invalid.");
  }
  if (!record(parsed)) {
    throw new FulfillmentProviderError("rejected", "The paid order address is invalid.");
  }
  const keys = ["recipient", "company", "line1", "line2", "postalCode", "city", "regionCode", "countryCode"];
  if (
    Object.keys(parsed).sort().join("\0") !== keys.sort().join("\0") ||
    !safeString(parsed.recipient, 120) ||
    !(parsed.company === null || safeString(parsed.company, 120)) ||
    !safeString(parsed.line1, 160) ||
    !(parsed.line2 === null || safeString(parsed.line2, 160)) ||
    !safeString(parsed.postalCode, 16) || !safeString(parsed.city, 120) ||
    !(parsed.regionCode === null || safeString(parsed.regionCode, 2)) ||
    !safeString(parsed.countryCode, 2)
  ) {
    throw new FulfillmentProviderError("rejected", "The paid order address is invalid.");
  }
  return Object.freeze({
    recipient: parsed.recipient,
    company: parsed.company,
    line1: parsed.line1,
    line2: parsed.line2,
    postalCode: parsed.postalCode,
    city: parsed.city,
    regionCode: parsed.regionCode,
    countryCode: parsed.countryCode,
  });
}

async function verifiedAddress(row: ShipmentContextRow) {
  const stored = parseStoredAddress(row.shipping_address_json);
  try {
    const proof = await normalizeShippingAddress({
      recipient: stored.recipient,
      ...(stored.company === null ? {} : { company: stored.company }),
      line1: stored.line1,
      ...(stored.line2 === null ? {} : { line2: stored.line2 }),
      postalCode: stored.postalCode,
      city: stored.city,
      ...(stored.regionCode === null ? {} : { regionCode: stored.regionCode }),
      countryCode: stored.countryCode,
    });
    if (
      proof.canonicalJson !== row.shipping_address_json ||
      proof.fingerprint !== row.shipping_address_fingerprint ||
      proof.zone !== "EU" || row.zone !== "EU"
    ) {
      throw new Error("mismatch");
    }
    return proof.address;
  } catch {
    throw new FulfillmentProviderError(
      "rejected",
      "Only an authenticated EU address is enabled; customs destinations remain closed.",
    );
  }
}

function parcelIsExact(row: ShipmentContextRow, itemCount: number): boolean {
  const expected = row.item_count === 1
    ? ["AJL_ENVELOPE_1_ITEM_V1", 150]
    : row.item_count === 2
      ? ["AJL_ENVELOPE_2_ITEMS_V1", 250]
      : row.item_count === 3
        ? ["AJL_ENVELOPE_3_ITEMS_V1", 350]
        : null;
  return Boolean(
    expected && row.item_count === itemCount && row.profile_code === expected[0] &&
    row.weight_grams === expected[1] && row.source_version === "client-validated-2026-08-13" &&
    row.length_mm === 400 && row.width_mm === 320 && row.height_mm === 40,
  );
}

function exactMoney(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new FulfillmentProviderError("rejected", "The paid order amount is invalid.");
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function providerAddress(address: Awaited<ReturnType<typeof verifiedAddress>>, email: string) {
  if (!SAFE_EMAIL.test(email)) {
    throw new FulfillmentProviderError("rejected", "The paid order contact is invalid.");
  }
  return Object.freeze({
    name: address.recipient,
    ...(address.company ? { company_name: address.company } : {}),
    address_line_1: address.line1,
    ...(address.line2 ? { address_line_2: address.line2 } : {}),
    postal_code: address.postalCode,
    city: address.city,
    ...(address.regionCode ? { state_province_code: address.regionCode } : {}),
    country_code: address.countryCode,
    email,
  });
}

export function buildSendcloudShipmentPayload(input: Readonly<{
  request: ShippingLabelRequest;
  context: ShipmentContextRow;
  address: Awaited<ReturnType<typeof verifiedAddress>>;
  shippingOptionCode: string;
  senderAddressId: number;
  servicePointReference: string | null;
}>): Record<string, unknown> {
  let toServicePoint: Readonly<{ id: number }> | null = null;
  if (input.context.delivery_mode === "service_point") {
    if (!input.servicePointReference || !/^[1-9]\d{0,17}$/.test(input.servicePointReference)) {
      throw new FulfillmentProviderError("rejected", "The selected Sendcloud service point is invalid.");
    }
    toServicePoint = Object.freeze({ id: Number(input.servicePointReference) });
  } else if (input.context.selected_service_point_id !== null || input.servicePointReference !== null) {
    throw new FulfillmentProviderError("rejected", "The home-delivery snapshot is inconsistent.");
  }
  return {
    label_details: { mime_type: "application/pdf", dpi: 72 },
    to_address: providerAddress(input.address, input.context.email),
    from_address: { sender_address_id: input.senderAddressId },
    ship_with: {
      type: "shipping_option_code",
      properties: { shipping_option_code: input.shippingOptionCode },
    },
    order_number: input.context.order_number,
    total_order_price: {
      currency: "EUR",
      value: exactMoney(input.context.total_cents),
    },
    parcels: [{
      dimensions: {
        length: (input.context.length_mm / 10).toFixed(2),
        width: (input.context.width_mm / 10).toFixed(2),
        height: (input.context.height_mm / 10).toFixed(2),
        unit: "cm",
      },
      weight: {
        value: (input.context.weight_grams / 1_000).toFixed(3),
        unit: "kg",
      },
    }],
    reference: input.request.shipmentId,
    external_reference_id: input.request.idempotencyKey,
    ...(toServicePoint ? { to_service_point: toServicePoint } : {}),
  };
}

export async function parseSendcloudShipmentReceipt(
  value: unknown,
  request: ShippingLabelRequest,
  context: ShipmentContextRow,
): Promise<ShippingLabelReceipt> {
  if (!record(value) || Object.keys(value).length !== 1 || !record(value.data)) {
    throw new FulfillmentProviderError("ambiguous", "Sendcloud shipment receipt is malformed.");
  }
  const data = value.data;
  if (
    !safeString(data.id, 128) || !SAFE_IDENTIFIER.test(data.id) ||
    data.order_number !== context.order_number || !Array.isArray(data.errors) || data.errors.length !== 0 ||
    !record(data.label_details) || data.label_details.mime_type !== "application/pdf" || data.label_details.dpi !== 72 ||
    !Array.isArray(data.parcels) || data.parcels.length !== 1 ||
    !record(data.carrier) || data.carrier.code !== context.carrier_code ||
    (data.external_reference_id !== undefined && data.external_reference_id !== request.idempotencyKey)
  ) {
    throw new FulfillmentProviderError("ambiguous", "Sendcloud shipment receipt is malformed.");
  }
  const parcel = data.parcels[0];
  if (
    !record(parcel) || !Number.isSafeInteger(parcel.id) || Number(parcel.id) < 1 ||
    !safeString(parcel.tracking_number, 128) || !SAFE_IDENTIFIER.test(parcel.tracking_number) ||
    !record(parcel.status) || parcel.status.code !== "READY_TO_SEND" ||
    !Array.isArray(parcel.tracking_numbers) || parcel.tracking_numbers.length !== 1 ||
    !record(parcel.tracking_numbers[0]) ||
    parcel.tracking_numbers[0].tracking_number !== parcel.tracking_number ||
    !Array.isArray(parcel.documents)
  ) {
    throw new FulfillmentProviderError("ambiguous", "Sendcloud parcel receipt is malformed.");
  }
  const labels = parcel.documents.filter((document) =>
    record(document) && document.type === "label" && document.size === "a6"
  );
  if (labels.length !== 1 || !record(labels[0]) || !safeString(labels[0].link, 512)) {
    throw new FulfillmentProviderError("ambiguous", "Sendcloud did not prove one A6 label.");
  }
  let labelUrl: URL;
  try {
    labelUrl = new URL(String(labels[0].link));
  } catch {
    throw new FulfillmentProviderError("ambiguous", "Sendcloud label metadata is malformed.");
  }
  if (
    labelUrl.origin !== PANEL_ORIGIN ||
    labelUrl.pathname !== `/api/v3/parcels/${String(parcel.id)}/documents/label` ||
    labelUrl.search || labelUrl.hash || labelUrl.username || labelUrl.password
  ) {
    throw new FulfillmentProviderError("ambiguous", "Sendcloud label metadata is malformed.");
  }
  // Persist the parcel reference because Sendcloud's printable-document API is
  // parcel-scoped. The parent shipment id remains covered by the immutable
  // receipt fingerprint and the external idempotency reference.
  const providerShipmentReference = String(parcel.id);
  const trackingReference = String(parcel.tracking_number);
  return Object.freeze({
    shipmentId: request.shipmentId,
    orderId: request.orderId,
    idempotencyKey: request.idempotencyKey,
    providerCode: "sendcloud",
    providerShipmentReference,
    trackingReference,
    receiptFingerprint: await sha256Hex(JSON.stringify({
      carrierCode: context.carrier_code,
      externalReferenceId: request.idempotencyKey,
      label: { dpi: 72, mediaType: "application/pdf", size: "a6" },
      parcelId: Number(parcel.id),
      sendcloudShipmentId: String(data.id),
      providerShipmentReference,
      status: "READY_TO_SEND",
      trackingReference,
    })),
  });
}

class D1SendcloudShippingLabelProvider implements ShippingLabelProviderPort {
  readonly #database: CommerceD1Database;
  readonly #credentials: ProviderCredentials;
  readonly #fetch: SendcloudShippingLabelFetch;
  readonly #references: ReferenceReader;

  constructor(
    database: CommerceD1Database,
    configurationInput: SendcloudShippingLabelConfiguration,
    fetchImpl: SendcloudShippingLabelFetch,
    referenceReader?: ReferenceReader,
  ) {
    this.#database = database;
    this.#credentials = configuration(configurationInput);
    this.#fetch = fetchImpl;
    this.#references = referenceReader ?? new D1DeliveryReferenceStore(
      database,
      new DeliveryReferenceVault(configurationInput.referenceVault),
    );
  }

  async createLabel(request: ShippingLabelRequest): Promise<ShippingLabelReceipt> {
    const context = await this.#database.prepare(
      `SELECT shipment.attempts, customer_order.order_number,
        customer_order.email, customer_order.status, customer_order.currency,
        customer_order.subtotal_cents, customer_order.total_cents,
        customer_order.shipping_address_json,
        customer_order.shipping_address_fingerprint,
        option.id AS option_id, option.provider_code, option.carrier_code,
        option.service_code, option.delivery_mode,
        option.selected_service_point_id,
        configuration.zone, parcel.profile_code, parcel.source_version,
        parcel.item_count, parcel.weight_grams, parcel.length_mm,
        parcel.width_mm, parcel.height_mm
      FROM shipments AS shipment
      INNER JOIN orders AS customer_order ON customer_order.id = shipment.order_id
      INNER JOIN shipping_quotes AS quote ON quote.id = shipment.shipping_quote_id
      INNER JOIN shipping_zone_configurations AS configuration
        ON configuration.id = quote.configuration_id
      INNER JOIN delivery_option_snapshots AS option
        ON option.shipping_quote_id = quote.id AND option.selected_at IS NOT NULL
      INNER JOIN shipping_quote_parcel_snapshots AS parcel
        ON parcel.quote_id = quote.id
      WHERE shipment.id = ? AND shipment.order_id = ?
        AND shipment.shipping_quote_id = ? AND shipment.idempotency_key = ?
        AND shipment.status = 'label_claimed'`,
    ).bind(
      request.shipmentId,
      request.orderId,
      request.shippingQuoteId,
      request.idempotencyKey,
    ).first<ShipmentContextRow>();
    if (!context || context.status !== "paid" || context.currency !== "EUR" ||
      context.provider_code !== "sendcloud") {
      throw new FulfillmentProviderError("rejected", "A paid Sendcloud order snapshot is required.");
    }
    // A second network attempt after a lost receipt can duplicate a shipment.
    // The API's documented 409 is not accepted without an independently parsed
    // associated-object contract, so retries are manual-reconciliation only.
    if (context.attempts !== 1) {
      throw new FulfillmentProviderError("ambiguous", "Manual Sendcloud reconciliation is required.");
    }
    const lineResult = await this.#database.prepare(
      `SELECT id, internal_reference, product_name, color_name, size,
        quantity, unit_price_cents, line_total_cents
      FROM order_lines WHERE order_id = ? ORDER BY id`,
    ).bind(request.orderId).all<OrderLineRow>();
    const itemCount = lineResult.results.reduce((total, line) => total + line.quantity, 0);
    const subtotal = lineResult.results.reduce((total, line) => total + line.line_total_cents, 0);
    if (
      lineResult.results.length < 1 || lineResult.results.length > 3 ||
      lineResult.results.some((line) =>
        !SAFE_CODE.test(line.id) || !SAFE_CODE.test(line.internal_reference) ||
        !safeString(line.product_name, 160) || !safeString(line.color_name, 80) ||
        !["S", "M", "L", "XL"].includes(line.size) ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 3 ||
        !Number.isSafeInteger(line.unit_price_cents) || line.unit_price_cents < 0 ||
        line.line_total_cents !== line.unit_price_cents * line.quantity
      ) || subtotal !== context.subtotal_cents || !parcelIsExact(context, itemCount)
    ) {
      throw new FulfillmentProviderError("rejected", "The paid order parcel snapshot is invalid.");
    }
    const [address, quoteReference] = await Promise.all([
      verifiedAddress(context),
      this.#references.open("delivery_quote", context.option_id),
    ]).catch(() => {
      throw new FulfillmentProviderError("rejected", "The delivery proof cannot be authenticated.");
    });
    const shippingOptionCode = parseQuoteReference(quoteReference, context);
    let servicePointReference: string | null = null;
    if (context.delivery_mode === "service_point") {
      if (!context.selected_service_point_id) {
        throw new FulfillmentProviderError("rejected", "A selected service point is required.");
      }
      try {
        servicePointReference = await this.#references.open(
          "service_point",
          context.selected_service_point_id,
        );
      } catch {
        throw new FulfillmentProviderError("rejected", "The service-point proof cannot be authenticated.");
      }
    }
    const payload = buildSendcloudShipmentPayload({
      request,
      context,
      address,
      shippingOptionCode,
      senderAddressId: this.#credentials.senderAddressId,
      servicePointReference,
    });
    let response: Response;
    try {
      response = await this.#fetch(ANNOUNCE_URL, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: "application/json",
          Authorization: basic(this.#credentials),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new FulfillmentProviderError("ambiguous", "The Sendcloud shipment outcome is unknown.");
    }
    if (response.status !== 201) {
      await response.body?.cancel();
      // Only documented validation/auth/not-found classes are proven rejected.
      // A 202, timeout-class, throttling, conflict or server response may have
      // crossed the mutation boundary and therefore cannot be auto-retried.
      if (![400, 401, 403, 404, 422].includes(response.status)) {
        throw new FulfillmentProviderError(
          "ambiguous",
          "The Sendcloud shipment outcome requires manual reconciliation.",
        );
      }
      throw new FulfillmentProviderError("rejected", "Sendcloud rejected the shipment before a usable receipt.");
    }
    return parseSendcloudShipmentReceipt(await boundedJson(response), request, context);
  }
}

export function createSendcloudShippingLabelProvider(
  database: CommerceD1Database,
  configurationInput: SendcloudShippingLabelConfiguration,
  fetchImpl: SendcloudShippingLabelFetch = fetch,
  referenceReader?: ReferenceReader,
): ShippingLabelProviderPort {
  return new D1SendcloudShippingLabelProvider(
    database,
    configurationInput,
    fetchImpl,
    referenceReader,
  );
}
