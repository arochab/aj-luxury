import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { productionOperatorConsoleApiResponse } from "../worker/production-operator-console-api.ts";
import { D1CustomerPasswordAccountStore } from "../lib/commerce/customer-password-account-store.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const plan = JSON.parse(readFileSync(`${root}drizzle/production-migrations.json`, "utf8"));

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
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

class D1 {
  constructor(database) { this.database = database; }
  prepare(query) { return new Statement(this.database, query); }
  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) {
        results.push(/^\s*(?:SELECT|PRAGMA|WITH\b)/i.test(statement.query)
          ? await statement.all()
          : await statement.run());
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function context() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const name of plan.ordered) {
    const sql = readFileSync(`${root}drizzle/${name}`, "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement.trim());
    }
  }
  const database = new D1(sqlite);
  const env = {
    APP_ENV: "production",
    COMMERCE_MODE: "controlled",
    COMMERCE_ORIGIN: "https://ajluxurystore.com",
    OPERATOR_ADMIN_MFA_ENABLED: "true",
    OPERATOR_CONSOLE_ENABLED: "true",
    CLOUDFLARE_ACCESS_MFA_ATTESTATION: "independent-mfa:required-every-login",
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://aj-luxury.cloudflareaccess.com",
    CLOUDFLARE_ACCESS_AUD: "accessAudience_1234567890",
    COMMERCE_CONTROLLED_OWNER_EMAIL: "adam@example.com",
    COMMERCE_ADMIN_ALLOWED_EMAILS_JSON: JSON.stringify([
      "adam.chabbi94@gmail.com",
      "jeremy@ajluxurystore.com",
      "jeremyajluxurystore@gmail.com",
    ]),
    DB: database,
  };
  return { sqlite, env };
}

const now = "2026-09-01T09:00:00.000Z";
const identity = Object.freeze({
  issuer: "https://aj-luxury.cloudflareaccess.com",
  subject: "access-owner-1",
  email: "adam@example.com",
  authenticatedAt: "2026-09-01T08:59:00.000Z",
  assertion: "signed-access-jwt-fixture",
});

test("native AJ Luxury credentials create an owner session without Access or MFA", async () => {
  const { sqlite, env } = context();
  try {
    const store = new D1CustomerPasswordAccountStore(env.DB);
    const registration = await store.register({
      email: "adam.chabbi94@gmail.com",
      password: "Satin-Pourpre-2026!",
      acceptsMarketing: false,
      source: "account_registration",
      privacyVersion: "2026-08-26",
      now: "2026-09-01T08:50:00.000Z",
    });
    await store.verifyEmail(
      registration.emailDelivery.rawToken,
      "2026-09-01T08:55:00.000Z",
    );
    const session = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/session",
      {
        method: "POST",
        headers: {
          Origin: "https://ajluxurystore.com",
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "adam.chabbi94@gmail.com",
          password: "Satin-Pourpre-2026!",
        }),
      },
    ), env, { now: () => now });
    assert.equal(session.status, 201);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM administrators").get().count, 1);
    assert.equal(sqlite.prepare("SELECT aal FROM admin_sessions").get().aal, 2);
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS count FROM customer_sessions WHERE revoked_at IS NULL",
    ).get().count, 1);

    const orders = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/orders",
      { headers: { Cookie: cookies(session) } },
    ), env, { now: () => now });
    assert.equal(orders.status, 200);

    const rejected = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/session",
      {
        method: "POST",
        headers: {
          Origin: "https://ajluxurystore.com",
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "intruder@example.com",
          password: "Satin-Pourpre-2026!",
        }),
      },
    ), env, { now: () => now });
    assert.equal(rejected.status, 401);
    assert.equal((await rejected.json()).error.code, "INVALID_ADMIN_CREDENTIALS");
  } finally {
    sqlite.close();
  }
});

test("all three named administrators are accepted and a confirmed customer outside the list is refused", async () => {
  const { sqlite, env } = context();
  const password = "Satin-Pourpre-2026!";
  const allowedEmails = [
    "adam.chabbi94@gmail.com",
    "jeremy@ajluxurystore.com",
    "jeremyajluxurystore@gmail.com",
  ];
  try {
    const store = new D1CustomerPasswordAccountStore(env.DB);
    for (const [index, email] of allowedEmails.entries()) {
      const registration = await store.register({
        email,
        password,
        acceptsMarketing: false,
        source: "account_registration",
        privacyVersion: "2026-08-26",
        now: `2026-09-01T08:${40 + index}:00.000Z`,
      });
      await store.verifyEmail(
        registration.emailDelivery.rawToken,
        `2026-09-01T08:${50 + index}:00.000Z`,
      );
      const response = await productionOperatorConsoleApiResponse(new Request(
        "https://ajluxurystore.com/api/commerce/admin/session",
        {
          method: "POST",
          headers: {
            Origin: "https://ajluxurystore.com",
            "Sec-Fetch-Site": "same-origin",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        },
      ), env, { now: () => now });
      assert.equal(response.status, 201, `${email} should be admitted`);
    }

    const outsider = await store.register({
      email: "confirmed.customer@example.com",
      password,
      acceptsMarketing: false,
      source: "account_registration",
      privacyVersion: "2026-08-26",
      now: "2026-09-01T08:45:00.000Z",
    });
    await store.verifyEmail(outsider.emailDelivery.rawToken, "2026-09-01T08:55:00.000Z");
    const refused = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/session",
      {
        method: "POST",
        headers: {
          Origin: "https://ajluxurystore.com",
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "confirmed.customer@example.com", password }),
      },
    ), env, { now: () => now });
    assert.equal(refused.status, 401);
    assert.equal((await refused.json()).error.code, "INVALID_ADMIN_CREDENTIALS");
  } finally {
    sqlite.close();
  }
});

function cookies(response) {
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

test("fresh allowlisted Cloudflare Access creates an owner session and lists no-PII order summaries", async () => {
  const { sqlite, env } = context();
  try {
    const session = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/session",
      { method: "POST", headers: { Origin: "https://ajluxurystore.com", "Sec-Fetch-Site": "same-origin" } },
    ), env, { now: () => now, accessIdentity: async () => identity });
    assert.equal(session.status, 201);
    const body = await session.clone().json();
    assert.equal(body.data.role, "owner");
    assert.match(body.data.csrfToken, /^[A-Za-z0-9_-]{43,128}$/);
    assert.equal(session.headers.getSetCookie().length, 2);
    assert.equal(sqlite.prepare("SELECT aal FROM admin_sessions").get().aal, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM administrators").get().count, 1);

    const orders = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/orders",
      { headers: { Cookie: cookies(session) } },
    ), env, { now: () => now, accessIdentity: async () => identity });
    assert.equal(orders.status, 200);
    assert.deepEqual((await orders.json()).data, []);

    const inventory = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/inventory",
      { headers: { Cookie: cookies(session) } },
    ), env, { now: () => now, accessIdentity: async () => identity });
    assert.equal(inventory.status, 200);
    assert.deepEqual((await inventory.json()).data, {
      totals: {
        physicalQuantity: 0,
        giftReserveQuantity: 0,
        safetyReserveQuantity: 0,
        activeReservedQuantity: 0,
        soldQuantity: 0,
        availableQuantity: 0,
      },
      items: [],
    });

    const missingDetail = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/orders/order_missing",
      { headers: { Cookie: cookies(session) } },
    ), env, { now: () => now, accessIdentity: async () => identity });
    assert.equal(missingDetail.status, 404);
    assert.equal((await missingDetail.json()).error.code, "ORDER_NOT_FOUND");
  } finally {
    sqlite.close();
  }
});

test("owner inventory view reconciles physical, protected and available quantities", async () => {
  const { sqlite, env } = context();
  try {
    sqlite.exec(`
      INSERT INTO products (id,slug,name,status,price_cents,currency,created_at,updated_at)
      VALUES ('product_apollon','apollon','Apollon','active',2999,'EUR','2026-09-01T08:00:00.000Z','2026-09-01T08:00:00.000Z');
      INSERT INTO variants (id,product_id,internal_reference,color_key,color_name,size,swatch,image_url,active,sort_order,created_at,updated_at)
      VALUES ('variant_pourpre_s','product_apollon','AJL-APO-PUR-S','pourpre','Pourpre Impérial','S','#6b1238','/images/pourpre.jpg',1,1,'2026-09-01T08:00:00.000Z','2026-09-01T08:00:00.000Z');
      INSERT INTO inventory (variant_id,physical_quantity,gift_reserve_quantity,safety_reserve_quantity,active_reserved_quantity,sold_quantity,reserves_validated,version,updated_at)
      VALUES ('variant_pourpre_s',70,2,1,0,0,1,0,'2026-09-01T08:00:00.000Z');
    `);
    const session = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/session",
      { method: "POST", headers: { Origin: "https://ajluxurystore.com", "Sec-Fetch-Site": "same-origin" } },
    ), env, { now: () => now, accessIdentity: async () => identity });
    const response = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/inventory",
      { headers: { Cookie: cookies(session) } },
    ), env, { now: () => now, accessIdentity: async () => identity });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.items[0].internalReference, "AJL-APO-PUR-S");
    assert.equal(body.data.items[0].availableQuantity, 67);
    assert.deepEqual(body.data.totals, {
      physicalQuantity: 70,
      giftReserveQuantity: 2,
      safetyReserveQuantity: 1,
      activeReservedQuantity: 0,
      soldQuantity: 0,
      availableQuantity: 67,
    });
  } finally {
    sqlite.close();
  }
});

test("the operator console fails closed when disabled or without fresh Access authentication", async () => {
  const { sqlite, env } = context();
  try {
    const closed = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/session",
      { method: "POST" },
    ), { ...env, OPERATOR_CONSOLE_ENABLED: undefined }, {
      now: () => now,
      accessIdentity: async () => identity,
    });
    assert.equal(closed.status, 503);
    assert.equal((await closed.json()).error.code, "OPERATOR_CONSOLE_CLOSED");

    const stale = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/session",
      { method: "POST", headers: { Origin: "https://ajluxurystore.com", "Sec-Fetch-Site": "same-origin" } },
    ), env, {
      now: () => now,
      accessIdentity: async () => ({ ...identity, authenticatedAt: "2026-09-01T08:50:00.000Z" }),
    });
    assert.equal(stale.status, 403);
    assert.equal((await stale.json()).error.code, "FRESH_ACCESS_REQUIRED");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM admin_sessions").get().count, 0);
  } finally {
    sqlite.close();
  }
});

test("owner creates, lists and deactivates a promotion without exposing it publicly", async () => {
  const { sqlite, env } = context();
  try {
    const session = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/session",
      { method: "POST", headers: { Origin: "https://ajluxurystore.com", "Sec-Fetch-Site": "same-origin" } },
    ), env, { now: () => now, accessIdentity: async () => identity });
    const sessionBody = await session.clone().json();
    const headers = {
      Cookie: cookies(session),
      Origin: "https://ajluxurystore.com",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      "X-CSRF-Token": sessionBody.data.csrfToken,
    };
    const created = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/promotions",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          code: "BIENVENUE10",
          kind: "percentage",
          percentageBasisPoints: 1000,
          fixedDiscountCents: null,
          minimumSubtotalCents: 5000,
          maximumDiscountCents: 1000,
          maximumRedemptions: 20,
          startsAt: now,
          endsAt: null,
        }),
      },
    ), env, { now: () => now, accessIdentity: async () => identity });
    assert.equal(created.status, 201);
    const promotion = (await created.json()).data;

    const listed = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/promotions",
      { headers: { Cookie: cookies(session) } },
    ), env, { now: () => now, accessIdentity: async () => identity });
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).data[0].code, "BIENVENUE10");

    const deactivated = await productionOperatorConsoleApiResponse(new Request(
      `https://ajluxurystore.com/api/commerce/admin/promotions/${promotion.id}/status`,
      { method: "PUT", headers, body: JSON.stringify({ active: false }) },
    ), env, {
      now: () => "2026-09-01T09:01:00.000Z",
      accessIdentity: async () => identity,
    });
    assert.equal(deactivated.status, 200);
    assert.equal(sqlite.prepare("SELECT active FROM promotion_codes").get().active, 0);
  } finally {
    sqlite.close();
  }
});
