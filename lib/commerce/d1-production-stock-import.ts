import { D1CommerceStore } from "./d1-commerce-store.ts";
import { launchVariantSeed } from "../../db/seed.ts";
import type { CommerceD1Database, CommerceD1PreparedStatement } from "./d1-port.ts";
import { isCanonicalUtcTimestamp } from "./account-security.ts";
import { validateLaunchStockImport } from "./launch-stock-import.ts";
import {
  LAUNCH_CURRENT_PHYSICAL_QUANTITY,
  LAUNCH_CURRENT_SELLABLE_QUANTITY,
  LAUNCH_REMAINING_GIFT_RESERVE_QUANTITY,
} from "./launch-inventory.ts";
import {
  createProductionProviderConfigurationAttestation,
  type ProductionProviderConfigurationAttestation,
  type ProductionProviderIdentities,
} from "./production-provider-configuration.ts";

const SHA_1 = /^[0-9a-f]{40}$/;
const WORKER_VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ProductionStockImportError extends Error {
  readonly code:
    | "INVALID_RELEASE"
    | "ACTIVATION_PRECEDES_APPROVAL"
    | "DATABASE_NOT_EMPTY"
    | "IMPORT_CONFLICT"
    | "IMPORT_PROOF_FAILED"
    | "INVALID_PROVIDER_CONFIGURATION";

  constructor(code: ProductionStockImportError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProductionStockImportError";
    this.code = code;
  }
}

export type ProductionStockImportInput = Readonly<{
  manifest: unknown;
  releaseSha: string;
  workerVersionId: string;
  activatedAt: string;
  providerIdentities: ProductionProviderIdentities;
}>;

export type ProductionStockImportReceipt = Readonly<{
  disposition: "activated" | "already-activated";
  manifestId: string;
  payloadSha256: string;
  releaseSha: string;
  workerVersionId: string;
  providerConfigurationSha256: string;
  physicalQuantity: 749;
  giftingReserveQuantity: 23;
  sellableQuantity: 726;
}>;

type CountRow = Readonly<{
  products: number;
  variants: number;
  inventory: number;
  orders: number;
  manifests: number;
}>;

type ExistingManifestRow = Readonly<{
  id: string;
  payload_sha256: string;
  release_sha: string;
  worker_version_id: string;
}>;

type ExistingProviderConfigurationRow = Readonly<{
  release_sha: string;
  worker_version_id: string;
  stock_manifest_id: string;
  protocol: string;
  configuration_sha256: string;
  stripe_account_id: string;
  sendcloud_integration_id: string;
  sendcloud_sender_address_id: string;
  resend_domain: string;
  commerce_origin: string;
  transactional_from_email: string;
}>;

type SeedOnlyRow = Readonly<{
  variant_id: string;
  product_id: string;
  internal_reference: string;
  physical_quantity: number;
  gift_reserve_quantity: number;
  safety_reserve_quantity: number;
  active_reserved_quantity: number;
  sold_quantity: number;
  reserves_validated: number;
  seed_movements: number;
  seed_quantity: number;
  non_seed_movements: number;
}>;

type ProofRow = Readonly<{
  variants: number;
  physical_quantity: number;
  gifting_reserve_quantity: number;
  safety_reserve_quantity: number;
  reserves_validated: number;
  gift_movements: number;
  gift_movement_quantity: number;
  manifest_lines: number;
  manifest_physical_quantity: number;
  manifest_gifting_reserve_quantity: number;
  manifest_sellable_quantity: number;
}>;

function receipt(
  disposition: ProductionStockImportReceipt["disposition"],
  manifestId: string,
  payloadSha256: string,
  releaseSha: string,
  workerVersionId: string,
  providerConfigurationSha256: string,
): ProductionStockImportReceipt {
  return Object.freeze({
    disposition,
    manifestId,
    payloadSha256,
    releaseSha,
    workerVersionId,
    providerConfigurationSha256,
    physicalQuantity: LAUNCH_CURRENT_PHYSICAL_QUANTITY,
    giftingReserveQuantity: LAUNCH_REMAINING_GIFT_RESERVE_QUANTITY,
    sellableQuantity: LAUNCH_CURRENT_SELLABLE_QUANTITY,
  });
}

function oneMillisecondAfter(value: string): string {
  return new Date(Date.parse(value) + 1).toISOString();
}

async function databaseCounts(database: CommerceD1Database): Promise<CountRow> {
  const result = await database.prepare(
    `SELECT
      (SELECT COUNT(*) FROM products) AS products,
      (SELECT COUNT(*) FROM variants) AS variants,
      (SELECT COUNT(*) FROM inventory) AS inventory,
      (SELECT COUNT(*) FROM orders) AS orders,
      (SELECT COUNT(*) FROM production_launch_stock_manifests) AS manifests`,
  ).first<CountRow>();
  if (!result) throw new ProductionStockImportError("IMPORT_PROOF_FAILED", "Production stock preflight returned no proof.");
  return result;
}

async function existingManifest(
  database: CommerceD1Database,
  manifestId: string,
): Promise<ExistingManifestRow | null> {
  return database.prepare(
    `SELECT id, payload_sha256, release_sha, worker_version_id
    FROM production_launch_stock_manifests WHERE id=?`,
  ).bind(manifestId).first<ExistingManifestRow>();
}

async function providerConfigurationProofMatches(
  database: CommerceD1Database,
  expected: ProductionProviderConfigurationAttestation,
): Promise<boolean> {
  const row = await database.prepare(
    `SELECT release_sha, worker_version_id, stock_manifest_id, protocol,
      configuration_sha256, stripe_account_id, sendcloud_integration_id,
      sendcloud_sender_address_id, resend_domain, commerce_origin,
      transactional_from_email
    FROM production_provider_configuration_attestations
    WHERE release_sha=? AND worker_version_id=? AND stock_manifest_id=?`,
  ).bind(
    expected.releaseSha,
    expected.workerVersionId,
    expected.stockManifestId,
  ).first<ExistingProviderConfigurationRow>();
  return row?.protocol === expected.protocol &&
    row.configuration_sha256 === expected.configurationSha256 &&
    row.stripe_account_id === expected.stripeAccountId &&
    row.sendcloud_integration_id === expected.sendcloudIntegrationId &&
    row.sendcloud_sender_address_id === expected.sendcloudSenderAddressId &&
    row.resend_domain === expected.resendDomain &&
    row.commerce_origin === expected.commerceOrigin &&
    row.transactional_from_email === expected.transactionalFromEmail;
}

async function seedOnlyCatalogMatches(
  database: CommerceD1Database,
  variants: readonly Readonly<{
    variantId: string;
    internalReference: string;
    physicalQuantity: number;
  }>[],
): Promise<boolean> {
  const result = await database.prepare(
    `SELECT variant.id AS variant_id, variant.product_id,
      variant.internal_reference, stock.physical_quantity,
      stock.gift_reserve_quantity, stock.safety_reserve_quantity,
      stock.active_reserved_quantity, stock.sold_quantity,
      stock.reserves_validated,
      (SELECT COUNT(*) FROM inventory_movements AS movement
        WHERE movement.variant_id=variant.id AND movement.kind='seed'
          AND movement.idempotency_key='seed:' || variant.id) AS seed_movements,
      (SELECT COALESCE(SUM(quantity), 0) FROM inventory_movements AS movement
        WHERE movement.variant_id=variant.id AND movement.kind='seed'
          AND movement.idempotency_key='seed:' || variant.id) AS seed_quantity,
      (SELECT COUNT(*) FROM inventory_movements WHERE kind<>'seed') AS non_seed_movements
    FROM variants AS variant
    INNER JOIN inventory AS stock ON stock.variant_id=variant.id
    ORDER BY variant.sort_order, variant.id`,
  ).all<SeedOnlyRow>();
  return result.success && result.results.length === variants.length &&
    result.results.every((row, index) => {
      const expected = variants[index];
      const seed = launchVariantSeed[index];
      return expected !== undefined && row.variant_id === expected.variantId &&
        seed !== undefined && seed.id === expected.variantId &&
        row.product_id === "product_apollon" &&
        row.internal_reference === expected.internalReference &&
        row.physical_quantity === seed.physicalQuantity &&
        row.gift_reserve_quantity === 0 && row.safety_reserve_quantity === 0 &&
        row.active_reserved_quantity === 0 && row.sold_quantity === 0 &&
        row.reserves_validated === 0 && row.seed_movements === 1 &&
        row.seed_quantity === seed.physicalQuantity && row.non_seed_movements === 0;
    });
}

async function verifyProof(
  database: CommerceD1Database,
  manifestId: string,
  payloadSha256: string,
): Promise<boolean> {
  const proof = await database.prepare(
    `SELECT
      (SELECT COUNT(*) FROM inventory WHERE variant_id IN (
        SELECT variant_id FROM production_launch_stock_manifest_lines WHERE manifest_id=?
      )) AS variants,
      (SELECT COALESCE(SUM(physical_quantity), 0) FROM inventory WHERE variant_id IN (
        SELECT variant_id FROM production_launch_stock_manifest_lines WHERE manifest_id=?
      )) AS physical_quantity,
      (SELECT COALESCE(SUM(gift_reserve_quantity), 0) FROM inventory WHERE variant_id IN (
        SELECT variant_id FROM production_launch_stock_manifest_lines WHERE manifest_id=?
      )) AS gifting_reserve_quantity,
      (SELECT COALESCE(SUM(safety_reserve_quantity), 0) FROM inventory WHERE variant_id IN (
        SELECT variant_id FROM production_launch_stock_manifest_lines WHERE manifest_id=?
      )) AS safety_reserve_quantity,
      (SELECT COALESCE(SUM(reserves_validated), 0) FROM inventory WHERE variant_id IN (
        SELECT variant_id FROM production_launch_stock_manifest_lines WHERE manifest_id=?
      )) AS reserves_validated,
      (SELECT COUNT(*) FROM inventory_movements WHERE kind='gift_allocation' AND reference_id=?) AS gift_movements,
      (SELECT COALESCE(SUM(quantity), 0) FROM inventory_movements WHERE kind='gift_allocation' AND reference_id=?) AS gift_movement_quantity,
      (SELECT COUNT(*) FROM production_launch_stock_manifest_lines WHERE manifest_id=?) AS manifest_lines,
      (SELECT COALESCE(SUM(physical_quantity), 0) FROM production_launch_stock_manifest_lines WHERE manifest_id=?) AS manifest_physical_quantity,
      (SELECT COALESCE(SUM(gifting_reserve_quantity), 0) FROM production_launch_stock_manifest_lines WHERE manifest_id=?) AS manifest_gifting_reserve_quantity,
      (SELECT COALESCE(SUM(sellable_quantity), 0) FROM production_launch_stock_manifest_lines WHERE manifest_id=?) AS manifest_sellable_quantity
    FROM production_launch_stock_manifests
    WHERE id=? AND payload_sha256=?`,
  ).bind(
    manifestId, manifestId, manifestId, manifestId, manifestId,
    manifestId, manifestId, manifestId, manifestId, manifestId, manifestId,
    manifestId, payloadSha256,
  ).first<ProofRow>();
  return proof?.variants === 12 &&
    proof.physical_quantity === LAUNCH_CURRENT_PHYSICAL_QUANTITY &&
    proof.gifting_reserve_quantity === LAUNCH_REMAINING_GIFT_RESERVE_QUANTITY &&
    proof.safety_reserve_quantity === 0 &&
    proof.reserves_validated === 12 && proof.gift_movements === 12 &&
    proof.gift_movement_quantity === LAUNCH_REMAINING_GIFT_RESERVE_QUANTITY &&
    proof.manifest_lines === 12 &&
    proof.manifest_physical_quantity === LAUNCH_CURRENT_PHYSICAL_QUANTITY &&
    proof.manifest_gifting_reserve_quantity === LAUNCH_REMAINING_GIFT_RESERVE_QUANTITY &&
    proof.manifest_sellable_quantity === LAUNCH_CURRENT_SELLABLE_QUANTITY;
}

/**
 * One-shot, exact-manifest activation for an otherwise empty production D1.
 * D1 batch keeps allocation, validation and immutable manifest rows atomic.
 * The launch catalog seed is independently idempotent and remains unsellable
 * if the activation batch fails.
 */
export async function activateProductionLaunchStock(
  database: CommerceD1Database,
  input: ProductionStockImportInput,
): Promise<ProductionStockImportReceipt> {
  if (!SHA_1.test(input.releaseSha) || !WORKER_VERSION_ID.test(input.workerVersionId) ||
    !isCanonicalUtcTimestamp(input.activatedAt)) {
    throw new ProductionStockImportError("INVALID_RELEASE", "Release, Worker version or activation time is invalid.");
  }
  const validated = await validateLaunchStockImport(input.manifest);
  let providerConfiguration: ProductionProviderConfigurationAttestation;
  try {
    providerConfiguration = await createProductionProviderConfigurationAttestation({
      releaseSha: input.releaseSha,
      workerVersionId: input.workerVersionId,
      stockManifestId: validated.manifestId,
      ...input.providerIdentities,
    });
  } catch (cause) {
    throw new ProductionStockImportError(
      "INVALID_PROVIDER_CONFIGURATION",
      "Provider configuration identities are invalid.",
      { cause },
    );
  }
  if (input.activatedAt < validated.countedAt ||
    input.activatedAt < validated.approvedAt.stock_owner ||
    input.activatedAt < validated.approvedAt.release_owner) {
    throw new ProductionStockImportError("ACTIVATION_PRECEDES_APPROVAL", "Activation must follow both exact-payload approvals.");
  }

  const preexisting = await existingManifest(database, validated.manifestId);
  if (preexisting) {
    if (preexisting.payload_sha256 !== validated.payloadSha256 ||
      preexisting.release_sha !== input.releaseSha ||
      preexisting.worker_version_id !== input.workerVersionId) {
      throw new ProductionStockImportError("IMPORT_CONFLICT", "The manifest id is already bound to different release evidence.");
    }
    if (!await verifyProof(database, validated.manifestId, validated.payloadSha256) ||
      !await providerConfigurationProofMatches(database, providerConfiguration)) {
      throw new ProductionStockImportError("IMPORT_PROOF_FAILED", "Existing stock activation does not reconcile.");
    }
    return receipt(
      "already-activated",
      validated.manifestId,
      validated.payloadSha256,
      input.releaseSha,
      input.workerVersionId,
      providerConfiguration.configurationSha256,
    );
  }

  const before = await databaseCounts(database);
  const catalogEmpty = before.products === 0 && before.variants === 0 && before.inventory === 0;
  const seedOnly = before.products === 1 && before.variants === 12 && before.inventory === 12;
  if ((!catalogEmpty && !seedOnly) || before.orders !== 0 || before.manifests !== 0) {
    throw new ProductionStockImportError("DATABASE_NOT_EMPTY", "Production D1 is not an empty or seed-only launch database.");
  }

  if (catalogEmpty) {
    await new D1CommerceStore(database).seedLaunchCatalog(validated.countedAt);
  } else if (!await seedOnlyCatalogMatches(database, validated.variants)) {
    throw new ProductionStockImportError("DATABASE_NOT_EMPTY", "The seed-only catalog contains non-seed stock state or mismatched variants.");
  }

  const giftAllocationAt = oneMillisecondAfter(input.activatedAt);
  const validationAt = oneMillisecondAfter(giftAllocationAt);
  const statements: CommerceD1PreparedStatement[] = [];
  validated.variants.forEach((variant, position) => {
    const seed = launchVariantSeed[position];
    if (!seed || seed.id !== variant.variantId) {
      throw new ProductionStockImportError(
        "IMPORT_PROOF_FAILED",
        "The initial launch seed cannot be reconciled to the current stock grid.",
      );
    }
    const adjustmentQuantity = Math.abs(
      variant.physicalQuantity - seed.physicalQuantity,
    );
    const adjustmentReferenceType = variant.physicalQuantity > seed.physicalQuantity
      ? "physical_increase"
      : "physical_decrease";
    const adjustmentKey =
      `launch-stock-current-grid:${validated.payloadSha256.slice(0, 32)}:${String(position).padStart(2, "0")}`;
    if (adjustmentQuantity > 0) {
      statements.push(database.prepare(
        `INSERT INTO inventory_movements (
          id, variant_id, kind, quantity, reference_type, reference_id,
          actor_type, actor_id, idempotency_key, created_at
        ) SELECT ?, stock.variant_id, 'adjustment',
          CASE WHEN stock.physical_quantity=? AND stock.gift_reserve_quantity=0
            AND stock.safety_reserve_quantity=0 AND stock.active_reserved_quantity=0
            AND stock.sold_quantity=0 AND stock.reserves_validated=0
            AND NOT EXISTS (
              SELECT 1 FROM inventory_movements
              WHERE variant_id=stock.variant_id AND kind<>'seed'
            )
            THEN ? ELSE 0 END,
          ?, ?, 'admin', ?, ?, ?
        FROM inventory AS stock WHERE stock.variant_id=?`,
      ).bind(
        `movement_launch_current_grid_${String(position).padStart(2, "0")}`,
        seed.physicalQuantity,
        adjustmentQuantity,
        adjustmentReferenceType,
        validated.manifestId,
        validated.approvedBy.stock_owner,
        adjustmentKey,
        input.activatedAt,
        variant.variantId,
      ));
    }
    if (variant.giftingReserveQuantity > 0) {
      statements.push(database.prepare(
        `INSERT INTO inventory_movements (
          id, variant_id, kind, quantity, reference_type, reference_id,
          actor_type, actor_id, idempotency_key, created_at
        ) SELECT ?, stock.variant_id, 'gift_allocation',
          CASE WHEN stock.physical_quantity=? AND stock.gift_reserve_quantity=0
            AND stock.safety_reserve_quantity=0 AND stock.active_reserved_quantity=0
            AND stock.sold_quantity=0 AND stock.reserves_validated=0
            AND (
              (?=0 AND NOT EXISTS (
                SELECT 1 FROM inventory_movements
                WHERE variant_id=stock.variant_id AND kind<>'seed'
              ))
              OR (? > 0 AND EXISTS (
                SELECT 1 FROM inventory_movements
                WHERE variant_id=stock.variant_id AND kind='adjustment'
                  AND idempotency_key=?
              ))
            )
            THEN ? ELSE 0 END,
          'gift_reserve_increase', ?, 'admin', ?, ?, ?
        FROM inventory AS stock WHERE stock.variant_id=?`,
      ).bind(
        `movement_launch_gift_${String(position).padStart(2, "0")}`,
        variant.physicalQuantity,
        adjustmentQuantity,
        adjustmentQuantity,
        adjustmentKey,
        variant.giftingReserveQuantity,
        validated.manifestId,
        validated.approvedBy.stock_owner,
        `launch-stock-gift:${validated.payloadSha256.slice(0, 32)}:${String(position).padStart(2, "0")}`,
        giftAllocationAt,
        variant.variantId,
      ));
    }
    statements.push(database.prepare(
      `UPDATE inventory SET reserves_validated=1, updated_at=?
      WHERE variant_id=? AND physical_quantity=? AND gift_reserve_quantity=?
        AND safety_reserve_quantity=? AND active_reserved_quantity=0
        AND sold_quantity=0 AND reserves_validated=0`,
    ).bind(
      validationAt,
      variant.variantId,
      variant.physicalQuantity,
      variant.giftingReserveQuantity,
      variant.d1SafetyReserveQuantity,
    ));
  });
  statements.push(database.prepare(
    `INSERT INTO production_launch_stock_manifests (
      id, protocol, payload_sha256, counted_at, release_sha, worker_version_id,
      physical_total, variant_count, gifting_reserve_total, safety_reserve_total,
      sav_reserve_total, sellable_total, stock_owner_id, release_owner_id,
      stock_owner_signed_at, release_owner_signed_at, activated_at
    ) VALUES (?, 'ajl-launch-stock-import-v2', ?, ?, ?, ?, 749, 12, 23, 0, 0,
      726, ?, ?, ?, ?, ?)`,
  ).bind(
    validated.manifestId,
    validated.payloadSha256,
    validated.countedAt,
    input.releaseSha,
    input.workerVersionId,
    validated.approvedBy.stock_owner,
    validated.approvedBy.release_owner,
    validated.approvedAt.stock_owner,
    validated.approvedAt.release_owner,
    validationAt,
  ));
  validated.variants.forEach((variant, position) => {
    statements.push(database.prepare(
      `INSERT INTO production_launch_stock_manifest_lines (
        id, manifest_id, position, variant_id, internal_reference,
        physical_quantity, gifting_reserve_quantity, safety_reserve_quantity,
        sav_reserve_quantity, sellable_quantity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `launch_stock_line_${String(position).padStart(2, "0")}`,
      validated.manifestId,
      position,
      variant.variantId,
      variant.internalReference,
      variant.physicalQuantity,
      variant.giftingReserveQuantity,
      variant.safetyReserveQuantity,
      variant.savReserveQuantity,
      variant.sellableQuantity,
    ));
  });
  statements.push(database.prepare(
    `INSERT INTO production_provider_configuration_attestations (
      release_sha, worker_version_id, stock_manifest_id, protocol,
      configuration_sha256, stripe_account_id, sendcloud_integration_id,
      sendcloud_sender_address_id, resend_domain, commerce_origin,
      transactional_from_email, attested_at
    ) VALUES (?, ?, ?, 'ajl-production-provider-configuration-v1', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    providerConfiguration.releaseSha,
    providerConfiguration.workerVersionId,
    providerConfiguration.stockManifestId,
    providerConfiguration.configurationSha256,
    providerConfiguration.stripeAccountId,
    providerConfiguration.sendcloudIntegrationId,
    providerConfiguration.sendcloudSenderAddressId,
    providerConfiguration.resendDomain,
    providerConfiguration.commerceOrigin,
    providerConfiguration.transactionalFromEmail,
    validationAt,
  ));

  try {
    const results = await database.batch(statements);
    if (results.some((result) => !result.success)) {
      throw new Error("D1 batch reported an unsuccessful statement.");
    }
  } catch (cause) {
    throw new ProductionStockImportError("IMPORT_CONFLICT", "Production stock activation was rejected atomically.", { cause });
  }
  if (!await verifyProof(database, validated.manifestId, validated.payloadSha256) ||
    !await providerConfigurationProofMatches(database, providerConfiguration)) {
    throw new ProductionStockImportError("IMPORT_PROOF_FAILED", "Activated stock does not reconcile to its immutable manifest.");
  }
  return receipt(
    "activated",
    validated.manifestId,
    validated.payloadSha256,
    input.releaseSha,
    input.workerVersionId,
    providerConfiguration.configurationSha256,
  );
}
