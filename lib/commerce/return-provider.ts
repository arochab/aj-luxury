import type { DeliveryDutiesTerms } from "./delivery-provider.ts";
import {
  isClientValidatedParcelProfile,
  type ClientValidatedParcelProfile,
} from "./parcel-profiles.ts";
import { resolveLaunchShippingScope } from "./shipping-policy.ts";

export const AJ_LUXURY_RETURN_ADDRESS = Object.freeze({
  name: "AJ Luxury",
  addressLine1: "rue Principale",
  houseNumber: "3 A",
  postalCode: "67130",
  city: "Belmont",
  countryCode: "FR",
} as const);

export type ReturnProviderAddress = Readonly<{
  name: string;
  companyName?: string;
  addressLine1: string;
  addressLine2?: string;
  houseNumber?: string;
  postalCode: string;
  city: string;
  stateProvinceCode?: string;
  countryCode: string;
  phoneNumber?: string;
  email?: string;
}>;

export type ReturnProviderItem = Readonly<{
  orderLineId: string;
  description: string;
  quantity: number;
  netWeightGrams: number;
  unitPriceCents: number;
  sku: string;
  productId: string;
  hsCode?: string;
  originCountryCode?: string;
  returnReasonId?: string;
  returnMessage?: string;
}>;

export type ApprovedReturnShipmentInput = Readonly<{
  returnRequestId: string;
  orderNumber: string;
  status: "received" | "approved" | "rejected";
  requestedAt: string;
  approvedAt?: string;
  shippingOptionCode: string;
  dutiesTerms: DeliveryDutiesTerms;
  customerAddress: ReturnProviderAddress;
  parcel: ClientValidatedParcelProfile;
  items: readonly ReturnProviderItem[];
  customsInvoiceNumber?: string;
}>;

export type ReadyReturnShipmentRequest = Readonly<{
  idempotencyKey: string;
  returnRequestId: string;
  orderNumber: string;
  approvedAt: string;
  shippingOptionCode: string;
  dutiesTerms: "EU_INCLUDED" | "DAP";
  fromAddress: ReturnProviderAddress;
  toAddress: typeof AJ_LUXURY_RETURN_ADDRESS;
  parcel: ClientValidatedParcelProfile;
  items: readonly ReturnProviderItem[];
  customsInvoiceNumber: string | null;
}>;

export type ReturnShipmentReceipt = Readonly<{
  providerCode: "sendcloud";
  providerReturnReference: string;
  providerParcelReference: string;
  idempotencyKey: string;
  receiptFingerprint: string;
}>;

export interface ReturnShipmentProviderPort {
  validate(request: ReadyReturnShipmentRequest): Promise<void>;
  create(request: ReadyReturnShipmentRequest): Promise<ReturnShipmentReceipt>;
}

export class ReturnOrchestrationError extends Error {
  readonly code:
    | "NOT_APPROVED"
    | "INVALID_INPUT"
    | "DESTINATION_UNAVAILABLE"
    | "CUSTOMS_NOT_READY";

  constructor(
    code:
      | "NOT_APPROVED"
      | "INVALID_INPUT"
      | "DESTINATION_UNAVAILABLE"
      | "CUSTOMS_NOT_READY",
    message: string,
  ) {
    super(message);
    this.name = "ReturnOrchestrationError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const SAFE_SHIPPING_OPTION = /^[A-Za-z0-9][A-Za-z0-9_.,:/=-]{0,191}$/;
const SAFE_COUNTRY = /^[A-Z]{2}$/;
const SAFE_HS_CODE = /^[0-9]{4}(?:\.[0-9]{2,8})?$/;
const STRICT_UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function safeText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 &&
    value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !STRICT_UTC_ISO.test(value)) return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
}

function validateAddress(address: ReturnProviderAddress): void {
  if (
    !safeText(address.name, 80) || !safeText(address.addressLine1, 75) ||
    !safeText(address.postalCode, 16) || !safeText(address.city, 80) ||
    !SAFE_COUNTRY.test(address.countryCode) ||
    (address.companyName !== undefined && !safeText(address.companyName, 80)) ||
    (address.addressLine2 !== undefined && !safeText(address.addressLine2, 75)) ||
    (address.houseNumber !== undefined && !safeText(address.houseNumber, 20)) ||
    (address.stateProvinceCode !== undefined && !safeText(address.stateProvinceCode, 16)) ||
    (address.phoneNumber !== undefined && !safeText(address.phoneNumber, 32)) ||
    (address.email !== undefined &&
      (!safeText(address.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email)))
  ) {
    throw new ReturnOrchestrationError("INVALID_INPUT", "Return address is invalid.");
  }
}

function validateItems(
  items: readonly ReturnProviderItem[],
  parcel: ClientValidatedParcelProfile,
  needsCustoms: boolean,
): void {
  if (!Array.isArray(items) || items.length < 1 || items.length > 3) {
    throw new ReturnOrchestrationError("INVALID_INPUT", "Return items are invalid.");
  }
  const lineIds = new Set<string>();
  let quantity = 0;
  let netWeight = 0;
  for (const item of items) {
    if (
      !SAFE_IDENTIFIER.test(item.orderLineId) || lineIds.has(item.orderLineId) ||
      !safeText(item.description, 80) || !SAFE_IDENTIFIER.test(item.sku) ||
      !SAFE_IDENTIFIER.test(item.productId) ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 3 ||
      !Number.isSafeInteger(item.netWeightGrams) || item.netWeightGrams < 1 ||
      !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 0 ||
      item.unitPriceCents > 100_000_000 ||
      (item.hsCode !== undefined && !SAFE_HS_CODE.test(item.hsCode)) ||
      (item.originCountryCode !== undefined && !SAFE_COUNTRY.test(item.originCountryCode)) ||
      (item.returnReasonId !== undefined && !SAFE_IDENTIFIER.test(item.returnReasonId)) ||
      (item.returnMessage !== undefined && !safeText(item.returnMessage, 160)) ||
      (needsCustoms &&
        (!item.hsCode || !SAFE_HS_CODE.test(item.hsCode) ||
          !item.originCountryCode || !SAFE_COUNTRY.test(item.originCountryCode)))
    ) {
      throw new ReturnOrchestrationError("INVALID_INPUT", "Return item declaration is invalid.");
    }
    lineIds.add(item.orderLineId);
    quantity += item.quantity;
    netWeight += item.netWeightGrams * item.quantity;
  }
  if (quantity !== parcel.itemCount || netWeight > parcel.weightGrams) {
    throw new ReturnOrchestrationError(
      "INVALID_INPUT",
      "Return contents do not match the validated parcel profile.",
    );
  }
}

/**
 * Sole gate allowed to call a return-label provider. A received request is
 * acknowledgement only; provider validation and label creation happen after
 * an explicit approval timestamp.
 */
export async function createApprovedReturnShipment(
  input: ApprovedReturnShipmentInput,
  provider: ReturnShipmentProviderPort,
): Promise<ReturnShipmentReceipt> {
  if (input.status !== "approved" || !validTimestamp(input.approvedAt)) {
    throw new ReturnOrchestrationError("NOT_APPROVED", "Return request is not approved.");
  }
  if (
    !SAFE_IDENTIFIER.test(input.returnRequestId) || !SAFE_IDENTIFIER.test(input.orderNumber) ||
    !SAFE_SHIPPING_OPTION.test(input.shippingOptionCode) || !validTimestamp(input.requestedAt) ||
    input.approvedAt < input.requestedAt || !isClientValidatedParcelProfile(input.parcel)
  ) {
    throw new ReturnOrchestrationError("INVALID_INPUT", "Return shipment input is invalid.");
  }
  validateAddress(input.customerAddress);
  const scope = resolveLaunchShippingScope({
    countryCode: input.customerAddress.countryCode,
    postalCode: input.customerAddress.postalCode,
    regionCode: input.customerAddress.stateProvinceCode,
  });
  if (!scope.inScope) {
    throw new ReturnOrchestrationError(
      "DESTINATION_UNAVAILABLE",
      "Return origin is outside the launch scope.",
    );
  }
  const needsCustoms = scope.zone !== "EU";
  if (
    (scope.zone === "EU" && input.dutiesTerms !== "EU_INCLUDED") ||
    (needsCustoms && input.dutiesTerms !== "DAP")
  ) {
    throw new ReturnOrchestrationError(
      "CUSTOMS_NOT_READY",
      "Only EU-included or verified DAP return terms are enabled.",
    );
  }
  if (
    needsCustoms &&
    (!input.customsInvoiceNumber || !safeText(input.customsInvoiceNumber, 64))
  ) {
    throw new ReturnOrchestrationError(
      "CUSTOMS_NOT_READY",
      "International return customs data is incomplete.",
    );
  }
  validateItems(input.items, input.parcel, needsCustoms);
  const request = Object.freeze({
    idempotencyKey: `return:${input.returnRequestId}`,
    returnRequestId: input.returnRequestId,
    orderNumber: input.orderNumber,
    approvedAt: input.approvedAt,
    shippingOptionCode: input.shippingOptionCode,
    dutiesTerms: input.dutiesTerms as "EU_INCLUDED" | "DAP",
    fromAddress: Object.freeze({ ...input.customerAddress }),
    toAddress: AJ_LUXURY_RETURN_ADDRESS,
    parcel: input.parcel,
    items: Object.freeze(input.items.map((item) => Object.freeze({ ...item }))),
    customsInvoiceNumber: input.customsInvoiceNumber ?? null,
  });
  await provider.validate(request);
  return provider.create(request);
}
