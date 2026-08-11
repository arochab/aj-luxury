DROP TRIGGER IF EXISTS `trg_cart_lines_validate_catalog_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_cart_lines_validate_catalog_insert`
BEFORE INSERT ON `cart_lines`
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `carts` AS cart
    INNER JOIN `variants` AS variant ON variant.`id` = NEW.`variant_id`
    INNER JOIN `products` AS product ON product.`id` = variant.`product_id`
    WHERE cart.`id` = NEW.`cart_id`
      AND cart.`status` = 'open'
      AND datetime(cart.`expires_at`) > CURRENT_TIMESTAMP
      AND cart.`expires_at` > NEW.`created_at`
      AND variant.`active` = 1
      AND product.`status` = 'active'
      AND product.`currency` = cart.`currency`
      AND product.`price_cents` = NEW.`unit_price_cents`
      AND NOT EXISTS (
        SELECT 1
        FROM `stock_reservations` AS reservation
        WHERE reservation.`cart_id` = cart.`id`
      )
      AND NOT EXISTS (
        SELECT 1
        FROM `orders` AS customer_order
        WHERE customer_order.`cart_id` = cart.`id`
      )
  ) THEN RAISE(ABORT, 'commerce_cart_line_catalog_mismatch') END;
END;--> statement-breakpoint
CREATE TRIGGER `trg_order_lines_validate_pending_insert`
BEFORE INSERT ON `order_lines`
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `orders` AS customer_order
    WHERE customer_order.`id` = NEW.`order_id`
      AND customer_order.`status` = 'pending_payment'
  ) THEN RAISE(ABORT, 'commerce_order_line_insert_not_allowed') END;
END;--> statement-breakpoint
CREATE TRIGGER `trg_order_lines_immutable_update`
BEFORE UPDATE ON `order_lines`
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_line_snapshot_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_order_lines_retain_snapshot`
BEFORE DELETE ON `order_lines`
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_line_snapshot_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_cart_lines_validate_delete`
BEFORE DELETE ON `cart_lines`
WHEN EXISTS (
  SELECT 1 FROM `carts` WHERE `id` = OLD.`cart_id`
)
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `carts` AS cart
    WHERE cart.`id` = OLD.`cart_id`
      AND cart.`status` = 'open'
      AND datetime(cart.`expires_at`) > CURRENT_TIMESTAMP
      AND NOT EXISTS (
        SELECT 1
        FROM `stock_reservations` AS reservation
        WHERE reservation.`cart_id` = cart.`id`
      )
      AND NOT EXISTS (
        SELECT 1
        FROM `orders` AS customer_order
        WHERE customer_order.`cart_id` = cart.`id`
      )
  ) THEN RAISE(ABORT, 'commerce_cart_line_delete_not_allowed') END;
END;--> statement-breakpoint
CREATE TRIGGER `trg_carts_require_empty_delete`
BEFORE DELETE ON `carts`
WHEN EXISTS (
    SELECT 1 FROM `cart_lines` WHERE `cart_id` = OLD.`id`
  )
  OR EXISTS (
    SELECT 1 FROM `stock_reservations` WHERE `cart_id` = OLD.`id`
  )
  OR EXISTS (
    SELECT 1 FROM `orders` WHERE `cart_id` = OLD.`id`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_cart_delete_requires_empty_cart');
END;--> statement-breakpoint
CREATE TRIGGER `trg_orders_guard_payment_state`
BEFORE UPDATE OF `status` ON `orders`
WHEN (NEW.`status` = 'paid' AND OLD.`status` <> 'pending_payment')
  OR (NEW.`status` = 'pending_payment' AND OLD.`status` <> 'pending_payment')
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_payment_state_transition_not_allowed');
END;--> statement-breakpoint
CREATE TRIGGER `trg_orders_require_paid_at_transition`
BEFORE UPDATE OF `status`, `paid_at` ON `orders`
WHEN OLD.`status` = 'pending_payment' AND NEW.`status` = 'paid'
  AND (
    NEW.`paid_at` IS NULL
    OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`paid_at`) IS NULL
    OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`paid_at`) <> NEW.`paid_at`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_paid_at_required');
END;--> statement-breakpoint
CREATE TRIGGER `trg_orders_lock_snapshot_update`
BEFORE UPDATE ON `orders`
WHEN OLD.`id` IS NOT NEW.`id`
    OR OLD.`order_number` IS NOT NEW.`order_number`
    OR OLD.`cart_id` IS NOT NEW.`cart_id`
    OR OLD.`customer_id` IS NOT NEW.`customer_id`
    OR OLD.`email` IS NOT NEW.`email`
    OR OLD.`currency` IS NOT NEW.`currency`
    OR OLD.`subtotal_cents` IS NOT NEW.`subtotal_cents`
    OR OLD.`shipping_cents` IS NOT NEW.`shipping_cents`
    OR OLD.`tax_cents` IS NOT NEW.`tax_cents`
    OR OLD.`total_cents` IS NOT NEW.`total_cents`
    OR OLD.`shipping_country_code` IS NOT NEW.`shipping_country_code`
    OR OLD.`shipping_address_json` IS NOT NEW.`shipping_address_json`
    OR OLD.`billing_address_json` IS NOT NEW.`billing_address_json`
    OR OLD.`terms_version` IS NOT NEW.`terms_version`
    OR OLD.`privacy_version` IS NOT NEW.`privacy_version`
    OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_snapshot_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_orders_guard_paid_at`
BEFORE UPDATE OF `paid_at` ON `orders`
WHEN OLD.`paid_at` IS NOT NEW.`paid_at`
  AND NOT (
    OLD.`status` = 'pending_payment'
    AND NEW.`status` = 'paid'
    AND OLD.`paid_at` IS NULL
    AND NEW.`paid_at` IS NOT NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_paid_at_transition_not_allowed');
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_lock_identity_update`
BEFORE UPDATE ON `payments`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`order_id` IS NOT NEW.`order_id`
  OR OLD.`provider` IS NOT NEW.`provider`
  OR OLD.`provider_session_id` IS NOT NEW.`provider_session_id`
  OR OLD.`amount_cents` IS NOT NEW.`amount_cents`
  OR OLD.`currency` IS NOT NEW.`currency`
  OR OLD.`idempotency_key` IS NOT NEW.`idempotency_key`
  OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_payment_snapshot_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_require_verified_event_update`
BEFORE UPDATE OF `status` ON `payments`
WHEN OLD.`status` <> 'succeeded' AND NEW.`status` = 'succeeded'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `webhook_events`
    WHERE `provider` = NEW.`provider`
      AND `provider_payment_id` = NEW.`provider_session_id`
      AND `order_id` = NEW.`order_id`
      AND `amount_cents` = NEW.`amount_cents`
      AND `currency` = NEW.`currency`
      AND `status` IN ('verified', 'processed')
  ) THEN RAISE(ABORT, 'commerce_payment_requires_verified_event') END;
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_lock_succeeded_update`
BEFORE UPDATE ON `payments`
WHEN OLD.`status` = 'succeeded'
BEGIN
  SELECT RAISE(ABORT, 'commerce_succeeded_payment_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_retain_succeeded_delete`
BEFORE DELETE ON `payments`
WHEN OLD.`status` = 'succeeded'
BEGIN
  SELECT RAISE(ABORT, 'commerce_succeeded_payment_is_immutable');
END;
