import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("0010 is additive and 0000 through 0009 stay byte-identical to git", () => {
  const expectedSha256 = {
    "0000_flimsy_rhino.sql": "64ec5b38a5c5e33b235f65ba6f5524fa26961a50af33a01c219af4080807435b",
    "0001_lock_cart_line_price_provenance.sql": "a28fe428ba0aeb12bd6eb254082f49fc0735541cbc315a28e5cd137ee57da045",
    "0002_lock_order_line_snapshots.sql": "7a7498959ef379096f5f2aec132a80ab30645186bd2add4b09634cf9599ef566",
    "0003_identity_access.sql": "97497dbef41179a669b2ff58286ae9e0986cd8fcb2c76e97ae696f7fd7b1fc5a",
    "0004_email_outbox_data_rights.sql": "fdf9c27b57d24c931d234bf8651e83599d10c0e8adfc28b188d165f01c9b59ef",
    "0005_fulfillment_returns_refunds.sql": "2eff61c2caa307e094f9cf64885816beff5f476dbbfe52a9988560a57faa1008",
    "0006_allow_bounded_expired_cart_purge.sql": "3cbd7390bb8834305b11f6d791583a86f3c6fe7ba9be23fc91e1e1ea98203a52",
    "0007_transactional_preprod_order_payment.sql": "3b58d9e49e5154c855c2620fea80e733c8953ec713e75a2e8c5b31432840d838",
    "0008_preprod_synthetic_demo_dataset.sql": "794e1c67471427ba3d92e979e79e07a8393244794d7d98b827db6b0fda07b5b5",
    "0009_shipping_quote_parcel_snapshots.sql": "5c880df646f8d9274e768b6895c46715de3cfe74632eeebb643fe27da655e0ed",
  };
  for (let index = 0; index <= 9; index += 1) {
    const prefix = String(index).padStart(4, "0");
    const currentName = [
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
    ][index];
    assert.ok(currentName.startsWith(prefix));
    const bytes = readFileSync(new URL(`drizzle/${currentName}`, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSha256[currentName]);
  }
  const migration = readFileSync(
    new URL("drizzle/0010_multicarrier_delivery_foundation.sql", root),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE `delivery_option_snapshots`/);
  assert.match(migration, /CREATE TABLE `delivery_service_point_snapshots`/);
  assert.match(migration, /CREATE TABLE `shipping_document_metadata`/);
  const executable = migration.replace(/^--.*$/gm, "");
  assert.doesNotMatch(executable, /ALTER TABLE|DROP TABLE|DROP TRIGGER|api[_-]?key|secret|label_url|barcode/i);
  assert.match(migration, /julianday\(`expires_at`\).*<= \(1\.0 \/ 24\.0\)/s);
  assert.match(migration, /OLD\.`provider_quote_reference_hash` IS NOT NEW\.`provider_quote_reference_hash`/);
  assert.match(migration, /OLD\.`provider_receipt_fingerprint` IS NOT NEW\.`provider_receipt_fingerprint`/);
});
