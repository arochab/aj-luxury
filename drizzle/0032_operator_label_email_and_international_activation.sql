CREATE TABLE `operator_label_email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`shipment_id` text NOT NULL,
	`order_id` text NOT NULL,
	`recipient_email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`lease_token_hash` text,
	`leased_at` text,
	`lease_expires_at` text,
	`last_error_code` text,
	`provider_message_id` text,
	`attachment_sha256` text,
	`attachment_byte_length` integer,
	`attachment_count` integer,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`sent_at` text,
	`terminal_at` text,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_operator_label_email_recipient" CHECK("operator_label_email_outbox"."recipient_email" = 'jeremy@ajluxurystore.com'),
	CONSTRAINT "ck_operator_label_email_status" CHECK("operator_label_email_outbox"."status" IN ('pending','sending','sent','failed')),
	CONSTRAINT "ck_operator_label_email_attempts" CHECK("operator_label_email_outbox"."attempts" >= 0 AND "operator_label_email_outbox"."max_attempts" = 5
        AND "operator_label_email_outbox"."attempts" <= "operator_label_email_outbox"."max_attempts"),
	CONSTRAINT "ck_operator_label_email_error" CHECK("operator_label_email_outbox"."last_error_code" IS NULL OR "operator_label_email_outbox"."last_error_code" IN (
        'dependency_unavailable','provider_rejected','delivery_ambiguous',
        'attempts_exhausted'
      )),
	CONSTRAINT "ck_operator_label_email_hashes" CHECK(("operator_label_email_outbox"."lease_token_hash" IS NULL OR (
          length("operator_label_email_outbox"."lease_token_hash") = 64
          AND "operator_label_email_outbox"."lease_token_hash" = lower("operator_label_email_outbox"."lease_token_hash")
          AND "operator_label_email_outbox"."lease_token_hash" NOT GLOB '*[^0-9a-f]*'
        )) AND ("operator_label_email_outbox"."attachment_sha256" IS NULL OR (
          length("operator_label_email_outbox"."attachment_sha256") = 64
          AND "operator_label_email_outbox"."attachment_sha256" = lower("operator_label_email_outbox"."attachment_sha256")
          AND "operator_label_email_outbox"."attachment_sha256" NOT GLOB '*[^0-9a-f]*'
        ))),
	CONSTRAINT "ck_operator_label_email_attachment" CHECK(("operator_label_email_outbox"."attachment_sha256" IS NULL AND "operator_label_email_outbox"."attachment_byte_length" IS NULL
          AND "operator_label_email_outbox"."attachment_count" IS NULL)
        OR ("operator_label_email_outbox"."attachment_sha256" IS NOT NULL AND "operator_label_email_outbox"."attachment_byte_length" > 0
          AND "operator_label_email_outbox"."attachment_count" IN (1,2))),
	CONSTRAINT "ck_operator_label_email_state" CHECK(("operator_label_email_outbox"."status" = 'pending' AND "operator_label_email_outbox"."next_attempt_at" IS NOT NULL
          AND "operator_label_email_outbox"."lease_token_hash" IS NULL AND "operator_label_email_outbox"."leased_at" IS NULL
          AND "operator_label_email_outbox"."lease_expires_at" IS NULL AND "operator_label_email_outbox"."last_error_code" IS NULL
          AND "operator_label_email_outbox"."provider_message_id" IS NULL AND "operator_label_email_outbox"."attachment_sha256" IS NULL
          AND "operator_label_email_outbox"."attachment_byte_length" IS NULL AND "operator_label_email_outbox"."attachment_count" IS NULL
          AND "operator_label_email_outbox"."sent_at" IS NULL AND "operator_label_email_outbox"."terminal_at" IS NULL)
        OR ("operator_label_email_outbox"."status" = 'sending' AND "operator_label_email_outbox"."next_attempt_at" IS NULL
          AND "operator_label_email_outbox"."lease_token_hash" IS NOT NULL AND "operator_label_email_outbox"."leased_at" IS NOT NULL
          AND "operator_label_email_outbox"."lease_expires_at" IS NOT NULL AND "operator_label_email_outbox"."attempts" >= 1
          AND "operator_label_email_outbox"."last_error_code" IS NULL AND "operator_label_email_outbox"."provider_message_id" IS NULL
          AND "operator_label_email_outbox"."attachment_sha256" IS NULL AND "operator_label_email_outbox"."attachment_byte_length" IS NULL
          AND "operator_label_email_outbox"."attachment_count" IS NULL AND "operator_label_email_outbox"."sent_at" IS NULL
          AND "operator_label_email_outbox"."terminal_at" IS NULL)
        OR ("operator_label_email_outbox"."status" = 'sent' AND "operator_label_email_outbox"."next_attempt_at" IS NULL
          AND "operator_label_email_outbox"."lease_token_hash" IS NULL AND "operator_label_email_outbox"."leased_at" IS NULL
          AND "operator_label_email_outbox"."lease_expires_at" IS NULL AND "operator_label_email_outbox"."last_error_code" IS NULL
          AND "operator_label_email_outbox"."provider_message_id" IS NOT NULL
          AND "operator_label_email_outbox"."attachment_sha256" IS NOT NULL
          AND "operator_label_email_outbox"."attachment_byte_length" > 0 AND "operator_label_email_outbox"."attachment_count" IN (1,2)
          AND "operator_label_email_outbox"."sent_at" IS NOT NULL
          AND "operator_label_email_outbox"."terminal_at" = "operator_label_email_outbox"."sent_at")
        OR ("operator_label_email_outbox"."status" = 'failed' AND "operator_label_email_outbox"."next_attempt_at" IS NULL
          AND "operator_label_email_outbox"."lease_token_hash" IS NULL AND "operator_label_email_outbox"."leased_at" IS NULL
          AND "operator_label_email_outbox"."lease_expires_at" IS NULL AND "operator_label_email_outbox"."last_error_code" IS NOT NULL
          AND "operator_label_email_outbox"."provider_message_id" IS NULL AND "operator_label_email_outbox"."attachment_sha256" IS NULL
          AND "operator_label_email_outbox"."attachment_byte_length" IS NULL AND "operator_label_email_outbox"."attachment_count" IS NULL
          AND "operator_label_email_outbox"."sent_at" IS NULL AND "operator_label_email_outbox"."terminal_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_operator_label_email_shipment` ON `operator_label_email_outbox` (`shipment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_operator_label_email_idempotency` ON `operator_label_email_outbox` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_operator_label_email_provider_message` ON `operator_label_email_outbox` (`provider_message_id`) WHERE "operator_label_email_outbox"."provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_operator_label_email_active_lease` ON `operator_label_email_outbox` (`lease_token_hash`) WHERE "operator_label_email_outbox"."lease_token_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_operator_label_email_claim` ON `operator_label_email_outbox` (`status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
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
	CONSTRAINT "ck_shipping_zone_configurations_zone" CHECK("zone" IN ('EU', 'UK', 'US', 'CA', 'GCC')),
	CONSTRAINT "ck_shipping_zone_configurations_status" CHECK("status" IN ('draft', 'active', 'retired')),
	CONSTRAINT "ck_shipping_zone_configurations_version" CHECK("version" > 0),
	CONSTRAINT "ck_shipping_zone_configurations_currency" CHECK("currency" = 'EUR'),
	CONSTRAINT "ck_shipping_zone_configurations_price" CHECK("price_cents" IS NULL OR "price_cents" >= 0),
	CONSTRAINT "ck_shipping_zone_configurations_delays" CHECK(("estimated_days_min" IS NULL AND "estimated_days_max" IS NULL)
        OR ("estimated_days_min" > 0
          AND "estimated_days_max" >= "estimated_days_min")),
	CONSTRAINT "ck_shipping_zone_configurations_duties" CHECK("duties_terms" IS NULL
        OR "duties_terms" IN ('EU_INCLUDED', 'DAP', 'DDP')),
	CONSTRAINT "ck_shipping_zone_configurations_parcel" CHECK(("parcel_weight_grams" IS NULL
          AND "parcel_length_mm" IS NULL
          AND "parcel_width_mm" IS NULL
          AND "parcel_height_mm" IS NULL)
        OR ("parcel_weight_grams" > 0
          AND "parcel_length_mm" > 0
          AND "parcel_width_mm" > 0
          AND "parcel_height_mm" > 0))
);
--> statement-breakpoint
INSERT INTO `__new_shipping_zone_configurations`("id", "zone", "version", "status", "service_code", "price_cents", "currency", "estimated_days_min", "estimated_days_max", "duties_terms", "parcel_code", "parcel_weight_grams", "parcel_length_mm", "parcel_width_mm", "parcel_height_mm", "origin_country_code", "customs_hs_code", "activated_at", "retired_at", "created_at", "updated_at") SELECT "id", "zone", "version", "status", "service_code", "price_cents", "currency", "estimated_days_min", "estimated_days_max", "duties_terms", "parcel_code", "parcel_weight_grams", "parcel_length_mm", "parcel_width_mm", "parcel_height_mm", "origin_country_code", "customs_hs_code", "activated_at", "retired_at", "created_at", "updated_at" FROM `shipping_zone_configurations`;--> statement-breakpoint
DROP TABLE `shipping_zone_configurations`;--> statement-breakpoint
ALTER TABLE `__new_shipping_zone_configurations` RENAME TO `shipping_zone_configurations`;--> statement-breakpoint
PRAGMA legacy_alter_table=OFF;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipping_zone_configurations_version` ON `shipping_zone_configurations` (`zone`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_shipping_zone_configurations_active` ON `shipping_zone_configurations` (`zone`) WHERE "shipping_zone_configurations"."status" = 'active';
--> statement-breakpoint
CREATE TRIGGER `trg_shipping_zone_configuration_validate_insert`
BEFORE INSERT ON `shipping_zone_configurations`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at` <> NEW.`created_at`
  OR NEW.`activated_at` IS NOT NULL OR NEW.`retired_at` IS NOT NULL
  OR NEW.`status` <> 'draft'
BEGIN SELECT RAISE(ABORT,'fulfillment_configuration_insert_invalid'); END;
--> statement-breakpoint
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
END;
--> statement-breakpoint
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
BEGIN SELECT RAISE(ABORT,'fulfillment_configuration_is_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_shipping_zone_configuration_validate_update_timestamp`
BEFORE UPDATE ON `shipping_zone_configurations`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ',NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at`<=OLD.`updated_at` OR OLD.`created_at` IS NOT NEW.`created_at`
  OR OLD.`id` IS NOT NEW.`id` OR OLD.`zone` IS NOT NEW.`zone` OR OLD.`version` IS NOT NEW.`version`
BEGIN SELECT RAISE(ABORT,'fulfillment_configuration_is_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_shipping_zone_configuration_state_shape`
BEFORE UPDATE ON `shipping_zone_configurations`
WHEN (NEW.`status`='draft' AND (NEW.`activated_at` IS NOT NULL OR NEW.`retired_at` IS NOT NULL))
  OR (NEW.`status`='active' AND (NEW.`activated_at` IS NULL OR NEW.`retired_at` IS NOT NULL))
  OR (NEW.`status`='retired' AND (NEW.`activated_at` IS NULL OR NEW.`retired_at` IS NULL))
BEGIN SELECT RAISE(ABORT,'fulfillment_configuration_state_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_shipping_zone_configuration_retain`
BEFORE DELETE ON `shipping_zone_configurations`
BEGIN SELECT RAISE(ABORT,'fulfillment_configuration_is_immutable'); END;
--> statement-breakpoint
INSERT INTO `shipping_zone_configurations` (
  `id`,`zone`,`version`,`status`,`created_at`,`updated_at`
) VALUES
  ('config_sendcloud_uk_v1','UK',1,'draft','2026-09-01T20:50:00.000Z','2026-09-01T20:50:00.000Z'),
  ('config_sendcloud_us_v1','US',1,'draft','2026-09-01T20:50:00.000Z','2026-09-01T20:50:00.000Z'),
  ('config_sendcloud_ca_v1','CA',1,'draft','2026-09-01T20:50:00.000Z','2026-09-01T20:50:00.000Z'),
  ('config_sendcloud_gcc_v1','GCC',1,'draft','2026-09-01T20:50:00.000Z','2026-09-01T20:50:00.000Z');
--> statement-breakpoint
UPDATE `shipping_zone_configurations`
SET `status`='active', `service_code`='sendcloud-dynamic-v3', `price_cents`=0,
  `currency`='EUR', `estimated_days_min`=1, `estimated_days_max`=30,
  `duties_terms`='DAP', `parcel_code`='AJL_ENVELOPE_3_ITEMS_V1',
  `parcel_weight_grams`=350, `parcel_length_mm`=400,
  `parcel_width_mm`=320, `parcel_height_mm`=40,
  `origin_country_code`='CN', `customs_hs_code`='61071200',
  `activated_at`='2026-09-01T20:50:00.001Z',
  `updated_at`='2026-09-01T20:50:00.001Z'
WHERE `id` IN (
  'config_sendcloud_uk_v1','config_sendcloud_us_v1',
  'config_sendcloud_ca_v1','config_sendcloud_gcc_v1'
);
--> statement-breakpoint
CREATE TRIGGER `trg_operator_label_email_validate_insert`
BEFORE INSERT ON `operator_label_email_outbox`
WHEN NEW.`status` <> 'pending' OR NEW.`attempts` <> 0 OR NEW.`max_attempts` <> 5
  OR NEW.`recipient_email` <> 'jeremy@ajluxurystore.com'
  OR NEW.`idempotency_key` <> 'operator_label_ready:' || NEW.`shipment_id`
  OR NEW.`next_attempt_at` <> NEW.`created_at`
  OR NEW.`updated_at` <> NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ',NEW.`created_at`) IS NOT NEW.`created_at`
  OR NOT EXISTS (
    SELECT 1 FROM `shipments` AS shipment
    INNER JOIN `orders` AS customer_order ON customer_order.`id`=shipment.`order_id`
    WHERE shipment.`id`=NEW.`shipment_id` AND shipment.`order_id`=NEW.`order_id`
      AND shipment.`status`='label_ready'
      AND shipment.`provider_shipment_reference` IS NOT NULL
      AND shipment.`tracking_reference` IS NOT NULL
      AND customer_order.`status`='preparing'
  )
BEGIN SELECT RAISE(ABORT,'operator_label_email_not_verified'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_operator_label_email_identity_immutable`
BEFORE UPDATE ON `operator_label_email_outbox`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`shipment_id` IS NOT NEW.`shipment_id`
  OR OLD.`order_id` IS NOT NEW.`order_id`
  OR OLD.`recipient_email` IS NOT NEW.`recipient_email`
  OR OLD.`max_attempts` IS NOT NEW.`max_attempts`
  OR OLD.`idempotency_key` IS NOT NEW.`idempotency_key`
  OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN SELECT RAISE(ABORT,'operator_label_email_identity_is_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_operator_label_email_transition`
BEFORE UPDATE ON `operator_label_email_outbox`
WHEN NOT (
  OLD.`status`='pending' AND NEW.`status`='sending'
  AND NEW.`attempts`=OLD.`attempts`+1
) AND NOT (
  OLD.`status`='sending' AND NEW.`status` IN ('pending','sent','failed')
  AND NEW.`attempts`=OLD.`attempts`
)
BEGIN SELECT RAISE(ABORT,'operator_label_email_transition_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_operator_label_email_terminal_immutable`
BEFORE UPDATE ON `operator_label_email_outbox`
WHEN OLD.`status` IN ('sent','failed')
BEGIN SELECT RAISE(ABORT,'operator_label_email_terminal_is_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_operator_label_email_retain`
BEFORE DELETE ON `operator_label_email_outbox`
BEGIN SELECT RAISE(ABORT,'operator_label_email_evidence_is_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_operator_label_email_audit_insert`
AFTER INSERT ON `operator_label_email_outbox`
BEGIN
  INSERT INTO `audit_log` (
    `id`,`actor_type`,`actor_id`,`action`,`entity_type`,`entity_id`,
    `idempotency_key`,`metadata_json`,`created_at`
  ) VALUES (
    'audit_operator_label_email_queued_' || NEW.`shipment_id`,
    'system',NULL,'operator_label_email_queued','shipment',NEW.`shipment_id`,
    'audit:operator_label_email_queued:' || NEW.`shipment_id`,
    json_object('orderId',NEW.`order_id`,'recipient',NEW.`recipient_email`),
    NEW.`created_at`
  );
END;
--> statement-breakpoint
CREATE TRIGGER `trg_operator_label_email_audit_terminal`
AFTER UPDATE OF `status` ON `operator_label_email_outbox`
WHEN OLD.`status` <> NEW.`status` AND NEW.`status` IN ('sent','failed')
BEGIN
  INSERT INTO `audit_log` (
    `id`,`actor_type`,`actor_id`,`action`,`entity_type`,`entity_id`,
    `idempotency_key`,`metadata_json`,`created_at`
  ) VALUES (
    'audit_operator_label_email_' || NEW.`status` || '_' || NEW.`shipment_id`,
    'system',NULL,'operator_label_email_' || NEW.`status`,'shipment',NEW.`shipment_id`,
    'audit:operator_label_email_' || NEW.`status` || ':' || NEW.`shipment_id`,
    json_object('orderId',NEW.`order_id`,'attempts',NEW.`attempts`),
    NEW.`terminal_at`
  );
END;
--> statement-breakpoint
PRAGMA foreign_key_check;
--> statement-breakpoint
PRAGMA optimize;
