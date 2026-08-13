export type CurrencyCode = "EUR";

export type Money = {
  amountCents: number;
  currency: CurrencyCode;
};

export type ProductOption = {
  name: "color" | "size";
  value: string;
};

export type InventoryPolicy = "deny-when-empty" | "continue-selling";

export type ProductVariant = {
  id: string;
  productId: string;
  productSlug: string;
  productName: string;
  title: string;
  sku: string;
  options: ProductOption[];
  color: {
    name: string;
    swatch: string;
  };
  size: "S" | "M" | "L" | "XL";
  imageUrl: string;
  price: Money;
  availableForSale: boolean;
  inventoryPolicy: InventoryPolicy;
  /** Quantité interne disponible à la vente. Ne jamais exposer au navigateur. */
  inventoryQuantity: number | null;
};

export type CartLine = {
  id: string;
  variantId: ProductVariant["id"];
  variant: ProductVariant;
  quantity: number;
  lineTotal: Money;
};

export type Cart = {
  id: string;
  lines: CartLine[];
  subtotal: Money;
  shipping: Money | null;
  tax: Money | null;
  total: Money;
  status: "open" | "converted" | "expired";
  checkoutUrl: string;
};

export type Address = {
  firstName: string;
  lastName: string;
  company?: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  countryCode: "FR" | "BE" | "LU" | "CH" | (string & {});
  phone?: string;
};

export type Customer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  acceptsMarketing: boolean;
  defaultAddress: Address | null;
  createdAt: string;
};

export type OrderStatus =
  | "pending-payment"
  | "paid"
  | "preparing"
  | "fulfilled"
  | "cancelled"
  | "refunded";

export type Order = {
  id: string;
  number: string;
  customerId: Customer["id"] | null;
  email: string;
  lines: CartLine[];
  shippingAddress: Address;
  billingAddress: Address;
  subtotal: Money;
  shipping: Money;
  tax: Money;
  total: Money;
  status: OrderStatus;
  paymentSessionId: string | null;
  createdAt: string;
};

export type PaymentProvider = "mock" | "stripe";

export type PaymentSession = {
  id: string;
  provider: PaymentProvider;
  mode: "simulation" | "live";
  status: "created" | "requires-action" | "succeeded" | "failed" | "expired";
  cartId: Cart["id"];
  amount: Money;
  returnUrl: string;
  expiresAt: string;
};

export type CreatePaymentSessionInput = {
  cart: Cart;
  returnUrl: string;
};

export type CreateOrderInput = {
  cart: Cart;
  customer: Customer | null;
  email: string;
  shippingAddress: Address;
  billingAddress: Address;
  paymentSession: PaymentSession;
};

export interface CommerceProvider {
  readonly name: string;
  readonly mode: "simulation" | "live";
  listLaunchVariants(): Promise<ProductVariant[]>;
  getVariant(variantId: string): Promise<ProductVariant | null>;
  createCart(): Promise<Cart>;
  addCartLine(
    cart: Cart,
    variantId: string,
    quantity: number,
  ): Promise<Cart>;
  createPaymentSession(
    input: CreatePaymentSessionInput,
  ): Promise<PaymentSession>;
  createOrder(input: CreateOrderInput): Promise<Order>;
  getCustomer(customerId: string): Promise<Customer | null>;
}
