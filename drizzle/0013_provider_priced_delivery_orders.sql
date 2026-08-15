-- Preserve the legacy configured-price contract for synthetic quotes while
-- allowing an authenticated provider quote to carry its exact snapshotted price.
DROP TRIGGER `trg_orders_require_shipping_snapshot_insert`;--> statement-breakpoint
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
      AND configuration.`duties_terms` <> 'DDP'
      AND (
        (quote.`provider_receipt_fingerprint` IS NULL
          AND configuration.`price_cents` = NEW.`shipping_cents`)
        OR (
          quote.`provider_receipt_fingerprint` IS NOT NULL
          AND quote.`provider_quote_reference` IS NULL
          AND EXISTS (
            SELECT 1
            FROM `delivery_option_snapshots` AS option
            INNER JOIN `delivery_provider_reference_vault` AS sealed_quote
              ON sealed_quote.`reference_kind` = 'delivery_quote'
              AND sealed_quote.`owner_id` = option.`id`
              AND sealed_quote.`provider_code` = option.`provider_code`
              AND sealed_quote.`reference_sha256` = option.`provider_quote_reference_hash`
            WHERE option.`shipping_quote_id` = quote.`id`
              AND option.`cart_id` = quote.`cart_id`
              AND option.`cart_revision` = quote.`cart_revision`
              AND option.`shipping_address_fingerprint` = quote.`shipping_address_fingerprint`
              AND option.`proof_kind` = 'provider_api_response'
              AND option.`provider_receipt_fingerprint` = quote.`provider_receipt_fingerprint`
              AND option.`amount_cents` = quote.`amount_cents`
              AND option.`currency` = quote.`currency`
              AND option.`selected_at` = quote.`selected_at`
          )
        )
      )
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
CREATE TRIGGER `trg_orders_provider_pricing_contract`
BEFORE INSERT ON `orders`
WHEN EXISTS (
  SELECT 1 FROM `shipping_quotes` AS quote
  WHERE quote.`id` = NEW.`shipping_quote_id`
    AND quote.`provider_receipt_fingerprint` IS NOT NULL
    AND quote.`provider_quote_reference` IS NOT NULL
)
BEGIN SELECT RAISE(ABORT,'delivery_provider_raw_reference_forbidden'); END;--> statement-breakpoint
PRAGMA optimize;
