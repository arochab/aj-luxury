import type { CommerceD1Database, CommerceD1PreparedStatement } from "./d1-port.ts";
import { D1DeliveryOptionsStore } from "./d1-delivery-options-store.ts";
import { D1DeliveryReferenceStore } from "./d1-delivery-reference-store.ts";
import type { DeliveryProviderPorts, DeliveryQuoteOffer } from "./delivery-provider.ts";
import { DeliveryReferenceVault } from "./delivery-reference-vault.ts";
import {
  fingerprintCartLines,
  normalizeShippingAddress,
  sha256Hex,
  type ShippingAddressInput,
} from "./fulfillment-domain.ts";
import { resolveClientValidatedParcelProfile } from "./parcel-profiles.ts";
import { ProductionDeliveryError } from "./d1-production-delivery-store.ts";
import { calculateAjPackPricing } from "./pack-pricing.ts";

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
  currency: "EUR";
  duties_terms: "EU_INCLUDED" | "DAP" | "DDP";
}>;

type OptionRow = Readonly<{
  id: string;
  shipping_quote_id: string;
  cart_id: string;
  cart_revision: number;
  shipping_address_fingerprint: string;
  provider_code: string;
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
  selected_at: string | null;
}>;

type AuditReplay = Readonly<{ metadata_json: string }>;

export type PublicProductionDeliveryOptionV1 = Readonly<{
  optionId: string;
  quoteId: string;
  carrierCode: string;
  serviceCode: string;
  displayName: string;
  deliveryMode: "home" | "service_point";
  amountCents: number;
  currency: "EUR";
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  dutiesTerms: "EU_INCLUDED" | "DAP";
  expiresAt: string;
}>;

export type PublicProductionServicePointV1 = Readonly<{
  servicePointId: string;
  optionId: string;
  displayName: string;
  postalCode: string;
  city: string;
  countryCode: string;
  openingHoursSummary: string | null;
  expiresAt: string;
}>;

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

function assertIdempotencyKey(value: string): void {
  if (!IDEMPOTENCY_PATTERN.test(value)) {
    throw new ProductionDeliveryError("INVALID_INPUT", "Idempotency key is invalid.");
  }
}

async function normalizeProductionLaunchAddress(input: ShippingAddressInput) {
  const address = await normalizeShippingAddress(input);
  if (address.address.countryCode !== "FR") {
    throw new ProductionDeliveryError(
      "INVALID_INPUT",
      "Production delivery is available only in France.",
    );
  }
  return address;
}

function routingProof(zone: "EU" | "UK" | "US" | "CA"): string {
  switch (zone) {
    case "EU": return JSON.stringify({ countryCode: "FR", postalCode: "00000", regionCode: null });
    case "UK": return JSON.stringify({ countryCode: "GB", postalCode: "AA0", regionCode: null });
    case "US": return JSON.stringify({ countryCode: "US", postalCode: "00000", regionCode: "NY" });
    case "CA": return JSON.stringify({ countryCode: "CA", postalCode: "A0A", regionCode: null });
  }
}

function publicOption(row: OptionRow): PublicProductionDeliveryOptionV1 {
  if (row.currency !== "EUR" || row.duties_terms === "DDP") {
    throw new ProductionDeliveryError("PERSISTENCE_FAILURE", "Delivery snapshot is invalid.");
  }
  return Object.freeze({
    optionId: row.id,
    quoteId: row.shipping_quote_id,
    carrierCode: row.carrier_code,
    serviceCode: row.service_code,
    displayName: row.display_name,
    deliveryMode: row.delivery_mode,
    amountCents: row.amount_cents,
    currency: "EUR",
    estimatedDaysMin: row.estimated_days_min,
    estimatedDaysMax: row.estimated_days_max,
    dutiesTerms: row.duties_terms,
    expiresAt: row.expires_at,
  });
}

function validPointShape(point: Readonly<{
  displayName: string;
  postalCode: string;
  city: string;
  countryCode: string;
  openingHoursSummary: string | null;
}>): boolean {
  return point.displayName.length >= 1 && point.displayName.length <= 160 &&
    point.postalCode.length >= 1 && point.postalCode.length <= 16 &&
    point.city.length >= 1 && point.city.length <= 120 &&
    /^[A-Z]{2}$/.test(point.countryCode) &&
    (point.openingHoursSummary === null || point.openingHoursSummary.length <= 500);
}

export class D1ProductionDeliveryActivationStore {
  readonly #database: CommerceD1Database;
  readonly #provider: DeliveryProviderPorts;
  readonly #vault: DeliveryReferenceVault;
  readonly #references: D1DeliveryReferenceStore;

  constructor(
    database: CommerceD1Database,
    provider: DeliveryProviderPorts,
    vault: DeliveryReferenceVault,
  ) {
    this.#database = database;
    this.#provider = provider;
    this.#vault = vault;
    this.#references = new D1DeliveryReferenceStore(database, vault);
  }

  async quoteOptions(input: Readonly<{
    cartId: string;
    address: ShippingAddressInput;
    idempotencyKey: string;
    now: string;
  }>): Promise<readonly PublicProductionDeliveryOptionV1[]> {
    assertIdempotencyKey(input.idempotencyKey);
    const address = await normalizeProductionLaunchAddress(input.address);
    const replayKey = `delivery-options:${await sha256Hex(`${input.cartId}\0${input.idempotencyKey}`)}`;
    const replay = await this.#database.prepare(
      `SELECT metadata_json FROM audit_log WHERE idempotency_key = ?`,
    ).bind(replayKey).first<AuditReplay>();
    if (replay) return this.#readOptionReplay(replay, input.cartId, address.fingerprint);

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
        `SELECT id, currency, duties_terms FROM shipping_zone_configurations
        WHERE zone = ? AND status = 'active' LIMIT 1`,
      ).bind(address.zone).first<ConfigurationRow>(),
    ]);
    const lines = lineResult.results;
    const parcel = resolveClientValidatedParcelProfile(lines);
    const expectedDuties = address.zone === "EU" ? "EU_INCLUDED" : "DAP";
    if (!cart || !parcel || lines.length < 1 || !configuration ||
      configuration.currency !== "EUR" || configuration.duties_terms !== expectedDuties) {
      throw new ProductionDeliveryError("CART_UNAVAILABLE", "The cart cannot be quoted.");
    }
    let subtotalCents: number;
    try {
      subtotalCents = calculateAjPackPricing(lines.map((line) => ({
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents,
      }))).subtotalCents;
    } catch {
      throw new ProductionDeliveryError(
        "CART_UNAVAILABLE",
        "The cart pack configuration is invalid.",
      );
    }
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
    // The provider response is the price/ETA authority. D1 continues to govern
    // launch zone, currency, duties policy and the validated parcel profile;
    // no synthetic/demo amount is ever promoted into a commercial quote.
    const acceptedOffers = offers.filter((offer) =>
      (offer.deliveryMode === "home" || offer.deliveryMode === "service_point") &&
      offer.currency === "EUR" && offer.dutiesTerms === expectedDuties &&
      offer.expiresAt > input.now && offer.expiresAt <= cart.expires_at
    ).slice(0, 20);
    if (acceptedOffers.length < 1) {
      throw new ProductionDeliveryError("NO_HOME_OPTION", "No reviewed delivery option is available.");
    }
    const cartFingerprint = await fingerprintCartLines(input.cartId, lines.map((line) => ({
      variantId: line.variant_id,
      quantity: line.quantity,
      unitPriceCents: line.unit_price_cents,
    })));
    const statements: CommerceD1PreparedStatement[] = [];
    const optionIds: string[] = [];
    for (const offer of acceptedOffers) {
      const optionHash = await sha256Hex(
        `${requestHash}\0${offer.providerCode}\0${offer.providerQuoteReference}`,
      );
      const quoteId = `quote_${optionHash}`;
      const optionId = `delivery_${optionHash}`;
      const sealed = await this.#vault.seal({
        providerCode: offer.providerCode,
        referenceKind: "delivery_quote",
        ownerId: optionId,
        rawReference: offer.providerQuoteReference,
      });
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
          quoteId, input.cartId, cartFingerprint, cart.fulfillment_revision,
          configuration.id, routingProof(address.zone), address.fingerprint,
          offer.responseFingerprint, offer.amountCents, offer.estimatedDaysMin,
          offer.estimatedDaysMax, offer.dutiesTerms, offer.expiresAt, input.now,
        ),
        this.#database.prepare(
          `INSERT INTO shipping_quote_parcel_snapshots (
            quote_id, profile_code, source_version, item_count, weight_grams,
            length_mm, width_mm, height_mm, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          quoteId, parcel.profileCode, parcel.sourceVersion, parcel.itemCount,
          parcel.weightGrams, parcel.lengthMm, parcel.widthMm, parcel.heightMm,
          input.now,
        ),
        this.#database.prepare(
          `INSERT INTO delivery_option_snapshots (
            id, cart_id, cart_revision, shipping_quote_id,
            shipping_address_fingerprint, provider_code, carrier_code,
            service_code, display_name, delivery_mode, amount_cents, currency,
            estimated_days_min, estimated_days_max, duties_terms, proof_kind,
            provider_quote_reference_hash, provider_receipt_fingerprint,
            quoted_at, expires_at, selected_at, selected_service_point_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?,
            'provider_api_response', ?, ?, ?, ?, NULL, NULL, ?)`,
        ).bind(
          optionId, input.cartId, cart.fulfillment_revision, quoteId,
          address.fingerprint, offer.providerCode, offer.carrierCode,
          offer.serviceCode, offer.displayName, offer.deliveryMode,
          offer.amountCents, offer.estimatedDaysMin, offer.estimatedDaysMax,
          offer.dutiesTerms, sealed.referenceSha256, offer.responseFingerprint,
          input.now, offer.expiresAt, input.now,
        ),
        this.#references.preparePut(sealed, input.now),
      );
      optionIds.push(optionId);
    }
    const metadata = JSON.stringify({
      addressFingerprint: address.fingerprint,
      cartId: input.cartId,
      optionIds,
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
      if (raced) return this.#readOptionReplay(raced, input.cartId, address.fingerprint);
      throw new ProductionDeliveryError(
        "PERSISTENCE_FAILURE",
        "Delivery options could not be persisted.",
        { cause: error },
      );
    }
    return this.#readOptions(optionIds, input.cartId, address.fingerprint);
  }

  async servicePoints(input: Readonly<{
    cartId: string;
    optionId: string;
    address: ShippingAddressInput;
    idempotencyKey: string;
    now: string;
  }>): Promise<readonly PublicProductionServicePointV1[]> {
    assertIdempotencyKey(input.idempotencyKey);
    const address = await normalizeProductionLaunchAddress(input.address);
    const option = await this.#readCurrentOption(
      input.optionId,
      input.cartId,
      address.fingerprint,
      input.now,
    );
    if (option.delivery_mode !== "service_point") return Object.freeze([]);
    const replayKey = `delivery-points:${await sha256Hex(
      `${input.cartId}\0${input.optionId}\0${input.idempotencyKey}`,
    )}`;
    const replay = await this.#database.prepare(
      `SELECT metadata_json FROM audit_log WHERE idempotency_key = ?`,
    ).bind(replayKey).first<AuditReplay>();
    if (replay) return this.#readPointReplay(replay, option);

    let providerQuoteReference: string;
    try {
      providerQuoteReference = await this.#references.open("delivery_quote", option.id);
    } catch (error) {
      throw new ProductionDeliveryError(
        "PERSISTENCE_FAILURE",
        "Delivery reference could not be authenticated.",
        { cause: error },
      );
    }
    let points: Awaited<ReturnType<DeliveryProviderPorts["servicePoints"]["servicePoints"]>>;
    try {
      points = await this.#provider.servicePoints.servicePoints(Object.freeze({
        requestId: `points_${await sha256Hex(replayKey)}`,
        providerQuoteReference,
        countryCode: address.address.countryCode,
        postalCode: address.address.postalCode,
        city: address.address.city,
        carrierCode: option.carrier_code,
      }));
    } catch (error) {
      throw new ProductionDeliveryError(
        "PROVIDER_UNAVAILABLE",
        "Service points are temporarily unavailable.",
        { cause: error },
      );
    } finally {
      providerQuoteReference = "";
    }
    const accepted: Array<{
      point: (typeof points)[number];
      pointHash: string;
    }> = [];
    const seenPointReferences = new Set<string>();
    for (const point of points) {
      if (!validPointShape(point)) continue;
      const pointHash = await sha256Hex(point.providerPointReference);
      if (seenPointReferences.has(pointHash)) continue;
      seenPointReferences.add(pointHash);
      accepted.push({ point, pointHash });
      if (accepted.length === 100) break;
    }
    const statements: CommerceD1PreparedStatement[] = [];
    const pointIds: string[] = [];
    for (const { point, pointHash } of accepted) {
      const pointId = `point_${await sha256Hex(`${option.id}\0${point.providerPointReference}`)}`;
      const sealed = await this.#vault.seal({
        providerCode: option.provider_code,
        referenceKind: "service_point",
        ownerId: pointId,
        rawReference: point.providerPointReference,
      });
      statements.push(
        this.#database.prepare(
          `INSERT OR IGNORE INTO delivery_service_point_snapshots (
            id, delivery_option_id, provider_point_reference_hash, display_name,
            postal_code, city, country_code, opening_hours_summary,
            expires_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          pointId, option.id, pointHash, point.displayName, point.postalCode,
          point.city, point.countryCode, point.openingHoursSummary,
          option.expires_at, input.now,
        ),
        this.#references.preparePut(sealed, input.now),
      );
      pointIds.push(pointId);
    }
    const metadata = JSON.stringify({
      addressFingerprint: address.fingerprint,
      cartId: input.cartId,
      optionId: option.id,
      pointIds,
    });
    statements.push(this.#database.prepare(
      `INSERT INTO audit_log (
        id, actor_type, actor_id, action, entity_type, entity_id,
        idempotency_key, metadata_json, created_at
      ) VALUES (?, 'system', NULL, 'delivery_service_points_quoted',
        'delivery_option', ?, ?, ?, ?)`,
    ).bind(`audit_${await sha256Hex(replayKey)}`, option.id, replayKey, metadata, input.now));
    try {
      await this.#database.batch(statements);
    } catch (error) {
      const raced = await this.#database.prepare(
        `SELECT metadata_json FROM audit_log WHERE idempotency_key = ?`,
      ).bind(replayKey).first<AuditReplay>();
      if (raced) return this.#readPointReplay(raced, option);
      throw new ProductionDeliveryError(
        "PERSISTENCE_FAILURE",
        "Service-point snapshots could not be persisted.",
        { cause: error },
      );
    }
    return this.#readPoints(pointIds, option);
  }

  async selectOption(input: Readonly<{
    cartId: string;
    optionId: string;
    servicePointId?: string | null;
    address: ShippingAddressInput;
    now: string;
  }>): Promise<PublicProductionDeliveryOptionV1> {
    const address = await normalizeProductionLaunchAddress(input.address);
    const option = await new D1DeliveryOptionsStore(this.#database).selectOption({
      optionId: input.optionId,
      cartId: input.cartId,
      addressFingerprint: address.fingerprint,
      now: input.now,
      servicePointId: input.servicePointId,
    });
    return publicOption(option as OptionRow);
  }

  async #readCurrentOption(
    optionId: string,
    cartId: string,
    addressFingerprint: string,
    now: string,
  ): Promise<OptionRow> {
    const [option, cart] = await Promise.all([
      this.#database.prepare(
        `SELECT id, shipping_quote_id, cart_id, cart_revision,
          shipping_address_fingerprint, provider_code, carrier_code,
          service_code, display_name, delivery_mode, amount_cents, currency,
          estimated_days_min, estimated_days_max, duties_terms, expires_at,
          selected_at FROM delivery_option_snapshots WHERE id = ? AND cart_id = ?`,
      ).bind(optionId, cartId).first<OptionRow>(),
      this.#database.prepare(
        `SELECT status, fulfillment_revision FROM carts WHERE id = ?`,
      ).bind(cartId).first<{ status: string; fulfillment_revision: number }>(),
    ]);
    if (!option || !cart || cart.status !== "open" || option.selected_at !== null ||
      option.cart_revision !== cart.fulfillment_revision || option.expires_at <= now ||
      option.shipping_address_fingerprint !== addressFingerprint ||
      option.currency !== "EUR" || option.duties_terms === "DDP") {
      throw new ProductionDeliveryError("CART_UNAVAILABLE", "Delivery option is unavailable.");
    }
    return option;
  }

  async #readOptionReplay(
    replay: AuditReplay,
    cartId: string,
    addressFingerprint: string,
  ): Promise<readonly PublicProductionDeliveryOptionV1[]> {
    const metadata = this.#metadata(replay);
    if (metadata.cartId !== cartId || metadata.addressFingerprint !== addressFingerprint ||
      !Array.isArray(metadata.optionIds) || metadata.optionIds.length < 1 ||
      metadata.optionIds.length > 20 || metadata.optionIds.some((id) => typeof id !== "string")) {
      throw new ProductionDeliveryError("IDEMPOTENCY_CONFLICT", "Delivery replay conflicts.");
    }
    return this.#readOptions(metadata.optionIds as string[], cartId, addressFingerprint);
  }

  async #readOptions(
    optionIds: readonly string[],
    cartId: string,
    addressFingerprint: string,
  ): Promise<readonly PublicProductionDeliveryOptionV1[]> {
    const options: PublicProductionDeliveryOptionV1[] = [];
    for (const id of optionIds) {
      const row = await this.#database.prepare(
        `SELECT option.id, option.shipping_quote_id, option.cart_id,
          option.cart_revision, option.shipping_address_fingerprint,
          option.provider_code, option.carrier_code, option.service_code,
          option.display_name, option.delivery_mode, option.amount_cents,
          option.currency, option.estimated_days_min, option.estimated_days_max,
          option.duties_terms, option.expires_at, option.selected_at
        FROM delivery_option_snapshots AS option
        INNER JOIN delivery_provider_reference_vault AS sealed
          ON sealed.reference_kind = 'delivery_quote'
          AND sealed.owner_id = option.id
          AND sealed.provider_code = option.provider_code
          AND sealed.reference_sha256 = option.provider_quote_reference_hash
        WHERE option.id = ? AND option.cart_id = ?
          AND option.shipping_address_fingerprint = ?`,
      ).bind(id, cartId, addressFingerprint).first<OptionRow>();
      if (!row) {
        throw new ProductionDeliveryError("IDEMPOTENCY_CONFLICT", "Delivery replay is incomplete.");
      }
      options.push(publicOption(row));
    }
    return Object.freeze(options);
  }

  async #readPointReplay(
    replay: AuditReplay,
    option: OptionRow,
  ): Promise<readonly PublicProductionServicePointV1[]> {
    const metadata = this.#metadata(replay);
    if (metadata.cartId !== option.cart_id || metadata.optionId !== option.id ||
      metadata.addressFingerprint !== option.shipping_address_fingerprint ||
      !Array.isArray(metadata.pointIds) || metadata.pointIds.length > 100 ||
      metadata.pointIds.some((id) => typeof id !== "string")) {
      throw new ProductionDeliveryError("IDEMPOTENCY_CONFLICT", "Service-point replay conflicts.");
    }
    return this.#readPoints(metadata.pointIds as string[], option);
  }

  async #readPoints(
    pointIds: readonly string[],
    option: OptionRow,
  ): Promise<readonly PublicProductionServicePointV1[]> {
    const publicPoints: PublicProductionServicePointV1[] = [];
    for (const id of pointIds) {
      const point = await this.#database.prepare(
        `SELECT point.id, point.delivery_option_id, point.display_name,
          point.postal_code, point.city, point.country_code,
          point.opening_hours_summary, point.expires_at
        FROM delivery_service_point_snapshots AS point
        INNER JOIN delivery_provider_reference_vault AS sealed
          ON sealed.reference_kind = 'service_point'
          AND sealed.owner_id = point.id
          AND sealed.provider_code = ?
          AND sealed.reference_sha256 = point.provider_point_reference_hash
        WHERE point.id = ? AND point.delivery_option_id = ?
          AND point.expires_at = ?`,
      ).bind(option.provider_code, id, option.id, option.expires_at).first<{
        id: string;
        delivery_option_id: string;
        display_name: string;
        postal_code: string;
        city: string;
        country_code: string;
        opening_hours_summary: string | null;
        expires_at: string;
      }>();
      if (!point) {
        throw new ProductionDeliveryError("IDEMPOTENCY_CONFLICT", "Service-point replay is incomplete.");
      }
      publicPoints.push(Object.freeze({
        servicePointId: point.id,
        optionId: point.delivery_option_id,
        displayName: point.display_name,
        postalCode: point.postal_code,
        city: point.city,
        countryCode: point.country_code,
        openingHoursSummary: point.opening_hours_summary,
        expiresAt: point.expires_at,
      }));
    }
    return Object.freeze(publicPoints);
  }

  #metadata(replay: AuditReplay): Record<string, unknown> {
    try {
      const metadata: unknown = JSON.parse(replay.metadata_json);
      if (typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)) {
        return metadata as Record<string, unknown>;
      }
    } catch {
      // Fail closed below without reflecting persisted content.
    }
    throw new ProductionDeliveryError("IDEMPOTENCY_CONFLICT", "Delivery replay is invalid.");
  }
}
