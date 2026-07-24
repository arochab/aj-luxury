import { getLaunchVariant, launchVariants } from "./catalog";
import type {
  Cart,
  CartLine,
  CommerceProvider,
  CreateOrderInput,
  CreatePaymentSessionInput,
  Customer,
  Money,
  Order,
  PaymentSession,
  ProductVariant,
} from "./types";

const zero: Money = { amountCents: 0, currency: "EUR" };

function totalLines(lines: CartLine[]): Money {
  return {
    amountCents: lines.reduce(
      (total, line) => total + line.lineTotal.amountCents,
      0,
    ),
    currency: "EUR",
  };
}

function withTotals(cart: Cart, lines: CartLine[]): Cart {
  const subtotal = totalLines(lines);

  return {
    ...cart,
    lines,
    subtotal,
    shipping: null,
    tax: null,
    total: subtotal,
  };
}

/**
 * Provider sans I/O et sans persistance. Il documente le contrat attendu
 * d'un futur connecteur Shopify/Stripe sans prétendre encaisser ni stocker.
 */
export const mockCommerceProvider: CommerceProvider = {
  name: "AJ Luxury local commerce simulator",
  mode: "simulation",

  async listLaunchVariants(): Promise<ProductVariant[]> {
    return launchVariants;
  },

  async getVariant(variantId: string): Promise<ProductVariant | null> {
    return getLaunchVariant(variantId);
  },

  async createCart(): Promise<Cart> {
    return {
      id: "cart_demo_local",
      lines: [],
      subtotal: zero,
      shipping: null,
      tax: null,
      total: zero,
      status: "open",
      checkoutUrl: "/checkout",
    };
  },

  async addCartLine(
    cart: Cart,
    variantId: string,
    quantity: number,
  ): Promise<Cart> {
    const variant = getLaunchVariant(variantId);

    if (!variant || !variant.availableForSale || quantity < 1) {
      return cart;
    }

    const line: CartLine = {
      id: `line_${variant.id}`,
      variantId: variant.id,
      variant,
      quantity,
      lineTotal: {
        amountCents: variant.price.amountCents * quantity,
        currency: variant.price.currency,
      },
    };

    const existing = cart.lines.filter(
      (cartLine) => cartLine.variantId !== variant.id,
    );
    return withTotals(cart, [...existing, line]);
  },

  async createPaymentSession({
    cart,
    returnUrl,
  }: CreatePaymentSessionInput): Promise<PaymentSession> {
    return {
      id: "payment_session_demo_local",
      provider: "mock",
      mode: "simulation",
      status: "created",
      cartId: cart.id,
      amount: cart.total,
      returnUrl,
      expiresAt: "2026-07-23T20:00:00.000Z",
    };
  },

  async createOrder(input: CreateOrderInput): Promise<Order> {
    return {
      id: "order_demo_local",
      number: "AJ-DEMO-0001",
      customerId: input.customer?.id ?? null,
      email: input.email,
      lines: input.cart.lines,
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress,
      subtotal: input.cart.subtotal,
      shipping: zero,
      tax: zero,
      total: input.cart.total,
      status: "pending-payment",
      paymentSessionId: input.paymentSession.id,
      createdAt: "2026-07-23T16:00:00.000Z",
    };
  },

  async getCustomer(customerId: string): Promise<Customer | null> {
    if (customerId !== "customer_demo_local") {
      return null;
    }

    return {
      id: "customer_demo_local",
      email: "client@example.com",
      firstName: "Client",
      lastName: "Démonstration",
      acceptsMarketing: false,
      defaultAddress: null,
      createdAt: "2026-07-23T16:00:00.000Z",
    };
  },
};

export async function createDemoCart(
  variantId = "variant_boxer_pourpre_m",
) {
  const emptyCart = await mockCommerceProvider.createCart();
  return mockCommerceProvider.addCartLine(emptyCart, variantId, 1);
}
