-- Additive activation boundary for provider-backed home and service-point delivery.
-- Raw provider references are never stored here: only AES-256-GCM ciphertext,
-- a random 96-bit IV, authenticated owner context and the expected SHA-256.
ALTER TABLE `delivery_option_snapshots`
ADD COLUMN `selected_service_point_id` text;--> statement-breakpoint
CREATE TABLE `delivery_provider_reference_vault` (
  `id` text PRIMARY KEY NOT NULL,
  `algorithm` text DEFAULT 'A256GCM' NOT NULL,
  `key_version` integer NOT NULL,
  `provider_code` text NOT NULL,
  `reference_kind` text NOT NULL,
  `owner_id` text NOT NULL,
  `reference_sha256` text NOT NULL,
  `iv_base64` text NOT NULL,
  `ciphertext_base64` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `ck_delivery_reference_algorithm` CHECK (`algorithm` = 'A256GCM'),
  CONSTRAINT `ck_delivery_reference_key_version` CHECK (`key_version` > 0),
  CONSTRAINT `ck_delivery_reference_kind` CHECK (`reference_kind` IN ('delivery_quote','service_point')),
  CONSTRAINT `ck_delivery_reference_hash` CHECK (
    length(`reference_sha256`) = 64
    AND `reference_sha256` = lower(`reference_sha256`)
    AND `reference_sha256` NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT `ck_delivery_reference_iv` CHECK (
    length(`iv_base64`) = 16 AND `iv_base64` NOT GLOB '*[^A-Za-z0-9+/]*'
  ),
  CONSTRAINT `ck_delivery_reference_ciphertext` CHECK (
    length(`ciphertext_base64`) BETWEEN 24 AND 704
    AND length(`ciphertext_base64`) % 4 = 0
    AND rtrim(`ciphertext_base64`,'=') NOT GLOB '*[^A-Za-z0-9+/]*'
    AND length(`ciphertext_base64`) - length(rtrim(`ciphertext_base64`,'=')) <= 2
  ),
  CONSTRAINT `ck_delivery_reference_timestamp` CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ',`created_at`) IS `created_at`
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_delivery_reference_owner`
ON `delivery_provider_reference_vault` (`reference_kind`,`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_delivery_reference_key_version`
ON `delivery_provider_reference_vault` (`key_version`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `trg_delivery_reference_validate_insert`
BEFORE INSERT ON `delivery_provider_reference_vault`
WHEN (
  NEW.`reference_kind` = 'delivery_quote' AND NOT EXISTS (
    SELECT 1 FROM `delivery_option_snapshots` AS option
    WHERE option.`id` = NEW.`owner_id`
      AND option.`provider_code` = NEW.`provider_code`
      AND option.`proof_kind` = 'provider_api_response'
      AND option.`provider_quote_reference_hash` = NEW.`reference_sha256`
      AND option.`selected_at` IS NULL
  )
) OR (
  NEW.`reference_kind` = 'service_point' AND NOT EXISTS (
    SELECT 1
    FROM `delivery_service_point_snapshots` AS point
    INNER JOIN `delivery_option_snapshots` AS option
      ON option.`id` = point.`delivery_option_id`
    WHERE point.`id` = NEW.`owner_id`
      AND point.`provider_point_reference_hash` = NEW.`reference_sha256`
      AND option.`provider_code` = NEW.`provider_code`
      AND option.`proof_kind` = 'provider_api_response'
      AND option.`selected_at` IS NULL
  )
)
BEGIN SELECT RAISE(ABORT,'delivery_provider_reference_owner_mismatch'); END;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_reference_replay_guard`
BEFORE INSERT ON `delivery_provider_reference_vault`
WHEN EXISTS (
  SELECT 1 FROM `delivery_provider_reference_vault` AS stored
  WHERE stored.`reference_kind` = NEW.`reference_kind`
    AND stored.`owner_id` = NEW.`owner_id`
    AND (
      stored.`id` <> NEW.`id`
      OR stored.`algorithm` <> NEW.`algorithm`
      OR stored.`key_version` <> NEW.`key_version`
      OR stored.`provider_code` <> NEW.`provider_code`
      OR stored.`reference_sha256` <> NEW.`reference_sha256`
    )
)
BEGIN SELECT RAISE(ABORT,'delivery_provider_reference_replay_conflict'); END;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_reference_immutable`
BEFORE UPDATE ON `delivery_provider_reference_vault`
BEGIN SELECT RAISE(ABORT,'delivery_provider_reference_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_reference_retain`
BEFORE DELETE ON `delivery_provider_reference_vault`
BEGIN SELECT RAISE(ABORT,'delivery_provider_reference_retain'); END;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_option_initially_unselected`
BEFORE INSERT ON `delivery_option_snapshots`
WHEN NEW.`selected_at` IS NOT NULL OR NEW.`selected_service_point_id` IS NOT NULL
BEGIN SELECT RAISE(ABORT,'delivery_option_must_start_unselected'); END;--> statement-breakpoint
DROP TRIGGER `trg_delivery_option_select_once`;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_option_select_once`
BEFORE UPDATE ON `delivery_option_snapshots`
WHEN OLD.`id` <> NEW.`id`
  OR OLD.`cart_id` <> NEW.`cart_id`
  OR OLD.`cart_revision` <> NEW.`cart_revision`
  OR OLD.`shipping_quote_id` <> NEW.`shipping_quote_id`
  OR OLD.`shipping_address_fingerprint` <> NEW.`shipping_address_fingerprint`
  OR OLD.`provider_code` <> NEW.`provider_code`
  OR OLD.`carrier_code` <> NEW.`carrier_code`
  OR OLD.`service_code` <> NEW.`service_code`
  OR OLD.`display_name` <> NEW.`display_name`
  OR OLD.`delivery_mode` <> NEW.`delivery_mode`
  OR OLD.`amount_cents` <> NEW.`amount_cents`
  OR OLD.`currency` <> NEW.`currency`
  OR OLD.`estimated_days_min` <> NEW.`estimated_days_min`
  OR OLD.`estimated_days_max` <> NEW.`estimated_days_max`
  OR OLD.`duties_terms` <> NEW.`duties_terms`
  OR OLD.`proof_kind` <> NEW.`proof_kind`
  OR OLD.`provider_quote_reference_hash` IS NOT NEW.`provider_quote_reference_hash`
  OR OLD.`provider_receipt_fingerprint` IS NOT NEW.`provider_receipt_fingerprint`
  OR OLD.`quoted_at` <> NEW.`quoted_at`
  OR OLD.`expires_at` <> NEW.`expires_at`
  OR OLD.`created_at` <> NEW.`created_at`
  OR OLD.`selected_at` IS NOT NULL
  OR OLD.`selected_service_point_id` IS NOT NULL
  OR NEW.`selected_at` IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM `carts` AS cart
    WHERE cart.`id` = NEW.`cart_id` AND cart.`status` = 'open'
      AND cart.`fulfillment_revision` = NEW.`cart_revision`
      AND cart.`expires_at` > NEW.`selected_at`
  )
  OR (NEW.`delivery_mode` = 'home' AND NEW.`selected_service_point_id` IS NOT NULL)
  OR (NEW.`delivery_mode` = 'service_point' AND (
    NEW.`selected_service_point_id` IS NULL OR NOT EXISTS (
      SELECT 1
      FROM `delivery_service_point_snapshots` AS point
      INNER JOIN `delivery_provider_reference_vault` AS sealed_point
        ON sealed_point.`reference_kind` = 'service_point'
        AND sealed_point.`owner_id` = point.`id`
        AND sealed_point.`provider_code` = NEW.`provider_code`
        AND sealed_point.`reference_sha256` = point.`provider_point_reference_hash`
      WHERE point.`id` = NEW.`selected_service_point_id`
        AND point.`delivery_option_id` = NEW.`id`
        AND point.`expires_at` = NEW.`expires_at`
        AND point.`expires_at` > NEW.`selected_at`
    )
  ))
  OR (NEW.`proof_kind` = 'provider_api_response' AND NOT EXISTS (
    SELECT 1 FROM `delivery_provider_reference_vault` AS sealed_quote
    WHERE sealed_quote.`reference_kind` = 'delivery_quote'
      AND sealed_quote.`owner_id` = NEW.`id`
      AND sealed_quote.`provider_code` = NEW.`provider_code`
      AND sealed_quote.`reference_sha256` = NEW.`provider_quote_reference_hash`
  ))
BEGIN SELECT RAISE(ABORT,'delivery_option_selection_invalid'); END;--> statement-breakpoint
DROP TRIGGER `trg_delivery_option_retain`;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_option_retain`
BEFORE DELETE ON `delivery_option_snapshots`
WHEN OLD.`selected_at` IS NOT NULL
  OR EXISTS (SELECT 1 FROM `orders` WHERE `shipping_quote_id` = OLD.`shipping_quote_id`)
  OR EXISTS (
    SELECT 1 FROM `delivery_provider_reference_vault`
    WHERE `reference_kind` = 'delivery_quote' AND `owner_id` = OLD.`id`
  )
BEGIN SELECT RAISE(ABORT,'delivery_option_snapshot_retain'); END;--> statement-breakpoint
DROP TRIGGER `trg_delivery_service_point_retain`;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_service_point_retain`
BEFORE DELETE ON `delivery_service_point_snapshots`
WHEN EXISTS (
  SELECT 1 FROM `delivery_option_snapshots`
  WHERE `id` = OLD.`delivery_option_id` AND `selected_at` IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM `delivery_provider_reference_vault`
  WHERE `reference_kind` = 'service_point' AND `owner_id` = OLD.`id`
)
BEGIN SELECT RAISE(ABORT,'delivery_service_point_retain'); END;--> statement-breakpoint
DROP TRIGGER `trg_delivery_order_requires_selected_option`;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_order_requires_selected_option`
BEFORE INSERT ON `orders`
WHEN NEW.`shipping_quote_id` IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM `delivery_option_snapshots` AS option
  INNER JOIN `shipping_quotes` AS quote
    ON quote.`id` = option.`shipping_quote_id`
    AND quote.`cart_id` = option.`cart_id`
    AND quote.`cart_revision` = option.`cart_revision`
    AND quote.`shipping_address_fingerprint` = option.`shipping_address_fingerprint`
    AND quote.`selected_at` = option.`selected_at`
  WHERE option.`shipping_quote_id` = NEW.`shipping_quote_id`
    AND option.`cart_id` = NEW.`cart_id`
    AND option.`shipping_address_fingerprint` = NEW.`shipping_address_fingerprint`
    AND option.`selected_at` = NEW.`created_at`
    AND option.`expires_at` > NEW.`created_at`
    AND (
      (option.`delivery_mode` = 'home' AND option.`selected_service_point_id` IS NULL)
      OR (option.`delivery_mode` = 'service_point'
        AND option.`selected_service_point_id` IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM `delivery_service_point_snapshots` AS point
          WHERE point.`id` = option.`selected_service_point_id`
            AND point.`delivery_option_id` = option.`id`
            AND point.`expires_at` > NEW.`created_at`
        ))
    )
)
BEGIN SELECT RAISE(ABORT,'delivery_order_option_required'); END;--> statement-breakpoint
PRAGMA optimize;
