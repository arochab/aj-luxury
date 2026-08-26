-- A verified Stripe payment emits two distinct, durable customer records:
-- the order confirmation and the payment confirmation. Both retain the exact
-- provider event as their source while remaining independently idempotent.
DROP INDEX `ux_email_outbox_intent_source`;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_kind_intent_source`
ON `email_outbox` (`kind`,`transaction_intent`,`source_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_order_confirmation_order`
ON `email_outbox` (`order_id`) WHERE `kind` = 'order_confirmation'
  AND `source_event_id` NOT GLOB 'legacy:*'
  AND `source_event_id` <> 'compat:pending';--> statement-breakpoint

DROP TRIGGER `trg_email_outbox_validate_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_email_outbox_validate_insert`
BEFORE INSERT ON `email_outbox`
WHEN NEW.`status` <> 'pending' OR NEW.`attempts` <> 0
	OR NEW.`purged_at` IS NOT NULL
	OR NOT (
		(NEW.`kind` = 'order_confirmation' AND NEW.`source_event_id` = 'compat:pending'
			AND NEW.`provider_idempotency_key` = 'compat:pending')
		OR NEW.`provider_idempotency_key` = CASE
			WHEN NEW.`kind` = 'account_access' THEN 'account_access:' || NEW.`access_challenge_id`
			WHEN NEW.`kind` = 'payment_confirmation' THEN 'payment_confirmation:' || NEW.`order_id`
			WHEN NEW.`kind` = 'order_confirmation' THEN 'order_confirmation:' || NEW.`order_id`
			ELSE NEW.`kind` || ':' || NEW.`source_event_id`
		END
	)
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
DROP TRIGGER `trg_webhook_events_validate_processed`;--> statement-breakpoint
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
        WHERE `order_id` = NEW.`order_id` AND `kind` = 'order_confirmation'
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
END;--> statement-breakpoint
PRAGMA optimize;
