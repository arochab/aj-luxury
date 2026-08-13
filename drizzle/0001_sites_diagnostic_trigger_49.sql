
CREATE TRIGGER `trg_inventory_seed_ledger`
AFTER INSERT ON `inventory`
BEGIN
  INSERT INTO `inventory_movements` (
    `id`, `variant_id`, `kind`, `quantity`, `reference_type`, `reference_id`,
    `actor_type`, `actor_id`, `idempotency_key`, `created_at`
  ) VALUES (
    'movement_seed_' || NEW.`variant_id`, NEW.`variant_id`, 'seed',
    NEW.`physical_quantity`, 'catalog_seed', 'aj_launch_2026', 'system', NULL,
    'seed:' || NEW.`variant_id`, NEW.`updated_at`
  );
END;
