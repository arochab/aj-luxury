-- Provider-agnostic delivery-option snapshots for checkout and fulfillment.
-- No API secret, customer address, raw label, label URL or barcode is stored.
CREATE TABLE `delivery_option_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `cart_id` text NOT NULL,
  `cart_revision` integer NOT NULL,
  `shipping_quote_id` text NOT NULL,
  `shipping_address_fingerprint` text NOT NULL,
  `provider_code` text NOT NULL,
  `carrier_code` text NOT NULL,
  `service_code` text NOT NULL,
  `display_name` text NOT NULL,
  `delivery_mode` text NOT NULL,
  `amount_cents` integer NOT NULL,
  `currency` text DEFAULT 'EUR' NOT NULL,
  `estimated_days_min` integer NOT NULL,
  `estimated_days_max` integer NOT NULL,
  `duties_terms` text NOT NULL,
  `proof_kind` text NOT NULL,
  `provider_quote_reference_hash` text,
  `provider_receipt_fingerprint` text,
  `quoted_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `selected_at` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON DELETE restrict,
  FOREIGN KEY (`shipping_quote_id`) REFERENCES `shipping_quotes`(`id`) ON DELETE restrict,
  CONSTRAINT `ck_delivery_options_cart_revision` CHECK (`cart_revision` >= 0),
  CONSTRAINT `ck_delivery_options_mode` CHECK (`delivery_mode` IN ('home','service_point')),
  CONSTRAINT `ck_delivery_options_amount` CHECK (`amount_cents` >= 0 AND `currency` = 'EUR'),
  CONSTRAINT `ck_delivery_options_eta` CHECK (`estimated_days_min` > 0 AND `estimated_days_max` >= `estimated_days_min`),
  CONSTRAINT `ck_delivery_options_duties` CHECK (`duties_terms` IN ('EU_INCLUDED','DAP','DDP')),
  CONSTRAINT `ck_delivery_options_proof` CHECK (`proof_kind` IN ('synthetic_demo','provider_api_response')),
  CONSTRAINT `ck_delivery_options_fingerprints` CHECK (
    length(`shipping_address_fingerprint`) = 64
    AND `shipping_address_fingerprint` = lower(`shipping_address_fingerprint`)
    AND `shipping_address_fingerprint` NOT GLOB '*[^0-9a-f]*'
    AND (`provider_quote_reference_hash` IS NULL OR (
      length(`provider_quote_reference_hash`) = 64
      AND `provider_quote_reference_hash` = lower(`provider_quote_reference_hash`)
      AND `provider_quote_reference_hash` NOT GLOB '*[^0-9a-f]*'
    ))
    AND (`provider_receipt_fingerprint` IS NULL OR (
      length(`provider_receipt_fingerprint`) = 64
      AND `provider_receipt_fingerprint` = lower(`provider_receipt_fingerprint`)
      AND `provider_receipt_fingerprint` NOT GLOB '*[^0-9a-f]*'
    ))
  ),
  CONSTRAINT `ck_delivery_options_timestamps` CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ',`quoted_at`) IS `quoted_at`
    AND strftime('%Y-%m-%dT%H:%M:%fZ',`expires_at`) IS `expires_at`
    AND strftime('%Y-%m-%dT%H:%M:%fZ',`created_at`) IS `created_at`
    AND (`selected_at` IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ',`selected_at`) IS `selected_at`)
    AND `expires_at` > `quoted_at`
    AND julianday(`expires_at`) - julianday(`quoted_at`) <= (1.0 / 24.0)
    AND (`selected_at` IS NULL OR (`selected_at` >= `quoted_at` AND `selected_at` < `expires_at`))
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_delivery_options_quote` ON `delivery_option_snapshots` (`shipping_quote_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_delivery_options_selected_cart` ON `delivery_option_snapshots` (`cart_id`) WHERE `selected_at` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_delivery_options_cart_expiry` ON `delivery_option_snapshots` (`cart_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `delivery_service_point_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `delivery_option_id` text NOT NULL,
  `provider_point_reference_hash` text NOT NULL,
  `display_name` text NOT NULL,
  `postal_code` text NOT NULL,
  `city` text NOT NULL,
  `country_code` text NOT NULL,
  `opening_hours_summary` text,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`delivery_option_id`) REFERENCES `delivery_option_snapshots`(`id`) ON DELETE restrict,
  CONSTRAINT `ck_delivery_service_point_hash` CHECK (
    length(`provider_point_reference_hash`) = 64
    AND `provider_point_reference_hash` = lower(`provider_point_reference_hash`)
    AND `provider_point_reference_hash` NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT `ck_delivery_service_point_country` CHECK (
    length(`country_code`) = 2 AND `country_code` = upper(`country_code`)
  ),
  CONSTRAINT `ck_delivery_service_point_timestamps` CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ',`expires_at`) IS `expires_at`
    AND strftime('%Y-%m-%dT%H:%M:%fZ',`created_at`) IS `created_at`
    AND `expires_at` > `created_at`
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_delivery_service_point_provider_ref` ON `delivery_service_point_snapshots` (`delivery_option_id`,`provider_point_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_delivery_service_points_option_expiry` ON `delivery_service_point_snapshots` (`delivery_option_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `shipping_document_metadata` (
  `id` text PRIMARY KEY NOT NULL,
  `shipment_id` text NOT NULL,
  `document_kind` text NOT NULL,
  `media_type` text NOT NULL,
  `provider_document_reference_hash` text NOT NULL,
  `content_sha256` text NOT NULL,
  `byte_length` integer NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE restrict,
  CONSTRAINT `ck_shipping_document_kind` CHECK (`document_kind` IN ('label','customs','return_label')),
  CONSTRAINT `ck_shipping_document_media` CHECK (`media_type` IN ('application/pdf','image/png','application/zpl')),
  CONSTRAINT `ck_shipping_document_hashes` CHECK (
    length(`provider_document_reference_hash`) = 64
    AND `provider_document_reference_hash` = lower(`provider_document_reference_hash`)
    AND `provider_document_reference_hash` NOT GLOB '*[^0-9a-f]*'
    AND length(`content_sha256`) = 64
    AND `content_sha256` = lower(`content_sha256`)
    AND `content_sha256` NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT `ck_shipping_document_length` CHECK (`byte_length` > 0),
  CONSTRAINT `ck_shipping_document_timestamp` CHECK (strftime('%Y-%m-%dT%H:%M:%fZ',`created_at`) IS `created_at`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipping_document_reference` ON `shipping_document_metadata` (`shipment_id`,`document_kind`,`provider_document_reference_hash`);--> statement-breakpoint
CREATE TRIGGER `trg_delivery_option_validate_insert`
BEFORE INSERT ON `delivery_option_snapshots`
WHEN NOT EXISTS (
  SELECT 1 FROM `shipping_quotes` AS quote
  WHERE quote.`id` = NEW.`shipping_quote_id`
    AND quote.`cart_id` = NEW.`cart_id`
    AND quote.`cart_revision` = NEW.`cart_revision`
    AND quote.`shipping_address_fingerprint` = NEW.`shipping_address_fingerprint`
    AND quote.`amount_cents` = NEW.`amount_cents`
    AND quote.`currency` = NEW.`currency`
    AND quote.`estimated_days_min` = NEW.`estimated_days_min`
    AND quote.`estimated_days_max` = NEW.`estimated_days_max`
    AND quote.`duties_terms` = NEW.`duties_terms`
    AND quote.`expires_at` = NEW.`expires_at`
) OR (NEW.`proof_kind` = 'synthetic_demo' AND (
  NEW.`provider_code` <> 'synthetic_demo'
  OR NEW.`provider_quote_reference_hash` IS NOT NULL
  OR NEW.`provider_receipt_fingerprint` IS NOT NULL
)) OR (NEW.`proof_kind` = 'provider_api_response' AND (
  NEW.`provider_code` = 'synthetic_demo'
  OR NEW.`provider_quote_reference_hash` IS NULL
  OR NEW.`provider_receipt_fingerprint` IS NULL
))
BEGIN SELECT RAISE(ABORT,'delivery_option_snapshot_mismatch'); END;--> statement-breakpoint
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
  OR NEW.`selected_at` IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM `carts` AS cart
    WHERE cart.`id` = NEW.`cart_id` AND cart.`status` = 'open'
      AND cart.`fulfillment_revision` = NEW.`cart_revision`
  )
BEGIN SELECT RAISE(ABORT,'delivery_option_selection_invalid'); END;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_option_retain`
BEFORE DELETE ON `delivery_option_snapshots`
WHEN OLD.`selected_at` IS NOT NULL OR EXISTS (
  SELECT 1 FROM `orders` WHERE `shipping_quote_id` = OLD.`shipping_quote_id`
)
BEGIN SELECT RAISE(ABORT,'delivery_option_snapshot_retain'); END;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_order_requires_selected_option`
BEFORE INSERT ON `orders`
WHEN NEW.`shipping_quote_id` IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM `delivery_option_snapshots` AS option
  WHERE option.`shipping_quote_id` = NEW.`shipping_quote_id`
    AND option.`cart_id` = NEW.`cart_id`
    AND option.`shipping_address_fingerprint` = NEW.`shipping_address_fingerprint`
    AND option.`delivery_mode` = 'home'
    AND option.`selected_at` IS NOT NULL
    AND option.`expires_at` > NEW.`created_at`
)
BEGIN SELECT RAISE(ABORT,'delivery_order_option_required'); END;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_service_point_validate_insert`
BEFORE INSERT ON `delivery_service_point_snapshots`
WHEN NOT EXISTS (
  SELECT 1 FROM `delivery_option_snapshots` AS option
  WHERE option.`id` = NEW.`delivery_option_id`
    AND option.`delivery_mode` = 'service_point'
    AND option.`expires_at` = NEW.`expires_at`
    AND option.`selected_at` IS NULL
)
BEGIN SELECT RAISE(ABORT,'delivery_service_point_mismatch'); END;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_service_point_immutable`
BEFORE UPDATE ON `delivery_service_point_snapshots`
BEGIN SELECT RAISE(ABORT,'delivery_service_point_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `trg_delivery_service_point_retain`
BEFORE DELETE ON `delivery_service_point_snapshots`
WHEN EXISTS (
  SELECT 1 FROM `delivery_option_snapshots`
  WHERE `id` = OLD.`delivery_option_id` AND `selected_at` IS NOT NULL
)
BEGIN SELECT RAISE(ABORT,'delivery_service_point_retain'); END;--> statement-breakpoint
CREATE TRIGGER `trg_shipping_document_immutable`
BEFORE UPDATE ON `shipping_document_metadata`
BEGIN SELECT RAISE(ABORT,'shipping_document_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `trg_shipping_document_retain`
BEFORE DELETE ON `shipping_document_metadata`
BEGIN SELECT RAISE(ABORT,'shipping_document_retain'); END;--> statement-breakpoint
PRAGMA optimize;
