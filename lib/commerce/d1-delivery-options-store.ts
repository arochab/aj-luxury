import type { CommerceD1Database } from "./d1-port.ts";
import type {
  DeliveryDutiesTerms,
  DeliveryMode,
} from "./delivery-provider.ts";
import {
  assertFulfillmentFingerprint,
  assertFulfillmentIdentifier,
  assertFulfillmentTimestamp,
} from "./fulfillment-domain.ts";

export type DeliveryOptionSnapshotRow = Readonly<{
  id: string;
  cart_id: string;
  cart_revision: number;
  shipping_quote_id: string;
  shipping_address_fingerprint: string;
  provider_code: string;
  carrier_code: string;
  service_code: string;
  display_name: string;
  delivery_mode: DeliveryMode;
  amount_cents: number;
  currency: "EUR";
  estimated_days_min: number;
  estimated_days_max: number;
  duties_terms: DeliveryDutiesTerms;
  proof_kind: "synthetic_demo" | "provider_api_response";
  expires_at: string;
  selected_at: string | null;
}>;

export type DeliveryServicePointSnapshotRow = Readonly<{
  id: string;
  display_name: string;
  postal_code: string;
  city: string;
  country_code: string;
  opening_hours_summary: string | null;
  expires_at: string;
}>;

const optionColumns = `id, cart_id, cart_revision, shipping_quote_id,
  shipping_address_fingerprint, provider_code, carrier_code, service_code,
  display_name, delivery_mode, amount_cents, currency, estimated_days_min,
  estimated_days_max, duties_terms, proof_kind, expires_at, selected_at`;

export class DeliveryOptionStoreError extends Error {
  readonly code:
    | "OPTION_NOT_FOUND"
    | "OPTION_EXPIRED"
    | "OPTION_MISMATCH"
    | "SERVICE_POINT_REQUIRED"
    | "OPTION_ALREADY_SELECTED"
    | "PERSISTENCE_FAILURE";

  constructor(
    code:
      | "OPTION_NOT_FOUND"
      | "OPTION_EXPIRED"
      | "OPTION_MISMATCH"
      | "SERVICE_POINT_REQUIRED"
      | "OPTION_ALREADY_SELECTED"
      | "PERSISTENCE_FAILURE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DeliveryOptionStoreError";
    this.code = code;
  }
}

function optionMatches(
  row: DeliveryOptionSnapshotRow,
  input: Readonly<{
    cartId: string;
    quoteId: string;
    cartRevision: number;
    addressFingerprint: string;
    amountCents: number;
    estimatedDaysMin: number;
    estimatedDaysMax: number;
    dutiesTerms: DeliveryDutiesTerms;
    expiresAt: string;
  }>,
): boolean {
  return row.cart_id === input.cartId && row.shipping_quote_id === input.quoteId &&
    row.cart_revision === input.cartRevision &&
    row.shipping_address_fingerprint === input.addressFingerprint &&
    row.provider_code === "synthetic_demo" &&
    row.carrier_code === "synthetic_demo" &&
    row.service_code === "SYNTHETIC_DEMO_NOT_COMMERCIAL" &&
    row.delivery_mode === "home" && row.amount_cents === input.amountCents &&
    row.currency === "EUR" &&
    row.estimated_days_min === input.estimatedDaysMin &&
    row.estimated_days_max === input.estimatedDaysMax &&
    row.duties_terms === input.dutiesTerms &&
    row.proof_kind === "synthetic_demo" && row.expires_at === input.expiresAt;
}

export class D1DeliveryOptionsStore {
  readonly database: CommerceD1Database;

  constructor(database: CommerceD1Database) {
    this.database = database;
  }

  async recordSyntheticOption(input: Readonly<{
    optionId: string;
    cartId: string;
    quoteId: string;
    cartRevision: number;
    addressFingerprint: string;
    amountCents: number;
    estimatedDaysMin: number;
    estimatedDaysMax: number;
    dutiesTerms: DeliveryDutiesTerms;
    quotedAt: string;
    expiresAt: string;
  }>): Promise<DeliveryOptionSnapshotRow> {
    assertFulfillmentIdentifier(input.optionId, "optionId");
    assertFulfillmentIdentifier(input.cartId, "cartId");
    assertFulfillmentIdentifier(input.quoteId, "quoteId");
    assertFulfillmentFingerprint(input.addressFingerprint, "addressFingerprint");
    assertFulfillmentTimestamp(input.quotedAt, "quotedAt");
    assertFulfillmentTimestamp(input.expiresAt, "expiresAt");
    try {
      await this.database.prepare(
        `INSERT OR IGNORE INTO delivery_option_snapshots (
          id, cart_id, cart_revision, shipping_quote_id,
          shipping_address_fingerprint, provider_code, carrier_code,
          service_code, display_name, delivery_mode, amount_cents, currency,
          estimated_days_min, estimated_days_max, duties_terms, proof_kind,
          provider_quote_reference_hash, provider_receipt_fingerprint,
          quoted_at, expires_at, selected_at, created_at
        ) VALUES (?, ?, ?, ?, ?, 'synthetic_demo', 'synthetic_demo',
          'SYNTHETIC_DEMO_NOT_COMMERCIAL', 'Livraison suivie - simulation',
          'home', ?, 'EUR', ?, ?, ?, 'synthetic_demo', NULL, NULL,
          ?, ?, NULL, ?)`,
      ).bind(
        input.optionId,
        input.cartId,
        input.cartRevision,
        input.quoteId,
        input.addressFingerprint,
        input.amountCents,
        input.estimatedDaysMin,
        input.estimatedDaysMax,
        input.dutiesTerms,
        input.quotedAt,
        input.expiresAt,
        input.quotedAt,
      ).run();
    } catch (error) {
      throw new DeliveryOptionStoreError(
        "PERSISTENCE_FAILURE",
        "The delivery option could not be recorded.",
        { cause: error },
      );
    }
    const row = await this.getOption(input.optionId);
    if (!row || !optionMatches(row, input)) {
      throw new DeliveryOptionStoreError(
        "OPTION_MISMATCH",
        "The delivery-option replay does not match the original snapshot.",
      );
    }
    return row;
  }

  async getOption(optionId: string): Promise<DeliveryOptionSnapshotRow | null> {
    assertFulfillmentIdentifier(optionId, "optionId");
    return this.database.prepare(
      `SELECT ${optionColumns} FROM delivery_option_snapshots WHERE id = ?`,
    ).bind(optionId).first<DeliveryOptionSnapshotRow>();
  }

  async selectOption(input: Readonly<{
    optionId: string;
    cartId: string;
    addressFingerprint: string;
    now: string;
  }>): Promise<DeliveryOptionSnapshotRow> {
    assertFulfillmentIdentifier(input.optionId, "optionId");
    assertFulfillmentIdentifier(input.cartId, "cartId");
    assertFulfillmentFingerprint(input.addressFingerprint, "addressFingerprint");
    assertFulfillmentTimestamp(input.now, "now");
    const existing = await this.getOption(input.optionId);
    if (!existing || existing.cart_id !== input.cartId) {
      throw new DeliveryOptionStoreError("OPTION_NOT_FOUND", "Delivery option not found.");
    }
    if (existing.shipping_address_fingerprint !== input.addressFingerprint) {
      throw new DeliveryOptionStoreError("OPTION_MISMATCH", "Delivery option address mismatch.");
    }
    const cart = await this.database.prepare(
      `SELECT status, fulfillment_revision FROM carts WHERE id = ?`,
    ).bind(input.cartId).first<{ status: string; fulfillment_revision: number }>();
    if (
      existing.expires_at <= input.now || !cart || cart.status !== "open" ||
      cart.fulfillment_revision !== existing.cart_revision
    ) {
      throw new DeliveryOptionStoreError("OPTION_EXPIRED", "Delivery option has expired or the cart changed.");
    }
    if (existing.delivery_mode === "service_point") {
      throw new DeliveryOptionStoreError(
        "SERVICE_POINT_REQUIRED",
        "Service-point delivery stays closed until a provider reference can be stored safely.",
      );
    }
    // Validation only. The chosen option is persisted atomically with the
    // order, so an abandoned/expired checkout cannot lock the cart forever.
    return existing;
  }

  async servicePoints(
    optionId: string,
    cartId: string,
    now: string,
  ): Promise<readonly DeliveryServicePointSnapshotRow[]> {
    assertFulfillmentIdentifier(optionId, "optionId");
    assertFulfillmentIdentifier(cartId, "cartId");
    assertFulfillmentTimestamp(now, "now");
    const option = await this.getOption(optionId);
    if (!option || option.cart_id !== cartId) {
      throw new DeliveryOptionStoreError("OPTION_NOT_FOUND", "Delivery option not found.");
    }
    if (option.expires_at <= now) {
      throw new DeliveryOptionStoreError("OPTION_EXPIRED", "Delivery option has expired.");
    }
    if (option.delivery_mode !== "service_point") return Object.freeze([]);
    const result = await this.database.prepare(
      `SELECT id, display_name, postal_code, city, country_code,
        opening_hours_summary, expires_at
      FROM delivery_service_point_snapshots
      WHERE delivery_option_id = ? AND expires_at > ?
      ORDER BY display_name, id LIMIT 100`,
    ).bind(optionId, now).all<DeliveryServicePointSnapshotRow>();
    return Object.freeze(result.results.map((row) => Object.freeze(row)));
  }
}
