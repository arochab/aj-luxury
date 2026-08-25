import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { launchVariantSeed } from "../db/seed.ts";
import {
  ProductionStockImportError,
  activateProductionLaunchStock,
} from "../lib/commerce/d1-production-stock-import.ts";
import {
  createLaunchStockPayloadSha256,
  launchStockImportProtocol,
} from "../lib/commerce/launch-stock-import.ts";

const releaseSha = "a".repeat(40);
const workerVersionId = "018f47ce-24bd-7b16-a1ea-4b3fc2d66b75";

class SQLiteD1Statement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }
  bind(...values) { return new SQLiteD1Statement(this.database, this.query, values); }
  async first() { return this.database.prepare(this.query).get(...this.values) ?? null; }
  async all() {
    const results = this.database.prepare(this.query).all(...this.values);
    return { success: true, results, meta: {} };
  }
  async run() {
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
  async executeForBatch() {
    return /^\s*(?:SELECT|PRAGMA|WITH\b)/i.test(this.query) ? this.all() : this.run();
  }
}

class SQLiteD1Database {
  constructor(database) { this.database = database; }
  prepare(query) { return new SQLiteD1Statement(this.database, query); }
  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.executeForBatch());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function productionDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const names = readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((name) => /^00(?:0[0-7]|0[9]|1[0-9])_.+\.sql$/.test(name))
    .sort();
  for (const name of names) {
    const migration = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement.trim());
    }
  }
  return { sqlite, database: new SQLiteD1Database(sqlite) };
}

async function manifest() {
  const unsigned = {
    protocol: launchStockImportProtocol,
    manifestId: "ajl-stock-20260825",
    countedAt: "2026-08-25T08:00:00.000Z",
    variants: launchVariantSeed.map((variant, index) => ({
      variantId: variant.id,
      internalReference: variant.internalReference,
      physicalQuantity: variant.physicalQuantity,
      giftingReserveQuantity: index === 0 || index === 11 ? 3 : 2,
      safetyReserveQuantity: 0,
      savReserveQuantity: 0,
    })),
    totals: {
      physicalQuantity: 756,
      giftingReserveQuantity: 26,
      safetyReserveQuantity: 0,
      savReserveQuantity: 0,
      sellableQuantity: 730,
    },
  };
  const payloadSha256 = await createLaunchStockPayloadSha256(unsigned);
  return {
    ...unsigned,
    approvals: [
      {
        role: "stock_owner",
        signerId: "jeremy",
        signedAt: "2026-08-25T08:30:00.000Z",
        payloadSha256,
        attestation: "I_APPROVE_THIS_EXACT_STOCK_IMPORT",
      },
      {
        role: "release_owner",
        signerId: "adam",
        signedAt: "2026-08-25T08:31:00.000Z",
        payloadSha256,
        attestation: "I_APPROVE_THIS_EXACT_STOCK_IMPORT",
      },
    ],
  };
}

function input(stockManifest) {
  return {
    manifest: stockManifest,
    releaseSha,
    workerVersionId,
    activatedAt: "2026-08-25T09:00:00.000Z",
    providerIdentities: {
      stripeAccountId: "acct_1U4iFTC0NIklfc9C",
      sendcloudIntegrationId: "612109",
      sendcloudSenderAddressId: "sender_ajl_001",
      resendDomain: "ajluxurystore.com",
      commerceOrigin: "https://ajluxurystore.com",
      transactionalFromEmail: "orders@ajluxurystore.com",
    },
  };
}

test("production stock activation atomically proves 756 physical, 26 gifts and 730 sellable", async () => {
  const { sqlite, database } = productionDatabase();
  const stockManifest = await manifest();
  const first = await activateProductionLaunchStock(database, input(stockManifest));
  assert.equal(first.disposition, "activated");
  assert.deepEqual(
    { ...sqlite.prepare(`SELECT COUNT(*) variants, SUM(physical_quantity) physical,
      SUM(gift_reserve_quantity) gifts, SUM(safety_reserve_quantity) safety,
      SUM(reserves_validated) validated,
      SUM(physical_quantity-gift_reserve_quantity-safety_reserve_quantity-active_reserved_quantity-sold_quantity) sellable
      FROM inventory`).get() },
    { variants: 12, physical: 756, gifts: 26, safety: 0, validated: 12, sellable: 730 },
  );
  assert.deepEqual(
    { ...sqlite.prepare(`SELECT COUNT(*) movements, SUM(quantity) quantity
      FROM inventory_movements WHERE kind='gift_allocation'`).get() },
    { movements: 12, quantity: 26 },
  );
  assert.deepEqual(
    { ...sqlite.prepare(`SELECT COUNT(*) lines, SUM(physical_quantity) physical,
      SUM(gifting_reserve_quantity) gifts, SUM(sellable_quantity) sellable
      FROM production_launch_stock_manifest_lines`).get() },
    { lines: 12, physical: 756, gifts: 26, sellable: 730 },
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) count FROM production_provider_configuration_attestations").get().count,
    1,
  );
  assert.equal(
    sqlite.prepare("SELECT configuration_sha256 FROM production_provider_configuration_attestations").get()
      .configuration_sha256,
    first.providerConfigurationSha256,
  );

  const second = await activateProductionLaunchStock(database, input(stockManifest));
  assert.equal(second.disposition, "already-activated");
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM inventory_movements WHERE kind='gift_allocation'").get().count, 12);

  await assert.rejects(
    () => activateProductionLaunchStock(database, {
      ...input(stockManifest),
      providerIdentities: {
        ...input(stockManifest).providerIdentities,
        stripeAccountId: "acct_DIFFERENT123456",
      },
    }),
    (error) => error instanceof ProductionStockImportError && error.code === "IMPORT_PROOF_FAILED",
  );
});

test("production stock activation rejects unsigned timing and non-empty commerce state", async () => {
  const stockManifest = await manifest();
  const early = productionDatabase();
  await assert.rejects(
    () => activateProductionLaunchStock(early.database, {
      ...input(stockManifest), activatedAt: "2026-08-25T08:30:30.000Z",
    }),
    (error) => error instanceof ProductionStockImportError && error.code === "ACTIVATION_PRECEDES_APPROVAL",
  );

  const dirty = productionDatabase();
  dirty.sqlite.exec(`INSERT INTO products (
    id, slug, name, status, price_cents, currency, created_at, updated_at
  ) VALUES ('other', 'other', 'Other', 'active', 100, 'EUR',
    '2026-08-25T08:00:00.000Z', '2026-08-25T08:00:00.000Z')`);
  await assert.rejects(
    () => activateProductionLaunchStock(dirty.database, input(stockManifest)),
    (error) => error instanceof ProductionStockImportError && error.code === "DATABASE_NOT_EMPTY",
  );
  assert.equal(dirty.sqlite.prepare("SELECT COUNT(*) count FROM inventory").get().count, 0);
  assert.equal(dirty.sqlite.prepare("SELECT COUNT(*) count FROM production_launch_stock_manifests").get().count, 0);

  const preallocated = productionDatabase();
  const countedAt = "2026-08-25T08:00:00.000Z";
  const activationAt = "2026-08-25T08:01:00.000Z";
  const variantId = launchVariantSeed[0].id;
  const { database: preallocatedD1, sqlite: preallocatedSqlite } = preallocated;
  const { D1CommerceStore } = await import("../lib/commerce/d1-commerce-store.ts");
  await new D1CommerceStore(preallocatedD1).seedLaunchCatalog(countedAt);
  await preallocatedD1.prepare(`INSERT INTO inventory_movements (
    id, variant_id, kind, quantity, reference_type, reference_id,
    actor_type, actor_id, idempotency_key, created_at
  ) VALUES ('movement_preexisting_gift', ?, 'gift_allocation', 1,
    'gift_reserve_increase', 'preexisting', 'admin', 'operator',
    'preexisting-gift-allocation', ?)`).bind(variantId, activationAt).run();
  await assert.rejects(
    () => activateProductionLaunchStock(preallocatedD1, input(stockManifest)),
    (error) => error instanceof ProductionStockImportError && error.code === "DATABASE_NOT_EMPTY",
  );
  assert.equal(preallocatedSqlite.prepare("SELECT COUNT(*) count FROM production_launch_stock_manifests").get().count, 0);
  assert.equal(preallocatedSqlite.prepare("SELECT COUNT(*) count FROM production_launch_stock_manifest_lines").get().count, 0);
});
