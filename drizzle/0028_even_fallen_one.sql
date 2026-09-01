CREATE TABLE `promotion_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`percentage_basis_points` integer,
	`fixed_discount_cents` integer,
	`minimum_subtotal_cents` integer DEFAULT 0 NOT NULL,
	`maximum_discount_cents` integer,
	`maximum_redemptions` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`created_by_administrator_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `ck_promotion_codes_code` CHECK(length(`code`) BETWEEN 3 AND 32
      AND `code` = upper(`code`) AND `code` NOT GLOB '*[^A-Z0-9_-]*'),
	CONSTRAINT `ck_promotion_codes_kind` CHECK(`kind` IN ('percentage','fixed')),
	CONSTRAINT `ck_promotion_codes_value` CHECK((
      `kind` = 'percentage' AND `percentage_basis_points` BETWEEN 1 AND 10000
      AND `fixed_discount_cents` IS NULL
    ) OR (
      `kind` = 'fixed' AND `percentage_basis_points` IS NULL
      AND `fixed_discount_cents` > 0
    )),
	CONSTRAINT `ck_promotion_codes_limits` CHECK(`minimum_subtotal_cents` >= 0
      AND (`maximum_discount_cents` IS NULL OR `maximum_discount_cents` > 0)
      AND (`maximum_redemptions` IS NULL OR `maximum_redemptions` > 0)),
	CONSTRAINT `ck_promotion_codes_active` CHECK(`active` IN (0,1))
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_promotion_codes_code` ON `promotion_codes` (`code`);--> statement-breakpoint
CREATE INDEX `idx_promotion_codes_active_window` ON `promotion_codes` (`active`,`starts_at`,`ends_at`);--> statement-breakpoint

ALTER TABLE `orders` ADD COLUMN `promotion_code_id` text REFERENCES `promotion_codes`(`id`) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `promotion_code` text;--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `promotion_discount_cents` integer NOT NULL DEFAULT 0 CHECK (`promotion_discount_cents` >= 0);--> statement-breakpoint

CREATE TABLE `promotion_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`promotion_code_id` text NOT NULL REFERENCES `promotion_codes`(`id`) ON DELETE RESTRICT,
	`order_id` text NOT NULL REFERENCES `orders`(`id`) ON DELETE RESTRICT,
	`code` text NOT NULL,
	`discount_cents` integer NOT NULL CHECK (`discount_cents` > 0),
	`status` text DEFAULT 'reserved' NOT NULL CHECK (`status` IN ('reserved','redeemed','released')),
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_promotion_redemptions_order` ON `promotion_redemptions` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_promotion_redemptions_code_status` ON `promotion_redemptions` (`promotion_code_id`,`status`);--> statement-breakpoint

CREATE TRIGGER `trg_promotion_codes_timestamp_insert`
BEFORE INSERT ON `promotion_codes`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`starts_at`) IS NOT NEW.`starts_at`
  OR (NEW.`ends_at` IS NOT NULL AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`ends_at`) IS NOT NEW.`ends_at`
    OR NEW.`ends_at` <= NEW.`starts_at`
  ))
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR NEW.`updated_at` IS NOT NEW.`created_at`
BEGIN SELECT RAISE(ABORT, 'promotion_timestamp_invalid'); END;--> statement-breakpoint

CREATE TRIGGER `trg_promotion_codes_lock_rule`
BEFORE UPDATE ON `promotion_codes`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`code` IS NOT NEW.`code`
  OR OLD.`kind` IS NOT NEW.`kind`
  OR OLD.`percentage_basis_points` IS NOT NEW.`percentage_basis_points`
  OR OLD.`fixed_discount_cents` IS NOT NEW.`fixed_discount_cents`
  OR OLD.`minimum_subtotal_cents` IS NOT NEW.`minimum_subtotal_cents`
  OR OLD.`maximum_discount_cents` IS NOT NEW.`maximum_discount_cents`
  OR OLD.`maximum_redemptions` IS NOT NEW.`maximum_redemptions`
  OR OLD.`starts_at` IS NOT NEW.`starts_at` OR OLD.`ends_at` IS NOT NEW.`ends_at`
  OR OLD.`created_by_administrator_id` IS NOT NEW.`created_by_administrator_id`
  OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN SELECT RAISE(ABORT, 'promotion_rule_immutable'); END;--> statement-breakpoint

CREATE TRIGGER `trg_promotion_codes_status_update`
BEFORE UPDATE OF `active`,`updated_at` ON `promotion_codes`
WHEN OLD.`active` IS NOT NEW.`active` AND (
  NEW.`updated_at` <= OLD.`updated_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
)
BEGIN SELECT RAISE(ABORT, 'promotion_status_timestamp_invalid'); END;--> statement-breakpoint

CREATE TRIGGER `trg_orders_promotion_validate_insert`
BEFORE INSERT ON `orders`
WHEN NOT (
  (NEW.`promotion_code_id` IS NULL AND NEW.`promotion_code` IS NULL
    AND NEW.`promotion_discount_cents` = 0)
  OR (
    NEW.`promotion_code_id` IS NOT NULL AND NEW.`promotion_code` IS NOT NULL
    AND NEW.`promotion_discount_cents` > 0
    AND NEW.`discount_cents` >= NEW.`promotion_discount_cents`
    AND EXISTS (
      SELECT 1 FROM `promotion_codes` AS promotion
      WHERE promotion.`id` = NEW.`promotion_code_id`
        AND promotion.`code` = NEW.`promotion_code`
        AND promotion.`active` = 1
        AND promotion.`starts_at` <= NEW.`created_at`
        AND (promotion.`ends_at` IS NULL OR promotion.`ends_at` > NEW.`created_at`)
        AND promotion.`minimum_subtotal_cents`
          <= NEW.`subtotal_cents` + NEW.`promotion_discount_cents`
        AND (promotion.`maximum_redemptions` IS NULL OR promotion.`maximum_redemptions` > (
          SELECT COUNT(*) FROM `promotion_redemptions` AS redemption
          WHERE redemption.`promotion_code_id` = promotion.`id`
            AND redemption.`status` IN ('reserved','redeemed')
        ))
        AND NEW.`promotion_discount_cents` = min(
          NEW.`subtotal_cents` + NEW.`promotion_discount_cents`,
          CASE promotion.`kind`
            WHEN 'percentage' THEN min(
              CAST(((NEW.`subtotal_cents` + NEW.`promotion_discount_cents`)
                * promotion.`percentage_basis_points`) / 10000 AS integer),
              COALESCE(promotion.`maximum_discount_cents`,
                NEW.`subtotal_cents` + NEW.`promotion_discount_cents`)
            )
            ELSE min(
              promotion.`fixed_discount_cents`,
              COALESCE(promotion.`maximum_discount_cents`, promotion.`fixed_discount_cents`)
            )
          END
        )
    )
  )
)
BEGIN SELECT RAISE(ABORT, 'promotion_order_mismatch'); END;--> statement-breakpoint

CREATE TRIGGER `trg_orders_promotion_snapshot_immutable`
BEFORE UPDATE ON `orders`
WHEN OLD.`promotion_code_id` IS NOT NEW.`promotion_code_id`
  OR OLD.`promotion_code` IS NOT NEW.`promotion_code`
  OR OLD.`promotion_discount_cents` IS NOT NEW.`promotion_discount_cents`
BEGIN SELECT RAISE(ABORT, 'commerce_order_snapshot_is_immutable'); END;--> statement-breakpoint

CREATE TRIGGER `trg_orders_promotion_reserve`
AFTER INSERT ON `orders`
WHEN NEW.`promotion_code_id` IS NOT NULL
BEGIN
  INSERT INTO `promotion_redemptions` (
    `id`,`promotion_code_id`,`order_id`,`code`,`discount_cents`,`status`,`created_at`,`updated_at`
  ) VALUES (
    'promotion_redemption:' || NEW.`id`, NEW.`promotion_code_id`, NEW.`id`,
    NEW.`promotion_code`, NEW.`promotion_discount_cents`, 'reserved',
    NEW.`created_at`, NEW.`created_at`
  );
END;--> statement-breakpoint

CREATE TRIGGER `trg_promotion_redemptions_transition`
BEFORE UPDATE ON `promotion_redemptions`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`promotion_code_id` IS NOT NEW.`promotion_code_id`
  OR OLD.`order_id` IS NOT NEW.`order_id` OR OLD.`code` IS NOT NEW.`code`
  OR OLD.`discount_cents` IS NOT NEW.`discount_cents`
  OR OLD.`created_at` IS NOT NEW.`created_at`
  OR NOT (OLD.`status` = 'reserved' AND NEW.`status` IN ('redeemed','released'))
  OR NEW.`updated_at` <= OLD.`updated_at`
BEGIN SELECT RAISE(ABORT, 'promotion_redemption_transition_invalid'); END;--> statement-breakpoint

CREATE TRIGGER `trg_orders_promotion_redeem`
AFTER UPDATE OF `status` ON `orders`
WHEN OLD.`status` = 'pending_payment' AND NEW.`status` = 'paid'
BEGIN
  UPDATE `promotion_redemptions` SET `status`='redeemed', `updated_at`=NEW.`updated_at`
  WHERE `order_id`=NEW.`id` AND `status`='reserved';
END;--> statement-breakpoint

CREATE TRIGGER `trg_orders_promotion_release`
AFTER UPDATE OF `status` ON `orders`
WHEN OLD.`status` = 'pending_payment' AND NEW.`status` = 'cancelled'
BEGIN
  UPDATE `promotion_redemptions` SET `status`='released', `updated_at`=NEW.`updated_at`
  WHERE `order_id`=NEW.`id` AND `status`='reserved';
END;--> statement-breakpoint

PRAGMA foreign_key_check;--> statement-breakpoint
PRAGMA optimize;
