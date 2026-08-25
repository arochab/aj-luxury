import type { ClientValidatedParcelProfile } from "./parcel-profiles.ts";
import type { ReturnShipmentProviderPort } from "./return-provider.ts";

export type DeliveryMode = "home" | "service_point";
export type DeliveryDutiesTerms = "EU_INCLUDED" | "DAP" | "DDP";

export type DeliveryQuoteRequest = Readonly<{
  requestId: string;
  now: string;
  ttlSeconds: number;
  originCountryCode: string;
  dutiesTerms: DeliveryDutiesTerms;
  subtotalCents: number;
  destination: Readonly<{
    countryCode: string;
    postalCode: string;
    city: string;
  }>;
  parcel: ClientValidatedParcelProfile;
}>;

export type DeliveryQuoteOffer = Readonly<{
  providerCode: string;
  providerQuoteReference: string;
  carrierCode: string;
  serviceCode: string;
  displayName: string;
  deliveryMode: DeliveryMode;
  amountCents: number;
  currency: "EUR";
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  dutiesTerms: DeliveryDutiesTerms;
  expiresAt: string;
  responseFingerprint: string;
}>;

export type ServicePointRequest = Readonly<{
  requestId: string;
  providerQuoteReference: string;
  countryCode: string;
  postalCode: string;
  city: string;
  carrierCode: string;
}>;

export type DeliveryServicePoint = Readonly<{
  providerPointReference: string;
  displayName: string;
  postalCode: string;
  city: string;
  countryCode: string;
  openingHoursSummary: string | null;
}>;

export type ShippingDocumentRequest = Readonly<{
  requestId: string;
  /** Sendcloud parcel id, not its parent shipment/return id. */
  providerParcelReference: string;
  documentKind: "label" | "customs" | "return_label";
}>;

export type ShippingDocumentReceipt = Readonly<{
  providerDocumentReference: string;
  mediaType: "application/pdf" | "image/png" | "application/zpl";
  contentSha256: string;
  byteLength: number;
  /** Immutable binary payload returned by the provider, ready for storage/printing. */
  content: Blob;
}>;

export interface DeliveryQuoteProviderPort {
  quote(request: DeliveryQuoteRequest): Promise<readonly DeliveryQuoteOffer[]>;
}

export interface DeliveryServicePointProviderPort {
  servicePoints(
    request: ServicePointRequest,
  ): Promise<readonly DeliveryServicePoint[]>;
}

export interface ShippingDocumentProviderPort {
  document(request: ShippingDocumentRequest): Promise<ShippingDocumentReceipt>;
}

export type DeliveryProviderPorts = Readonly<{
  quotes: DeliveryQuoteProviderPort;
  servicePoints: DeliveryServicePointProviderPort;
  documents: ShippingDocumentProviderPort;
  returns: ReturnShipmentProviderPort;
}>;

export class DeliveryProviderError extends Error {
  readonly code:
    | "NOT_CONFIGURED"
    | "TIMEOUT"
    | "MALFORMED_RESPONSE"
    | "REJECTED"
    | "OUTCOME_UNKNOWN";

  constructor(
    code:
      | "NOT_CONFIGURED"
      | "TIMEOUT"
      | "MALFORMED_RESPONSE"
      | "REJECTED"
      | "OUTCOME_UNKNOWN",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DeliveryProviderError";
    this.code = code;
  }
}

export const deliveryProviderClosed = Object.freeze({
  connectorReady: false,
  providerConnected: false,
  realRates: false,
  realLabels: false,
  live: false,
  reason: "sendcloud-activation-and-reviewed-shipping-documents-not-configured",
} as const);
