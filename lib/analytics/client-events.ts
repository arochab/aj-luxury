import type { AnalyticsEvent, AnalyticsLineInput } from "./shared.ts";

export const CLIENT_ANALYTICS_EVENT_NAMES = [
  "product_view",
  "add_to_cart",
  "checkout_started",
] as const;

export type ClientAnalyticsEventName =
  (typeof CLIENT_ANALYTICS_EVENT_NAMES)[number];

export const CLIENT_ANALYTICS_INPUT_FIELD_ALLOWLIST = {
  product_view: ["productId", "variantId"],
  add_to_cart: ["productId", "variantId", "quantity"],
  checkout_started: ["lines"],
} as const satisfies Record<ClientAnalyticsEventName, readonly string[]>;

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

export type ClientAnalyticsPayloadByName = {
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
};

export type ClientAnalyticsEvent = {
  [Name in ClientAnalyticsEventName]: AnalyticsEvent<
    Name,
    ClientAnalyticsPayloadByName[Name]
  >;
}[ClientAnalyticsEventName];
