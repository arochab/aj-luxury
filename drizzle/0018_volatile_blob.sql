CREATE TABLE `resend_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_message_id` text NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`received_at` text NOT NULL,
	CONSTRAINT "ck_resend_webhook_event_type" CHECK("resend_webhook_events"."event_type" IN (
        'email.sent', 'email.delivered', 'email.delivery_delayed',
        'email.bounced', 'email.complained', 'email.failed', 'email.suppressed'
      )),
	CONSTRAINT "ck_resend_webhook_hash" CHECK(length("resend_webhook_events"."payload_sha256") = 64
        AND "resend_webhook_events"."payload_sha256" = lower("resend_webhook_events"."payload_sha256")
        AND "resend_webhook_events"."payload_sha256" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX `idx_resend_webhook_message_time` ON `resend_webhook_events` (`provider_message_id`,`occurred_at`);--> statement-breakpoint
ALTER TABLE `email_outbox` ADD `provider_message_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_provider_message_id`
ON `email_outbox` (`provider_message_id`)
WHERE `provider_message_id` IS NOT NULL;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_provider_message_transition`
BEFORE UPDATE OF `provider_message_id` ON `email_outbox`
FOR EACH ROW
WHEN NOT (
  OLD.`provider_message_id` IS NULL
  AND NEW.`provider_message_id` IS NOT NULL
  AND NEW.`status` = 'sent'
  AND length(NEW.`provider_message_id`) BETWEEN 1 AND 192
  AND NEW.`provider_message_id` NOT GLOB '*[^A-Za-z0-9_.:-]*'
)
BEGIN
  SELECT RAISE(ABORT, 'email_outbox_provider_message_transition_invalid');
END;--> statement-breakpoint

CREATE TRIGGER `trg_resend_webhook_events_validate_insert`
BEFORE INSERT ON `resend_webhook_events`
FOR EACH ROW
WHEN length(NEW.`id`) NOT BETWEEN 8 AND 192
  OR NEW.`id` GLOB '*[^A-Za-z0-9_.:-]*'
  OR length(NEW.`provider_message_id`) NOT BETWEEN 1 AND 192
  OR NEW.`provider_message_id` GLOB '*[^A-Za-z0-9_.:-]*'
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`occurred_at`) <> NEW.`occurred_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`received_at`) <> NEW.`received_at`
BEGIN
  SELECT RAISE(ABORT, 'resend_webhook_event_invalid');
END;--> statement-breakpoint

CREATE TRIGGER `trg_resend_webhook_events_immutable_update`
BEFORE UPDATE ON `resend_webhook_events`
BEGIN
  SELECT RAISE(ABORT, 'resend_webhook_event_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_resend_webhook_events_retain_delete`
BEFORE DELETE ON `resend_webhook_events`
BEGIN
  SELECT RAISE(ABORT, 'resend_webhook_event_is_immutable');
END;
