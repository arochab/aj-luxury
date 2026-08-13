-- PREPRODUCTION-ONLY SYNTHETIC DATASET.
-- Migration identity: 0008_preprod_synthetic_demo_dataset.
-- Never apply this migration to a production D1 database. The build boundary
-- refuses APP_ENV=production while this file is present.
CREATE TABLE `_preprod_demo_expected_variants` (
  `id` text PRIMARY KEY NOT NULL,
  `internal_reference` text NOT NULL,
  `color_key` text NOT NULL,
  `color_name` text NOT NULL,
  `size` text NOT NULL,
  `swatch` text NOT NULL,
  `image_url` text NOT NULL,
  `sort_order` integer NOT NULL,
  `physical_quantity` integer NOT NULL
);--> statement-breakpoint
INSERT INTO `_preprod_demo_expected_variants` VALUES
  ('variant_boxer_pourpre_s','AJ-APO-POU-S','pourpre','Pourpre Impérial','S','#7d0f52','/images/client/raw/product-card-pourpre.webp',0,26),
  ('variant_boxer_pourpre_m','AJ-APO-POU-M','pourpre','Pourpre Impérial','M','#7d0f52','/images/client/raw/product-card-pourpre.webp',1,103),
  ('variant_boxer_pourpre_l','AJ-APO-POU-L','pourpre','Pourpre Impérial','L','#7d0f52','/images/client/raw/product-card-pourpre.webp',2,87),
  ('variant_boxer_pourpre_xl','AJ-APO-POU-XL','pourpre','Pourpre Impérial','XL','#7d0f52','/images/client/raw/product-card-pourpre.webp',3,36),
  ('variant_boxer_rose-pale_s','AJ-APO-ROS-S','rose','Rose Velours','S','#dda9bd','/images/client/raw/product-rose-profile.webp',4,26),
  ('variant_boxer_rose-pale_m','AJ-APO-ROS-M','rose','Rose Velours','M','#dda9bd','/images/client/raw/product-rose-profile.webp',5,103),
  ('variant_boxer_rose-pale_l','AJ-APO-ROS-L','rose','Rose Velours','L','#dda9bd','/images/client/raw/product-rose-profile.webp',6,87),
  ('variant_boxer_rose-pale_xl','AJ-APO-ROS-XL','rose','Rose Velours','XL','#dda9bd','/images/client/raw/product-rose-profile.webp',7,36),
  ('variant_boxer_lilas-bleu-clair_s','AJ-APO-LIL-S','lilas','Lilas Céleste','S','#a9abd9','/images/client/raw/product-lilas-model.webp',8,26),
  ('variant_boxer_lilas-bleu-clair_m','AJ-APO-LIL-M','lilas','Lilas Céleste','M','#a9abd9','/images/client/raw/product-lilas-model.webp',9,102),
  ('variant_boxer_lilas-bleu-clair_l','AJ-APO-LIL-L','lilas','Lilas Céleste','L','#a9abd9','/images/client/raw/product-lilas-model.webp',10,88),
  ('variant_boxer_lilas-bleu-clair_xl','AJ-APO-LIL-XL','lilas','Lilas Céleste','XL','#a9abd9','/images/client/raw/product-lilas-model.webp',11,36);--> statement-breakpoint
CREATE TABLE `_preprod_demo_0008_guard` (
  `ok` integer NOT NULL CONSTRAINT `ck_preprod_demo_0008_guard` CHECK (`ok` = 1)
);--> statement-breakpoint
INSERT INTO `_preprod_demo_0008_guard` (`ok`)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM `customers`) = 0
  AND (SELECT COUNT(*) FROM `carts`) = 0
  AND (SELECT COUNT(*) FROM `cart_lines`) = 0
  AND (SELECT COUNT(*) FROM `orders`) = 0
  AND (SELECT COUNT(*) FROM `order_lines`) = 0
  AND (SELECT COUNT(*) FROM `stock_reservations`) = 0
  AND (SELECT COUNT(*) FROM `payments`) = 0
  AND (SELECT COUNT(*) FROM `webhook_events`) = 0
  AND (SELECT COUNT(*) FROM `access_challenges`) = 0
  AND (SELECT COUNT(*) FROM `customer_sessions`) = 0
  AND (SELECT COUNT(*) FROM `guest_order_sessions`) = 0
  AND (SELECT COUNT(*) FROM `administrators`) = 0
  AND (SELECT COUNT(*) FROM `admin_sessions`) = 0
  AND (SELECT COUNT(*) FROM `email_outbox`) = 0
  AND (SELECT COUNT(*) FROM `data_rights_requests`) = 0
  AND (SELECT COUNT(*) FROM `customs_records`) = 0
  AND (SELECT COUNT(*) FROM `refunds`) = 0
  AND (SELECT COUNT(*) FROM `return_lines`) = 0
  AND (SELECT COUNT(*) FROM `return_requests`) = 0
  AND (SELECT COUNT(*) FROM `carrier_event_receipts`) = 0
  AND (SELECT COUNT(*) FROM `shipment_tracking_events`) = 0
  AND (SELECT COUNT(*) FROM `shipments`) = 0
  AND (SELECT COUNT(*) FROM `shipping_quotes`) = 0
  AND (SELECT COUNT(*) FROM `shipping_zone_configurations`) = 0
  AND (SELECT COUNT(*) FROM `audit_log`) = 0
  AND (
    (
      (SELECT COUNT(*) FROM `products`) = 0
      AND (SELECT COUNT(*) FROM `variants`) = 0
      AND (SELECT COUNT(*) FROM `inventory`) = 0
      AND (SELECT COUNT(*) FROM `inventory_movements`) = 0
    ) OR (
      (SELECT COUNT(*) FROM `products`) = 1
      AND EXISTS (
        SELECT 1 FROM `products`
        WHERE `id`='product_apollon' AND `slug`='apollon' AND `name`='Apollon'
          AND `status`='active' AND `price_cents`=2999 AND `currency`='EUR'
      )
      AND (SELECT COUNT(*) FROM `variants`) = 12
      AND NOT EXISTS (
        SELECT 1 FROM `variants` AS v
        LEFT JOIN `_preprod_demo_expected_variants` AS e ON e.`id`=v.`id`
        WHERE e.`id` IS NULL OR v.`product_id`<>'product_apollon'
          OR v.`internal_reference`<>e.`internal_reference`
          OR v.`color_key`<>e.`color_key` OR v.`color_name`<>e.`color_name`
          OR v.`size`<>e.`size` OR v.`swatch`<>e.`swatch`
          OR v.`image_url`<>e.`image_url` OR v.`active`<>1
          OR v.`sort_order`<>e.`sort_order`
      )
      AND (SELECT COUNT(*) FROM `inventory`) = 12
      AND NOT EXISTS (
        SELECT 1 FROM `inventory` AS i
        LEFT JOIN `_preprod_demo_expected_variants` AS e ON e.`id`=i.`variant_id`
        WHERE e.`id` IS NULL OR i.`physical_quantity`<>e.`physical_quantity`
          OR i.`gift_reserve_quantity`<>0 OR i.`safety_reserve_quantity`<>0
          OR i.`active_reserved_quantity`<>0 OR i.`sold_quantity`<>0
          OR i.`reserves_validated`<>0 OR i.`version`<>0
      )
      AND (SELECT COUNT(*) FROM `inventory_movements`) = 12
      AND NOT EXISTS (
        SELECT 1 FROM `inventory_movements` AS m
        LEFT JOIN `_preprod_demo_expected_variants` AS e ON e.`id`=m.`variant_id`
        WHERE e.`id` IS NULL OR m.`id`<>'movement_seed_'||e.`id`
          OR m.`kind`<>'seed' OR m.`quantity`<>e.`physical_quantity`
          OR m.`reference_type`<>'catalog_seed'
          OR m.`reference_id`<>'aj_launch_2026'
          OR m.`actor_type`<>'system' OR m.`actor_id` IS NOT NULL
          OR m.`idempotency_key`<>'seed:'||e.`id`
      )
    )
  )
THEN 1 ELSE 0 END;--> statement-breakpoint
CREATE TABLE `preprod_demo_dataset` (
  `singleton` integer PRIMARY KEY NOT NULL CONSTRAINT `ck_preprod_demo_singleton` CHECK (`singleton` = 1),
  `dataset_kind` text NOT NULL CONSTRAINT `ck_preprod_demo_kind` CHECK (`dataset_kind` = 'synthetic-demo'),
  `fixture_version` text NOT NULL CONSTRAINT `ck_preprod_demo_fixture` CHECK (`fixture_version` = 'aj-demo-v1'),
  `expires_at` text NOT NULL CONSTRAINT `ck_preprod_demo_expiry` CHECK (`expires_at` = '2026-09-30T23:59:59.999Z'),
  `installed_at` text NOT NULL,
  CONSTRAINT `ck_preprod_demo_timestamps` CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ',`installed_at`) IS `installed_at`
    AND strftime('%Y-%m-%dT%H:%M:%fZ',`expires_at`) IS `expires_at`
    AND `expires_at` > `installed_at`
  )
);--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_dataset_immutable_update`
BEFORE UPDATE ON `preprod_demo_dataset`
BEGIN
  SELECT RAISE(ABORT,'preprod_demo_dataset_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_dataset_immutable_delete`
BEFORE DELETE ON `preprod_demo_dataset`
BEGIN
  SELECT RAISE(ABORT,'preprod_demo_dataset_is_immutable');
END;--> statement-breakpoint
INSERT INTO `preprod_demo_dataset` (`singleton`,`dataset_kind`,`fixture_version`,`expires_at`,`installed_at`)
VALUES (1,'synthetic-demo','aj-demo-v1','2026-09-30T23:59:59.999Z',strftime('%Y-%m-%dT%H:%M:%fZ','now'));--> statement-breakpoint
INSERT INTO `products` (`id`,`slug`,`name`,`status`,`price_cents`,`currency`,`created_at`,`updated_at`)
SELECT 'product_apollon','apollon','Apollon','active',2999,'EUR',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM `products`);--> statement-breakpoint
INSERT INTO `variants` (`id`,`product_id`,`internal_reference`,`color_key`,`color_name`,`size`,`swatch`,`image_url`,`active`,`sort_order`,`created_at`,`updated_at`)
SELECT `id`,'product_apollon',`internal_reference`,`color_key`,`color_name`,`size`,`swatch`,`image_url`,1,`sort_order`,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM `_preprod_demo_expected_variants`
WHERE NOT EXISTS (SELECT 1 FROM `variants`);--> statement-breakpoint
INSERT INTO `inventory` (`variant_id`,`physical_quantity`,`gift_reserve_quantity`,`safety_reserve_quantity`,`active_reserved_quantity`,`sold_quantity`,`reserves_validated`,`version`,`updated_at`)
SELECT `id`,`physical_quantity`,0,0,0,0,1,0,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM `_preprod_demo_expected_variants`
WHERE NOT EXISTS (SELECT 1 FROM `inventory`);--> statement-breakpoint
UPDATE `inventory`
SET `reserves_validated`=1,
  `updated_at`=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `reserves_validated`=0;--> statement-breakpoint
INSERT INTO `shipping_zone_configurations` (
  `id`,`zone`,`version`,`status`,`currency`,`created_at`,`updated_at`
) VALUES
  ('config_synthetic_demo_eu_v1','EU',1,'draft','EUR','2026-08-13T12:00:00.000Z','2026-08-13T12:00:00.000Z'),
  ('config_synthetic_demo_uk_v1','UK',1,'draft','EUR','2026-08-13T12:00:00.000Z','2026-08-13T12:00:00.000Z'),
  ('config_synthetic_demo_us_v1','US',1,'draft','EUR','2026-08-13T12:00:00.000Z','2026-08-13T12:00:00.000Z'),
  ('config_synthetic_demo_ca_v1','CA',1,'draft','EUR','2026-08-13T12:00:00.000Z','2026-08-13T12:00:00.000Z');--> statement-breakpoint
UPDATE `shipping_zone_configurations`
SET `status`='active', `service_code`='SYNTHETIC_DEMO_NOT_COMMERCIAL',
  `price_cents`=CASE `zone` WHEN 'EU' THEN 700 WHEN 'UK' THEN 900 WHEN 'US' THEN 1500 ELSE 1400 END,
  `estimated_days_min`=CASE `zone` WHEN 'EU' THEN 2 WHEN 'UK' THEN 3 ELSE 5 END,
  `estimated_days_max`=CASE `zone` WHEN 'EU' THEN 4 WHEN 'UK' THEN 6 ELSE 9 END,
  `duties_terms`=CASE `zone` WHEN 'EU' THEN 'EU_INCLUDED' ELSE 'DAP' END,
  `parcel_code`='SYNTHETIC_DEMO', `parcel_weight_grams`=1,
  `parcel_length_mm`=1, `parcel_width_mm`=1, `parcel_height_mm`=1,
  `origin_country_code`='ZZ', `customs_hs_code`='DEMO',
  `activated_at`='2026-08-13T12:00:01.000Z',
  `updated_at`='2026-08-13T12:00:01.000Z';--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_cart_active_insert`
BEFORE INSERT ON `carts`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_cart_active_update`
BEFORE UPDATE ON `carts`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_cart_active_delete`
BEFORE DELETE ON `carts`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_cart_line_active_insert`
BEFORE INSERT ON `cart_lines`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_cart_line_active_update`
BEFORE UPDATE ON `cart_lines`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_cart_line_active_delete`
BEFORE DELETE ON `cart_lines`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_shipping_quote_active_insert`
BEFORE INSERT ON `shipping_quotes`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
) OR NEW.`shipping_address_json` NOT IN (
  '{"countryCode":"FR","postalCode":"00000","regionCode":null}',
  '{"countryCode":"GB","postalCode":"AA0","regionCode":null}',
  '{"countryCode":"US","postalCode":"00000","regionCode":"NY"}',
  '{"countryCode":"CA","postalCode":"A0A","regionCode":null}'
) OR NEW.`configuration_id` NOT IN (
  'config_synthetic_demo_eu_v1','config_synthetic_demo_uk_v1',
  'config_synthetic_demo_us_v1','config_synthetic_demo_ca_v1'
) OR NEW.`provider_quote_reference` IS NOT NULL
  OR NEW.`provider_receipt_fingerprint` IS NOT NULL
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_shipping_quote_active_update`
BEFORE UPDATE ON `shipping_quotes`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_order_active_insert`
BEFORE INSERT ON `orders`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
) OR NEW.`email`<>'client@demo.invalid'
  OR NEW.`shipping_address_json`<>NEW.`billing_address_json`
  OR NEW.`shipping_address_json` NOT IN (
    '{"recipient":"AJ LUXURY DEMO - NE PAS EXPEDIER","company":null,"line1":"1 RUE DEMONSTRATION - NE PAS EXPEDIER","line2":null,"postalCode":"75001","city":"PARIS DEMO","regionCode":null,"countryCode":"FR"}',
    '{"recipient":"AJ LUXURY DEMO - DO NOT SHIP","company":null,"line1":"1 DEMO STREET - DO NOT SHIP","line2":null,"postalCode":"SW1A 1AA","city":"LONDON DEMO","regionCode":null,"countryCode":"GB"}',
    '{"recipient":"AJ LUXURY DEMO - DO NOT SHIP","company":null,"line1":"1 DEMO AVENUE - DO NOT SHIP","line2":null,"postalCode":"10001","city":"NEW YORK DEMO","regionCode":"NY","countryCode":"US"}',
    '{"recipient":"AJ LUXURY DEMO - NE PAS EXPEDIER","company":null,"line1":"1 RUE DEMONSTRATION - NE PAS EXPEDIER","line2":null,"postalCode":"H2X 1Y4","city":"MONTREAL DEMO","regionCode":"QC","countryCode":"CA"}'
  )
BEGIN SELECT RAISE(ABORT,'preprod_demo_order_rejected'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_order_active_update`
BEFORE UPDATE ON `orders`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_reservation_active_insert`
BEFORE INSERT ON `stock_reservations`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_reservation_active_update`
BEFORE UPDATE ON `stock_reservations`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_payment_active_insert`
BEFORE INSERT ON `payments`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
CREATE TRIGGER `trg_preprod_demo_webhook_active_insert`
BEFORE INSERT ON `webhook_events`
WHEN NOT EXISTS (
  SELECT 1 FROM `preprod_demo_dataset`
  WHERE `singleton`=1 AND `dataset_kind`='synthetic-demo'
    AND `fixture_version`='aj-demo-v1'
    AND `expires_at`>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
BEGIN SELECT RAISE(ABORT,'preprod_demo_dataset_inactive'); END;--> statement-breakpoint
DROP TABLE `_preprod_demo_0008_guard`;--> statement-breakpoint
DROP TABLE `_preprod_demo_expected_variants`;--> statement-breakpoint
PRAGMA optimize;
