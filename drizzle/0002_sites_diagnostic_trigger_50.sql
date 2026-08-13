
CREATE TRIGGER `trg_stock_reservations_validate_insert_reserves`
BEFORE INSERT ON `stock_reservations`
WHEN NEW.`status` = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM `stock_reservations`
    WHERE `idempotency_key` = NEW.`idempotency_key`
  )
  AND EXISTS (
    SELECT 1 FROM `inventory`
    WHERE `variant_id` = NEW.`variant_id` AND `reserves_validated` = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_reserves_not_validated');
END;
