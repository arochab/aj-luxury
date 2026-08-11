export const ANALYTICS_SCHEMA_VERSION = 3 as const;

export const ANALYTICS_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
] as const;

export type AnalyticsUtmKey = (typeof ANALYTICS_UTM_KEYS)[number];
export type AnalyticsUtm = Partial<Record<AnalyticsUtmKey, string>>;

export type AnalyticsDataPolicy = Readonly<{
  canonicalOrigin: string;
  allowedPaths: readonly string[];
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

export type CommerceSummary = {
  itemCount: number;
  valueMinor: number;
  currency: string;
};

export type AnalyticsEvent<Name extends string, Payload> = {
  schemaVersion: typeof ANALYTICS_SCHEMA_VERSION;
  name: Name;
  occurredAt: string;
  context: SanitizedAnalyticsContext;
  payload: Payload;
};
