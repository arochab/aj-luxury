CREATE TABLE `late_payment_refund_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_event_id` text NOT NULL,
	`order_id` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`provider_checkout_session_id` text NOT NULL,
	`provider_payment_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`divergence_reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`idempotency_key` text NOT NULL,
	`lease_token_hash` text,
	`leased_at` text,
	`lease_expires_at` text,
	`provider_refund_id` text,
	`provider_receipt_fingerprint` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`last_error_code` text,
	`succeeded_at` text,
	`terminal_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`webhook_event_id`) REFERENCES `webhook_events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_late_payment_refund_amount" CHECK("late_payment_refund_intents"."amount_cents" > 0),
	CONSTRAINT "ck_late_payment_refund_currency" CHECK("late_payment_refund_intents"."currency" = 'EUR'),
	CONSTRAINT "ck_late_payment_refund_reason" CHECK("late_payment_refund_intents"."divergence_reason" IN (
        'stock_reservation_inactive_or_missing',
        'stock_reservation_expired_at_payment'
      )),
	CONSTRAINT "ck_late_payment_refund_status" CHECK("late_payment_refund_intents"."status" IN (
        'pending', 'claimed', 'succeeded', 'rejected', 'attention_required'
      )),
	CONSTRAINT "ck_late_payment_refund_attempts" CHECK("late_payment_refund_intents"."attempts" >= 0 AND "late_payment_refund_intents"."max_attempts" BETWEEN 1 AND 10
        AND "late_payment_refund_intents"."attempts" <= "late_payment_refund_intents"."max_attempts"),
	CONSTRAINT "ck_late_payment_refund_error" CHECK("late_payment_refund_intents"."last_error_code" IS NULL OR "late_payment_refund_intents"."last_error_code" IN (
        'outcome_unknown', 'provider_rejected', 'attempts_exhausted'
      )),
	CONSTRAINT "ck_late_payment_refund_hashes" CHECK(("late_payment_refund_intents"."lease_token_hash" IS NULL OR (
          length("late_payment_refund_intents"."lease_token_hash") = 64
          AND "late_payment_refund_intents"."lease_token_hash" = lower("late_payment_refund_intents"."lease_token_hash")
          AND "late_payment_refund_intents"."lease_token_hash" NOT GLOB '*[^0-9a-f]*'
        )) AND ("late_payment_refund_intents"."provider_receipt_fingerprint" IS NULL OR (
          length("late_payment_refund_intents"."provider_receipt_fingerprint") = 64
          AND "late_payment_refund_intents"."provider_receipt_fingerprint" = lower("late_payment_refund_intents"."provider_receipt_fingerprint")
          AND "late_payment_refund_intents"."provider_receipt_fingerprint" NOT GLOB '*[^0-9a-f]*'
        ))),
	CONSTRAINT "ck_late_payment_refund_state_shape" CHECK(("late_payment_refund_intents"."status" = 'pending'
          AND "late_payment_refund_intents"."attempts" = 0
          AND "late_payment_refund_intents"."lease_token_hash" IS NULL
          AND "late_payment_refund_intents"."leased_at" IS NULL
          AND "late_payment_refund_intents"."lease_expires_at" IS NULL
          AND "late_payment_refund_intents"."provider_refund_id" IS NULL
          AND "late_payment_refund_intents"."provider_receipt_fingerprint" IS NULL
          AND "late_payment_refund_intents"."last_error_code" IS NULL
          AND "late_payment_refund_intents"."succeeded_at" IS NULL
          AND "late_payment_refund_intents"."terminal_at" IS NULL)
        OR ("late_payment_refund_intents"."status" = 'claimed'
          AND "late_payment_refund_intents"."attempts" > 0
          AND "late_payment_refund_intents"."lease_token_hash" IS NOT NULL
          AND "late_payment_refund_intents"."leased_at" IS NOT NULL
          AND "late_payment_refund_intents"."lease_expires_at" IS NOT NULL
          AND "late_payment_refund_intents"."provider_receipt_fingerprint" IS NULL
          AND ("late_payment_refund_intents"."last_error_code" IS NULL OR "late_payment_refund_intents"."last_error_code" = 'outcome_unknown')
          AND "late_payment_refund_intents"."succeeded_at" IS NULL
          AND "late_payment_refund_intents"."terminal_at" IS NULL)
        OR ("late_payment_refund_intents"."status" = 'succeeded'
          AND "late_payment_refund_intents"."lease_token_hash" IS NULL
          AND "late_payment_refund_intents"."leased_at" IS NULL
          AND "late_payment_refund_intents"."lease_expires_at" IS NULL
          AND "late_payment_refund_intents"."provider_refund_id" IS NOT NULL
          AND "late_payment_refund_intents"."provider_receipt_fingerprint" IS NOT NULL
          AND "late_payment_refund_intents"."last_error_code" IS NULL
          AND "late_payment_refund_intents"."succeeded_at" IS NOT NULL
          AND "late_payment_refund_intents"."terminal_at" = "late_payment_refund_intents"."succeeded_at")
        OR ("late_payment_refund_intents"."status" = 'rejected'
          AND "late_payment_refund_intents"."lease_token_hash" IS NULL
          AND "late_payment_refund_intents"."leased_at" IS NULL
          AND "late_payment_refund_intents"."lease_expires_at" IS NULL
          AND "late_payment_refund_intents"."provider_receipt_fingerprint" IS NULL
          AND "late_payment_refund_intents"."last_error_code" = 'provider_rejected'
          AND "late_payment_refund_intents"."succeeded_at" IS NULL
          AND "late_payment_refund_intents"."terminal_at" IS NOT NULL)
        OR ("late_payment_refund_intents"."status" = 'attention_required'
          AND "late_payment_refund_intents"."lease_token_hash" IS NULL
          AND "late_payment_refund_intents"."leased_at" IS NULL
          AND "late_payment_refund_intents"."lease_expires_at" IS NULL
          AND "late_payment_refund_intents"."provider_receipt_fingerprint" IS NULL
          AND "late_payment_refund_intents"."last_error_code" = 'attempts_exhausted'
          AND "late_payment_refund_intents"."succeeded_at" IS NULL
          AND "late_payment_refund_intents"."terminal_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_late_payment_refund_webhook` ON `late_payment_refund_intents` (`webhook_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_late_payment_refund_order` ON `late_payment_refund_intents` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_late_payment_refund_payment` ON `late_payment_refund_intents` (`provider_payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_late_payment_refund_idempotency` ON `late_payment_refund_intents` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_late_payment_refund_provider_refund` ON `late_payment_refund_intents` (`provider_refund_id`) WHERE "late_payment_refund_intents"."provider_refund_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_late_payment_refund_active_lease` ON `late_payment_refund_intents` (`lease_token_hash`) WHERE "late_payment_refund_intents"."lease_token_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_late_payment_refund_dispatch` ON `late_payment_refund_intents` (`status`,`lease_expires_at`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_payments_order_active_checkout`
ON `payments` (`order_id`)
WHERE `provider` = 'stripe' AND `status` IN ('created', 'requires_action');
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
      AND customer_order.`status` = 'pending_payment'
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
CREATE TRIGGER `trg_late_payment_refund_lock_identity`
BEFORE UPDATE ON `late_payment_refund_intents`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`webhook_event_id` IS NOT NEW.`webhook_event_id`
  OR OLD.`order_id` IS NOT NEW.`order_id`
  OR OLD.`provider_event_id` IS NOT NEW.`provider_event_id`
  OR OLD.`provider_checkout_session_id` IS NOT NEW.`provider_checkout_session_id`
  OR OLD.`provider_payment_id` IS NOT NEW.`provider_payment_id`
  OR OLD.`amount_cents` IS NOT NEW.`amount_cents`
  OR OLD.`currency` IS NOT NEW.`currency`
  OR OLD.`divergence_reason` IS NOT NEW.`divergence_reason`
  OR OLD.`idempotency_key` IS NOT NEW.`idempotency_key`
  OR OLD.`max_attempts` IS NOT NEW.`max_attempts`
  OR OLD.`created_at` IS NOT NEW.`created_at`
  OR (OLD.`provider_refund_id` IS NOT NULL
    AND OLD.`provider_refund_id` IS NOT NEW.`provider_refund_id`)
BEGIN
  SELECT RAISE(ABORT, 'late_payment_refund_identity_is_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_late_payment_refund_validate_transition`
BEFORE UPDATE ON `late_payment_refund_intents`
WHEN NOT (
  (OLD.`status` = 'pending' AND NEW.`status` = 'claimed'
    AND NEW.`attempts` = OLD.`attempts` + 1)
  OR (OLD.`status` = 'claimed' AND NEW.`status` = 'claimed'
    AND NEW.`attempts` IN (OLD.`attempts`, OLD.`attempts` + 1))
  OR (OLD.`status` = 'claimed' AND NEW.`status` IN (
      'succeeded', 'rejected', 'attention_required'
    ) AND NEW.`attempts` = OLD.`attempts`)
)
BEGIN
  SELECT RAISE(ABORT, 'late_payment_refund_transition_not_allowed');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_late_payment_refund_validate_claim_time`
BEFORE UPDATE ON `late_payment_refund_intents`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at` < OLD.`updated_at`
  OR (NEW.`status` = 'claimed' AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`leased_at`) IS NOT NEW.`leased_at`
    OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`lease_expires_at`) IS NOT NEW.`lease_expires_at`
    OR NEW.`lease_expires_at` <= NEW.`leased_at`
  ))
BEGIN
  SELECT RAISE(ABORT, 'late_payment_refund_timestamp_invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_late_payment_refund_validate_success`
BEFORE UPDATE ON `late_payment_refund_intents`
WHEN NEW.`status` = 'succeeded' AND OLD.`status` <> 'succeeded'
  AND NOT EXISTS (
    SELECT 1 FROM `orders` AS customer_order
    WHERE customer_order.`id` = NEW.`order_id`
      AND customer_order.`status` = 'cancelled'
      AND customer_order.`paid_at` IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM `stock_reservations`
        WHERE `cart_id` = customer_order.`cart_id`
          AND `status` IN ('active', 'converted')
      )
      AND NOT EXISTS (
        SELECT 1 FROM `inventory_movements`
        WHERE `reference_type` = 'order'
          AND `reference_id` = customer_order.`id` AND `kind` = 'sale'
      )
      AND NOT EXISTS (
        SELECT 1 FROM `payments`
        WHERE `order_id` = customer_order.`id`
          AND `status` IN ('succeeded', 'refunded')
      )
      AND EXISTS (
        SELECT 1 FROM `audit_log`
        WHERE `action` = 'late_payment_refund_succeeded'
          AND `entity_type` = 'late_payment_refund_intent'
          AND `entity_id` = NEW.`id`
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'late_payment_refund_success_incomplete');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_late_payment_refund_terminal_immutable`
BEFORE UPDATE ON `late_payment_refund_intents`
WHEN OLD.`status` IN ('succeeded', 'rejected', 'attention_required')
BEGIN
  SELECT RAISE(ABORT, 'late_payment_refund_terminal_is_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_late_payment_refund_retain`
BEFORE DELETE ON `late_payment_refund_intents`
BEGIN
  SELECT RAISE(ABORT, 'late_payment_refund_evidence_is_immutable');
END;
--> statement-breakpoint
DROP TRIGGER `trg_webhook_events_validate_processed`;
--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_validate_processed`
BEFORE UPDATE OF `status` ON `webhook_events`
WHEN NEW.`status` = 'processed'
BEGIN
  SELECT RAISE(ABORT, 'commerce_webhook_processing_incomplete')
  WHERE NOT (
    (
      EXISTS (
        SELECT 1 FROM `orders` AS customer_order
        INNER JOIN `carts` AS cart ON cart.`id` = customer_order.`cart_id`
        INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
        WHERE customer_order.`id` = NEW.`order_id`
          AND customer_order.`status` = 'paid' AND cart.`status` = 'converted'
          AND payment.`provider` = NEW.`provider`
          AND payment.`provider_session_id` = NEW.`provider_payment_id`
          AND payment.`status` = 'succeeded'
          AND payment.`amount_cents` = NEW.`amount_cents`
          AND payment.`currency` = NEW.`currency`
      )
      AND EXISTS (
        SELECT 1 FROM `email_outbox`
        WHERE `order_id` = NEW.`order_id` AND `kind` = 'payment_confirmation'
      )
      AND EXISTS (
        SELECT 1 FROM `audit_log`
        WHERE `entity_type` = 'order' AND `entity_id` = NEW.`order_id`
          AND `action` = 'payment_succeeded'
      )
    )
    OR EXISTS (
      SELECT 1 FROM `late_payment_refund_intents` AS intent
      INNER JOIN `audit_log` AS evidence
        ON evidence.`entity_type` = 'late_payment_refund_intent'
        AND evidence.`entity_id` = intent.`id`
        AND evidence.`action` = 'late_payment_refund_obligation_created'
      WHERE intent.`webhook_event_id` = NEW.`id`
        AND intent.`provider_event_id` = NEW.`provider_event_id`
        AND intent.`order_id` = NEW.`order_id`
        AND intent.`provider_payment_id` = NEW.`provider_payment_id`
        AND intent.`amount_cents` = NEW.`amount_cents`
        AND intent.`currency` = NEW.`currency`
        AND intent.`status` = 'pending'
    )
  );
END;
