CREATE TABLE `email_delivery_provider_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`outbox_id` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`provider_last_event` text NOT NULL,
	`provider_created_at` text NOT NULL,
	`reconciliation_source` text NOT NULL,
	`reconciled_by_admin_id` text NOT NULL,
	`reconciled_at` text NOT NULL,
	FOREIGN KEY (`outbox_id`) REFERENCES `email_outbox`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reconciled_by_admin_id`) REFERENCES `administrators`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_email_delivery_provider_evidence_event" CHECK("email_delivery_provider_evidence"."provider_last_event" IN ('delivered', 'opened', 'clicked')),
	CONSTRAINT "ck_email_delivery_provider_evidence_source" CHECK("email_delivery_provider_evidence"."reconciliation_source" = 'resend_api'),
	CONSTRAINT "ck_email_delivery_provider_evidence_message" CHECK(length("email_delivery_provider_evidence"."provider_message_id") BETWEEN 1 AND 192
        AND "email_delivery_provider_evidence"."provider_message_id" NOT GLOB '*[^A-Za-z0-9_.:-]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_delivery_provider_evidence_outbox` ON `email_delivery_provider_evidence` (`outbox_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_delivery_provider_evidence_message` ON `email_delivery_provider_evidence` (`provider_message_id`);--> statement-breakpoint
CREATE INDEX `idx_email_delivery_provider_evidence_time` ON `email_delivery_provider_evidence` (`reconciled_at`);--> statement-breakpoint

CREATE TRIGGER `trg_email_delivery_provider_evidence_validate_insert`
BEFORE INSERT ON `email_delivery_provider_evidence`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`provider_created_at`) IS NOT NEW.`provider_created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`reconciled_at`) IS NOT NEW.`reconciled_at`
  OR NEW.`provider_created_at` > NEW.`reconciled_at`
  OR NOT EXISTS (
    SELECT 1 FROM `email_outbox` AS message
    INNER JOIN `orders` AS customer_order ON customer_order.`id` = message.`order_id`
    INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
    WHERE message.`id` = NEW.`outbox_id`
      AND message.`kind` IN ('order_confirmation', 'payment_confirmation')
      AND message.`status` = 'failed'
      AND message.`last_error_code` = 'delivery_ambiguous'
      AND message.`provider_message_id` IS NULL
      AND message.`recipient_email` IS NOT NULL
      AND message.`payload_json` IS NOT NULL
      AND message.`purged_at` IS NULL
      AND customer_order.`status` IN ('paid', 'preparing', 'shipped')
      AND customer_order.`paid_at` IS NOT NULL
      AND NEW.`provider_created_at` >= customer_order.`paid_at`
      AND payment.`provider` = 'stripe'
      AND payment.`status` = 'succeeded'
      AND payment.`amount_cents` = customer_order.`total_cents`
      AND payment.`currency` = customer_order.`currency`
  )
  OR NOT EXISTS (
    SELECT 1 FROM `administrators`
    WHERE `id` = NEW.`reconciled_by_admin_id`
      AND `role` = 'owner' AND `enabled` = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'email_delivery_reconciliation_invalid');
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_delivery_provider_evidence_immutable_update`
BEFORE UPDATE ON `email_delivery_provider_evidence`
BEGIN
  SELECT RAISE(ABORT, 'email_delivery_reconciliation_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_delivery_provider_evidence_retain_delete`
BEFORE DELETE ON `email_delivery_provider_evidence`
BEGIN
  SELECT RAISE(ABORT, 'email_delivery_reconciliation_is_immutable');
END;--> statement-breakpoint

PRAGMA optimize;
