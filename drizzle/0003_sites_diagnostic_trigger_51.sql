
CREATE TRIGGER `trg_stock_reservations_validate_insert`
BEFORE INSERT ON `stock_reservations`
WHEN NEW.`status` = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM `stock_reservations`
    WHERE `idempotency_key` = NEW.`idempotency_key`
  )
  AND NOT EXISTS (
    SELECT 1 FROM `inventory`
    WHERE `variant_id` = NEW.`variant_id` AND `reserves_validated` = 0
  )
  AND NOT EXISTS (
    SELECT 1
    FROM `carts` AS cart
    INNER JOIN `inventory` AS stock
      ON stock.`variant_id` = NEW.`variant_id`
    INNER JOIN `variants` AS variant
      ON variant.`id` = NEW.`variant_id`
    INNER JOIN `products` AS product
      ON product.`id` = variant.`product_id`
    WHERE cart.`id` = NEW.`cart_id`
      AND cart.`status` = 'open'
      AND cart.`expires_at` > NEW.`created_at`
      AND NEW.`expires_at` > NEW.`created_at`
      AND NEW.`expires_at` <= cart.`expires_at`
      AND variant.`active` = 1
      AND product.`status` = 'active'
      AND stock.`reserves_validated` = 1
      AND stock.`physical_quantity`
        - stock.`gift_reserve_quantity`
        - stock.`safety_reserve_quantity`
        - stock.`active_reserved_quantity`
        - stock.`sold_quantity` >= NEW.`quantity`
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_insufficient_stock_or_cart_closed');
END;
