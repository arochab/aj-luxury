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
  type InventoryPosition,
  type ReleaseStockInput,
  type ReserveStockInput,
  type StockReservation,
  assertIsoTimestamp,
  assertSafeIdentifier,
  validateConvertStockToSaleInput,
  validateReleaseStockInput,
  validateReserveStockInput,
} from "./backend-domain.ts";

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

type WebhookEventRow = {
  id: string;
  provider: "test" | "stripe";
  provider_event_id: string;
  event_type: string;
  payload_hash: string;
  status: "received" | "processed" | "failed";
  attempts: number;
  received_at: string;
  processed_at: string | null;
};

export type CreateCartInput = {
  id: string;
  customerId?: string | null;
  email?: string | null;
  expiresAt: string;
  now: string;
};

export type RecordWebhookEventInput = {
  id: string;
  provider: "test" | "stripe";
  providerEventId: string;
  eventType: string;
  payloadHash: string;
  receivedAt: string;
};

export type StoredWebhookEvent = {
  id: string;
  provider: "test" | "stripe";
  providerEventId: string;
  eventType: string;
  payloadHash: string;
  status: "received" | "processed" | "failed";
  attempts: number;
  receivedAt: string;
  processedAt: string | null;
};

export type ProcessPaymentSucceededInput = RecordWebhookEventInput & {
  reservationId: string;
  orderId: string;
  processedAt: string;
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

function toStoredWebhookEvent(row: WebhookEventRow): StoredWebhookEvent {
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    eventType: row.event_type,
    payloadHash: row.payload_hash,
    status: row.status,
    attempts: row.attempts,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
  };
}

function movementKey(action: "reserve" | "release" | "sale", key: string) {
  return `${action}:${key}`;
}

function mapReservationError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("commerce_insufficient_stock_or_cart_closed")) {
    throw new CommerceError(
      "INSUFFICIENT_STOCK_OR_CART_CLOSED",
      "The cart is closed or the requested stock is unavailable.",
      { cause: error },
    );
  }

  if (message.includes("commerce_invalid_reservation_transition")) {
    throw new CommerceError(
      "INVALID_RESERVATION_TRANSITION",
      "The reservation transition is not allowed.",
      { cause: error },
    );
  }

  throw error;
}

export class D1CommerceStore {
  readonly #database: CommerceD1Database;

  constructor(database: CommerceD1Database) {
    this.#database = database;
  }

  async seedLaunchCatalog(now: string): Promise<void> {
    assertIsoTimestamp(now, "now");
    assertLaunchSeedIntegrity();

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
        this.#database
          .prepare(
            `INSERT INTO inventory_movements (
              id, variant_id, kind, quantity, reference_type, reference_id,
              actor_type, actor_id, idempotency_key, created_at
            ) VALUES (?, ?, 'seed', ?, 'catalog_seed', ?, 'system', NULL, ?, ?)
            ON CONFLICT(idempotency_key) DO NOTHING`,
          )
          .bind(
            `movement_seed_${variant.id}`,
            variant.id,
            variant.physicalQuantity,
            "aj_launch_2026",
            `seed:${variant.id}`,
            now,
          ),
      );
    }

    await this.#database.batch(statements);
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
        input.email?.trim().toLowerCase() ?? null,
        input.expiresAt,
        input.now,
        input.now,
      )
      .run();
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
      mapReservationError(error);
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
    const releaseMovementKey = movementKey("release", input.idempotencyKey);

    try {
      await this.#database.batch([
        this.#database
          .prepare(
            `UPDATE stock_reservations
            SET status = 'released', last_transition_key = ?, updated_at = ?
            WHERE id = ? AND status = 'active'`,
          )
          .bind(input.idempotencyKey, input.now, input.reservationId),
        this.#database
          .prepare(
            `INSERT INTO inventory_movements (
              id, variant_id, kind, quantity, reference_type, reference_id,
              actor_type, actor_id, idempotency_key, created_at
            )
            SELECT ?, reservation.variant_id, 'release', reservation.quantity,
              'reservation', reservation.id, 'system', NULL, ?, ?
            FROM stock_reservations AS reservation
            WHERE reservation.id = ?
              AND reservation.status = 'released'
              AND reservation.last_transition_key = ?
            ON CONFLICT(idempotency_key) DO NOTHING`,
          )
          .bind(
            `movement_release_${input.reservationId}`,
            releaseMovementKey,
            input.now,
            input.reservationId,
            input.idempotencyKey,
          ),
      ]);
    } catch (error) {
      mapReservationError(error);
    }

    const reservation = await this.getReservation(input.reservationId);

    if (!reservation) {
      throw new CommerceError(
        "RESERVATION_NOT_FOUND",
        "The stock reservation does not exist.",
      );
    }

    if (
      reservation.status !== "released" ||
      reservation.lastTransitionKey !== input.idempotencyKey
    ) {
      throw new CommerceError(
        "INVALID_RESERVATION_TRANSITION",
        "Only an active reservation can be released.",
      );
    }

    return reservation;
  }

  async convertStockToSale(
    input: ConvertStockToSaleInput,
  ): Promise<StockReservation> {
    validateConvertStockToSaleInput(input);
    const saleMovementKey = movementKey("sale", input.idempotencyKey);

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
      mapReservationError(error);
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
        "Only an active reservation can be converted to a sale.",
      );
    }

    return reservation;
  }

  async getReservation(id: string): Promise<StockReservation | null> {
    assertSafeIdentifier(id, "id");
    const row = await this.#database
      .prepare(
        `SELECT
          id, cart_id, variant_id, quantity, status, idempotency_key,
          last_transition_key, expires_at, converted_order_id, created_at,
          updated_at
        FROM stock_reservations
        WHERE id = ?`,
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
        FROM stock_reservations
        WHERE idempotency_key = ?`,
      )
      .bind(idempotencyKey)
      .first<ReservationRow>();

    return row ? toStockReservation(row) : null;
  }

  async recordWebhookEvent(
    input: RecordWebhookEventInput,
  ): Promise<StoredWebhookEvent> {
    assertSafeIdentifier(input.id, "id");
    assertSafeIdentifier(input.providerEventId, "providerEventId");
    assertIsoTimestamp(input.receivedAt, "receivedAt");

    if (!input.eventType.trim() || !input.payloadHash.trim()) {
      throw new CommerceError(
        "INVALID_INPUT",
        "eventType and payloadHash are required.",
      );
    }

    await this.#database
      .prepare(
        `INSERT INTO webhook_events (
          id, provider, provider_event_id, event_type, payload_hash, status,
          attempts, received_at
        ) VALUES (?, ?, ?, ?, ?, 'received', 0, ?)
        ON CONFLICT(provider, provider_event_id) DO NOTHING`,
      )
      .bind(
        input.id,
        input.provider,
        input.providerEventId,
        input.eventType,
        input.payloadHash,
        input.receivedAt,
      )
      .run();

    const row = await this.#database
      .prepare(
        `SELECT
          id, provider, provider_event_id, event_type, payload_hash, status,
          attempts, received_at, processed_at
        FROM webhook_events
        WHERE provider = ? AND provider_event_id = ?`,
      )
      .bind(input.provider, input.providerEventId)
      .first<WebhookEventRow>();

    if (!row) {
      throw new Error("The webhook event could not be persisted.");
    }

    if (
      row.event_type !== input.eventType ||
      row.payload_hash !== input.payloadHash
    ) {
      throw new CommerceError(
        "IDEMPOTENCY_CONFLICT",
        "The provider event id was already used with a different payload.",
      );
    }

    return toStoredWebhookEvent(row);
  }

  async processPaymentSucceeded(
    input: ProcessPaymentSucceededInput,
  ): Promise<StockReservation> {
    if (input.eventType !== "payment.succeeded") {
      throw new CommerceError(
        "INVALID_INPUT",
        "processPaymentSucceeded accepts only payment.succeeded events.",
      );
    }

    assertIsoTimestamp(input.processedAt, "processedAt");
    await this.recordWebhookEvent(input);

    const reservation = await this.convertStockToSale({
      reservationId: input.reservationId,
      orderId: input.orderId,
      idempotencyKey: `webhook:${input.provider}:${input.providerEventId}`,
      now: input.processedAt,
    });

    await this.#database
      .prepare(
        `UPDATE webhook_events
        SET status = 'processed',
          attempts = attempts + 1,
          processed_at = COALESCE(processed_at, ?),
          last_error_code = NULL
        WHERE provider = ? AND provider_event_id = ?`,
      )
      .bind(input.processedAt, input.provider, input.providerEventId)
      .run();

    return reservation;
  }
}
