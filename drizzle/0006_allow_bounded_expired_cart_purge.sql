DROP TRIGGER IF EXISTS `trg_cart_lines_validate_delete`;--> statement-breakpoint
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
  ) AND NOT EXISTS (
    SELECT 1
    FROM `carts` AS cart
    WHERE cart.`id` = OLD.`cart_id`
      AND length(cart.`id`) = 69
      AND substr(cart.`id`, 1, 5) = 'cart_'
      AND substr(cart.`id`, 6) = lower(substr(cart.`id`, 6))
      AND substr(cart.`id`, 6) NOT GLOB '*[^0-9a-f]*'
      AND cart.`customer_id` IS NULL
      AND cart.`email` IS NULL
      AND cart.`status` = 'expired'
      AND datetime(cart.`expires_at`) <= datetime('now', '-30 days')
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
      AND NOT EXISTS (
        SELECT 1
        FROM `shipping_quotes` AS quote
        WHERE quote.`cart_id` = cart.`id`
      )
  );
END;
