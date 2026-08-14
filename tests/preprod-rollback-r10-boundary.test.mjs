import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const ORIGIN = "https://preprod.example";
const EXPECTED_MIGRATIONS = [
  "0000_flimsy_rhino.sql",
  "0001_lock_cart_line_price_provenance.sql",
  "0002_lock_order_line_snapshots.sql",
  "0003_identity_access.sql",
  "0004_email_outbox_data_rights.sql",
  "0005_fulfillment_returns_refunds.sql",
  "0006_allow_bounded_expired_cart_purge.sql",
  "0007_transactional_preprod_order_payment.sql",
  "0008_preprod_synthetic_demo_dataset.sql",
  "0009_shipping_quote_parcel_snapshots.sql",
  "0010_multicarrier_delivery_foundation.sql",
];
const EXPECTED_SCHEMA_OBJECTS = [
  ["index", "idx_delivery_options_cart_expiry", "delivery_option_snapshots"],
  ["index", "idx_delivery_service_points_option_expiry", "delivery_service_point_snapshots"],
  ["index", "ux_delivery_options_quote", "delivery_option_snapshots"],
  ["index", "ux_delivery_options_selected_cart", "delivery_option_snapshots"],
  ["index", "ux_delivery_service_point_provider_ref", "delivery_service_point_snapshots"],
  ["index", "ux_shipping_document_reference", "shipping_document_metadata"],
  ["table", "delivery_option_snapshots", "delivery_option_snapshots"],
  ["table", "delivery_service_point_snapshots", "delivery_service_point_snapshots"],
  ["table", "shipping_document_metadata", "shipping_document_metadata"],
  ["trigger", "trg_delivery_option_retain", "delivery_option_snapshots"],
  ["trigger", "trg_delivery_option_select_once", "delivery_option_snapshots"],
  ["trigger", "trg_delivery_option_validate_insert", "delivery_option_snapshots"],
  ["trigger", "trg_delivery_order_requires_selected_option", "orders"],
  ["trigger", "trg_delivery_service_point_immutable", "delivery_service_point_snapshots"],
  ["trigger", "trg_delivery_service_point_retain", "delivery_service_point_snapshots"],
  ["trigger", "trg_delivery_service_point_validate_insert", "delivery_service_point_snapshots"],
  ["trigger", "trg_shipping_document_immutable", "shipping_document_metadata"],
  ["trigger", "trg_shipping_document_retain", "shipping_document_metadata"],
].map(([type, name, table_name]) => ({ type, name, table_name }));
const VALID_SENTINEL = Object.freeze({
  dataset_kind: "synthetic-demo",
  fixture_version: "aj-demo-v1",
  expires_at: "2026-09-30T23:59:59.999Z",
});

async function builtWorker(label) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "rollback-r10-boundary",
    `${label}-${process.pid}-${Date.now()}-${Math.random()}`,
  );
  return (await import(workerUrl.href)).default;
}

function request(pathname, method) {
  return new Request(`${ORIGIN}${pathname}`, {
    method,
    headers: method === "GET" || method === "HEAD"
      ? undefined
      : {
          Origin: ORIGIN,
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
        },
    body: method === "GET" || method === "HEAD" ? undefined : "{}",
  });
}

function executionContext() {
  return { waitUntil() {}, passThroughOnException() {} };
}

function healthDatabase({
  schemaObjects = EXPECTED_SCHEMA_OBJECTS,
  sentinel = VALID_SENTINEL,
  statements = [],
} = {}) {
  return {
    prepare(query) {
      statements.push(query);
      if (query.includes("d1_migrations")) {
        throw new Error("Sites does not expose its migration ledger to Workers");
      }
      if (query.includes("sqlite_master")) {
        return {
          async all() {
            return { results: schemaObjects };
          },
        };
      }
      if (query.includes("preprod_demo_dataset")) {
        return {
          async first() {
            return sentinel;
          },
        };
      }
      throw new Error(`unexpected health query: ${query}`);
    },
  };
}

class SqliteHealthStatement {
  constructor(database, query) {
    this.database = database;
    this.query = query;
  }

  async all() {
    return { results: this.database.prepare(this.query).all() };
  }

  async first() {
    return this.database.prepare(this.query).get() ?? null;
  }
}

function installedRollbackDatabase(statements) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const migration of EXPECTED_MIGRATIONS) {
    const source = readFileSync(
      new URL(`../drizzle/${migration}`, import.meta.url),
      "utf8",
    );
    for (const statement of source.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  return {
    sqlite,
    d1: {
      prepare(query) {
        statements.push(query);
        if (query.includes("d1_migrations")) {
          throw new Error("Sites does not expose its migration ledger to Workers");
        }
        return new SqliteHealthStatement(sqlite, query);
      },
    },
  };
}

function assertOnlyFalseCapabilities(value) {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      assertOnlyFalseCapabilities(nested);
    }
    return;
  }
  assert.equal(value, false);
}

test("Rollback R10 returns production 404 and private-preproduction 503 before any D1 access for every commerce method", async () => {
  const worker = await builtWorker("closed-routes");
  let d1Accesses = 0;
  const untouchedDatabase = new Proxy({}, {
    get() {
      d1Accesses += 1;
      throw new Error("closed rollback routes must never touch D1");
    },
  });
  const closedPaths = [
    "/api/preprod/cart",
    "/api/preprod/cart/lines/variant_boxer_pourpre_m",
    "/api/preprod/checkout/shipping-quote",
    "/api/preprod/checkout/delivery-options",
    "/api/preprod/checkout/service-points",
    "/api/preprod/checkout/delivery-options/select",
    "/api/preprod/checkout/order",
    "/api/preprod/checkout/test-payment",
    "/api/preprod/orders/current",
    "/api/preprod/account/current",
    "/api/preprod/orders/current/tracking/advance",
    "/api/preprod/diagnostics",
    "/api/preprod/future-commerce-mutation",
  ];
  const methods = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];

  for (const pathname of closedPaths) for (const method of methods) {
    const production = await worker.fetch(
      request(pathname, method),
      {
        APP_ENV: "production",
        PREPROD_ORIGIN: ORIGIN,
        DB: untouchedDatabase,
      },
      executionContext(),
    );
    assert.equal(production.status, 404, `${method} ${pathname} in production`);

    const rollback = await worker.fetch(
      request(pathname, method),
      {
        APP_ENV: "preproduction",
        PREPROD_ORIGIN: ORIGIN,
        DB: untouchedDatabase,
      },
      executionContext(),
    );
    assert.equal(rollback.status, 503, `${method} ${pathname} in Rollback R10`);
    if (method !== "HEAD") {
      assert.deepEqual(await rollback.json(), {
        status: "unavailable",
        reason: "post-0010-rollback",
        launchReadiness: false,
      });
    }
  }
  assert.equal(d1Accesses, 0);

  for (const pathname of closedPaths) for (const method of methods) {
    const wrongOrigin = await worker.fetch(
      request(pathname, method),
      {
        APP_ENV: "preproduction",
        PREPROD_ORIGIN: "https://other.example",
        DB: untouchedDatabase,
      },
      executionContext(),
    );
    assert.equal(wrongOrigin.status, 404, `${method} ${pathname} wrong origin`);
  }
  assert.equal(d1Accesses, 0);
});

test("Rollback R10 health is hosted-like: exact 0010 schema and sentinel return 200 without the inaccessible ledger", async () => {
  const worker = await builtWorker("health-ready");
  const statements = [];
  const response = await worker.fetch(
    request("/api/preprod/health", "GET"),
    {
      APP_ENV: "preproduction",
      PREPROD_ORIGIN: ORIGIN,
      DB: healthDatabase({ statements }),
    },
    executionContext(),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "rollback");
  assert.equal(payload.runtimeMode, "post-0010-rollback");
  assert.equal(payload.latestMigration, "0010_multicarrier_delivery_foundation.sql");
  assert.equal(payload.launchReadiness, false);
  assertOnlyFalseCapabilities(payload.capabilities);
  assert.deepEqual(payload.stockProjection, []);
  assert.deepEqual(payload.syntheticDataset, {
    active: false,
    valid: true,
    fixtureVersion: "aj-demo-v1",
    expiresAt: "2026-09-30T23:59:59.999Z",
  });
  assert.equal(statements.length, 2);
  assert.equal(statements.some((query) => query.includes("d1_migrations")), false);
});

test("Rollback R10 health exhaustively rejects missing, renamed and prefix-colliding 0010 objects", async () => {
  const worker = await builtWorker("health-schema-rejections");
  const cases = [];
  for (const [index, entry] of EXPECTED_SCHEMA_OBJECTS.entries()) {
    cases.push([
      `missing-${entry.type}-${entry.name}`,
      EXPECTED_SCHEMA_OBJECTS.toSpliced(index, 1),
    ]);
    cases.push([
      `renamed-${entry.type}-${entry.name}`,
      EXPECTED_SCHEMA_OBJECTS.with(index, {
        type: entry.type,
        name: `unrelated_renamed_object_${index}`,
        table_name: entry.table_name,
      }),
    ]);
  }
  for (const collision of [
    {
      type: "table",
      name: "delivery_option_snapshots_shadow",
      table_name: "delivery_option_snapshots_shadow",
    },
    {
      type: "index",
      name: "ux_delivery_options_quote_shadow",
      table_name: "carts",
    },
    {
      type: "trigger",
      name: "trg_delivery_option_unreviewed",
      table_name: "carts",
    },
    {
      type: "table",
      name: "DELIVERY_OPTION_SNAPSHOTS_SHADOW",
      table_name: "DELIVERY_OPTION_SNAPSHOTS_SHADOW",
    },
    {
      type: "index",
      name: "UX_DELIVERY_PREFIX_COLLISION",
      table_name: "carts",
    },
    {
      type: "index",
      name: "unrelated_extra_index",
      table_name: "delivery_option_snapshots",
    },
    {
      type: "trigger",
      name: "unrelated_extra_trigger",
      table_name: "delivery_service_point_snapshots",
    },
  ]) {
    cases.push([
      `prefix-collision-${collision.type}`,
      [...EXPECTED_SCHEMA_OBJECTS, collision],
    ]);
  }
  for (const [label, name, table_name] of [
    ["retargeted-trigger", "trg_delivery_option_select_once", "carts"],
    ["retargeted-index", "ux_delivery_options_quote", "carts"],
  ]) {
    cases.push([
      label,
      EXPECTED_SCHEMA_OBJECTS.map((entry) =>
        entry.name === name ? { ...entry, table_name } : entry
      ),
    ]);
  }

  for (const [label, schemaObjects] of cases) {
    const statements = [];
    const database = healthDatabase({ schemaObjects, statements });
    const rejected = await worker.fetch(
      request("/api/preprod/health", "GET"),
      { APP_ENV: "preproduction", PREPROD_ORIGIN: ORIGIN, DB: database },
      executionContext(),
    );
    assert.equal(rejected.status, 503, label);
    const payload = await rejected.json();
    assert.equal(payload.reason, "unexpected-schema", label);
    assert.equal(payload.runtimeMode, "post-0010-rollback", label);
    assert.equal(payload.launchReadiness, false, label);
    assertOnlyFalseCapabilities(payload.capabilities);
    assert.equal(
      statements.some((query) => query.includes("d1_migrations")),
      false,
      label,
    );
  }
});

test("Rollback R10 sqlite inventory rejects case collisions, governed extras and retargeted objects", async () => {
  const worker = await builtWorker("health-real-sqlite-rejections");
  const mutations = [
    "DROP TABLE shipping_document_metadata",
    "DROP INDEX ux_delivery_options_quote",
    "DROP TRIGGER trg_delivery_option_select_once",
    "CREATE TABLE delivery_option_snapshots_shadow (id TEXT)",
    "CREATE INDEX unrelated_extra_index ON delivery_option_snapshots (carrier_code)",
    `DROP INDEX ux_delivery_options_quote;
      CREATE UNIQUE INDEX renamed_quote_index
      ON delivery_option_snapshots (shipping_quote_id)`,
    "CREATE INDEX ux_delivery_prefix_collision ON carts (id)",
    `CREATE TRIGGER unrelated_extra_trigger
      BEFORE INSERT ON delivery_service_point_snapshots BEGIN SELECT 1; END`,
    "CREATE TABLE DELIVERY_OPTION_SNAPSHOTS_SHADOW (id TEXT)",
    "CREATE INDEX UX_DELIVERY_PREFIX_COLLISION ON carts (id)",
    `DROP TRIGGER trg_delivery_option_select_once;
      CREATE TRIGGER trg_delivery_option_select_once
      BEFORE INSERT ON carts BEGIN SELECT 1; END`,
    `DROP INDEX ux_delivery_options_quote;
      CREATE UNIQUE INDEX ux_delivery_options_quote ON carts (id)`,
  ];

  for (const mutation of mutations) {
    const statements = [];
    const { sqlite, d1 } = installedRollbackDatabase(statements);
    try {
      sqlite.exec(mutation);
      const response = await worker.fetch(
        request("/api/preprod/health", "GET"),
        { APP_ENV: "preproduction", PREPROD_ORIGIN: ORIGIN, DB: d1 },
        executionContext(),
      );
      assert.equal(response.status, 503, mutation);
      const payload = await response.json();
      assert.equal(payload.reason, "unexpected-schema", mutation);
      assert.equal(payload.launchReadiness, false, mutation);
      assertOnlyFalseCapabilities(payload.capabilities);
      assert.equal(
        statements.some((query) => query.includes("d1_migrations")),
        false,
        mutation,
      );
    } finally {
      sqlite.close();
    }
  }
});

test("Rollback R10 health rejects every non-exact synthetic sentinel without consulting the ledger", async () => {
  const worker = await builtWorker("health-sentinel-rejections");
  const sentinels = [
    null,
    { ...VALID_SENTINEL, dataset_kind: "other" },
    { ...VALID_SENTINEL, fixture_version: "other" },
    { ...VALID_SENTINEL, expires_at: "2026-09-29T23:59:59.999Z" },
  ];

  for (const [index, sentinel] of sentinels.entries()) {
    const statements = [];
    const rejected = await worker.fetch(
      request("/api/preprod/health", "GET"),
      {
        APP_ENV: "preproduction",
        PREPROD_ORIGIN: ORIGIN,
        DB: healthDatabase({ sentinel, statements }),
      },
      executionContext(),
    );
    assert.equal(rejected.status, 503, `sentinel-${index}`);
    const payload = await rejected.json();
    assert.equal(payload.reason, "synthetic-sentinel-invalid", `sentinel-${index}`);
    assert.equal(payload.launchReadiness, false, `sentinel-${index}`);
    assertOnlyFalseCapabilities(payload.capabilities);
    assert.equal(statements.length, 2, `sentinel-${index}`);
    assert.equal(
      statements.some((query) => query.includes("d1_migrations")),
      false,
      `sentinel-${index}`,
    );
  }
});

test("Rollback R10 health stays invisible outside its exact environment and origin without D1", async () => {
  const worker = await builtWorker("health-boundary");
  let d1Accesses = 0;
  const untouchedDatabase = new Proxy({}, {
    get() {
      d1Accesses += 1;
      throw new Error("rejected health requests must never touch D1");
    },
  });
  for (const environment of [undefined, "production"]) {
    const response = await worker.fetch(
      request("/api/preprod/health", "GET"),
      { APP_ENV: environment, PREPROD_ORIGIN: ORIGIN, DB: untouchedDatabase },
      executionContext(),
    );
    assert.equal(response.status, 404);
  }
  const wrongOrigin = await worker.fetch(
    request("/api/preprod/health", "GET"),
    {
      APP_ENV: "preproduction",
      PREPROD_ORIGIN: "https://other.example",
      DB: untouchedDatabase,
    },
    executionContext(),
  );
  assert.equal(wrongOrigin.status, 404);

  for (const method of ["HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]) {
    const response = await worker.fetch(
      request("/api/preprod/health", method),
      {
        APP_ENV: "preproduction",
        PREPROD_ORIGIN: ORIGIN,
        DB: untouchedDatabase,
      },
      executionContext(),
    );
    assert.equal(response.status, 503, method);
    if (method !== "HEAD") {
      assert.deepEqual(await response.json(), {
        status: "unavailable",
        reason: "post-0010-rollback",
        launchReadiness: false,
      });
    }
  }
  assert.equal(d1Accesses, 0);
});

test("Rollback R10 artifact is non-promotable and contains no positive commerce bypass", () => {
  const artifact = readFileSync(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.doesNotMatch(
    artifact,
    /internal-functional|preprodFunctional|handleCartApi|handleShippingQuoteApi|handleDeliveryOptionsApi|handleOrderPaymentApi|Sendcloud|panel\.sendcloud|servicepoints\.sendcloud/i,
  );
  assert.doesNotMatch(
    artifact,
    /d1_migrations|migration-ledger-unavailable|unexpected-migration/i,
  );
  assert.match(artifact, /post-0010-rollback/);
  assert.match(artifact, /0010_multicarrier_delivery_foundation\.sql/);
  assert.match(artifact, /launchReadiness/);

  const marker = JSON.parse(
    readFileSync(new URL("../.openai/preprod-demo-only.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(marker, {
    project_id: "appgprj_6a7d223ffdec8191b360551446150216",
    dataset_kind: "synthetic-demo",
    fixture_version: "aj-demo-v1",
    expires_at: "2026-09-30T23:59:59.999Z",
    runtime_mode: "post-0010-rollback",
    production_promotion: "forbidden",
    allowed_source_branch: "codex/aj-luxury-rollback-r10-20260814",
  });
  assert.deepEqual(
    readdirSync(new URL("../drizzle/", import.meta.url))
      .filter((name) => /^\d{4}.*\.sql$/.test(name))
      .sort(),
    EXPECTED_MIGRATIONS,
  );
  assert.equal(
    createHash("sha256")
      .update(readFileSync(new URL("../drizzle/0010_multicarrier_delivery_foundation.sql", import.meta.url)))
      .digest("hex"),
    "12cfa7e31139229408601c6fa63a9e0c1dbb0e369c69ab7b8fa7a97472488975",
  );
});
