DROP TRIGGER IF EXISTS `trg_orders_require_shipping_snapshot_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_orders_require_shipping_snapshot_insert`
BEFORE INSERT ON `orders`
WHEN NEW.`shipping_quote_id` IS NULL
  OR NEW.`shipping_address_fingerprint` IS NULL
  OR json_valid(NEW.`shipping_address_json`) <> 1
  OR json_type(NEW.`shipping_address_json`, '$') <> 'object'
  OR json_extract(NEW.`shipping_address_json`, '$.countryCode') IS NOT NEW.`shipping_country_code`
  OR NOT EXISTS (
    SELECT 1
    FROM `shipping_quotes` AS quote
    INNER JOIN `carts` AS cart ON cart.`id` = quote.`cart_id`
    INNER JOIN `shipping_zone_configurations` AS configuration
      ON configuration.`id` = quote.`configuration_id`
    WHERE quote.`id` = NEW.`shipping_quote_id`
      AND quote.`cart_id` = NEW.`cart_id`
      AND quote.`cart_revision` = cart.`fulfillment_revision`
      AND quote.`cart_fingerprint` = lower(quote.`cart_fingerprint`)
      AND quote.`selected_at` IS NOT NULL
      AND quote.`selected_at` <= NEW.`created_at`
      AND quote.`expires_at` > NEW.`created_at`
      AND cart.`status` = 'open'
      AND cart.`expires_at` > NEW.`created_at`
      AND quote.`shipping_address_fingerprint` = NEW.`shipping_address_fingerprint`
      AND quote.`amount_cents` = NEW.`shipping_cents`
      AND quote.`currency` = NEW.`currency`
      AND configuration.`status` = 'active'
      AND configuration.`currency` = NEW.`currency`
      AND configuration.`price_cents` = NEW.`shipping_cents`
      AND configuration.`duties_terms` <> 'DDP'
      AND configuration.`zone` = CASE
        WHEN NEW.`shipping_country_code` IN (
          'AT','BE','BG','HR','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HU',
          'IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'
        ) THEN 'EU'
        WHEN NEW.`shipping_country_code` = 'GB' THEN 'UK'
        WHEN NEW.`shipping_country_code` = 'US' THEN 'US'
        WHEN NEW.`shipping_country_code` = 'CA' THEN 'CA'
        ELSE NULL
      END
      AND json_type(NEW.`shipping_address_json`, '$.recipient') = 'text'
      AND length(trim(json_extract(NEW.`shipping_address_json`, '$.recipient'))) BETWEEN 1 AND 120
      AND json_type(NEW.`shipping_address_json`, '$.line1') = 'text'
      AND length(trim(json_extract(NEW.`shipping_address_json`, '$.line1'))) BETWEEN 1 AND 160
      AND json_type(NEW.`shipping_address_json`, '$.postalCode') = 'text'
      AND length(trim(json_extract(NEW.`shipping_address_json`, '$.postalCode'))) BETWEEN 1 AND 16
      AND json_type(NEW.`shipping_address_json`, '$.city') = 'text'
      AND length(trim(json_extract(NEW.`shipping_address_json`, '$.city'))) BETWEEN 1 AND 120
      AND json_type(NEW.`shipping_address_json`, '$.countryCode') = 'text'
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_quote_mismatch');
END;--> statement-breakpoint

DROP TRIGGER IF EXISTS `trg_orders_lock_shipping_snapshot`;--> statement-breakpoint
CREATE TRIGGER `trg_orders_lock_shipping_snapshot`
BEFORE UPDATE ON `orders`
WHEN OLD.`shipping_quote_id` IS NOT NEW.`shipping_quote_id`
  OR OLD.`shipping_address_fingerprint` IS NOT NEW.`shipping_address_fingerprint`
  OR OLD.`shipping_address_json` IS NOT NEW.`shipping_address_json`
  OR OLD.`shipping_country_code` IS NOT NEW.`shipping_country_code`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_quote_mismatch');
END;
