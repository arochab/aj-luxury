CREATE TABLE `customs_records` (
	`id` text PRIMARY KEY NOT NULL,
	`shipment_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`manual_reference` text,
	`record_fingerprint` text,
	`ready_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_customs_records_status" CHECK("customs_records"."status" IN ('pending', 'ready', 'blocked')),
	CONSTRAINT "ck_customs_records_fingerprint" CHECK("customs_records"."record_fingerprint" IS NULL
        OR (length("customs_records"."record_fingerprint") = 64
          AND "customs_records"."record_fingerprint" = lower("customs_records"."record_fingerprint")
          AND "customs_records"."record_fingerprint" NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "ck_customs_records_ready_shape" CHECK(("customs_records"."status" = 'ready' AND "customs_records"."manual_reference" IS NOT NULL
          AND "customs_records"."record_fingerprint" IS NOT NULL AND "customs_records"."ready_at" IS NOT NULL)
        OR ("customs_records"."status" <> 'ready' AND "customs_records"."ready_at" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_customs_records_shipment` ON `customs_records` (`shipment_id`);--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`return_request_id` text NOT NULL,
	`reason` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`idempotency_key` text NOT NULL,
	`lease_token_hash` text,
	`leased_at` text,
	`lease_expires_at` text,
	`provider_refund_reference` text,
	`provider_receipt_fingerprint` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`last_error_code` text,
	`succeeded_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`return_request_id`) REFERENCES `return_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_refunds_reason" CHECK("refunds"."reason" IN ('return', 'withdrawal')),
	CONSTRAINT "ck_refunds_amount" CHECK("refunds"."amount_cents" > 0),
	CONSTRAINT "ck_refunds_currency" CHECK("refunds"."currency" = 'EUR'),
	CONSTRAINT "ck_refunds_status" CHECK("refunds"."status" IN ('pending', 'claimed', 'succeeded', 'failed')),
	CONSTRAINT "ck_refunds_attempts" CHECK("refunds"."attempts" >= 0 AND "refunds"."max_attempts" >= 1
        AND "refunds"."attempts" <= "refunds"."max_attempts"),
	CONSTRAINT "ck_refunds_receipt_fingerprint" CHECK("refunds"."provider_receipt_fingerprint" IS NULL
        OR (length("refunds"."provider_receipt_fingerprint") = 64
          AND "refunds"."provider_receipt_fingerprint" = lower("refunds"."provider_receipt_fingerprint")
          AND "refunds"."provider_receipt_fingerprint" NOT GLOB '*[^0-9a-f]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_refunds_idempotency` ON `refunds` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_refunds_provider_reference` ON `refunds` (`provider_refund_reference`) WHERE "refunds"."provider_refund_reference" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_refunds_active_lease` ON `refunds` (`lease_token_hash`) WHERE "refunds"."lease_token_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_refunds_payment_status` ON `refunds` (`payment_id`,`status`);--> statement-breakpoint
CREATE TABLE `return_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`return_request_id` text NOT NULL,
	`order_line_id` text NOT NULL,
	`requested_quantity` integer NOT NULL,
	`received_quantity` integer DEFAULT 0 NOT NULL,
	`sellable_quantity` integer DEFAULT 0 NOT NULL,
	`non_sellable_quantity` integer DEFAULT 0 NOT NULL,
	`restocked_quantity` integer DEFAULT 0 NOT NULL,
	`inspection_result` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`return_request_id`) REFERENCES `return_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_return_lines_quantities" CHECK("return_lines"."requested_quantity" > 0
        AND "return_lines"."received_quantity" >= 0
        AND "return_lines"."received_quantity" <= "return_lines"."requested_quantity"
        AND "return_lines"."sellable_quantity" >= 0
        AND "return_lines"."non_sellable_quantity" >= 0
        AND "return_lines"."sellable_quantity" + "return_lines"."non_sellable_quantity" = "return_lines"."received_quantity"
        AND "return_lines"."restocked_quantity" >= 0
        AND "return_lines"."restocked_quantity" <= "return_lines"."sellable_quantity"),
	CONSTRAINT "ck_return_lines_inspection" CHECK(("return_lines"."inspection_result" = 'pending'
          AND "return_lines"."received_quantity" = 0
          AND "return_lines"."sellable_quantity" = 0
          AND "return_lines"."non_sellable_quantity" = 0
          AND "return_lines"."restocked_quantity" = 0)
        OR "return_lines"."inspection_result" = 'complete')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_return_lines_request_order_line` ON `return_lines` (`return_request_id`,`order_line_id`);--> statement-breakpoint
CREATE INDEX `idx_return_lines_order_line` ON `return_lines` (`order_line_id`);--> statement-breakpoint
CREATE TABLE `return_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`actor_customer_id` text,
	`guest_order_session_id` text,
	`actor_admin_id` text,
	`declaration_fingerprint` text NOT NULL,
	`declared_line_count` integer NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`resolution` text DEFAULT 'pending' NOT NULL,
	`requested_at` text NOT NULL,
	`resolved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`guest_order_session_id`) REFERENCES `guest_order_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_admin_id`) REFERENCES `administrators`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_return_requests_kind" CHECK("return_requests"."kind" IN ('return', 'withdrawal')),
	CONSTRAINT "ck_return_requests_source" CHECK(("return_requests"."source" = 'customer' AND "return_requests"."actor_customer_id" IS NOT NULL
          AND "return_requests"."guest_order_session_id" IS NULL AND "return_requests"."actor_admin_id" IS NULL)
        OR ("return_requests"."source" = 'guest' AND "return_requests"."actor_customer_id" IS NULL
          AND "return_requests"."guest_order_session_id" IS NOT NULL AND "return_requests"."actor_admin_id" IS NULL)
        OR ("return_requests"."source" = 'admin' AND "return_requests"."actor_customer_id" IS NULL
          AND "return_requests"."guest_order_session_id" IS NULL AND "return_requests"."actor_admin_id" IS NOT NULL)),
	CONSTRAINT "ck_return_requests_status" CHECK("return_requests"."status" IN (
        'received', 'approved', 'goods_received', 'inspected', 'resolved',
        'rejected', 'cancelled'
      )),
	CONSTRAINT "ck_return_requests_resolution" CHECK("return_requests"."resolution" IN ('pending', 'refund', 'rejected', 'no_refund')),
	CONSTRAINT "ck_return_requests_fingerprint" CHECK(length("return_requests"."declaration_fingerprint") = 64
        AND "return_requests"."declaration_fingerprint" = lower("return_requests"."declaration_fingerprint")
        AND "return_requests"."declaration_fingerprint" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "ck_return_requests_declared_lines" CHECK("return_requests"."declared_line_count" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_return_requests_declaration` ON `return_requests` (`order_id`,`declaration_fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_return_requests_order_status` ON `return_requests` (`order_id`,`status`);--> statement-breakpoint
CREATE TABLE `carrier_event_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`shipment_id` text NOT NULL,
	`provider_code` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`tracking_reference` text NOT NULL,
	`event_type` text NOT NULL,
	`event_fingerprint` text NOT NULL,
	`receipt_fingerprint` text NOT NULL,
	`verification_method` text NOT NULL,
	`occurred_at` text NOT NULL,
	`received_at` text NOT NULL,
	`verified_at` text NOT NULL,
	`status` text DEFAULT 'verified' NOT NULL,
	`consumed_at` text,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_carrier_receipts_type" CHECK("carrier_event_receipts"."event_type" IN (
        'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'
      )),
	CONSTRAINT "ck_carrier_receipts_verification_method" CHECK("carrier_event_receipts"."verification_method" IN ('test_adapter', 'carrier_signature')),
	CONSTRAINT "ck_carrier_receipts_fingerprints" CHECK(length("carrier_event_receipts"."event_fingerprint") = 64
        AND "carrier_event_receipts"."event_fingerprint" = lower("carrier_event_receipts"."event_fingerprint")
        AND "carrier_event_receipts"."event_fingerprint" NOT GLOB '*[^0-9a-f]*'
        AND length("carrier_event_receipts"."receipt_fingerprint") = 64
        AND "carrier_event_receipts"."receipt_fingerprint" = lower("carrier_event_receipts"."receipt_fingerprint")
        AND "carrier_event_receipts"."receipt_fingerprint" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "ck_carrier_receipts_state" CHECK(("carrier_event_receipts"."status" = 'verified'
          AND "carrier_event_receipts"."consumed_at" IS NULL)
        OR ("carrier_event_receipts"."status" = 'consumed'
          AND "carrier_event_receipts"."consumed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_carrier_receipts_provider_event` ON `carrier_event_receipts` (`provider_code`,`provider_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_carrier_receipts_fingerprint` ON `carrier_event_receipts` (`receipt_fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_carrier_receipts_shipment_status` ON `carrier_event_receipts` (`shipment_id`,`status`);--> statement-breakpoint
CREATE TABLE `shipment_tracking_events` (
	`id` text PRIMARY KEY NOT NULL,
	`shipment_id` text NOT NULL,
	`provider_code` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`carrier_receipt_id` text,
	`event_type` text NOT NULL,
	`tracking_reference` text NOT NULL,
	`event_fingerprint` text NOT NULL,
	`occurred_at` text NOT NULL,
	`received_at` text NOT NULL,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`carrier_receipt_id`) REFERENCES `carrier_event_receipts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_tracking_events_type" CHECK("shipment_tracking_events"."event_type" IN (
        'handed_over', 'in_transit', 'out_for_delivery', 'delivered',
        'exception', 'returned'
      )),
	CONSTRAINT "ck_tracking_events_fingerprint" CHECK(length("shipment_tracking_events"."event_fingerprint") = 64
        AND "shipment_tracking_events"."event_fingerprint" = lower("shipment_tracking_events"."event_fingerprint")
        AND "shipment_tracking_events"."event_fingerprint" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "ck_tracking_events_receipt_shape" CHECK(("shipment_tracking_events"."event_type" = 'handed_over'
          AND "shipment_tracking_events"."carrier_receipt_id" IS NULL)
        OR ("shipment_tracking_events"."event_type" <> 'handed_over'
          AND "shipment_tracking_events"."carrier_receipt_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_tracking_events_provider_event` ON `shipment_tracking_events` (`provider_code`,`provider_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_tracking_events_carrier_receipt` ON `shipment_tracking_events` (`carrier_receipt_id`) WHERE "shipment_tracking_events"."carrier_receipt_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_tracking_events_handover_shipment` ON `shipment_tracking_events` (`shipment_id`) WHERE "shipment_tracking_events"."event_type" = 'handed_over';--> statement-breakpoint
CREATE INDEX `idx_tracking_events_shipment_received` ON `shipment_tracking_events` (`shipment_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`shipping_quote_id` text NOT NULL,
	`status` text DEFAULT 'label_pending' NOT NULL,
	`provider_shipment_reference` text,
	`tracking_provider_code` text,
	`tracking_reference` text,
	`provider_receipt_fingerprint` text,
	`idempotency_key` text NOT NULL,
	`lease_token_hash` text,
	`leased_at` text,
	`lease_expires_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`last_error_code` text,
	`label_created_at` text,
	`handed_over_at` text,
	`delivered_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shipping_quote_id`) REFERENCES `shipping_quotes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_shipments_status" CHECK("shipments"."status" IN (
        'label_pending', 'label_claimed', 'label_ready', 'handed_over',
        'in_transit', 'delivered', 'failed'
      )),
	CONSTRAINT "ck_shipments_attempts" CHECK("shipments"."attempts" >= 0 AND "shipments"."max_attempts" >= 1
        AND "shipments"."attempts" <= "shipments"."max_attempts"),
	CONSTRAINT "ck_shipments_receipt_fingerprint" CHECK("shipments"."provider_receipt_fingerprint" IS NULL
        OR (length("shipments"."provider_receipt_fingerprint") = 64
          AND "shipments"."provider_receipt_fingerprint" = lower("shipments"."provider_receipt_fingerprint")
          AND "shipments"."provider_receipt_fingerprint" NOT GLOB '*[^0-9a-f]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipments_order` ON `shipments` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipments_idempotency` ON `shipments` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipments_provider_reference` ON `shipments` (`provider_shipment_reference`) WHERE "shipments"."provider_shipment_reference" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipments_tracking_reference` ON `shipments` (`tracking_reference`) WHERE "shipments"."tracking_reference" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipments_active_lease` ON `shipments` (`lease_token_hash`) WHERE "shipments"."lease_token_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_shipments_status_lease` ON `shipments` (`status`,`lease_expires_at`);--> statement-breakpoint
ALTER TABLE `carts` ADD `fulfillment_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE `shipping_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`cart_id` text NOT NULL,
	`cart_fingerprint` text NOT NULL,
	`cart_revision` integer NOT NULL,
	`configuration_id` text NOT NULL,
	`shipping_address_json` text NOT NULL,
	`shipping_address_fingerprint` text NOT NULL,
	`provider_quote_reference` text,
	`provider_receipt_fingerprint` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`estimated_days_min` integer NOT NULL,
	`estimated_days_max` integer NOT NULL,
	`duties_terms` text NOT NULL,
	`expires_at` text NOT NULL,
	`selected_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`configuration_id`) REFERENCES `shipping_zone_configurations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_shipping_quotes_amount" CHECK("shipping_quotes"."amount_cents" >= 0),
	CONSTRAINT "ck_shipping_quotes_cart_revision" CHECK("shipping_quotes"."cart_revision" >= 0),
	CONSTRAINT "ck_shipping_quotes_currency" CHECK("shipping_quotes"."currency" = 'EUR'),
	CONSTRAINT "ck_shipping_quotes_delays" CHECK("shipping_quotes"."estimated_days_min" > 0
        AND "shipping_quotes"."estimated_days_max" >= "shipping_quotes"."estimated_days_min"),
	CONSTRAINT "ck_shipping_quotes_duties" CHECK("shipping_quotes"."duties_terms" IN ('EU_INCLUDED', 'DAP', 'DDP')),
	CONSTRAINT "ck_shipping_quotes_fingerprints" CHECK(length("shipping_quotes"."cart_fingerprint") = 64
        AND "shipping_quotes"."cart_fingerprint" = lower("shipping_quotes"."cart_fingerprint")
        AND "shipping_quotes"."cart_fingerprint" NOT GLOB '*[^0-9a-f]*'
        AND length("shipping_quotes"."shipping_address_fingerprint") = 64
        AND "shipping_quotes"."shipping_address_fingerprint" = lower("shipping_quotes"."shipping_address_fingerprint")
        AND "shipping_quotes"."shipping_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
        AND ("shipping_quotes"."provider_receipt_fingerprint" IS NULL
          OR (length("shipping_quotes"."provider_receipt_fingerprint") = 64
            AND "shipping_quotes"."provider_receipt_fingerprint" = lower("shipping_quotes"."provider_receipt_fingerprint")
            AND "shipping_quotes"."provider_receipt_fingerprint" NOT GLOB '*[^0-9a-f]*')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipping_quotes_selected_cart` ON `shipping_quotes` (`cart_id`) WHERE "shipping_quotes"."selected_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_shipping_quotes_cart_expires_at` ON `shipping_quotes` (`cart_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_shipping_quotes_configuration` ON `shipping_quotes` (`configuration_id`);--> statement-breakpoint
CREATE TABLE `shipping_zone_configurations` (
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
	CONSTRAINT "ck_shipping_zone_configurations_zone" CHECK("shipping_zone_configurations"."zone" IN ('EU', 'UK', 'US', 'CA')),
	CONSTRAINT "ck_shipping_zone_configurations_status" CHECK("shipping_zone_configurations"."status" IN ('draft', 'active', 'retired')),
	CONSTRAINT "ck_shipping_zone_configurations_version" CHECK("shipping_zone_configurations"."version" > 0),
	CONSTRAINT "ck_shipping_zone_configurations_currency" CHECK("shipping_zone_configurations"."currency" = 'EUR'),
	CONSTRAINT "ck_shipping_zone_configurations_price" CHECK("shipping_zone_configurations"."price_cents" IS NULL OR "shipping_zone_configurations"."price_cents" >= 0),
	CONSTRAINT "ck_shipping_zone_configurations_delays" CHECK(("shipping_zone_configurations"."estimated_days_min" IS NULL AND "shipping_zone_configurations"."estimated_days_max" IS NULL)
        OR ("shipping_zone_configurations"."estimated_days_min" > 0
          AND "shipping_zone_configurations"."estimated_days_max" >= "shipping_zone_configurations"."estimated_days_min")),
	CONSTRAINT "ck_shipping_zone_configurations_duties" CHECK("shipping_zone_configurations"."duties_terms" IS NULL
        OR "shipping_zone_configurations"."duties_terms" IN ('EU_INCLUDED', 'DAP', 'DDP')),
	CONSTRAINT "ck_shipping_zone_configurations_parcel" CHECK(("shipping_zone_configurations"."parcel_weight_grams" IS NULL
          AND "shipping_zone_configurations"."parcel_length_mm" IS NULL
          AND "shipping_zone_configurations"."parcel_width_mm" IS NULL
          AND "shipping_zone_configurations"."parcel_height_mm" IS NULL)
        OR ("shipping_zone_configurations"."parcel_weight_grams" > 0
          AND "shipping_zone_configurations"."parcel_length_mm" > 0
          AND "shipping_zone_configurations"."parcel_width_mm" > 0
          AND "shipping_zone_configurations"."parcel_height_mm" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipping_zone_configurations_version` ON `shipping_zone_configurations` (`zone`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipping_zone_configurations_active` ON `shipping_zone_configurations` (`zone`) WHERE "shipping_zone_configurations"."status" = 'active';--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_quote_id` text
  REFERENCES `shipping_quotes`(`id`) ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_address_fingerprint` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_orders_shipping_quote_id` ON `orders` (`shipping_quote_id`) WHERE "orders"."shipping_quote_id" IS NOT NULL;--> statement-breakpoint

CREATE TRIGGER `trg_shipping_zone_configuration_validate_insert`
BEFORE INSERT ON `shipping_zone_configurations`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at` <> NEW.`created_at`
  OR NEW.`activated_at` IS NOT NULL OR NEW.`retired_at` IS NOT NULL
  OR NEW.`status` <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_configuration_insert_invalid');
END;--> statement-breakpoint

CREATE TRIGGER `trg_shipping_zone_configuration_validate_activation`
BEFORE UPDATE OF `status` ON `shipping_zone_configurations`
WHEN OLD.`status` = 'draft' AND NEW.`status` = 'active' AND (
  NEW.`service_code` IS NULL OR length(NEW.`service_code`) NOT BETWEEN 1 AND 80
  OR NEW.`price_cents` IS NULL OR NEW.`price_cents` < 0
  OR NEW.`estimated_days_min` IS NULL OR NEW.`estimated_days_min` <= 0
  OR NEW.`estimated_days_max` IS NULL
  OR NEW.`estimated_days_max` < NEW.`estimated_days_min`
  OR NEW.`duties_terms` IS NULL
  OR (NEW.`zone` = 'EU' AND NEW.`duties_terms` <> 'EU_INCLUDED')
  OR (NEW.`zone` <> 'EU' AND NEW.`duties_terms` <> 'DAP')
  OR NEW.`duties_terms` = 'DDP'
  OR NEW.`parcel_code` IS NULL OR length(NEW.`parcel_code`) NOT BETWEEN 1 AND 80
  OR NEW.`parcel_weight_grams` IS NULL OR NEW.`parcel_weight_grams` <= 0
  OR NEW.`parcel_length_mm` IS NULL OR NEW.`parcel_length_mm` <= 0
  OR NEW.`parcel_width_mm` IS NULL OR NEW.`parcel_width_mm` <= 0
  OR NEW.`parcel_height_mm` IS NULL OR NEW.`parcel_height_mm` <= 0
  OR NEW.`origin_country_code` IS NULL
  OR length(NEW.`origin_country_code`) <> 2
  OR NEW.`customs_hs_code` IS NULL
  OR length(NEW.`customs_hs_code`) NOT BETWEEN 4 AND 16
  OR NEW.`activated_at` IS NULL
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`activated_at`) IS NOT NEW.`activated_at`
  OR NEW.`retired_at` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_configuration_ddp_unavailable')
  WHERE NEW.`duties_terms` = 'DDP';
  SELECT RAISE(ABORT, 'fulfillment_configuration_incomplete')
  WHERE (NEW.`duties_terms` = 'DDP') IS NOT TRUE;
END;--> statement-breakpoint

CREATE TRIGGER `trg_shipping_zone_configuration_transition`
BEFORE UPDATE ON `shipping_zone_configurations`
WHEN NOT (
  OLD.`status` = 'draft' AND NEW.`status` IN ('draft', 'active')
  AND NEW.`retired_at` IS NULL
  AND (NEW.`status` = 'draft' OR NEW.`activated_at` IS NOT NULL)
) AND NOT (
  OLD.`status` = 'active' AND NEW.`status` = 'retired'
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
  AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`retired_at`) IS NEW.`retired_at`
) AND NOT (
  OLD.`status` = 'draft' AND NEW.`status` = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_configuration_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_shipping_zone_configuration_validate_update_timestamp`
BEFORE UPDATE ON `shipping_zone_configurations`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at` <= OLD.`updated_at`
  OR OLD.`created_at` IS NOT NEW.`created_at`
  OR OLD.`id` IS NOT NEW.`id` OR OLD.`zone` IS NOT NEW.`zone`
  OR OLD.`version` IS NOT NEW.`version`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_configuration_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_shipping_zone_configuration_state_shape`
BEFORE UPDATE ON `shipping_zone_configurations`
WHEN (NEW.`status` = 'draft' AND (
    NEW.`activated_at` IS NOT NULL OR NEW.`retired_at` IS NOT NULL
  ))
  OR (NEW.`status` = 'active' AND (
    NEW.`activated_at` IS NULL OR NEW.`retired_at` IS NOT NULL
  ))
  OR (NEW.`status` = 'retired' AND (
    NEW.`activated_at` IS NULL OR NEW.`retired_at` IS NULL
  ))
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_configuration_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_shipping_zone_configuration_retain`
BEFORE DELETE ON `shipping_zone_configurations`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_configuration_is_immutable');
END;--> statement-breakpoint

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
      AND NEW.`amount_cents` = configuration.`price_cents`
      AND NEW.`currency` = configuration.`currency`
      AND NEW.`estimated_days_min` = configuration.`estimated_days_min`
      AND NEW.`estimated_days_max` = configuration.`estimated_days_max`
      AND NEW.`duties_terms` = configuration.`duties_terms`
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

CREATE TRIGGER `trg_shipping_quote_select_once`
BEFORE UPDATE ON `shipping_quotes`
WHEN NOT (
  OLD.`selected_at` IS NULL AND NEW.`selected_at` IS NOT NULL
  AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`selected_at`) IS NEW.`selected_at`
  AND NEW.`selected_at` >= OLD.`created_at`
  AND NEW.`selected_at` < OLD.`expires_at`
  AND strftime('%Y-%m-%dT%H:%M:%fZ', 'now') < OLD.`expires_at`
  AND OLD.`id` IS NEW.`id` AND OLD.`cart_id` IS NEW.`cart_id`
  AND OLD.`cart_fingerprint` IS NEW.`cart_fingerprint`
  AND OLD.`cart_revision` IS NEW.`cart_revision`
  AND OLD.`configuration_id` IS NEW.`configuration_id`
  AND OLD.`shipping_address_json` IS NEW.`shipping_address_json`
  AND OLD.`shipping_address_fingerprint` IS NEW.`shipping_address_fingerprint`
  AND OLD.`provider_quote_reference` IS NEW.`provider_quote_reference`
  AND OLD.`provider_receipt_fingerprint` IS NEW.`provider_receipt_fingerprint`
  AND OLD.`amount_cents` IS NEW.`amount_cents`
  AND OLD.`currency` IS NEW.`currency`
  AND OLD.`estimated_days_min` IS NEW.`estimated_days_min`
  AND OLD.`estimated_days_max` IS NEW.`estimated_days_max`
  AND OLD.`duties_terms` IS NEW.`duties_terms`
  AND OLD.`expires_at` IS NEW.`expires_at`
  AND OLD.`created_at` IS NEW.`created_at`
  AND EXISTS (
    SELECT 1 FROM `carts` AS cart
    WHERE cart.`id` = OLD.`cart_id`
      AND cart.`fulfillment_revision` = OLD.`cart_revision`
  )
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_quote_expired')
  WHERE NEW.`selected_at` >= OLD.`expires_at`
    OR strftime('%Y-%m-%dT%H:%M:%fZ', 'now') >= OLD.`expires_at`;
  SELECT RAISE(ABORT, 'fulfillment_quote_mismatch')
  WHERE (NEW.`selected_at` >= OLD.`expires_at`
    OR strftime('%Y-%m-%dT%H:%M:%fZ', 'now') >= OLD.`expires_at`) IS NOT TRUE;
END;--> statement-breakpoint

CREATE TRIGGER `trg_shipping_quote_retain`
BEFORE DELETE ON `shipping_quotes`
WHEN OLD.`selected_at` IS NOT NULL
  OR OLD.`expires_at` > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  OR EXISTS (SELECT 1 FROM `orders` WHERE `shipping_quote_id` = OLD.`id`)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_quote_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_cart_lines_lock_selected_quote_insert`
BEFORE INSERT ON `cart_lines`
WHEN EXISTS (
  SELECT 1 FROM `shipping_quotes`
  WHERE `cart_id` = NEW.`cart_id` AND `selected_at` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_quote_mismatch');
END;--> statement-breakpoint

CREATE TRIGGER `trg_cart_lines_lock_selected_quote_update`
BEFORE UPDATE ON `cart_lines`
WHEN EXISTS (
  SELECT 1 FROM `shipping_quotes`
  WHERE `cart_id` IN (OLD.`cart_id`, NEW.`cart_id`) AND `selected_at` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_quote_mismatch');
END;--> statement-breakpoint

CREATE TRIGGER `trg_cart_lines_lock_selected_quote_delete`
BEFORE DELETE ON `cart_lines`
WHEN EXISTS (
  SELECT 1 FROM `shipping_quotes`
  WHERE `cart_id` = OLD.`cart_id` AND `selected_at` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_quote_mismatch');
END;--> statement-breakpoint

CREATE TRIGGER `trg_carts_validate_fulfillment_revision`
BEFORE UPDATE OF `fulfillment_revision` ON `carts`
WHEN NEW.`fulfillment_revision` <> OLD.`fulfillment_revision` + 1
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_quote_mismatch');
END;--> statement-breakpoint

CREATE TRIGGER `trg_cart_lines_bump_fulfillment_revision_insert`
AFTER INSERT ON `cart_lines`
BEGIN
  UPDATE `carts` SET `fulfillment_revision` = `fulfillment_revision` + 1
  WHERE `id` = NEW.`cart_id`;
END;--> statement-breakpoint

CREATE TRIGGER `trg_cart_lines_bump_fulfillment_revision_update`
AFTER UPDATE OF `quantity` ON `cart_lines`
WHEN OLD.`quantity` IS NOT NEW.`quantity`
BEGIN
  UPDATE `carts` SET `fulfillment_revision` = `fulfillment_revision` + 1
  WHERE `id` = NEW.`cart_id`;
END;--> statement-breakpoint

CREATE TRIGGER `trg_cart_lines_bump_fulfillment_revision_delete`
AFTER DELETE ON `cart_lines`
BEGIN
  UPDATE `carts` SET `fulfillment_revision` = `fulfillment_revision` + 1
  WHERE `id` = OLD.`cart_id`;
END;--> statement-breakpoint

CREATE TRIGGER `trg_orders_require_shipping_snapshot_insert`
BEFORE INSERT ON `orders`
WHEN NEW.`shipping_quote_id` IS NULL OR NEW.`shipping_address_fingerprint` IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM `shipping_quotes` AS quote
    INNER JOIN `carts` AS cart ON cart.`id` = quote.`cart_id`
    WHERE quote.`id` = NEW.`shipping_quote_id`
      AND quote.`cart_id` = NEW.`cart_id`
      AND quote.`cart_revision` = cart.`fulfillment_revision`
      AND quote.`selected_at` IS NOT NULL
      AND quote.`shipping_address_fingerprint` = NEW.`shipping_address_fingerprint`
      AND quote.`shipping_address_json` = NEW.`shipping_address_json`
      AND quote.`amount_cents` = NEW.`shipping_cents`
      AND quote.`currency` = NEW.`currency`
      AND json_extract(quote.`shipping_address_json`, '$.countryCode') = NEW.`shipping_country_code`
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_quote_mismatch');
END;--> statement-breakpoint

CREATE TRIGGER `trg_orders_lock_shipping_snapshot`
BEFORE UPDATE ON `orders`
WHEN OLD.`shipping_quote_id` IS NOT NEW.`shipping_quote_id`
  OR OLD.`shipping_address_fingerprint` IS NOT NEW.`shipping_address_fingerprint`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_quote_mismatch');
END;--> statement-breakpoint

CREATE TRIGGER `trg_shipments_validate_insert`
BEFORE INSERT ON `shipments`
WHEN NEW.`status` <> 'label_pending' OR NEW.`attempts` <> 0
  OR NEW.`max_attempts` <> 5 OR NEW.`last_error_code` IS NOT NULL
  OR NEW.`provider_shipment_reference` IS NOT NULL
  OR NEW.`tracking_provider_code` IS NOT NULL OR NEW.`tracking_reference` IS NOT NULL
  OR NEW.`provider_receipt_fingerprint` IS NOT NULL
  OR NEW.`lease_token_hash` IS NOT NULL OR NEW.`leased_at` IS NOT NULL
  OR NEW.`lease_expires_at` IS NOT NULL OR NEW.`label_created_at` IS NOT NULL
  OR NEW.`handed_over_at` IS NOT NULL OR NEW.`delivered_at` IS NOT NULL
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR NEW.`updated_at` <> NEW.`created_at`
  OR NOT EXISTS (
    SELECT 1 FROM `orders` AS customer_order
    INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
    WHERE customer_order.`id` = NEW.`order_id`
      AND customer_order.`shipping_quote_id` = NEW.`shipping_quote_id`
      AND customer_order.`status` = 'paid' AND customer_order.`paid_at` IS NOT NULL
      AND payment.`status` = 'succeeded'
      AND payment.`amount_cents` = customer_order.`total_cents`
      AND payment.`currency` = customer_order.`currency`
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_order_not_paid');
END;--> statement-breakpoint

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
END;--> statement-breakpoint

CREATE TRIGGER `trg_shipments_lock_identity`
BEFORE UPDATE ON `shipments`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`order_id` IS NOT NEW.`order_id`
  OR OLD.`shipping_quote_id` IS NOT NEW.`shipping_quote_id`
  OR OLD.`idempotency_key` IS NOT NEW.`idempotency_key`
  OR OLD.`created_at` IS NOT NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at` < OLD.`updated_at`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_invalid_transition');
END;--> statement-breakpoint

CREATE TRIGGER `trg_shipments_lock_proof_and_state_shape`
BEFORE UPDATE ON `shipments`
WHEN OLD.`max_attempts` IS NOT NEW.`max_attempts`
  OR (OLD.`provider_shipment_reference` IS NOT NULL
    AND OLD.`provider_shipment_reference` IS NOT NEW.`provider_shipment_reference`)
  OR (OLD.`tracking_provider_code` IS NOT NULL
    AND OLD.`tracking_provider_code` IS NOT NEW.`tracking_provider_code`)
  OR (OLD.`tracking_reference` IS NOT NULL
    AND OLD.`tracking_reference` IS NOT NEW.`tracking_reference`)
  OR (OLD.`provider_receipt_fingerprint` IS NOT NULL
    AND OLD.`provider_receipt_fingerprint` IS NOT NEW.`provider_receipt_fingerprint`)
  OR (OLD.`label_created_at` IS NOT NULL AND OLD.`label_created_at` IS NOT NEW.`label_created_at`)
  OR (OLD.`handed_over_at` IS NOT NULL AND OLD.`handed_over_at` IS NOT NEW.`handed_over_at`)
  OR (OLD.`delivered_at` IS NOT NULL AND OLD.`delivered_at` IS NOT NEW.`delivered_at`)
  OR (NEW.`leased_at` IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`leased_at`) IS NOT NEW.`leased_at`)
  OR (NEW.`lease_expires_at` IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`lease_expires_at`) IS NOT NEW.`lease_expires_at`)
  OR (NEW.`label_created_at` IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`label_created_at`) IS NOT NEW.`label_created_at`)
  OR (NEW.`handed_over_at` IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`handed_over_at`) IS NOT NEW.`handed_over_at`)
  OR (NEW.`delivered_at` IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`delivered_at`) IS NOT NEW.`delivered_at`)
  OR CASE NEW.`status`
    WHEN 'label_pending' THEN NOT (
      NEW.`attempts` = 0 AND NEW.`provider_shipment_reference` IS NULL
      AND NEW.`tracking_provider_code` IS NULL AND NEW.`tracking_reference` IS NULL
      AND NEW.`provider_receipt_fingerprint` IS NULL
      AND NEW.`lease_token_hash` IS NULL AND NEW.`leased_at` IS NULL
      AND NEW.`lease_expires_at` IS NULL AND NEW.`label_created_at` IS NULL
      AND NEW.`handed_over_at` IS NULL AND NEW.`delivered_at` IS NULL
      AND NEW.`last_error_code` IS NULL
    )
    WHEN 'label_claimed' THEN NOT (
      NEW.`provider_shipment_reference` IS NULL AND NEW.`tracking_provider_code` IS NULL
      AND NEW.`tracking_reference` IS NULL
      AND NEW.`provider_receipt_fingerprint` IS NULL AND NEW.`lease_token_hash` IS NOT NULL
      AND length(NEW.`lease_token_hash`) = 64
      AND NEW.`lease_token_hash` = lower(NEW.`lease_token_hash`)
      AND NEW.`lease_token_hash` NOT GLOB '*[^0-9a-f]*'
      AND NEW.`leased_at` IS NOT NULL
      AND NEW.`lease_expires_at` > NEW.`leased_at` AND NEW.`label_created_at` IS NULL
      AND NEW.`handed_over_at` IS NULL AND NEW.`delivered_at` IS NULL
      AND NEW.`last_error_code` IS NULL
    )
    WHEN 'label_ready' THEN NOT (
      NEW.`provider_shipment_reference` IS NOT NULL AND NEW.`tracking_provider_code` IS NOT NULL
      AND NEW.`tracking_reference` IS NOT NULL
      AND NEW.`provider_receipt_fingerprint` IS NOT NULL AND NEW.`lease_token_hash` IS NULL
      AND NEW.`leased_at` IS NULL AND NEW.`lease_expires_at` IS NULL
      AND NEW.`label_created_at` IS NOT NULL AND NEW.`handed_over_at` IS NULL
      AND NEW.`delivered_at` IS NULL AND NEW.`last_error_code` IS NULL
    )
    WHEN 'handed_over' THEN NOT (
      NEW.`provider_shipment_reference` IS NOT NULL AND NEW.`tracking_provider_code` IS NOT NULL
      AND NEW.`tracking_reference` IS NOT NULL
      AND NEW.`provider_receipt_fingerprint` IS NOT NULL AND NEW.`lease_token_hash` IS NULL
      AND NEW.`leased_at` IS NULL AND NEW.`lease_expires_at` IS NULL
      AND NEW.`label_created_at` IS NOT NULL AND NEW.`handed_over_at` IS NOT NULL
      AND NEW.`delivered_at` IS NULL AND NEW.`last_error_code` IS NULL
    )
    WHEN 'in_transit' THEN NOT (
      NEW.`provider_shipment_reference` IS NOT NULL AND NEW.`tracking_provider_code` IS NOT NULL
      AND NEW.`tracking_reference` IS NOT NULL
      AND NEW.`provider_receipt_fingerprint` IS NOT NULL AND NEW.`lease_token_hash` IS NULL
      AND NEW.`leased_at` IS NULL AND NEW.`lease_expires_at` IS NULL
      AND NEW.`label_created_at` IS NOT NULL AND NEW.`handed_over_at` IS NOT NULL
      AND NEW.`delivered_at` IS NULL AND NEW.`last_error_code` IS NULL
    )
    WHEN 'delivered' THEN NOT (
      NEW.`provider_shipment_reference` IS NOT NULL AND NEW.`tracking_provider_code` IS NOT NULL
      AND NEW.`tracking_reference` IS NOT NULL
      AND NEW.`provider_receipt_fingerprint` IS NOT NULL AND NEW.`lease_token_hash` IS NULL
      AND NEW.`leased_at` IS NULL AND NEW.`lease_expires_at` IS NULL
      AND NEW.`label_created_at` IS NOT NULL AND NEW.`handed_over_at` IS NOT NULL
      AND NEW.`delivered_at` IS NOT NULL AND NEW.`last_error_code` IS NULL
    )
    WHEN 'failed' THEN NOT (
      NEW.`provider_shipment_reference` IS NULL AND NEW.`tracking_provider_code` IS NULL
      AND NEW.`tracking_reference` IS NULL
      AND NEW.`provider_receipt_fingerprint` IS NULL AND NEW.`lease_token_hash` IS NULL
      AND NEW.`leased_at` IS NULL AND NEW.`lease_expires_at` IS NULL
      AND NEW.`label_created_at` IS NULL AND NEW.`handed_over_at` IS NULL
      AND NEW.`delivered_at` IS NULL AND NEW.`last_error_code` = 'provider_rejected'
    )
    ELSE 1
  END
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_invalid_transition');
END;--> statement-breakpoint

CREATE TRIGGER `trg_shipments_retain`
BEFORE DELETE ON `shipments`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_shipment_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_customs_records_validate_insert`
BEFORE INSERT ON `customs_records`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR NEW.`updated_at` <> NEW.`created_at`
  OR NEW.`status` NOT IN ('pending', 'ready')
  OR (NEW.`status` = 'pending' AND (
    NEW.`manual_reference` IS NOT NULL OR NEW.`record_fingerprint` IS NOT NULL
    OR NEW.`ready_at` IS NOT NULL
  ))
  OR (NEW.`status` = 'ready' AND (
    NEW.`manual_reference` IS NULL OR NEW.`record_fingerprint` IS NULL
    OR NEW.`ready_at` IS NULL
    OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`ready_at`) IS NOT NEW.`ready_at`
  ))
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_customs_record_invalid');
END;--> statement-breakpoint

CREATE TRIGGER `trg_customs_records_transition`
BEFORE UPDATE ON `customs_records`
WHEN NOT (
  OLD.`status` = 'pending' AND NEW.`status` IN ('ready', 'blocked')
  AND OLD.`id` IS NEW.`id` AND OLD.`shipment_id` IS NEW.`shipment_id`
  AND OLD.`created_at` IS NEW.`created_at`
  AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NEW.`updated_at`
  AND NEW.`updated_at` >= OLD.`updated_at`
  AND (
    (NEW.`status` = 'ready' AND NEW.`manual_reference` IS NOT NULL
      AND NEW.`record_fingerprint` IS NOT NULL AND NEW.`ready_at` IS NOT NULL)
    OR (NEW.`status` = 'blocked' AND NEW.`ready_at` IS NULL)
  )
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_invalid_transition');
END;--> statement-breakpoint

CREATE TRIGGER `trg_customs_records_retain`
BEFORE DELETE ON `customs_records`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_customs_record_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_carrier_receipts_validate_insert`
BEFORE INSERT ON `carrier_event_receipts`
WHEN NEW.`status` <> 'verified' OR NEW.`consumed_at` IS NOT NULL
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`occurred_at`) IS NOT NEW.`occurred_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`received_at`) IS NOT NEW.`received_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`verified_at`) IS NOT NEW.`verified_at`
  OR NEW.`received_at` < NEW.`occurred_at`
  OR NEW.`verified_at` < NEW.`received_at`
  OR NOT EXISTS (
    SELECT 1 FROM `shipments` AS shipment
    WHERE shipment.`id` = NEW.`shipment_id`
      AND shipment.`tracking_provider_code` = NEW.`provider_code`
      AND shipment.`tracking_reference` = NEW.`tracking_reference`
      AND shipment.`status` IN ('handed_over', 'in_transit', 'delivered')
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_tracking_event_conflict');
END;--> statement-breakpoint

CREATE TRIGGER `trg_carrier_receipts_transition`
BEFORE UPDATE ON `carrier_event_receipts`
WHEN NOT (
  OLD.`status` = 'verified' AND NEW.`status` = 'consumed'
  AND OLD.`id` IS NEW.`id` AND OLD.`shipment_id` IS NEW.`shipment_id`
  AND OLD.`provider_code` IS NEW.`provider_code`
  AND OLD.`provider_event_id` IS NEW.`provider_event_id`
  AND OLD.`tracking_reference` IS NEW.`tracking_reference`
  AND OLD.`event_type` IS NEW.`event_type`
  AND OLD.`event_fingerprint` IS NEW.`event_fingerprint`
  AND OLD.`receipt_fingerprint` IS NEW.`receipt_fingerprint`
  AND OLD.`verification_method` IS NEW.`verification_method`
  AND OLD.`occurred_at` IS NEW.`occurred_at`
  AND OLD.`received_at` IS NEW.`received_at`
  AND OLD.`verified_at` IS NEW.`verified_at`
  AND NEW.`consumed_at` = OLD.`received_at`
  AND EXISTS (
    SELECT 1 FROM `shipment_tracking_events` AS event
    WHERE event.`carrier_receipt_id` = OLD.`id`
      AND event.`shipment_id` = OLD.`shipment_id`
      AND event.`provider_code` = OLD.`provider_code`
      AND event.`provider_event_id` = OLD.`provider_event_id`
      AND event.`tracking_reference` = OLD.`tracking_reference`
      AND event.`event_type` = OLD.`event_type`
      AND event.`event_fingerprint` = OLD.`event_fingerprint`
      AND event.`occurred_at` = OLD.`occurred_at`
      AND event.`received_at` = OLD.`received_at`
  )
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_tracking_event_conflict');
END;--> statement-breakpoint

CREATE TRIGGER `trg_carrier_receipts_retain`
BEFORE DELETE ON `carrier_event_receipts`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_tracking_event_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_tracking_events_validate_insert`
BEFORE INSERT ON `shipment_tracking_events`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`occurred_at`) IS NOT NEW.`occurred_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`received_at`) IS NOT NEW.`received_at`
  OR NEW.`received_at` < NEW.`occurred_at`
  OR NOT EXISTS (
    SELECT 1 FROM `shipments` AS shipment
    WHERE shipment.`id` = NEW.`shipment_id`
      AND shipment.`tracking_reference` IS NOT NULL
      AND (
        (NEW.`event_type` = 'handed_over'
          AND NEW.`provider_code` = 'internal_handover'
          AND NEW.`provider_event_id` = NEW.`id`
          AND NEW.`carrier_receipt_id` IS NULL
          AND NEW.`tracking_reference` = shipment.`tracking_reference`
          AND shipment.`status` = 'label_ready')
        OR (NEW.`event_type` <> 'handed_over'
          AND NEW.`provider_code` <> 'internal_handover'
          AND NEW.`carrier_receipt_id` IS NOT NULL
          AND NEW.`provider_code` = shipment.`tracking_provider_code`
          AND NEW.`tracking_reference` = shipment.`tracking_reference`
          AND shipment.`status` IN ('handed_over', 'in_transit', 'delivered')
          AND EXISTS (
            SELECT 1 FROM `carrier_event_receipts` AS receipt
            WHERE receipt.`id` = NEW.`carrier_receipt_id`
              AND receipt.`shipment_id` = NEW.`shipment_id`
              AND receipt.`provider_code` = NEW.`provider_code`
              AND receipt.`provider_event_id` = NEW.`provider_event_id`
              AND receipt.`tracking_reference` = NEW.`tracking_reference`
              AND receipt.`event_type` = NEW.`event_type`
              AND receipt.`event_fingerprint` = NEW.`event_fingerprint`
              AND receipt.`occurred_at` = NEW.`occurred_at`
              AND receipt.`received_at` = NEW.`received_at`
              AND (
                receipt.`status` = 'verified'
                OR (receipt.`status` = 'consumed' AND EXISTS (
                  SELECT 1 FROM `shipment_tracking_events` AS replay
                  WHERE replay.`carrier_receipt_id` = receipt.`id`
                    AND replay.`shipment_id` = NEW.`shipment_id`
                    AND replay.`provider_code` = NEW.`provider_code`
                    AND replay.`provider_event_id` = NEW.`provider_event_id`
                    AND replay.`tracking_reference` = NEW.`tracking_reference`
                    AND replay.`event_type` = NEW.`event_type`
                    AND replay.`event_fingerprint` = NEW.`event_fingerprint`
                    AND replay.`occurred_at` = NEW.`occurred_at`
                    AND replay.`received_at` = NEW.`received_at`
                ))
              )
          ))
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_tracking_event_conflict');
END;--> statement-breakpoint

CREATE TRIGGER `trg_tracking_events_consume_receipt`
AFTER INSERT ON `shipment_tracking_events`
WHEN NEW.`carrier_receipt_id` IS NOT NULL
BEGIN
  UPDATE `carrier_event_receipts`
  SET `status` = 'consumed', `consumed_at` = NEW.`received_at`
  WHERE `id` = NEW.`carrier_receipt_id` AND `status` = 'verified';
  SELECT RAISE(ABORT, 'fulfillment_tracking_event_conflict') WHERE NOT EXISTS (
    SELECT 1 FROM `carrier_event_receipts` AS receipt
    WHERE receipt.`id` = NEW.`carrier_receipt_id`
      AND receipt.`status` = 'consumed'
      AND receipt.`consumed_at` = NEW.`received_at`
      AND receipt.`shipment_id` = NEW.`shipment_id`
      AND receipt.`provider_code` = NEW.`provider_code`
      AND receipt.`provider_event_id` = NEW.`provider_event_id`
      AND receipt.`tracking_reference` = NEW.`tracking_reference`
      AND receipt.`event_type` = NEW.`event_type`
      AND receipt.`event_fingerprint` = NEW.`event_fingerprint`
      AND receipt.`occurred_at` = NEW.`occurred_at`
      AND receipt.`received_at` = NEW.`received_at`
  );
END;--> statement-breakpoint

CREATE TRIGGER `trg_tracking_events_immutable_update`
BEFORE UPDATE ON `shipment_tracking_events`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_tracking_event_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_tracking_events_retain`
BEFORE DELETE ON `shipment_tracking_events`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_tracking_event_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_return_requests_validate_insert`
BEFORE INSERT ON `return_requests`
WHEN NEW.`status` <> 'received' OR NEW.`resolution` <> 'pending'
  OR NEW.`resolved_at` IS NOT NULL
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`requested_at`) IS NOT NEW.`requested_at`
  OR NEW.`created_at` <> NEW.`requested_at`
  OR NEW.`updated_at` <> NEW.`created_at`
  OR (
    NEW.`source` = 'customer' AND NOT EXISTS (
      SELECT 1 FROM `orders`
      WHERE `id` = NEW.`order_id` AND `customer_id` = NEW.`actor_customer_id`
    )
  )
  OR (
    NEW.`source` = 'guest' AND NOT EXISTS (
      SELECT 1 FROM `guest_order_sessions` AS session
      INNER JOIN `orders` AS customer_order ON customer_order.`id` = session.`order_id`
      WHERE session.`id` = NEW.`guest_order_session_id`
        AND session.`order_id` = NEW.`order_id`
        AND session.`revoked_at` IS NULL
        AND session.`expires_at` > NEW.`requested_at`
        AND session.`idle_expires_at` > NEW.`requested_at`
        AND customer_order.`customer_id` IS NULL
    )
  )
  OR (
    NEW.`source` = 'admin' AND NOT EXISTS (
      SELECT 1 FROM `administrators`
      WHERE `id` = NEW.`actor_admin_id` AND `enabled` = 1
        AND `role` IN ('owner', 'operations')
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_return_session_invalid');
END;--> statement-breakpoint

CREATE TRIGGER `trg_return_requests_transition`
BEFORE UPDATE ON `return_requests`
WHEN NOT (
  OLD.`status` IN ('received', 'approved', 'goods_received')
  AND NEW.`status` = 'inspected' AND NEW.`resolution` = 'pending'
  AND NEW.`resolved_at` IS NULL
  AND OLD.`declared_line_count` = (
    SELECT COUNT(*) FROM `return_lines` WHERE `return_request_id` = OLD.`id`
  )
  AND NOT EXISTS (
    SELECT 1 FROM `return_lines`
    WHERE `return_request_id` = OLD.`id` AND `inspection_result` <> 'complete'
  )
  AND NOT EXISTS (
    SELECT 1 FROM `return_lines` AS return_line
    INNER JOIN `order_lines` AS order_line ON order_line.`id` = return_line.`order_line_id`
    WHERE return_line.`return_request_id` = OLD.`id`
      AND return_line.`restocked_quantity` > 0
      AND order_line.`variant_id` IS NULL
  )
) AND NOT (
  OLD.`status` = 'inspected' AND NEW.`status` = 'resolved'
  AND NEW.`resolution` IN ('refund', 'no_refund')
  AND NEW.`resolved_at` IS NOT NULL
) AND NOT (
  OLD.`status` IN ('received', 'approved', 'goods_received')
  AND NEW.`status` IN ('rejected', 'cancelled')
  AND NEW.`resolution` IN ('rejected', 'no_refund')
  AND NEW.`resolved_at` IS NOT NULL
) AND NOT (
  OLD.`status` = 'received' AND NEW.`status` IN ('approved', 'goods_received')
  AND NEW.`resolution` = 'pending' AND NEW.`resolved_at` IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_invalid_transition');
END;--> statement-breakpoint

CREATE TRIGGER `trg_return_requests_require_lines_for_inspection`
BEFORE UPDATE OF `status` ON `return_requests`
WHEN NEW.`status` = 'inspected'
  AND OLD.`declared_line_count` <> (
    SELECT COUNT(*) FROM `return_lines` WHERE `return_request_id` = OLD.`id`
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_inspection_incomplete');
END;--> statement-breakpoint

CREATE TRIGGER `trg_return_requests_lock_identity`
BEFORE UPDATE ON `return_requests`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`order_id` IS NOT NEW.`order_id`
  OR OLD.`kind` IS NOT NEW.`kind` OR OLD.`source` IS NOT NEW.`source`
  OR OLD.`actor_customer_id` IS NOT NEW.`actor_customer_id`
  OR OLD.`guest_order_session_id` IS NOT NEW.`guest_order_session_id`
  OR OLD.`actor_admin_id` IS NOT NEW.`actor_admin_id`
  OR OLD.`declaration_fingerprint` IS NOT NEW.`declaration_fingerprint`
  OR OLD.`declared_line_count` IS NOT NEW.`declared_line_count`
  OR OLD.`requested_at` IS NOT NEW.`requested_at`
  OR OLD.`created_at` IS NOT NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at` < OLD.`updated_at`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_return_request_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_return_requests_retain`
BEFORE DELETE ON `return_requests`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_return_request_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_return_lines_validate_insert`
BEFORE INSERT ON `return_lines`
WHEN NEW.`inspection_result` <> 'pending'
  OR NEW.`received_quantity` <> 0 OR NEW.`sellable_quantity` <> 0
  OR NEW.`non_sellable_quantity` <> 0 OR NEW.`restocked_quantity` <> 0
  OR NEW.`updated_at` <> NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR NOT EXISTS (
    SELECT 1 FROM `return_requests` AS request
    INNER JOIN `order_lines` AS order_line ON order_line.`order_id` = request.`order_id`
    WHERE request.`id` = NEW.`return_request_id`
      AND order_line.`id` = NEW.`order_line_id`
      AND NEW.`requested_quantity` <= order_line.`quantity`
      AND NEW.`requested_quantity` + COALESCE((
        SELECT SUM(existing.`requested_quantity`)
        FROM `return_lines` AS existing
        INNER JOIN `return_requests` AS existing_request
          ON existing_request.`id` = existing.`return_request_id`
        WHERE existing.`order_line_id` = NEW.`order_line_id`
          AND existing_request.`status` NOT IN ('rejected', 'cancelled')
      ), 0) <= order_line.`quantity`
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_return_quantity_exceeded');
END;--> statement-breakpoint

CREATE TRIGGER `trg_return_lines_declaration_sealed`
BEFORE INSERT ON `return_lines`
WHEN EXISTS (
  SELECT 1 FROM `return_requests` AS request
  WHERE request.`id` = NEW.`return_request_id`
    AND (
      request.`status` <> 'received'
      OR request.`declared_line_count` <= (
        SELECT COUNT(*) FROM `return_lines`
        WHERE `return_request_id` = request.`id`
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_return_declaration_sealed');
END;--> statement-breakpoint

CREATE TRIGGER `trg_return_lines_complete_once`
BEFORE UPDATE ON `return_lines`
WHEN NOT (
  OLD.`inspection_result` = 'pending' AND NEW.`inspection_result` = 'complete'
  AND OLD.`id` IS NEW.`id`
  AND OLD.`return_request_id` IS NEW.`return_request_id`
  AND OLD.`order_line_id` IS NEW.`order_line_id`
  AND OLD.`requested_quantity` IS NEW.`requested_quantity`
  AND OLD.`created_at` IS NEW.`created_at`
  AND NEW.`received_quantity` <= NEW.`requested_quantity`
  AND NEW.`sellable_quantity` + NEW.`non_sellable_quantity` = NEW.`received_quantity`
  AND NEW.`restocked_quantity` <= NEW.`sellable_quantity`
  AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NEW.`updated_at`
  AND NEW.`updated_at` >= OLD.`updated_at`
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_invalid_transition');
END;--> statement-breakpoint

CREATE TRIGGER `trg_return_lines_retain`
BEFORE DELETE ON `return_lines`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_return_line_is_immutable');
END;--> statement-breakpoint

CREATE UNIQUE INDEX `ux_inventory_movements_return_restock`
ON `inventory_movements` (`reference_id`)
WHERE `kind` = 'adjustment' AND `reference_type` = 'physical_increase'
  AND `idempotency_key` LIKE 'return-restock:%';--> statement-breakpoint

CREATE TRIGGER `trg_inventory_movements_validate_return_restock`
BEFORE INSERT ON `inventory_movements`
WHEN NEW.`reference_type` = 'physical_increase'
  AND EXISTS (SELECT 1 FROM `return_lines` WHERE `id` = NEW.`reference_id`)
  AND NOT EXISTS (
    SELECT 1 FROM `return_lines` AS return_line
    INNER JOIN `return_requests` AS request
      ON request.`id` = return_line.`return_request_id`
    INNER JOIN `order_lines` AS order_line ON order_line.`id` = return_line.`order_line_id`
    WHERE return_line.`id` = NEW.`reference_id`
      AND request.`status` = 'inspected'
      AND return_line.`inspection_result` = 'complete'
      AND return_line.`restocked_quantity` = NEW.`quantity`
      AND return_line.`restocked_quantity` > 0
      AND order_line.`variant_id` = NEW.`variant_id`
      AND NEW.`kind` = 'adjustment'
      AND NEW.`actor_type` = 'system' AND NEW.`actor_id` IS NULL
      AND NEW.`id` = 'movement_return_' || return_line.`id`
      AND NEW.`idempotency_key` = 'return-restock:' || return_line.`id`
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_restock_movement_invalid');
END;--> statement-breakpoint

CREATE TRIGGER `trg_return_requests_apply_restock`
AFTER UPDATE OF `status` ON `return_requests`
WHEN OLD.`status` <> 'inspected' AND NEW.`status` = 'inspected'
BEGIN
  INSERT INTO `inventory_movements` (
    `id`, `variant_id`, `kind`, `quantity`, `reference_type`, `reference_id`,
    `actor_type`, `actor_id`, `idempotency_key`, `created_at`
  )
  SELECT 'movement_return_' || return_line.`id`, order_line.`variant_id`,
    'adjustment', return_line.`restocked_quantity`, 'physical_increase',
    return_line.`id`, 'system', NULL, 'return-restock:' || return_line.`id`,
    NEW.`updated_at`
  FROM `return_lines` AS return_line
  INNER JOIN `order_lines` AS order_line ON order_line.`id` = return_line.`order_line_id`
  WHERE return_line.`return_request_id` = NEW.`id`
    AND return_line.`inspection_result` = 'complete'
    AND return_line.`restocked_quantity` > 0;
END;--> statement-breakpoint

CREATE TRIGGER `trg_refunds_validate_insert`
BEFORE INSERT ON `refunds`
WHEN NEW.`status` <> 'pending' OR NEW.`attempts` <> 0
  OR NEW.`max_attempts` <> 5 OR NEW.`last_error_code` IS NOT NULL
  OR NEW.`lease_token_hash` IS NOT NULL OR NEW.`leased_at` IS NOT NULL
  OR NEW.`lease_expires_at` IS NOT NULL
  OR NEW.`provider_refund_reference` IS NOT NULL
  OR NEW.`provider_receipt_fingerprint` IS NOT NULL
  OR NEW.`succeeded_at` IS NOT NULL
  OR NEW.`updated_at` <> NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR NOT EXISTS (
    SELECT 1 FROM `payments` AS payment
    INNER JOIN `return_requests` AS request ON request.`id` = NEW.`return_request_id`
    WHERE payment.`id` = NEW.`payment_id` AND payment.`status` = 'succeeded'
      AND payment.`currency` = NEW.`currency`
      AND payment.`order_id` = request.`order_id`
      AND (
        request.`status` = 'inspected'
        OR (request.`status` = 'resolved' AND request.`resolution` = 'refund')
      )
      AND request.`kind` = NEW.`reason`
      AND EXISTS (
        SELECT 1 FROM `return_lines`
        WHERE `return_request_id` = request.`id`
      )
      AND NEW.`amount_cents` <= payment.`amount_cents`
  )
  OR NEW.`amount_cents` + COALESCE((
    SELECT SUM(existing.`amount_cents`) FROM `refunds` AS existing
    WHERE existing.`payment_id` = NEW.`payment_id`
      AND existing.`status` IN ('pending', 'claimed', 'succeeded')
  ), 0) > (
    SELECT `amount_cents` FROM `payments` WHERE `id` = NEW.`payment_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_refund_limit_exceeded');
END;--> statement-breakpoint

CREATE TRIGGER `trg_refunds_validate_transition`
BEFORE UPDATE ON `refunds`
WHEN NOT (
  OLD.`status` = 'pending' AND NEW.`status` = 'claimed'
  AND NEW.`attempts` = OLD.`attempts` + 1
  AND NEW.`lease_token_hash` IS NOT NULL AND length(NEW.`lease_token_hash`) = 64
  AND NEW.`leased_at` IS NOT NULL AND NEW.`lease_expires_at` > NEW.`leased_at`
  AND NEW.`leased_at` = NEW.`updated_at`
  AND NEW.`leased_at` <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 seconds')
  AND CAST(strftime('%s', NEW.`lease_expires_at`) AS integer)
    - CAST(strftime('%s', NEW.`leased_at`) AS integer) BETWEEN 30 AND 900
  AND NEW.`provider_refund_reference` IS NULL
  AND NEW.`provider_receipt_fingerprint` IS NULL
  AND NEW.`succeeded_at` IS NULL
) AND NOT (
  OLD.`status` = 'claimed' AND NEW.`status` = 'claimed'
  AND OLD.`lease_expires_at` <= NEW.`leased_at`
  AND OLD.`lease_expires_at` <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  AND NEW.`attempts` = OLD.`attempts` + 1
  AND NEW.`lease_token_hash` IS NOT NULL
  AND NEW.`lease_expires_at` > NEW.`leased_at`
  AND NEW.`leased_at` = NEW.`updated_at`
  AND NEW.`leased_at` <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 seconds')
  AND CAST(strftime('%s', NEW.`lease_expires_at`) AS integer)
    - CAST(strftime('%s', NEW.`leased_at`) AS integer) BETWEEN 30 AND 900
) AND NOT (
  OLD.`status` = 'claimed' AND NEW.`status` = 'succeeded'
  AND NEW.`attempts` = OLD.`attempts`
  AND NEW.`provider_refund_reference` IS NOT NULL
  AND NEW.`provider_receipt_fingerprint` IS NOT NULL
  AND NEW.`succeeded_at` IS NOT NULL
  AND NEW.`lease_token_hash` IS NULL AND NEW.`leased_at` IS NULL
  AND NEW.`lease_expires_at` IS NULL
  AND EXISTS (
    SELECT 1 FROM `return_requests` AS request
    WHERE request.`id` = OLD.`return_request_id`
      AND (
        request.`status` = 'inspected'
        OR (request.`status` = 'resolved' AND request.`resolution` = 'refund')
      )
  )
) AND NOT (
  OLD.`status` = 'claimed' AND NEW.`status` = 'failed'
  AND NEW.`attempts` = OLD.`attempts`
  AND NEW.`last_error_code` = 'provider_rejected'
  AND NEW.`lease_token_hash` IS NULL AND NEW.`leased_at` IS NULL
  AND NEW.`lease_expires_at` IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_invalid_transition');
END;--> statement-breakpoint

CREATE TRIGGER `trg_refunds_lock_identity_and_cap`
BEFORE UPDATE ON `refunds`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`payment_id` IS NOT NEW.`payment_id`
  OR OLD.`return_request_id` IS NOT NEW.`return_request_id`
  OR OLD.`reason` IS NOT NEW.`reason` OR OLD.`amount_cents` IS NOT NEW.`amount_cents`
  OR OLD.`currency` IS NOT NEW.`currency`
  OR OLD.`idempotency_key` IS NOT NEW.`idempotency_key`
  OR OLD.`created_at` IS NOT NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at` < OLD.`updated_at`
  OR (
    NEW.`status` IN ('pending', 'claimed', 'succeeded')
    AND NEW.`amount_cents` + COALESCE((
      SELECT SUM(existing.`amount_cents`) FROM `refunds` AS existing
      WHERE existing.`payment_id` = NEW.`payment_id`
        AND existing.`id` <> OLD.`id`
        AND existing.`status` IN ('pending', 'claimed', 'succeeded')
    ), 0) > (
      SELECT `amount_cents` FROM `payments` WHERE `id` = NEW.`payment_id`
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_refund_limit_exceeded');
END;--> statement-breakpoint

CREATE TRIGGER `trg_refunds_lock_proof_and_state_shape`
BEFORE UPDATE ON `refunds`
WHEN OLD.`max_attempts` IS NOT NEW.`max_attempts`
  OR (OLD.`provider_refund_reference` IS NOT NULL
    AND OLD.`provider_refund_reference` IS NOT NEW.`provider_refund_reference`)
  OR (OLD.`provider_receipt_fingerprint` IS NOT NULL
    AND OLD.`provider_receipt_fingerprint` IS NOT NEW.`provider_receipt_fingerprint`)
  OR (OLD.`succeeded_at` IS NOT NULL AND OLD.`succeeded_at` IS NOT NEW.`succeeded_at`)
  OR (NEW.`leased_at` IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`leased_at`) IS NOT NEW.`leased_at`)
  OR (NEW.`lease_expires_at` IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`lease_expires_at`) IS NOT NEW.`lease_expires_at`)
  OR (NEW.`succeeded_at` IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`succeeded_at`) IS NOT NEW.`succeeded_at`)
  OR CASE NEW.`status`
    WHEN 'pending' THEN NOT (
      NEW.`attempts` = 0 AND NEW.`lease_token_hash` IS NULL
      AND NEW.`leased_at` IS NULL AND NEW.`lease_expires_at` IS NULL
      AND NEW.`provider_refund_reference` IS NULL
      AND NEW.`provider_receipt_fingerprint` IS NULL
      AND NEW.`succeeded_at` IS NULL AND NEW.`last_error_code` IS NULL
    )
    WHEN 'claimed' THEN NOT (
      NEW.`lease_token_hash` IS NOT NULL AND length(NEW.`lease_token_hash`) = 64
      AND NEW.`lease_token_hash` = lower(NEW.`lease_token_hash`)
      AND NEW.`lease_token_hash` NOT GLOB '*[^0-9a-f]*'
      AND NEW.`leased_at` IS NOT NULL AND NEW.`lease_expires_at` > NEW.`leased_at`
      AND NEW.`provider_refund_reference` IS NULL
      AND NEW.`provider_receipt_fingerprint` IS NULL
      AND NEW.`succeeded_at` IS NULL AND NEW.`last_error_code` IS NULL
    )
    WHEN 'succeeded' THEN NOT (
      NEW.`lease_token_hash` IS NULL AND NEW.`leased_at` IS NULL
      AND NEW.`lease_expires_at` IS NULL AND NEW.`provider_refund_reference` IS NOT NULL
      AND NEW.`provider_receipt_fingerprint` IS NOT NULL
      AND NEW.`succeeded_at` IS NOT NULL AND NEW.`last_error_code` IS NULL
    )
    WHEN 'failed' THEN NOT (
      NEW.`lease_token_hash` IS NULL AND NEW.`leased_at` IS NULL
      AND NEW.`lease_expires_at` IS NULL AND NEW.`provider_refund_reference` IS NULL
      AND NEW.`provider_receipt_fingerprint` IS NULL
      AND NEW.`succeeded_at` IS NULL AND NEW.`last_error_code` = 'provider_rejected'
    )
    ELSE 1
  END
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_invalid_transition');
END;--> statement-breakpoint

CREATE TRIGGER `trg_refunds_retain`
BEFORE DELETE ON `refunds`
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_refund_is_immutable');
END;--> statement-breakpoint

DROP TRIGGER `trg_email_outbox_normalize_verified_legacy_insert`;--> statement-breakpoint
DROP TRIGGER `trg_email_outbox_validate_insert`;--> statement-breakpoint
DROP TRIGGER `trg_email_outbox_account_access_insert_disabled`;--> statement-breakpoint
DROP TRIGGER `trg_email_outbox_immutable_identity`;--> statement-breakpoint
DROP TRIGGER `trg_email_outbox_state_transition`;--> statement-breakpoint
DROP TRIGGER `trg_email_outbox_terminal_append_only`;--> statement-breakpoint
DROP TRIGGER `trg_email_outbox_retain_delete`;--> statement-breakpoint
DROP TRIGGER `trg_email_outbox_account_access_lifecycle_disabled`;--> statement-breakpoint
DROP TRIGGER `trg_email_outbox_audit_insert`;--> statement-breakpoint
DROP TRIGGER `trg_email_outbox_audit_terminal`;--> statement-breakpoint
DROP TRIGGER `trg_webhook_events_validate_processed`;--> statement-breakpoint
ALTER TABLE `email_outbox` RENAME TO `email_outbox_legacy_d03`;--> statement-breakpoint

CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`transaction_intent` text DEFAULT 'payment_succeeded' NOT NULL,
	`source_event_id` text DEFAULT 'compat:pending' NOT NULL,
	`recipient_email` text,
	`order_id` text,
	`access_challenge_id` text,
	`locale` text DEFAULT 'fr' NOT NULL,
	`template_version` text NOT NULL,
	`payload_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`next_attempt_at` text,
	`lease_token_hash` text,
	`leased_at` text,
	`lease_expires_at` text,
	`last_error_code` text,
	`idempotency_key` text NOT NULL,
	`provider_idempotency_key` text DEFAULT 'compat:pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text,
	`terminal_at` text,
	`purged_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`access_challenge_id`) REFERENCES `access_challenges`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_email_outbox_kind` CHECK(`kind` IN (
		'payment_confirmation', 'payment_failed', 'shipment_confirmation',
		'refund_confirmation', 'return_acknowledgement',
		'withdrawal_acknowledgement', 'account_access', 'order_confirmation'
	)),
	CONSTRAINT `ck_email_outbox_intent` CHECK(
		(`kind` = 'payment_confirmation' AND `transaction_intent` = 'payment_succeeded')
		OR (`kind` = 'payment_failed' AND `transaction_intent` = 'payment_failed')
		OR (`kind` = 'shipment_confirmation' AND `transaction_intent` = 'shipment_created')
		OR (`kind` = 'refund_confirmation' AND `transaction_intent` = 'refund_succeeded')
		OR (`kind` = 'return_acknowledgement' AND `transaction_intent` = 'return_received')
		OR (`kind` = 'withdrawal_acknowledgement' AND `transaction_intent` = 'withdrawal_received')
		OR (`kind` = 'account_access' AND `transaction_intent` = 'account_access_challenge')
		OR (`kind` = 'order_confirmation' AND `transaction_intent` = 'payment_succeeded')
	),
	CONSTRAINT `ck_email_outbox_status` CHECK(`status` IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
	CONSTRAINT `ck_email_outbox_locale` CHECK(`locale` IN ('fr', 'en')),
	CONSTRAINT `ck_email_outbox_attempts` CHECK(
		`attempts` >= 0 AND `max_attempts` >= 1 AND `attempts` <= `max_attempts`
		AND (`kind` <> 'account_access' OR `max_attempts` = 1)
	),
	CONSTRAINT `ck_email_outbox_error_code` CHECK(`last_error_code` IS NULL OR `last_error_code` IN (
		'provider_rejected', 'delivery_ambiguous', 'attempts_exhausted',
		'legacy_magic_link_invalidated', 'legacy_unverified_payment_intent',
		'legacy_ambiguous_delivery', 'legacy_duplicate_intent'
	)),
	CONSTRAINT `ck_email_outbox_content_purge` CHECK(
		(`purged_at` IS NULL AND `recipient_email` IS NOT NULL AND `payload_json` IS NOT NULL)
		OR (`purged_at` IS NOT NULL AND `recipient_email` IS NULL AND `payload_json` IS NULL
			AND `status` IN ('sent', 'failed', 'cancelled'))
	),
	CONSTRAINT `ck_email_outbox_account_access_historical` CHECK(
		`kind` <> 'account_access' OR (
			`status` IN ('sent', 'failed', 'cancelled') AND `purged_at` IS NOT NULL
			AND `recipient_email` IS NULL AND `payload_json` IS NULL
			AND `next_attempt_at` IS NULL AND `lease_token_hash` IS NULL
			AND `leased_at` IS NULL AND `lease_expires_at` IS NULL
			AND `terminal_at` IS NOT NULL
		)
	),
	CONSTRAINT `ck_email_outbox_state_shape` CHECK(
		(`status` = 'pending' AND `next_attempt_at` IS NOT NULL
			AND `lease_token_hash` IS NULL AND `leased_at` IS NULL AND `lease_expires_at` IS NULL
			AND `sent_at` IS NULL AND `terminal_at` IS NULL)
		OR (`status` = 'sending' AND `attempts` >= 1 AND `next_attempt_at` IS NULL
			AND `lease_token_hash` IS NOT NULL AND `leased_at` IS NOT NULL AND `lease_expires_at` IS NOT NULL
			AND `sent_at` IS NULL AND `terminal_at` IS NULL)
		OR (`status` = 'sent' AND `next_attempt_at` IS NULL
			AND `lease_token_hash` IS NULL AND `leased_at` IS NULL AND `lease_expires_at` IS NULL
			AND `sent_at` IS NOT NULL AND `terminal_at` IS NOT NULL)
		OR (`status` IN ('failed', 'cancelled') AND `next_attempt_at` IS NULL
			AND `lease_token_hash` IS NULL AND `leased_at` IS NULL AND `lease_expires_at` IS NULL
			AND `sent_at` IS NULL AND `terminal_at` IS NOT NULL)
	),
	CONSTRAINT `ck_email_outbox_lease_hash` CHECK(`lease_token_hash` IS NULL OR (
		length(`lease_token_hash`) = 64 AND `lease_token_hash` = lower(`lease_token_hash`)
		AND `lease_token_hash` NOT GLOB '*[^0-9a-f]*'
	))
);--> statement-breakpoint

INSERT INTO `email_outbox` (
	`id`, `kind`, `transaction_intent`, `source_event_id`, `recipient_email`,
	`order_id`, `access_challenge_id`, `locale`, `template_version`, `payload_json`,
	`status`, `attempts`, `max_attempts`, `next_attempt_at`, `lease_token_hash`,
	`leased_at`, `lease_expires_at`, `last_error_code`, `idempotency_key`,
	`provider_idempotency_key`, `created_at`, `updated_at`, `sent_at`, `terminal_at`, `purged_at`
)
SELECT `id`, `kind`, `transaction_intent`, `source_event_id`, `recipient_email`,
	`order_id`, `access_challenge_id`, `locale`, `template_version`, `payload_json`,
	`status`, `attempts`, `max_attempts`, `next_attempt_at`, `lease_token_hash`,
	`leased_at`, `lease_expires_at`, `last_error_code`, `idempotency_key`,
	`provider_idempotency_key`, `created_at`, `updated_at`, `sent_at`, `terminal_at`, `purged_at`
FROM `email_outbox_legacy_d03`;--> statement-breakpoint
DROP TABLE `email_outbox_legacy_d03`;--> statement-breakpoint

CREATE UNIQUE INDEX `ux_email_outbox_idempotency_key` ON `email_outbox` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_intent_source` ON `email_outbox` (`transaction_intent`,`source_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_provider_idempotency_key` ON `email_outbox` (`provider_idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_account_access_challenge` ON `email_outbox` (`access_challenge_id`) WHERE `kind` = 'account_access' AND `access_challenge_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_payment_confirmation_order` ON `email_outbox` (`order_id`) WHERE `kind` = 'payment_confirmation';--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_active_lease` ON `email_outbox` (`lease_token_hash`) WHERE `lease_token_hash` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_email_outbox_claim` ON `email_outbox` (`status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_email_outbox_stale_lease` ON `email_outbox` (`status`,`lease_expires_at`);--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_normalize_verified_legacy_insert`
AFTER INSERT ON `email_outbox`
WHEN NEW.`kind` = 'order_confirmation' AND NEW.`source_event_id` = 'compat:pending'
	AND EXISTS (
		SELECT 1 FROM `orders` AS customer_order
		INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
		WHERE customer_order.`id` = NEW.`order_id`
			AND customer_order.`paid_at` IS NOT NULL
			AND payment.`status` = 'succeeded'
			AND payment.`amount_cents` = customer_order.`total_cents`
			AND payment.`currency` = customer_order.`currency`
	)
BEGIN
	UPDATE `email_outbox` SET `kind` = 'payment_confirmation',
		`source_event_id` = 'payment:' || NEW.`order_id`,
		`provider_idempotency_key` = 'payment_confirmation:' || NEW.`order_id`,
		`updated_at` = NEW.`created_at`
	WHERE `id` = NEW.`id`;
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_validate_insert`
BEFORE INSERT ON `email_outbox`
WHEN NEW.`status` <> 'pending' OR NEW.`attempts` <> 0
	OR NEW.`purged_at` IS NOT NULL
	OR NOT (
		(NEW.`kind` = 'order_confirmation' AND NEW.`source_event_id` = 'compat:pending'
			AND NEW.`provider_idempotency_key` = 'compat:pending')
		OR NEW.`provider_idempotency_key` = CASE
			WHEN NEW.`kind` = 'account_access' THEN 'account_access:' || NEW.`access_challenge_id`
			WHEN NEW.`kind` IN ('payment_confirmation', 'order_confirmation')
				THEN 'payment_confirmation:' || NEW.`order_id`
			ELSE NEW.`kind` || ':' || NEW.`source_event_id`
		END
	)
	OR (NEW.`kind` = 'order_confirmation' AND NEW.`source_event_id` <> 'compat:pending')
	OR (NEW.`kind` = 'account_access' AND NOT EXISTS (
		SELECT 1 FROM `access_challenges` AS challenge
		LEFT JOIN `customers` AS customer ON customer.`id` = challenge.`customer_id`
		LEFT JOIN `orders` AS customer_order ON customer_order.`id` = challenge.`order_id`
		WHERE challenge.`id` = NEW.`access_challenge_id`
			AND challenge.`consumed_at` IS NULL AND challenge.`revoked_at` IS NULL
			AND challenge.`expires_at` > NEW.`created_at`
			AND lower(NEW.`recipient_email`) = lower(COALESCE(customer.`email`, customer_order.`email`))
	))
	OR (NEW.`kind` IN ('payment_confirmation', 'order_confirmation') AND NOT EXISTS (
		SELECT 1 FROM `orders` AS customer_order
		INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
		WHERE customer_order.`id` = NEW.`order_id` AND customer_order.`paid_at` IS NOT NULL
			AND payment.`status` = 'succeeded' AND payment.`amount_cents` = customer_order.`total_cents`
			AND payment.`currency` = customer_order.`currency`
	))
	OR (NEW.`kind` = 'payment_failed' AND NOT EXISTS (
		SELECT 1 FROM `payments` WHERE `order_id` = NEW.`order_id` AND `status` = 'failed'
	))
	OR (NEW.`kind` = 'shipment_confirmation' AND NOT EXISTS (
		SELECT 1 FROM `shipment_tracking_events` AS handover_event
		INNER JOIN `shipments` AS shipment ON shipment.`id` = handover_event.`shipment_id`
		INNER JOIN `orders` AS customer_order ON customer_order.`id` = shipment.`order_id`
		WHERE handover_event.`id` = NEW.`source_event_id`
			AND handover_event.`event_type` = 'handed_over'
			AND shipment.`status` IN ('handed_over', 'in_transit', 'delivered')
			AND customer_order.`id` = NEW.`order_id`
			AND lower(customer_order.`email`) = lower(NEW.`recipient_email`)
	))
	OR (NEW.`kind` = 'refund_confirmation' AND NOT EXISTS (
		SELECT 1 FROM `refunds` AS refund
		INNER JOIN `payments` AS payment ON payment.`id` = refund.`payment_id`
		INNER JOIN `return_requests` AS request ON request.`id` = refund.`return_request_id`
		INNER JOIN `orders` AS customer_order ON customer_order.`id` = request.`order_id`
		WHERE refund.`id` = NEW.`source_event_id` AND refund.`status` = 'succeeded'
			AND payment.`status` = 'succeeded' AND request.`status` = 'resolved'
			AND request.`resolution` = 'refund' AND customer_order.`id` = NEW.`order_id`
			AND lower(customer_order.`email`) = lower(NEW.`recipient_email`)
	))
	OR (NEW.`kind` = 'return_acknowledgement' AND NOT EXISTS (
		SELECT 1 FROM `return_requests` AS request
		INNER JOIN `orders` AS customer_order ON customer_order.`id` = request.`order_id`
		WHERE request.`id` = NEW.`source_event_id` AND request.`kind` = 'return'
			AND customer_order.`id` = NEW.`order_id`
			AND lower(customer_order.`email`) = lower(NEW.`recipient_email`)
	))
	OR (NEW.`kind` = 'withdrawal_acknowledgement' AND NOT EXISTS (
		SELECT 1 FROM `return_requests` AS request
		INNER JOIN `orders` AS customer_order ON customer_order.`id` = request.`order_id`
		WHERE request.`id` = NEW.`source_event_id` AND request.`kind` = 'withdrawal'
			AND customer_order.`id` = NEW.`order_id`
			AND lower(customer_order.`email`) = lower(NEW.`recipient_email`)
	))
BEGIN
	SELECT RAISE(ABORT, 'email_outbox_transaction_intent_not_verified');
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_account_access_insert_disabled`
BEFORE INSERT ON `email_outbox`
WHEN NEW.`kind` = 'account_access'
BEGIN
	SELECT RAISE(ABORT, 'email_outbox_account_access_is_historical_only');
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_immutable_identity`
BEFORE UPDATE ON `email_outbox`
WHEN NOT (
	OLD.`kind` = 'order_confirmation' AND NEW.`kind` = 'payment_confirmation'
	AND OLD.`source_event_id` = 'compat:pending'
	AND NEW.`source_event_id` = 'payment:' || OLD.`order_id`
	AND OLD.`provider_idempotency_key` = 'compat:pending'
	AND NEW.`provider_idempotency_key` = 'payment_confirmation:' || OLD.`order_id`
	AND OLD.`status` = 'pending' AND NEW.`status` = 'pending'
) AND (OLD.`id` IS NOT NEW.`id` OR OLD.`kind` IS NOT NEW.`kind`
	OR OLD.`transaction_intent` IS NOT NEW.`transaction_intent`
	OR OLD.`source_event_id` IS NOT NEW.`source_event_id`
	OR OLD.`order_id` IS NOT NEW.`order_id`
	OR OLD.`access_challenge_id` IS NOT NEW.`access_challenge_id`
	OR OLD.`locale` IS NOT NEW.`locale` OR OLD.`template_version` IS NOT NEW.`template_version`
	OR OLD.`max_attempts` IS NOT NEW.`max_attempts`
	OR OLD.`idempotency_key` IS NOT NEW.`idempotency_key`
	OR OLD.`provider_idempotency_key` IS NOT NEW.`provider_idempotency_key`
	OR OLD.`created_at` IS NOT NEW.`created_at`
	OR (OLD.`purged_at` IS NOT NULL AND (
		OLD.`purged_at` IS NOT NEW.`purged_at` OR NEW.`recipient_email` IS NOT NULL OR NEW.`payload_json` IS NOT NULL
	))
	OR (OLD.`purged_at` IS NULL AND NEW.`purged_at` IS NULL AND (
		OLD.`recipient_email` IS NOT NEW.`recipient_email` OR OLD.`payload_json` IS NOT NEW.`payload_json`
	)))
BEGIN
	SELECT RAISE(ABORT, 'email_outbox_identity_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_state_transition`
BEFORE UPDATE ON `email_outbox`
WHEN NOT (
	(OLD.`kind` = 'order_confirmation' AND NEW.`kind` = 'payment_confirmation'
		AND OLD.`source_event_id` = 'compat:pending'
		AND NEW.`source_event_id` = 'payment:' || OLD.`order_id`
		AND OLD.`provider_idempotency_key` = 'compat:pending'
		AND NEW.`provider_idempotency_key` = 'payment_confirmation:' || OLD.`order_id`
		AND OLD.`status` = 'pending' AND NEW.`status` = 'pending'
		AND NEW.`attempts` = OLD.`attempts`)
	OR (OLD.`status` = 'pending' AND NEW.`status` = 'sending' AND NEW.`attempts` = OLD.`attempts` + 1)
	OR (OLD.`status` = 'pending' AND NEW.`status` = 'cancelled' AND NEW.`attempts` = OLD.`attempts`)
	OR (OLD.`status` = 'sending' AND NEW.`status` IN ('sent', 'pending', 'failed')
		AND NEW.`attempts` = OLD.`attempts`)
	OR (OLD.`status` IN ('sent', 'failed', 'cancelled') AND NEW.`status` = OLD.`status`
		AND NEW.`attempts` = OLD.`attempts`
		AND OLD.`purged_at` IS NULL AND NEW.`purged_at` IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'email_outbox_transition_not_allowed');
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_terminal_append_only`
BEFORE UPDATE ON `email_outbox`
WHEN OLD.`status` IN ('sent', 'failed', 'cancelled') AND (
	NEW.`status` IS NOT OLD.`status` OR NEW.`attempts` IS NOT OLD.`attempts`
	OR NEW.`next_attempt_at` IS NOT OLD.`next_attempt_at`
	OR NEW.`lease_token_hash` IS NOT OLD.`lease_token_hash`
	OR NEW.`leased_at` IS NOT OLD.`leased_at` OR NEW.`lease_expires_at` IS NOT OLD.`lease_expires_at`
	OR NEW.`last_error_code` IS NOT OLD.`last_error_code`
	OR NEW.`sent_at` IS NOT OLD.`sent_at` OR NEW.`terminal_at` IS NOT OLD.`terminal_at`
	OR NEW.`updated_at` < OLD.`updated_at`
)
BEGIN
	SELECT RAISE(ABORT, 'email_outbox_terminal_is_append_only');
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_retain_delete`
BEFORE DELETE ON `email_outbox`
BEGIN
	SELECT RAISE(ABORT, 'email_outbox_evidence_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_account_access_lifecycle_disabled`
BEFORE UPDATE ON `email_outbox`
WHEN OLD.`kind` = 'account_access' AND (
	NEW.`status` IS NOT OLD.`status` OR NEW.`attempts` IS NOT OLD.`attempts`
	OR NEW.`next_attempt_at` IS NOT OLD.`next_attempt_at`
	OR NEW.`lease_token_hash` IS NOT OLD.`lease_token_hash`
	OR NEW.`leased_at` IS NOT OLD.`leased_at`
	OR NEW.`lease_expires_at` IS NOT OLD.`lease_expires_at`
	OR NEW.`last_error_code` IS NOT OLD.`last_error_code`
	OR NEW.`sent_at` IS NOT OLD.`sent_at`
	OR NEW.`terminal_at` IS NOT OLD.`terminal_at`
)
BEGIN
	SELECT RAISE(ABORT, 'email_outbox_account_access_is_historical_only');
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_audit_insert`
AFTER INSERT ON `email_outbox`
WHEN NEW.`kind` NOT IN ('order_confirmation', 'payment_confirmation')
BEGIN
	INSERT INTO `audit_log` (`id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `idempotency_key`, `metadata_json`, `created_at`)
	VALUES ('audit_email_queued_' || NEW.`id`, 'system', NULL, 'email_queued', 'email_outbox', NEW.`id`,
		'email:' || NEW.`id` || ':queued', '{}', NEW.`created_at`);
END;--> statement-breakpoint

CREATE TRIGGER `trg_webhook_events_validate_processed`
BEFORE UPDATE OF `status` ON `webhook_events`
WHEN NEW.`status` = 'processed'
BEGIN
  SELECT RAISE(ABORT, 'commerce_webhook_processing_incomplete') WHERE NOT EXISTS (
    SELECT 1 FROM `orders` AS customer_order
    INNER JOIN `carts` AS cart ON cart.`id` = customer_order.`cart_id`
    INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
    WHERE customer_order.`id` = NEW.`order_id`
      AND customer_order.`status` = 'paid' AND cart.`status` = 'converted'
      AND payment.`provider` = NEW.`provider`
      AND payment.`provider_session_id` = NEW.`provider_payment_id`
      AND payment.`status` = 'succeeded' AND payment.`amount_cents` = NEW.`amount_cents`
      AND payment.`currency` = NEW.`currency`
  ) OR NOT EXISTS (
    SELECT 1 FROM `email_outbox`
    WHERE `order_id` = NEW.`order_id` AND `kind` = 'payment_confirmation'
  ) OR NOT EXISTS (
    SELECT 1 FROM `audit_log`
    WHERE `entity_type` = 'order' AND `entity_id` = NEW.`order_id`
      AND `action` = 'payment_succeeded'
  );
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_audit_terminal`
AFTER UPDATE OF `status` ON `email_outbox`
WHEN NEW.`status` IN ('sent', 'failed', 'cancelled') AND OLD.`status` <> NEW.`status`
BEGIN
	INSERT INTO `audit_log` (`id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `idempotency_key`, `metadata_json`, `created_at`)
	VALUES ('audit_email_terminal_' || NEW.`id`, 'system', NULL, 'email_' || NEW.`status`, 'email_outbox', NEW.`id`,
		'email:' || NEW.`id` || ':terminal', '{}', NEW.`terminal_at`);
END;
