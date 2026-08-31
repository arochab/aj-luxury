-- Additive international foundation. No international zone is activated by
-- this migration; production remains EU-only until the runtime kill switch and
-- a reviewed active configuration are both present.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
PRAGMA legacy_alter_table=ON;--> statement-breakpoint
CREATE TABLE `__new_shipping_zone_configurations` (
  `id` text PRIMARY KEY NOT NULL,
  `zone` text NOT NULL,
  `version` integer NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `service_code` text,
  `price_cents` integer,
  `currency` text DEFAULT 'EUR' NOT NULL,
  `estimated_days_min` integer,
  `estimated_days_max` integer,
  `duties_terms` text,
  `parcel_code` text,
  `parcel_weight_grams` integer,
  `parcel_length_mm` integer,
  `parcel_width_mm` integer,
  `parcel_height_mm` integer,
  `origin_country_code` text,
  `customs_hs_code` text,
  `activated_at` text,
  `retired_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `ck_shipping_zone_configurations_zone`
    CHECK (`zone` IN ('EU','UK','US','CA','GCC')),
  CONSTRAINT `ck_shipping_zone_configurations_status`
    CHECK (`status` IN ('draft','active','retired')),
  CONSTRAINT `ck_shipping_zone_configurations_version` CHECK (`version` > 0),
  CONSTRAINT `ck_shipping_zone_configurations_currency` CHECK (`currency` = 'EUR'),
  CONSTRAINT `ck_shipping_zone_configurations_price` CHECK (`price_cents` IS NULL OR `price_cents` >= 0),
  CONSTRAINT `ck_shipping_zone_configurations_delays` CHECK (
    (`estimated_days_min` IS NULL AND `estimated_days_max` IS NULL)
    OR (`estimated_days_min` > 0 AND `estimated_days_max` >= `estimated_days_min`)
  ),
  CONSTRAINT `ck_shipping_zone_configurations_duties`
    CHECK (`duties_terms` IS NULL OR `duties_terms` IN ('EU_INCLUDED','DAP','DDP')),
  CONSTRAINT `ck_shipping_zone_configurations_parcel` CHECK (
    (`parcel_weight_grams` IS NULL AND `parcel_length_mm` IS NULL
      AND `parcel_width_mm` IS NULL AND `parcel_height_mm` IS NULL)
    OR (`parcel_weight_grams` > 0 AND `parcel_length_mm` > 0
      AND `parcel_width_mm` > 0 AND `parcel_height_mm` > 0)
  )
);--> statement-breakpoint
INSERT INTO `__new_shipping_zone_configurations` SELECT * FROM `shipping_zone_configurations`;--> statement-breakpoint
DROP TABLE `shipping_zone_configurations`;--> statement-breakpoint
ALTER TABLE `__new_shipping_zone_configurations` RENAME TO `shipping_zone_configurations`;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipping_zone_configurations_version`
  ON `shipping_zone_configurations` (`zone`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipping_zone_configurations_active`
  ON `shipping_zone_configurations` (`zone`) WHERE `status`='active';--> statement-breakpoint

CREATE TRIGGER `trg_shipping_zone_configuration_validate_insert`
BEFORE INSERT ON `shipping_zone_configurations`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at` <> NEW.`created_at`
  OR NEW.`activated_at` IS NOT NULL OR NEW.`retired_at` IS NOT NULL
  OR NEW.`status` <> 'draft'
BEGIN SELECT RAISE(ABORT,'fulfillment_configuration_insert_invalid'); END;--> statement-breakpoint

CREATE TRIGGER `trg_shipping_zone_configuration_validate_activation`
BEFORE UPDATE OF `status` ON `shipping_zone_configurations`
WHEN OLD.`status`='draft' AND NEW.`status`='active' AND (
  NEW.`service_code` IS NULL OR length(NEW.`service_code`) NOT BETWEEN 1 AND 80
  OR NEW.`price_cents` IS NULL OR NEW.`price_cents` < 0
  OR NEW.`estimated_days_min` IS NULL OR NEW.`estimated_days_min` <= 0
  OR NEW.`estimated_days_max` IS NULL OR NEW.`estimated_days_max` < NEW.`estimated_days_min`
  OR (NEW.`zone`='EU' AND NEW.`duties_terms`<>'EU_INCLUDED')
  OR (NEW.`zone`<>'EU' AND NEW.`duties_terms`<>'DAP')
  OR NEW.`duties_terms`='DDP'
  OR NEW.`parcel_code` IS NULL OR length(NEW.`parcel_code`) NOT BETWEEN 1 AND 80
  OR NEW.`parcel_weight_grams` IS NULL OR NEW.`parcel_weight_grams` <= 0
  OR NEW.`parcel_length_mm` IS NULL OR NEW.`parcel_length_mm` <= 0
  OR NEW.`parcel_width_mm` IS NULL OR NEW.`parcel_width_mm` <= 0
  OR NEW.`parcel_height_mm` IS NULL OR NEW.`parcel_height_mm` <= 0
  OR NEW.`origin_country_code` IS NULL OR length(NEW.`origin_country_code`)<>2
  OR NEW.`customs_hs_code` IS NULL OR length(NEW.`customs_hs_code`) NOT BETWEEN 4 AND 16
  OR (NEW.`zone`<>'EU' AND (NEW.`origin_country_code`<>'CN' OR NEW.`customs_hs_code`<>'61071200'))
  OR NEW.`activated_at` IS NULL
  OR strftime('%Y-%m-%dT%H:%M:%fZ',NEW.`activated_at`) IS NOT NEW.`activated_at`
  OR NEW.`retired_at` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT,'fulfillment_configuration_ddp_unavailable') WHERE NEW.`duties_terms`='DDP';
  SELECT RAISE(ABORT,'fulfillment_configuration_incomplete') WHERE NEW.`duties_terms`<>'DDP';
END;--> statement-breakpoint

CREATE TRIGGER `trg_shipping_zone_configuration_transition`
BEFORE UPDATE ON `shipping_zone_configurations`
WHEN NOT (
  OLD.`status`='draft' AND NEW.`status` IN ('draft','active')
  AND NEW.`retired_at` IS NULL
  AND (NEW.`status`='draft' OR NEW.`activated_at` IS NOT NULL)
) AND NOT (
  OLD.`status`='active' AND NEW.`status`='retired'
  AND OLD.`id` IS NEW.`id` AND OLD.`zone` IS NEW.`zone`
  AND OLD.`version` IS NEW.`version`
  AND OLD.`service_code` IS NEW.`service_code`
  AND OLD.`price_cents` IS NEW.`price_cents`
  AND OLD.`currency` IS NEW.`currency`
  AND OLD.`estimated_days_min` IS NEW.`estimated_days_min`
  AND OLD.`estimated_days_max` IS NEW.`estimated_days_max`
  AND OLD.`duties_terms` IS NEW.`duties_terms`
  AND OLD.`parcel_code` IS NEW.`parcel_code`
  AND OLD.`parcel_weight_grams` IS NEW.`parcel_weight_grams`
  AND OLD.`parcel_length_mm` IS NEW.`parcel_length_mm`
  AND OLD.`parcel_width_mm` IS NEW.`parcel_width_mm`
  AND OLD.`parcel_height_mm` IS NEW.`parcel_height_mm`
  AND OLD.`origin_country_code` IS NEW.`origin_country_code`
  AND OLD.`customs_hs_code` IS NEW.`customs_hs_code`
  AND OLD.`activated_at` IS NEW.`activated_at`
  AND NEW.`retired_at` IS NOT NULL
  AND strftime('%Y-%m-%dT%H:%M:%fZ',NEW.`retired_at`) IS NEW.`retired_at`
) AND NOT (OLD.`status`='draft' AND NEW.`status`='active')
BEGIN SELECT RAISE(ABORT,'fulfillment_configuration_is_immutable'); END;--> statement-breakpoint

CREATE TRIGGER `trg_shipping_zone_configuration_validate_update_timestamp`
BEFORE UPDATE ON `shipping_zone_configurations`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ',NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at`<=OLD.`updated_at` OR OLD.`created_at` IS NOT NEW.`created_at`
  OR OLD.`id` IS NOT NEW.`id` OR OLD.`zone` IS NOT NEW.`zone` OR OLD.`version` IS NOT NEW.`version`
BEGIN SELECT RAISE(ABORT,'fulfillment_configuration_is_immutable'); END;--> statement-breakpoint

CREATE TRIGGER `trg_shipping_zone_configuration_state_shape`
BEFORE UPDATE ON `shipping_zone_configurations`
WHEN (NEW.`status`='draft' AND (NEW.`activated_at` IS NOT NULL OR NEW.`retired_at` IS NOT NULL))
  OR (NEW.`status`='active' AND (NEW.`activated_at` IS NULL OR NEW.`retired_at` IS NOT NULL))
  OR (NEW.`status`='retired' AND (NEW.`activated_at` IS NULL OR NEW.`retired_at` IS NULL))
BEGIN SELECT RAISE(ABORT,'fulfillment_configuration_state_invalid'); END;--> statement-breakpoint
CREATE TRIGGER `trg_shipping_zone_configuration_retain`
BEFORE DELETE ON `shipping_zone_configurations`
BEGIN SELECT RAISE(ABORT,'fulfillment_configuration_is_immutable'); END;--> statement-breakpoint

DROP TRIGGER `trg_shipping_quote_validate_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_shipping_quote_validate_insert`
BEFORE INSERT ON `shipping_quotes`
WHEN NEW.`selected_at` IS NOT NULL OR NEW.`cart_revision`<0
 OR strftime('%Y-%m-%dT%H:%M:%fZ',NEW.`created_at`) IS NOT NEW.`created_at`
 OR strftime('%Y-%m-%dT%H:%M:%fZ',NEW.`expires_at`) IS NOT NEW.`expires_at`
 OR NEW.`expires_at`<=NEW.`created_at`
 OR NOT EXISTS (
  SELECT 1 FROM `shipping_zone_configurations` configuration
  INNER JOIN `carts` cart ON cart.`id`=NEW.`cart_id`
  WHERE configuration.`id`=NEW.`configuration_id` AND configuration.`status`='active'
    AND configuration.`duties_terms`<>'DDP' AND cart.`status`='open'
    AND json_valid(NEW.`shipping_address_json`)=1
    AND json_type(NEW.`shipping_address_json`,'$')='object'
    AND NEW.`cart_revision`=cart.`fulfillment_revision`
    AND cart.`expires_at`>NEW.`created_at` AND NEW.`expires_at`<=cart.`expires_at`
    AND NEW.`currency`=configuration.`currency` AND NEW.`duties_terms`=configuration.`duties_terms`
    AND ((NEW.`provider_receipt_fingerprint` IS NULL
      AND NEW.`amount_cents`=configuration.`price_cents`
      AND NEW.`estimated_days_min`=configuration.`estimated_days_min`
      AND NEW.`estimated_days_max`=configuration.`estimated_days_max`)
      OR (NEW.`provider_receipt_fingerprint` IS NOT NULL AND NEW.`provider_quote_reference` IS NULL))
    AND configuration.`zone`=CASE
      WHEN json_extract(NEW.`shipping_address_json`,'$.countryCode') IN
        ('AT','BE','BG','HR','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK') THEN 'EU'
      WHEN json_extract(NEW.`shipping_address_json`,'$.countryCode')='GB' THEN 'UK'
      WHEN json_extract(NEW.`shipping_address_json`,'$.countryCode')='US' THEN 'US'
      WHEN json_extract(NEW.`shipping_address_json`,'$.countryCode')='CA' THEN 'CA'
      WHEN json_extract(NEW.`shipping_address_json`,'$.countryCode') IN ('AE','QA','SA') THEN 'GCC'
      ELSE NULL END
    AND json_type(NEW.`shipping_address_json`,'$.postalCode')='text'
    AND (length(json_extract(NEW.`shipping_address_json`,'$.postalCode')) BETWEEN 1 AND 16
      OR (json_extract(NEW.`shipping_address_json`,'$.countryCode') IN ('AE','QA')
        AND json_extract(NEW.`shipping_address_json`,'$.postalCode')=''))
    AND NOT (json_extract(NEW.`shipping_address_json`,'$.countryCode')='FR'
      AND substr(replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ',''),1,3)
        IN ('971','972','973','974','975','976','977','978','984','985','986','987','988'))
    AND NOT (json_extract(NEW.`shipping_address_json`,'$.countryCode')='GB'
      AND substr(replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ',''),1,2)
        IN ('JE','GY','IM','GX'))
    AND NOT (json_extract(NEW.`shipping_address_json`,'$.countryCode')='US' AND (
      json_extract(NEW.`shipping_address_json`,'$.regionCode') IS NULL
      OR json_extract(NEW.`shipping_address_json`,'$.regionCode') NOT IN (
        'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
        'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
        'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
        'WV','WI','WY')
      OR substr(replace(replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ',''),'-',''),1,3)
        BETWEEN '006' AND '009'
      OR substr(replace(replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ',''),'-',''),1,3)
        BETWEEN '090' AND '098'
      OR substr(replace(replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ',''),'-',''),1,3)
        IN ('340','962','963','964','965','966','969')
      OR substr(replace(replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ',''),'-',''),1,5)
        IN ('96799','96898')))
    AND NOT (json_extract(NEW.`shipping_address_json`,'$.countryCode')='GR'
      AND replace(replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ',''),'-','') IN ('63086','GR63086'))
    AND NOT (json_extract(NEW.`shipping_address_json`,'$.countryCode')='ES'
      AND substr(replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ',''),1,2) IN ('35','38','51','52'))
    AND NOT (json_extract(NEW.`shipping_address_json`,'$.countryCode')='PT'
      AND substr(replace(replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ',''),'-',''),1,1)='9')
    AND NOT (json_extract(NEW.`shipping_address_json`,'$.countryCode')='FI'
      AND substr(replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ',''),1,2)='22')
    AND NOT (json_extract(NEW.`shipping_address_json`,'$.countryCode')='DE'
      AND replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ','') IN ('27498','78266'))
    AND NOT (json_extract(NEW.`shipping_address_json`,'$.countryCode')='IT'
      AND replace(upper(json_extract(NEW.`shipping_address_json`,'$.postalCode')),' ','') IN ('22061','23041'))
    AND (configuration.`zone`='EU' OR (
      json_type(NEW.`shipping_address_json`,'$.phone')='text'
      AND substr(json_extract(NEW.`shipping_address_json`,'$.phone'),1,1)='+'
      AND substr(json_extract(NEW.`shipping_address_json`,'$.phone'),2,1) GLOB '[1-9]'
      AND substr(json_extract(NEW.`shipping_address_json`,'$.phone'),2) NOT GLOB '*[^0-9]*'
      AND length(json_extract(NEW.`shipping_address_json`,'$.phone')) BETWEEN 9 AND 16
      AND configuration.`duties_terms`='DAP'
      AND configuration.`origin_country_code`='CN'
      AND configuration.`customs_hs_code`='61071200'))
 )
BEGIN SELECT RAISE(ABORT,'fulfillment_destination_unavailable'); END;--> statement-breakpoint

DROP TRIGGER `trg_orders_require_shipping_snapshot_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_orders_require_shipping_snapshot_insert`
BEFORE INSERT ON `orders`
WHEN NEW.`shipping_quote_id` IS NULL OR NEW.`shipping_address_fingerprint` IS NULL
 OR json_valid(NEW.`shipping_address_json`)<>1
 OR json_type(NEW.`shipping_address_json`,'$')<>'object'
 OR json_extract(NEW.`shipping_address_json`,'$.countryCode') IS NOT NEW.`shipping_country_code`
 OR NOT EXISTS (
  SELECT 1 FROM `shipping_quotes` quote
  INNER JOIN `carts` cart ON cart.`id`=quote.`cart_id`
  INNER JOIN `shipping_zone_configurations` configuration ON configuration.`id`=quote.`configuration_id`
  WHERE quote.`id`=NEW.`shipping_quote_id` AND quote.`cart_id`=NEW.`cart_id`
    AND quote.`cart_revision`=cart.`fulfillment_revision`
    AND quote.`cart_fingerprint`=lower(quote.`cart_fingerprint`)
    AND quote.`selected_at` IS NOT NULL
    AND quote.`selected_at`<=NEW.`created_at` AND quote.`expires_at`>NEW.`created_at`
    AND cart.`status`='open' AND cart.`expires_at`>NEW.`created_at`
    AND quote.`shipping_address_fingerprint`=NEW.`shipping_address_fingerprint`
    AND quote.`amount_cents`=NEW.`shipping_cents` AND quote.`currency`=NEW.`currency`
    AND configuration.`status`='active' AND configuration.`currency`=NEW.`currency`
    AND configuration.`duties_terms`<>'DDP'
    AND ((quote.`provider_receipt_fingerprint` IS NULL
        AND configuration.`price_cents`=NEW.`shipping_cents`)
      OR (quote.`provider_receipt_fingerprint` IS NOT NULL
        AND quote.`provider_quote_reference` IS NULL
        AND EXISTS (SELECT 1 FROM `delivery_option_snapshots` option
        INNER JOIN `delivery_provider_reference_vault` sealed
          ON sealed.`reference_kind`='delivery_quote' AND sealed.`owner_id`=option.`id`
          AND sealed.`provider_code`=option.`provider_code`
          AND sealed.`reference_sha256`=option.`provider_quote_reference_hash`
        WHERE option.`shipping_quote_id`=quote.`id`
          AND option.`cart_id`=quote.`cart_id`
          AND option.`cart_revision`=quote.`cart_revision`
          AND option.`shipping_address_fingerprint`=quote.`shipping_address_fingerprint`
          AND option.`proof_kind`='provider_api_response'
          AND option.`selected_at`=quote.`selected_at`
          AND option.`provider_receipt_fingerprint`=quote.`provider_receipt_fingerprint`
          AND option.`amount_cents`=quote.`amount_cents`
          AND option.`currency`=quote.`currency`)))
    AND configuration.`zone`=CASE
      WHEN NEW.`shipping_country_code` IN ('AT','BE','BG','HR','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK') THEN 'EU'
      WHEN NEW.`shipping_country_code`='GB' THEN 'UK'
      WHEN NEW.`shipping_country_code`='US' THEN 'US'
      WHEN NEW.`shipping_country_code`='CA' THEN 'CA'
      WHEN NEW.`shipping_country_code` IN ('AE','QA','SA') THEN 'GCC'
      ELSE NULL END
    AND json_type(NEW.`shipping_address_json`,'$.recipient')='text'
    AND length(trim(json_extract(NEW.`shipping_address_json`,'$.recipient'))) BETWEEN 1 AND 120
    AND json_type(NEW.`shipping_address_json`,'$.line1')='text'
    AND length(trim(json_extract(NEW.`shipping_address_json`,'$.line1'))) BETWEEN 1 AND 160
    AND json_type(NEW.`shipping_address_json`,'$.postalCode')='text'
    AND (length(json_extract(NEW.`shipping_address_json`,'$.postalCode')) BETWEEN 1 AND 16
      OR (NEW.`shipping_country_code` IN ('AE','QA')
        AND json_extract(NEW.`shipping_address_json`,'$.postalCode')=''))
    AND json_type(NEW.`shipping_address_json`,'$.city')='text'
    AND length(trim(json_extract(NEW.`shipping_address_json`,'$.city'))) BETWEEN 1 AND 120
    AND json_type(NEW.`shipping_address_json`,'$.countryCode')='text'
    AND (configuration.`zone`='EU' OR (
      json_type(NEW.`shipping_address_json`,'$.phone')='text'
      AND substr(json_extract(NEW.`shipping_address_json`,'$.phone'),1,1)='+'
      AND substr(json_extract(NEW.`shipping_address_json`,'$.phone'),2,1) GLOB '[1-9]'
      AND substr(json_extract(NEW.`shipping_address_json`,'$.phone'),2) NOT GLOB '*[^0-9]*'
      AND length(json_extract(NEW.`shipping_address_json`,'$.phone')) BETWEEN 9 AND 16
      AND configuration.`duties_terms`='DAP'
      AND configuration.`origin_country_code`='CN'
      AND configuration.`customs_hs_code`='61071200'))
 )
BEGIN SELECT RAISE(ABORT,'fulfillment_quote_mismatch'); END;--> statement-breakpoint

DROP TRIGGER `trg_orders_guard_payment_state`;--> statement-breakpoint
CREATE TRIGGER `trg_orders_guard_payment_state`
BEFORE UPDATE OF `status` ON `orders`
WHEN OLD.`status`<>NEW.`status` AND NOT (
  (OLD.`status`='pending_payment' AND NEW.`status`='paid')
  OR (OLD.`status`='pending_payment' AND NEW.`status`='cancelled'
    AND NOT EXISTS (SELECT 1 FROM `payments` WHERE `order_id`=OLD.`id` AND `status` IN ('succeeded','refunded'))
    AND NOT EXISTS (SELECT 1 FROM `stock_reservations` WHERE `cart_id`=OLD.`cart_id` AND `status` IN ('active','converted')))
  OR (OLD.`status`='paid' AND NEW.`status`='preparing'
    AND EXISTS (SELECT 1 FROM `shipments` WHERE `order_id`=OLD.`id` AND `status`='label_ready'))
  OR (OLD.`status`='preparing' AND NEW.`status`='shipped'
    AND EXISTS (SELECT 1 FROM `shipments` WHERE `order_id`=OLD.`id` AND `status` IN ('handed_over','in_transit','delivered')))
)
BEGIN SELECT RAISE(ABORT,'commerce_invalid_order_transition'); END;--> statement-breakpoint

PRAGMA legacy_alter_table=OFF;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_key_check;--> statement-breakpoint
PRAGMA optimize;
