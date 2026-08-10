import type { ClientAnalyticsFacade } from "../lib/analytics/index.ts";

declare const analytics: ClientAnalyticsFacade;

const context = { url: "https://ajluxurystore.com/products/rose-pale" };

analytics.track(
  "product_view",
  { productId: "apollon-rose" },
  context,
);
analytics.track(
  "add_to_cart",
  {
    productId: "apollon-rose",
    variantId: "variant_boxer_rose-pale_xl",
    quantity: 1,
  },
  context,
);
analytics.track(
  "checkout_started",
  { lines: [{ variantId: "variant_boxer_rose-pale_xl", quantity: 1 }] },
  { url: "https://ajluxurystore.com/checkout" },
);

// @ts-expect-error order_paid is a server-only event.
analytics.track("order_paid", { lines: [] }, context);

analytics.track(
  "add_to_cart",
  {
    productId: "apollon-rose",
    variantId: "variant_boxer_rose-pale_xl",
    quantity: 1,
    // @ts-expect-error Values are derived from the governed catalogue.
    valueMinor: 1,
  },
  context,
);

analytics.track(
  "checkout_started",
  {
    // @ts-expect-error Checkout totals cannot be supplied by the browser.
    valueMinor: 1,
  },
  { url: "https://ajluxurystore.com/checkout" },
);
