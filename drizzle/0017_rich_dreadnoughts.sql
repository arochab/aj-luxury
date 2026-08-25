ALTER TABLE `orders`
ADD COLUMN `discount_cents` integer NOT NULL DEFAULT 0
CHECK (`discount_cents` >= 0);--> statement-breakpoint
CREATE TRIGGER `trg_orders_discount_immutable`
BEFORE UPDATE OF `discount_cents` ON `orders`
WHEN OLD.`discount_cents` IS NOT NEW.`discount_cents`
BEGIN
  SELECT RAISE(ABORT, 'commerce_order_snapshot_is_immutable');
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
  ), -1) <> NEW.`subtotal_cents` + NEW.`discount_cents`;

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
END;
