import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { D1CommerceStore } from "../lib/commerce/d1-commerce-store.ts";

const ORIGIN = "https://aj-luxury-preprod.example";
const drizzleDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
const migrationPaths = readdirSync(drizzleDirectory)
  .filter((name) => /^000\d_.+\.sql$/.test(name))
  .sort()
  .map((name) => `${drizzleDirectory}${name}`);

class SQLiteD1Statement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }

  bind(...values) {
    return new SQLiteD1Statement(this.database, this.query, values);
  }

  async first() {
    return this.database.prepare(this.query).get(...this.values) ?? null;
  }

  async all() {
    return {
      success: true,
      results: this.database.prepare(this.query).all(...this.values),
      meta: { changes: 0 },
    };
  }

  async run() {
    if (/^\s*(?:SELECT|WITH)\b/i.test(this.query)) {
      return {
        success: true,
        results: this.database.prepare(this.query).all(...this.values),
        meta: { changes: 0 },
      };
    }
    const result = this.database.prepare(this.query).run(...this.values);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}

class SQLiteD1Database {
  #tail = Promise.resolve();

  constructor(database) {
    this.database = database;
  }

  prepare(query) {
    return new SQLiteD1Statement(this.database, query);
  }

  batch(statements) {
    const execute = () => this.#runBatch(statements);
    const result = this.#tail.then(execute, execute);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #runBatch(statements) {
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
  for (const migrationPath of migrationPaths) {
    const migration = readFileSync(migrationPath, "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      const sql = statement.trim();
      if (sql) database.exec(sql);
    }
  }
}

async function createFixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  applyMigrations(sqlite);
  const d1 = new SQLiteD1Database(sqlite);
  await new D1CommerceStore(d1).seedLaunchCatalog("2099-08-10T12:00:00.000Z");
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "cart-api",
    `${process.pid}-${Date.now()}-${Math.random()}`,
  );
  const { default: worker } = await import(workerUrl.href);
  return { sqlite, d1, worker };
}

function requestHeaders({ cookie, csrf, origin = ORIGIN } = {}) {
  return {
    Origin: origin,
    "Sec-Fetch-Site": "same-origin",
    ...(cookie ? { Cookie: cookie } : {}),
    ...(csrf ? { "X-CSRF-Token": csrf } : {}),
  };
}

async function invoke(fixture, pathname, options = {}) {
  const environment = {
    APP_ENV: options.environment ?? "preproduction",
    DB: fixture.d1,
    ...(!options.omitPreprodOrigin
      ? { PREPROD_ORIGIN: options.preprodOrigin ?? ORIGIN }
      : {}),
  };
  return fixture.worker.fetch(
    new Request(`${ORIGIN}${pathname}`, options),
    environment,
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function setCookieValues(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  return (response.headers.get("set-cookie") ?? "").split(
    /,(?=\s*__Host-aj_)/,
  );
}

function sessionFrom(response) {
  const values = setCookieValues(response);
  const session = values.find((value) =>
    value.startsWith("__Host-aj_cart="),
  );
  const csrf = values.find((value) =>
    value.startsWith("__Host-aj_cart_csrf="),
  );
  assert.ok(session);
  assert.ok(csrf);
  assert.match(
    session,
    /^__Host-aj_cart=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax$/,
  );
  assert.match(
    csrf,
    /^__Host-aj_cart_csrf=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=604800; Secure; SameSite=Strict$/,
  );
  const sessionPair = session.split(";", 1)[0];
  const csrfPair = csrf.split(";", 1)[0];
  return {
    cookie: `${sessionPair}; ${csrfPair}`,
    rawSession: sessionPair.split("=", 2)[1],
    csrf: csrfPair.split("=", 2)[1],
  };
}

async function openCart(fixture) {
  const response = await invoke(fixture, "/api/preprod/cart", {
    method: "POST",
    headers: requestHeaders(),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.deepEqual(payload.data, {
    status: "open",
    currency: "EUR",
    expiresAt: payload.data.expiresAt,
    itemCount: 0,
    subtotalCents: 0,
    lines: [],
  });
  return sessionFrom(response);
}

function lineRequest(session, quantity) {
  return {
    method: "PUT",
    headers: {
      ...requestHeaders(session),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ quantity }),
  };
}

test("preproduction cart keeps raw tokens out of D1 and survives reload", async () => {
  const fixture = await createFixture();
  const anonymous = await invoke(fixture, "/api/preprod/cart");
  assert.equal(anonymous.status, 200);
  assert.deepEqual(await anonymous.json(), {
    data: {
      status: "empty",
      currency: "EUR",
      expiresAt: null,
      itemCount: 0,
      subtotalCents: 0,
      lines: [],
    },
  });

  const session = await openCart(fixture);
  const storedCart = fixture.sqlite.prepare("SELECT id FROM carts").get();
  assert.match(storedCart.id, /^cart_[0-9a-f]{64}$/);
  assert.equal(storedCart.id.includes(session.rawSession), false);

  const variantId = "variant_boxer_pourpre_m";
  const first = await invoke(
    fixture,
    `/api/preprod/cart/lines/${variantId}`,
    lineRequest(session, 2),
  );
  assert.equal(first.status, 200);
  const firstPayload = await first.json();
  assert.equal(firstPayload.data.itemCount, 2);
  assert.equal(firstPayload.data.subtotalCents, 5_998);
  assert.deepEqual(firstPayload.data.lines[0], {
    variantId,
    productId: "product_apollon",
    productSlug: "pourpre",
    colorKey: "pourpre",
    colorName: "Pourpre Impérial",
    size: "M",
    imageUrl: "/images/client/raw/product-card-pourpre.webp",
    quantity: 2,
    unitPriceCents: 2_999,
    lineTotalCents: 5_998,
    stockState: "available",
  });
  assert.doesNotMatch(
    JSON.stringify(firstPayload),
    /physical|reserve|available_to_sell|internal_reference|sku|email/i,
  );

  const replay = await invoke(
    fixture,
    `/api/preprod/cart/lines/${variantId}`,
    lineRequest(session, 2),
  );
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), firstPayload);
  assert.equal(
    fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM cart_lines").get().count,
    1,
  );
  assert.equal(
    fixture.sqlite
      .prepare(
        "SELECT active_reserved_quantity FROM inventory WHERE variant_id = ?",
      )
      .get(variantId).active_reserved_quantity,
    0,
  );

  const reload = await invoke(fixture, "/api/preprod/cart", {
    headers: { Cookie: session.cookie },
  });
  assert.equal(reload.status, 200);
  assert.deepEqual(await reload.json(), firstPayload);
  assert.equal(reload.headers.get("cache-control"), "no-store");

  const reopen = await invoke(fixture, "/api/preprod/cart", {
    method: "POST",
    headers: requestHeaders(session),
  });
  assert.equal(reopen.status, 200);
  assert.deepEqual(await reopen.json(), firstPayload);
  assert.equal(setCookieValues(reopen).filter(Boolean).length, 0);
  assert.equal(
    fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM carts").get().count,
    1,
  );
  fixture.sqlite.close();
});

test("cart mutations enforce exact origin, Sec-Fetch-Site, CSRF and strict payloads", async () => {
  const fixture = await createFixture();
  const session = await openCart(fixture);
  const pathname = "/api/preprod/cart/lines/variant_boxer_rose-pale_s";

  for (const [name, headers] of [
    ["missing origin", requestHeaders({ cookie: session.cookie, csrf: session.csrf, origin: "" })],
    ["wrong origin", requestHeaders({ cookie: session.cookie, csrf: session.csrf, origin: "https://evil.example" })],
    ["wrong csrf", requestHeaders({ cookie: session.cookie, csrf: "A".repeat(43) })],
  ]) {
    const response = await invoke(fixture, pathname, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 1 }),
    });
    assert.equal(response.status, name === "wrong csrf" ? 403 : 403, name);
  }
  const crossSite = await invoke(fixture, pathname, {
    method: "PUT",
    headers: {
      ...requestHeaders(session),
      "Sec-Fetch-Site": "cross-site",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ quantity: 1 }),
  });
  assert.equal(crossSite.status, 403);

  for (const body of [
    { quantity: 0 },
    { quantity: 6 },
    { quantity: 1.5 },
    { quantity: 1, priceCents: 1 },
  ]) {
    const response = await invoke(fixture, pathname, {
      method: "PUT",
      headers: {
        ...requestHeaders(session),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).error.code, "INVALID_BODY");
  }

  let cancelled = false;
  const oversizedStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(600));
      controller.enqueue(new Uint8Array(600));
    },
    cancel() {
      cancelled = true;
    },
  });
  const oversized = await invoke(fixture, pathname, {
    method: "PUT",
    headers: {
      ...requestHeaders(session),
      "Content-Type": "application/json",
    },
    body: oversizedStream,
    duplex: "half",
  });
  assert.equal(oversized.status, 400);
  assert.equal((await oversized.json()).error.code, "INVALID_BODY");
  assert.equal(cancelled, true);

  const encoded = await invoke(fixture, pathname, {
    method: "PUT",
    headers: {
      ...requestHeaders(session),
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
    },
    body: JSON.stringify({ quantity: 1 }),
  });
  assert.equal(encoded.status, 400);
  assert.equal((await encoded.json()).error.code, "INVALID_BODY");
  assert.equal(
    fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM cart_lines").get().count,
    0,
  );
  fixture.sqlite.close();
});

test("cart routes reject unsupported methods and invalid sessions before mutation", async () => {
  const fixture = await createFixture();
  const unsupportedCart = await invoke(fixture, "/api/preprod/cart", {
    method: "DELETE",
  });
  assert.equal(unsupportedCart.status, 405);
  assert.equal(unsupportedCart.headers.get("allow"), "GET, POST");

  const unsupportedLine = await invoke(
    fixture,
    "/api/preprod/cart/lines/variant_boxer_pourpre_m",
    { method: "POST" },
  );
  assert.equal(unsupportedLine.status, 405);
  assert.equal(unsupportedLine.headers.get("allow"), "PUT, DELETE");

  const invalidSession = await invoke(fixture, "/api/preprod/cart", {
    headers: { Cookie: "__Host-aj_cart=invalid" },
  });
  assert.equal(invalidSession.status, 401);
  assert.equal((await invalidSession.json()).error.code, "CART_SESSION_INVALID");
  assert.match(
    setCookieValues(invalidSession).join("\n"),
    /__Host-aj_cart=; Path=\/; Max-Age=0/,
  );

  const session = await openCart(fixture);
  const duplicateSession = await invoke(fixture, "/api/preprod/cart", {
    headers: {
      Cookie: `${session.cookie}; __Host-aj_cart=${session.rawSession}`,
    },
  });
  assert.equal(duplicateSession.status, 401);
  assert.equal(
    (await duplicateSession.json()).error.code,
    "CART_SESSION_INVALID",
  );

  const unknownVariant = await invoke(
    fixture,
    "/api/preprod/cart/lines/variant_unknown",
    lineRequest(session, 1),
  );
  assert.equal(unknownVariant.status, 404);
  assert.equal((await unknownVariant.json()).error.code, "VARIANT_NOT_FOUND");
  assert.equal(
    fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM cart_lines").get().count,
    0,
  );
  fixture.sqlite.close();
});

test("two opaque sessions stay isolated and line deletion is idempotent", async () => {
  const fixture = await createFixture();
  const firstSession = await openCart(fixture);
  const secondSession = await openCart(fixture);
  const firstVariant = "variant_boxer_pourpre_s";
  const secondVariant = "variant_boxer_lilas-bleu-clair_xl";

  const swappedCsrfCookie = `${firstSession.cookie
    .split("; ")
    .find((value) => value.startsWith("__Host-aj_cart="))}; __Host-aj_cart_csrf=${secondSession.csrf}`;
  const swapped = await invoke(fixture, "/api/preprod/cart", {
    headers: { Cookie: swappedCsrfCookie },
  });
  assert.equal(swapped.status, 401);
  assert.equal((await swapped.json()).error.code, "CART_SESSION_INVALID");

  assert.equal(
    (
      await invoke(
        fixture,
        `/api/preprod/cart/lines/${firstVariant}`,
        lineRequest(firstSession, 1),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await invoke(
        fixture,
        `/api/preprod/cart/lines/${secondVariant}`,
        lineRequest(secondSession, 3),
      )
    ).status,
    200,
  );
  const firstRead = await invoke(fixture, "/api/preprod/cart", {
    headers: { Cookie: firstSession.cookie },
  });
  assert.deepEqual(
    (await firstRead.json()).data.lines.map((line) => line.variantId),
    [firstVariant],
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const removed = await invoke(
      fixture,
      `/api/preprod/cart/lines/${firstVariant}`,
      {
        method: "DELETE",
        headers: requestHeaders(firstSession),
      },
    );
    assert.equal(removed.status, 200);
    assert.deepEqual((await removed.json()).data.lines, []);
  }
  assert.equal(
    fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM carts").get().count,
    2,
  );
  assert.equal(
    fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM cart_lines").get().count,
    1,
  );
  fixture.sqlite.close();
});

test("cart APIs stay invisible outside preproduction and sanitize closed sessions", async () => {
  const fixture = await createFixture();
  const production = await invoke(fixture, "/api/preprod/cart", {
    environment: "production",
  });
  assert.equal(production.status, 404);
  assert.deepEqual(await production.json(), { error: "not-found" });

  const originMissing = await invoke(fixture, "/api/preprod/cart", {
    method: "POST",
    headers: requestHeaders(),
    omitPreprodOrigin: true,
  });
  assert.equal(originMissing.status, 404);
  assert.deepEqual(await originMissing.json(), { error: "not-found" });

  const wrongEffectiveHost = await fixture.worker.fetch(
    new Request("https://different-preprod.example/api/preprod/cart"),
    { APP_ENV: "preproduction", PREPROD_ORIGIN: ORIGIN, DB: fixture.d1 },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(wrongEffectiveHost.status, 404);
  assert.deepEqual(await wrongEffectiveHost.json(), { error: "not-found" });

  const session = await openCart(fixture);
  fixture.sqlite.prepare("UPDATE carts SET status = 'converted'").run();
  const closed = await invoke(fixture, "/api/preprod/cart", {
    headers: { Cookie: session.cookie },
  });
  assert.equal(closed.status, 409);
  const payload = await closed.json();
  assert.equal(payload.error.code, "CART_CLOSED");
  assert.deepEqual(Object.keys(payload.error).sort(), ["code", "message", "requestId"]);
  assert.doesNotMatch(
    JSON.stringify(payload),
    /sqlite|sql|token|cookie|cart_[0-9a-f]{16}/i,
  );
  const clearCookies = setCookieValues(closed).join("\n");
  assert.match(clearCookies, /__Host-aj_cart=; Path=\/; Max-Age=0/);
  assert.match(clearCookies, /__Host-aj_cart_csrf=; Path=\/; Max-Age=0/);
  fixture.sqlite.close();
});

test("anonymous cart creation expires stale rows and fails closed at the lean capacity gate", async () => {
  const fixture = await createFixture();
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const insert = fixture.sqlite.prepare(
    `INSERT INTO carts (
      id, status, currency, expires_at, created_at, updated_at
    ) VALUES (?, 'open', 'EUR', ?, ?, ?)`,
  );
  const staleId = `cart_${"f".repeat(64)}`;
  insert.run(staleId, past, past, past);
  insert.run("cart_legacy_capacity", past, now, now);
  for (let index = 0; index < 250; index += 1) {
    insert.run(`cart_${index.toString(16).padStart(64, "0")}`, future, now, now);
  }

  const response = await invoke(fixture, "/api/preprod/cart", {
    method: "POST",
    headers: requestHeaders(),
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal((await response.json()).error.code, "CART_CAPACITY_REACHED");
  assert.equal(
    fixture.sqlite
      .prepare("SELECT status FROM carts WHERE id = ?")
      .get(staleId).status,
    "expired",
  );
  assert.equal(
    fixture.sqlite
      .prepare("SELECT status FROM carts WHERE id = 'cart_legacy_capacity'")
      .get().status,
    "open",
  );
  assert.equal(
    fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM carts").get().count,
    252,
  );
  fixture.sqlite.close();
});

test("cart creation opportunistically purges only old anonymous expired carts", async () => {
  const fixture = await createFixture();
  const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const oldAnonymousId = `cart_${"a".repeat(64)}`;
  const recentAnonymousId = `cart_${"b".repeat(64)}`;
  const oldIdentifiedId = `cart_${"c".repeat(64)}`;
  const liveAnonymousId = `cart_${"d".repeat(64)}`;
  const insert = fixture.sqlite.prepare(
    `INSERT INTO carts (
      id, email, status, currency, expires_at, created_at, updated_at
    ) VALUES (?, ?, 'open', 'EUR', ?, ?, ?)`,
  );
  const line = fixture.sqlite.prepare(
    `INSERT INTO cart_lines (
      id, cart_id, variant_id, quantity, unit_price_cents, created_at, updated_at
    ) VALUES (?, ?, 'variant_boxer_pourpre_m', 1, 2999, ?, ?)`,
  );
  const seedCart = ({ email = null, expiresAt = old, id }) => {
    insert.run(id, email, future, old, old);
    line.run(`line_${id}`, id, old, old);
    fixture.sqlite
      .prepare("UPDATE carts SET status = 'expired', expires_at = ? WHERE id = ?")
      .run(expiresAt, id);
  };
  seedCart({ id: oldAnonymousId });
  seedCart({ id: recentAnonymousId, expiresAt: recent });
  seedCart({ id: oldIdentifiedId, email: "retained@example.com" });
  seedCart({ id: "cart_legacy" });
  insert.run(liveAnonymousId, null, future, old, old);
  line.run(`line_${liveAnonymousId}`, liveAnonymousId, old, old);

  const response = await invoke(fixture, "/api/preprod/cart", {
    method: "POST",
    headers: requestHeaders(),
  });
  assert.equal(response.status, 201);
  const createdId = fixture.sqlite
    .prepare(
      "SELECT id FROM carts WHERE status = 'open' ORDER BY created_at DESC LIMIT 1",
    )
    .get().id;
  assert.deepEqual(
    fixture.sqlite
      .prepare("SELECT id FROM carts ORDER BY id")
      .all()
      .map((row) => row.id),
    [
      liveAnonymousId,
      "cart_legacy",
      oldIdentifiedId,
      recentAnonymousId,
      createdId,
    ].sort(),
  );
  assert.equal(
    fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM cart_lines").get().count,
    4,
  );
  fixture.sqlite.close();
});

test("0006 retention trigger admits only the bounded anonymous purge case", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE carts (
      id TEXT PRIMARY KEY, customer_id TEXT, email TEXT, status TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE cart_lines (id TEXT PRIMARY KEY, cart_id TEXT NOT NULL);
    CREATE TABLE stock_reservations (id TEXT PRIMARY KEY, cart_id TEXT NOT NULL);
    CREATE TABLE orders (id TEXT PRIMARY KEY, cart_id TEXT NOT NULL);
    CREATE TABLE shipping_quotes (
      id TEXT PRIMARY KEY, cart_id TEXT NOT NULL, selected_at TEXT
    );
    CREATE TRIGGER trg_cart_lines_validate_delete
      BEFORE DELETE ON cart_lines BEGIN SELECT RAISE(ABORT, 'legacy'); END;
    CREATE TRIGGER trg_cart_lines_lock_selected_quote_delete
      BEFORE DELETE ON cart_lines
      WHEN EXISTS (
        SELECT 1 FROM shipping_quotes
        WHERE cart_id = OLD.cart_id AND selected_at IS NOT NULL
      )
      BEGIN SELECT RAISE(ABORT, 'fulfillment_quote_mismatch'); END;
  `);
  const migration = readFileSync(
    `${drizzleDirectory}0006_allow_bounded_expired_cart_purge.sql`,
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) sqlite.exec(statement);
  }

  const old = "2000-01-01T00:00:00.000Z";
  const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const canonicalId = (hexCharacter) => `cart_${hexCharacter.repeat(64)}`;
  const cases = [
    [canonicalId("a"), null, null, "expired", old, null],
    ["cart_open", null, null, "open", future, null],
    [canonicalId("b"), null, null, "expired", recent, null],
    [canonicalId("c"), null, "known@example.com", "expired", old, null],
    [canonicalId("d"), "customer_1", null, "expired", old, null],
    ["cart_legacy", null, null, "expired", old, null],
    [canonicalId("1"), null, null, "expired", old, "orders"],
    [canonicalId("2"), null, null, "expired", old, "stock_reservations"],
    [canonicalId("3"), null, null, "expired", old, "shipping_quotes"],
  ];
  for (const [id, customerId, email, status, expiresAt, referenceTable] of cases) {
    sqlite
      .prepare(
        "INSERT INTO carts (id, customer_id, email, status, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, customerId, email, status, expiresAt);
    sqlite.prepare("INSERT INTO cart_lines (id, cart_id) VALUES (?, ?)").run(`line_${id}`, id);
    if (referenceTable) {
      sqlite
        .prepare(`INSERT INTO ${referenceTable} (id, cart_id) VALUES (?, ?)`)
        .run(`${referenceTable}_${id}`, id);
    }
  }

  assert.equal(
    sqlite.prepare("DELETE FROM cart_lines WHERE cart_id = ?").run(canonicalId("a")).changes,
    1,
  );
  assert.equal(
    sqlite.prepare("DELETE FROM cart_lines WHERE cart_id = 'cart_open'").run().changes,
    1,
  );
  for (const [id] of cases.slice(2)) {
    assert.throws(
      () => sqlite.prepare("DELETE FROM cart_lines WHERE cart_id = ?").run(id),
      /commerce_cart_line_delete_not_allowed/,
      id,
    );
  }

  for (const [id, selectedAt] of [
    ["cart_open_unselected_quote", null],
    ["cart_open_selected_quote", "2099-01-01T00:00:00.000Z"],
  ]) {
    sqlite
      .prepare(
        "INSERT INTO carts (id, customer_id, email, status, expires_at) VALUES (?, NULL, NULL, 'open', ?)",
      )
      .run(id, future);
    sqlite.prepare("INSERT INTO cart_lines (id, cart_id) VALUES (?, ?)").run(`line_${id}`, id);
    sqlite
      .prepare("INSERT INTO shipping_quotes (id, cart_id, selected_at) VALUES (?, ?, ?)")
      .run(`quote_${id}`, id, selectedAt);
  }
  assert.equal(
    sqlite
      .prepare("DELETE FROM cart_lines WHERE cart_id = 'cart_open_unselected_quote'")
      .run().changes,
    1,
  );
  assert.throws(
    () => sqlite.prepare("DELETE FROM cart_lines WHERE cart_id = 'cart_open_selected_quote'").run(),
    /fulfillment_quote_mismatch/,
  );
  sqlite.close();
});
