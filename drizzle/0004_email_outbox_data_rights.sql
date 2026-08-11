DROP TRIGGER `trg_webhook_events_validate_processed`;--> statement-breakpoint
ALTER TABLE `email_outbox` RENAME TO `email_outbox_legacy_d02`;--> statement-breakpoint

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
	`created_at` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text,
	`terminal_at` text,
	`purged_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`access_challenge_id`) REFERENCES `access_challenges`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_email_outbox_kind` CHECK(`kind` IN (
		'payment_confirmation', 'payment_failed', 'shipment_confirmation',
		'refund_confirmation', 'withdrawal_acknowledgement', 'account_access',
		'order_confirmation'
	)),
	CONSTRAINT `ck_email_outbox_intent` CHECK(
		(`kind` = 'payment_confirmation' AND `transaction_intent` = 'payment_succeeded')
		OR (`kind` = 'payment_failed' AND `transaction_intent` = 'payment_failed')
		OR (`kind` = 'shipment_confirmation' AND `transaction_intent` = 'shipment_created')
		OR (`kind` = 'refund_confirmation' AND `transaction_intent` = 'refund_succeeded')
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
		'legacy_ambiguous_delivery'
	)),
	CONSTRAINT `ck_email_outbox_content_purge` CHECK(
		(`purged_at` IS NULL AND `recipient_email` IS NOT NULL AND `payload_json` IS NOT NULL)
		OR (`purged_at` IS NOT NULL AND `recipient_email` IS NULL AND `payload_json` IS NULL
			AND `status` IN ('sent', 'failed', 'cancelled'))
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
	`created_at`, `updated_at`, `sent_at`, `terminal_at`, `purged_at`
)
SELECT
	legacy.`id`,
	CASE legacy.`kind`
		WHEN 'magic_link' THEN 'account_access'
		WHEN 'order_confirmation' THEN 'payment_confirmation'
		WHEN 'payment_failed' THEN 'payment_failed'
		WHEN 'shipment_confirmation' THEN 'shipment_confirmation'
		ELSE 'refund_confirmation'
	END,
	CASE legacy.`kind`
		WHEN 'magic_link' THEN 'account_access_challenge'
		WHEN 'order_confirmation' THEN 'payment_succeeded'
		WHEN 'payment_failed' THEN 'payment_failed'
		WHEN 'shipment_confirmation' THEN 'shipment_created'
		ELSE 'refund_succeeded'
	END,
	'legacy:' || legacy.`id`,
	CASE WHEN legacy.`kind` = 'magic_link' THEN NULL ELSE legacy.`recipient_email` END,
	legacy.`order_id`, NULL,
	CASE WHEN legacy.`locale` = 'en' THEN 'en' ELSE 'fr' END,
	legacy.`template_version`,
	CASE WHEN legacy.`kind` = 'magic_link' THEN NULL ELSE legacy.`payload_json` END,
	CASE
		WHEN legacy.`kind` = 'magic_link' THEN 'failed'
		WHEN legacy.`status` = 'sending' THEN 'failed'
		WHEN legacy.`kind` = 'order_confirmation' AND NOT EXISTS (
			SELECT 1 FROM `orders` AS customer_order
			INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
			WHERE customer_order.`id` = legacy.`order_id`
				AND customer_order.`paid_at` IS NOT NULL AND payment.`status` = 'succeeded'
		) THEN 'cancelled'
		ELSE legacy.`status`
	END,
	CASE WHEN legacy.`kind` = 'magic_link' THEN 1
		WHEN legacy.`status` = 'sending' AND legacy.`attempts` < 1 THEN 1
		ELSE legacy.`attempts` END,
	CASE WHEN legacy.`kind` = 'magic_link' THEN 1
		WHEN legacy.`attempts` > 5 THEN legacy.`attempts` ELSE 5 END,
	CASE WHEN legacy.`status` = 'pending' AND legacy.`kind` <> 'magic_link'
		AND NOT (legacy.`kind` = 'order_confirmation' AND NOT EXISTS (
			SELECT 1 FROM `orders` AS customer_order
			INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
			WHERE customer_order.`id` = legacy.`order_id`
				AND customer_order.`paid_at` IS NOT NULL AND payment.`status` = 'succeeded'
		)) THEN COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', legacy.`next_attempt_at`), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
		ELSE NULL END,
	NULL, NULL, NULL,
	CASE
		WHEN legacy.`kind` = 'magic_link' THEN 'legacy_magic_link_invalidated'
		WHEN legacy.`status` = 'sending' THEN 'legacy_ambiguous_delivery'
		WHEN legacy.`kind` = 'order_confirmation' AND NOT EXISTS (
			SELECT 1 FROM `orders` AS customer_order
			INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
			WHERE customer_order.`id` = legacy.`order_id`
				AND customer_order.`paid_at` IS NOT NULL AND payment.`status` = 'succeeded'
		) THEN 'legacy_unverified_payment_intent'
		WHEN legacy.`last_error_code` IS NOT NULL THEN 'provider_rejected'
		ELSE NULL
	END,
	legacy.`idempotency_key`,
	COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', legacy.`created_at`), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	CASE WHEN legacy.`status` = 'sent' AND legacy.`kind` <> 'magic_link'
		THEN COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', legacy.`sent_at`), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE NULL END,
	CASE WHEN legacy.`status` IN ('sent', 'failed', 'sending') OR legacy.`kind` = 'magic_link'
		OR (legacy.`kind` = 'order_confirmation' AND NOT EXISTS (
			SELECT 1 FROM `orders` AS customer_order
			INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
			WHERE customer_order.`id` = legacy.`order_id`
				AND customer_order.`paid_at` IS NOT NULL AND payment.`status` = 'succeeded'
		)) THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END,
	CASE WHEN legacy.`kind` = 'magic_link' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END
FROM `email_outbox_legacy_d02` AS legacy;--> statement-breakpoint

DROP TABLE `email_outbox_legacy_d02`;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_idempotency_key` ON `email_outbox` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_intent_source` ON `email_outbox` (`transaction_intent`,`source_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_active_lease` ON `email_outbox` (`lease_token_hash`) WHERE `lease_token_hash` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_email_outbox_claim` ON `email_outbox` (`status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_email_outbox_stale_lease` ON `email_outbox` (`status`,`lease_expires_at`);--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_normalize_verified_legacy_insert`
AFTER INSERT ON `email_outbox`
WHEN NEW.`kind` = 'order_confirmation' AND NEW.`source_event_id` = 'compat:pending'
BEGIN
	UPDATE `email_outbox` SET `kind` = 'payment_confirmation',
		`source_event_id` = 'payment:' || NEW.`order_id`, `updated_at` = NEW.`created_at`
	WHERE `id` = NEW.`id`;
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_validate_insert`
BEFORE INSERT ON `email_outbox`
WHEN NEW.`status` <> 'pending' OR NEW.`attempts` <> 0
	OR NEW.`purged_at` IS NOT NULL
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
		SELECT 1 FROM `orders` WHERE `id` = NEW.`order_id` AND `status` = 'shipped'
	))
	OR (NEW.`kind` = 'refund_confirmation' AND NOT EXISTS (
		SELECT 1 FROM `orders` AS customer_order
		LEFT JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
		WHERE customer_order.`id` = NEW.`order_id`
			AND (customer_order.`status` = 'refunded' OR payment.`status` = 'refunded')
	))
	OR (NEW.`kind` = 'withdrawal_acknowledgement' AND NOT EXISTS (
		SELECT 1 FROM `orders` WHERE `id` = NEW.`order_id`
	))
BEGIN
	SELECT RAISE(ABORT, 'email_outbox_transaction_intent_not_verified');
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_immutable_identity`
BEFORE UPDATE ON `email_outbox`
WHEN NOT (
	OLD.`kind` = 'order_confirmation' AND NEW.`kind` = 'payment_confirmation'
	AND OLD.`source_event_id` = 'compat:pending'
	AND NEW.`source_event_id` = 'payment:' || OLD.`order_id`
	AND OLD.`status` = 'pending' AND NEW.`status` = 'pending'
) AND (OLD.`id` IS NOT NEW.`id` OR OLD.`kind` IS NOT NEW.`kind`
	OR OLD.`transaction_intent` IS NOT NEW.`transaction_intent`
	OR OLD.`source_event_id` IS NOT NEW.`source_event_id`
	OR OLD.`order_id` IS NOT NEW.`order_id`
	OR OLD.`access_challenge_id` IS NOT NEW.`access_challenge_id`
	OR OLD.`locale` IS NOT NEW.`locale` OR OLD.`template_version` IS NOT NEW.`template_version`
	OR OLD.`max_attempts` IS NOT NEW.`max_attempts`
	OR OLD.`idempotency_key` IS NOT NEW.`idempotency_key`
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
		AND OLD.`status` = 'pending' AND NEW.`status` = 'pending'
		AND NEW.`attempts` = OLD.`attempts`)
	OR
	(OLD.`status` = 'pending' AND NEW.`status` = 'sending' AND NEW.`attempts` = OLD.`attempts` + 1)
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

CREATE TRIGGER `trg_email_outbox_account_access_sent`
AFTER UPDATE OF `status` ON `email_outbox`
WHEN OLD.`status` = 'sending' AND NEW.`status` = 'sent' AND NEW.`kind` = 'account_access'
BEGIN
	UPDATE `access_challenges` SET `dispatched_at` = NEW.`sent_at`
	WHERE `id` = NEW.`access_challenge_id` AND `dispatched_at` IS NULL
		AND `consumed_at` IS NULL AND `revoked_at` IS NULL;
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_account_access_failed`
AFTER UPDATE OF `status` ON `email_outbox`
WHEN OLD.`status` = 'sending' AND NEW.`status` = 'failed' AND NEW.`kind` = 'account_access'
BEGIN
	UPDATE `access_challenges` SET `revoked_at` = NEW.`terminal_at`
	WHERE `id` = NEW.`access_challenge_id` AND `consumed_at` IS NULL AND `revoked_at` IS NULL;
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
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `orders` AS customer_order
    INNER JOIN `carts` AS cart ON cart.`id` = customer_order.`cart_id`
    INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
    WHERE customer_order.`id` = NEW.`order_id`
      AND customer_order.`status` = 'paid'
      AND cart.`status` = 'converted'
      AND payment.`provider` = NEW.`provider`
      AND payment.`provider_session_id` = NEW.`provider_payment_id`
      AND payment.`status` = 'succeeded'
      AND payment.`amount_cents` = NEW.`amount_cents`
      AND payment.`currency` = NEW.`currency`
  ) OR NOT EXISTS (
    SELECT 1 FROM `email_outbox`
    WHERE `order_id` = NEW.`order_id` AND `kind` = 'payment_confirmation'
  ) OR NOT EXISTS (
    SELECT 1 FROM `audit_log`
    WHERE `entity_type` = 'order'
      AND `entity_id` = NEW.`order_id`
      AND `action` = 'payment_succeeded'
  ) THEN RAISE(ABORT, 'commerce_webhook_processing_incomplete') END;
END;--> statement-breakpoint

CREATE TRIGGER `trg_email_outbox_audit_terminal`
AFTER UPDATE OF `status` ON `email_outbox`
WHEN NEW.`status` IN ('sent', 'failed', 'cancelled') AND OLD.`status` <> NEW.`status`
BEGIN
	INSERT INTO `audit_log` (`id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `idempotency_key`, `metadata_json`, `created_at`)
	VALUES ('audit_email_terminal_' || NEW.`id`, 'system', NULL, 'email_' || NEW.`status`, 'email_outbox', NEW.`id`,
		'email:' || NEW.`id` || ':terminal', '{}', NEW.`terminal_at`);
END;--> statement-breakpoint

CREATE TABLE `data_retention_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`record_class` text NOT NULL,
	`policy_version` text NOT NULL,
	`retention_seconds` integer,
	`active` integer DEFAULT 0 NOT NULL,
	`effective_at` text,
	`created_by_admin_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `administrators`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_data_retention_class` CHECK(`record_class` IN ('customer_profile', 'email_content', 'order_record')),
	CONSTRAINT `ck_data_retention_active` CHECK(`active` IN (0, 1)),
	CONSTRAINT `ck_data_retention_duration` CHECK(`retention_seconds` IS NULL OR `retention_seconds` >= 0),
	CONSTRAINT `ck_data_retention_activation` CHECK(`active` = 0 OR (
		`retention_seconds` IS NOT NULL AND `effective_at` IS NOT NULL AND `created_by_admin_id` IS NOT NULL
	))
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_data_retention_active_class` ON `data_retention_rules` (`record_class`) WHERE `active` = 1;--> statement-breakpoint

CREATE TRIGGER `trg_data_retention_identity_immutable`
BEFORE UPDATE ON `data_retention_rules`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`record_class` IS NOT NEW.`record_class`
	OR OLD.`policy_version` IS NOT NEW.`policy_version`
	OR OLD.`retention_seconds` IS NOT NEW.`retention_seconds`
	OR OLD.`effective_at` IS NOT NEW.`effective_at`
	OR OLD.`created_by_admin_id` IS NOT NEW.`created_by_admin_id`
	OR OLD.`created_at` IS NOT NEW.`created_at` OR NEW.`updated_at` < OLD.`updated_at`
	OR (OLD.`active` = 0 AND NEW.`active` = 1)
BEGIN
	SELECT RAISE(ABORT, 'data_retention_rule_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_data_retention_audit_insert`
AFTER INSERT ON `data_retention_rules`
BEGIN
	INSERT INTO `audit_log` (`id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `idempotency_key`, `metadata_json`, `created_at`)
	VALUES ('audit_retention_rule_' || NEW.`id`, 'admin', NEW.`created_by_admin_id`,
		CASE WHEN NEW.`active` = 1 THEN 'retention_rule_activated' ELSE 'retention_rule_created_inactive' END,
		'data_retention_rule', NEW.`id`, 'retention:' || NEW.`id` || ':created', '{}', NEW.`created_at`);
END;--> statement-breakpoint

CREATE TRIGGER `trg_data_retention_audit_deactivate`
AFTER UPDATE OF `active` ON `data_retention_rules`
WHEN OLD.`active` = 1 AND NEW.`active` = 0
BEGIN
	INSERT INTO `audit_log` (`id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `idempotency_key`, `metadata_json`, `created_at`)
	VALUES ('audit_retention_disabled_' || NEW.`id`, 'admin', NEW.`created_by_admin_id`,
		'retention_rule_deactivated', 'data_retention_rule', NEW.`id`,
		'retention:' || NEW.`id` || ':disabled', '{}', NEW.`updated_at`);
END;--> statement-breakpoint

CREATE TABLE `data_rights_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_customer_id` text,
	`actor_order_id` text,
	`actor_admin_id` text,
	`target_customer_id` text,
	`target_order_id` text,
	`requested_fields_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`retention_decision` text DEFAULT 'unevaluated' NOT NULL,
	`retention_policy_version` text,
	`retention_required_until` text,
	`active_dispute` integer,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`actor_customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_admin_id`) REFERENCES `administrators`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_data_rights_kind` CHECK(`kind` IN ('export', 'rectification', 'erasure')),
	CONSTRAINT `ck_data_rights_status` CHECK(`status` IN ('pending', 'completed', 'rejected')),
	CONSTRAINT `ck_data_rights_actor` CHECK(
		(`actor_type` = 'customer' AND `actor_customer_id` IS NOT NULL AND `actor_order_id` IS NULL AND `actor_admin_id` IS NULL
			AND `target_customer_id` = `actor_customer_id` AND `target_order_id` IS NULL)
		OR (`actor_type` = 'guest' AND `actor_customer_id` IS NULL AND `actor_order_id` IS NOT NULL AND `actor_admin_id` IS NULL
			AND `target_customer_id` IS NULL AND `target_order_id` = `actor_order_id`)
		OR (`actor_type` = 'admin' AND `actor_customer_id` IS NULL AND `actor_order_id` IS NULL AND `actor_admin_id` IS NOT NULL
			AND ((`target_customer_id` IS NOT NULL AND `target_order_id` IS NULL)
				OR (`target_customer_id` IS NULL AND `target_order_id` IS NOT NULL)))
	),
	CONSTRAINT `ck_data_rights_retention` CHECK(
		(`retention_decision` = 'unevaluated' AND `retention_policy_version` IS NULL
			AND `retention_required_until` IS NULL AND `active_dispute` IS NULL)
		OR (`retention_decision` IN ('retain', 'erase') AND `retention_policy_version` IS NOT NULL
			AND `retention_required_until` IS NOT NULL AND `active_dispute` IN (0, 1))
	),
	CONSTRAINT `ck_data_rights_completion` CHECK(
		(`status` = 'pending' AND `completed_at` IS NULL)
		OR (`status` IN ('completed', 'rejected') AND `completed_at` IS NOT NULL)
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_data_rights_idempotency` ON `data_rights_requests` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_data_rights_target_customer` ON `data_rights_requests` (`target_customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_data_rights_target_order` ON `data_rights_requests` (`target_order_id`,`created_at`);--> statement-breakpoint

CREATE TRIGGER `trg_data_rights_immutable_identity`
BEFORE UPDATE ON `data_rights_requests`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`kind` IS NOT NEW.`kind` OR OLD.`actor_type` IS NOT NEW.`actor_type`
	OR OLD.`actor_customer_id` IS NOT NEW.`actor_customer_id` OR OLD.`actor_order_id` IS NOT NEW.`actor_order_id`
	OR OLD.`actor_admin_id` IS NOT NEW.`actor_admin_id` OR OLD.`target_customer_id` IS NOT NEW.`target_customer_id`
	OR OLD.`target_order_id` IS NOT NEW.`target_order_id` OR OLD.`requested_fields_json` IS NOT NEW.`requested_fields_json`
	OR OLD.`idempotency_key` IS NOT NEW.`idempotency_key` OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN
	SELECT RAISE(ABORT, 'data_rights_request_identity_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_data_rights_terminal_append_only`
BEFORE UPDATE ON `data_rights_requests`
WHEN OLD.`status` IN ('completed', 'rejected')
BEGIN
	SELECT RAISE(ABORT, 'data_rights_request_is_terminal');
END;--> statement-breakpoint

CREATE TRIGGER `trg_data_rights_retention_decision_once`
BEFORE UPDATE ON `data_rights_requests`
WHEN (OLD.`retention_decision` <> NEW.`retention_decision`
	AND OLD.`retention_decision` <> 'unevaluated')
	OR (OLD.`retention_decision` = NEW.`retention_decision` AND (
		OLD.`retention_policy_version` IS NOT NEW.`retention_policy_version`
		OR OLD.`retention_required_until` IS NOT NEW.`retention_required_until`
		OR OLD.`active_dispute` IS NOT NEW.`active_dispute`
	))
BEGIN
	SELECT RAISE(ABORT, 'data_rights_retention_decision_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_data_rights_audit_insert`
AFTER INSERT ON `data_rights_requests`
BEGIN
	INSERT INTO `audit_log` (`id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `idempotency_key`, `metadata_json`, `created_at`)
	VALUES ('audit_data_rights_requested_' || NEW.`id`,
		CASE WHEN NEW.`actor_type` = 'guest' THEN 'system' ELSE NEW.`actor_type` END,
		COALESCE(NEW.`actor_customer_id`, NEW.`actor_admin_id`), 'data_rights_requested',
		'data_rights_request', NEW.`id`, 'data-rights:' || NEW.`id` || ':requested', '{}', NEW.`created_at`);
END;--> statement-breakpoint

CREATE TRIGGER `trg_data_rights_audit_terminal`
AFTER UPDATE OF `status` ON `data_rights_requests`
WHEN OLD.`status` = 'pending' AND NEW.`status` IN ('completed', 'rejected')
BEGIN
	INSERT INTO `audit_log` (`id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `idempotency_key`, `metadata_json`, `created_at`)
	VALUES ('audit_data_rights_terminal_' || NEW.`id`, 'system', NULL,
		'data_rights_' || NEW.`status`, 'data_rights_request', NEW.`id`,
		'data-rights:' || NEW.`id` || ':terminal', '{}', NEW.`completed_at`);
END;
