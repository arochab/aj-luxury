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
  ) THEN RAISE(ABORT, 'commerce_cart_line_catalog_mismatch') END;
END;--> statement-breakpoint
CREATE TRIGGER `trg_cart_lines_immutable_snapshot`
BEFORE UPDATE ON `cart_lines`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`cart_id` IS NOT NEW.`cart_id`
  OR OLD.`variant_id` IS NOT NEW.`variant_id`
  OR OLD.`unit_price_cents` IS NOT NEW.`unit_price_cents`
  OR OLD.`created_at` IS NOT NEW.`created_at`
  OR (
    OLD.`quantity` IS NEW.`quantity`
    AND OLD.`updated_at` IS NOT NEW.`updated_at`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_cart_line_snapshot_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_cart_lines_validate_quantity_update`
BEFORE UPDATE OF `quantity` ON `cart_lines`
WHEN OLD.`quantity` IS NOT NEW.`quantity`
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `carts` AS cart
    WHERE cart.`id` = OLD.`cart_id`
      AND cart.`status` = 'open'
      AND datetime(cart.`expires_at`) > CURRENT_TIMESTAMP
      AND datetime(NEW.`updated_at`) > datetime(OLD.`updated_at`)
      AND NOT EXISTS (
        SELECT 1 FROM `stock_reservations`
        WHERE `cart_id` = OLD.`cart_id` AND `status` = 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM `orders`
        WHERE `cart_id` = OLD.`cart_id`
      )
  ) THEN RAISE(ABORT, 'commerce_cart_line_quantity_update_not_allowed') END;
END;--> statement-breakpoint
CREATE TRIGGER `trg_carts_lock_currency_with_lines`
BEFORE UPDATE OF `currency` ON `carts`
WHEN OLD.`currency` IS NOT NEW.`currency`
  AND EXISTS (
    SELECT 1 FROM `cart_lines` WHERE `cart_id` = OLD.`id`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_cart_currency_is_immutable');
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_orders_validate_paid_transition`;--> statement-breakpoint
CREATE TRIGGER `trg_orders_validate_paid_transition`
BEFORE UPDATE OF `status` ON `orders`
WHEN OLD.`status` = 'pending_payment' AND NEW.`status` = 'paid'
BEGIN
  SELECT CASE WHEN NEW.`paid_at` IS NULL OR NOT EXISTS (
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
  OR EXISTS (
    SELECT 1
    FROM `order_lines` AS line
    LEFT JOIN `variants` AS variant ON variant.`id` = line.`variant_id`
    LEFT JOIN `products` AS product ON product.`id` = variant.`product_id`
    WHERE line.`order_id` = NEW.`id`
      AND (
        variant.`id` IS NULL
        OR product.`id` IS NULL
        OR line.`internal_reference` <> variant.`internal_reference`
        OR line.`product_name` <> product.`name`
        OR line.`color_name` <> variant.`color_name`
        OR line.`size` <> variant.`size`
      )
  )
  THEN RAISE(ABORT, 'commerce_order_payment_mismatch') END;

  SELECT CASE WHEN EXISTS (
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
  ) THEN RAISE(ABORT, 'commerce_order_payment_mismatch') END;

  SELECT CASE WHEN EXISTS (
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
  ) THEN RAISE(ABORT, 'commerce_order_payment_mismatch') END;
END;
