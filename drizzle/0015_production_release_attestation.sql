CREATE TABLE `production_launch_stock_manifest_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`manifest_id` text NOT NULL,
	`position` integer NOT NULL,
	`variant_id` text NOT NULL,
	`internal_reference` text NOT NULL,
	`physical_quantity` integer NOT NULL,
	`gifting_reserve_quantity` integer NOT NULL,
	`safety_reserve_quantity` integer NOT NULL,
	`sav_reserve_quantity` integer NOT NULL,
	`sellable_quantity` integer NOT NULL,
	FOREIGN KEY (`manifest_id`) REFERENCES `production_launch_stock_manifests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`variant_id`) REFERENCES `inventory`(`variant_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_production_stock_manifest_position" CHECK("production_launch_stock_manifest_lines"."position" BETWEEN 0 AND 11),
	CONSTRAINT "ck_production_stock_manifest_line_totals" CHECK("production_launch_stock_manifest_lines"."physical_quantity" >= 0
        AND "production_launch_stock_manifest_lines"."gifting_reserve_quantity" >= 0
        AND "production_launch_stock_manifest_lines"."safety_reserve_quantity" >= 0
        AND "production_launch_stock_manifest_lines"."sav_reserve_quantity" >= 0
        AND "production_launch_stock_manifest_lines"."sellable_quantity" >= 0
        AND "production_launch_stock_manifest_lines"."gifting_reserve_quantity" + "production_launch_stock_manifest_lines"."safety_reserve_quantity"
          + "production_launch_stock_manifest_lines"."sav_reserve_quantity" + "production_launch_stock_manifest_lines"."sellable_quantity" = "production_launch_stock_manifest_lines"."physical_quantity")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_production_stock_manifest_position` ON `production_launch_stock_manifest_lines` (`manifest_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_production_stock_manifest_variant` ON `production_launch_stock_manifest_lines` (`manifest_id`,`variant_id`);--> statement-breakpoint
CREATE TABLE `production_launch_stock_manifests` (
	`id` text PRIMARY KEY NOT NULL,
	`protocol` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`counted_at` text NOT NULL,
	`release_sha` text NOT NULL,
	`worker_version_id` text NOT NULL,
	`physical_total` integer NOT NULL,
	`variant_count` integer NOT NULL,
	`gifting_reserve_total` integer NOT NULL,
	`safety_reserve_total` integer NOT NULL,
	`sav_reserve_total` integer NOT NULL,
	`sellable_total` integer NOT NULL,
	`stock_owner_id` text NOT NULL,
	`release_owner_id` text NOT NULL,
	`stock_owner_signed_at` text NOT NULL,
	`release_owner_signed_at` text NOT NULL,
	`activated_at` text NOT NULL,
	CONSTRAINT "ck_production_stock_manifest_protocol" CHECK("production_launch_stock_manifests"."protocol" = 'ajl-launch-stock-import-v1'),
	CONSTRAINT "ck_production_stock_manifest_hashes" CHECK(length("production_launch_stock_manifests"."payload_sha256") = 64
        AND "production_launch_stock_manifests"."payload_sha256" = lower("production_launch_stock_manifests"."payload_sha256")
        AND "production_launch_stock_manifests"."payload_sha256" NOT GLOB '*[^0-9a-f]*'
        AND length("production_launch_stock_manifests"."release_sha") = 40
        AND "production_launch_stock_manifests"."release_sha" = lower("production_launch_stock_manifests"."release_sha")
        AND "production_launch_stock_manifests"."release_sha" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "ck_production_stock_manifest_totals" CHECK("production_launch_stock_manifests"."physical_total" = 756 AND "production_launch_stock_manifests"."variant_count" = 12
        AND "production_launch_stock_manifests"."gifting_reserve_total" >= 0
        AND "production_launch_stock_manifests"."safety_reserve_total" >= 0
        AND "production_launch_stock_manifests"."sav_reserve_total" >= 0
        AND "production_launch_stock_manifests"."sellable_total" >= 0
        AND "production_launch_stock_manifests"."gifting_reserve_total" + "production_launch_stock_manifests"."safety_reserve_total"
          + "production_launch_stock_manifests"."sav_reserve_total" + "production_launch_stock_manifests"."sellable_total" = "production_launch_stock_manifests"."physical_total"),
	CONSTRAINT "ck_production_stock_manifest_distinct_approvers" CHECK("production_launch_stock_manifests"."stock_owner_id" <> "production_launch_stock_manifests"."release_owner_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_production_stock_manifest_payload` ON `production_launch_stock_manifests` (`payload_sha256`);--> statement-breakpoint
CREATE TABLE `production_release_attestations` (
	`release_sha` text PRIMARY KEY NOT NULL,
	`worker_version_id` text NOT NULL,
	`worker_version_tag` text NOT NULL,
	`stock_manifest_id` text NOT NULL,
	`controlled_order_id` text NOT NULL,
	`adam_approver_id` text NOT NULL,
	`jeremy_approver_id` text NOT NULL,
	`approved_at` text NOT NULL,
	FOREIGN KEY (`stock_manifest_id`) REFERENCES `production_launch_stock_manifests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`controlled_order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_production_release_hashes" CHECK(length("production_release_attestations"."release_sha") = 40
        AND "production_release_attestations"."release_sha" = lower("production_release_attestations"."release_sha")
        AND "production_release_attestations"."release_sha" NOT GLOB '*[^0-9a-f]*'
        AND "production_release_attestations"."worker_version_tag" = "production_release_attestations"."release_sha"),
	CONSTRAINT "ck_production_release_distinct_approvers" CHECK("production_release_attestations"."adam_approver_id" <> "production_release_attestations"."jeremy_approver_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_production_release_stock_manifest` ON `production_release_attestations` (`stock_manifest_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_production_release_controlled_order` ON `production_release_attestations` (`controlled_order_id`);--> statement-breakpoint
CREATE TABLE `production_runtime_schema_proofs` (
	`migration_id` text PRIMARY KEY NOT NULL,
	`contract_sha256` text NOT NULL,
	`installed_at` text NOT NULL,
	CONSTRAINT "ck_production_schema_proof_hash" CHECK(length("production_runtime_schema_proofs"."contract_sha256") = 64
        AND "production_runtime_schema_proofs"."contract_sha256" = lower("production_runtime_schema_proofs"."contract_sha256")
        AND "production_runtime_schema_proofs"."contract_sha256" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
DROP TRIGGER `trg_late_payment_refund_validate_insert`;
--> statement-breakpoint
CREATE TRIGGER `trg_late_payment_refund_validate_insert`
BEFORE INSERT ON `late_payment_refund_intents`
WHEN NEW.`status` <> 'pending' OR NEW.`attempts` <> 0
  OR NEW.`provider_refund_id` IS NOT NULL
  OR NEW.`provider_receipt_fingerprint` IS NOT NULL
  OR NEW.`lease_token_hash` IS NOT NULL OR NEW.`leased_at` IS NOT NULL
  OR NEW.`lease_expires_at` IS NOT NULL OR NEW.`last_error_code` IS NOT NULL
  OR NEW.`succeeded_at` IS NOT NULL OR NEW.`terminal_at` IS NOT NULL
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR NEW.`updated_at` IS NOT NEW.`created_at`
  OR NOT EXISTS (
    SELECT 1 FROM `webhook_events` AS event
    INNER JOIN `orders` AS customer_order ON customer_order.`id` = event.`order_id`
    INNER JOIN `payments` AS checkout ON checkout.`order_id` = customer_order.`id`
    WHERE event.`id` = NEW.`webhook_event_id`
      AND event.`provider` = 'stripe'
      AND event.`provider_event_id` = NEW.`provider_event_id`
      AND event.`event_type` = 'payment.succeeded'
      AND event.`status` = 'verified'
      AND event.`order_id` = NEW.`order_id`
      AND event.`provider_payment_id` = NEW.`provider_payment_id`
      AND event.`amount_cents` = NEW.`amount_cents`
      AND event.`currency` = NEW.`currency`
      AND customer_order.`status` IN ('pending_payment', 'cancelled')
      AND customer_order.`total_cents` = NEW.`amount_cents`
      AND customer_order.`currency` = NEW.`currency`
      AND checkout.`provider` = 'stripe'
      AND checkout.`provider_session_id` = NEW.`provider_checkout_session_id`
      AND checkout.`status` IN ('created', 'requires_action')
      AND checkout.`amount_cents` = NEW.`amount_cents`
      AND checkout.`currency` = NEW.`currency`
  )
  OR EXISTS (
    SELECT 1 FROM `payments`
    WHERE `order_id` = NEW.`order_id` AND `status` IN ('succeeded', 'refunded')
  )
  OR EXISTS (
    SELECT 1 FROM `inventory_movements`
    WHERE `reference_type` = 'order' AND `reference_id` = NEW.`order_id`
      AND `kind` = 'sale'
  )
BEGIN
  SELECT RAISE(ABORT, 'late_payment_refund_intent_invalid');
END;
--> statement-breakpoint
INSERT INTO `production_runtime_schema_proofs` (`migration_id`, `contract_sha256`, `installed_at`)
VALUES (
  '0015_production_release_attestation',
  'cbca357efcac8c76fe6301eb4e7f78fb4f0c311ec4c33d30fb6d66b3382dac79',
  '2026-08-15T00:00:00.000Z'
);
--> statement-breakpoint
CREATE TRIGGER `trg_production_schema_proof_immutable`
BEFORE UPDATE ON `production_runtime_schema_proofs`
BEGIN
  SELECT RAISE(ABORT, 'production_schema_proof_is_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_production_schema_proof_retain`
BEFORE DELETE ON `production_runtime_schema_proofs`
BEGIN
  SELECT RAISE(ABORT, 'production_schema_proof_must_be_retained');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_production_stock_manifest_immutable`
BEFORE UPDATE ON `production_launch_stock_manifests`
BEGIN
  SELECT RAISE(ABORT, 'production_stock_manifest_is_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_production_stock_manifest_retain`
BEFORE DELETE ON `production_launch_stock_manifests`
BEGIN
  SELECT RAISE(ABORT, 'production_stock_manifest_must_be_retained');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_production_stock_manifest_line_immutable`
BEFORE UPDATE ON `production_launch_stock_manifest_lines`
BEGIN
  SELECT RAISE(ABORT, 'production_stock_manifest_line_is_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_production_stock_manifest_line_retain`
BEFORE DELETE ON `production_launch_stock_manifest_lines`
BEGIN
  SELECT RAISE(ABORT, 'production_stock_manifest_line_must_be_retained');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_production_stock_manifest_line_closed`
BEFORE INSERT ON `production_launch_stock_manifest_lines`
WHEN EXISTS (
  SELECT 1 FROM `production_release_attestations`
  WHERE `stock_manifest_id` = NEW.`manifest_id`
)
BEGIN
  SELECT RAISE(ABORT, 'production_stock_manifest_is_already_released');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_production_release_attestation_validate`
BEFORE INSERT ON `production_release_attestations`
WHEN NOT EXISTS (
  SELECT 1 FROM `production_launch_stock_manifests` AS manifest
  WHERE manifest.`id` = NEW.`stock_manifest_id`
    AND manifest.`release_sha` = NEW.`release_sha`
    AND manifest.`worker_version_id` = NEW.`worker_version_id`
    AND manifest.`stock_owner_id` = NEW.`jeremy_approver_id`
    AND manifest.`release_owner_id` = NEW.`adam_approver_id`
    AND manifest.`stock_owner_signed_at` >= manifest.`counted_at`
    AND manifest.`release_owner_signed_at` >= manifest.`counted_at`
    AND manifest.`activated_at` >= manifest.`stock_owner_signed_at`
    AND manifest.`activated_at` >= manifest.`release_owner_signed_at`
    AND manifest.`variant_count` = (
      SELECT COUNT(*) FROM `production_launch_stock_manifest_lines`
      WHERE `manifest_id` = manifest.`id`
    )
    AND manifest.`physical_total` = (
      SELECT COALESCE(SUM(`physical_quantity`), -1)
      FROM `production_launch_stock_manifest_lines` WHERE `manifest_id` = manifest.`id`
    )
    AND manifest.`gifting_reserve_total` = (
      SELECT COALESCE(SUM(`gifting_reserve_quantity`), -1)
      FROM `production_launch_stock_manifest_lines` WHERE `manifest_id` = manifest.`id`
    )
    AND manifest.`safety_reserve_total` = (
      SELECT COALESCE(SUM(`safety_reserve_quantity`), -1)
      FROM `production_launch_stock_manifest_lines` WHERE `manifest_id` = manifest.`id`
    )
    AND manifest.`sav_reserve_total` = (
      SELECT COALESCE(SUM(`sav_reserve_quantity`), -1)
      FROM `production_launch_stock_manifest_lines` WHERE `manifest_id` = manifest.`id`
    )
    AND manifest.`sellable_total` = (
      SELECT COALESCE(SUM(`sellable_quantity`), -1)
      FROM `production_launch_stock_manifest_lines` WHERE `manifest_id` = manifest.`id`
    )
    AND NOT EXISTS (
      SELECT 1 FROM `production_launch_stock_manifest_lines` AS line
      LEFT JOIN `variants` AS variant ON variant.`id` = line.`variant_id`
      LEFT JOIN `inventory` AS stock ON stock.`variant_id` = line.`variant_id`
      WHERE line.`manifest_id` = manifest.`id` AND (
        variant.`id` IS NULL OR variant.`internal_reference` IS NOT line.`internal_reference`
        OR stock.`variant_id` IS NULL
        OR stock.`physical_quantity` IS NOT line.`physical_quantity`
        OR stock.`gift_reserve_quantity` IS NOT line.`gifting_reserve_quantity`
        OR stock.`safety_reserve_quantity` IS NOT line.`safety_reserve_quantity` + line.`sav_reserve_quantity`
        OR stock.`reserves_validated` IS NOT 1
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM `inventory` AS stock
      LEFT JOIN `production_launch_stock_manifest_lines` AS line
        ON line.`manifest_id` = manifest.`id` AND line.`variant_id` = stock.`variant_id`
      WHERE line.`id` IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM `orders` AS customer_order
      INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
      INNER JOIN `shipments` AS shipment ON shipment.`order_id` = customer_order.`id`
      INNER JOIN `email_outbox` AS message ON message.`order_id` = customer_order.`id`
      WHERE customer_order.`id` = NEW.`controlled_order_id`
        AND customer_order.`status` IN ('paid', 'preparing', 'shipped')
        AND customer_order.`paid_at` IS NOT NULL
        AND payment.`provider` = 'stripe' AND payment.`status` = 'succeeded'
        AND payment.`amount_cents` = customer_order.`total_cents`
        AND payment.`currency` = customer_order.`currency`
        AND shipment.`status` IN ('handed_over', 'in_transit', 'delivered')
        AND shipment.`provider_shipment_reference` IS NOT NULL
        AND shipment.`tracking_reference` IS NOT NULL
        AND shipment.`provider_receipt_fingerprint` IS NOT NULL
        AND shipment.`label_created_at` IS NOT NULL
        AND message.`kind` = 'payment_confirmation'
        AND message.`status` = 'sent' AND message.`sent_at` IS NOT NULL
    )
)
BEGIN
  SELECT RAISE(ABORT, 'production_release_attestation_invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_production_release_attestation_immutable`
BEFORE UPDATE ON `production_release_attestations`
BEGIN
  SELECT RAISE(ABORT, 'production_release_attestation_is_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_production_release_attestation_retain`
BEFORE DELETE ON `production_release_attestations`
BEGIN
  SELECT RAISE(ABORT, 'production_release_attestation_must_be_retained');
END;
