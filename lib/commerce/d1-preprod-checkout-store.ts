import type {
  CommerceD1Database,
  CommerceD1PreparedStatement,
} from "./d1-port.ts";
import {
  assertFulfillmentFingerprint,
  assertFulfillmentIdentifier,
  assertFulfillmentTimestamp,
  sha256Hex,
} from "./fulfillment-domain.ts";
import {
  assertVerifiedPaymentEvent,
  type VerifiedPaymentEvent,
} from "./verified-payment-event.ts";

const demoEmailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@demo\.invalid$/;

export type PreprodCheckoutErrorCode =
  | "INVALID_INPUT"
  | "ORDER_NOT_FOUND"
  | "ORDER_EXPIRED"
  | "ORDER_CONFLICT"
  | "PAYMENT_CONFLICT"
  | "CHECKOUT_UNAVAILABLE";

export class PreprodCheckoutError extends Error {
  readonly code: PreprodCheckoutErrorCode;

  constructor(
    code: PreprodCheckoutErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PreprodCheckoutError";
    this.code = code;
  }
}

type CheckoutLineRow = {
  variant_id: string;
  internal_reference: string;
  product_name: string;
  color_name: string;
  size: "S" | "M" | "L" | "XL";
  quantity: number;
  unit_price_cents: number;
};

type QuoteCheckoutRow = {
  id: string;
  cart_id: string;
  cart_revision: number;
  shipping_address_fingerprint: string;
  amount_cents: number;
  currency: "EUR";
  expires_at: string;
  selected_at: string | null;
  cart_status: string;
  cart_expires_at: string;
  fulfillment_revision: number;
};

type OrderRow = {
  id: string;
  order_number: string;
  cart_id: string;
  customer_id: string | null;
  status: "pending_payment" | "paid";
  currency: "EUR";
  email: string;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  shipping_country_code: string;
  shipping_address_json: string;
  billing_address_json: string;
  shipping_quote_id: string;
  shipping_address_fingerprint: string;
  terms_version: string;
  privacy_version: string;
  created_at: string;
  paid_at: string | null;
};

type OrderLineRow = {
  product_name: string;
  color_name: string;
  size: "S" | "M" | "L" | "XL";
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
};

type PaymentRow = {
  id: string;
  provider_session_id: string;
  idempotency_key: string;
  status: string;
};

type ReservationTimingRow = {
  count: number;
  minimum_expires_at: string | null;
  maximum_updated_at: string | null;
};

const orderSelectColumns = `id, order_number, cart_id, customer_id, status, currency, email,
  subtotal_cents, shipping_cents, tax_cents, total_cents,
  shipping_country_code, shipping_address_json, billing_address_json,
  shipping_quote_id, shipping_address_fingerprint, terms_version,
  privacy_version, created_at, paid_at`;

export type PreprodOrderSnapshot = Readonly<{
  orderNumber: string;
  status: "pending_payment" | "paid";
  currency: "EUR";
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  simulation: true;
  paymentMode: "test";
  debited: false;
  emailCaptured: boolean;
  emailSent: false;
  lines: readonly Readonly<{
    productName: string;
    colorName: string;
    size: "S" | "M" | "L" | "XL";
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>[];
}>;

export type CreatePreprodOrderInput = Readonly<{
  cartId: string;
  quoteId: string;
  addressJson: string;
  addressFingerprint: string;
  countryCode: string;
  email: string;
  customerId?: string | null;
  idempotencyKey: string;
  termsVersion: string;
  privacyVersion: string;
  now: string;
}>;

export type PayPreprodOrderInput = Readonly<{
  cartId: string;
  idempotencyKey: string;
  requestedAt: string;
}>;

export type PreparedPreprodTestPayment = Readonly<{
  cartId: string;
  idempotencyKey: string;
  claims: Readonly<{
    providerEventId: string;
    providerPaymentId: string;
    orderId: string;
    amountCents: number;
    currency: "EUR";
    occurredAt: string;
    verifiedAt: string;
    payloadFingerprint: string;
  }>;
}>;

function normalizeDemoEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!demoEmailPattern.test(email) || email.length > 128) {
    throw new PreprodCheckoutError(
      "INVALID_INPUT",
      "Preproduction accepts only explicit @demo.invalid addresses.",
    );
  }
  return email;
}

function mapDatabaseError(error: unknown, conflictCode: PreprodCheckoutErrorCode): never {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /UNIQUE constraint failed|commerce_order_commit_incomplete|fulfillment_quote_mismatch/i
      .test(message)
  ) {
    throw new PreprodCheckoutError(
      conflictCode,
      "The transactional checkout state conflicts with this request.",
      { cause: error },
    );
  }
  if (
    /commerce_reserves_not_validated|commerce_insufficient_stock|commerce_reservation_cart_line_mismatch/i
      .test(message)
  ) {
    throw new PreprodCheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "Validated stock is not available for every order line.",
      { cause: error },
    );
  }
  if (/commerce_sale_reservation_expired/i.test(message)) {
    throw new PreprodCheckoutError(
      "ORDER_EXPIRED",
      "The stock reservation has expired.",
      { cause: error },
    );
  }
  throw new PreprodCheckoutError(
    "CHECKOUT_UNAVAILABLE",
    "The transactional checkout operation failed closed.",
    { cause: error },
  );
}

function assertCreateInput(input: CreatePreprodOrderInput): string {
  assertFulfillmentIdentifier(input.cartId, "cartId");
  assertFulfillmentIdentifier(input.quoteId, "quoteId");
  assertFulfillmentIdentifier(input.idempotencyKey, "idempotencyKey");
  assertFulfillmentFingerprint(input.addressFingerprint, "addressFingerprint");
  assertFulfillmentTimestamp(input.now, "now");
  if (input.customerId !== undefined && input.customerId !== null) {
    assertFulfillmentIdentifier(input.customerId, "customerId");
  }
  if (!/^[A-Z]{2}$/.test(input.countryCode)) {
    throw new PreprodCheckoutError("INVALID_INPUT", "countryCode is invalid.");
  }
  if (
    input.termsVersion.length < 1 || input.termsVersion.length > 64 ||
    input.privacyVersion.length < 1 || input.privacyVersion.length > 64
  ) {
    throw new PreprodCheckoutError("INVALID_INPUT", "Legal versions are invalid.");
  }
  try {
    const address = JSON.parse(input.addressJson) as unknown;
    if (
      typeof address !== "object" || address === null || Array.isArray(address) ||
      (address as { countryCode?: unknown }).countryCode !== input.countryCode
    ) {
      throw new Error("shape");
    }
  } catch {
    throw new PreprodCheckoutError("INVALID_INPUT", "The address snapshot is invalid.");
  }
  return normalizeDemoEmail(input.email);
}

function assertPayInput(input: PayPreprodOrderInput): void {
  assertFulfillmentIdentifier(input.cartId, "cartId");
  assertFulfillmentIdentifier(input.idempotencyKey, "idempotencyKey");
  assertFulfillmentTimestamp(input.requestedAt, "requestedAt");
}

function orderMatches(
  order: OrderRow,
  expected: Readonly<{
    orderId: string;
    quoteId: string;
    addressFingerprint: string;
    subtotalCents: number;
    shippingCents: number;
    email: string;
    addressJson: string;
    countryCode: string;
    termsVersion: string;
    privacyVersion: string;
    customerId: string | null;
  }>,
): boolean {
  return order.id === expected.orderId &&
    order.shipping_quote_id === expected.quoteId &&
    order.shipping_address_fingerprint === expected.addressFingerprint &&
    order.email === expected.email &&
    order.shipping_country_code === expected.countryCode &&
    order.shipping_address_json === expected.addressJson &&
    order.billing_address_json === expected.addressJson &&
    order.customer_id === expected.customerId &&
    order.terms_version === expected.termsVersion &&
    order.privacy_version === expected.privacyVersion &&
    order.currency === "EUR" && order.tax_cents === 0 &&
    order.subtotal_cents === expected.subtotalCents &&
    order.shipping_cents === expected.shippingCents &&
    order.total_cents === expected.subtotalCents + expected.shippingCents;
}

export class D1PreprodCheckoutStore {
  readonly #database: CommerceD1Database;

  constructor(database: CommerceD1Database) {
    this.#database = database;
  }

  async getCurrentOrder(cartId: string): Promise<PreprodOrderSnapshot | null> {
    assertFulfillmentIdentifier(cartId, "cartId");
    const order = await this.#database.prepare(
      `SELECT ${orderSelectColumns} FROM orders WHERE cart_id = ?`,
    ).bind(cartId).first<OrderRow>();
    if (!order) return null;
    return this.#snapshot(order);
  }

  async createOrder(input: CreatePreprodOrderInput): Promise<PreprodOrderSnapshot> {
    const email = assertCreateInput(input);
    const [quote, deliveryOption, linesResult, existing] = await Promise.all([
      this.#database.prepare(
        `SELECT quote.id, quote.cart_id, quote.cart_revision,
          quote.shipping_address_fingerprint, quote.amount_cents, quote.currency,
          quote.expires_at, quote.selected_at, cart.status AS cart_status,
          cart.expires_at AS cart_expires_at,
          cart.fulfillment_revision
        FROM shipping_quotes AS quote
        INNER JOIN carts AS cart ON cart.id = quote.cart_id
        WHERE quote.id = ? AND quote.cart_id = ?`,
      ).bind(input.quoteId, input.cartId).first<QuoteCheckoutRow>(),
      this.#database.prepare(
        `SELECT id FROM delivery_option_snapshots
        WHERE shipping_quote_id = ? AND cart_id = ?
          AND delivery_mode = 'home' AND expires_at > ?`,
      ).bind(input.quoteId, input.cartId, input.now).first<{ id: string }>(),
      this.#database.prepare(
        `SELECT line.variant_id, variant.internal_reference,
          product.name AS product_name, variant.color_name, variant.size,
          line.quantity, line.unit_price_cents
        FROM cart_lines AS line
        INNER JOIN variants AS variant ON variant.id = line.variant_id
        INNER JOIN products AS product ON product.id = variant.product_id
        WHERE line.cart_id = ?
        ORDER BY variant.sort_order, line.id`,
      ).bind(input.cartId).all<CheckoutLineRow>(),
      this.#database.prepare(
        `SELECT ${orderSelectColumns} FROM orders WHERE cart_id = ?`,
      ).bind(input.cartId).first<OrderRow>(),
    ]);
    const lines = linesResult.results;
    const subtotalCents = lines.reduce(
      (total, line) => total + line.unit_price_cents * line.quantity,
      0,
    );
    const checkoutFingerprint = await sha256Hex(JSON.stringify({
      addressFingerprint: input.addressFingerprint,
      addressJson: input.addressJson,
      countryCode: input.countryCode,
      currency: "EUR",
      email,
      customerId: input.customerId ?? null,
      lines: lines.map((line) => ({
        colorName: line.color_name,
        internalReference: line.internal_reference,
        productName: line.product_name,
        quantity: line.quantity,
        size: line.size,
        unitPriceCents: line.unit_price_cents,
        variantId: line.variant_id,
      })),
      privacyVersion: input.privacyVersion,
      quoteId: input.quoteId,
      shippingCents: quote?.amount_cents ?? -1,
      subtotalCents,
      taxCents: 0,
      termsVersion: input.termsVersion,
    }));
    const orderHash = await sha256Hex(
      `${input.cartId}\u0000${input.idempotencyKey}\u0000${checkoutFingerprint}`,
    );
    const orderId = `order_${orderHash}`;
    // 24 hexadecimal characters retain 96 bits of non-sequential entropy.
    const orderNumber = `AJ-TEST-${orderHash.slice(0, 24).toUpperCase()}`;
    const expected = {
      orderId,
      quoteId: input.quoteId,
      addressFingerprint: input.addressFingerprint,
      subtotalCents,
      shippingCents: quote?.amount_cents ?? -1,
      email,
      addressJson: input.addressJson,
      countryCode: input.countryCode,
      termsVersion: input.termsVersion,
      privacyVersion: input.privacyVersion,
      customerId: input.customerId ?? null,
    } as const;
    if (existing) {
      if (
        !orderMatches(existing, expected) ||
        !(await this.#orderSnapshotIsExact(existing, lines, quote?.expires_at ?? null))
      ) {
        throw new PreprodCheckoutError(
          "ORDER_CONFLICT",
          "This cart is already bound to another order attempt.",
        );
      }
      return this.#snapshot(existing);
    }
    if (!deliveryOption) {
      throw new PreprodCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "A current delivery option must be selected before order creation.",
      );
    }
    if (
      !quote || lines.length < 1 || quote.cart_status !== "open" ||
      quote.currency !== "EUR" || quote.cart_revision !== quote.fulfillment_revision ||
      quote.shipping_address_fingerprint !== input.addressFingerprint ||
      quote.expires_at <= input.now || quote.cart_expires_at <= input.now
    ) {
      throw new PreprodCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "The cart and selected quote are not ready for an order.",
      );
    }

    const statements: CommerceD1PreparedStatement[] = [
      this.#database.prepare(
        `UPDATE shipping_quotes SET selected_at = ?
        WHERE id = ? AND cart_id = ? AND cart_revision = ?
          AND shipping_address_fingerprint = ? AND selected_at IS NULL
          AND expires_at > ?`,
      ).bind(
        input.now,
        input.quoteId,
        input.cartId,
        quote.cart_revision,
        input.addressFingerprint,
        input.now,
      ),
      this.#database.prepare(
        `UPDATE delivery_option_snapshots SET selected_at = ?
        WHERE id = ? AND shipping_quote_id = ? AND cart_id = ?
          AND cart_revision = ? AND shipping_address_fingerprint = ?
          AND delivery_mode = 'home' AND selected_at IS NULL
          AND expires_at > ?`,
      ).bind(
        input.now,
        deliveryOption.id,
        input.quoteId,
        input.cartId,
        quote.cart_revision,
        input.addressFingerprint,
        input.now,
      ),
      this.#database.prepare(
        `INSERT INTO orders (
          id, order_number, cart_id, customer_id, email, status, currency,
          subtotal_cents, shipping_cents, tax_cents, total_cents,
          shipping_country_code, shipping_address_json,
          shipping_address_fingerprint, billing_address_json,
          shipping_quote_id, terms_version, privacy_version, paid_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending_payment', 'EUR', ?, ?, 0, ?,
          ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      ).bind(
        orderId,
        orderNumber,
        input.cartId,
        input.customerId ?? null,
        email,
        subtotalCents,
        quote.amount_cents,
        subtotalCents + quote.amount_cents,
        input.countryCode,
        input.addressJson,
        input.addressFingerprint,
        input.addressJson,
        input.quoteId,
        input.termsVersion,
        input.privacyVersion,
        input.now,
        input.now,
      ),
    ];

    for (const line of lines) {
      const lineHash = await sha256Hex(`${orderId}\u0000${line.variant_id}`);
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
          ) SELECT ?, reservation.variant_id, 'reserve', reservation.quantity,
            'reservation', reservation.id, 'system', NULL, ?, ?
          FROM stock_reservations AS reservation
          WHERE reservation.id = ? AND reservation.status = 'active'`,
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
      const raced = await this.#database.prepare(
        `SELECT ${orderSelectColumns} FROM orders WHERE cart_id = ?`,
      ).bind(input.cartId).first<OrderRow>();
      if (
        raced && orderMatches(raced, expected) &&
        await this.#orderSnapshotIsExact(raced, lines, quote.expires_at)
      ) return this.#snapshot(raced);
      mapDatabaseError(error, "ORDER_CONFLICT");
    }
    const created = await this.#database.prepare(
      `SELECT ${orderSelectColumns} FROM orders WHERE id = ? AND cart_id = ?`,
    ).bind(orderId, input.cartId).first<OrderRow>();
    if (
      !created || !orderMatches(created, expected) ||
      !(await this.#orderSnapshotIsExact(created, lines, quote.expires_at))
    ) {
      throw new PreprodCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "The order commit could not be verified.",
      );
    }
    return this.#snapshot(created);
  }

  async prepareTestPayment(
    input: PayPreprodOrderInput,
  ): Promise<PreparedPreprodTestPayment | PreprodOrderSnapshot> {
    assertPayInput(input);
    const [order, reservationTiming, existingPayment] = await Promise.all([
      this.#database.prepare(
        `SELECT ${orderSelectColumns} FROM orders WHERE cart_id = ?`,
      ).bind(input.cartId).first<OrderRow>(),
      this.#database.prepare(
        `SELECT COUNT(*) AS count, MIN(expires_at) AS minimum_expires_at,
          MAX(updated_at) AS maximum_updated_at
        FROM stock_reservations
        WHERE cart_id = ? AND status = 'active'`,
      ).bind(input.cartId).first<ReservationTimingRow>(),
      this.#database.prepare(
        `SELECT payment.id, payment.provider_session_id,
          payment.idempotency_key, payment.status
        FROM payments AS payment
        INNER JOIN orders AS customer_order ON customer_order.id = payment.order_id
        WHERE customer_order.cart_id = ? AND payment.status = 'succeeded'`,
      ).bind(input.cartId).first<PaymentRow>(),
    ]);
    if (!order) {
      throw new PreprodCheckoutError("ORDER_NOT_FOUND", "No order belongs to this cart session.");
    }
    const paymentHash = await sha256Hex(`${order.id}\u0000${input.idempotencyKey}`);
    const paymentIdempotencyKey = `payment:test:${paymentHash}`;
    if (order.status === "paid" || existingPayment) {
      if (
        order.status !== "paid" || !existingPayment ||
        existingPayment.idempotency_key !== paymentIdempotencyKey
      ) {
        throw new PreprodCheckoutError(
          "PAYMENT_CONFLICT",
          "The order is already bound to another payment attempt.",
        );
      }
      return this.#snapshot(order);
    }
    if (
      order.status !== "pending_payment" || !reservationTiming ||
      reservationTiming.count < 1 || !reservationTiming.minimum_expires_at ||
      !reservationTiming.maximum_updated_at
    ) {
      throw new PreprodCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "The order does not have a complete active stock reservation.",
      );
    }
    if (Date.parse(input.requestedAt) >= Date.parse(reservationTiming.minimum_expires_at)) {
      throw new PreprodCheckoutError(
        "ORDER_EXPIRED",
        "The stock reservation has expired.",
      );
    }
    const eventMillis = Math.max(
      Date.parse(order.created_at) + 1,
      Date.parse(reservationTiming.maximum_updated_at) + 1,
    );
    if (eventMillis >= Date.parse(reservationTiming.minimum_expires_at)) {
      throw new PreprodCheckoutError("ORDER_EXPIRED", "The stock reservation has expired.");
    }
    const eventAt = new Date(eventMillis).toISOString();
    const providerPaymentId = `test_payment_${paymentHash}`;
    const providerEventId = `test_event_${paymentHash}`;
    const payloadFingerprint = await sha256Hex(JSON.stringify({
      amountCents: order.total_cents,
      currency: order.currency,
      occurredAt: eventAt,
      orderId: order.id,
      provider: "test",
      providerEventId,
      providerPaymentId,
      type: "payment.succeeded",
    }));
    return Object.freeze({
      cartId: input.cartId,
      idempotencyKey: input.idempotencyKey,
      claims: Object.freeze({
        providerEventId,
        providerPaymentId,
        orderId: order.id,
        amountCents: order.total_cents,
        currency: order.currency,
        occurredAt: eventAt,
        verifiedAt: eventAt,
        payloadFingerprint,
      }),
    });
  }

  async completeTestPayment(
    prepared: PreparedPreprodTestPayment,
    event: VerifiedPaymentEvent,
  ): Promise<PreprodOrderSnapshot> {
    assertVerifiedPaymentEvent(event);
    const order = await this.#database.prepare(
      `SELECT ${orderSelectColumns} FROM orders WHERE id = ? AND cart_id = ?`,
    ).bind(prepared.claims.orderId, prepared.cartId).first<OrderRow>();
    if (!order) {
      throw new PreprodCheckoutError("ORDER_NOT_FOUND", "No order belongs to this cart session.");
    }
    const expectedPaymentHash = await sha256Hex(
      `${order.id}\u0000${prepared.idempotencyKey}`,
    );
    const expected = prepared.claims;
    if (
      event.provider !== "test" || event.eventType !== "payment.succeeded" ||
      event.verificationMethod !== "test_adapter" ||
      event.providerEventId !== expected.providerEventId ||
      event.providerPaymentId !== expected.providerPaymentId ||
      event.orderId !== order.id || event.amountCents !== order.total_cents ||
      event.currency !== order.currency || event.occurredAt !== expected.occurredAt ||
      event.verifiedAt !== expected.verifiedAt ||
      event.payloadFingerprint !== expected.payloadFingerprint ||
      event.providerPaymentId !== `test_payment_${expectedPaymentHash}` ||
      event.providerEventId !== `test_event_${expectedPaymentHash}`
    ) {
      throw new PreprodCheckoutError(
        "PAYMENT_CONFLICT",
        "The verified test payment does not match the server snapshot.",
      );
    }
    const paymentIdempotencyKey = `payment:test:${expectedPaymentHash}`;
    const webhookId = `webhook_test_${expectedPaymentHash}`;
    const paymentId = `payment_test_${expectedPaymentHash}`;
    const eventKey = `webhook:test:${event.providerEventId}`;
    try {
      await this.#database.batch([
        this.#database.prepare(
          `INSERT INTO webhook_events (
            id, provider, provider_event_id, event_type, payload_fingerprint,
            verification_method, verified_at, order_id, provider_payment_id,
            amount_cents, currency, status, attempts, received_at
          ) VALUES (?, 'test', ?, 'payment.succeeded', ?, 'test_adapter', ?, ?, ?,
            ?, 'EUR', 'verified', 0, ?)`,
        ).bind(
          webhookId,
          event.providerEventId,
          event.payloadFingerprint,
          event.verifiedAt,
          order.id,
          event.providerPaymentId,
          order.total_cents,
          event.occurredAt,
        ),
        this.#database.prepare(
          `INSERT INTO payments (
            id, order_id, provider, provider_session_id, status, amount_cents,
            currency, idempotency_key, failure_code, created_at, updated_at
          ) VALUES (?, ?, 'test', ?, 'succeeded', ?, 'EUR', ?, NULL, ?, ?)`,
        ).bind(
          paymentId,
          order.id,
          event.providerPaymentId,
          order.total_cents,
          paymentIdempotencyKey,
          event.occurredAt,
          event.verifiedAt,
        ),
        this.#database.prepare(
          `UPDATE stock_reservations
          SET status = 'converted', converted_order_id = ?,
            last_transition_key = ?, updated_at = ?
          WHERE cart_id = ? AND status = 'active' AND expires_at > ?`,
        ).bind(order.id, eventKey, event.occurredAt, prepared.cartId, event.occurredAt),
        this.#database.prepare(
          `INSERT INTO inventory_movements (
            id, variant_id, kind, quantity, reference_type, reference_id,
            actor_type, actor_id, idempotency_key, created_at
          ) SELECT 'movement_sale_' || reservation.id,
            reservation.variant_id, 'sale', reservation.quantity,
            'order', reservation.converted_order_id, 'system', NULL,
            'sale:' || ? || ':' || reservation.id, ?
          FROM stock_reservations AS reservation
          WHERE reservation.converted_order_id = ?
            AND reservation.status = 'converted'
            AND reservation.last_transition_key = ?`,
        ).bind(eventKey, event.occurredAt, order.id, eventKey),
        this.#database.prepare(
          `UPDATE orders SET status = 'paid', paid_at = ?, updated_at = ?
          WHERE id = ? AND cart_id = ? AND status = 'pending_payment'`,
        ).bind(event.occurredAt, event.verifiedAt, order.id, prepared.cartId),
        this.#database.prepare(
          `UPDATE carts SET status = 'converted', updated_at = ?
          WHERE id = ? AND status = 'open'
            AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'paid')`,
        ).bind(event.verifiedAt, prepared.cartId, order.id),
        this.#database.prepare(
          `INSERT INTO email_outbox (
            id, kind, transaction_intent, source_event_id, recipient_email,
            order_id, access_challenge_id, locale, template_version,
            payload_json, status, attempts, max_attempts, next_attempt_at,
            lease_token_hash, leased_at, lease_expires_at, last_error_code,
            idempotency_key, provider_idempotency_key, created_at, updated_at,
            sent_at, terminal_at, purged_at
          ) SELECT ?, 'payment_confirmation', 'payment_succeeded', ?, email,
            id, NULL, 'fr', 'payment-confirmation-preprod-v1', ?, 'pending',
            0, 5, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, NULL, NULL, NULL
          FROM orders WHERE id = ? AND status = 'paid'`,
        ).bind(
          `outbox_payment_${expectedPaymentHash}`,
          event.providerEventId,
          JSON.stringify({ orderId: order.id }),
          event.verifiedAt,
          `email:payment-confirmation:${order.id}`,
          `payment_confirmation:${order.id}`,
          event.verifiedAt,
          event.verifiedAt,
          order.id,
        ),
        this.#database.prepare(
          `INSERT INTO audit_log (
            id, actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key, metadata_json, created_at
          ) VALUES (?, 'system', NULL, 'payment_succeeded', 'order', ?, ?, ?, ?)`,
        ).bind(
          `audit_payment_${expectedPaymentHash}`,
          order.id,
          `audit:payment:test:${event.providerEventId}`,
          JSON.stringify({ provider: "test", simulation: true }),
          event.verifiedAt,
        ),
        this.#database.prepare(
          `UPDATE webhook_events SET status = 'processed', attempts = 1,
            processed_at = ?, last_error_code = NULL
          WHERE id = ? AND status = 'verified' AND order_id = ?
            AND provider_payment_id = ? AND amount_cents = ? AND currency = 'EUR'`,
        ).bind(
          event.verifiedAt,
          webhookId,
          order.id,
          event.providerPaymentId,
          order.total_cents,
        ),
      ]);
    } catch (error) {
      const racedPayment = await this.#database.prepare(
        `SELECT payment.id, payment.provider_session_id,
          payment.idempotency_key, payment.status
        FROM payments AS payment
        WHERE payment.order_id = ? AND payment.status = 'succeeded'`,
      ).bind(order.id).first<PaymentRow>();
      if (racedPayment?.idempotency_key !== paymentIdempotencyKey) {
        mapDatabaseError(error, "PAYMENT_CONFLICT");
      }
    }
    const paid = await this.#database.prepare(
      `SELECT ${orderSelectColumns} FROM orders WHERE id = ? AND cart_id = ?`,
    ).bind(order.id, prepared.cartId).first<OrderRow>();
    if (
      !paid || paid.status !== "paid" || !paid.paid_at ||
      !(await this.#paymentCommitIsExact(paid, event, paymentIdempotencyKey))
    ) {
      throw new PreprodCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "The simulated payment commit could not be verified.",
      );
    }
    return this.#snapshot(paid);
  }

  async #orderSnapshotIsExact(
    order: OrderRow,
    expectedLines: readonly CheckoutLineRow[],
    expectedExpiry: string | null,
  ): Promise<boolean> {
    if (!expectedExpiry) return false;
    const [lines, reservations, quote, deliveryOption] = await Promise.all([
      this.#database.prepare(
        `SELECT variant_id, internal_reference, product_name, color_name, size,
          quantity, unit_price_cents
        FROM order_lines WHERE order_id = ? ORDER BY variant_id`,
      ).bind(order.id).all<CheckoutLineRow>(),
      this.#database.prepare(
        `SELECT variant_id, quantity, expires_at
        FROM stock_reservations
        WHERE cart_id = ? AND status IN ('active', 'converted')
        ORDER BY variant_id`,
      ).bind(order.cart_id).all<{
        variant_id: string;
        quantity: number;
        expires_at: string;
      }>(),
      this.#database.prepare(
        `SELECT selected_at FROM shipping_quotes WHERE id = ? AND cart_id = ?`,
      ).bind(order.shipping_quote_id, order.cart_id).first<{
        selected_at: string | null;
      }>(),
      this.#database.prepare(
        `SELECT selected_at FROM delivery_option_snapshots
        WHERE shipping_quote_id = ? AND cart_id = ? AND delivery_mode = 'home'`,
      ).bind(order.shipping_quote_id, order.cart_id).first<{
        selected_at: string | null;
      }>(),
    ]);
    const expected = [...expectedLines].sort((left, right) =>
      left.variant_id.localeCompare(right.variant_id)
    );
    return Boolean(quote?.selected_at) && Boolean(deliveryOption?.selected_at) &&
      lines.results.length === expected.length &&
      reservations.results.length === expected.length &&
      expected.every((line, index) => {
        const snapshot = lines.results[index];
        const reservation = reservations.results[index];
        return snapshot?.variant_id === line.variant_id &&
          snapshot.internal_reference === line.internal_reference &&
          snapshot.product_name === line.product_name &&
          snapshot.color_name === line.color_name && snapshot.size === line.size &&
          snapshot.quantity === line.quantity &&
          snapshot.unit_price_cents === line.unit_price_cents &&
          reservation?.variant_id === line.variant_id &&
          reservation.quantity === line.quantity &&
          reservation.expires_at === expectedExpiry;
      });
  }

  async #paymentCommitIsExact(
    order: OrderRow,
    event: VerifiedPaymentEvent,
    paymentIdempotencyKey: string,
  ): Promise<boolean> {
    const [payment, webhook, reservations, sales, cart, outbox, audit] =
      await Promise.all([
        this.#database.prepare(
          `SELECT COUNT(*) AS count FROM payments
          WHERE order_id = ? AND provider = 'test' AND status = 'succeeded'
            AND provider_session_id = ? AND idempotency_key = ?
            AND amount_cents = ? AND currency = 'EUR'`,
        ).bind(
          order.id,
          event.providerPaymentId,
          paymentIdempotencyKey,
          order.total_cents,
        ).first<{ count: number }>(),
        this.#database.prepare(
          `SELECT COUNT(*) AS count FROM webhook_events
          WHERE order_id = ? AND provider = 'test' AND provider_event_id = ?
            AND provider_payment_id = ? AND status = 'processed'
            AND verification_method = 'test_adapter' AND attempts = 1
            AND payload_fingerprint = ?`,
        ).bind(
          order.id,
          event.providerEventId,
          event.providerPaymentId,
          event.payloadFingerprint,
        ).first<{ count: number }>(),
        this.#database.prepare(
          `SELECT COUNT(*) AS count FROM stock_reservations
          WHERE cart_id = ? AND status = 'converted'
            AND converted_order_id = ?`,
        ).bind(order.cart_id, order.id).first<{ count: number }>(),
        this.#database.prepare(
          `SELECT COUNT(*) AS count FROM inventory_movements
          WHERE reference_type = 'order' AND reference_id = ? AND kind = 'sale'`,
        ).bind(order.id).first<{ count: number }>(),
        this.#database.prepare(
          `SELECT status FROM carts WHERE id = ?`,
        ).bind(order.cart_id).first<{ status: string }>(),
        this.#database.prepare(
          `SELECT COUNT(*) AS count FROM email_outbox
          WHERE order_id = ? AND kind = 'payment_confirmation'
            AND transaction_intent = 'payment_succeeded'
            AND source_event_id = ? AND payload_json = ?
            AND recipient_email = ?
            AND idempotency_key = ? AND provider_idempotency_key = ?
            AND status = 'pending' AND attempts = 0 AND max_attempts = 5
            AND next_attempt_at IS NOT NULL AND lease_token_hash IS NULL
            AND leased_at IS NULL AND lease_expires_at IS NULL
            AND last_error_code IS NULL AND sent_at IS NULL
            AND terminal_at IS NULL AND purged_at IS NULL`,
        ).bind(
          order.id,
          event.providerEventId,
          JSON.stringify({ orderId: order.id }),
          order.email,
          `email:payment-confirmation:${order.id}`,
          `payment_confirmation:${order.id}`,
        ).first<{ count: number }>(),
        this.#database.prepare(
          `SELECT COUNT(*) AS count FROM audit_log
          WHERE entity_type = 'order' AND entity_id = ?
            AND action = 'payment_succeeded'
            AND metadata_json = ?`,
        ).bind(
          order.id,
          JSON.stringify({ provider: "test", simulation: true }),
        ).first<{ count: number }>(),
      ]);
    const converted = Number(reservations?.count ?? 0);
    return Number(payment?.count ?? 0) === 1 &&
      Number(webhook?.count ?? 0) === 1 && converted > 0 &&
      Number(sales?.count ?? 0) === converted && cart?.status === "converted" &&
      Number(outbox?.count ?? 0) === 1 && Number(audit?.count ?? 0) === 1;
  }

  async #snapshot(order: OrderRow): Promise<PreprodOrderSnapshot> {
    const [linesResult, outbox] = await Promise.all([
      this.#database.prepare(
        `SELECT product_name, color_name, size, quantity, unit_price_cents,
          line_total_cents FROM order_lines WHERE order_id = ? ORDER BY id`,
      ).bind(order.id).all<OrderLineRow>(),
      this.#database.prepare(
        `SELECT id FROM email_outbox
        WHERE order_id = ? AND kind = 'payment_confirmation'
          AND status = 'pending' AND sent_at IS NULL`,
      ).bind(order.id).first<{ id: string }>(),
    ]);
    return Object.freeze({
      orderNumber: order.order_number,
      status: order.status,
      currency: order.currency,
      subtotalCents: order.subtotal_cents,
      shippingCents: order.shipping_cents,
      totalCents: order.total_cents,
      createdAt: order.created_at,
      paidAt: order.paid_at,
      simulation: true,
      paymentMode: "test",
      debited: false,
      emailCaptured: Boolean(outbox),
      emailSent: false,
      lines: Object.freeze(linesResult.results.map((line) => Object.freeze({
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
