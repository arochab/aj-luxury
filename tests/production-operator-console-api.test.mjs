import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { productionOperatorConsoleApiResponse } from "../worker/production-operator-console-api.ts";

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

function cookies(response) {
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

test("fresh Cloudflare Access MFA creates an AAL2 owner session and lists no-PII order summaries", async () => {
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
  } finally {
    sqlite.close();
  }
});

test("the operator console fails closed without explicit MFA policy attestation or fresh authentication", async () => {
  const { sqlite, env } = context();
  try {
    const closed = await productionOperatorConsoleApiResponse(new Request(
      "https://ajluxurystore.com/api/commerce/admin/session",
      { method: "POST" },
    ), { ...env, CLOUDFLARE_ACCESS_MFA_ATTESTATION: undefined }, {
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
    assert.equal((await stale.json()).error.code, "FRESH_MFA_REQUIRED");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM admin_sessions").get().count, 0);
  } finally {
    sqlite.close();
  }
});
