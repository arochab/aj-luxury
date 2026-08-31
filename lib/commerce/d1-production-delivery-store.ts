import type { CommerceD1Database, CommerceD1PreparedStatement } from "./d1-port.ts";
import type {
  DeliveryProviderPorts,
  DeliveryQuoteOffer,
} from "./delivery-provider.ts";
import {
  fingerprintCartLines,
  normalizeShippingAddress,
  sha256Hex,
  type ShippingAddressInput,
} from "./fulfillment-domain.ts";
import type { LaunchShippingZone } from "./shipping-policy.ts";
import { resolveClientValidatedParcelProfile } from "./parcel-profiles.ts";

export class ProductionDeliveryError extends Error {
  readonly code:
    | "INVALID_INPUT"
    | "CART_UNAVAILABLE"
    | "PROVIDER_UNAVAILABLE"
    | "NO_HOME_OPTION"
    | "IDEMPOTENCY_CONFLICT"
    | "PERSISTENCE_FAILURE"
    | "SERVICE_POINT_NOT_ACTIVATED";

  constructor(code: ProductionDeliveryError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProductionDeliveryError";
    this.code = code;
  }
}

type CartRow = Readonly<{
  id: string;
  status: string;
  expires_at: string;
  fulfillment_revision: number;
}>;

type CartLineRow = Readonly<{
  variant_id: string;
  quantity: number;
  unit_price_cents: number;
}>;

type ConfigurationRow = Readonly<{
  id: string;
  duties_terms: "EU_INCLUDED" | "DAP" | "DDP";
}>;

export type PublicProductionDeliveryOption = Readonly<{
  optionId: string;
  quoteId: string;
  carrierCode: string;
  serviceCode: string;
  displayName: string;
  deliveryMode: "home";
  amountCents: number;
  currency: "EUR";
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  dutiesTerms: "EU_INCLUDED" | "DAP";
  expiresAt: string;
}>;

type AuditReplay = Readonly<{
  metadata_json: string;
}>;

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

function assertIdempotencyKey(value: string): void {
  if (!IDEMPOTENCY_PATTERN.test(value)) {
    throw new ProductionDeliveryError("INVALID_INPUT", "Idempotency key is invalid.");
  }
}

function routingProof(zone: LaunchShippingZone): string {
  switch (zone) {
    case "EU": return JSON.stringify({ countryCode: "FR", postalCode: "00000", regionCode: null });
    case "UK": return JSON.stringify({ countryCode: "GB", postalCode: "AA0", regionCode: null });
    case "US": return JSON.stringify({ countryCode: "US", postalCode: "00000", regionCode: "NY" });
    case "CA": return JSON.stringify({ countryCode: "CA", postalCode: "A0A", regionCode: null });
    case "GCC": return JSON.stringify({ countryCode: "AE", postalCode: "", regionCode: null });
  }
}

export class D1ProductionDeliveryStore {
  readonly #database: CommerceD1Database;
  readonly #provider: DeliveryProviderPorts;

  constructor(database: CommerceD1Database, provider: DeliveryProviderPorts) {
    this.#database = database;
    this.#provider = provider;
  }

  async quoteHomeOptions(input: Readonly<{
    cartId: string;
    address: ShippingAddressInput;
    idempotencyKey: string;
    now: string;
  }>): Promise<readonly PublicProductionDeliveryOption[]> {
    assertIdempotencyKey(input.idempotencyKey);
    const address = await normalizeShippingAddress(input.address);
    if (address.zone !== "EU" && !address.address.phone) {
      throw new ProductionDeliveryError(
        "INVALID_INPUT",
        "A valid international phone number is required.",
      );
    }
    const replayKey = `delivery-options:${await sha256Hex(
      `${input.cartId}\0${input.idempotencyKey}`,
    )}`;
    const replay = await this.#database.prepare(
      `SELECT metadata_json FROM audit_log WHERE idempotency_key = ?`,
    ).bind(replayKey).first<AuditReplay>();
    if (replay) return this.#readReplay(replay, input.cartId, address.fingerprint);

    const [cart, lineResult, configuration] = await Promise.all([
      this.#database.prepare(
        `SELECT id, status, expires_at, fulfillment_revision FROM carts
        WHERE id = ? AND status = 'open' AND expires_at > ?`,
      ).bind(input.cartId, input.now).first<CartRow>(),
      this.#database.prepare(
        `SELECT variant_id, quantity, unit_price_cents FROM cart_lines
        WHERE cart_id = ? ORDER BY variant_id`,
      ).bind(input.cartId).all<CartLineRow>(),
      this.#database.prepare(
        `SELECT id, duties_terms FROM shipping_zone_configurations
        WHERE zone = ? AND status = 'active' LIMIT 1`,
      ).bind(address.zone).first<ConfigurationRow>(),
    ]);
    const lines = lineResult.results;
    const parcel = resolveClientValidatedParcelProfile(lines);
    if (!cart || !parcel || lines.length < 1) {
      throw new ProductionDeliveryError("CART_UNAVAILABLE", "The cart cannot be quoted.");
    }
    const expectedDuties = address.zone === "EU" ? "EU_INCLUDED" : "DAP";
    if (!configuration || configuration.duties_terms !== expectedDuties) {
      throw new ProductionDeliveryError(
        "CART_UNAVAILABLE",
        "The launch-zone delivery policy is unavailable.",
      );
    }
    const subtotalCents = lines.reduce(
      (total, line) => total + line.quantity * line.unit_price_cents,
      0,
    );
    const requestHash = await sha256Hex(
      `${input.cartId}\0${input.idempotencyKey}\0${address.fingerprint}`,
    );
    let offers: readonly DeliveryQuoteOffer[];
    try {
      offers = await this.#provider.quotes.quote(Object.freeze({
        requestId: `quote_${requestHash}`,
        now: input.now,
        ttlSeconds: 15 * 60,
        originCountryCode: "FR",
        dutiesTerms: expectedDuties,
        subtotalCents,
        destination: Object.freeze({
          countryCode: address.address.countryCode,
          postalCode: address.address.postalCode,
          city: address.address.city,
        }),
        parcel,
      }));
    } catch (error) {
      throw new ProductionDeliveryError(
        "PROVIDER_UNAVAILABLE",
        "Delivery rates are temporarily unavailable.",
        { cause: error },
      );
    }
    // 0010 cannot retain the provider reference required to purchase a relay
    // point. Persist and sell home options only until additive migration 0011.
    const homeOffers = offers.filter((offer) =>
      offer.deliveryMode === "home" && offer.currency === "EUR" &&
      offer.dutiesTerms === expectedDuties && offer.expiresAt > input.now &&
      offer.expiresAt <= cart.expires_at
    ).slice(0, 20);
    if (homeOffers.length < 1) {
      throw new ProductionDeliveryError("NO_HOME_OPTION", "No home-delivery option is available.");
    }
    const cartFingerprint = await fingerprintCartLines(input.cartId, lines.map((line) => ({
      variantId: line.variant_id,
      quantity: line.quantity,
      unitPriceCents: line.unit_price_cents,
    })));
    const statements: CommerceD1PreparedStatement[] = [];
    const publicOptions: PublicProductionDeliveryOption[] = [];
    for (const offer of homeOffers) {
      const optionHash = await sha256Hex(
        `${requestHash}\0${offer.providerCode}\0${offer.providerQuoteReference}`,
      );
      const quoteId = `quote_${optionHash}`;
      const optionId = `delivery_${optionHash}`;
      const providerReferenceHash = await sha256Hex(offer.providerQuoteReference);
      statements.push(
        this.#database.prepare(
          `INSERT INTO shipping_quotes (
            id, cart_id, cart_fingerprint, cart_revision, configuration_id,
            shipping_address_json, shipping_address_fingerprint,
            provider_quote_reference, provider_receipt_fingerprint,
            amount_cents, currency, estimated_days_min, estimated_days_max,
            duties_terms, expires_at, selected_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'EUR', ?, ?, ?, ?, NULL, ?)`,
        ).bind(
          quoteId,
          input.cartId,
          cartFingerprint,
          cart.fulfillment_revision,
          configuration.id,
          routingProof(address.zone),
          address.fingerprint,
          offer.responseFingerprint,
          offer.amountCents,
          offer.estimatedDaysMin,
          offer.estimatedDaysMax,
          offer.dutiesTerms,
          offer.expiresAt,
          input.now,
        ),
        this.#database.prepare(
          `INSERT INTO shipping_quote_parcel_snapshots (
            quote_id, profile_code, source_version, item_count, weight_grams,
            length_mm, width_mm, height_mm, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          quoteId,
          parcel.profileCode,
          parcel.sourceVersion,
          parcel.itemCount,
          parcel.weightGrams,
          parcel.lengthMm,
          parcel.widthMm,
          parcel.heightMm,
          input.now,
        ),
        this.#database.prepare(
          `INSERT INTO delivery_option_snapshots (
            id, cart_id, cart_revision, shipping_quote_id,
            shipping_address_fingerprint, provider_code, carrier_code,
            service_code, display_name, delivery_mode, amount_cents, currency,
            estimated_days_min, estimated_days_max, duties_terms, proof_kind,
            provider_quote_reference_hash, provider_receipt_fingerprint,
            quoted_at, expires_at, selected_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'home', ?, 'EUR', ?, ?, ?,
            'provider_api_response', ?, ?, ?, ?, NULL, ?)`,
        ).bind(
          optionId,
          input.cartId,
          cart.fulfillment_revision,
          quoteId,
          address.fingerprint,
          offer.providerCode,
          offer.carrierCode,
          offer.serviceCode,
          offer.displayName,
          offer.amountCents,
          offer.estimatedDaysMin,
          offer.estimatedDaysMax,
          offer.dutiesTerms,
          providerReferenceHash,
          offer.responseFingerprint,
          input.now,
          offer.expiresAt,
          input.now,
        ),
      );
      publicOptions.push(Object.freeze({
        optionId,
        quoteId,
        carrierCode: offer.carrierCode,
        serviceCode: offer.serviceCode,
        displayName: offer.displayName,
        deliveryMode: "home",
        amountCents: offer.amountCents,
        currency: "EUR",
        estimatedDaysMin: offer.estimatedDaysMin,
        estimatedDaysMax: offer.estimatedDaysMax,
        dutiesTerms: expectedDuties,
        expiresAt: offer.expiresAt,
      }));
    }
    const metadata = JSON.stringify({
      addressFingerprint: address.fingerprint,
      cartId: input.cartId,
      optionIds: publicOptions.map((option) => option.optionId),
    });
    statements.push(this.#database.prepare(
      `INSERT INTO audit_log (
        id, actor_type, actor_id, action, entity_type, entity_id,
        idempotency_key, metadata_json, created_at
      ) VALUES (?, 'system', NULL, 'delivery_options_quoted', 'cart', ?, ?, ?, ?)`,
    ).bind(`audit_${requestHash}`, input.cartId, replayKey, metadata, input.now));
    try {
      await this.#database.batch(statements);
    } catch (error) {
      const raced = await this.#database.prepare(
        `SELECT metadata_json FROM audit_log WHERE idempotency_key = ?`,
      ).bind(replayKey).first<AuditReplay>();
      if (raced) return this.#readReplay(raced, input.cartId, address.fingerprint);
      throw new ProductionDeliveryError(
        "PERSISTENCE_FAILURE",
        "Delivery options could not be persisted.",
        { cause: error },
      );
    }
    return Object.freeze(publicOptions);
  }

  async selectHomeOption(input: Readonly<{
    cartId: string;
    optionId: string;
    address: ShippingAddressInput;
    now: string;
  }>): Promise<PublicProductionDeliveryOption> {
    const address = await normalizeShippingAddress(input.address);
    const row = await this.#database.prepare(
      `SELECT id, shipping_quote_id, cart_id, carrier_code, service_code,
        display_name, delivery_mode, amount_cents, currency,
        estimated_days_min, estimated_days_max, duties_terms, expires_at,
        shipping_address_fingerprint, cart_revision
      FROM delivery_option_snapshots WHERE id = ? AND cart_id = ?`,
    ).bind(input.optionId, input.cartId).first<{
      id: string;
      shipping_quote_id: string;
      cart_id: string;
      carrier_code: string;
      service_code: string;
      display_name: string;
      delivery_mode: "home" | "service_point";
      amount_cents: number;
      currency: "EUR";
      estimated_days_min: number;
      estimated_days_max: number;
      duties_terms: "EU_INCLUDED" | "DAP" | "DDP";
      expires_at: string;
      shipping_address_fingerprint: string;
      cart_revision: number;
    }>();
    const cart = await this.#database.prepare(
      `SELECT status, fulfillment_revision FROM carts WHERE id = ?`,
    ).bind(input.cartId).first<{ status: string; fulfillment_revision: number }>();
    if (row?.delivery_mode === "service_point") {
      throw new ProductionDeliveryError(
        "SERVICE_POINT_NOT_ACTIVATED",
        "Service-point purchase requires migration 0011.",
      );
    }
    if (
      !row || !cart || cart.status !== "open" ||
      cart.fulfillment_revision !== row.cart_revision || row.expires_at <= input.now ||
      row.shipping_address_fingerprint !== address.fingerprint || row.currency !== "EUR" ||
      row.duties_terms === "DDP"
    ) {
      throw new ProductionDeliveryError("CART_UNAVAILABLE", "Delivery option is unavailable.");
    }
    return Object.freeze({
      optionId: row.id,
      quoteId: row.shipping_quote_id,
      carrierCode: row.carrier_code,
      serviceCode: row.service_code,
      displayName: row.display_name,
      deliveryMode: "home",
      amountCents: row.amount_cents,
      currency: "EUR",
      estimatedDaysMin: row.estimated_days_min,
      estimatedDaysMax: row.estimated_days_max,
      dutiesTerms: row.duties_terms,
      expiresAt: row.expires_at,
    });
  }

  async #readReplay(
    replay: AuditReplay,
    cartId: string,
    addressFingerprint: string,
  ): Promise<readonly PublicProductionDeliveryOption[]> {
    let metadata: unknown;
    try {
      metadata = JSON.parse(replay.metadata_json);
    } catch {
      throw new ProductionDeliveryError("IDEMPOTENCY_CONFLICT", "Delivery replay is invalid.");
    }
    if (
      typeof metadata !== "object" || metadata === null || Array.isArray(metadata) ||
      (metadata as { cartId?: unknown }).cartId !== cartId ||
      (metadata as { addressFingerprint?: unknown }).addressFingerprint !== addressFingerprint ||
      !Array.isArray((metadata as { optionIds?: unknown }).optionIds)
    ) {
      throw new ProductionDeliveryError("IDEMPOTENCY_CONFLICT", "Delivery replay conflicts.");
    }
    const optionIds = (metadata as { optionIds: unknown[] }).optionIds;
    if (optionIds.length < 1 || optionIds.length > 20 ||
      optionIds.some((id) => typeof id !== "string")) {
      throw new ProductionDeliveryError("IDEMPOTENCY_CONFLICT", "Delivery replay is invalid.");
    }
    const options: PublicProductionDeliveryOption[] = [];
    for (const id of optionIds as string[]) {
      const row = await this.#database.prepare(
        `SELECT id, shipping_quote_id, carrier_code, service_code, display_name,
          delivery_mode, amount_cents, currency, estimated_days_min,
          estimated_days_max, duties_terms, expires_at
        FROM delivery_option_snapshots WHERE id = ? AND cart_id = ?
          AND shipping_address_fingerprint = ?`,
      ).bind(id, cartId, addressFingerprint).first<{
        id: string;
        shipping_quote_id: string;
        carrier_code: string;
        service_code: string;
        display_name: string;
        delivery_mode: "home" | "service_point";
        amount_cents: number;
        currency: "EUR";
        estimated_days_min: number;
        estimated_days_max: number;
        duties_terms: "EU_INCLUDED" | "DAP" | "DDP";
        expires_at: string;
      }>();
      if (!row || row.delivery_mode !== "home" || row.currency !== "EUR" || row.duties_terms === "DDP") {
        throw new ProductionDeliveryError("IDEMPOTENCY_CONFLICT", "Delivery replay is incomplete.");
      }
      options.push(Object.freeze({
        optionId: row.id,
        quoteId: row.shipping_quote_id,
        carrierCode: row.carrier_code,
        serviceCode: row.service_code,
        displayName: row.display_name,
        deliveryMode: "home",
        amountCents: row.amount_cents,
        currency: "EUR",
        estimatedDaysMin: row.estimated_days_min,
        estimatedDaysMax: row.estimated_days_max,
        dutiesTerms: row.duties_terms,
        expiresAt: row.expires_at,
      }));
    }
    return Object.freeze(options);
  }
}
