import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
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
  ["index", "idx_delivery_options_cart_expiry"],
  ["index", "idx_delivery_service_points_option_expiry"],
  ["index", "ux_delivery_options_quote"],
  ["index", "ux_delivery_options_selected_cart"],
  ["index", "ux_delivery_service_point_provider_ref"],
  ["index", "ux_shipping_document_reference"],
  ["table", "delivery_option_snapshots"],
  ["table", "delivery_service_point_snapshots"],
  ["table", "shipping_document_metadata"],
  ["trigger", "trg_delivery_option_retain"],
  ["trigger", "trg_delivery_option_select_once"],
  ["trigger", "trg_delivery_option_validate_insert"],
  ["trigger", "trg_delivery_order_requires_selected_option"],
  ["trigger", "trg_delivery_service_point_immutable"],
  ["trigger", "trg_delivery_service_point_retain"],
  ["trigger", "trg_delivery_service_point_validate_insert"],
  ["trigger", "trg_shipping_document_immutable"],
  ["trigger", "trg_shipping_document_retain"],
].map(([type, name]) => ({ type, name }));
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
  migrations = EXPECTED_MIGRATIONS,
  schemaObjects = EXPECTED_SCHEMA_OBJECTS,
  sentinel = VALID_SENTINEL,
  statements = [],
} = {}) {
  return {
    prepare(query) {
      statements.push(query);
      if (query.includes("d1_migrations")) {
        return {
          async all() {
            return { results: migrations.map((name) => ({ name })) };
          },
        };
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

test("Rollback R10 health is 200 only for the exact 0000-0010 ledger, exact 0010 schema and valid sentinel", async () => {
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
  assert.equal(statements.length, 3);
});

test("Rollback R10 health fails closed for missing, extra or renamed 0010 proof", async () => {
  const worker = await builtWorker("health-schema-rejections");
  const withoutLast = EXPECTED_SCHEMA_OBJECTS.slice(0, -1);
  const extra = [
    ...EXPECTED_SCHEMA_OBJECTS,
    { type: "table", name: "delivery_option_snapshots_shadow" },
  ];
  const renamed = EXPECTED_SCHEMA_OBJECTS.map((entry) =>
    entry.name === "delivery_option_snapshots"
      ? { type: entry.type, name: "delivery_option_snapshot_renamed" }
      : entry
  );
  const cases = [
    [
      "missing-migration",
      healthDatabase({ migrations: EXPECTED_MIGRATIONS.slice(0, -1) }),
      "unexpected-migration",
    ],
    [
      "extra-migration",
      healthDatabase({ migrations: [...EXPECTED_MIGRATIONS, "0011_unreviewed.sql"] }),
      "unexpected-migration",
    ],
    ["missing-schema", healthDatabase({ schemaObjects: withoutLast }), "unexpected-schema"],
    ["extra-schema", healthDatabase({ schemaObjects: extra }), "unexpected-schema"],
    ["renamed-schema", healthDatabase({ schemaObjects: renamed }), "unexpected-schema"],
  ];

  for (const [label, database, expectedReason] of cases) {
    const rejected = await worker.fetch(
      request("/api/preprod/health", "GET"),
      { APP_ENV: "preproduction", PREPROD_ORIGIN: ORIGIN, DB: database },
      executionContext(),
    );
    assert.equal(rejected.status, 503, label);
    const payload = await rejected.json();
    assert.equal(payload.reason, expectedReason, label);
    assert.equal(payload.runtimeMode, "post-0010-rollback", label);
    assert.equal(payload.launchReadiness, false, label);
    assertOnlyFalseCapabilities(payload.capabilities);
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
