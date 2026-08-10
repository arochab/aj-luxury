export const ANALYTICS_SCHEMA_VERSION = 2 as const;

export const CLIENT_ANALYTICS_EVENT_NAMES = [
  "product_view",
  "add_to_cart",
  "checkout_started",
] as const;

export const SERVER_ANALYTICS_EVENT_NAMES = ["order_paid"] as const;

export const ANALYTICS_EVENT_NAMES = [
  ...CLIENT_ANALYTICS_EVENT_NAMES,
  ...SERVER_ANALYTICS_EVENT_NAMES,
] as const;

export type ClientAnalyticsEventName =
  (typeof CLIENT_ANALYTICS_EVENT_NAMES)[number];
export type ServerAnalyticsEventName =
  (typeof SERVER_ANALYTICS_EVENT_NAMES)[number];
export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export const CLIENT_ANALYTICS_INPUT_FIELD_ALLOWLIST = {
  product_view: ["productId", "variantId"],
  add_to_cart: ["productId", "variantId", "quantity"],
  checkout_started: ["lines"],
} as const satisfies Record<ClientAnalyticsEventName, readonly string[]>;

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

export type AnalyticsCatalogVariant = Readonly<{
  variantId: string;
  productId: string;
  unitPriceMinor: number;
  currency: string;
}>;

export type AnalyticsDataPolicy = Readonly<{
  canonicalOrigin: string;
  allowedPaths: readonly string[];
  catalog: Readonly<{
    variants: readonly AnalyticsCatalogVariant[];
  }>;
  attribution: Readonly<{
    allowedReferrerOrigins: readonly string[];
    allowedUtmValues: Readonly<
      Record<AnalyticsUtmKey, readonly string[]>
    >;
  }>;
}>;

export type AnalyticsContextInput = {
  url: string;
  referrer?: string;
  utm?: AnalyticsUtm;
};

export type SanitizedAnalyticsContext = {
  path: string;
  referrerOrigin?: string;
  utm?: AnalyticsUtm;
};

export type AnalyticsLineInput = {
  variantId: string;
  quantity: number;
};

export type ClientAnalyticsInputByName = {
  product_view: {
    productId: string;
    variantId?: string;
  };
  add_to_cart: {
    productId: string;
    variantId: string;
    quantity: number;
  };
  checkout_started: {
    lines: readonly AnalyticsLineInput[];
  };
};

export type ServerOrderPaidInput = {
  lines: readonly AnalyticsLineInput[];
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

export type ClientAnalyticsEvent = {
  [Name in ClientAnalyticsEventName]: AnalyticsEvent<Name>;
}[ClientAnalyticsEventName];

export type ServerOrderPaidEvent = AnalyticsEvent<"order_paid">;
export type AnyAnalyticsEvent = ClientAnalyticsEvent | ServerOrderPaidEvent;
