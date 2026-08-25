import type {
  CheckoutLine,
  CheckoutSessionReceipt,
  CheckoutSessionRequest,
} from "./payment-provider.ts";
import type {
  CommerceD1Database,
  CommerceD1PreparedStatement,
} from "./d1-port.ts";
import {
  assertFulfillmentFingerprint,
  assertFulfillmentIdentifier,
  assertFulfillmentTimestamp,
  normalizeShippingAddress,
  sha256Hex,
  type ShippingAddressInput,
} from "./fulfillment-domain.ts";
import { prepareProductionDeliveryOrderSelection } from "./production-delivery-order-selection.ts";
import { calculateAjPackPricing } from "./pack-pricing.ts";

export type ProductionCheckoutErrorCode =
  | "INVALID_INPUT"
  | "ORDER_NOT_FOUND"
  | "ORDER_EXPIRED"
  | "ORDER_CONFLICT"
  | "PAYMENT_CONFLICT"
  | "CHECKOUT_UNAVAILABLE";

export class ProductionCheckoutError extends Error {
  readonly code: ProductionCheckoutErrorCode;

  constructor(
    code: ProductionCheckoutErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProductionCheckoutError";
    this.code = code;
  }
}

type CheckoutLineRow = Readonly<{
  variant_id: string;
  internal_reference: string;
  product_name: string;
  color_name: string;
  size: "S" | "M" | "L" | "XL";
  quantity: number;
  unit_price_cents: number;
}>;

type OrderRow = Readonly<{
  id: string;
  order_number: string;
  cart_id: string;
  customer_id: string | null;
  status: "pending_payment" | "paid";
  currency: "EUR";
  email: string;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  shipping_country_code: string;
  shipping_address_json: string;
  shipping_address_fingerprint: string;
  shipping_quote_id: string;
  terms_version: string;
  privacy_version: string;
  created_at: string;
  paid_at: string | null;
}>;

type QuoteRow = Readonly<{
  id: string;
  cart_id: string;
  cart_revision: number;
  shipping_address_fingerprint: string;
  amount_cents: number;
  currency: "EUR";
  expires_at: string;
  cart_status: string;
  cart_expires_at: string;
  fulfillment_revision: number;
}>;

type DeliveryOptionRow = Readonly<{
  id: string;
  shipping_quote_id: string;
  cart_id: string;
  cart_revision: number;
  shipping_address_fingerprint: string;
  delivery_mode: "home" | "service_point";
  display_name: string;
  amount_cents: number;
  expires_at: string;
  selected_at: string | null;
  selected_service_point_id: string | null;
}>;

type PaymentRow = Readonly<{
  provider_session_id: string;
  status: string;
  amount_cents: number;
  currency: "EUR";
  idempotency_key: string;
}>;

export type ProductionOrderSnapshot = Readonly<{
  orderNumber: string;
  status: "pending_payment" | "paid";
  currency: "EUR";
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  lines: readonly Readonly<{
    productName: string;
    colorName: string;
    size: "S" | "M" | "L" | "XL";
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>[];
}>;

export type CreateProductionOrderInput = Readonly<{
  cartId: string;
  quoteId: string;
  optionId: string;
  servicePointId?: string | null;
  address: ShippingAddressInput;
  email: string;
  customerId?: string | null;
  idempotencyKey: string;
  termsVersion: string;
  privacyVersion: string;
  now: string;
}>;

const orderColumns = `id, order_number, cart_id, customer_id, status,
  currency, email, subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
  shipping_country_code, shipping_address_json, shipping_address_fingerprint,
  shipping_quote_id, terms_version, privacy_version, created_at, paid_at`;
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProductionCheckoutError("INVALID_INPUT", "Email is invalid.");
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email) || !email.includes(".")) {
    throw new ProductionCheckoutError("INVALID_INPUT", "Email is invalid.");
  }
  return email;
}

async function normalizeProductionLaunchAddress(input: ShippingAddressInput) {
  const address = await normalizeShippingAddress(input);
  if (address.zone !== "EU") {
    throw new ProductionCheckoutError(
      "INVALID_INPUT",
      "Production checkout is available only in the European Union.",
    );
  }
  return address;
}

function mapDatabaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/UNIQUE constraint failed|delivery_order_option_required|order_commit/i.test(message)) {
    throw new ProductionCheckoutError(
      "ORDER_CONFLICT",
      "The order conflicts with an existing checkout attempt.",
      { cause: error },
    );
  }
  if (/commerce_reserves_not_validated|commerce_insufficient_stock/i.test(message)) {
    throw new ProductionCheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "Validated stock is unavailable.",
      { cause: error },
    );
  }
  throw new ProductionCheckoutError(
    "CHECKOUT_UNAVAILABLE",
    "The checkout transaction failed closed.",
    { cause: error },
  );
}

function assertLegalVersion(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(value)) {
    throw new ProductionCheckoutError("INVALID_INPUT", `${label} is invalid.`);
  }
}

export class D1ProductionCheckoutStore {
  readonly #database: CommerceD1Database;

  constructor(database: CommerceD1Database) {
    this.#database = database;
  }

  async currentOrder(cartId: string): Promise<ProductionOrderSnapshot | null> {
    assertFulfillmentIdentifier(cartId, "cartId");
    const order = await this.#database.prepare(
      `SELECT ${orderColumns} FROM orders WHERE cart_id = ?`,
    ).bind(cartId).first<OrderRow>();
    return order ? this.#snapshot(order) : null;
  }

  async createOrder(
    input: CreateProductionOrderInput,
  ): Promise<ProductionOrderSnapshot> {
    assertFulfillmentIdentifier(input.cartId, "cartId");
    assertFulfillmentIdentifier(input.quoteId, "quoteId");
    assertFulfillmentIdentifier(input.optionId, "optionId");
    if (input.servicePointId !== undefined && input.servicePointId !== null) {
      assertFulfillmentIdentifier(input.servicePointId, "servicePointId");
    }
    assertFulfillmentIdentifier(input.idempotencyKey, "idempotencyKey");
    assertFulfillmentTimestamp(input.now, "now");
    assertLegalVersion(input.termsVersion, "termsVersion");
    assertLegalVersion(input.privacyVersion, "privacyVersion");
    if (input.customerId !== undefined && input.customerId !== null) {
      assertFulfillmentIdentifier(input.customerId, "customerId");
    }
    const [address, email] = await Promise.all([
      normalizeProductionLaunchAddress(input.address),
      Promise.resolve(normalizeEmail(input.email)),
    ]);
    assertFulfillmentFingerprint(address.fingerprint, "addressFingerprint");

    const [quote, option, lineResult, existing] = await Promise.all([
      this.#database.prepare(
        `SELECT quote.id, quote.cart_id, quote.cart_revision,
          quote.shipping_address_fingerprint, quote.amount_cents, quote.currency,
          quote.expires_at, cart.status AS cart_status,
          cart.expires_at AS cart_expires_at, cart.fulfillment_revision
        FROM shipping_quotes AS quote
        INNER JOIN carts AS cart ON cart.id = quote.cart_id
        WHERE quote.id = ? AND quote.cart_id = ?`,
      ).bind(input.quoteId, input.cartId).first<QuoteRow>(),
      this.#database.prepare(
        `SELECT id, shipping_quote_id, cart_id, cart_revision,
          shipping_address_fingerprint, delivery_mode, display_name,
          amount_cents, expires_at, selected_at, selected_service_point_id
        FROM delivery_option_snapshots WHERE id = ? AND shipping_quote_id = ?
          AND cart_id = ?`,
      ).bind(input.optionId, input.quoteId, input.cartId).first<DeliveryOptionRow>(),
      this.#database.prepare(
        `SELECT line.variant_id, variant.internal_reference,
          product.name AS product_name, variant.color_name, variant.size,
          line.quantity, line.unit_price_cents
        FROM cart_lines AS line
        INNER JOIN variants AS variant ON variant.id = line.variant_id
        INNER JOIN products AS product ON product.id = variant.product_id
        WHERE line.cart_id = ? ORDER BY variant.sort_order, line.id`,
      ).bind(input.cartId).all<CheckoutLineRow>(),
      this.#database.prepare(
        `SELECT ${orderColumns} FROM orders WHERE cart_id = ?`,
      ).bind(input.cartId).first<OrderRow>(),
    ]);
    const lines = lineResult.results;
    let pricing;
    try {
      pricing = calculateAjPackPricing(lines.map((line) => ({
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents,
      })));
    } catch (error) {
      throw new ProductionCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "The cart pack configuration is invalid.",
        { cause: error },
      );
    }
    const subtotalCents = pricing.subtotalCents;
    if (
      !quote || !option || lines.length < 1 || quote.cart_status !== "open" ||
      quote.currency !== "EUR" || quote.cart_revision !== quote.fulfillment_revision ||
      quote.shipping_address_fingerprint !== address.fingerprint ||
      option.shipping_address_fingerprint !== address.fingerprint ||
      option.cart_revision !== quote.cart_revision ||
      (option.delivery_mode === "home" && input.servicePointId != null) ||
      (option.delivery_mode === "service_point" && !input.servicePointId) ||
      option.amount_cents !== quote.amount_cents || option.expires_at !== quote.expires_at ||
      quote.expires_at <= input.now || quote.cart_expires_at <= input.now
    ) {
      throw new ProductionCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "A current home-delivery option is required.",
      );
    }

    const checkoutFingerprint = await sha256Hex(JSON.stringify({
      addressFingerprint: address.fingerprint,
      email,
      lines,
      pricing,
      optionId: input.optionId,
      servicePointId: input.servicePointId ?? null,
      privacyVersion: input.privacyVersion,
      quoteId: input.quoteId,
      termsVersion: input.termsVersion,
    }));
    const orderHash = await sha256Hex(
      `${input.cartId}\0${input.idempotencyKey}\0${checkoutFingerprint}`,
    );
    const orderId = `order_${orderHash}`;
    const orderNumber = `AJ-${orderHash.slice(0, 20).toUpperCase()}`;
    if (existing) {
      if (
        existing.id !== orderId || existing.shipping_quote_id !== input.quoteId ||
        existing.shipping_address_fingerprint !== address.fingerprint ||
        existing.email !== email || existing.total_cents !== subtotalCents + quote.amount_cents ||
        existing.discount_cents !== pricing.discountCents ||
        option.selected_service_point_id !== (input.servicePointId ?? null)
      ) {
        throw new ProductionCheckoutError(
          "ORDER_CONFLICT",
          "This cart is already bound to another order attempt.",
        );
      }
      return this.#snapshot(existing);
    }

    const preparedDelivery = await prepareProductionDeliveryOrderSelection(
      this.#database,
      {
        cartId: input.cartId,
        quoteId: input.quoteId,
        optionId: input.optionId,
        addressFingerprint: address.fingerprint,
        servicePointId: input.servicePointId,
        now: input.now,
      },
    );
    if (
      preparedDelivery.option.amount_cents !== quote.amount_cents ||
      preparedDelivery.option.expires_at !== quote.expires_at
    ) {
      throw new ProductionCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "Delivery selection does not match the current quote.",
      );
    }
    const statements: CommerceD1PreparedStatement[] = [
      this.#database.prepare(
        `UPDATE shipping_quotes SET selected_at = ?
        WHERE id = ? AND cart_id = ? AND selected_at IS NULL AND expires_at > ?`,
      ).bind(input.now, input.quoteId, input.cartId, input.now),
      preparedDelivery.statement,
      this.#database.prepare(
        `INSERT INTO orders (
          id, order_number, cart_id, customer_id, email, status, currency,
          subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
          shipping_country_code, shipping_address_json,
          shipping_address_fingerprint, billing_address_json,
          shipping_quote_id, terms_version, privacy_version, paid_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending_payment', 'EUR', ?, ?, ?, 0, ?,
          ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      ).bind(
        orderId,
        orderNumber,
        input.cartId,
        input.customerId ?? null,
        email,
        subtotalCents,
        pricing.discountCents,
        quote.amount_cents,
        subtotalCents + quote.amount_cents,
        address.address.countryCode,
        address.canonicalJson,
        address.fingerprint,
        address.canonicalJson,
        input.quoteId,
        input.termsVersion,
        input.privacyVersion,
        input.now,
        input.now,
      ),
    ];
    for (const line of lines) {
      const lineHash = await sha256Hex(`${orderId}\0${line.variant_id}`);
      const reservationId = `reservation_${lineHash}`;
      statements.push(
        this.#database.prepare(
          `INSERT INTO order_lines (
            id, order_id, variant_id, internal_reference, product_name,
            color_name, size, quantity, unit_price_cents, line_total_cents,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          `order_line_${lineHash}`,
          orderId,
          line.variant_id,
          line.internal_reference,
          line.product_name,
          line.color_name,
          line.size,
          line.quantity,
          line.unit_price_cents,
          line.quantity * line.unit_price_cents,
          input.now,
        ),
        this.#database.prepare(
          `INSERT INTO stock_reservations (
            id, cart_id, variant_id, quantity, status, idempotency_key,
            last_transition_key, expires_at, converted_order_id, created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, 'active', ?, NULL, ?, NULL, ?, ?)`,
        ).bind(
          reservationId,
          input.cartId,
          line.variant_id,
          line.quantity,
          `order:${orderId}:reserve:${line.variant_id}`,
          quote.expires_at,
          input.now,
          input.now,
        ),
        this.#database.prepare(
          `INSERT INTO inventory_movements (
            id, variant_id, kind, quantity, reference_type, reference_id,
            actor_type, actor_id, idempotency_key, created_at
          ) SELECT ?, variant_id, 'reserve', quantity, 'reservation', id,
            'system', NULL, ?, ? FROM stock_reservations
          WHERE id = ? AND status = 'active'`,
        ).bind(
          `movement_reserve_${lineHash}`,
          `reserve:order:${orderId}:${line.variant_id}`,
          input.now,
          reservationId,
        ),
      );
    }
    try {
      await this.#database.batch(statements);
    } catch (error) {
      mapDatabaseError(error);
    }
    const created = await this.#database.prepare(
      `SELECT ${orderColumns} FROM orders WHERE id = ? AND cart_id = ?`,
    ).bind(orderId, input.cartId).first<OrderRow>();
    if (!created || created.status !== "pending_payment") {
      throw new ProductionCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "The order commit could not be verified.",
      );
    }
    return this.#snapshot(created);
  }

  async prepareCheckoutSession(input: Readonly<{
    cartId: string;
    idempotencyKey: string;
    origin: string;
    locale: "fr" | "en";
    now: string;
  }>): Promise<CheckoutSessionRequest> {
    assertFulfillmentIdentifier(input.cartId, "cartId");
    assertFulfillmentIdentifier(input.idempotencyKey, "idempotencyKey");
    assertFulfillmentTimestamp(input.now, "now");
    const origin = new URL(input.origin);
    if (origin.protocol !== "https:" || origin.origin !== input.origin) {
      throw new ProductionCheckoutError("INVALID_INPUT", "Origin is invalid.");
    }
    const [order, linesResult, reservation] = await Promise.all([
      this.#database.prepare(
        `SELECT ${orderColumns} FROM orders WHERE cart_id = ?`,
      ).bind(input.cartId).first<OrderRow>(),
      this.#database.prepare(
        `SELECT internal_reference, product_name, color_name, size, quantity,
          unit_price_cents FROM order_lines WHERE order_id = (
            SELECT id FROM orders WHERE cart_id = ?
          ) ORDER BY id`,
      ).bind(input.cartId).all<CheckoutLineRow>(),
      this.#database.prepare(
        `SELECT COUNT(*) AS count, MIN(expires_at) AS expires_at
        FROM stock_reservations WHERE cart_id = ? AND status = 'active'`,
      ).bind(input.cartId).first<{ count: number; expires_at: string | null }>(),
    ]);
    if (!order) {
      throw new ProductionCheckoutError("ORDER_NOT_FOUND", "Order not found.");
    }
    if (
      order.status !== "pending_payment" || !reservation ||
      reservation.count < 1 || !reservation.expires_at ||
      reservation.expires_at <= input.now
    ) {
      throw new ProductionCheckoutError("ORDER_EXPIRED", "Order reservation expired.");
    }
    const itemCount = linesResult.results.reduce(
      (total, line) => total + line.quantity,
      0,
    );
    const lines: CheckoutLine[] = [Object.freeze({
      internalReference: `pack:apollon:${itemCount}`,
      displayName: itemCount === 1
        ? "Apollon · 1 pièce"
        : `Pack Apollon · ${itemCount} pièces`,
      unitAmountCents: order.subtotal_cents,
      quantity: 1,
    })];
    if (order.shipping_cents > 0) {
      lines.push(Object.freeze({
        internalReference: `delivery:${order.shipping_quote_id}`,
        displayName: "Livraison",
        unitAmountCents: order.shipping_cents,
        quantity: 1,
      }));
    }
    // One active Stripe Checkout Session per immutable order. Browser replay
    // keys authenticate separate HTTP attempts; they must not mint competing
    // provider sessions for the same stock reservation.
    const paymentHash = await sha256Hex(`${order.id}\0stripe-checkout-v1`);
    return Object.freeze({
      idempotencyKey: `stripe-checkout:${paymentHash}`,
      orderId: order.id,
      customerEmail: order.email,
      // The browser never needs the Stripe session id: the HttpOnly cart
      // session and D1 remain the sole authority on the success page.
      successUrl: `${origin.origin}/checkout/success`,
      cancelUrl: `${origin.origin}/checkout`,
      locale: input.locale,
      currency: "EUR",
      lines: Object.freeze(lines),
    });
  }

  async recordCheckoutSession(
    request: CheckoutSessionRequest,
    receipt: CheckoutSessionReceipt,
    now: string,
  ): Promise<void> {
    assertFulfillmentTimestamp(now, "now");
    const order = await this.#database.prepare(
      `SELECT ${orderColumns} FROM orders WHERE id = ?`,
    ).bind(request.orderId).first<OrderRow>();
    if (
      !order || order.status !== "pending_payment" || receipt.provider !== "stripe" ||
      receipt.state !== "open" || receipt.currency !== "EUR" ||
      receipt.amountTotalCents !== order.total_cents
    ) {
      throw new ProductionCheckoutError(
        "PAYMENT_CONFLICT",
        "Stripe Checkout does not match the server order.",
      );
    }
    const paymentId = `payment_stripe_${await sha256Hex(request.idempotencyKey)}`;
    try {
      await this.#database.prepare(
        `INSERT INTO payments (
          id, order_id, provider, provider_session_id, status, amount_cents,
          currency, idempotency_key, failure_code, created_at, updated_at
        ) VALUES (?, ?, 'stripe', ?, 'created', ?, 'EUR', ?, NULL, ?, ?)
        ON CONFLICT(idempotency_key) DO NOTHING`,
      ).bind(
        paymentId,
        order.id,
        receipt.providerSessionId,
        order.total_cents,
        request.idempotencyKey,
        now,
        now,
      ).run();
    } catch (error) {
      throw new ProductionCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "Stripe Checkout receipt could not be persisted.",
        { cause: error },
      );
    }
    const persisted = await this.#database.prepare(
      `SELECT provider_session_id, status, amount_cents, currency,
        idempotency_key FROM payments WHERE idempotency_key = ?`,
    ).bind(request.idempotencyKey).first<PaymentRow>();
    if (
      !persisted || persisted.provider_session_id !== receipt.providerSessionId ||
      persisted.status !== "created" || persisted.amount_cents !== order.total_cents ||
      persisted.currency !== "EUR"
    ) {
      throw new ProductionCheckoutError(
        "PAYMENT_CONFLICT",
        "Stripe Checkout replay conflicts with the stored receipt.",
      );
    }
  }

  async #snapshot(order: OrderRow): Promise<ProductionOrderSnapshot> {
    const result = await this.#database.prepare(
      `SELECT product_name, color_name, size, quantity, unit_price_cents,
        quantity * unit_price_cents AS line_total_cents
      FROM order_lines WHERE order_id = ? ORDER BY id`,
    ).bind(order.id).all<{
      product_name: string;
      color_name: string;
      size: "S" | "M" | "L" | "XL";
      quantity: number;
      unit_price_cents: number;
      line_total_cents: number;
    }>();
    return Object.freeze({
      orderNumber: order.order_number,
      status: order.status,
      currency: order.currency,
      subtotalCents: order.subtotal_cents,
      shippingCents: order.shipping_cents,
      totalCents: order.total_cents,
      createdAt: order.created_at,
      paidAt: order.paid_at,
      lines: Object.freeze(result.results.map((line) => Object.freeze({
        productName: line.product_name,
        colorName: line.color_name,
        size: line.size,
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents,
        lineTotalCents: line.line_total_cents,
      }))),
    });
  }
}
