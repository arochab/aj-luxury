export const ANALYTICS_SCHEMA_VERSION = 1 as const;

export const ANALYTICS_EVENT_NAMES = [
  "product_view",
  "add_to_cart",
  "checkout_started",
  "order_paid",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export const ANALYTICS_EVENT_FIELD_ALLOWLIST = {
  product_view: ["productId", "variantId"],
  add_to_cart: [
    "productId",
    "variantId",
    "quantity",
    "valueMinor",
    "currency",
  ],
  checkout_started: ["itemCount", "valueMinor", "currency"],
  order_paid: ["itemCount", "valueMinor", "currency"],
} as const satisfies Record<AnalyticsEventName, readonly string[]>;

export const ANALYTICS_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
] as const;

export type AnalyticsUtmKey = (typeof ANALYTICS_UTM_KEYS)[number];

export type AnalyticsUtm = Partial<Record<AnalyticsUtmKey, string>>;

export type AnalyticsDataPolicy = Readonly<{
  allowedPaths: readonly string[];
  allowedProductIds: readonly string[];
  allowedVariantIds: readonly string[];
  attribution: Readonly<{
    allowedReferrerOrigins: readonly string[];
    allowedUtmValues: Readonly<
      Record<AnalyticsUtmKey, readonly string[]>
    >;
  }>;
}>;

export type AnalyticsContextInput = {
  url?: string;
  referrer?: string;
  utm?: AnalyticsUtm;
};

export type SanitizedAnalyticsContext = {
  path: string;
  referrerOrigin?: string;
  utm?: AnalyticsUtm;
};

export type AnalyticsPayloadByName = {
  product_view: {
    productId: string;
    variantId?: string;
  };
  add_to_cart: {
    productId: string;
    variantId: string;
    quantity: number;
    valueMinor: number;
    currency: string;
  };
  checkout_started: {
    itemCount: number;
    valueMinor: number;
    currency: string;
  };
  order_paid: {
    itemCount: number;
    valueMinor: number;
    currency: string;
  };
};

export type AnalyticsEvent<
  Name extends AnalyticsEventName = AnalyticsEventName,
> = {
  schemaVersion: typeof ANALYTICS_SCHEMA_VERSION;
  name: Name;
  occurredAt: string;
  context: SanitizedAnalyticsContext;
  payload: AnalyticsPayloadByName[Name];
};

export type AnyAnalyticsEvent = {
  [Name in AnalyticsEventName]: AnalyticsEvent<Name>;
}[AnalyticsEventName];
