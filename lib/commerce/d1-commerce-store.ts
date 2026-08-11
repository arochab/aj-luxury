import {
  LAUNCH_CURRENCY,
  LAUNCH_PRICE_CENTS,
  LAUNCH_PRODUCT_ID,
  assertLaunchSeedIntegrity,
  launchVariantSeed,
} from "../../db/seed.ts";
import type {
  CommerceD1Database,
  CommerceD1PreparedStatement,
} from "./d1-port.ts";
import {
  CommerceError,
  type ConvertStockToSaleInput,
  type ExpireStockInput,
  type InventoryPosition,
  type ReleaseStockInput,
  type ReserveStockInput,
  type StockReservation,
  assertIsoTimestamp,
  assertSafeIdentifier,
  validateConvertStockToSaleInput,
  validateExpireStockInput,
  validateReleaseStockInput,
  validateReserveStockInput,
} from "./backend-domain.ts";
import {
  assertVerifiedPaymentEvent,
  type VerifiedPaymentEvent,
} from "./verified-payment-event.ts";

type InventoryRow = {
  variant_id: string;
  physical_quantity: number;
  gift_reserve_quantity: number;
  safety_reserve_quantity: number;
  active_reserved_quantity: number;
  sold_quantity: number;
  reserves_validated: number;
  version: number;
};

type ReservationRow = {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  status: StockReservation["status"];
  idempotency_key: string;
  last_transition_key: string | null;
  expires_at: string;
  converted_order_id: string | null;
  created_at: string;
  updated_at: string;
};

type CartRow = {
  id: string;
  customer_id: string | null;
  email: string | null;
  status: "open" | "converted" | "expired";
  currency: "EUR";
  expires_at: string;
};

type SeedIntegrityRow = {
  inventory_count: number;
  physical_quantity: number;
  ledger_count: number;
};

type PaymentResultRow = {
  order_status: string;
  cart_status: string;
  webhook_status: string;
  converted_reservations: number;
};

export type CreateCartInput = {
  id: string;
  customerId?: string | null;
  email?: string | null;
  expiresAt: string;
  now: string;
};

function toInventoryPosition(row: InventoryRow): InventoryPosition {
  return {
    variantId: row.variant_id,
    physicalQuantity: row.physical_quantity,
    giftReserveQuantity: row.gift_reserve_quantity,
    safetyReserveQuantity: row.safety_reserve_quantity,
    activeReservedQuantity: row.active_reserved_quantity,
    soldQuantity: row.sold_quantity,
    reservesValidated: row.reserves_validated === 1,
    version: row.version,
  };
}

function toStockReservation(row: ReservationRow): StockReservation {
  return {
    id: row.id,
    cartId: row.cart_id,
    variantId: row.variant_id,
    quantity: row.quantity,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    lastTransitionKey: row.last_transition_key,
    expiresAt: row.expires_at,
    convertedOrderId: row.converted_order_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function movementKey(action: "reserve", key: string): string;
function movementKey(
  action: "release" | "expire" | "sale",
  key: string,
  reservationId: string,
): string;
function movementKey(
  action: "reserve" | "release" | "expire" | "sale",
  key: string,
  reservationId?: string,
) {
  if (action !== "reserve" && !reservationId) {
    throw new CommerceError(
      "INVALID_INPUT",
      "Reservation transitions require a reservation-scoped movement key.",
    );
  }

  if (reservationId) {
    return `${action}:${key}:${reservationId}`;
  }

  return `${action}:${key}`;
}

function mapCommerceDatabaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("commerce_reserves_not_validated")) {
    throw new CommerceError(
      "RESERVES_NOT_VALIDATED",
      "Stock cannot be reserved until AJ Luxury validates gift and safety reserves.",
      { cause: error },
    );
  }

  if (message.includes("commerce_insufficient_stock_or_cart_closed")) {
    throw new CommerceError(
      "INSUFFICIENT_STOCK_OR_CART_CLOSED",
      "The cart is closed or the requested stock is unavailable.",
      { cause: error },
    );
  }

  if (message.includes("commerce_reservation_not_expired")) {
    throw new CommerceError(
      "RESERVATION_NOT_EXPIRED",
      "The reservation has not reached its expiry time.",
      { cause: error },
    );
  }

  if (
    message.includes("commerce_invalid_reservation_transition") ||
    message.includes("commerce_sale_reservation_expired")
  ) {
    throw new CommerceError(
      "INVALID_RESERVATION_TRANSITION",
      "The reservation transition is not allowed.",
      { cause: error },
    );
  }

  if (
    message.includes("commerce_sale_order_payment_mismatch") ||
    message.includes("commerce_order_payment_mismatch") ||
    message.includes("commerce_webhook_processing_incomplete") ||
    message.includes("payments.order_id")
  ) {
    throw new CommerceError(
      "ORDER_PAYMENT_MISMATCH",
      "Order, payment, cart, lines and reservations are inconsistent.",
      { cause: error },
    );
  }

  if (message.includes("commerce_webhook_replay_conflict")) {
    throw new CommerceError(
      "IDEMPOTENCY_CONFLICT",
      "The verified provider event was replayed with different content.",
      { cause: error },
    );
  }

  if (
    message.includes("commerce_webhook_verification_method_mismatch") ||
    message.includes("commerce_payment_requires_verified_event")
  ) {
    throw new CommerceError(
      "PAYMENT_VERIFICATION_REQUIRED",
      "The payment event does not have verified provider provenance.",
      { cause: error },
    );
  }

  throw error;
}

function normalizeOptionalEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase() ?? null;
  return normalized || null;
}

export class D1CommerceStore {
  readonly #database: CommerceD1Database;

  constructor(database: CommerceD1Database) {
    this.#database = database;
  }

  async seedLaunchCatalog(now: string): Promise<void> {
    assertIsoTimestamp(now, "now");
    assertLaunchSeedIntegrity();

    const preexistingIntegrity = await this.#getLaunchSeedIntegrity();
    if (
      preexistingIntegrity &&
      preexistingIntegrity.inventory_count > 0 &&
      (preexistingIntegrity.inventory_count !== 12 ||
        preexistingIntegrity.physical_quantity !== 756 ||
        preexistingIntegrity.ledger_count !== 12)
    ) {
      throw new CommerceError(
        "IDEMPOTENCY_CONFLICT",
        "Existing launch inventory and its seed ledger are not synchronized.",
      );
    }

    const statements: CommerceD1PreparedStatement[] = [
      this.#database
        .prepare(
          `INSERT INTO products (
            id, slug, name, status, price_cents, currency, created_at, updated_at
          ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            slug = excluded.slug,
            name = excluded.name,
            price_cents = excluded.price_cents,
            currency = excluded.currency,
            updated_at = excluded.updated_at`,
        )
        .bind(
          LAUNCH_PRODUCT_ID,
          "apollon",
          "Apollon",
          LAUNCH_PRICE_CENTS,
          LAUNCH_CURRENCY,
          now,
          now,
        ),
    ];

    for (const variant of launchVariantSeed) {
      statements.push(
        this.#database
          .prepare(
            `INSERT INTO variants (
              id, product_id, internal_reference, color_key, color_name, size,
              swatch, image_url, active, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              internal_reference = excluded.internal_reference,
              color_key = excluded.color_key,
              color_name = excluded.color_name,
              size = excluded.size,
              swatch = excluded.swatch,
              image_url = excluded.image_url,
              active = excluded.active,
              sort_order = excluded.sort_order,
              updated_at = excluded.updated_at`,
          )
          .bind(
            variant.id,
            LAUNCH_PRODUCT_ID,
            variant.internalReference,
            variant.colorKey,
            variant.colorName,
            variant.size,
            variant.swatch,
            variant.imageUrl,
            variant.sortOrder,
            now,
            now,
          ),
        this.#database
          .prepare(
            `INSERT INTO inventory (
              variant_id, physical_quantity, gift_reserve_quantity,
              safety_reserve_quantity, active_reserved_quantity, sold_quantity,
              reserves_validated, version, updated_at
            ) VALUES (?, ?, ?, ?, 0, 0, ?, 0, ?)
            ON CONFLICT(variant_id) DO NOTHING`,
          )
          .bind(
            variant.id,
            variant.physicalQuantity,
            variant.giftReserveQuantity,
            variant.safetyReserveQuantity,
            variant.reservesValidated ? 1 : 0,
            now,
          ),
      );
    }

    await this.#database.batch(statements);

    const integrity = await this.#getLaunchSeedIntegrity();

    if (
      !integrity ||
      integrity.inventory_count !== 12 ||
      integrity.physical_quantity !== 756 ||
      integrity.ledger_count !== 12
    ) {
      throw new CommerceError(
        "IDEMPOTENCY_CONFLICT",
        "Launch inventory and its seed ledger are not synchronized.",
      );
    }
  }

  async #getLaunchSeedIntegrity(): Promise<SeedIntegrityRow | null> {
    return this.#database
      .prepare(
        `SELECT
          COUNT(*) AS inventory_count,
          COALESCE(SUM(stock.physical_quantity), 0) AS physical_quantity,
          COALESCE(SUM(
            CASE WHEN movement.kind = 'seed'
              AND movement.quantity = stock.physical_quantity
              THEN 1 ELSE 0 END
          ), 0) AS ledger_count
        FROM inventory AS stock
        INNER JOIN variants AS variant ON variant.id = stock.variant_id
        LEFT JOIN inventory_movements AS movement
          ON movement.idempotency_key = 'seed:' || stock.variant_id
        WHERE variant.product_id = ?`,
      )
      .bind(LAUNCH_PRODUCT_ID)
      .first<SeedIntegrityRow>();
  }

  async createCart(input: CreateCartInput): Promise<void> {
    assertSafeIdentifier(input.id, "id");
    assertIsoTimestamp(input.expiresAt, "expiresAt");
    assertIsoTimestamp(input.now, "now");

    if (input.customerId) {
      assertSafeIdentifier(input.customerId, "customerId");
    }

    if (Date.parse(input.expiresAt) <= Date.parse(input.now)) {
      throw new CommerceError(
        "INVALID_INPUT",
        "Cart expiry must be later than its creation time.",
      );
    }

    const normalizedEmail = normalizeOptionalEmail(input.email);
    await this.#database
      .prepare(
        `INSERT INTO carts (
          id, customer_id, status, currency, email, expires_at, created_at, updated_at
        ) VALUES (?, ?, 'open', 'EUR', ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        input.id,
        input.customerId ?? null,
        normalizedEmail,
        input.expiresAt,
        input.now,
        input.now,
      )
      .run();

    const cart = await this.#database
      .prepare(
        `SELECT id, customer_id, email, status, currency, expires_at
        FROM carts WHERE id = ?`,
      )
      .bind(input.id)
      .first<CartRow>();

    if (
      !cart ||
      cart.customer_id !== (input.customerId ?? null) ||
      cart.email !== normalizedEmail ||
      cart.expires_at !== input.expiresAt ||
      cart.currency !== "EUR"
    ) {
      throw new CommerceError(
        "CART_ID_CONFLICT",
        "The cart id already belongs to different cart input.",
      );
    }
  }

  async getInventoryPosition(
    variantId: string,
  ): Promise<InventoryPosition | null> {
    assertSafeIdentifier(variantId, "variantId");
    const row = await this.#database
      .prepare(
        `SELECT
          variant_id, physical_quantity, gift_reserve_quantity,
          safety_reserve_quantity, active_reserved_quantity, sold_quantity,
          reserves_validated, version
        FROM inventory
        WHERE variant_id = ?`,
      )
      .bind(variantId)
      .first<InventoryRow>();

    return row ? toInventoryPosition(row) : null;
  }

  async reserveStock(input: ReserveStockInput): Promise<StockReservation> {
    validateReserveStockInput(input);
    const reserveMovementKey = movementKey("reserve", input.idempotencyKey);

    try {
      await this.#database.batch([
        this.#database
          .prepare(
            `INSERT INTO stock_reservations (
              id, cart_id, variant_id, quantity, status, idempotency_key,
              last_transition_key, expires_at, converted_order_id, created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, 'active', ?, NULL, ?, NULL, ?, ?)
            ON CONFLICT(idempotency_key) DO NOTHING`,
          )
          .bind(
            input.reservationId,
            input.cartId,
            input.variantId,
            input.quantity,
            input.idempotencyKey,
            input.expiresAt,
            input.now,
            input.now,
          ),
        this.#database
          .prepare(
            `INSERT INTO inventory_movements (
              id, variant_id, kind, quantity, reference_type, reference_id,
              actor_type, actor_id, idempotency_key, created_at
            )
            SELECT ?, reservation.variant_id, 'reserve', reservation.quantity,
              'reservation', reservation.id, 'system', NULL, ?, ?
            FROM stock_reservations AS reservation
            WHERE reservation.idempotency_key = ?
            ON CONFLICT(idempotency_key) DO NOTHING`,
          )
          .bind(
            `movement_reserve_${input.reservationId}`,
            reserveMovementKey,
            input.now,
            input.idempotencyKey,
          ),
      ]);
    } catch (error) {
      mapCommerceDatabaseError(error);
    }

    const reservation = await this.getReservationByIdempotencyKey(
      input.idempotencyKey,
    );

    if (!reservation) {
      throw new CommerceError(
        "INSUFFICIENT_STOCK_OR_CART_CLOSED",
        "The cart is closed or the requested stock is unavailable.",
      );
    }

    if (
      reservation.cartId !== input.cartId ||
      reservation.variantId !== input.variantId ||
      reservation.quantity !== input.quantity ||
      reservation.expiresAt !== input.expiresAt
    ) {
      throw new CommerceError(
        "IDEMPOTENCY_CONFLICT",
        "The reservation idempotency key was already used for different input.",
      );
    }

    return reservation;
  }

  async releaseStock(input: ReleaseStockInput): Promise<StockReservation> {
    validateReleaseStockInput(input);
    return this.#closeReservation({
      reservationId: input.reservationId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      targetStatus: "released",
      requireExpired: false,
    });
  }

  async expireReservation(input: ExpireStockInput): Promise<StockReservation> {
    validateExpireStockInput(input);
    return this.#closeReservation({
      reservationId: input.reservationId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      targetStatus: "expired",
      requireExpired: true,
    });
  }

  async #closeReservation(input: {
    reservationId: string;
    idempotencyKey: string;
    now: string;
    targetStatus: "released" | "expired";
    requireExpired: boolean;
  }): Promise<StockReservation> {
    const closeMovementKey = movementKey(
      input.targetStatus === "expired" ? "expire" : "release",
      input.idempotencyKey,
      input.reservationId,
    );
    const expiryPredicate = input.requireExpired ? "AND expires_at <= ?" : "";
    const updateValues = input.requireExpired
      ? [
          input.targetStatus,
          input.idempotencyKey,
          input.now,
          input.reservationId,
          input.now,
        ]
      : [
          input.targetStatus,
          input.idempotencyKey,
          input.now,
          input.reservationId,
        ];

    try {
      await this.#database.batch([
        this.#database
          .prepare(
            `UPDATE stock_reservations
            SET status = ?, last_transition_key = ?, updated_at = ?
            WHERE id = ? AND status = 'active' ${expiryPredicate}`,
          )
          .bind(...updateValues),
        this.#database
          .prepare(
            `INSERT INTO inventory_movements (
              id, variant_id, kind, quantity, reference_type, reference_id,
              actor_type, actor_id, idempotency_key, created_at
            )
            SELECT ?, reservation.variant_id, 'release', reservation.quantity,
              ?, reservation.id, 'system', NULL, ?, ?
            FROM stock_reservations AS reservation
            WHERE reservation.id = ?
              AND reservation.status = ?
              AND reservation.last_transition_key = ?
            ON CONFLICT(idempotency_key) DO NOTHING`,
          )
          .bind(
            `movement_${input.targetStatus}_${input.reservationId}`,
            input.targetStatus === "expired" ? "expiration" : "reservation",
            closeMovementKey,
            input.now,
            input.reservationId,
            input.targetStatus,
            input.idempotencyKey,
          ),
      ]);
    } catch (error) {
      mapCommerceDatabaseError(error);
    }

    const reservation = await this.getReservation(input.reservationId);
    if (!reservation) {
      throw new CommerceError(
        "RESERVATION_NOT_FOUND",
        "The stock reservation does not exist.",
      );
    }

    if (
      reservation.status === input.targetStatus &&
      reservation.lastTransitionKey === input.idempotencyKey
    ) {
      return reservation;
    }

    if (input.requireExpired && reservation.status === "active") {
      throw new CommerceError(
        "RESERVATION_NOT_EXPIRED",
        "The reservation has not reached its expiry time.",
      );
    }

    throw new CommerceError(
      "INVALID_RESERVATION_TRANSITION",
      `Only an active reservation can be ${input.targetStatus}.`,
    );
  }

  async convertStockToSale(
    input: ConvertStockToSaleInput,
  ): Promise<StockReservation> {
    validateConvertStockToSaleInput(input);
    const saleMovementKey = movementKey(
      "sale",
      input.idempotencyKey,
      input.reservationId,
    );

    try {
      await this.#database.batch([
        this.#database
          .prepare(
            `UPDATE stock_reservations
            SET status = 'converted', converted_order_id = ?,
              last_transition_key = ?, updated_at = ?
            WHERE id = ? AND status = 'active'`,
          )
          .bind(
            input.orderId,
            input.idempotencyKey,
            input.now,
            input.reservationId,
          ),
        this.#database
          .prepare(
            `INSERT INTO inventory_movements (
              id, variant_id, kind, quantity, reference_type, reference_id,
              actor_type, actor_id, idempotency_key, created_at
            )
            SELECT ?, reservation.variant_id, 'sale', reservation.quantity,
              'order', reservation.converted_order_id, 'system', NULL, ?, ?
            FROM stock_reservations AS reservation
            WHERE reservation.id = ?
              AND reservation.status = 'converted'
              AND reservation.last_transition_key = ?
            ON CONFLICT(idempotency_key) DO NOTHING`,
          )
          .bind(
            `movement_sale_${input.reservationId}`,
            saleMovementKey,
            input.now,
            input.reservationId,
            input.idempotencyKey,
          ),
      ]);
    } catch (error) {
      mapCommerceDatabaseError(error);
    }

    const reservation = await this.getReservation(input.reservationId);
    if (!reservation) {
      throw new CommerceError(
        "RESERVATION_NOT_FOUND",
        "The stock reservation does not exist.",
      );
    }

    if (
      reservation.status !== "converted" ||
      reservation.convertedOrderId !== input.orderId ||
      reservation.lastTransitionKey !== input.idempotencyKey
    ) {
      throw new CommerceError(
        "INVALID_RESERVATION_TRANSITION",
        "Only an active, unexpired reservation with a coherent paid order can be sold.",
      );
    }

    return reservation;
  }

  async processPaymentSucceeded(
    event: VerifiedPaymentEvent,
  ): Promise<{ orderId: string; convertedReservations: number }> {
    assertVerifiedPaymentEvent(event);
    const eventKey = `webhook:${event.provider}:${event.providerEventId}`;
    const paymentId = `payment_${event.provider}_${event.providerPaymentId}`;
    const webhookId = `webhook_${event.provider}_${event.providerEventId}`;
    const outboxId = `outbox_order_confirmation_${event.orderId}`;
    const auditId = `audit_payment_succeeded_${event.orderId}`;

    try {
      await this.#database.batch([
        this.#database
          .prepare(
            `INSERT INTO webhook_events (
              id, provider, provider_event_id, event_type, payload_fingerprint,
              verification_method, verified_at, order_id, provider_payment_id,
              amount_cents, currency, status, attempts, received_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', 0, ?)
            ON CONFLICT(provider, provider_event_id) DO NOTHING`,
          )
          .bind(
            webhookId,
            event.provider,
            event.providerEventId,
            event.eventType,
            event.payloadFingerprint,
            event.verificationMethod,
            event.verifiedAt,
            event.orderId,
            event.providerPaymentId,
            event.amountCents,
            event.currency,
            event.occurredAt,
          ),
        this.#database
          .prepare(
            `INSERT INTO payments (
              id, order_id, provider, provider_session_id, status, amount_cents,
              currency, idempotency_key, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?)
            ON CONFLICT(provider, provider_session_id) DO NOTHING`,
          )
          .bind(
            paymentId,
            event.orderId,
            event.provider,
            event.providerPaymentId,
            event.amountCents,
            event.currency,
            `payment:${event.provider}:${event.providerPaymentId}`,
            event.occurredAt,
            event.verifiedAt,
          ),
        this.#database
          .prepare(
            `UPDATE stock_reservations
            SET status = 'converted', converted_order_id = ?,
              last_transition_key = ?, updated_at = ?
            WHERE status = 'active'
              AND cart_id = (SELECT cart_id FROM orders WHERE id = ?)`,
          )
          .bind(event.orderId, eventKey, event.occurredAt, event.orderId),
        this.#database
          .prepare(
            `INSERT INTO inventory_movements (
              id, variant_id, kind, quantity, reference_type, reference_id,
              actor_type, actor_id, idempotency_key, created_at
            )
            SELECT 'movement_sale_' || reservation.id,
              reservation.variant_id, 'sale', reservation.quantity,
              'order', reservation.converted_order_id, 'system', NULL,
              'sale:' || ? || ':' || reservation.id, ?
            FROM stock_reservations AS reservation
            WHERE reservation.converted_order_id = ?
              AND reservation.status = 'converted'
              AND reservation.last_transition_key = ?
            ON CONFLICT(idempotency_key) DO NOTHING`,
          )
          .bind(eventKey, event.occurredAt, event.orderId, eventKey),
        this.#database
          .prepare(
            `UPDATE orders
            SET status = 'paid', paid_at = ?, updated_at = ?
            WHERE id = ? AND status = 'pending_payment'`,
          )
          .bind(event.occurredAt, event.verifiedAt, event.orderId),
        this.#database
          .prepare(
            `UPDATE carts
            SET status = 'converted', updated_at = ?
            WHERE id = (SELECT cart_id FROM orders WHERE id = ? AND status = 'paid')
              AND status = 'open'`,
          )
          .bind(event.verifiedAt, event.orderId),
        this.#database
          .prepare(
            `INSERT INTO email_outbox (
              id, kind, recipient_email, order_id, locale, template_version,
              payload_json, status, attempts, next_attempt_at, idempotency_key,
              created_at
            )
            SELECT ?, 'order_confirmation', email, id, 'fr', ?, ?, 'pending',
              0, ?, ?, ?
            FROM orders WHERE id = ? AND status = 'paid'
            ON CONFLICT(idempotency_key) DO NOTHING`,
          )
          .bind(
            outboxId,
            "order-confirmation-v1",
            JSON.stringify({ orderId: event.orderId }),
            event.verifiedAt,
            `email:order_confirmation:${event.orderId}`,
            event.verifiedAt,
            event.orderId,
          ),
        this.#database
          .prepare(
            `INSERT INTO audit_log (
              id, actor_type, actor_id, action, entity_type, entity_id,
              idempotency_key, metadata_json, created_at
            )
            SELECT ?, 'system', NULL, 'payment_succeeded', 'order', id, ?, ?, ?
            FROM orders WHERE id = ? AND status = 'paid'
            ON CONFLICT(idempotency_key) DO NOTHING`,
          )
          .bind(
            auditId,
            `audit:payment:${event.provider}:${event.providerEventId}`,
            JSON.stringify({
              eventId: event.providerEventId,
              paymentId: event.providerPaymentId,
              provider: event.provider,
            }),
            event.verifiedAt,
            event.orderId,
          ),
        this.#database
          .prepare(
            `UPDATE webhook_events
            SET status = 'processed', attempts = attempts + 1,
              processed_at = COALESCE(processed_at, ?), last_error_code = NULL
            WHERE provider = ? AND provider_event_id = ?
              AND order_id = ? AND provider_payment_id = ?
              AND amount_cents = ? AND currency = ?
              AND payload_fingerprint = ? AND verification_method = ?`,
          )
          .bind(
            event.verifiedAt,
            event.provider,
            event.providerEventId,
            event.orderId,
            event.providerPaymentId,
            event.amountCents,
            event.currency,
            event.payloadFingerprint,
            event.verificationMethod,
          ),
      ]);
    } catch (error) {
      mapCommerceDatabaseError(error);
    }

    const result = await this.#database
      .prepare(
        `SELECT
          orders.status AS order_status,
          carts.status AS cart_status,
          webhook_events.status AS webhook_status,
          COUNT(stock_reservations.id) AS converted_reservations
        FROM orders
        INNER JOIN carts ON carts.id = orders.cart_id
        INNER JOIN webhook_events ON webhook_events.order_id = orders.id
          AND webhook_events.provider = ?
          AND webhook_events.provider_event_id = ?
        LEFT JOIN stock_reservations
          ON stock_reservations.converted_order_id = orders.id
          AND stock_reservations.status = 'converted'
        WHERE orders.id = ?
        GROUP BY orders.id, orders.status, carts.status, webhook_events.status`,
      )
      .bind(event.provider, event.providerEventId, event.orderId)
      .first<PaymentResultRow>();

    if (
      !result ||
      result.order_status !== "paid" ||
      result.cart_status !== "converted" ||
      result.webhook_status !== "processed" ||
      result.converted_reservations < 1
    ) {
      throw new CommerceError(
        "ORDER_PAYMENT_MISMATCH",
        "The verified payment did not complete the order transaction.",
      );
    }

    return {
      orderId: event.orderId,
      convertedReservations: result.converted_reservations,
    };
  }

  async getReservation(id: string): Promise<StockReservation | null> {
    assertSafeIdentifier(id, "id");
    const row = await this.#database
      .prepare(
        `SELECT
          id, cart_id, variant_id, quantity, status, idempotency_key,
          last_transition_key, expires_at, converted_order_id, created_at,
          updated_at
        FROM stock_reservations WHERE id = ?`,
      )
      .bind(id)
      .first<ReservationRow>();

    return row ? toStockReservation(row) : null;
  }

  async getReservationByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<StockReservation | null> {
    assertSafeIdentifier(idempotencyKey, "idempotencyKey");
    const row = await this.#database
      .prepare(
        `SELECT
          id, cart_id, variant_id, quantity, status, idempotency_key,
          last_transition_key, expires_at, converted_order_id, created_at,
          updated_at
        FROM stock_reservations WHERE idempotency_key = ?`,
      )
      .bind(idempotencyKey)
      .first<ReservationRow>();

    return row ? toStockReservation(row) : null;
  }
}
