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
];
const VALID_SENTINEL = Object.freeze({
  dataset_kind: "synthetic-demo",
  fixture_version: "aj-demo-v1",
  expires_at: "2026-09-30T23:59:59.999Z",
});

async function builtWorker(label) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "rollback-boundary",
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

test("Rollback R8 returns production 404 and private-preproduction 503 before any D1 access", async () => {
  const worker = await builtWorker("closed-routes");
  let d1Accesses = 0;
  const untouchedDatabase = new Proxy({}, {
    get() {
      d1Accesses += 1;
      throw new Error("closed commerce routes must never touch D1");
    },
  });
  const closedPaths = [
    "/api/preprod/cart",
    "/api/preprod/cart/lines/variant_boxer_pourpre_m",
    "/api/preprod/checkout/shipping-quote",
    "/api/preprod/checkout/order",
    "/api/preprod/checkout/test-payment",
    "/api/preprod/orders/current",
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
    if (method !== "HEAD") {
      assert.deepEqual(await production.json(), { error: "not-found" });
    }

    const rollback = await worker.fetch(
      request(pathname, method),
      {
        APP_ENV: "preproduction",
        PREPROD_ORIGIN: ORIGIN,
        DB: untouchedDatabase,
      },
      executionContext(),
    );
    assert.equal(rollback.status, 503, `${method} ${pathname} in Rollback R8`);
    if (method !== "HEAD") {
      assert.deepEqual(await rollback.json(), {
        status: "unavailable",
        reason: "post-0008-rollback",
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
    if (method !== "HEAD") {
      assert.deepEqual(await wrongOrigin.json(), { error: "not-found" });
    }
  }
  assert.equal(d1Accesses, 0);
});

test("Rollback R8 health is 200 only for the exact 0000-0008 ledger and valid unexpired sentinel", async () => {
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
  assert.equal(payload.runtimeMode, "post-0008-rollback");
  assert.equal(payload.latestMigration, "0008_preprod_synthetic_demo_dataset.sql");
  assert.equal(payload.launchReadiness, false);
  assert.ok(Object.values(payload.capabilities).every((value) =>
    typeof value === "object"
      ? Object.values(value).every((nested) => nested === false)
      : value === false
  ));
  assert.deepEqual(payload.stockProjection, []);
  assert.deepEqual(payload.syntheticDataset, {
    active: false,
    valid: true,
    fixtureVersion: "aj-demo-v1",
    expiresAt: "2026-09-30T23:59:59.999Z",
  });
  assert.equal(statements.length, 2);
});

test("Rollback R8 health fails closed on ledger, sentinel and expiry divergence", async () => {
  const worker = await builtWorker("health-rejections");

  for (const [label, database, expectedReason] of [
    [
      "wrong-ledger",
      healthDatabase({
        migrations: [
          "0000_flimsy_rhino.sql",
          "0008_preprod_synthetic_demo_dataset.sql",
        ],
      }),
      "unexpected-migration",
    ],
    [
      "missing-sentinel",
      healthDatabase({ sentinel: null }),
      "synthetic-sentinel-invalid",
    ],
    [
      "wrong-kind",
      healthDatabase({
        sentinel: { ...VALID_SENTINEL, dataset_kind: "not-synthetic" },
      }),
      "synthetic-sentinel-invalid",
    ],
    [
      "wrong-fixture",
      healthDatabase({
        sentinel: { ...VALID_SENTINEL, fixture_version: "aj-demo-v2" },
      }),
      "synthetic-sentinel-invalid",
    ],
    [
      "widened-expiry",
      healthDatabase({
        sentinel: { ...VALID_SENTINEL, expires_at: "2099-01-01T00:00:00.000Z" },
      }),
      "synthetic-sentinel-invalid",
    ],
  ]) {
    const rejected = await worker.fetch(
      request("/api/preprod/health", "GET"),
      {
        APP_ENV: "preproduction",
        PREPROD_ORIGIN: ORIGIN,
        DB: database,
      },
      executionContext(),
    );
    assert.equal(rejected.status, 503, label);
    const payload = await rejected.json();
    assert.equal(payload.reason, expectedReason, label);
    assert.equal(payload.runtimeMode, "post-0008-rollback", label);
    assert.equal(payload.launchReadiness, false, label);
    assert.equal(payload.syntheticDataset.active, false, label);
    assert.equal(payload.syntheticDataset.valid, false, label);
  }

  const RealDate = globalThis.Date;
  try {
    for (const currentTime of [
      "2026-09-30T23:59:59.999Z",
      "2026-10-01T00:00:00.000Z",
    ]) {
      globalThis.Date = class FixedExpiredDate extends RealDate {
        constructor(...args) {
          super(...(args.length === 0 ? [currentTime] : args));
        }

        static now() {
          return RealDate.parse(currentTime);
        }
      };
      const expired = await worker.fetch(
        request("/api/preprod/health", "GET"),
        {
          APP_ENV: "preproduction",
          PREPROD_ORIGIN: ORIGIN,
          DB: healthDatabase(),
        },
        executionContext(),
      );
      assert.equal(expired.status, 503, currentTime);
      const payload = await expired.json();
      assert.equal(payload.reason, "synthetic-dataset-expired", currentTime);
      assert.equal(payload.launchReadiness, false, currentTime);
    }
  } finally {
    globalThis.Date = RealDate;
  }
});

test("Rollback R8 health is invisible outside the exact environment and origin without D1", async () => {
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
    assert.deepEqual(await response.json(), { error: "not-found" });
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
  assert.deepEqual(await wrongOrigin.json(), { error: "not-found" });
  assert.equal(d1Accesses, 0);
});

test("Rollback R8 artifact and migration are exact, non-promotable and contain no functional bypass", () => {
  const artifact = readFileSync(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.doesNotMatch(
    artifact,
    /internal-functional|preprodFunctional|PREPROD_DEMO_DATASET|handleCartApi|handleShippingQuoteApi|handleOrderPaymentApi|pre-0008-bridge/,
  );
  assert.match(artifact, /post-0008-rollback/);
  assert.match(artifact, /0008_preprod_synthetic_demo_dataset\.sql/);
  assert.match(artifact, /synthetic-demo/);
  assert.match(artifact, /aj-demo-v1/);
  assert.match(artifact, /2026-09-30T23:59:59\.999Z/);

  const migration = readFileSync(
    new URL("../drizzle/0008_preprod_synthetic_demo_dataset.sql", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "794e1c67471427ba3d92e979e79e07a8393244794d7d98b827db6b0fda07b5b5",
  );
  const markerBytes = readFileSync(
    new URL("../.openai/preprod-demo-only.json", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(markerBytes).digest("hex"),
    "de09f4de486da3eeeba17f20640f59397b95fe53f14b18ff179783baf3d2080e",
  );
  const marker = JSON.parse(markerBytes.toString("utf8"));
  const hosting = JSON.parse(
    readFileSync(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(marker, {
    project_id: "appgprj_6a7d223ffdec8191b360551446150216",
    dataset_kind: "synthetic-demo",
    fixture_version: "aj-demo-v1",
    expires_at: "2026-09-30T23:59:59.999Z",
    runtime_mode: "post-0008-rollback",
    production_promotion: "forbidden",
  });
  assert.equal(marker.project_id, hosting.project_id);
  assert.deepEqual(
    readdirSync(new URL("../drizzle/", import.meta.url))
      .filter((name) => /^\d{4}.*\.sql$/.test(name))
      .sort(),
    EXPECTED_MIGRATIONS,
  );
});
