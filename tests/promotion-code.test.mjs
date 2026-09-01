import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  calculatePromotionQuote,
  normalizePromotionCode,
} from "../lib/commerce/promotion-code.ts";

const now = "2026-09-01T15:00:00.000Z";

test("promotion calculation normalizes codes and applies percentage, cap and minimum", () => {
  assert.equal(normalizePromotionCode("  bienvenue_10 "), "BIENVENUE_10");
  const quote = calculatePromotionQuote({
    id: "promotion_1",
    code: "BIENVENUE_10",
    kind: "percentage",
    percentageBasisPoints: 1500,
    fixedDiscountCents: null,
    minimumSubtotalCents: 4000,
    maximumDiscountCents: 800,
    maximumRedemptions: 10,
    active: true,
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: "2026-10-01T00:00:00.000Z",
  }, 6000, 2, now);
  assert.deepEqual(quote, {
    code: "BIENVENUE_10",
    discountCents: 800,
    subtotalAfterDiscountCents: 5200,
  });
  assert.throws(() => normalizePromotionCode("NO spaces"), /INVALID_PROMOTION_CODE/);
});

test("0028 reserves promotion use atomically, releases cancellation and redeems payment", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys=ON");
    sqlite.exec(`CREATE TABLE orders (
      id text PRIMARY KEY NOT NULL,
      status text NOT NULL,
      subtotal_cents integer NOT NULL,
      discount_cents integer NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`);
    const migration = readFileSync(
      new URL("../drizzle/0028_even_fallen_one.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement.trim());
    }
    sqlite.prepare(`INSERT INTO promotion_codes (
      id,code,kind,percentage_basis_points,fixed_discount_cents,
      minimum_subtotal_cents,maximum_discount_cents,maximum_redemptions,
      active,starts_at,ends_at,created_by_administrator_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "promotion_1", "LIMIT10", "percentage", 1000, null,
      0, null, 1, 1, "2026-09-01T00:00:00.000Z", null,
      "admin_1", now, now,
    );
    const insertOrder = sqlite.prepare(`INSERT INTO orders (
      id,status,subtotal_cents,discount_cents,created_at,updated_at,
      promotion_code_id,promotion_code,promotion_discount_cents
    ) VALUES (?, 'pending_payment', 5400, 600, ?, ?, 'promotion_1', 'LIMIT10', 600)`);
    insertOrder.run("order_1", now, now);
    const reserved = sqlite.prepare(
      "SELECT status,discount_cents FROM promotion_redemptions WHERE order_id='order_1'",
    ).get();
    assert.equal(reserved.status, "reserved");
    assert.equal(reserved.discount_cents, 600);
    assert.throws(() => insertOrder.run("order_2", now, now), /promotion_order_mismatch/);

    const cancelledAt = "2026-09-01T15:01:00.000Z";
    sqlite.prepare("UPDATE orders SET status='cancelled',updated_at=? WHERE id='order_1'")
      .run(cancelledAt);
    assert.equal(
      sqlite.prepare("SELECT status FROM promotion_redemptions WHERE order_id='order_1'").get().status,
      "released",
    );
    insertOrder.run("order_2", cancelledAt, cancelledAt);
    const paidAt = "2026-09-01T15:02:00.000Z";
    sqlite.prepare("UPDATE orders SET status='paid',updated_at=? WHERE id='order_2'").run(paidAt);
    assert.equal(
      sqlite.prepare("SELECT status FROM promotion_redemptions WHERE order_id='order_2'").get().status,
      "redeemed",
    );
  } finally {
    sqlite.close();
  }
});
