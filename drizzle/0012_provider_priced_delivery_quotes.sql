-- Provider-backed commercial quotes take the validated Sendcloud amount and ETA.
-- Legacy/synthetic quotes remain pinned to their active configuration values.
DROP TRIGGER `trg_shipping_quote_validate_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_shipping_quote_validate_insert`
BEFORE INSERT ON `shipping_quotes`
WHEN NEW.`selected_at` IS NOT NULL
  OR NEW.`cart_revision` < 0
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`expires_at`) IS NOT NEW.`expires_at`
  OR NEW.`expires_at` <= NEW.`created_at`
  OR NOT EXISTS (
    SELECT 1
    FROM `shipping_zone_configurations` AS configuration
    INNER JOIN `carts` AS cart ON cart.`id` = NEW.`cart_id`
    WHERE configuration.`id` = NEW.`configuration_id`
      AND configuration.`status` = 'active'
      AND configuration.`duties_terms` <> 'DDP'
      AND cart.`status` = 'open'
      AND NEW.`cart_revision` = cart.`fulfillment_revision`
      AND cart.`expires_at` > NEW.`created_at`
      AND NEW.`expires_at` <= cart.`expires_at`
      AND NEW.`currency` = configuration.`currency`
      AND NEW.`duties_terms` = configuration.`duties_terms`
      AND (
        (NEW.`provider_receipt_fingerprint` IS NULL
          AND NEW.`amount_cents` = configuration.`price_cents`
          AND NEW.`estimated_days_min` = configuration.`estimated_days_min`
          AND NEW.`estimated_days_max` = configuration.`estimated_days_max`)
        OR (NEW.`provider_receipt_fingerprint` IS NOT NULL
          AND NEW.`provider_quote_reference` IS NULL)
      )
      AND configuration.`zone` = CASE
        WHEN json_extract(NEW.`shipping_address_json`, '$.countryCode') IN (
          'AT','BE','BG','HR','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HU',
          'IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'
        ) THEN 'EU'
        WHEN json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'GB' THEN 'UK'
        WHEN json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'US' THEN 'US'
        WHEN json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'CA' THEN 'CA'
        ELSE NULL
      END
      AND json_type(NEW.`shipping_address_json`, '$.postalCode') = 'text'
      AND length(json_extract(NEW.`shipping_address_json`, '$.postalCode')) BETWEEN 1 AND 16
      AND NOT (
        json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'FR'
        AND substr(replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', ''), 1, 3)
          IN ('971','972','973','974','975','976','977','978','984','985','986','987','988')
      )
      AND NOT (
        json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'GB'
        AND substr(replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', ''), 1, 2)
          IN ('JE','GY','IM','GX')
      )
      AND NOT (
        json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'US'
        AND (
          json_extract(NEW.`shipping_address_json`, '$.regionCode') IS NULL
          OR json_extract(NEW.`shipping_address_json`, '$.regionCode') NOT IN (
            'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
            'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
            'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
            'WV','WI','WY'
          )
          OR substr(replace(replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', ''), '-', ''), 1, 3)
            BETWEEN '006' AND '009'
          OR substr(replace(replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', ''), '-', ''), 1, 3)
            BETWEEN '090' AND '098'
          OR substr(replace(replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', ''), '-', ''), 1, 3)
            IN ('340','962','963','964','965','966','969')
          OR substr(replace(replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', ''), '-', ''), 1, 5)
            IN ('96799','96898')
        )
      )
      AND NOT (
        json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'GR'
        AND replace(replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', ''), '-', '') IN ('63086','GR63086')
      )
      AND NOT (
        json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'ES'
        AND substr(replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', ''), 1, 2) IN ('35','38','51','52')
      )
      AND NOT (
        json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'PT'
        AND substr(replace(replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', ''), '-', ''), 1, 1) = '9'
      )
      AND NOT (
        json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'FI'
        AND substr(replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', ''), 1, 2) = '22'
      )
      AND NOT (
        json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'DE'
        AND replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', '') IN ('27498','78266')
      )
      AND NOT (
        json_extract(NEW.`shipping_address_json`, '$.countryCode') = 'IT'
        AND replace(upper(json_extract(NEW.`shipping_address_json`, '$.postalCode')), ' ', '') IN ('22061','23041')
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_quote_mismatch')
  WHERE NEW.`cart_revision` < 0 OR NOT EXISTS (
      SELECT 1 FROM `carts` AS cart
      WHERE cart.`id` = NEW.`cart_id`
        AND cart.`fulfillment_revision` = NEW.`cart_revision`
    );
  SELECT RAISE(ABORT, 'fulfillment_destination_unavailable')
  WHERE (NEW.`cart_revision` < 0 OR NOT EXISTS (
    SELECT 1 FROM `carts` AS cart
    WHERE cart.`id` = NEW.`cart_id`
      AND cart.`fulfillment_revision` = NEW.`cart_revision`
  )) IS NOT TRUE;
END;--> statement-breakpoint
CREATE TRIGGER `trg_shipping_quote_provider_pricing_contract`
BEFORE INSERT ON `shipping_quotes`
WHEN NEW.`provider_receipt_fingerprint` IS NOT NULL
  AND NEW.`provider_quote_reference` IS NOT NULL
BEGIN SELECT RAISE(ABORT,'delivery_provider_raw_reference_forbidden'); END;--> statement-breakpoint
PRAGMA optimize;
