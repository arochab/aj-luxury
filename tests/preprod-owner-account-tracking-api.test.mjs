import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  SYNTHETIC_DEMO_ADDRESS_FIXTURES,
  SYNTHETIC_DEMO_EMAIL,
} from "../lib/preprod/synthetic-demo.ts";

const ORIGIN = "https://aj-luxury-preprod.example";
const OWNER_EMAIL = "adam.chabbi94@gmail.com";
const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrations = readdirSync(drizzleDirectory)
  .filter((name) => /^000[0-8]_.+\.sql$/.test(name))
  .sort()
  .map((name) => `${drizzleDirectory}${name}`);

class Statement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }
  bind(...values) { return new Statement(this.database, this.query, values); }
  async first() { return this.database.prepare(this.query).get(...this.values) ?? null; }
  async all() {
    return { success: true, results: this.database.prepare(this.query).all(...this.values), meta: { changes: 0 } };
  }
  async run() {
    if (/^\s*(?:SELECT|WITH)\b/i.test(this.query)) return this.all();
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

class D1 {
  #tail = Promise.resolve();
  constructor(database) { this.database = database; }
  prepare(query) { return new Statement(this.database, query); }
  batch(statements) {
    const execute = () => this.#run(statements);
    const result = this.#tail.then(execute, execute);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }
  async #run(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function applyMigrations(database) {
  for (const path of migrations) {
    for (const statement of readFileSync(path, "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  database.exec("CREATE TABLE d1_migrations (name TEXT PRIMARY KEY NOT NULL)");
  for (const path of migrations) {
    database.prepare("INSERT INTO d1_migrations (name) VALUES (?)")
      .run(path.split(/[/\\]/).at(-1));
  }
}

async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  applyMigrations(sqlite);
  const d1 = new D1(sqlite);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("owner-demo", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return { sqlite, d1, worker };
}

function cookies(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") ?? "").split(/,(?=\s*__Host-aj_)/);
  const session = values.find((value) => value.startsWith("__Host-aj_cart="));
  const csrf = values.find((value) => value.startsWith("__Host-aj_cart_csrf="));
  assert.ok(session && csrf);
  return {
    cookie: `${session.split(";", 1)[0]}; ${csrf.split(";", 1)[0]}`,
    csrf: csrf.split(";", 1)[0].split("=", 2)[1],
  };
}

function headers(session, email = OWNER_EMAIL) {
  return {
    Origin: ORIGIN,
    "Sec-Fetch-Site": "same-origin",
    "oai-authenticated-user-id": "owner-test-id",
    "oai-authenticated-user-email": email,
    ...(session?.cookie ? { Cookie: session.cookie } : {}),
    ...(session?.csrf ? { "X-CSRF-Token": session.csrf } : {}),
  };
}

async function invoke(context, pathname, options = {}) {
  return context.worker.fetch(
    new Request(`${ORIGIN}${pathname}`, options),
    {
      APP_ENV: "preproduction",
      PREPROD_ORIGIN: ORIGIN,
      PREPROD_DEMO_DATASET: "aj-demo-v1",
      PREPROD_OWNER_EMAIL: OWNER_EMAIL,
      DB: context.d1,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function createPaidOrder(context) {
  const opened = await invoke(context, "/api/preprod/cart", {
    method: "POST",
    headers: headers(),
  });
  assert.equal(opened.status, 201);
  const session = cookies(opened);
  assert.equal((await invoke(context, "/api/preprod/cart/lines/variant_boxer_pourpre_m", {
    method: "PUT",
    headers: { ...headers(session), "Content-Type": "application/json" },
    body: JSON.stringify({ quantity: 1 }),
  })).status, 200);
  const address = SYNTHETIC_DEMO_ADDRESS_FIXTURES[0].address;
  const quoted = await invoke(context, "/api/preprod/checkout/shipping-quote", {
    method: "POST",
    headers: {
      ...headers(session),
      "Content-Type": "application/json",
      "Idempotency-Key": "owner-quote-attempt-0001",
    },
    body: JSON.stringify({ address }),
  });
  assert.equal(quoted.status, 200);
  const quoteId = (await quoted.json()).data.quoteId;
  const created = await invoke(context, "/api/preprod/checkout/order", {
    method: "POST",
    headers: {
      ...headers(session),
      "Content-Type": "application/json",
      "Idempotency-Key": "owner-order-attempt-0001",
    },
    body: JSON.stringify({
      quoteId,
      address,
      email: SYNTHETIC_DEMO_EMAIL,
      termsAccepted: true,
      privacyAccepted: true,
      simulationAcknowledged: true,
    }),
  });
  assert.equal(created.status, 200);
  const paid = await invoke(context, "/api/preprod/checkout/test-payment", {
    method: "POST",
    headers: { ...headers(session), "Idempotency-Key": "owner-payment-attempt-0001" },
  });
  assert.equal(paid.status, 200);
  return session;
}

function installInterruptedShipment(context, status) {
  const order = context.sqlite.prepare(
    "SELECT id, shipping_quote_id FROM orders ORDER BY created_at DESC LIMIT 1",
  ).get();
  const shipmentHash = createHash("sha256")
    .update(`preprod-shipment\u0000${order.id}`)
    .digest("hex");
  const shipmentId = `shipment_${shipmentHash}`;
  const now = new Date();
  const createdAt = new Date(now.getTime() - 180_000).toISOString();
  context.sqlite.prepare(`INSERT INTO shipments (
    id, order_id, shipping_quote_id, status, idempotency_key,
    attempts, max_attempts, created_at, updated_at
  ) VALUES (?, ?, ?, 'label_pending', ?, 0, 5, ?, ?)`)
    .run(
      shipmentId,
      order.id,
      order.shipping_quote_id,
      `shipment:synthetic:${shipmentHash}`,
      createdAt,
      createdAt,
    );
  if (status !== "label_pending") {
    const expired = status === "label_claimed_expired";
    const leasedAt = new Date(now.getTime() - (expired ? 120_000 : 1_000))
      .toISOString();
    const leaseExpiresAt = new Date(Date.parse(leasedAt) + 60_000).toISOString();
    context.sqlite.prepare(`UPDATE shipments SET status='label_claimed',
      lease_token_hash=?, leased_at=?, lease_expires_at=?, attempts=1,
      updated_at=? WHERE id=?`).run(
      "0".repeat(64),
      leasedAt,
      leaseExpiresAt,
      leasedAt,
      shipmentId,
    );
  }
  return shipmentId;
}

test("owner-only passwordless account persists the synthetic delivery through delivered", async () => {
  const context = await fixture();
  const session = await createPaidOrder(context);
  const accountResponse = await invoke(context, "/api/preprod/account/current", {
    headers: headers(session),
  });
  assert.equal(accountResponse.status, 200);
  const account = (await accountResponse.json()).data;
  assert.equal(account.email, OWNER_EMAIL);
  assert.equal(account.authentication, "platform-passwordless");
  assert.equal(account.emailSent, false);
  assert.equal(account.orders[0].delivery.stage, "paid");
  assert.equal(account.orders[0].delivery.externalCarrierContacted, false);
  assert.equal(account.orders[0].delivery.parcelSent, false);
  assert.doesNotMatch(JSON.stringify(account), /RUE DEMONSTRATION|PARIS DEMO|DHL/i);

  const concurrentLabel = await Promise.all([0, 1].map(async () => {
    const response = await invoke(context, "/api/preprod/orders/current/tracking/advance", {
      method: "POST",
      headers: headers(session),
    });
    assert.equal(response.status, 200);
    return (await response.json()).data.orders[0].delivery.stage;
  }));
  assert.ok(concurrentLabel.every((stage) => ["paid", "label_ready"].includes(stage)));
  const converged = await invoke(context, "/api/preprod/account/current", {
    headers: headers(session),
  });
  assert.equal((await converged.json()).data.orders[0].delivery.stage, "label_ready");

  const observed = [];
  for (let index = 0; index < 3; index += 1) {
    const response = await invoke(context, "/api/preprod/orders/current/tracking/advance", {
      method: "POST",
      headers: headers(session),
    });
    assert.equal(response.status, 200);
    observed.push((await response.json()).data.orders[0].delivery.stage);
  }
  assert.deepEqual(observed, ["handed_over", "in_transit", "delivered"]);
  const replay = await invoke(context, "/api/preprod/orders/current/tracking/advance", {
    method: "POST",
    headers: headers(session),
  });
  assert.equal((await replay.json()).data.orders[0].delivery.stage, "delivered");
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM shipments").get().count, 1);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM shipment_tracking_events").get().count, 3);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM carrier_event_receipts").get().count, 2);
  context.sqlite.close();
});

test("wrong identity and missing CSRF fail closed without mutating the owner order", async () => {
  const context = await fixture();
  const session = await createPaidOrder(context);
  const realPrepare = context.d1.prepare.bind(context.d1);
  let databaseTouched = false;
  context.d1.prepare = (...args) => {
    databaseTouched = true;
    return realPrepare(...args);
  };
  const wrong = await invoke(context, "/api/preprod/account/current", {
    headers: headers(session, "intruder@example.com"),
  });
  assert.equal(wrong.status, 404);
  const wrongOrder = await invoke(context, "/api/preprod/checkout/order", {
    method: "POST",
    headers: headers(session, "intruder@example.com"),
  });
  assert.equal(wrongOrder.status, 404);
  assert.equal(databaseTouched, false);
  context.d1.prepare = realPrepare;
  const rejected = await invoke(context, "/api/preprod/orders/current/tracking/advance", {
    method: "POST",
    headers: { ...headers(session), "X-CSRF-Token": "wrong" },
  });
  assert.equal(rejected.status, 403);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM shipments").get().count, 0);
  context.sqlite.close();
});

test("owner-only diagnostics expose bounded readiness and cart write failures stay categorized", async () => {
  const context = await fixture();
  const diagnostics = await invoke(context, "/api/preprod/diagnostics", {
    headers: headers(),
  });
  assert.equal(diagnostics.status, 200);
  const data = (await diagnostics.json()).data;
  assert.equal(data.database, "reachable");
  assert.equal(data.ownerAccess, "recognized");
  assert.equal(data.dataset.fixtureVersion, "aj-demo-v1");
  assert.equal(data.dataset.active, true);
  assert.deepEqual(data.cartCapacity, {
    active: 0,
    activeLimit: 250,
    createdLastMinute: 0,
    perMinuteLimit: 30,
  });
  assert.deepEqual(data.simulation, {
    account: true,
    order: true,
    payment: true,
    tracking: true,
    emailSent: false,
    externalCarrierContacted: false,
    parcelSent: false,
  });
  const hidden = await invoke(context, "/api/preprod/diagnostics", {
    headers: headers(undefined, "intruder@example.com"),
  });
  assert.equal(hidden.status, 404);

  context.sqlite.exec("DROP TRIGGER trg_preprod_demo_cart_active_insert");
  context.sqlite.exec(`CREATE TRIGGER trg_preprod_demo_cart_active_insert
    BEFORE INSERT ON carts BEGIN SELECT RAISE(ABORT, 'fixture cart reject'); END`);
  const rejected = await invoke(context, "/api/preprod/cart", {
    method: "POST",
    headers: headers(),
  });
  assert.equal(rejected.status, 503);
  const failure = (await rejected.json()).error;
  assert.equal(failure.code, "CART_PERSISTENCE_REJECTED");
  assert.equal(failure.diagnostic, "unexpected-cart-write-failure");
  assert.equal("email" in failure, false);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count, 0);
  context.sqlite.close();
});

test("cart creation survives an opportunistic retention batch failure without weakening guards", async () => {
  const context = await fixture();
  const realBatch = context.d1.batch.bind(context.d1);
  let maintenanceFailed = false;
  context.d1.batch = async (statements) => {
    if (!maintenanceFailed && statements.length === 5) {
      maintenanceFailed = true;
      throw new Error("simulated retention statement incompatibility");
    }
    return realBatch(statements);
  };
  const opened = await invoke(context, "/api/preprod/cart", {
    method: "POST",
    headers: headers(),
  });
  assert.equal(opened.status, 201);
  assert.equal(maintenanceFailed, true);
  assert.equal(context.sqlite.prepare("SELECT COUNT(*) count FROM carts").get().count, 1);
  assert.ok(cookies(opened).csrf);
  context.sqlite.close();
});

test("interrupted synthetic labels recover only after the D1 lease expires", async () => {
  const pending = await fixture();
  const pendingSession = await createPaidOrder(pending);
  installInterruptedShipment(pending, "label_pending");
  const pendingRecovered = await invoke(
    pending,
    "/api/preprod/orders/current/tracking/advance",
    { method: "POST", headers: headers(pendingSession) },
  );
  assert.equal(pendingRecovered.status, 200);
  assert.equal(
    (await pendingRecovered.json()).data.orders[0].delivery.stage,
    "label_ready",
  );
  pending.sqlite.close();

  const active = await fixture();
  const activeSession = await createPaidOrder(active);
  const activeShipmentId = installInterruptedShipment(
    active,
    "label_claimed_active",
  );
  const activeReplay = await invoke(
    active,
    "/api/preprod/orders/current/tracking/advance",
    { method: "POST", headers: headers(activeSession) },
  );
  assert.equal(activeReplay.status, 200);
  assert.equal((await activeReplay.json()).data.orders[0].delivery.stage, "paid");
  assert.deepEqual(
    { ...active.sqlite.prepare(
      "SELECT status, attempts FROM shipments WHERE id=?",
    ).get(activeShipmentId) },
    { status: "label_claimed", attempts: 1 },
  );
  active.sqlite.close();

  const expired = await fixture();
  const expiredSession = await createPaidOrder(expired);
  const expiredShipmentId = installInterruptedShipment(
    expired,
    "label_claimed_expired",
  );
  const concurrent = await Promise.all([0, 1].map(() => invoke(
    expired,
    "/api/preprod/orders/current/tracking/advance",
    { method: "POST", headers: headers(expiredSession) },
  )));
  assert.ok(concurrent.every((response) => response.status === 200));
  const final = await invoke(expired, "/api/preprod/account/current", {
    headers: headers(expiredSession),
  });
  assert.equal((await final.json()).data.orders[0].delivery.stage, "label_ready");
  assert.deepEqual(
    { ...expired.sqlite.prepare(
      "SELECT status, attempts FROM shipments WHERE id=?",
    ).get(expiredShipmentId) },
    { status: "label_ready", attempts: 2 },
  );
  expired.sqlite.close();
});
