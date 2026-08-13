import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const ORIGIN = "https://preprod.example";

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

test("Bridge B7 returns production 404 and private-preproduction 503 before any D1 access", async () => {
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

    const bridge = await worker.fetch(
      request(pathname, method),
      {
        APP_ENV: "preproduction",
        PREPROD_ORIGIN: ORIGIN,
        DB: untouchedDatabase,
      },
      executionContext(),
    );
    assert.equal(bridge.status, 503, `${method} ${pathname} in Bridge B7`);
    if (method !== "HEAD") {
      assert.deepEqual(await bridge.json(), {
        status: "unavailable",
        reason: "pre-0008-bridge",
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

test("Bridge B7 health is 200 only on migration 0007 and never claims commerce readiness", async () => {
  const worker = await builtWorker("health");
  const statements = [];
  const database = {
    prepare(query) {
      statements.push(query);
      return {
        async all() {
          return { results: [
            "0000_flimsy_rhino.sql",
            "0001_lock_cart_line_price_provenance.sql",
            "0002_lock_order_line_snapshots.sql",
            "0003_identity_access.sql",
            "0004_email_outbox_data_rights.sql",
            "0005_fulfillment_returns_refunds.sql",
            "0006_allow_bounded_expired_cart_purge.sql",
            "0007_transactional_preprod_order_payment.sql",
          ].map((name) => ({ name })) };
        },
      };
    },
  };

  const response = await worker.fetch(
    request("/api/preprod/health", "GET"),
    { APP_ENV: "preproduction", PREPROD_ORIGIN: ORIGIN, DB: database },
    executionContext(),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "rollback");
  assert.equal(payload.runtimeMode, "pre-0008-bridge");
  assert.equal(payload.latestMigration, "0007_transactional_preprod_order_payment.sql");
  assert.equal(payload.launchReadiness, false);
  assert.ok(Object.values(payload.capabilities).every((value) =>
    typeof value === "object"
      ? Object.values(value).every((nested) => nested === false)
      : value === false
  ));
  assert.deepEqual(payload.stockProjection, []);
  assert.equal(statements.length, 1);

  const wrongMigration = {
    prepare() {
      return { async all() { return { results: [
        "0000_flimsy_rhino.sql",
        "0008_preprod_synthetic_demo_dataset.sql",
      ].map((name) => ({ name })) }; } };
    },
  };
  const rejected = await worker.fetch(
    request("/api/preprod/health", "GET"),
    {
      APP_ENV: "preproduction",
      PREPROD_ORIGIN: ORIGIN,
      DB: wrongMigration,
    },
    executionContext(),
  );
  assert.equal(rejected.status, 503);
  const rejectedPayload = await rejected.json();
  assert.equal(rejectedPayload.reason, "unexpected-migration");
  assert.equal(rejectedPayload.launchReadiness, false);
});

test("Bridge B7 built artifact has no functional bypass or post-0007 demo marker", () => {
  const artifact = readFileSync(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.doesNotMatch(
    artifact,
    /internal-functional|preprodFunctional|SYNTHETIC_DEMO|PREPROD_DEMO_DATASET|0008_preprod_synthetic|handleCartApi|handleShippingQuoteApi|handleOrderPaymentApi/,
  );
  assert.match(artifact, /pre-0008-bridge/);
  assert.deepEqual(
    readdirSync(new URL("../drizzle/", import.meta.url))
      .filter((name) => /^\d{4}.*\.sql$/.test(name))
      .sort(),
    [
      "0000_flimsy_rhino.sql",
      "0001_lock_cart_line_price_provenance.sql",
      "0002_lock_order_line_snapshots.sql",
      "0003_identity_access.sql",
      "0004_email_outbox_data_rights.sql",
      "0005_fulfillment_returns_refunds.sql",
      "0006_allow_bounded_expired_cart_purge.sql",
      "0007_transactional_preprod_order_payment.sql",
    ],
  );
});
