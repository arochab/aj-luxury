CREATE TABLE `shipment_retry_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`shipment_id` text NOT NULL,
	`administrator_id` text NOT NULL,
	`recipient_phone` text NOT NULL,
	`created_at` text NOT NULL,
	`consumed_at` text,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`administrator_id`) REFERENCES `administrators`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_shipment_retry_authorizations_phone" CHECK(length("shipment_retry_authorizations"."recipient_phone") BETWEEN 9 AND 16
        AND substr("shipment_retry_authorizations"."recipient_phone",1,1) = '+'
        AND substr("shipment_retry_authorizations"."recipient_phone",2) NOT GLOB '*[^0-9]*'
        AND substr("shipment_retry_authorizations"."recipient_phone",2,1) <> '0'),
	CONSTRAINT "ck_shipment_retry_authorizations_timestamps" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',"shipment_retry_authorizations"."created_at") IS "shipment_retry_authorizations"."created_at"
        AND ("shipment_retry_authorizations"."consumed_at" IS NULL
          OR (strftime('%Y-%m-%dT%H:%M:%fZ',"shipment_retry_authorizations"."consumed_at") IS "shipment_retry_authorizations"."consumed_at"
            AND "shipment_retry_authorizations"."consumed_at" >= "shipment_retry_authorizations"."created_at")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipment_retry_authorizations_shipment` ON `shipment_retry_authorizations` (`shipment_id`);--> statement-breakpoint
CREATE INDEX `idx_shipment_retry_authorizations_admin_created` ON `shipment_retry_authorizations` (`administrator_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `trg_shipment_retry_authorizations_validate_insert`
BEFORE INSERT ON `shipment_retry_authorizations`
WHEN NEW.`consumed_at` IS NOT NULL
  OR NEW.`created_at` > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 seconds')
  OR NOT EXISTS (
    SELECT 1 FROM `administrators`
    WHERE `id` = NEW.`administrator_id` AND `role` = 'owner' AND `enabled` = 1
  )
  OR NOT EXISTS (
    SELECT 1 FROM `shipments`
    WHERE `id` = NEW.`shipment_id` AND `status` = 'failed'
      AND `last_error_code` = 'provider_rejected'
      AND `attempts` >= 1 AND `attempts` < `max_attempts`
      AND `provider_shipment_reference` IS NULL
      AND `tracking_provider_code` IS NULL AND `tracking_reference` IS NULL
      AND `provider_receipt_fingerprint` IS NULL
      AND `lease_token_hash` IS NULL AND `leased_at` IS NULL
      AND `lease_expires_at` IS NULL AND `label_created_at` IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'shipment_retry_not_authorized');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_shipment_retry_authorizations_lock`
BEFORE UPDATE ON `shipment_retry_authorizations`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`shipment_id` IS NOT NEW.`shipment_id`
  OR OLD.`administrator_id` IS NOT NEW.`administrator_id`
  OR OLD.`recipient_phone` IS NOT NEW.`recipient_phone`
  OR OLD.`created_at` IS NOT NEW.`created_at`
  OR OLD.`consumed_at` IS NOT NULL
  OR NEW.`consumed_at` IS NULL
  OR NEW.`consumed_at` < NEW.`created_at`
  OR NEW.`consumed_at` > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 seconds')
  OR NOT EXISTS (
    SELECT 1 FROM `shipments`
    WHERE `id` = NEW.`shipment_id` AND `status` = 'failed'
      AND `last_error_code` = 'provider_rejected'
      AND `attempts` >= 1 AND `attempts` < `max_attempts`
      AND `provider_shipment_reference` IS NULL
      AND `tracking_provider_code` IS NULL AND `tracking_reference` IS NULL
      AND `provider_receipt_fingerprint` IS NULL
      AND `lease_token_hash` IS NULL AND `leased_at` IS NULL
      AND `lease_expires_at` IS NULL AND `label_created_at` IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'shipment_retry_not_authorized');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_shipment_retry_authorizations_no_delete`
BEFORE DELETE ON `shipment_retry_authorizations`
BEGIN
  SELECT RAISE(ABORT, 'shipment_retry_authorization_immutable');
END;
--> statement-breakpoint
DROP TRIGGER `trg_shipments_validate_transition`;
--> statement-breakpoint
CREATE TRIGGER `trg_shipments_validate_transition`
BEFORE UPDATE ON `shipments`
WHEN NOT (
  OLD.`status` = 'label_pending' AND NEW.`status` = 'label_claimed'
  AND NEW.`attempts` = OLD.`attempts` + 1
  AND NEW.`lease_token_hash` IS NOT NULL AND length(NEW.`lease_token_hash`) = 64
  AND NEW.`leased_at` IS NOT NULL AND NEW.`lease_expires_at` > NEW.`leased_at`
  AND NEW.`leased_at` = NEW.`updated_at`
  AND NEW.`leased_at` <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 seconds')
  AND CAST(strftime('%s', NEW.`lease_expires_at`) AS integer)
    - CAST(strftime('%s', NEW.`leased_at`) AS integer) BETWEEN 30 AND 900
  AND NEW.`provider_shipment_reference` IS NULL
  AND NEW.`tracking_provider_code` IS NULL AND NEW.`tracking_reference` IS NULL
  AND NEW.`provider_receipt_fingerprint` IS NULL
  AND NEW.`label_created_at` IS NULL
) AND NOT (
  OLD.`status` = 'failed' AND NEW.`status` = 'label_claimed'
  AND OLD.`last_error_code` = 'provider_rejected'
  AND NEW.`attempts` = OLD.`attempts` + 1
  AND NEW.`lease_token_hash` IS NOT NULL AND length(NEW.`lease_token_hash`) = 64
  AND NEW.`leased_at` IS NOT NULL AND NEW.`lease_expires_at` > NEW.`leased_at`
  AND NEW.`leased_at` = NEW.`updated_at`
  AND NEW.`leased_at` <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 seconds')
  AND CAST(strftime('%s', NEW.`lease_expires_at`) AS integer)
    - CAST(strftime('%s', NEW.`leased_at`) AS integer) BETWEEN 30 AND 900
  AND NEW.`last_error_code` IS NULL
  AND NEW.`provider_shipment_reference` IS NULL
  AND NEW.`tracking_provider_code` IS NULL AND NEW.`tracking_reference` IS NULL
  AND NEW.`provider_receipt_fingerprint` IS NULL
  AND NEW.`label_created_at` IS NULL
  AND EXISTS (
    SELECT 1 FROM `shipment_retry_authorizations` AS authorization
    WHERE authorization.`shipment_id` = OLD.`id`
      AND authorization.`consumed_at` = NEW.`leased_at`
  )
) AND NOT (
  OLD.`status` = 'label_claimed' AND NEW.`status` = 'label_claimed'
  AND OLD.`lease_expires_at` <= NEW.`leased_at`
  AND OLD.`lease_expires_at` <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  AND NEW.`attempts` = OLD.`attempts` + 1
  AND NEW.`lease_token_hash` IS NOT NULL AND length(NEW.`lease_token_hash`) = 64
  AND NEW.`lease_expires_at` > NEW.`leased_at`
  AND NEW.`leased_at` = NEW.`updated_at`
  AND NEW.`leased_at` <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 seconds')
  AND CAST(strftime('%s', NEW.`lease_expires_at`) AS integer)
    - CAST(strftime('%s', NEW.`leased_at`) AS integer) BETWEEN 30 AND 900
) AND NOT (
  OLD.`status` = 'label_claimed' AND NEW.`status` = 'label_ready'
  AND NEW.`attempts` = OLD.`attempts`
  AND NEW.`provider_shipment_reference` IS NOT NULL
  AND NEW.`tracking_provider_code` IS NOT NULL AND NEW.`tracking_reference` IS NOT NULL
  AND NEW.`provider_receipt_fingerprint` IS NOT NULL
  AND NEW.`lease_token_hash` IS NULL AND NEW.`leased_at` IS NULL
  AND NEW.`lease_expires_at` IS NULL AND NEW.`label_created_at` IS NOT NULL
) AND NOT (
  OLD.`status` = 'label_claimed' AND NEW.`status` = 'failed'
  AND NEW.`attempts` = OLD.`attempts`
  AND NEW.`last_error_code` = 'provider_rejected'
  AND NEW.`lease_token_hash` IS NULL AND NEW.`leased_at` IS NULL
  AND NEW.`lease_expires_at` IS NULL
) AND NOT (
  OLD.`status` = 'label_ready' AND NEW.`status` = 'handed_over'
  AND EXISTS (
    SELECT 1 FROM `shipment_tracking_events` AS event
    WHERE event.`shipment_id` = OLD.`id` AND event.`event_type` = 'handed_over'
      AND event.`provider_code` = 'internal_handover'
      AND event.`tracking_reference` = OLD.`tracking_reference`
      AND NEW.`handed_over_at` = event.`occurred_at`
      AND NEW.`updated_at` = event.`received_at`
  )
  AND (
    EXISTS (
      SELECT 1 FROM `shipping_quotes` AS quote
      INNER JOIN `shipping_zone_configurations` AS configuration
        ON configuration.`id` = quote.`configuration_id`
      WHERE quote.`id` = OLD.`shipping_quote_id` AND configuration.`zone` = 'EU'
    ) OR EXISTS (
      SELECT 1 FROM `customs_records`
      WHERE `shipment_id` = OLD.`id` AND `status` = 'ready'
    )
  )
) AND NOT (
  OLD.`status` = 'handed_over' AND NEW.`status` = 'in_transit'
  AND EXISTS (
    SELECT 1 FROM `shipment_tracking_events` AS event
    INNER JOIN `carrier_event_receipts` AS receipt
      ON receipt.`id` = event.`carrier_receipt_id`
    WHERE event.`shipment_id` = OLD.`id`
      AND event.`event_type` IN ('in_transit', 'out_for_delivery')
      AND event.`provider_code` = OLD.`tracking_provider_code`
      AND event.`tracking_reference` = OLD.`tracking_reference`
      AND NEW.`updated_at` = event.`received_at`
      AND receipt.`status` = 'consumed'
      AND receipt.`shipment_id` = event.`shipment_id`
      AND receipt.`provider_code` = event.`provider_code`
      AND receipt.`provider_event_id` = event.`provider_event_id`
      AND receipt.`tracking_reference` = event.`tracking_reference`
      AND receipt.`event_type` = event.`event_type`
      AND receipt.`event_fingerprint` = event.`event_fingerprint`
      AND receipt.`occurred_at` = event.`occurred_at`
      AND receipt.`received_at` = event.`received_at`
      AND receipt.`consumed_at` = event.`received_at`
  )
) AND NOT (
  OLD.`status` IN ('handed_over', 'in_transit') AND NEW.`status` = 'delivered'
  AND EXISTS (
    SELECT 1 FROM `shipment_tracking_events` AS event
    INNER JOIN `carrier_event_receipts` AS receipt
      ON receipt.`id` = event.`carrier_receipt_id`
    WHERE event.`shipment_id` = OLD.`id` AND event.`event_type` = 'delivered'
      AND event.`provider_code` = OLD.`tracking_provider_code`
      AND event.`tracking_reference` = OLD.`tracking_reference`
      AND NEW.`delivered_at` = event.`occurred_at`
      AND NEW.`updated_at` = event.`received_at`
      AND receipt.`status` = 'consumed'
      AND receipt.`shipment_id` = event.`shipment_id`
      AND receipt.`provider_code` = event.`provider_code`
      AND receipt.`provider_event_id` = event.`provider_event_id`
      AND receipt.`tracking_reference` = event.`tracking_reference`
      AND receipt.`event_type` = event.`event_type`
      AND receipt.`event_fingerprint` = event.`event_fingerprint`
      AND receipt.`occurred_at` = event.`occurred_at`
      AND receipt.`received_at` = event.`received_at`
      AND receipt.`consumed_at` = event.`received_at`
  )
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_customs_not_ready')
  WHERE OLD.`status` = 'label_ready' AND NEW.`status` = 'handed_over';
  SELECT RAISE(ABORT, 'fulfillment_invalid_transition')
  WHERE (OLD.`status` = 'label_ready' AND NEW.`status` = 'handed_over') IS NOT TRUE;
END;
