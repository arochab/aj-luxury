-- Every production order records the exact Worker code and immutable Worker
-- version, commerce mode and settlement mode that accepted it. Existing
-- historical fixtures stay nullable; production writes all four atomically.
ALTER TABLE `orders` ADD COLUMN `commerce_release_sha` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `commerce_worker_version_id` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `commerce_mode` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `settlement_mode` text
  CONSTRAINT `ck_orders_commerce_runtime_provenance` CHECK(
    (`commerce_release_sha` IS NULL
      AND `commerce_worker_version_id` IS NULL
      AND `commerce_mode` IS NULL
      AND `settlement_mode` IS NULL)
    OR (
      length(`commerce_release_sha`) = 40
      AND `commerce_release_sha` = lower(`commerce_release_sha`)
      AND `commerce_release_sha` NOT GLOB '*[^0-9a-f]*'
      AND length(`commerce_worker_version_id`) = 36
      AND `commerce_worker_version_id` = lower(`commerce_worker_version_id`)
      AND `commerce_worker_version_id` NOT GLOB '*[^0-9a-f-]*'
      AND substr(`commerce_worker_version_id`, 9, 1) = '-'
      AND substr(`commerce_worker_version_id`, 14, 1) = '-'
      AND substr(`commerce_worker_version_id`, 15, 1) GLOB '[1-8]'
      AND substr(`commerce_worker_version_id`, 19, 1) = '-'
      AND substr(`commerce_worker_version_id`, 20, 1) GLOB '[89ab]'
      AND substr(`commerce_worker_version_id`, 24, 1) = '-'
      AND (
        (`commerce_mode` = 'sandbox' AND `settlement_mode` = 'test')
        OR (`commerce_mode` IN ('controlled','live') AND `settlement_mode` = 'live')
      )
    )
  );
--> statement-breakpoint
CREATE INDEX `idx_orders_commerce_runtime`
ON `orders` (`commerce_release_sha`, `commerce_worker_version_id`);
--> statement-breakpoint

CREATE TRIGGER `trg_orders_commerce_runtime_immutable`
BEFORE UPDATE OF `commerce_release_sha`, `commerce_worker_version_id`,
  `commerce_mode`, `settlement_mode` ON `orders`
WHEN NEW.`commerce_release_sha` IS NOT OLD.`commerce_release_sha`
  OR NEW.`commerce_worker_version_id` IS NOT OLD.`commerce_worker_version_id`
  OR NEW.`commerce_mode` IS NOT OLD.`commerce_mode`
  OR NEW.`settlement_mode` IS NOT OLD.`settlement_mode`
BEGIN
  SELECT RAISE(ABORT, 'order_commerce_runtime_provenance_is_immutable');
END;
--> statement-breakpoint

-- Stripe's own live/test bit is persisted independently of the order so a
-- test session can never satisfy the controlled first-order proof.
ALTER TABLE `payments` ADD COLUMN `livemode` integer
  CONSTRAINT `ck_payments_livemode` CHECK(
    `livemode` IS NULL OR `livemode` IN (0, 1)
  );
--> statement-breakpoint

CREATE TRIGGER `trg_payments_livemode_immutable`
BEFORE UPDATE OF `livemode` ON `payments`
WHEN NEW.`livemode` IS NOT OLD.`livemode`
BEGIN
  SELECT RAISE(ABORT, 'payment_livemode_is_immutable');
END;
--> statement-breakpoint

-- The release row itself is unique and immutable. Refuse a sandbox/test
-- order before it can consume that one-shot attestation slot.
CREATE TRIGGER `trg_production_release_attestation_runtime_validate`
BEFORE INSERT ON `production_release_attestations`
WHEN NOT EXISTS (
  SELECT 1 FROM `orders` AS customer_order
  INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
  WHERE customer_order.`id` = NEW.`controlled_order_id`
    AND customer_order.`commerce_mode` = 'controlled'
    AND customer_order.`settlement_mode` = 'live'
    AND payment.`provider` = 'stripe'
    AND payment.`status` = 'succeeded'
    AND payment.`amount_cents` = customer_order.`total_cents`
    AND payment.`currency` = customer_order.`currency`
    AND payment.`livemode` = 1
)
BEGIN
  SELECT RAISE(ABORT, 'production_release_attestation_runtime_invalid');
END;
--> statement-breakpoint

INSERT INTO `production_runtime_schema_proofs` (
  `migration_id`, `contract_sha256`, `installed_at`
) VALUES (
  '0023_controlled_order_runtime_provenance',
  '99e97e28ca90431040dbc5dd2072efef3c232d6151d7b573b374f316b454a531',
  '2026-08-27T00:00:00.000Z'
);
