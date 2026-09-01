import {
  resolveD1MutationActor,
  type D1MutationActor,
  type ResolvedD1Actor,
} from "./d1-actor-authorization.ts";
import { canCreateRefund } from "./access-control.ts";
import type {
  CommerceD1Database,
  CommerceD1Result,
} from "./d1-port.ts";
import {
  assertFulfillmentFingerprint,
  assertFulfillmentIdentifier,
  assertFulfillmentTimestamp,
  assertPositiveFulfillmentInteger,
  fingerprintCartLines,
  fingerprintReturnDeclaration,
  FulfillmentError,
  FulfillmentProviderError,
  normalizeShippingAddress,
  sha256Hex,
  type RefundProviderPort,
  type ReturnDeclarationLine,
  type ShippingAddressInput,
  type ShippingLabelProviderPort,
  type TrackingEventCandidate,
  type TrackingProviderPort,
} from "./fulfillment-domain.ts";
import {
  isClientValidatedParcelProfile,
  parcelSnapshotMatchesProfile,
  type ClientValidatedParcelProfile,
} from "./parcel-profiles.ts";
import {
  assertVerifiedCarrierEvent,
  type VerifiedCarrierEvent,
} from "./verified-carrier-event.ts";
import { buildTransactionalEmail } from "./transactional-email.ts";

type QuoteConfigurationRow = {
  id: string;
  zone: "EU" | "UK" | "US" | "CA" | "GCC";
  service_code: string;
  price_cents: number;
  estimated_days_min: number;
  estimated_days_max: number;
  duties_terms: "EU_INCLUDED" | "DAP" | "DDP";
};

type QuoteRow = {
  id: string;
  cart_id: string;
  cart_fingerprint: string;
  cart_revision: number;
  configuration_id: string;
  shipping_address_json: string;
  shipping_address_fingerprint: string;
  amount_cents: number;
  currency: "EUR";
  estimated_days_min: number;
  estimated_days_max: number;
  duties_terms: "EU_INCLUDED" | "DAP" | "DDP";
  expires_at: string;
  selected_at: string | null;
  created_at: string;
};

export type ShippingQuoteParcelSnapshotRow = {
  quote_id: string;
  profile_code: ClientValidatedParcelProfile["profileCode"];
  source_version: ClientValidatedParcelProfile["sourceVersion"];
  item_count: ClientValidatedParcelProfile["itemCount"];
  weight_grams: ClientValidatedParcelProfile["weightGrams"];
  length_mm: ClientValidatedParcelProfile["lengthMm"];
  width_mm: ClientValidatedParcelProfile["widthMm"];
  height_mm: ClientValidatedParcelProfile["heightMm"];
  created_at: string;
};

type ShipmentRow = {
  id: string;
  order_id: string;
  shipping_quote_id: string;
  status:
    | "label_pending"
    | "label_claimed"
    | "label_ready"
    | "handed_over"
    | "in_transit"
    | "delivered"
    | "failed";
  provider_shipment_reference: string | null;
  tracking_provider_code: string | null;
  tracking_reference: string | null;
  provider_receipt_fingerprint: string | null;
  idempotency_key: string;
  lease_token_hash: string | null;
  lease_expires_at: string | null;
  attempts: number;
  max_attempts: number;
  label_created_at: string | null;
  handed_over_at: string | null;
  delivered_at: string | null;
};

type ReturnRequestRow = {
  id: string;
  order_id: string;
  kind: "return" | "withdrawal";
  source: "customer" | "guest" | "admin";
  actor_customer_id: string | null;
  guest_order_session_id: string | null;
  actor_admin_id: string | null;
  declaration_fingerprint: string;
  declared_line_count: number;
  status: string;
  resolution: string;
};

type RefundRow = {
  id: string;
  payment_id: string;
  return_request_id: string;
  reason: "return" | "withdrawal";
  amount_cents: number;
  currency: "EUR";
  status: "pending" | "claimed" | "succeeded" | "failed";
  idempotency_key: string;
  lease_token_hash: string | null;
  lease_expires_at: string | null;
  provider_refund_reference: string | null;
  provider_receipt_fingerprint: string | null;
  attempts: number;
  max_attempts: number;
};

type TrackingEventRow = {
  id: string;
  shipment_id: string;
  provider_code: string;
  provider_event_id: string;
  carrier_receipt_id: string | null;
  tracking_reference: string;
  event_type: TrackingEventCandidate["eventType"];
  event_fingerprint: string;
  occurred_at: string;
  received_at: string;
};

type CarrierEventReceiptRow = {
  id: string;
  shipment_id: string;
  provider_code: string;
  provider_event_id: string;
  tracking_reference: string;
  event_type: Exclude<TrackingEventCandidate["eventType"], "handed_over">;
  event_fingerprint: string;
  receipt_fingerprint: string;
  verification_method: "test_adapter" | "carrier_signature";
  occurred_at: string;
  received_at: string;
  verified_at: string;
  status: "verified" | "consumed";
  consumed_at: string | null;
};

type ReturnActorColumns = Readonly<{
  source: "customer" | "guest" | "admin";
  customerId: string | null;
  guestSessionId: string | null;
  adminId: string | null;
}>;

type ExpectedReturnArtifacts = Readonly<{
  orderId: string;
  kind: "return" | "withdrawal";
  source: ReturnActorColumns;
  declarationFingerprint: string;
  lines: readonly Readonly<{
    id: string;
    orderLineId: string;
    quantity: number;
  }>[];
  orderEmail: string;
  locale: "fr" | "en";
}>;

export type FulfillmentStorePorts = Readonly<{
  shippingLabel?: ShippingLabelProviderPort;
  tracking?: TrackingProviderPort;
  refund?: RefundProviderPort;
  transitionOrderToPreparingAfterLabel?: boolean;
}>;

function changed(result: CommerceD1Result<object>): number {
  return Number(result.meta?.changes ?? 0);
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof FulfillmentError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("shipping_quotes.cart_id") ||
    message.includes("ux_shipping_quotes_selected_cart")
  ) {
    throw new FulfillmentError(
      "QUOTE_MISMATCH",
      "Another quote was already selected for this cart.",
      { cause: error },
    );
  }
  if (
    message.includes("shipments.provider_shipment_reference") ||
    message.includes("shipments.tracking_reference") ||
    message.includes("refunds.provider_refund_reference")
  ) {
    throw new FulfillmentError(
      "PROVIDER_RECEIPT_MISMATCH",
      "The provider reference is already bound to another operation.",
      { cause: error },
    );
  }
  const mappings: readonly [string, ConstructorParameters<typeof FulfillmentError>[0]][] = [
    ["fulfillment_destination_unavailable", "DESTINATION_UNAVAILABLE"],
    ["fulfillment_configuration_incomplete", "CONFIGURATION_UNAVAILABLE"],
    ["fulfillment_configuration_ddp_unavailable", "CONFIGURATION_UNAVAILABLE"],
    ["fulfillment_quote_mismatch", "QUOTE_MISMATCH"],
    ["fulfillment_quote_expired", "QUOTE_EXPIRED"],
    ["fulfillment_order_not_paid", "ORDER_NOT_PAID"],
    ["fulfillment_customs_not_ready", "CUSTOMS_NOT_READY"],
    ["fulfillment_return_quantity_exceeded", "RETURN_QUANTITY_EXCEEDED"],
    ["fulfillment_return_declaration_sealed", "INVALID_TRANSITION"],
    ["fulfillment_inspection_incomplete", "INSPECTION_INCOMPLETE"],
    ["fulfillment_refund_limit_exceeded", "REFUND_LIMIT_EXCEEDED"],
    ["fulfillment_tracking_event_conflict", "TRACKING_EVENT_CONFLICT"],
    ["fulfillment_invalid_transition", "INVALID_TRANSITION"],
  ];
  const mapped = mappings.find(([needle]) => message.includes(needle));
  throw new FulfillmentError(
    mapped?.[1] ?? "PERSISTENCE_FAILURE",
    mapped ? "The fulfillment invariant rejected the operation." : "The fulfillment transaction failed.",
    { cause: error },
  );
}

function assertLeaseWindow(now: string, leaseExpiresAt: string): void {
  assertFulfillmentTimestamp(now, "now");
  assertFulfillmentTimestamp(leaseExpiresAt, "leaseExpiresAt");
  const seconds = (Date.parse(leaseExpiresAt) - Date.parse(now)) / 1_000;
  if (seconds < 30 || seconds > 15 * 60) {
    throw new FulfillmentError("INVALID_INPUT", "The lease window is invalid.");
  }
}

function assertEmailLocale(locale: unknown): asserts locale is "fr" | "en" {
  if (locale !== "fr" && locale !== "en") {
    throw new FulfillmentError("INVALID_INPUT", "locale is invalid.");
  }
}

function carrierReceiptMatches(
  receipt: CarrierEventReceiptRow | null,
  receiptId: string,
  verified: VerifiedCarrierEvent,
  status: "verified" | "consumed",
): boolean {
  return Boolean(
    receipt &&
    receipt.id === receiptId &&
    receipt.shipment_id === verified.shipmentId &&
    receipt.provider_code === verified.providerCode &&
    receipt.provider_event_id === verified.providerEventId &&
    receipt.tracking_reference === verified.trackingReference &&
    receipt.event_type === verified.eventType &&
    receipt.event_fingerprint === verified.eventFingerprint &&
    receipt.receipt_fingerprint === verified.receiptFingerprint &&
    receipt.verification_method === verified.verificationMethod &&
    receipt.occurred_at === verified.occurredAt &&
    receipt.received_at === verified.receivedAt &&
    receipt.verified_at === verified.verifiedAt &&
    receipt.status === status &&
    receipt.consumed_at === (status === "consumed" ? verified.receivedAt : null)
  );
}

/**
 * A carrier can legitimately retry the exact signed webhook later. Receipt and
 * verification timestamps are local arrival facts, not part of the provider
 * event identity. On replay, retain the first persisted timestamps and compare
 * only the immutable signed event evidence.
 */
function persistedCarrierReceiptMatchesReplay(
  receipt: CarrierEventReceiptRow | null,
  receiptId: string,
  verified: VerifiedCarrierEvent,
): boolean {
  return Boolean(
    receipt &&
    receipt.id === receiptId &&
    receipt.shipment_id === verified.shipmentId &&
    receipt.provider_code === verified.providerCode &&
    receipt.provider_event_id === verified.providerEventId &&
    receipt.tracking_reference === verified.trackingReference &&
    receipt.event_type === verified.eventType &&
    receipt.event_fingerprint === verified.eventFingerprint &&
    receipt.receipt_fingerprint === verified.receiptFingerprint &&
    receipt.verification_method === verified.verificationMethod &&
    receipt.occurred_at === verified.occurredAt &&
    receipt.status === "consumed" &&
    receipt.consumed_at === receipt.received_at
  );
}

function actorColumns(actor: ResolvedD1Actor): ReturnActorColumns {
  if (actor.kind === "customer") {
    return Object.freeze({
      source: "customer",
      customerId: actor.customerId,
      guestSessionId: null,
      adminId: null,
    });
  }
  if (actor.kind === "guest") {
    return Object.freeze({
      source: "guest",
      customerId: null,
      guestSessionId: actor.sessionId,
      adminId: null,
    });
  }
  return Object.freeze({
    source: "admin",
    customerId: null,
    guestSessionId: null,
    adminId: actor.administratorId,
  });
}

export class D1FulfillmentStore {
  readonly #database: CommerceD1Database;
  readonly #ports: FulfillmentStorePorts;

  constructor(database: CommerceD1Database, ports: FulfillmentStorePorts = {}) {
    this.#database = database;
    this.#ports = Object.freeze({ ...ports });
  }

  async #openCartSnapshot(
    cartId: string,
    now: string,
  ): Promise<Readonly<{
    fingerprint: string;
    expiresAt: string;
    revision: number;
    itemCount: number;
  }>> {
    const cart = await this.#database
      .prepare(
        `SELECT id, status, expires_at, fulfillment_revision FROM carts
        WHERE id = ? AND status = 'open' AND expires_at > ?`,
      )
      .bind(cartId, now)
      .first<{
        id: string;
        status: string;
        expires_at: string;
        fulfillment_revision: number;
      }>();
    if (!cart) {
      throw new FulfillmentError("QUOTE_MISMATCH", "The cart is not open.");
    }
    const result = await this.#database
      .prepare(
        `SELECT variant_id, quantity, unit_price_cents
        FROM cart_lines WHERE cart_id = ? ORDER BY variant_id`,
      )
      .bind(cartId)
      .all<{
        variant_id: string;
        quantity: number;
        unit_price_cents: number;
      }>();
    const fingerprint = await fingerprintCartLines(
      cartId,
      result.results.map((line) => ({
        variantId: line.variant_id,
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents,
      })),
    );
    return Object.freeze({
      fingerprint,
      expiresAt: cart.expires_at,
      revision: cart.fulfillment_revision,
      itemCount: result.results.reduce((total, line) => total + line.quantity, 0),
    });
  }

  async createShippingQuote(input: Readonly<{
    id: string;
    cartId: string;
    address: ShippingAddressInput;
    addressFingerprint?: string;
    parcelProfile: ClientValidatedParcelProfile;
    expiresAt: string;
    now: string;
  }>): Promise<QuoteRow> {
    assertFulfillmentIdentifier(input.id, "id");
    assertFulfillmentIdentifier(input.cartId, "cartId");
    assertFulfillmentTimestamp(input.now, "now");
    assertFulfillmentTimestamp(input.expiresAt, "expiresAt");
    if (!isClientValidatedParcelProfile(input.parcelProfile)) {
      throw new FulfillmentError("INVALID_INPUT", "The parcel profile is invalid.");
    }
    const lifetime = Date.parse(input.expiresAt) - Date.parse(input.now);
    if (lifetime <= 0 || lifetime > 24 * 60 * 60 * 1_000) {
      throw new FulfillmentError("INVALID_INPUT", "The quote lifetime is invalid.");
    }
    const [address, cart] = await Promise.all([
      normalizeShippingAddress(input.address, {
        allowMissingInternationalPhone: true,
      }),
      this.#openCartSnapshot(input.cartId, input.now),
    ]);
    if (input.addressFingerprint !== undefined) {
      assertFulfillmentFingerprint(input.addressFingerprint, "addressFingerprint");
    }
    const addressFingerprint = input.addressFingerprint ?? address.fingerprint;
    // D1 still rechecks the launch zone, but it receives only a representative
    // non-personal routing proof. The validated customer country, postcode,
    // region, name, street and city never enter durable quote storage.
    const routingProofJson = JSON.stringify(
      address.zone === "EU"
        ? { countryCode: "FR", postalCode: "00000", regionCode: null }
        : address.zone === "UK"
          ? { countryCode: "GB", postalCode: "AA0", regionCode: null }
          : address.zone === "US"
            ? { countryCode: "US", postalCode: "00000", regionCode: "NY" }
            : { countryCode: "CA", postalCode: "A0A", regionCode: null },
    );
    if (input.expiresAt > cart.expiresAt) {
      throw new FulfillmentError(
        "INVALID_INPUT",
        "The quote cannot outlive its cart.",
      );
    }
    if (cart.itemCount !== input.parcelProfile.itemCount) {
      throw new FulfillmentError(
        "QUOTE_MISMATCH",
        "The parcel profile does not match the cart item count.",
      );
    }
    const configuration = await this.#database
      .prepare(
        `SELECT id, zone, service_code, price_cents, estimated_days_min,
          estimated_days_max, duties_terms
        FROM shipping_zone_configurations
        WHERE zone = ? AND status = 'active' LIMIT 1`,
      )
      .bind(address.zone)
      .first<QuoteConfigurationRow>();
    if (!configuration || configuration.duties_terms === "DDP") {
      throw new FulfillmentError(
        "CONFIGURATION_UNAVAILABLE",
        "No complete active shipping configuration is available.",
      );
    }
    try {
      await this.#database.batch([
        this.#database.prepare(
          `INSERT OR IGNORE INTO shipping_quotes (
            id, cart_id, cart_fingerprint, cart_revision, configuration_id,
            shipping_address_json, shipping_address_fingerprint,
            provider_quote_reference, provider_receipt_fingerprint,
            amount_cents, currency, estimated_days_min, estimated_days_max,
            duties_terms, expires_at, selected_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'EUR', ?, ?, ?, ?, NULL, ?)`,
        ).bind(
          input.id,
          input.cartId,
          cart.fingerprint,
          cart.revision,
          configuration.id,
          routingProofJson,
          addressFingerprint,
          configuration.price_cents,
          configuration.estimated_days_min,
          configuration.estimated_days_max,
          configuration.duties_terms,
          input.expiresAt,
          input.now,
        ),
        this.#database.prepare(
          `INSERT OR IGNORE INTO shipping_quote_parcel_snapshots (
            quote_id, profile_code, source_version, item_count, weight_grams,
            length_mm, width_mm, height_mm, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          input.id,
          input.parcelProfile.profileCode,
          input.parcelProfile.sourceVersion,
          input.parcelProfile.itemCount,
          input.parcelProfile.weightGrams,
          input.parcelProfile.lengthMm,
          input.parcelProfile.widthMm,
          input.parcelProfile.heightMm,
          input.now,
        ),
      ]);
    } catch (error) {
      mapDatabaseError(error);
    }
    const [quote, parcelSnapshot] = await Promise.all([
      this.getShippingQuote(input.id),
      this.getShippingQuoteParcelSnapshot(input.id),
    ]);
    if (
      !quote ||
      quote.cart_id !== input.cartId ||
      quote.cart_fingerprint !== cart.fingerprint ||
      quote.cart_revision !== cart.revision ||
      quote.configuration_id !== configuration.id ||
      quote.shipping_address_fingerprint !== addressFingerprint ||
      quote.shipping_address_json !== routingProofJson ||
      !parcelSnapshotMatchesProfile(parcelSnapshot, input.parcelProfile)
    ) {
      throw new FulfillmentError(
        "QUOTE_MISMATCH",
        "The quote key was already used for another cart or address.",
      );
    }
    return quote;
  }

  async getShippingQuote(id: string): Promise<QuoteRow | null> {
    assertFulfillmentIdentifier(id, "id");
    return this.#database
      .prepare(
        `SELECT id, cart_id, cart_fingerprint, cart_revision, configuration_id,
          shipping_address_json, shipping_address_fingerprint, amount_cents,
          currency, estimated_days_min, estimated_days_max, duties_terms,
          expires_at, selected_at, created_at
        FROM shipping_quotes WHERE id = ?`,
      )
      .bind(id)
      .first<QuoteRow>();
  }

  async getShippingQuoteParcelSnapshot(
    quoteId: string,
  ): Promise<ShippingQuoteParcelSnapshotRow | null> {
    assertFulfillmentIdentifier(quoteId, "quoteId");
    return this.#database
      .prepare(
        `SELECT quote_id, profile_code, source_version, item_count, weight_grams,
          length_mm, width_mm, height_mm, created_at
        FROM shipping_quote_parcel_snapshots WHERE quote_id = ?`,
      )
      .bind(quoteId)
      .first<ShippingQuoteParcelSnapshotRow>();
  }

  async selectShippingQuote(input: Readonly<{
    quoteId: string;
    cartId: string;
    address: ShippingAddressInput;
    addressFingerprint: string;
    now: string;
  }>): Promise<QuoteRow> {
    assertFulfillmentIdentifier(input.quoteId, "quoteId");
    assertFulfillmentIdentifier(input.cartId, "cartId");
    assertFulfillmentFingerprint(input.addressFingerprint, "addressFingerprint");
    assertFulfillmentTimestamp(input.now, "now");
    const [quote, address, parcelSnapshot] = await Promise.all([
      this.getShippingQuote(input.quoteId),
      normalizeShippingAddress(input.address, {
        allowMissingInternationalPhone: true,
      }),
      this.getShippingQuoteParcelSnapshot(input.quoteId),
    ]);
    const routingProofJson = JSON.stringify(
      address.zone === "EU"
        ? { countryCode: "FR", postalCode: "00000", regionCode: null }
        : address.zone === "UK"
          ? { countryCode: "GB", postalCode: "AA0", regionCode: null }
          : address.zone === "US"
            ? { countryCode: "US", postalCode: "00000", regionCode: "NY" }
            : { countryCode: "CA", postalCode: "A0A", regionCode: null },
    );
    if (
      !quote ||
      !parcelSnapshot ||
      quote.cart_id !== input.cartId ||
      quote.shipping_address_fingerprint !== input.addressFingerprint ||
      quote.shipping_address_json !== routingProofJson
    ) {
      throw new FulfillmentError("QUOTE_MISMATCH", "The quote no longer matches the cart.");
    }
    const activeConfiguration = await this.#database.prepare(
      `SELECT configuration.id
      FROM shipping_zone_configurations AS configuration
      WHERE configuration.id = ? AND configuration.status = 'active'
        AND configuration.price_cents = ? AND configuration.currency = ?
        AND configuration.duties_terms = ?`,
    ).bind(
      quote.configuration_id,
      quote.amount_cents,
      quote.currency,
      quote.duties_terms,
    ).first<{ id: string }>();
    if (!activeConfiguration) {
      throw new FulfillmentError(
        "CONFIGURATION_UNAVAILABLE",
        "The quote configuration is no longer active.",
      );
    }
    const cart = await this.#openCartSnapshot(input.cartId, input.now);
    if (
      quote.cart_fingerprint !== cart.fingerprint ||
      quote.cart_revision !== cart.revision ||
      parcelSnapshot.item_count !== cart.itemCount
    ) {
      throw new FulfillmentError("QUOTE_MISMATCH", "The quote no longer matches the cart.");
    }
    if (quote.expires_at <= input.now) {
      throw new FulfillmentError("QUOTE_EXPIRED", "The quote has expired.");
    }
    if (quote.selected_at !== null) {
      return quote;
    }
    try {
      const update = await this.#database
        .prepare(
          `UPDATE shipping_quotes SET selected_at = ?
          WHERE id = ? AND cart_id = ? AND cart_revision = ?
            AND selected_at IS NULL AND expires_at > ?
            AND EXISTS (
              SELECT 1 FROM carts AS cart
              WHERE cart.id = shipping_quotes.cart_id
                AND cart.fulfillment_revision = ?
            )`,
        )
        .bind(
          input.now,
          input.quoteId,
          input.cartId,
          cart.revision,
          input.now,
          cart.revision,
        )
        .run();
      if (changed(update) !== 1) {
        const raced = await this.getShippingQuote(input.quoteId);
        if (raced?.selected_at) return raced;
        throw new FulfillmentError("QUOTE_MISMATCH", "The quote could not be selected.");
      }
    } catch (error) {
      mapDatabaseError(error);
    }
    const selected = await this.getShippingQuote(input.quoteId);
    if (!selected?.selected_at) {
      throw new FulfillmentError("PERSISTENCE_FAILURE", "The quote selection was not persisted.");
    }
    return selected;
  }

  async purgeExpiredUnselectedShippingQuotes(input: Readonly<{
    expiredBefore: string;
    now: string;
  }>): Promise<number> {
    assertFulfillmentTimestamp(input.expiredBefore, "expiredBefore");
    assertFulfillmentTimestamp(input.now, "now");
    if (input.expiredBefore > input.now) {
      throw new FulfillmentError("INVALID_INPUT", "The purge cutoff is in the future.");
    }
    try {
      const foundation = await this.#database.prepare(
        `SELECT COUNT(*) AS count FROM sqlite_master
        WHERE type = 'table' AND name = 'delivery_option_snapshots'`,
      ).first<{ count: number }>();
      const expiredQuoteIds = `
        SELECT quote.id FROM shipping_quotes AS quote
        WHERE quote.selected_at IS NULL AND quote.expires_at <= ?
          AND NOT EXISTS (
            SELECT 1 FROM orders WHERE shipping_quote_id = quote.id
          )
        ORDER BY quote.expires_at, quote.id
        LIMIT 100`;
      if (foundation?.count !== 1) {
        const legacy = await this.#database.prepare(
          `DELETE FROM shipping_quotes WHERE id IN (${expiredQuoteIds})`,
        ).bind(input.expiredBefore).run();
        return changed(legacy);
      }
      const results = await this.#database.batch([
        this.#database.prepare(
          `DELETE FROM delivery_service_point_snapshots
          WHERE delivery_option_id IN (
            SELECT id FROM delivery_option_snapshots
            WHERE shipping_quote_id IN (${expiredQuoteIds})
              AND selected_at IS NULL
          )`,
        ).bind(input.expiredBefore),
        this.#database.prepare(
          `DELETE FROM delivery_option_snapshots
          WHERE shipping_quote_id IN (${expiredQuoteIds})
            AND selected_at IS NULL`,
        ).bind(input.expiredBefore),
        this.#database.prepare(
          `DELETE FROM shipping_quotes
          WHERE id IN (${expiredQuoteIds})`,
        ).bind(input.expiredBefore),
      ]);
      return changed(results[2] ?? {});
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async createShipmentLabel(input: Readonly<{
    shipmentId: string;
    orderId: string;
    idempotencyKey: string;
    leaseToken: string;
    leaseExpiresAt: string;
    now: string;
  }>): Promise<ShipmentRow> {
    const provider = this.#ports.shippingLabel;
    if (!provider) {
      throw new FulfillmentError(
        "DEPENDENCY_UNAVAILABLE",
        "The shipping-label provider is not configured.",
      );
    }
    assertFulfillmentIdentifier(input.shipmentId, "shipmentId");
    assertFulfillmentIdentifier(input.orderId, "orderId");
    assertFulfillmentIdentifier(input.idempotencyKey, "idempotencyKey");
    assertFulfillmentIdentifier(input.leaseToken, "leaseToken");
    assertLeaseWindow(input.now, input.leaseExpiresAt);
    const leaseTokenHash = await sha256Hex(input.leaseToken);
    try {
      await this.#database
        .prepare(
          `INSERT OR IGNORE INTO shipments (
            id, order_id, shipping_quote_id, status, idempotency_key,
            attempts, max_attempts, created_at, updated_at
          )
          SELECT ?, customer_order.id, customer_order.shipping_quote_id,
            'label_pending', ?, 0, 5, ?, ?
          FROM orders AS customer_order
          WHERE customer_order.id = ? AND customer_order.status = 'paid'
            AND customer_order.paid_at IS NOT NULL
            AND customer_order.shipping_quote_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM payments AS payment
              WHERE payment.order_id = customer_order.id
                AND payment.status = 'succeeded'
                AND payment.amount_cents = customer_order.total_cents
                AND payment.currency = customer_order.currency
            )`,
        )
        .bind(
          input.shipmentId,
          input.idempotencyKey,
          input.now,
          input.now,
          input.orderId,
        )
        .run();
    } catch (error) {
      mapDatabaseError(error);
    }
    let shipment = await this.#getShipment(input.shipmentId);
    if (!shipment) {
      throw new FulfillmentError("ORDER_NOT_PAID", "A paid order is required.");
    }
    if (
      shipment.order_id !== input.orderId ||
      shipment.idempotency_key !== input.idempotencyKey
    ) {
      throw new FulfillmentError(
        "INVALID_TRANSITION",
        "The shipment key belongs to another order or operation.",
      );
    }
    if (
      ["label_ready", "handed_over", "in_transit", "delivered"].includes(
        shipment.status,
      )
    ) {
      return shipment;
    }
    try {
      const claim = await this.#database
        .prepare(
          `UPDATE shipments SET status = 'label_claimed', lease_token_hash = ?,
            leased_at = ?, lease_expires_at = ?, attempts = attempts + 1,
            last_error_code = NULL, updated_at = ?
          WHERE id = ? AND idempotency_key = ? AND attempts < max_attempts
            AND (status = 'label_pending'
              OR (status = 'label_claimed' AND lease_expires_at <= ?))`,
        )
        .bind(
          leaseTokenHash,
          input.now,
          input.leaseExpiresAt,
          input.now,
          input.shipmentId,
          input.idempotencyKey,
          input.now,
        )
        .run();
      if (changed(claim) !== 1) {
        throw new FulfillmentError("LEASE_UNAVAILABLE", "The shipment lease is unavailable.");
      }
    } catch (error) {
      mapDatabaseError(error);
    }
    shipment = await this.#getShipment(input.shipmentId);
    if (!shipment || shipment.lease_token_hash !== leaseTokenHash) {
      throw new FulfillmentError("LEASE_UNAVAILABLE", "The shipment lease was lost.");
    }
    let receipt;
    try {
      receipt = await provider.createLabel({
        shipmentId: shipment.id,
        orderId: shipment.order_id,
        shippingQuoteId: shipment.shipping_quote_id,
        idempotencyKey: shipment.idempotency_key,
      });
    } catch (error) {
      if (error instanceof FulfillmentProviderError && error.outcome === "rejected") {
        await this.#database
          .prepare(
            `UPDATE shipments SET status = 'failed', lease_token_hash = NULL,
              leased_at = NULL, lease_expires_at = NULL,
              last_error_code = 'provider_rejected', updated_at = ?
            WHERE id = ? AND status = 'label_claimed' AND lease_token_hash = ?`,
          )
          .bind(input.now, shipment.id, leaseTokenHash)
          .run();
        throw new FulfillmentError("INVALID_TRANSITION", "The label was rejected.");
      }
      throw new FulfillmentError(
        "PROVIDER_OUTCOME_UNKNOWN",
        "The label outcome is unknown; retry with the same key after the lease.",
        { cause: error },
      );
    }
    assertFulfillmentIdentifier(receipt.providerCode, "providerCode");
    assertFulfillmentIdentifier(receipt.providerShipmentReference, "providerShipmentReference");
    assertFulfillmentIdentifier(receipt.trackingReference, "trackingReference");
    assertFulfillmentFingerprint(receipt.receiptFingerprint, "receiptFingerprint");
    if (
      receipt.shipmentId !== shipment.id ||
      receipt.orderId !== shipment.order_id ||
      receipt.idempotencyKey !== shipment.idempotency_key
    ) {
      throw new FulfillmentError(
        "PROVIDER_RECEIPT_MISMATCH",
        "The label provider receipt does not match the claim.",
      );
    }
    const zoneProof = await this.#database
      .prepare(
        `SELECT configuration.zone
        FROM shipments AS shipment
        INNER JOIN shipping_quotes AS quote ON quote.id = shipment.shipping_quote_id
        INNER JOIN shipping_zone_configurations AS configuration
          ON configuration.id = quote.configuration_id
        WHERE shipment.id = ?`,
      )
      .bind(shipment.id)
      .first<{ zone: string }>();
    if (!zoneProof || !["EU", "UK", "US", "CA", "GCC"].includes(zoneProof.zone)) {
      throw new FulfillmentError(
        "PROVIDER_RECEIPT_MISMATCH",
        "The shipment zone proof is missing.",
      );
    }
    const international = zoneProof.zone !== "EU";
    const transitionOrderToPreparing =
      this.#ports.transitionOrderToPreparingAfterLabel !== false;
    if (international) {
      assertFulfillmentIdentifier(
        receipt.customsDocumentReference,
        "customsDocumentReference",
      );
    } else if (receipt.customsDocumentReference !== undefined) {
      throw new FulfillmentError(
        "PROVIDER_RECEIPT_MISMATCH",
        "An EU label receipt cannot carry a customs declaration.",
      );
    }
    const customsFingerprint = international
      ? await sha256Hex(JSON.stringify([
        shipment.id,
        receipt.providerCode,
        receipt.customsDocumentReference,
      ]))
      : null;
    try {
      const results = await this.#database.batch([
        this.#database
          .prepare(
            `UPDATE shipments SET status = 'label_ready',
              provider_shipment_reference = ?, tracking_provider_code = ?,
              tracking_reference = ?,
              provider_receipt_fingerprint = ?, lease_token_hash = NULL,
              leased_at = NULL, lease_expires_at = NULL, label_created_at = ?,
              last_error_code = NULL, updated_at = ?
            WHERE id = ? AND status = 'label_claimed' AND lease_token_hash = ?`,
          )
          .bind(
            receipt.providerShipmentReference,
            receipt.providerCode,
            receipt.trackingReference,
            receipt.receiptFingerprint,
            input.now,
            input.now,
            shipment.id,
            leaseTokenHash,
          ),
        this.#database
          .prepare(
            `INSERT OR IGNORE INTO customs_records (
              id, shipment_id, status, manual_reference, record_fingerprint,
              ready_at, created_at, updated_at
            )
            SELECT 'customs_' || shipment.id, shipment.id, 'ready', ?, ?, ?, ?, ?
            FROM shipments AS shipment
            INNER JOIN shipping_quotes AS quote ON quote.id = shipment.shipping_quote_id
            INNER JOIN shipping_zone_configurations AS configuration
              ON configuration.id = quote.configuration_id
            WHERE shipment.id = ? AND configuration.zone <> 'EU'`,
          )
          .bind(
            receipt.customsDocumentReference ?? null,
            customsFingerprint,
            input.now,
            input.now,
            input.now,
            shipment.id,
          ),
        this.#database
          .prepare(
            `UPDATE orders SET status = 'preparing', updated_at = ?
            WHERE ? = 1 AND id = ? AND status = 'paid'
              AND EXISTS (
                SELECT 1 FROM shipments
                WHERE shipments.order_id = orders.id
                  AND shipments.id = ? AND shipments.status = 'label_ready'
              )`,
          )
          .bind(
            input.now,
            transitionOrderToPreparing ? 1 : 0,
            shipment.order_id,
            shipment.id,
          ),
        this.#database
          .prepare(
            `INSERT INTO audit_log (
              id, actor_type, actor_id, action, entity_type, entity_id,
              idempotency_key, metadata_json, created_at
            ) VALUES (?, 'system', NULL, 'shipment_label_ready', 'shipment', ?, ?, ?, ?)`
          )
          .bind(
            `audit_label_${shipment.id}`,
            shipment.id,
            `audit:shipment_label_ready:${shipment.id}`,
            JSON.stringify({
              orderId: shipment.order_id,
              status: transitionOrderToPreparing ? "preparing" : "paid",
            }),
            input.now,
          ),
        this.#database
          .prepare(
            `INSERT INTO audit_log (
              id, actor_type, actor_id, action, entity_type, entity_id,
              idempotency_key, metadata_json, created_at
            )
            SELECT ?, 'system', NULL, 'customs_ready', 'shipment', ?, ?, ?, ?
            WHERE ? = 1`,
          )
          .bind(
            `audit_customs_ready_${shipment.id}`,
            shipment.id,
            `audit:customs_ready:${shipment.id}`,
            JSON.stringify({
              status: "ready",
              source: receipt.providerCode,
              document: receipt.customsDocumentReference ?? null,
            }),
            input.now,
            international ? 1 : 0,
          ),
      ]);
      if (changed(results[0]) !== 1) {
        throw new FulfillmentError("LEASE_UNAVAILABLE", "The shipment lease was lost.");
      }
      if (
        changed(results[2]) !== (transitionOrderToPreparing ? 1 : 0) ||
        changed(results[3]) !== 1 ||
        changed(results[1]) !== (international ? 1 : 0) ||
        changed(results[4]) !== (international ? 1 : 0)
      ) {
        throw new FulfillmentError(
          "PERSISTENCE_FAILURE",
          "The preparing-order evidence was not written atomically.",
        );
      }
    } catch (error) {
      mapDatabaseError(error);
    }
    const completed = await this.#getShipment(shipment.id);
    if (!completed || completed.status !== "label_ready") {
      throw new FulfillmentError("PERSISTENCE_FAILURE", "The label was not persisted.");
    }
    return completed;
  }

  async markCustomsReady(input: Readonly<{
    shipmentId: string;
    manualReference: string;
    actor: D1MutationActor;
    now: string;
  }>): Promise<void> {
    assertFulfillmentIdentifier(input.shipmentId, "shipmentId");
    assertFulfillmentIdentifier(input.manualReference, "manualReference");
    assertFulfillmentTimestamp(input.now, "now");
    const actor = await resolveD1MutationActor(this.#database, input.actor, input.now);
    if (!actor || actor.kind !== "admin") {
      throw new FulfillmentError("SESSION_REQUIRED", "An administrator session is required.");
    }
    const fingerprint = await sha256Hex(
      JSON.stringify([input.shipmentId, input.manualReference]),
    );
    const existing = await this.#database
      .prepare(
        `SELECT status, manual_reference, record_fingerprint
        FROM customs_records WHERE shipment_id = ?`,
      )
      .bind(input.shipmentId)
      .first<{
        status: string;
        manual_reference: string | null;
        record_fingerprint: string | null;
      }>();
    if (existing?.status === "ready") {
      if (
        existing.manual_reference !== input.manualReference ||
        existing.record_fingerprint !== fingerprint
      ) {
        throw new FulfillmentError("INVALID_TRANSITION", "The customs record is immutable.");
      }
      await this.#assertCustomsReadyAudit(input.shipmentId);
      return;
    }
    try {
      await this.#database.batch([
        this.#database
          .prepare(
            `INSERT INTO customs_records (
              id, shipment_id, status, manual_reference, record_fingerprint,
              ready_at, created_at, updated_at
            ) VALUES (?, ?, 'ready', ?, ?, ?, ?, ?)
            ON CONFLICT(shipment_id) DO UPDATE SET status = 'ready',
              manual_reference = excluded.manual_reference,
              record_fingerprint = excluded.record_fingerprint,
              ready_at = excluded.ready_at, updated_at = excluded.updated_at
            WHERE customs_records.status = 'pending'`,
          )
          .bind(
            `customs_${input.shipmentId}`,
            input.shipmentId,
            input.manualReference,
            fingerprint,
            input.now,
            input.now,
            input.now,
          ),
        this.#database
          .prepare(
            `INSERT INTO audit_log (
              id, actor_type, actor_id, action, entity_type, entity_id,
              idempotency_key, metadata_json, created_at
            ) VALUES (?, 'admin', ?, 'customs_ready', 'shipment', ?, ?, ?, ?)`,
          )
          .bind(
            `audit_customs_ready_${input.shipmentId}`,
            actor.administratorId,
            input.shipmentId,
            `audit:customs_ready:${input.shipmentId}`,
            JSON.stringify({ status: "ready" }),
            input.now,
          ),
      ]);
    } catch (error) {
      const raced = await this.#database
        .prepare(
          `SELECT status, manual_reference, record_fingerprint
          FROM customs_records WHERE shipment_id = ?`,
        )
        .bind(input.shipmentId)
        .first<{
          status: string;
          manual_reference: string | null;
          record_fingerprint: string | null;
        }>();
      if (
        raced?.status === "ready" &&
        raced.manual_reference === input.manualReference &&
        raced.record_fingerprint === fingerprint
      ) {
        await this.#assertCustomsReadyAudit(input.shipmentId);
        return;
      }
      mapDatabaseError(error);
    }
    const ready = await this.#database
      .prepare(
        `SELECT status, manual_reference, record_fingerprint
        FROM customs_records WHERE shipment_id = ?`,
      )
      .bind(input.shipmentId)
      .first<{
        status: string;
        manual_reference: string | null;
        record_fingerprint: string | null;
      }>();
    if (
      ready?.status !== "ready" ||
      ready.manual_reference !== input.manualReference ||
      ready.record_fingerprint !== fingerprint
    ) {
      throw new FulfillmentError("INVALID_TRANSITION", "The customs record is immutable.");
    }
    await this.#assertCustomsReadyAudit(input.shipmentId);
  }

  async handoverShipment(input: Readonly<{
    shipmentId: string;
    eventId: string;
    actor: D1MutationActor;
    locale: "fr" | "en";
    now: string;
  }>): Promise<{ created: boolean }> {
    assertFulfillmentIdentifier(input.shipmentId, "shipmentId");
    assertFulfillmentIdentifier(input.eventId, "eventId");
    assertEmailLocale(input.locale);
    assertFulfillmentTimestamp(input.now, "now");
    const actor = await resolveD1MutationActor(this.#database, input.actor, input.now);
    if (!actor || actor.kind !== "admin") {
      throw new FulfillmentError("SESSION_REQUIRED", "An administrator session is required.");
    }
    const shipment = await this.#database
      .prepare(
        `SELECT shipment.id, shipment.order_id, shipment.status,
          shipment.tracking_reference, customer_order.email,
          customer_order.order_number, configuration.zone,
          customs.status AS customs_status
        FROM shipments AS shipment
        INNER JOIN orders AS customer_order ON customer_order.id = shipment.order_id
        INNER JOIN shipping_quotes AS quote ON quote.id = shipment.shipping_quote_id
        INNER JOIN shipping_zone_configurations AS configuration
          ON configuration.id = quote.configuration_id
        LEFT JOIN customs_records AS customs ON customs.shipment_id = shipment.id
        WHERE shipment.id = ?`,
      )
      .bind(input.shipmentId)
      .first<{
        id: string;
        order_id: string;
        status: string;
        tracking_reference: string | null;
        email: string;
        order_number: string;
        zone: string;
        customs_status: string | null;
      }>();
    if (!shipment || !shipment.tracking_reference) {
      throw new FulfillmentError("INVALID_TRANSITION", "A ready label is required.");
    }
    if (shipment.zone !== "EU" && shipment.customs_status !== "ready") {
      throw new FulfillmentError("CUSTOMS_NOT_READY", "Customs must be ready before handover.");
    }
    const existingEvent = await this.#trackingEvent("internal_handover", input.eventId);
    if (existingEvent) {
      if (
        existingEvent.shipment_id === shipment.id &&
        existingEvent.event_type === "handed_over"
      ) {
        await this.#assertHandoverArtifacts(shipment.id, shipment.order_id, input.eventId);
        return Object.freeze({ created: false });
      }
      throw new FulfillmentError(
        "TRACKING_EVENT_CONFLICT",
        "The handover event key belongs to another shipment.",
      );
    }
    const existingHandover = await this.#database
      .prepare(
        `SELECT id, event_fingerprint FROM shipment_tracking_events
        WHERE shipment_id = ? AND event_type = 'handed_over' LIMIT 1`,
      )
      .bind(shipment.id)
      .first<{ id: string; event_fingerprint: string }>();
    if (existingHandover) {
      throw new FulfillmentError(
        "TRACKING_EVENT_CONFLICT",
        "A different handover event already exists.",
      );
    }
    if (shipment.status !== "label_ready") {
      throw new FulfillmentError("INVALID_TRANSITION", "A ready label is required.");
    }
    const eventFingerprint = await sha256Hex(
      JSON.stringify([
        shipment.id,
        shipment.tracking_reference,
        "handed_over",
        input.now,
      ]),
    );
    const shipmentEmail = await buildTransactionalEmail({
      kind: "shipment-confirmation",
      eventId: input.eventId,
      locale: input.locale,
      recipientEmail: shipment.email,
      orderNumber: shipment.order_number,
      trackingReference: shipment.tracking_reference,
    });
    const payloadJson = JSON.stringify({
      subject: shipmentEmail.subject,
      text: shipmentEmail.text,
    });
    try {
      const results = await this.#database.batch([
        this.#database
          .prepare(
            `INSERT INTO shipment_tracking_events (
              id, shipment_id, provider_code, provider_event_id, event_type,
              tracking_reference, event_fingerprint, occurred_at, received_at
            ) VALUES (?, ?, 'internal_handover', ?, 'handed_over', ?, ?, ?, ?)`,
          )
          .bind(
            input.eventId,
            shipment.id,
            input.eventId,
            shipment.tracking_reference,
            eventFingerprint,
            input.now,
            input.now,
          ),
        this.#database
          .prepare(
            `UPDATE shipments SET status = 'handed_over', handed_over_at = ?,
              updated_at = ? WHERE id = ? AND status = 'label_ready'`,
          )
          .bind(input.now, input.now, shipment.id),
        this.#database
          .prepare(
            `UPDATE orders SET status = 'shipped', updated_at = ?
            WHERE id = ? AND status = 'preparing'`,
          )
          .bind(input.now, shipment.order_id),
        this.#database
          .prepare(
            `INSERT INTO email_outbox (
              id, kind, transaction_intent, source_event_id, recipient_email,
              order_id, locale, template_version, payload_json, status,
              attempts, max_attempts, next_attempt_at, idempotency_key,
              provider_idempotency_key, created_at, updated_at
            ) VALUES (?, 'shipment_confirmation', 'shipment_created', ?, ?, ?, ?,
              'shipment-handover-v1', ?, 'pending', 0, 5, ?, ?, ?, ?, ?)`,
          )
          .bind(
            `outbox_${input.eventId}`,
            input.eventId,
            shipment.email,
            shipment.order_id,
            input.locale,
            payloadJson,
            input.now,
            `email:shipment_handover:${input.eventId}`,
            `shipment_confirmation:${input.eventId}`,
            input.now,
            input.now,
          ),
        this.#database
          .prepare(
            `INSERT INTO audit_log (
              id, actor_type, actor_id, action, entity_type, entity_id,
              idempotency_key, metadata_json, created_at
            ) VALUES (?, 'admin', ?, 'shipment_handed_over', 'shipment', ?, ?, ?, ?)`,
          )
          .bind(
            `audit_${input.eventId}`,
            actor.administratorId,
            shipment.id,
            `audit:shipment_handover:${input.eventId}`,
            JSON.stringify({ eventId: input.eventId }),
            input.now,
          ),
      ]);
      if (results.some((result) => changed(result) !== 1)) {
        throw new FulfillmentError(
          "PERSISTENCE_FAILURE",
          "The handover evidence was not written atomically.",
        );
      }
      await this.#assertHandoverArtifacts(shipment.id, shipment.order_id, input.eventId);
      return Object.freeze({ created: true });
    } catch (error) {
      const replay = await this.#trackingEvent("internal_handover", input.eventId);
      if (
        replay?.shipment_id === shipment.id &&
        replay.event_type === "handed_over"
      ) {
        await this.#assertHandoverArtifacts(shipment.id, shipment.order_id, input.eventId);
        return Object.freeze({ created: false });
      }
      mapDatabaseError(error);
    }
  }

  async recordTrackingEvent(
    candidate: TrackingEventCandidate,
    receivedAt: string,
  ): Promise<{ created: boolean }> {
    const provider = this.#ports.tracking;
    if (!provider) {
      throw new FulfillmentError(
        "DEPENDENCY_UNAVAILABLE",
        "The tracking provider is not configured.",
      );
    }
    assertFulfillmentIdentifier(candidate.shipmentId, "shipmentId");
    assertFulfillmentIdentifier(candidate.providerCode, "providerCode");
    assertFulfillmentIdentifier(candidate.providerEventId, "providerEventId");
    assertFulfillmentIdentifier(candidate.trackingReference, "trackingReference");
    assertFulfillmentFingerprint(candidate.eventFingerprint, "eventFingerprint");
    assertFulfillmentTimestamp(candidate.occurredAt, "occurredAt");
    assertFulfillmentTimestamp(receivedAt, "receivedAt");
    if (
      !["in_transit", "out_for_delivery", "delivered", "exception", "returned"]
        .includes(candidate.eventType)
    ) {
      throw new FulfillmentError("INVALID_INPUT", "eventType is invalid.");
    }
    const verified = await provider.verifyEvent(Object.freeze({ ...candidate, receivedAt }));
    assertVerifiedCarrierEvent(verified);
    assertFulfillmentFingerprint(verified.receiptFingerprint, "receiptFingerprint");
    assertFulfillmentTimestamp(verified.verifiedAt, "verifiedAt");
    if (
      verified.shipmentId !== candidate.shipmentId ||
      verified.providerCode !== candidate.providerCode ||
      verified.providerEventId !== candidate.providerEventId ||
      verified.trackingReference !== candidate.trackingReference ||
      verified.eventType !== candidate.eventType ||
      verified.eventFingerprint !== candidate.eventFingerprint ||
      verified.occurredAt !== candidate.occurredAt ||
      verified.receivedAt !== receivedAt ||
      verified.verifiedAt < receivedAt ||
      !["test_adapter", "carrier_signature"].includes(verified.verificationMethod)
    ) {
      throw new FulfillmentError(
        "PROVIDER_RECEIPT_MISMATCH",
        "The verified tracking event differs from the candidate.",
      );
    }
    const receiptId = `carrier_receipt_${await sha256Hex(
      `${candidate.providerCode}\u0000${candidate.providerEventId}`,
    )}`;
    const shipment = await this.#getShipment(candidate.shipmentId);
    if (
      !shipment ||
      shipment.tracking_provider_code !== candidate.providerCode ||
      shipment.tracking_reference !== candidate.trackingReference
    ) {
      throw new FulfillmentError("TRACKING_EVENT_CONFLICT", "The tracking event is crossed.");
    }
    const existing = await this.#trackingEvent(candidate.providerCode, candidate.providerEventId);
    if (existing) {
      const receipt = await this.#carrierReceipt(receiptId);
      if (
        existing.shipment_id !== candidate.shipmentId ||
        existing.carrier_receipt_id !== receiptId ||
        existing.event_type !== candidate.eventType ||
        existing.tracking_reference !== candidate.trackingReference ||
        existing.event_fingerprint !== candidate.eventFingerprint ||
        existing.occurred_at !== candidate.occurredAt ||
        !persistedCarrierReceiptMatchesReplay(receipt, receiptId, verified)
      ) {
        throw new FulfillmentError("TRACKING_EVENT_CONFLICT", "The tracking event is divergent.");
      }
      return Object.freeze({ created: false });
    }
    const nextStatus = candidate.eventType === "delivered"
      ? "delivered"
      : ["in_transit", "out_for_delivery"].includes(candidate.eventType)
        ? "in_transit"
        : null;
    const eventId = `tracking_${await sha256Hex(
      `${candidate.providerCode}\u0000${candidate.providerEventId}`,
    )}`;
    try {
      const statements = [
        this.#database
          .prepare(
            `INSERT OR IGNORE INTO carrier_event_receipts (
              id, shipment_id, provider_code, provider_event_id,
              tracking_reference, event_type, event_fingerprint,
              receipt_fingerprint, verification_method, occurred_at,
              received_at, verified_at, status, consumed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', NULL)`,
          )
          .bind(
            receiptId,
            verified.shipmentId,
            verified.providerCode,
            verified.providerEventId,
            verified.trackingReference,
            verified.eventType,
            verified.eventFingerprint,
            verified.receiptFingerprint,
            verified.verificationMethod,
            verified.occurredAt,
            verified.receivedAt,
            verified.verifiedAt,
          ),
        this.#database
          .prepare(
            `INSERT OR IGNORE INTO shipment_tracking_events (
              id, shipment_id, provider_code, provider_event_id,
              carrier_receipt_id, event_type, tracking_reference,
              event_fingerprint, occurred_at, received_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            eventId,
            candidate.shipmentId,
            candidate.providerCode,
            candidate.providerEventId,
            receiptId,
            candidate.eventType,
            candidate.trackingReference,
            candidate.eventFingerprint,
            candidate.occurredAt,
            receivedAt,
          ),
      ];
      if (nextStatus === "delivered") {
        statements.push(
          this.#database
            .prepare(
              `UPDATE shipments SET status = 'delivered', delivered_at = ?,
                updated_at = ? WHERE id = ? AND status IN ('handed_over', 'in_transit')
                AND EXISTS (
                  SELECT 1 FROM shipment_tracking_events AS event
                  INNER JOIN carrier_event_receipts AS receipt
                    ON receipt.id = event.carrier_receipt_id
                  WHERE event.id = ? AND event.shipment_id = ?
                    AND event.provider_code = ? AND event.provider_event_id = ?
                    AND event.carrier_receipt_id = ? AND event.event_type = ?
                    AND event.tracking_reference = ? AND event.event_fingerprint = ?
                    AND event.occurred_at = ? AND event.received_at = ?
                    AND receipt.status = 'consumed'
                )`,
            )
            .bind(
              candidate.occurredAt,
              receivedAt,
              candidate.shipmentId,
              eventId,
              candidate.shipmentId,
              candidate.providerCode,
              candidate.providerEventId,
              receiptId,
              candidate.eventType,
              candidate.trackingReference,
              candidate.eventFingerprint,
              candidate.occurredAt,
              receivedAt,
            ),
        );
      } else if (nextStatus === "in_transit") {
        statements.push(
          this.#database
            .prepare(
              `UPDATE shipments SET status = 'in_transit', updated_at = ?
              WHERE id = ? AND status = 'handed_over'
                AND EXISTS (
                  SELECT 1 FROM shipment_tracking_events AS event
                  INNER JOIN carrier_event_receipts AS receipt
                    ON receipt.id = event.carrier_receipt_id
                  WHERE event.id = ? AND event.shipment_id = ?
                    AND event.provider_code = ? AND event.provider_event_id = ?
                    AND event.carrier_receipt_id = ? AND event.event_type = ?
                    AND event.tracking_reference = ? AND event.event_fingerprint = ?
                    AND event.occurred_at = ? AND event.received_at = ?
                    AND receipt.status = 'consumed'
                )`,
            )
            .bind(
              receivedAt,
              candidate.shipmentId,
              eventId,
              candidate.shipmentId,
              candidate.providerCode,
              candidate.providerEventId,
              receiptId,
              candidate.eventType,
              candidate.trackingReference,
              candidate.eventFingerprint,
              candidate.occurredAt,
              receivedAt,
            ),
        );
      }
      const results = await this.#database.batch(statements);
      const persisted = await this.#trackingEvent(
        candidate.providerCode,
        candidate.providerEventId,
      );
      const persistedReceipt = await this.#carrierReceipt(receiptId);
      if (
        !persisted ||
        persisted.id !== eventId ||
        persisted.shipment_id !== candidate.shipmentId ||
        persisted.carrier_receipt_id !== receiptId ||
        persisted.event_type !== candidate.eventType ||
        persisted.tracking_reference !== candidate.trackingReference ||
        persisted.event_fingerprint !== candidate.eventFingerprint ||
        persisted.occurred_at !== candidate.occurredAt ||
        persisted.received_at !== receivedAt ||
        !carrierReceiptMatches(persistedReceipt, receiptId, verified, "consumed")
      ) {
        throw new FulfillmentError(
          "TRACKING_EVENT_CONFLICT",
          "The tracking event conflicts with persisted evidence.",
        );
      }
      return Object.freeze({ created: changed(results[1]) === 1 });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  /**
   * Convert the first cryptographically verified carrier scan into the
   * physical-handover transition when no operator handover was recorded.
   * This never advances on label creation alone: only a registered production
   * carrier event can cross this boundary.
   */
  async handoverShipmentFromVerifiedCarrierEvent(input: Readonly<{
    event: VerifiedCarrierEvent;
    locale: "fr" | "en";
  }>): Promise<{ created: boolean }> {
    assertVerifiedCarrierEvent(input.event);
    assertEmailLocale(input.locale);
    if (
      input.event.providerCode !== "sendcloud" ||
      input.event.verificationMethod !== "carrier_signature" ||
      !["in_transit", "out_for_delivery", "delivered"].includes(input.event.eventType)
    ) {
      throw new FulfillmentError(
        "TRACKING_VERIFICATION_REQUIRED",
        "A verified carrier possession event is required.",
      );
    }
    const shipment = await this.#database.prepare(
      `SELECT shipment.id, shipment.order_id, shipment.status,
        shipment.tracking_provider_code, shipment.tracking_reference,
        customer_order.email, customer_order.order_number,
        configuration.zone, customs.status AS customs_status
      FROM shipments AS shipment
      INNER JOIN orders AS customer_order ON customer_order.id = shipment.order_id
      INNER JOIN shipping_quotes AS quote ON quote.id = shipment.shipping_quote_id
      INNER JOIN shipping_zone_configurations AS configuration
        ON configuration.id = quote.configuration_id
      LEFT JOIN customs_records AS customs ON customs.shipment_id = shipment.id
      WHERE shipment.id = ?`,
    ).bind(input.event.shipmentId).first<{
      id: string;
      order_id: string;
      status: string;
      tracking_provider_code: string | null;
      tracking_reference: string | null;
      email: string;
      order_number: string;
      zone: string;
      customs_status: string | null;
    }>();
    if (!shipment || shipment.tracking_provider_code !== input.event.providerCode ||
      shipment.tracking_reference !== input.event.trackingReference) {
      throw new FulfillmentError(
        "TRACKING_EVENT_CONFLICT",
        "The verified carrier event is crossed with another shipment.",
      );
    }
    if (["handed_over", "in_transit", "delivered"].includes(shipment.status)) {
      return Object.freeze({ created: false });
    }
    if (shipment.status !== "label_ready" ||
      (shipment.zone !== "EU" && shipment.customs_status !== "ready")) {
      throw new FulfillmentError(
        shipment.zone !== "EU" && shipment.customs_status !== "ready"
          ? "CUSTOMS_NOT_READY"
          : "INVALID_TRANSITION",
        "The shipment is not ready for carrier possession.",
      );
    }
    const handoverHash = await sha256Hex(
      `carrier-handover\0${input.event.providerCode}\0${input.event.providerEventId}`,
    );
    const handoverEventId = `handover_${handoverHash}`;
    const handoverFingerprint = await sha256Hex(JSON.stringify([
      shipment.id,
      shipment.tracking_reference,
      "handed_over",
      input.event.occurredAt,
      input.event.providerEventId,
    ]));
    const shipmentEmail = await buildTransactionalEmail({
      kind: "shipment-confirmation",
      eventId: handoverEventId,
      locale: input.locale,
      recipientEmail: shipment.email,
      orderNumber: shipment.order_number,
      trackingReference: shipment.tracking_reference,
    });
    const payloadJson = JSON.stringify({
      subject: shipmentEmail.subject,
      text: shipmentEmail.text,
    });
    try {
      const results = await this.#database.batch([
        this.#database.prepare(
          `INSERT INTO shipment_tracking_events (
            id, shipment_id, provider_code, provider_event_id, event_type,
            tracking_reference, event_fingerprint, occurred_at, received_at
          ) VALUES (?, ?, 'internal_handover', ?, 'handed_over', ?, ?, ?, ?)`,
        ).bind(
          handoverEventId,
          shipment.id,
          handoverEventId,
          shipment.tracking_reference,
          handoverFingerprint,
          input.event.occurredAt,
          input.event.receivedAt,
        ),
        this.#database.prepare(
          `UPDATE shipments SET status='handed_over', handed_over_at=?, updated_at=?
          WHERE id=? AND status='label_ready'`,
        ).bind(
          input.event.occurredAt,
          input.event.receivedAt,
          shipment.id,
        ),
        this.#database.prepare(
          `UPDATE orders SET status='shipped', updated_at=?
          WHERE id=? AND status='preparing'`,
        ).bind(input.event.receivedAt, shipment.order_id),
        this.#database.prepare(
          `INSERT INTO email_outbox (
            id, kind, transaction_intent, source_event_id, recipient_email,
            order_id, locale, template_version, payload_json, status,
            attempts, max_attempts, next_attempt_at, idempotency_key,
            provider_idempotency_key, created_at, updated_at
          ) VALUES (?, 'shipment_confirmation', 'shipment_created', ?, ?, ?, ?,
            'shipment-handover-v1', ?, 'pending', 0, 5, ?, ?, ?, ?, ?)`,
        ).bind(
          `outbox_${handoverEventId}`,
          handoverEventId,
          shipment.email,
          shipment.order_id,
          input.locale,
          payloadJson,
          input.event.receivedAt,
          `email:shipment_handover:${handoverEventId}`,
          `shipment_confirmation:${handoverEventId}`,
          input.event.receivedAt,
          input.event.receivedAt,
        ),
        this.#database.prepare(
          `INSERT INTO audit_log (
            id, actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key, metadata_json, created_at
          ) VALUES (?, 'system', NULL, 'shipment_handed_over', 'shipment', ?, ?, ?, ?)`,
        ).bind(
          `audit_${handoverEventId}`,
          shipment.id,
          `audit:shipment_handover:${handoverEventId}`,
          JSON.stringify({
            eventId: handoverEventId,
            evidence: "sendcloud_carrier_signature",
            providerEventId: input.event.providerEventId,
          }),
          input.event.receivedAt,
        ),
      ]);
      if (results.some((result) => changed(result) !== 1)) {
        throw new FulfillmentError(
          "PERSISTENCE_FAILURE",
          "The carrier-proven handover was not written atomically.",
        );
      }
      await this.#assertHandoverArtifacts(shipment.id, shipment.order_id, handoverEventId);
      return Object.freeze({ created: true });
    } catch (error) {
      const replay = await this.#trackingEvent("internal_handover", handoverEventId);
      if (replay?.shipment_id === shipment.id && replay.event_type === "handed_over") {
        await this.#assertHandoverArtifacts(shipment.id, shipment.order_id, handoverEventId);
        return Object.freeze({ created: false });
      }
      mapDatabaseError(error);
    }
  }

  async createReturnRequest(input: Readonly<{
    id: string;
    orderId: string;
    kind: "return" | "withdrawal";
    lines: readonly ReturnDeclarationLine[];
    actor: D1MutationActor;
    locale: "fr" | "en";
    now: string;
  }>): Promise<ReturnRequestRow> {
    assertFulfillmentIdentifier(input.id, "id");
    assertFulfillmentIdentifier(input.orderId, "orderId");
    assertEmailLocale(input.locale);
    assertFulfillmentTimestamp(input.now, "now");
    if (input.kind !== "return" && input.kind !== "withdrawal") {
      throw new FulfillmentError("INVALID_INPUT", "kind is invalid.");
    }
    const actor = await resolveD1MutationActor(this.#database, input.actor, input.now);
    if (!actor) {
      throw new FulfillmentError("SESSION_REQUIRED", "A verified session is required.");
    }
    const order = await this.#database
      .prepare(
        `SELECT id, customer_id, email, order_number FROM orders WHERE id = ?`,
      )
      .bind(input.orderId)
      .first<{
        id: string;
        customer_id: string | null;
        email: string;
        order_number: string;
      }>();
    const ownsOrder = order && (
      (actor.kind === "guest" && actor.orderId === order.id && order.customer_id === null) ||
      (actor.kind === "customer" && actor.customerId === order.customer_id) ||
      actor.kind === "admin"
    );
    if (!ownsOrder || !order) {
      throw new FulfillmentError("SESSION_REQUIRED", "A verified session is required.");
    }
    const declarationFingerprint = await fingerprintReturnDeclaration(
      input.orderId,
      input.kind,
      input.lines,
    );
    const orderLines = await this.#database
      .prepare(
        `SELECT id, quantity FROM order_lines WHERE order_id = ?`,
      )
      .bind(input.orderId)
      .all<{ id: string; quantity: number }>();
    const quantities = new Map(orderLines.results.map((line) => [line.id, line.quantity]));
    for (const line of input.lines) {
      const purchased = quantities.get(line.orderLineId);
      if (purchased === undefined || line.quantity > purchased) {
        throw new FulfillmentError(
          "RETURN_QUANTITY_EXCEEDED",
          "The requested return quantity exceeds the order.",
        );
      }
    }
    const source = actorColumns(actor);
    const lineSpecs = await Promise.all(input.lines.map(async (line) => Object.freeze({
      id: `return_line_${await sha256Hex(`${input.id}\u0000${line.orderLineId}`)}`,
      orderLineId: line.orderLineId,
      quantity: line.quantity,
    })));
    const expectedReturn = Object.freeze({
      orderId: input.orderId,
      kind: input.kind,
      source,
      declarationFingerprint,
      lines: lineSpecs,
      orderEmail: order.email,
      locale: input.locale,
    });
    const existingRequest = await this.#getReturnRequest(input.id);
    if (existingRequest) {
      await this.#assertReturnRequestArtifacts(existingRequest, expectedReturn);
      return existingRequest;
    }
    const acknowledgement = input.kind === "withdrawal"
      ? {
          subject: input.locale === "fr" ? "Demande de rétractation reçue" : "Withdrawal request received",
          text: input.locale === "fr"
            ? `Nous avons reçu votre demande de rétractation pour la commande ${order.order_number}.`
            : `We received your withdrawal request for order ${order.order_number}.`,
        }
      : {
          subject: input.locale === "fr" ? "Demande de retour reçue" : "Return request received",
          text: input.locale === "fr"
            ? `Nous avons reçu votre demande de retour pour la commande ${order.order_number}.`
            : `We received your return request for order ${order.order_number}.`,
        };
    const statements = [
      this.#database
        .prepare(
          `INSERT OR IGNORE INTO return_requests (
            id, order_id, kind, source, actor_customer_id,
            guest_order_session_id, actor_admin_id, declaration_fingerprint,
            declared_line_count, status, resolution, requested_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', 'pending', ?, ?, ?)`,
        )
        .bind(
          input.id,
          input.orderId,
          input.kind,
          source.source,
          source.customerId,
          source.guestSessionId,
          source.adminId,
          declarationFingerprint,
          lineSpecs.length,
          input.now,
          input.now,
          input.now,
        ),
      ...lineSpecs.map((line) =>
        this.#database
          .prepare(
            `INSERT INTO return_lines (
              id, return_request_id, order_line_id, requested_quantity,
              received_quantity, sellable_quantity, non_sellable_quantity,
              restocked_quantity, inspection_result, created_at, updated_at
            )
            SELECT ?, request.id, ?, ?, 0, 0, 0, 0, 'pending', ?, ?
            FROM return_requests AS request
            WHERE request.id = ? AND request.order_id = ? AND request.kind = ?
              AND request.source = ? AND request.actor_customer_id IS ?
              AND request.guest_order_session_id IS ? AND request.actor_admin_id IS ?
              AND request.declaration_fingerprint = ?
              AND NOT EXISTS (
                SELECT 1 FROM return_lines AS existing
                WHERE existing.id = ? OR (
                  existing.return_request_id = request.id
                  AND existing.order_line_id = ?
                )
              )`,
          )
          .bind(
            line.id,
            line.orderLineId,
            line.quantity,
            input.now,
            input.now,
            input.id,
            input.orderId,
            input.kind,
            source.source,
            source.customerId,
            source.guestSessionId,
            source.adminId,
            declarationFingerprint,
            line.id,
            line.orderLineId,
          ),
      ),
      this.#database
        .prepare(
          `INSERT INTO email_outbox (
            id, kind, transaction_intent, source_event_id, recipient_email,
            order_id, locale, template_version, payload_json, status,
            attempts, max_attempts, next_attempt_at, idempotency_key,
            provider_idempotency_key, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 5, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `outbox_return_${input.id}`,
          input.kind === "return" ? "return_acknowledgement" : "withdrawal_acknowledgement",
          input.kind === "return" ? "return_received" : "withdrawal_received",
          input.id,
          order.email,
          input.orderId,
          input.locale,
          input.kind === "return" ? "return-request-v1" : "withdrawal-request-v1",
          JSON.stringify(acknowledgement),
          input.now,
          `email:${input.kind === "return" ? "return_received" : "withdrawal_received"}:${input.id}`,
          `${input.kind === "return" ? "return_acknowledgement" : "withdrawal_acknowledgement"}:${input.id}`,
          input.now,
          input.now,
        ),
      this.#database
        .prepare(
          `INSERT INTO audit_log (
            id, actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key, metadata_json, created_at
          ) VALUES (?, ?, ?, 'return_request_received', 'return_request', ?, ?, ?, ?)`,
        )
        .bind(
          `audit_return_${input.id}`,
          source.source === "guest" ? "customer" : source.source,
          source.customerId ?? source.adminId,
          input.id,
          `audit:return_received:${input.id}`,
          JSON.stringify({ kind: input.kind, lineCount: input.lines.length }),
          input.now,
        ),
    ];
    try {
      await this.#database.batch(statements);
    } catch (error) {
      const raced = await this.#getReturnRequest(input.id);
      if (raced) {
        await this.#assertReturnRequestArtifacts(raced, expectedReturn);
        return raced;
      }
      mapDatabaseError(error);
    }
    const request = await this.#getReturnRequest(input.id);
    if (!request) throw new FulfillmentError("PERSISTENCE_FAILURE", "Return request missing.");
    await this.#assertReturnRequestArtifacts(request, expectedReturn);
    return request;
  }

  async approveReturnRequest(input: Readonly<{
    requestId: string;
    actor: D1MutationActor;
    now: string;
  }>): Promise<ReturnRequestRow> {
    assertFulfillmentIdentifier(input.requestId, "requestId");
    assertFulfillmentTimestamp(input.now, "now");
    const actor = await resolveD1MutationActor(this.#database, input.actor, input.now);
    if (!actor || actor.kind !== "admin" || !canCreateRefund(actor.role)) {
      throw new FulfillmentError(
        "SESSION_REQUIRED",
        "An authorized owner session is required.",
      );
    }
    const current = await this.#getReturnRequest(input.requestId);
    if (!current) {
      throw new FulfillmentError("INVALID_TRANSITION", "Return request is unavailable.");
    }
    if (current.status !== "received" && current.status !== "approved") {
      throw new FulfillmentError("INVALID_TRANSITION", "Return request cannot be approved.");
    }
    try {
      await this.#database.batch([
        this.#database
          .prepare(
            `INSERT OR IGNORE INTO audit_log (
              id, actor_type, actor_id, action, entity_type, entity_id,
              idempotency_key, metadata_json, created_at
            ) VALUES (?, 'admin', ?, 'return_request_approved',
              'return_request', ?, ?, '{}', ?)`,
          )
          .bind(
            `audit_return_approval_${input.requestId}`,
            actor.administratorId,
            input.requestId,
            `audit:return_approved:${input.requestId}`,
            input.now,
          ),
        this.#database
          .prepare(
            `UPDATE return_requests SET status = 'approved', updated_at = ?
            WHERE id = ? AND status = 'received'`,
          )
          .bind(input.now, input.requestId),
      ]);
    } catch (error) {
      mapDatabaseError(error);
    }
    const [approved, audit] = await Promise.all([
      this.#getReturnRequest(input.requestId),
      this.#database
        .prepare(
          `SELECT actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key FROM audit_log WHERE id = ?`,
        )
        .bind(`audit_return_approval_${input.requestId}`)
        .first<{
          actor_type: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          idempotency_key: string;
        }>(),
    ]);
    if (
      approved?.status !== "approved" || audit?.actor_type !== "admin" ||
      audit.actor_id !== actor.administratorId ||
      audit.action !== "return_request_approved" ||
      audit.entity_type !== "return_request" || audit.entity_id !== input.requestId ||
      audit.idempotency_key !== `audit:return_approved:${input.requestId}`
    ) {
      throw new FulfillmentError(
        "PERSISTENCE_FAILURE",
        "Return approval evidence is missing or crossed.",
      );
    }
    return approved;
  }

  async completeReturnInspection(input: Readonly<{
    requestId: string;
    lines: readonly Readonly<{
      returnLineId: string;
      receivedQuantity: number;
      sellableQuantity: number;
      nonSellableQuantity: number;
      restockedQuantity: number;
    }>[];
    actor: D1MutationActor;
    now: string;
  }>): Promise<void> {
    assertFulfillmentIdentifier(input.requestId, "requestId");
    assertFulfillmentTimestamp(input.now, "now");
    const actor = await resolveD1MutationActor(this.#database, input.actor, input.now);
    if (!actor || actor.kind !== "admin") {
      throw new FulfillmentError("SESSION_REQUIRED", "An administrator session is required.");
    }
    const [currentRequest, approvalAudit] = await Promise.all([
      this.#getReturnRequest(input.requestId),
      this.#database
        .prepare(
          `SELECT actor_type, action, entity_type, entity_id, idempotency_key
          FROM audit_log WHERE id = ?`,
        )
        .bind(`audit_return_approval_${input.requestId}`)
        .first<{
          actor_type: string;
          action: string;
          entity_type: string;
          entity_id: string;
          idempotency_key: string;
        }>(),
    ]);
    if (!currentRequest) {
      throw new FulfillmentError("INSPECTION_INCOMPLETE", "Return request is unavailable.");
    }
    const alreadyInspected = currentRequest.status === "inspected";
    if (!alreadyInspected && currentRequest.status !== "approved") {
      throw new FulfillmentError(
        "INVALID_TRANSITION",
        "An approved return request is required before inspection.",
      );
    }
    if (
      approvalAudit?.actor_type !== "admin" ||
      approvalAudit.action !== "return_request_approved" ||
      approvalAudit.entity_type !== "return_request" ||
      approvalAudit.entity_id !== input.requestId ||
      approvalAudit.idempotency_key !== `audit:return_approved:${input.requestId}`
    ) {
      throw new FulfillmentError(
        "INVALID_TRANSITION",
        "Durable return approval evidence is required before inspection.",
      );
    }
    const persisted = await this.#database
      .prepare(
        `SELECT id, requested_quantity, received_quantity, sellable_quantity,
          non_sellable_quantity, restocked_quantity, inspection_result
        FROM return_lines WHERE return_request_id = ? ORDER BY id`,
      )
      .bind(input.requestId)
      .all<{
        id: string;
        requested_quantity: number;
        received_quantity: number;
        sellable_quantity: number;
        non_sellable_quantity: number;
        restocked_quantity: number;
        inspection_result: string;
      }>();
    if (
      persisted.results.length === 0 ||
      !Array.isArray(input.lines) ||
      input.lines.length !== persisted.results.length
    ) {
      throw new FulfillmentError("INSPECTION_INCOMPLETE", "Every return line must be inspected.");
    }
    const proposed = new Map(input.lines.map((line) => [line.returnLineId, line]));
    if (proposed.size !== input.lines.length) {
      throw new FulfillmentError("INVALID_INPUT", "Inspection lines contain a duplicate.");
    }
    for (const current of persisted.results) {
      const line = proposed.get(current.id);
      if (!line) {
        throw new FulfillmentError("INSPECTION_INCOMPLETE", "Every return line must be inspected.");
      }
      for (const [field, value] of Object.entries({
        receivedQuantity: line.receivedQuantity,
        sellableQuantity: line.sellableQuantity,
        nonSellableQuantity: line.nonSellableQuantity,
        restockedQuantity: line.restockedQuantity,
      })) {
        if (!Number.isSafeInteger(value) || value < 0) {
          throw new FulfillmentError("INVALID_INPUT", `${field} is invalid.`);
        }
      }
      if (
        line.receivedQuantity > current.requested_quantity ||
        line.sellableQuantity + line.nonSellableQuantity !== line.receivedQuantity ||
        line.restockedQuantity > line.sellableQuantity
      ) {
        throw new FulfillmentError("INVALID_INPUT", "Inspection quantities are inconsistent.");
      }
      if (
        current.inspection_result === "complete" &&
        (current.received_quantity !== line.receivedQuantity ||
          current.sellable_quantity !== line.sellableQuantity ||
          current.non_sellable_quantity !== line.nonSellableQuantity ||
          current.restocked_quantity !== line.restockedQuantity)
      ) {
        throw new FulfillmentError("INVALID_TRANSITION", "A completed inspection is immutable.");
      }
    }
    const statements = [
      this.#database
        .prepare(
          `UPDATE return_requests SET status = 'goods_received', updated_at = ?
          WHERE id = ? AND status = 'approved'`,
        )
        .bind(input.now, input.requestId),
      ...persisted.results.map((current) => {
      const line = proposed.get(current.id)!;
      return this.#database
        .prepare(
          `UPDATE return_lines SET received_quantity = ?, sellable_quantity = ?,
            non_sellable_quantity = ?, restocked_quantity = ?,
            inspection_result = 'complete', updated_at = ?
          WHERE id = ? AND return_request_id = ? AND inspection_result = 'pending'`,
        )
        .bind(
          line.receivedQuantity,
          line.sellableQuantity,
          line.nonSellableQuantity,
          line.restockedQuantity,
          input.now,
          current.id,
          input.requestId,
        );
      }),
    ];
    statements.push(
      this.#database
        .prepare(
          `UPDATE return_requests SET status = 'inspected', updated_at = ?
          WHERE id = ? AND status = 'goods_received'
            AND NOT EXISTS (
              SELECT 1 FROM return_lines
              WHERE return_request_id = ? AND inspection_result <> 'complete'
            )`,
        )
        .bind(input.now, input.requestId, input.requestId),
      this.#database
        .prepare(
          `INSERT OR IGNORE INTO audit_log (
            id, actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key, metadata_json, created_at
          ) SELECT ?, 'admin', ?, 'return_inspection_completed',
            'return_request', request.id, ?, ?, ?
          FROM return_requests AS request
          WHERE request.id = ? AND request.status = 'inspected'`,
        )
        .bind(
          `audit_inspection_${input.requestId}`,
          actor.administratorId,
          `audit:return_inspection:${input.requestId}`,
          JSON.stringify({ lineCount: input.lines.length }),
          input.now,
          input.requestId,
        ),
    );
    try {
      await this.#database.batch(statements);
    } catch (error) {
      mapDatabaseError(error);
    }
    const [request, completedLines, audit] = await Promise.all([
      this.#getReturnRequest(input.requestId),
      this.#database
        .prepare(
          `SELECT id, received_quantity, sellable_quantity,
            non_sellable_quantity, restocked_quantity, inspection_result
          FROM return_lines WHERE return_request_id = ? ORDER BY id`,
        )
        .bind(input.requestId)
        .all<{
          id: string;
          received_quantity: number;
          sellable_quantity: number;
          non_sellable_quantity: number;
          restocked_quantity: number;
          inspection_result: string;
        }>(),
      this.#database
        .prepare(
          `SELECT action, entity_type, entity_id, idempotency_key
          FROM audit_log WHERE id = ?`,
        )
        .bind(`audit_inspection_${input.requestId}`)
        .first<{
          action: string;
          entity_type: string;
          entity_id: string;
          idempotency_key: string;
        }>(),
    ]);
    if (request?.status !== "inspected") {
      throw new FulfillmentError("INSPECTION_INCOMPLETE", "The inspection is incomplete.");
    }
    if (
      completedLines.results.length !== input.lines.length ||
      completedLines.results.some((current) => {
        const exact = proposed.get(current.id);
        return !exact || current.inspection_result !== "complete" ||
          current.received_quantity !== exact.receivedQuantity ||
          current.sellable_quantity !== exact.sellableQuantity ||
          current.non_sellable_quantity !== exact.nonSellableQuantity ||
          current.restocked_quantity !== exact.restockedQuantity;
      })
    ) {
      throw new FulfillmentError(
        "INVALID_TRANSITION",
        "The completed inspection differs from this request.",
      );
    }
    if (
      audit?.action !== "return_inspection_completed" ||
      audit.entity_type !== "return_request" ||
      audit.entity_id !== input.requestId ||
      audit.idempotency_key !== `audit:return_inspection:${input.requestId}`
    ) {
      throw new FulfillmentError(
        "PERSISTENCE_FAILURE",
        "The inspection audit evidence is missing.",
      );
    }
  }

  async createRefund(input: Readonly<{
    id: string;
    paymentId: string;
    returnRequestId: string;
    amountCents: number;
    idempotencyKey: string;
    actor: D1MutationActor;
    now: string;
  }>): Promise<RefundRow> {
    assertFulfillmentIdentifier(input.id, "id");
    assertFulfillmentIdentifier(input.paymentId, "paymentId");
    assertFulfillmentIdentifier(input.returnRequestId, "returnRequestId");
    assertFulfillmentIdentifier(input.idempotencyKey, "idempotencyKey");
    assertPositiveFulfillmentInteger(input.amountCents, "amountCents");
    assertFulfillmentTimestamp(input.now, "now");
    const actor = await resolveD1MutationActor(this.#database, input.actor, input.now);
    if (!actor || actor.kind !== "admin" || !canCreateRefund(actor.role)) {
      throw new FulfillmentError(
        "SESSION_REQUIRED",
        "An authorized administrator session is required.",
      );
    }
    try {
      await this.#database
        .prepare(
          `INSERT OR IGNORE INTO refunds (
            id, payment_id, return_request_id, reason, amount_cents, currency,
            status, idempotency_key, attempts, max_attempts, created_at, updated_at
          )
          SELECT ?, ?, request.id, request.kind, ?, 'EUR', 'pending', ?, 0, 5, ?, ?
          FROM return_requests AS request
          WHERE request.id = ? AND (
            request.status = 'inspected'
            OR (request.status = 'resolved' AND request.resolution = 'refund')
          )`,
        )
        .bind(
          input.id,
          input.paymentId,
          input.amountCents,
          input.idempotencyKey,
          input.now,
          input.now,
          input.returnRequestId,
        )
        .run();
    } catch (error) {
      mapDatabaseError(error);
    }
    const refund = await this.#getRefund(input.id);
    if (!refund) {
      throw new FulfillmentError("INVALID_TRANSITION", "An inspected return is required.");
    }
    if (
      refund.payment_id !== input.paymentId ||
      refund.return_request_id !== input.returnRequestId ||
      refund.amount_cents !== input.amountCents ||
      refund.idempotency_key !== input.idempotencyKey
    ) {
      throw new FulfillmentError("INVALID_TRANSITION", "The refund key conflicts.");
    }
    return refund;
  }

  async executeRefund(input: Readonly<{
    refundId: string;
    leaseToken: string;
    leaseExpiresAt: string;
    locale: "fr" | "en";
    now: string;
  }>): Promise<RefundRow> {
    const provider = this.#ports.refund;
    if (!provider) {
      throw new FulfillmentError(
        "DEPENDENCY_UNAVAILABLE",
        "The refund provider is not configured.",
      );
    }
    assertFulfillmentIdentifier(input.refundId, "refundId");
    assertFulfillmentIdentifier(input.leaseToken, "leaseToken");
    assertEmailLocale(input.locale);
    assertLeaseWindow(input.now, input.leaseExpiresAt);
    const leaseTokenHash = await sha256Hex(input.leaseToken);
    let refund = await this.#getRefund(input.refundId);
    if (!refund) throw new FulfillmentError("INVALID_TRANSITION", "Refund not found.");
    if (refund.status === "succeeded") {
      await this.#assertRefundArtifacts(refund);
      return refund;
    }
    try {
      const claim = await this.#database
        .prepare(
          `UPDATE refunds SET status = 'claimed', lease_token_hash = ?,
            leased_at = ?, lease_expires_at = ?, attempts = attempts + 1,
            last_error_code = NULL, updated_at = ?
          WHERE id = ? AND attempts < max_attempts
            AND (status = 'pending'
              OR (status = 'claimed' AND lease_expires_at <= ?))`,
        )
        .bind(
          leaseTokenHash,
          input.now,
          input.leaseExpiresAt,
          input.now,
          input.refundId,
          input.now,
        )
        .run();
      if (changed(claim) !== 1) {
        throw new FulfillmentError("LEASE_UNAVAILABLE", "The refund lease is unavailable.");
      }
    } catch (error) {
      mapDatabaseError(error);
    }
    refund = await this.#getRefund(input.refundId);
    if (!refund || refund.lease_token_hash !== leaseTokenHash) {
      throw new FulfillmentError("LEASE_UNAVAILABLE", "The refund lease was lost.");
    }
    const context = await this.#database
      .prepare(
        `SELECT request.order_id, request.status AS request_status,
          request.resolution, customer_order.email, customer_order.order_number,
          customer_order.status AS order_status, payment.status AS payment_status,
          invoice.id AS invoice_id, invoice.total_cents AS invoice_total_cents
        FROM refunds AS refund
        INNER JOIN return_requests AS request ON request.id = refund.return_request_id
        INNER JOIN orders AS customer_order ON customer_order.id = request.order_id
        INNER JOIN payments AS payment ON payment.id = refund.payment_id
        INNER JOIN order_invoices AS invoice ON invoice.order_id = request.order_id
        WHERE refund.id = ?`,
      )
      .bind(refund.id)
      .first<{
        order_id: string;
        request_status: string;
        resolution: string;
        email: string;
        order_number: string;
        order_status: string;
        payment_status: string;
        invoice_id: string;
        invoice_total_cents: number;
      }>();
    if (
      !context ||
      !["paid", "preparing", "shipped"].includes(context.order_status) ||
      context.payment_status !== "succeeded" ||
      !(
        context.request_status === "inspected" ||
        (context.request_status === "resolved" && context.resolution === "refund")
      )
    ) {
      throw new FulfillmentError("INVALID_TRANSITION", "The refund context is not eligible.");
    }
    const refundableLines = await this.#database.prepare(
      `SELECT order_line.id AS order_line_id,
        order_line.internal_reference, order_line.product_name,
        order_line.color_name, order_line.size, order_line.unit_price_cents,
        COALESCE((
          SELECT sum(eligible_line.received_quantity)
          FROM return_lines AS eligible_line
          INNER JOIN return_requests AS eligible_request
            ON eligible_request.id=eligible_line.return_request_id
          WHERE eligible_request.order_id=?
            AND eligible_request.status IN ('inspected','resolved')
            AND (eligible_request.status <> 'resolved'
              OR eligible_request.resolution='refund')
            AND eligible_line.inspection_result='complete'
            AND eligible_line.order_line_id=order_line.id
        ), 0) AS received_quantity,
        COALESCE((
          SELECT sum(CAST(json_extract(previous_line.value, '$.quantity') AS integer))
          FROM order_credit_notes AS previous_note,
            json_each(previous_note.credit_lines_json) AS previous_line
          WHERE previous_note.invoice_id = ?
            AND json_extract(previous_line.value, '$.kind') = 'item'
            AND json_extract(previous_line.value, '$.orderLineId') = order_line.id
        ), 0) AS credited_quantity
      FROM refunds AS refund
      INNER JOIN return_lines AS return_line
        ON return_line.return_request_id = refund.return_request_id
      INNER JOIN order_lines AS order_line ON order_line.id = return_line.order_line_id
      WHERE refund.id = ? AND return_line.inspection_result = 'complete'
        AND return_line.received_quantity > 0
      ORDER BY return_line.id`,
    ).bind(context.order_id, context.invoice_id, refund.id).all<{
      order_line_id: string;
      internal_reference: string;
      product_name: string;
      color_name: string;
      size: "S" | "M" | "L" | "XL";
      unit_price_cents: number;
      received_quantity: number;
      credited_quantity: number;
    }>();
    let unallocatedCents = refund.amount_cents;
    const creditLines: Array<Record<string, string | number>> = [];
    for (const line of refundableLines.results) {
      const availableQuantity = line.received_quantity - line.credited_quantity;
      if (!Number.isSafeInteger(availableQuantity) || availableQuantity < 0 ||
        !Number.isSafeInteger(line.unit_price_cents) || line.unit_price_cents < 1) {
        throw new FulfillmentError(
          "PERSISTENCE_FAILURE",
          "The previous credit-note allocation is incoherent.",
        );
      }
      const quantity = Math.min(
        availableQuantity,
        Math.floor(unallocatedCents / line.unit_price_cents),
      );
      if (quantity < 1) continue;
      const amountCents = quantity * line.unit_price_cents;
      creditLines.push(Object.freeze({
        kind: "item",
        orderLineId: line.order_line_id,
        internalReference: line.internal_reference,
        productName: line.product_name,
        colorName: line.color_name,
        size: line.size,
        quantity,
        unitPriceCents: line.unit_price_cents,
        amountCents,
      }));
      unallocatedCents -= amountCents;
    }
    if (unallocatedCents > 0) {
      creditLines.push(Object.freeze({
        kind: "adjustment",
        label: "Ajustement / remboursement livraison",
        amountCents: unallocatedCents,
      }));
    }
    if (creditLines.length < 1 || creditLines.length > 16 ||
      creditLines.reduce((total, line) => total + Number(line.amountCents), 0) !==
        refund.amount_cents ||
      refund.amount_cents > context.invoice_total_cents) {
      throw new FulfillmentError(
        "PERSISTENCE_FAILURE",
        "The refund cannot be reconciled to a credit-note allocation.",
      );
    }
    const creditLinesJson = JSON.stringify(creditLines);
    let receipt;
    try {
      receipt = await provider.refund({
        refundId: refund.id,
        paymentId: refund.payment_id,
        amountCents: refund.amount_cents,
        currency: refund.currency,
        idempotencyKey: refund.idempotency_key,
      });
    } catch (error) {
      if (error instanceof FulfillmentProviderError && error.outcome === "rejected") {
        await this.#database
          .prepare(
            `UPDATE refunds SET status = 'failed', lease_token_hash = NULL,
              leased_at = NULL, lease_expires_at = NULL,
              last_error_code = 'provider_rejected', updated_at = ?
            WHERE id = ? AND status = 'claimed' AND lease_token_hash = ?`,
          )
          .bind(input.now, refund.id, leaseTokenHash)
          .run();
        throw new FulfillmentError("INVALID_TRANSITION", "The refund was rejected.");
      }
      throw new FulfillmentError(
        "PROVIDER_OUTCOME_UNKNOWN",
        "The refund outcome is unknown; retry with the same key after the lease.",
        { cause: error },
      );
    }
    assertFulfillmentIdentifier(receipt.providerRefundReference, "providerRefundReference");
    assertFulfillmentFingerprint(receipt.receiptFingerprint, "receiptFingerprint");
    if (
      receipt.refundId !== refund.id ||
      receipt.paymentId !== refund.payment_id ||
      receipt.amountCents !== refund.amount_cents ||
      receipt.currency !== refund.currency ||
      receipt.idempotencyKey !== refund.idempotency_key
    ) {
      throw new FulfillmentError(
        "PROVIDER_RECEIPT_MISMATCH",
        "The refund provider receipt does not match the claim.",
      );
    }
    try {
      const results = await this.#database.batch([
        this.#database
          .prepare(
            `UPDATE refunds SET status = 'succeeded',
              provider_refund_reference = ?, provider_receipt_fingerprint = ?,
              lease_token_hash = NULL, leased_at = NULL, lease_expires_at = NULL,
              succeeded_at = ?, last_error_code = NULL, updated_at = ?
            WHERE id = ? AND status = 'claimed' AND lease_token_hash = ?`,
          )
          .bind(
            receipt.providerRefundReference,
            receipt.receiptFingerprint,
            input.now,
            input.now,
            refund.id,
            leaseTokenHash,
          ),
        this.#database
          .prepare(
            `UPDATE return_requests SET status = 'resolved', resolution = 'refund',
              resolved_at = ?, updated_at = ? WHERE id = ? AND status = 'inspected'`,
          )
          .bind(input.now, input.now, refund.return_request_id),
        this.#database.prepare(
          `INSERT INTO credit_note_sequences (
            credit_note_year, last_number, updated_at
          ) VALUES (CAST(substr(?, 1, 4) AS integer), 1, ?)
          ON CONFLICT (credit_note_year) DO UPDATE SET
            last_number=last_number+1, updated_at=excluded.updated_at`,
        ).bind(input.now, input.now),
        this.#database.prepare(
          `INSERT INTO order_credit_notes (
            id, refund_id, invoice_id, order_id, order_number,
            original_invoice_number, original_invoice_issued_at,
            credit_note_number, credit_note_year, credit_note_sequence,
            issued_at, refund_succeeded_at, refund_reason,
            refund_provider_reference, seller_snapshot_json,
            mediator_snapshot_json, buyer_email, billing_address_json, currency,
            original_total_cents, credit_amount_cents, credit_lines_json,
            tax_credit_cents, remaining_balance_cents, tax_mention, created_at
          )
          SELECT 'credit-note:' || refund.id, refund.id, invoice.id,
            invoice.order_id, invoice.order_number, invoice.invoice_number,
            invoice.issued_at,
            printf('AJL-AV-%04d-%06d', sequence.credit_note_year, sequence.last_number),
            sequence.credit_note_year, sequence.last_number, refund.succeeded_at,
            refund.succeeded_at, refund.reason, refund.provider_refund_reference,
            invoice.seller_snapshot_json, invoice.mediator_snapshot_json,
            invoice.buyer_email, invoice.billing_address_json, invoice.currency,
            invoice.total_cents, refund.amount_cents, ?, 0,
            invoice.total_cents - refund.amount_cents - COALESCE((
              SELECT sum(previous.credit_amount_cents)
              FROM order_credit_notes AS previous
              WHERE previous.invoice_id=invoice.id
            ), 0),
            invoice.tax_mention, refund.succeeded_at
          FROM refunds AS refund
          INNER JOIN payments AS payment ON payment.id=refund.payment_id
          INNER JOIN return_requests AS request ON request.id=refund.return_request_id
          INNER JOIN order_invoices AS invoice ON invoice.order_id=request.order_id
          INNER JOIN credit_note_sequences AS sequence
            ON sequence.credit_note_year=CAST(substr(refund.succeeded_at,1,4) AS integer)
          WHERE refund.id=? AND refund.status='succeeded'
            AND request.status='resolved' AND request.resolution='refund'
            AND payment.status='succeeded' AND payment.order_id=request.order_id
            AND payment.amount_cents=invoice.total_cents
            AND refund.amount_cents + COALESCE((
              SELECT sum(previous.credit_amount_cents)
              FROM order_credit_notes AS previous
              WHERE previous.invoice_id=invoice.id
            ), 0) <= invoice.total_cents`,
        ).bind(creditLinesJson, refund.id),
        this.#database
          .prepare(
            `INSERT INTO email_outbox (
              id, kind, transaction_intent, source_event_id, recipient_email,
              order_id, locale, template_version, payload_json, status,
              attempts, max_attempts, next_attempt_at, idempotency_key,
              provider_idempotency_key, created_at, updated_at
            ) SELECT ?, 'refund_confirmation', 'refund_succeeded', ?, ?, ?, ?,
              'refund-success-v2', json_object(
                'subject', CASE WHEN ?='fr'
                  THEN 'Remboursement confirmé' ELSE 'Refund confirmed' END,
                'text', CASE WHEN ?='fr'
                  THEN 'Le remboursement de la commande ' || note.order_number || ' est confirmé. Votre avoir ' || note.credit_note_number || ' est disponible dans votre compte : https://ajluxurystore.com/account'
                  ELSE 'The refund for order ' || note.order_number || ' is confirmed. Your credit note ' || note.credit_note_number || ' is available in your account: https://ajluxurystore.com/account' END
              ), 'pending', 0, 5, ?, ?, ?, ?, ?
            FROM order_credit_notes AS note WHERE note.refund_id = ?`,
          )
          .bind(
            `outbox_refund_${refund.id}`,
            refund.id,
            context.email,
            context.order_id,
            input.locale,
            input.locale,
            input.locale,
            input.now,
            `email:refund_succeeded:${refund.id}`,
            `refund_confirmation:${refund.id}`,
            input.now,
            input.now,
            refund.id,
          ),
        this.#database
          .prepare(
            `INSERT INTO audit_log (
              id, actor_type, actor_id, action, entity_type, entity_id,
              idempotency_key, metadata_json, created_at
            ) VALUES (?, 'system', NULL, 'refund_succeeded', 'refund', ?, ?, ?, ?)`,
          )
          .bind(
            `audit_refund_${refund.id}`,
            refund.id,
            `audit:refund_succeeded:${refund.id}`,
            JSON.stringify({ amountCents: refund.amount_cents, currency: refund.currency }),
            input.now,
          ),
      ]);
      if (
        changed(results[0]) !== 1 ||
        ![0, 1].includes(changed(results[1])) ||
        changed(results[2]) !== 1 ||
        changed(results[3]) !== 1 ||
        changed(results[4]) !== 1 ||
        changed(results[5]) !== 1
      ) {
        throw new FulfillmentError(
          "PERSISTENCE_FAILURE",
          "The refund evidence was not written atomically.",
        );
      }
    } catch (error) {
      mapDatabaseError(error);
    }
    const completed = await this.#getRefund(refund.id);
    if (!completed || completed.status !== "succeeded") {
      throw new FulfillmentError("PERSISTENCE_FAILURE", "The refund was not persisted.");
    }
    await this.#assertRefundArtifacts(completed);
    return completed;
  }

  async #assertRefundArtifacts(refund: RefundRow): Promise<void> {
    const [outbox, audit, sale, creditNote] = await Promise.all([
      this.#database
        .prepare(
          `SELECT kind, transaction_intent, source_event_id, order_id, locale,
            template_version, payload_json, idempotency_key,
            provider_idempotency_key
          FROM email_outbox WHERE id = ?`,
        )
        .bind(`outbox_refund_${refund.id}`)
        .first<{
          kind: string;
          transaction_intent: string;
          source_event_id: string;
          order_id: string | null;
          locale: "fr" | "en";
          template_version: string;
          payload_json: string;
          idempotency_key: string;
          provider_idempotency_key: string;
        }>(),
      this.#database
        .prepare(
          `SELECT action, entity_type, entity_id, idempotency_key
          FROM audit_log WHERE id = ?`,
        )
        .bind(`audit_refund_${refund.id}`)
        .first<{
          action: string;
          entity_type: string;
          entity_id: string;
          idempotency_key: string;
        }>(),
      this.#database
        .prepare(
          `SELECT customer_order.id AS order_id,
            customer_order.order_number,
            customer_order.status AS order_status,
            payment.status AS payment_status,
            request.status AS request_status, request.resolution
          FROM orders AS customer_order
          INNER JOIN payments AS payment ON payment.order_id = customer_order.id
          INNER JOIN return_requests AS request ON request.order_id = customer_order.id
          WHERE request.id = ? AND payment.id = ?`,
        )
        .bind(refund.return_request_id, refund.payment_id)
        .first<{
          order_id: string;
          order_number: string;
          order_status: string;
          payment_status: string;
          request_status: string;
          resolution: string;
        }>(),
      this.#database
        .prepare(
          `SELECT credit_note_number FROM order_credit_notes
          WHERE refund_id = ?`,
        )
        .bind(refund.id)
        .first<{ credit_note_number: string }>(),
    ]);
    const expectedPayload = outbox && sale && creditNote
      ? JSON.stringify({
        subject: outbox.locale === "fr"
          ? "Remboursement confirmé"
          : "Refund confirmed",
        text: outbox.locale === "fr"
          ? `Le remboursement de la commande ${sale.order_number} est confirmé. Votre avoir ${creditNote.credit_note_number} est disponible dans votre compte : https://ajluxurystore.com/account`
          : `The refund for order ${sale.order_number} is confirmed. Your credit note ${creditNote.credit_note_number} is available in your account: https://ajluxurystore.com/account`,
      })
      : null;
    if (
      refund.status !== "succeeded" ||
      outbox?.kind !== "refund_confirmation" ||
      outbox.transaction_intent !== "refund_succeeded" ||
      outbox.source_event_id !== refund.id ||
      outbox.order_id !== sale?.order_id ||
      outbox.idempotency_key !== `email:refund_succeeded:${refund.id}` ||
      outbox.provider_idempotency_key !== `refund_confirmation:${refund.id}` ||
      outbox.template_version !== "refund-success-v2" ||
      outbox.payload_json !== expectedPayload ||
      !creditNote ||
      audit?.action !== "refund_succeeded" ||
      audit.entity_type !== "refund" ||
      audit.entity_id !== refund.id ||
      audit.idempotency_key !== `audit:refund_succeeded:${refund.id}` ||
      sale?.request_status !== "resolved" ||
      sale.resolution !== "refund" ||
      !sale || !["paid", "preparing", "shipped"].includes(sale.order_status) ||
      sale.payment_status !== "succeeded"
    ) {
      throw new FulfillmentError(
        "PERSISTENCE_FAILURE",
        "The refund evidence is incomplete or changed the paid sale truth.",
      );
    }
  }

  async #assertCustomsReadyAudit(shipmentId: string): Promise<void> {
    const audit = await this.#database
      .prepare(
        `SELECT action, entity_type, entity_id, idempotency_key, metadata_json
        FROM audit_log WHERE id = ?`,
      )
      .bind(`audit_customs_ready_${shipmentId}`)
      .first<{
        action: string;
        entity_type: string;
        entity_id: string;
        idempotency_key: string;
        metadata_json: string;
      }>();
    if (
      audit?.action !== "customs_ready" ||
      audit.entity_type !== "shipment" ||
      audit.entity_id !== shipmentId ||
      audit.idempotency_key !== `audit:customs_ready:${shipmentId}` ||
      audit.metadata_json !== JSON.stringify({ status: "ready" })
    ) {
      throw new FulfillmentError("PERSISTENCE_FAILURE", "Customs audit evidence is missing.");
    }
  }

  async #assertHandoverArtifacts(
    shipmentId: string,
    orderId: string,
    eventId: string,
  ): Promise<void> {
    const [event, shipment, outbox, audit] = await Promise.all([
      this.#trackingEvent("internal_handover", eventId),
      this.#database
        .prepare("SELECT status FROM shipments WHERE id = ?")
        .bind(shipmentId)
        .first<{ status: string }>(),
      this.#database
        .prepare(
          `SELECT kind, source_event_id, order_id, idempotency_key,
            provider_idempotency_key FROM email_outbox WHERE id = ?`,
        )
        .bind(`outbox_${eventId}`)
        .first<{
          kind: string;
          source_event_id: string;
          order_id: string | null;
          idempotency_key: string;
          provider_idempotency_key: string;
        }>(),
      this.#database
        .prepare(
          `SELECT action, entity_type, entity_id, idempotency_key
          FROM audit_log WHERE id = ?`,
        )
        .bind(`audit_${eventId}`)
        .first<{
          action: string;
          entity_type: string;
          entity_id: string;
          idempotency_key: string;
        }>(),
    ]);
    if (
      event?.shipment_id !== shipmentId ||
      event.event_type !== "handed_over" ||
      !["handed_over", "in_transit", "delivered"].includes(shipment?.status ?? "") ||
      outbox?.kind !== "shipment_confirmation" ||
      outbox.source_event_id !== eventId ||
      outbox.order_id !== orderId ||
      outbox.idempotency_key !== `email:shipment_handover:${eventId}` ||
      outbox.provider_idempotency_key !== `shipment_confirmation:${eventId}` ||
      audit?.action !== "shipment_handed_over" ||
      audit.entity_type !== "shipment" ||
      audit.entity_id !== shipmentId ||
      audit.idempotency_key !== `audit:shipment_handover:${eventId}`
    ) {
      throw new FulfillmentError(
        "PERSISTENCE_FAILURE",
        "The immutable handover evidence is incomplete or crossed.",
      );
    }
  }

  async #assertReturnRequestArtifacts(
    request: ReturnRequestRow,
    expected: ExpectedReturnArtifacts,
  ): Promise<void> {
    if (
      request.order_id !== expected.orderId ||
      request.kind !== expected.kind ||
      request.source !== expected.source.source ||
      request.actor_customer_id !== expected.source.customerId ||
      request.guest_order_session_id !== expected.source.guestSessionId ||
      request.actor_admin_id !== expected.source.adminId ||
      request.declaration_fingerprint !== expected.declarationFingerprint ||
      request.declared_line_count !== expected.lines.length
    ) {
      throw new FulfillmentError(
        "INVALID_TRANSITION",
        "The return request key belongs to another declaration.",
      );
    }
    const [lines, audit, acknowledgement] = await Promise.all([
      this.#database
        .prepare(
          `SELECT id, order_line_id, requested_quantity FROM return_lines
          WHERE return_request_id = ? ORDER BY id`,
        )
        .bind(request.id)
        .all<{ id: string; order_line_id: string; requested_quantity: number }>(),
      this.#database
        .prepare(
          `SELECT action, entity_type, entity_id, idempotency_key
          FROM audit_log WHERE id = ?`,
        )
        .bind(`audit_return_${request.id}`)
        .first<{
          action: string;
          entity_type: string;
          entity_id: string;
          idempotency_key: string;
        }>(),
      this.#database
        .prepare(
          `SELECT kind, transaction_intent, source_event_id, recipient_email,
            order_id, locale, idempotency_key, provider_idempotency_key
          FROM email_outbox WHERE id = ?`,
        )
        .bind(`outbox_return_${request.id}`)
        .first<{
          kind: string;
          transaction_intent: string;
          source_event_id: string;
          recipient_email: string;
          order_id: string | null;
          locale: string;
          idempotency_key: string;
          provider_idempotency_key: string;
        }>(),
    ]);
    const expectedLines = new Map(expected.lines.map((line) => [line.id, line]));
    if (
      lines.results.length !== expected.lines.length ||
      lines.results.some((line) => {
        const exact = expectedLines.get(line.id);
        return !exact || exact.orderLineId !== line.order_line_id ||
          exact.quantity !== line.requested_quantity;
      })
    ) {
      throw new FulfillmentError(
        "INVALID_TRANSITION",
        "The return request line set conflicts with its declaration.",
      );
    }
    if (
      audit?.action !== "return_request_received" ||
      audit.entity_type !== "return_request" ||
      audit.entity_id !== request.id ||
      audit.idempotency_key !== `audit:return_received:${request.id}`
    ) {
      throw new FulfillmentError("PERSISTENCE_FAILURE", "Return audit evidence is missing.");
    }
    const acknowledgementKind = expected.kind === "return"
      ? "return_acknowledgement"
      : "withdrawal_acknowledgement";
    const acknowledgementIntent = expected.kind === "return"
      ? "return_received"
      : "withdrawal_received";
    if (
      acknowledgement?.kind !== acknowledgementKind ||
      acknowledgement.transaction_intent !== acknowledgementIntent ||
      acknowledgement.source_event_id !== request.id ||
      acknowledgement.recipient_email !== expected.orderEmail ||
      acknowledgement.order_id !== expected.orderId ||
      acknowledgement.locale !== expected.locale ||
      acknowledgement.idempotency_key !== `email:${acknowledgementIntent}:${request.id}` ||
      acknowledgement.provider_idempotency_key !== `${acknowledgementKind}:${request.id}`
    ) {
      throw new FulfillmentError(
        "PERSISTENCE_FAILURE",
        "Return acknowledgement evidence is missing or crossed.",
      );
    }
  }

  async #getShipment(id: string): Promise<ShipmentRow | null> {
    return this.#database
      .prepare(
        `SELECT id, order_id, shipping_quote_id, status,
          provider_shipment_reference, tracking_provider_code, tracking_reference,
          provider_receipt_fingerprint, idempotency_key, lease_token_hash,
          lease_expires_at, attempts, max_attempts, label_created_at,
          handed_over_at, delivered_at
        FROM shipments WHERE id = ?`,
      )
      .bind(id)
      .first<ShipmentRow>();
  }

  async #trackingEvent(
    providerCode: string,
    providerEventId: string,
  ): Promise<TrackingEventRow | null> {
    return this.#database
      .prepare(
        `SELECT id, shipment_id, provider_code, provider_event_id, event_type,
          carrier_receipt_id, tracking_reference, event_fingerprint,
          occurred_at, received_at
        FROM shipment_tracking_events
        WHERE provider_code = ? AND provider_event_id = ?`,
      )
      .bind(providerCode, providerEventId)
      .first<TrackingEventRow>();
  }

  async #carrierReceipt(id: string): Promise<CarrierEventReceiptRow | null> {
    return this.#database
      .prepare(
        `SELECT id, shipment_id, provider_code, provider_event_id,
          tracking_reference, event_type, event_fingerprint,
          receipt_fingerprint, verification_method, occurred_at,
          received_at, verified_at, status, consumed_at
        FROM carrier_event_receipts WHERE id = ?`,
      )
      .bind(id)
      .first<CarrierEventReceiptRow>();
  }

  async #getReturnRequest(id: string): Promise<ReturnRequestRow | null> {
    return this.#database
      .prepare(
        `SELECT id, order_id, kind, source, actor_customer_id,
          guest_order_session_id, actor_admin_id, declaration_fingerprint,
          declared_line_count, status, resolution FROM return_requests WHERE id = ?`,
      )
      .bind(id)
      .first<ReturnRequestRow>();
  }

  async #getRefund(id: string): Promise<RefundRow | null> {
    return this.#database
      .prepare(
        `SELECT id, payment_id, return_request_id, reason, amount_cents,
          currency, status, idempotency_key, lease_token_hash,
          lease_expires_at, provider_refund_reference,
          provider_receipt_fingerprint, attempts, max_attempts
        FROM refunds WHERE id = ?`,
      )
      .bind(id)
      .first<RefundRow>();
  }
}
