DROP TRIGGER IF EXISTS `trg_cart_lines_validate_catalog_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_cart_lines_validate_catalog_insert`
BEFORE INSERT ON `cart_lines`
BEGIN
  SELECT RAISE(ABORT, 'commerce_cart_line_catalog_mismatch') WHERE NOT EXISTS (
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
      AND NEW.`updated_at` = NEW.`created_at`
      AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) = NEW.`created_at`
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
  );
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_cart_lines_validate_quantity_update`;--> statement-breakpoint
CREATE TRIGGER `trg_cart_lines_validate_quantity_update`
BEFORE UPDATE OF `quantity` ON `cart_lines`
WHEN OLD.`quantity` IS NOT NEW.`quantity`
BEGIN
  SELECT RAISE(ABORT, 'commerce_cart_line_quantity_update_not_allowed') WHERE NOT EXISTS (
    SELECT 1
    FROM `carts` AS cart
    WHERE cart.`id` = OLD.`cart_id`
      AND cart.`status` = 'open'
      AND datetime(cart.`expires_at`) > CURRENT_TIMESTAMP
      AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) = NEW.`updated_at`
      AND NEW.`updated_at` > OLD.`updated_at`
      AND NOT EXISTS (
        SELECT 1 FROM `stock_reservations`
        WHERE `cart_id` = OLD.`cart_id`
      )
      AND NOT EXISTS (
        SELECT 1 FROM `orders`
        WHERE `cart_id` = OLD.`cart_id`
      )
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_order_lines_validate_pending_insert`
BEFORE INSERT ON `order_lines`
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_line_insert_not_allowed') WHERE NOT EXISTS (
    SELECT 1
    FROM `orders` AS customer_order
    INNER JOIN `carts` AS cart ON cart.`id` = customer_order.`cart_id`
    INNER JOIN `cart_lines` AS cart_line
      ON cart_line.`cart_id` = cart.`id`
      AND cart_line.`variant_id` = NEW.`variant_id`
    INNER JOIN `variants` AS variant ON variant.`id` = NEW.`variant_id`
    INNER JOIN `products` AS product ON product.`id` = variant.`product_id`
    WHERE customer_order.`id` = NEW.`order_id`
      AND customer_order.`status` = 'pending_payment'
      AND cart.`status` = 'open'
      AND datetime(cart.`expires_at`) > CURRENT_TIMESTAMP
      AND cart.`expires_at` > NEW.`created_at`
      AND NEW.`created_at` >= customer_order.`created_at`
      AND NEW.`created_at` >= cart_line.`created_at`
      AND NEW.`quantity` = cart_line.`quantity`
      AND NEW.`unit_price_cents` = cart_line.`unit_price_cents`
      AND NEW.`line_total_cents` = cart_line.`unit_price_cents` * cart_line.`quantity`
      AND NEW.`internal_reference` = variant.`internal_reference`
      AND NEW.`product_name` = product.`name`
      AND NEW.`color_name` = variant.`color_name`
      AND NEW.`size` = variant.`size`
      AND NOT EXISTS (
        SELECT 1 FROM `order_lines` AS existing_line
        WHERE existing_line.`order_id` = NEW.`order_id`
          AND existing_line.`variant_id` = NEW.`variant_id`
      )
  )
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  ;
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
DROP TRIGGER IF EXISTS `trg_orders_validate_paid_transition`;--> statement-breakpoint
CREATE TRIGGER `trg_orders_validate_paid_transition`
BEFORE UPDATE OF `status` ON `orders`
WHEN OLD.`status` = 'pending_payment' AND NEW.`status` = 'paid'
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_payment_mismatch')
  WHERE NEW.`paid_at` IS NULL OR NOT EXISTS (
    SELECT 1 FROM `carts`
    WHERE `id` = NEW.`cart_id` AND `status` = 'open'
  ) OR NOT EXISTS (
    SELECT 1 FROM `payments`
    WHERE `order_id` = NEW.`id`
      AND `status` = 'succeeded'
      AND `amount_cents` = NEW.`total_cents`
      AND `currency` = NEW.`currency`
  ) OR NOT EXISTS (
    SELECT 1 FROM `stock_reservations`
    WHERE `converted_order_id` = NEW.`id` AND `status` = 'converted'
  ) OR EXISTS (
    SELECT 1 FROM `stock_reservations`
    WHERE `cart_id` = NEW.`cart_id` AND `status` = 'active'
  ) OR COALESCE((
    SELECT SUM(`line_total_cents`) FROM `order_lines`
    WHERE `order_id` = NEW.`id`
  ), -1) <> NEW.`subtotal_cents`
  ;

  SELECT RAISE(ABORT, 'commerce_order_payment_mismatch') WHERE EXISTS (
    SELECT `variant_id`, SUM(`quantity`) AS quantity
    FROM `stock_reservations`
    WHERE `converted_order_id` = NEW.`id` AND `status` = 'converted'
    GROUP BY `variant_id`
    EXCEPT
    SELECT `variant_id`, SUM(`quantity`) AS quantity
    FROM `order_lines`
    WHERE `order_id` = NEW.`id`
    GROUP BY `variant_id`
  ) OR EXISTS (
    SELECT `variant_id`, SUM(`quantity`) AS quantity
    FROM `order_lines`
    WHERE `order_id` = NEW.`id`
    GROUP BY `variant_id`
    EXCEPT
    SELECT `variant_id`, SUM(`quantity`) AS quantity
    FROM `stock_reservations`
    WHERE `converted_order_id` = NEW.`id` AND `status` = 'converted'
    GROUP BY `variant_id`
  );

  SELECT RAISE(ABORT, 'commerce_order_payment_mismatch') WHERE EXISTS (
    SELECT `variant_id`, `unit_price_cents`, SUM(`quantity`) AS quantity,
      SUM(`line_total_cents`) AS line_total_cents
    FROM `order_lines`
    WHERE `order_id` = NEW.`id`
    GROUP BY `variant_id`, `unit_price_cents`
    EXCEPT
    SELECT `variant_id`, `unit_price_cents`, SUM(`quantity`) AS quantity,
      SUM(`unit_price_cents` * `quantity`) AS line_total_cents
    FROM `cart_lines`
    WHERE `cart_id` = NEW.`cart_id`
    GROUP BY `variant_id`, `unit_price_cents`
  ) OR EXISTS (
    SELECT `variant_id`, `unit_price_cents`, SUM(`quantity`) AS quantity,
      SUM(`unit_price_cents` * `quantity`) AS line_total_cents
    FROM `cart_lines`
    WHERE `cart_id` = NEW.`cart_id`
    GROUP BY `variant_id`, `unit_price_cents`
    EXCEPT
    SELECT `variant_id`, `unit_price_cents`, SUM(`quantity`) AS quantity,
      SUM(`line_total_cents`) AS line_total_cents
    FROM `order_lines`
    WHERE `order_id` = NEW.`id`
    GROUP BY `variant_id`, `unit_price_cents`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_cart_lines_validate_delete`
BEFORE DELETE ON `cart_lines`
WHEN EXISTS (
  SELECT 1 FROM `carts` WHERE `id` = OLD.`cart_id`
)
BEGIN
  SELECT RAISE(ABORT, 'commerce_cart_line_delete_not_allowed') WHERE NOT EXISTS (
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
  );
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

DROP TRIGGER IF EXISTS `trg_inventory_seed_ledger`;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_seed_ledger`
AFTER INSERT ON `inventory`
WHEN NEW.`physical_quantity` > 0
BEGIN
  INSERT INTO `inventory_movements` (
    `id`, `variant_id`, `kind`, `quantity`, `reference_type`, `reference_id`,
    `actor_type`, `actor_id`, `idempotency_key`, `created_at`
  ) VALUES (
    'movement_seed_' || NEW.`variant_id`, NEW.`variant_id`, 'seed',
    NEW.`physical_quantity`, 'catalog_seed', 'aj_launch_2026', 'system', NULL,
    'seed:' || NEW.`variant_id`, NEW.`updated_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_require_zero_lifecycle_insert`
BEFORE INSERT ON `inventory`
WHEN NEW.`active_reserved_quantity` <> 0
  OR NEW.`sold_quantity` <> 0
  OR NEW.`version` <> 0
BEGIN
  SELECT RAISE(ABORT, 'commerce_inventory_lifecycle_must_start_at_zero');
END;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_validate_insert_timestamp`
BEFORE INSERT ON `inventory`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_inventory_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_validate_update_timestamp`
BEFORE UPDATE OF `updated_at` ON `inventory`
WHEN OLD.`updated_at` IS NOT NEW.`updated_at`
  AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
    OR NEW.`updated_at` <= OLD.`updated_at`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_inventory_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_validate_reservation_counters`
BEFORE UPDATE ON `inventory`
WHEN NEW.`active_reserved_quantity` <> COALESCE((
    SELECT SUM(`quantity`)
    FROM `stock_reservations`
    WHERE `variant_id` = NEW.`variant_id` AND `status` = 'active'
  ), 0)
  OR NEW.`sold_quantity` <> COALESCE((
    SELECT SUM(`quantity`)
    FROM `stock_reservations`
    WHERE `variant_id` = NEW.`variant_id` AND `status` = 'converted'
  ), 0)
  OR (
    (
      OLD.`active_reserved_quantity` IS NOT NEW.`active_reserved_quantity`
      OR OLD.`sold_quantity` IS NOT NEW.`sold_quantity`
    )
    AND NEW.`version` <> OLD.`version` + 1
  )
  OR (
    OLD.`active_reserved_quantity` IS NEW.`active_reserved_quantity`
    AND OLD.`sold_quantity` IS NEW.`sold_quantity`
    AND OLD.`physical_quantity` IS NEW.`physical_quantity`
    AND OLD.`gift_reserve_quantity` IS NEW.`gift_reserve_quantity`
    AND OLD.`safety_reserve_quantity` IS NEW.`safety_reserve_quantity`
    AND OLD.`version` IS NOT NEW.`version`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_inventory_reservation_counters_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_retain_delete`
BEFORE DELETE ON `inventory`
BEGIN
  SELECT RAISE(ABORT, 'commerce_inventory_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_validate_stock_movement_update`
BEFORE UPDATE ON `inventory`
WHEN OLD.`physical_quantity` IS NOT NEW.`physical_quantity`
  OR OLD.`gift_reserve_quantity` IS NOT NEW.`gift_reserve_quantity`
  OR OLD.`safety_reserve_quantity` IS NOT NEW.`safety_reserve_quantity`
BEGIN
  SELECT RAISE(ABORT, 'commerce_inventory_stock_movement_required') WHERE (
    (OLD.`physical_quantity` IS NOT NEW.`physical_quantity`)
    + (OLD.`gift_reserve_quantity` IS NOT NEW.`gift_reserve_quantity`)
    + (OLD.`safety_reserve_quantity` IS NOT NEW.`safety_reserve_quantity`)
  ) <> 1
  OR NEW.`version` <> OLD.`version` + 1
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at` <= OLD.`updated_at`
  OR NOT EXISTS (
    SELECT 1
    FROM `inventory_movements` AS movement
    WHERE movement.`variant_id` = NEW.`variant_id`
      AND movement.`created_at` = NEW.`updated_at`
      AND (
        (
          OLD.`physical_quantity` IS NOT NEW.`physical_quantity`
          AND movement.`kind` = 'adjustment'
          AND movement.`reference_type` = CASE
            WHEN NEW.`physical_quantity` > OLD.`physical_quantity`
              THEN 'physical_increase'
            ELSE 'physical_decrease'
          END
          AND movement.`quantity` = ABS(
            NEW.`physical_quantity` - OLD.`physical_quantity`
          )
        )
        OR (
          OLD.`gift_reserve_quantity` IS NOT NEW.`gift_reserve_quantity`
          AND movement.`kind` = 'gift_allocation'
          AND movement.`reference_type` = CASE
            WHEN NEW.`gift_reserve_quantity` > OLD.`gift_reserve_quantity`
              THEN 'gift_reserve_increase'
            ELSE 'gift_reserve_decrease'
          END
          AND movement.`quantity` = ABS(
            NEW.`gift_reserve_quantity` - OLD.`gift_reserve_quantity`
          )
        )
        OR (
          OLD.`safety_reserve_quantity` IS NOT NEW.`safety_reserve_quantity`
          AND movement.`kind` = 'safety_allocation'
          AND movement.`reference_type` = CASE
            WHEN NEW.`safety_reserve_quantity` > OLD.`safety_reserve_quantity`
              THEN 'safety_reserve_increase'
            ELSE 'safety_reserve_decrease'
          END
          AND movement.`quantity` = ABS(
            NEW.`safety_reserve_quantity` - OLD.`safety_reserve_quantity`
          )
        )
      )
  );
END;--> statement-breakpoint

CREATE TRIGGER `trg_stock_reservations_validate_insert_timestamp`
BEFORE INSERT ON `stock_reservations`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`expires_at`) IS NOT NEW.`expires_at`
  OR NEW.`updated_at` <> NEW.`created_at`
  OR NEW.`expires_at` <= NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_reservation_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_require_active_insert`
BEFORE INSERT ON `stock_reservations`
WHEN NEW.`status` <> 'active'
  OR NEW.`converted_order_id` IS NOT NULL
  OR NEW.`last_transition_key` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'commerce_reservation_insert_must_be_active');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_validate_cart_line_insert`
BEFORE INSERT ON `stock_reservations`
WHEN NOT EXISTS (
    SELECT 1
    FROM `stock_reservations` AS existing
    WHERE existing.`id` = NEW.`id`
      AND existing.`cart_id` = NEW.`cart_id`
      AND existing.`variant_id` = NEW.`variant_id`
      AND existing.`quantity` = NEW.`quantity`
      AND existing.`idempotency_key` = NEW.`idempotency_key`
      AND existing.`expires_at` = NEW.`expires_at`
      AND existing.`created_at` = NEW.`created_at`
  )
  AND NOT EXISTS (
    SELECT 1
    FROM `cart_lines` AS line
    WHERE line.`cart_id` = NEW.`cart_id`
      AND line.`variant_id` = NEW.`variant_id`
      AND line.`quantity` >= NEW.`quantity` + COALESCE((
        SELECT SUM(existing_active.`quantity`)
        FROM `stock_reservations` AS existing_active
        WHERE existing_active.`cart_id` = NEW.`cart_id`
          AND existing_active.`variant_id` = NEW.`variant_id`
          AND existing_active.`status` = 'active'
      ), 0)
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_reservation_cart_line_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_lock_identity_update`
BEFORE UPDATE ON `stock_reservations`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`cart_id` IS NOT NEW.`cart_id`
  OR OLD.`variant_id` IS NOT NEW.`variant_id`
  OR OLD.`quantity` IS NOT NEW.`quantity`
  OR OLD.`idempotency_key` IS NOT NEW.`idempotency_key`
  OR OLD.`expires_at` IS NOT NEW.`expires_at`
  OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_reservation_identity_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_require_transition_update`
BEFORE UPDATE ON `stock_reservations`
WHEN OLD.`status` = 'active' AND NEW.`status` = 'active'
BEGIN
  SELECT RAISE(ABORT, 'commerce_reservation_update_requires_transition');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_lock_terminal_update`
BEFORE UPDATE ON `stock_reservations`
WHEN OLD.`status` <> 'active'
BEGIN
  SELECT RAISE(ABORT, 'commerce_terminal_reservation_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_validate_transition_payload`
BEFORE UPDATE OF `status`, `converted_order_id`, `last_transition_key`
ON `stock_reservations`
WHEN OLD.`status` = 'active'
  AND NEW.`status` <> OLD.`status`
  AND (
    NEW.`last_transition_key` IS NULL
    OR (NEW.`status` = 'converted' AND NEW.`converted_order_id` IS NULL)
    OR (NEW.`status` <> 'converted' AND NEW.`converted_order_id` IS NOT NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_reservation_transition_proof_missing');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_validate_transition_timestamp`
BEFORE UPDATE OF `status`, `updated_at` ON `stock_reservations`
WHEN OLD.`status` = 'active'
  AND NEW.`status` <> OLD.`status`
  AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
    OR NEW.`updated_at` <= OLD.`updated_at`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_reservation_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_retain_delete`
BEFORE DELETE ON `stock_reservations`
BEGIN
  SELECT RAISE(ABORT, 'commerce_reservation_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_orders_validate_insert_timestamp`
BEFORE INSERT ON `orders`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at` <> NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_orders_require_pending_insert`
BEFORE INSERT ON `orders`
WHEN NEW.`status` <> 'pending_payment' OR NEW.`paid_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_insert_must_be_pending');
END;--> statement-breakpoint
CREATE TRIGGER `trg_orders_guard_payment_state`
BEFORE UPDATE OF `status` ON `orders`
WHEN OLD.`status` <> NEW.`status`
  AND NOT (
    (OLD.`status` = 'pending_payment' AND NEW.`status` = 'paid')
    OR (
      OLD.`status` = 'pending_payment' AND NEW.`status` = 'cancelled'
      AND NOT EXISTS (
        SELECT 1 FROM `payments`
        WHERE `order_id` = OLD.`id` AND `status` IN ('succeeded', 'refunded')
      )
      AND NOT EXISTS (
        SELECT 1 FROM `stock_reservations`
        WHERE `cart_id` = OLD.`cart_id` AND `status` IN ('active', 'converted')
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_invalid_order_transition');
END;--> statement-breakpoint
CREATE TRIGGER `trg_orders_validate_status_timestamp`
BEFORE UPDATE OF `status`, `updated_at` ON `orders`
WHEN OLD.`status` <> NEW.`status`
  AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
    OR NEW.`updated_at` <= OLD.`updated_at`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_orders_lock_updated_at_without_transition`
BEFORE UPDATE OF `updated_at` ON `orders`
WHEN OLD.`status` = NEW.`status`
  AND OLD.`updated_at` IS NOT NEW.`updated_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_timestamp_requires_transition');
END;--> statement-breakpoint
CREATE TRIGGER `trg_orders_require_paid_at_transition`
BEFORE UPDATE OF `status`, `paid_at` ON `orders`
WHEN OLD.`status` = 'pending_payment' AND NEW.`status` = 'paid'
  AND (
    NEW.`paid_at` IS NULL
    OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`paid_at`) IS NOT NEW.`paid_at`
    OR NEW.`paid_at` < OLD.`created_at`
    OR NEW.`paid_at` > NEW.`updated_at`
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

DROP TRIGGER IF EXISTS `trg_payments_require_verified_event_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_payments_validate_insert_timestamp`
BEFORE INSERT ON `payments`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
  OR NEW.`updated_at` < NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_payment_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_validate_insert_state`
BEFORE INSERT ON `payments`
WHEN NEW.`status` NOT IN ('created', 'succeeded')
  OR NEW.`failure_code` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'commerce_payment_insert_state_not_allowed');
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_require_verified_event_insert`
BEFORE INSERT ON `payments`
WHEN NEW.`status` = 'succeeded'
BEGIN
  SELECT RAISE(ABORT, 'commerce_payment_requires_verified_event') WHERE NOT EXISTS (
    SELECT 1 FROM `webhook_events`
    WHERE `provider` = NEW.`provider`
      AND `provider_payment_id` = NEW.`provider_session_id`
      AND `order_id` = NEW.`order_id`
      AND `amount_cents` = NEW.`amount_cents`
      AND `currency` = NEW.`currency`
      AND `event_type` = 'payment.succeeded'
      AND `status` IN ('verified', 'processed')
  );
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
CREATE TRIGGER `trg_payments_validate_transition`
BEFORE UPDATE OF `status` ON `payments`
WHEN OLD.`status` <> NEW.`status`
  AND NOT (
    OLD.`status` = 'created' AND NEW.`status` = 'requires_action'
    OR OLD.`status` IN ('created', 'requires_action')
      AND NEW.`status` IN ('succeeded', 'failed', 'expired')
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_invalid_payment_transition');
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_validate_transition_payload`
BEFORE UPDATE OF `status`, `failure_code` ON `payments`
WHEN OLD.`status` <> NEW.`status`
  AND (
    (NEW.`status` = 'failed' AND NEW.`failure_code` IS NULL)
    OR (NEW.`status` <> 'failed' AND NEW.`failure_code` IS NOT NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_payment_transition_payload_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_require_verified_event_update`
BEFORE UPDATE OF `status` ON `payments`
WHEN OLD.`status` <> NEW.`status`
  AND NEW.`status` IN ('succeeded', 'failed', 'expired')
BEGIN
  SELECT RAISE(ABORT, 'commerce_payment_requires_verified_event') WHERE NOT EXISTS (
    SELECT 1 FROM `webhook_events`
    WHERE `provider` = NEW.`provider`
      AND `provider_payment_id` = NEW.`provider_session_id`
      AND `order_id` = NEW.`order_id`
      AND `amount_cents` = NEW.`amount_cents`
      AND `currency` = NEW.`currency`
      AND `event_type` = CASE NEW.`status`
        WHEN 'succeeded' THEN 'payment.succeeded'
        WHEN 'failed' THEN 'payment.failed'
        WHEN 'expired' THEN 'payment.expired'
      END
      AND `status` IN ('verified', 'processed')
  );

END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_validate_transition_timestamp`
BEFORE UPDATE OF `status`, `updated_at` ON `payments`
WHEN OLD.`status` <> NEW.`status`
  AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`updated_at`) IS NOT NEW.`updated_at`
    OR NEW.`updated_at` <= OLD.`updated_at`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_payment_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_lock_fields_without_transition`
BEFORE UPDATE OF `updated_at`, `failure_code` ON `payments`
WHEN OLD.`status` = NEW.`status`
  AND (
    OLD.`updated_at` IS NOT NEW.`updated_at`
    OR OLD.`failure_code` IS NOT NEW.`failure_code`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_payment_update_requires_transition');
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_lock_terminal_update`
BEFORE UPDATE ON `payments`
WHEN OLD.`status` IN ('succeeded', 'failed', 'expired', 'refunded')
BEGIN
  SELECT RAISE(ABORT, 'commerce_terminal_payment_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_retain_delete`
BEFORE DELETE ON `payments`
BEGIN
  SELECT RAISE(ABORT, 'commerce_payment_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_webhook_events_validate_insert_state`
BEFORE INSERT ON `webhook_events`
WHEN NEW.`status` <> 'verified'
  OR NEW.`attempts` <> 0
  OR NEW.`last_error_code` IS NOT NULL
  OR NEW.`processed_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'commerce_webhook_insert_state_not_allowed');
END;--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_validate_insert_timestamp`
BEFORE INSERT ON `webhook_events`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`verified_at`) IS NOT NEW.`verified_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`received_at`) IS NOT NEW.`received_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_webhook_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_lock_identity_update`
BEFORE UPDATE ON `webhook_events`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`provider` IS NOT NEW.`provider`
  OR OLD.`provider_event_id` IS NOT NEW.`provider_event_id`
  OR OLD.`event_type` IS NOT NEW.`event_type`
  OR OLD.`payload_fingerprint` IS NOT NEW.`payload_fingerprint`
  OR OLD.`verification_method` IS NOT NEW.`verification_method`
  OR OLD.`verified_at` IS NOT NEW.`verified_at`
  OR OLD.`order_id` IS NOT NEW.`order_id`
  OR OLD.`provider_payment_id` IS NOT NEW.`provider_payment_id`
  OR OLD.`amount_cents` IS NOT NEW.`amount_cents`
  OR OLD.`currency` IS NOT NEW.`currency`
  OR OLD.`received_at` IS NOT NEW.`received_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_webhook_snapshot_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_validate_transition`
BEFORE UPDATE OF `status` ON `webhook_events`
WHEN OLD.`status` <> NEW.`status`
  AND NOT (
    OLD.`status` = 'verified' AND NEW.`status` IN ('processed', 'failed')
    OR OLD.`status` = 'failed' AND NEW.`status` = 'processed'
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_invalid_webhook_transition');
END;--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_validate_processed_timestamp`
BEFORE UPDATE OF `processed_at` ON `webhook_events`
WHEN OLD.`processed_at` IS NOT NEW.`processed_at`
  AND NOT (
    OLD.`processed_at` IS NULL
    AND NEW.`status` = 'processed'
    AND NEW.`processed_at` IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`processed_at`) IS NEW.`processed_at`
    AND NEW.`processed_at` >= NEW.`verified_at`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_webhook_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_validate_processing_update`
BEFORE UPDATE OF `status`, `attempts`, `last_error_code`, `processed_at`
ON `webhook_events`
WHEN OLD.`status` <> NEW.`status`
  AND (
    NEW.`attempts` <> OLD.`attempts` + 1
    OR (
      NEW.`status` = 'processed'
      AND (
        NEW.`processed_at` IS NULL
        OR NEW.`last_error_code` IS NOT NULL
      )
    )
    OR (
      NEW.`status` = 'failed'
      AND (
        NEW.`processed_at` IS NOT NULL
        OR NEW.`last_error_code` IS NULL
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_webhook_processing_proof_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_lock_fields_without_transition`
BEFORE UPDATE OF `attempts`, `last_error_code`, `processed_at`
ON `webhook_events`
WHEN OLD.`status` = NEW.`status`
  AND (
    OLD.`attempts` IS NOT NEW.`attempts`
    OR OLD.`last_error_code` IS NOT NEW.`last_error_code`
    OR OLD.`processed_at` IS NOT NEW.`processed_at`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_webhook_update_requires_transition');
END;--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_lock_terminal_update`
BEFORE UPDATE ON `webhook_events`
WHEN OLD.`status` = 'processed'
BEGIN
  SELECT RAISE(ABORT, 'commerce_terminal_webhook_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_retain_delete`
BEFORE DELETE ON `webhook_events`
BEGIN
  SELECT RAISE(ABORT, 'commerce_webhook_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_audit_log_validate_insert_timestamp`
BEFORE INSERT ON `audit_log`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_audit_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_audit_log_immutable_update`
BEFORE UPDATE ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'commerce_audit_log_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_audit_log_retain_delete`
BEFORE DELETE ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'commerce_audit_log_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_movements_validate_stock_transition`
BEFORE INSERT ON `inventory_movements`
WHEN NEW.`kind` IN ('adjustment', 'gift_allocation', 'safety_allocation')
  AND (
    NOT EXISTS (
      SELECT 1 FROM `inventory`
      WHERE `variant_id` = NEW.`variant_id`
    )
    OR NOT (
      (
        NEW.`kind` = 'adjustment'
        AND NEW.`reference_type` IN ('physical_increase', 'physical_decrease')
      )
      OR (
        NEW.`kind` = 'gift_allocation'
        AND NEW.`reference_type` IN (
          'gift_reserve_increase', 'gift_reserve_decrease'
        )
      )
      OR (
        NEW.`kind` = 'safety_allocation'
        AND NEW.`reference_type` IN (
          'safety_reserve_increase', 'safety_reserve_decrease'
        )
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_inventory_stock_movement_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_movements_validate_insert_timestamp`
BEFORE INSERT ON `inventory_movements`
WHEN strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_inventory_movement_timestamp_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_movements_apply_stock_transition`
AFTER INSERT ON `inventory_movements`
WHEN NEW.`kind` IN ('adjustment', 'gift_allocation', 'safety_allocation')
BEGIN
  UPDATE `inventory`
  SET `physical_quantity` = `physical_quantity` + CASE
        WHEN NEW.`kind` = 'adjustment'
          AND NEW.`reference_type` = 'physical_increase' THEN NEW.`quantity`
        WHEN NEW.`kind` = 'adjustment'
          AND NEW.`reference_type` = 'physical_decrease' THEN -NEW.`quantity`
        ELSE 0
      END,
      `gift_reserve_quantity` = `gift_reserve_quantity` + CASE
        WHEN NEW.`kind` = 'gift_allocation'
          AND NEW.`reference_type` = 'gift_reserve_increase' THEN NEW.`quantity`
        WHEN NEW.`kind` = 'gift_allocation'
          AND NEW.`reference_type` = 'gift_reserve_decrease' THEN -NEW.`quantity`
        ELSE 0
      END,
      `safety_reserve_quantity` = `safety_reserve_quantity` + CASE
        WHEN NEW.`kind` = 'safety_allocation'
          AND NEW.`reference_type` = 'safety_reserve_increase' THEN NEW.`quantity`
        WHEN NEW.`kind` = 'safety_allocation'
          AND NEW.`reference_type` = 'safety_reserve_decrease' THEN -NEW.`quantity`
        ELSE 0
      END,
      `version` = `version` + 1,
      `updated_at` = NEW.`created_at`
  WHERE `variant_id` = NEW.`variant_id`;
END;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_movements_immutable_update`
BEFORE UPDATE ON `inventory_movements`
BEGIN
  SELECT RAISE(ABORT, 'commerce_inventory_movement_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_inventory_movements_retain_delete`
BEFORE DELETE ON `inventory_movements`
BEGIN
  SELECT RAISE(ABORT, 'commerce_inventory_movement_is_immutable');
END;
