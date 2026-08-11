CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_type` text DEFAULT 'system' NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "ck_audit_log_actor_type" CHECK("audit_log"."actor_type" IN ('system', 'customer', 'admin'))
);
--> statement-breakpoint
CREATE INDEX `idx_audit_log_entity_created_at` ON `audit_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_actor_created_at` ON `audit_log` (`actor_type`,`actor_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_audit_log_idempotency_key` ON `audit_log` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `cart_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`cart_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_cart_lines_quantity_positive" CHECK("cart_lines"."quantity" > 0),
	CONSTRAINT "ck_cart_lines_price_non_negative" CHECK("cart_lines"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_cart_lines_cart_variant` ON `cart_lines` (`cart_id`,`variant_id`);--> statement-breakpoint
CREATE INDEX `idx_cart_lines_cart_id` ON `cart_lines` (`cart_id`);--> statement-breakpoint
CREATE TABLE `carts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`email` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_carts_status" CHECK("carts"."status" IN ('open', 'converted', 'expired')),
	CONSTRAINT "ck_carts_currency_eur" CHECK("carts"."currency" = 'EUR')
);
--> statement-breakpoint
CREATE INDEX `idx_carts_customer_status` ON `carts` (`customer_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_carts_status_expires_at` ON `carts` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `customer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_customer_sessions_token_hash` ON `customer_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_customer_sessions_customer_expires_at` ON `customer_sessions` (`customer_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`accepts_marketing` integer DEFAULT false NOT NULL,
	`marketing_consent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_customers_email` ON `customers` (`email`);--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`recipient_email` text NOT NULL,
	`order_id` text,
	`locale` text DEFAULT 'fr' NOT NULL,
	`template_version` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_error_code` text,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_email_outbox_kind" CHECK("email_outbox"."kind" IN (
        'magic_link', 'order_confirmation', 'payment_failed',
        'shipment_confirmation', 'refund_confirmation'
      )),
	CONSTRAINT "ck_email_outbox_status" CHECK("email_outbox"."status" IN ('pending', 'sending', 'sent', 'failed')),
	CONSTRAINT "ck_email_outbox_attempts_non_negative" CHECK("email_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_email_outbox_idempotency_key` ON `email_outbox` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_email_outbox_status_next_attempt` ON `email_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`variant_id` text PRIMARY KEY NOT NULL,
	`physical_quantity` integer NOT NULL,
	`gift_reserve_quantity` integer DEFAULT 0 NOT NULL,
	`safety_reserve_quantity` integer DEFAULT 0 NOT NULL,
	`active_reserved_quantity` integer DEFAULT 0 NOT NULL,
	`sold_quantity` integer DEFAULT 0 NOT NULL,
	`reserves_validated` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_inventory_quantities_non_negative" CHECK("inventory"."physical_quantity" >= 0
        AND "inventory"."gift_reserve_quantity" >= 0
        AND "inventory"."safety_reserve_quantity" >= 0
        AND "inventory"."active_reserved_quantity" >= 0
        AND "inventory"."sold_quantity" >= 0),
	CONSTRAINT "ck_inventory_allocation_within_physical" CHECK("inventory"."gift_reserve_quantity"
        + "inventory"."safety_reserve_quantity"
        + "inventory"."active_reserved_quantity"
        + "inventory"."sold_quantity"
        <= "inventory"."physical_quantity")
);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` integer NOT NULL,
	`reference_type` text NOT NULL,
	`reference_id` text NOT NULL,
	`actor_type` text DEFAULT 'system' NOT NULL,
	`actor_id` text,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_inventory_movements_kind" CHECK("inventory_movements"."kind" IN (
        'seed', 'reserve', 'release', 'sale', 'gift_allocation',
        'safety_allocation', 'adjustment'
      )),
	CONSTRAINT "ck_inventory_movements_quantity_positive" CHECK("inventory_movements"."quantity" > 0),
	CONSTRAINT "ck_inventory_movements_actor_type" CHECK("inventory_movements"."actor_type" IN ('system', 'customer', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_inventory_movements_idempotency_key` ON `inventory_movements` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_inventory_movements_variant_created_at` ON `inventory_movements` (`variant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`variant_id` text,
	`internal_reference` text NOT NULL,
	`product_name` text NOT NULL,
	`color_name` text NOT NULL,
	`size` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`line_total_cents` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_order_lines_size" CHECK("order_lines"."size" IN ('S', 'M', 'L', 'XL')),
	CONSTRAINT "ck_order_lines_quantity_positive" CHECK("order_lines"."quantity" > 0),
	CONSTRAINT "ck_order_lines_amounts_consistent" CHECK("order_lines"."unit_price_cents" >= 0
        AND "order_lines"."line_total_cents" = "order_lines"."unit_price_cents" * "order_lines"."quantity")
);
--> statement-breakpoint
CREATE INDEX `idx_order_lines_order_id` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`cart_id` text,
	`customer_id` text,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending_payment' NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`tax_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`shipping_country_code` text NOT NULL,
	`shipping_address_json` text NOT NULL,
	`billing_address_json` text NOT NULL,
	`terms_version` text NOT NULL,
	`privacy_version` text NOT NULL,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_orders_status" CHECK("orders"."status" IN (
        'pending_payment', 'paid', 'preparing', 'shipped', 'cancelled', 'refunded'
      )),
	CONSTRAINT "ck_orders_currency_eur" CHECK("orders"."currency" = 'EUR'),
	CONSTRAINT "ck_orders_amounts_non_negative" CHECK("orders"."subtotal_cents" >= 0
        AND "orders"."shipping_cents" >= 0
        AND "orders"."tax_cents" >= 0
        AND "orders"."total_cents" >= 0),
	CONSTRAINT "ck_orders_total_consistent" CHECK("orders"."total_cents" = "orders"."subtotal_cents" + "orders"."shipping_cents" + "orders"."tax_cents")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_orders_order_number` ON `orders` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_orders_cart_id` ON `orders` (`cart_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_customer_created_at` ON `orders` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_status_created_at` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_session_id` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`idempotency_key` text NOT NULL,
	`failure_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_payments_provider" CHECK("payments"."provider" IN ('test', 'stripe')),
	CONSTRAINT "ck_payments_status" CHECK("payments"."status" IN (
        'created', 'requires_action', 'succeeded', 'failed', 'expired', 'refunded'
      )),
	CONSTRAINT "ck_payments_amount_non_negative" CHECK("payments"."amount_cents" >= 0),
	CONSTRAINT "ck_payments_currency_eur" CHECK("payments"."currency" = 'EUR')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_payments_provider_session` ON `payments` (`provider`,`provider_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_payments_idempotency_key` ON `payments` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_payments_order_succeeded` ON `payments` (`order_id`) WHERE "payments"."status" = 'succeeded';--> statement-breakpoint
CREATE INDEX `idx_payments_order_id` ON `payments` (`order_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`price_cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "ck_products_price_non_negative" CHECK("products"."price_cents" >= 0),
	CONSTRAINT "ck_products_currency_eur" CHECK("products"."currency" = 'EUR'),
	CONSTRAINT "ck_products_status" CHECK("products"."status" IN ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_products_slug` ON `products` (`slug`);--> statement-breakpoint
CREATE TABLE `stock_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`cart_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`idempotency_key` text NOT NULL,
	`last_transition_key` text,
	`expires_at` text NOT NULL,
	`converted_order_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`converted_order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_stock_reservations_quantity_positive" CHECK("stock_reservations"."quantity" > 0),
	CONSTRAINT "ck_stock_reservations_status" CHECK("stock_reservations"."status" IN ('active', 'released', 'converted', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_stock_reservations_idempotency_key` ON `stock_reservations` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_stock_reservations_transition_key` ON `stock_reservations` (`last_transition_key`);--> statement-breakpoint
CREATE INDEX `idx_stock_reservations_cart_status` ON `stock_reservations` (`cart_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_stock_reservations_status_expires_at` ON `stock_reservations` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`internal_reference` text NOT NULL,
	`color_key` text NOT NULL,
	`color_name` text NOT NULL,
	`size` text NOT NULL,
	`swatch` text NOT NULL,
	`image_url` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_variants_size" CHECK("variants"."size" IN ('S', 'M', 'L', 'XL')),
	CONSTRAINT "ck_variants_sort_order_non_negative" CHECK("variants"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_variants_internal_reference` ON `variants` (`internal_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_variants_product_color_size` ON `variants` (`product_id`,`color_key`,`size`);--> statement-breakpoint
CREATE INDEX `idx_variants_product_active` ON `variants` (`product_id`,`active`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_fingerprint` text NOT NULL,
	`verification_method` text NOT NULL,
	`verified_at` text NOT NULL,
	`order_id` text NOT NULL,
	`provider_payment_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'verified' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_webhook_events_provider" CHECK("webhook_events"."provider" IN ('test', 'stripe')),
	CONSTRAINT "ck_webhook_events_verification_method" CHECK("webhook_events"."verification_method" IN ('test_adapter', 'stripe_signature')),
	CONSTRAINT "ck_webhook_events_status" CHECK("webhook_events"."status" IN ('verified', 'processed', 'failed')),
	CONSTRAINT "ck_webhook_events_attempts_non_negative" CHECK("webhook_events"."attempts" >= 0),
	CONSTRAINT "ck_webhook_events_amount_positive" CHECK("webhook_events"."amount_cents" > 0),
	CONSTRAINT "ck_webhook_events_currency_eur" CHECK("webhook_events"."currency" = 'EUR')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_webhook_events_provider_event` ON `webhook_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_webhook_events_status_received_at` ON `webhook_events` (`status`,`received_at`);--> statement-breakpoint
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
      AND cart.`expires_at` > NEW.`created_at`
      AND variant.`active` = 1
      AND product.`status` = 'active'
      AND product.`currency` = cart.`currency`
      AND product.`price_cents` = NEW.`unit_price_cents`
  ) THEN RAISE(ABORT, 'commerce_cart_line_catalog_mismatch') END;
END;--> statement-breakpoint
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
END;--> statement-breakpoint
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
END;--> statement-breakpoint
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
BEGIN
  SELECT CASE WHEN NOT EXISTS (
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
  ) THEN RAISE(ABORT, 'commerce_insufficient_stock_or_cart_closed') END;
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_apply_insert`
AFTER INSERT ON `stock_reservations`
WHEN NEW.`status` = 'active'
BEGIN
  UPDATE `inventory`
  SET `active_reserved_quantity` = `active_reserved_quantity` + NEW.`quantity`,
      `version` = `version` + 1,
      `updated_at` = NEW.`updated_at`
  WHERE `variant_id` = NEW.`variant_id`;
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_immutable_identity`
BEFORE UPDATE OF `cart_id`, `variant_id`, `quantity`, `idempotency_key`
ON `stock_reservations`
WHEN OLD.`cart_id` <> NEW.`cart_id`
  OR OLD.`variant_id` <> NEW.`variant_id`
  OR OLD.`quantity` <> NEW.`quantity`
  OR OLD.`idempotency_key` <> NEW.`idempotency_key`
BEGIN
  SELECT RAISE(ABORT, 'commerce_reservation_identity_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_validate_transition`
BEFORE UPDATE OF `status` ON `stock_reservations`
WHEN OLD.`status` <> NEW.`status`
  AND NOT (
    OLD.`status` = 'active'
    AND NEW.`status` IN ('released', 'expired', 'converted')
  )
BEGIN
  SELECT RAISE(ABORT, 'commerce_invalid_reservation_transition');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_validate_expiration`
BEFORE UPDATE OF `status` ON `stock_reservations`
WHEN OLD.`status` = 'active' AND NEW.`status` = 'expired'
  AND NEW.`updated_at` < OLD.`expires_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_reservation_not_expired');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_validate_sale_expiry`
BEFORE UPDATE OF `status` ON `stock_reservations`
WHEN OLD.`status` = 'active' AND NEW.`status` = 'converted'
  AND OLD.`expires_at` <= NEW.`updated_at`
BEGIN
  SELECT RAISE(ABORT, 'commerce_sale_reservation_expired');
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_validate_sale_order`
BEFORE UPDATE OF `status` ON `stock_reservations`
WHEN OLD.`status` = 'active' AND NEW.`status` = 'converted'
BEGIN
  SELECT CASE WHEN NEW.`converted_order_id` IS NULL OR NOT EXISTS (
    SELECT 1
    FROM `orders` AS customer_order
    INNER JOIN `payments` AS payment
      ON payment.`order_id` = customer_order.`id`
    WHERE customer_order.`id` = NEW.`converted_order_id`
      AND customer_order.`cart_id` = OLD.`cart_id`
      AND customer_order.`status` = 'pending_payment'
      AND payment.`status` = 'succeeded'
      AND payment.`amount_cents` = customer_order.`total_cents`
      AND payment.`currency` = customer_order.`currency`
  ) THEN RAISE(ABORT, 'commerce_sale_order_payment_mismatch') END;
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_apply_release`
AFTER UPDATE OF `status` ON `stock_reservations`
WHEN OLD.`status` = 'active' AND NEW.`status` IN ('released', 'expired')
BEGIN
  UPDATE `inventory`
  SET `active_reserved_quantity` = `active_reserved_quantity` - NEW.`quantity`,
      `version` = `version` + 1,
      `updated_at` = NEW.`updated_at`
  WHERE `variant_id` = NEW.`variant_id`;
END;--> statement-breakpoint
CREATE TRIGGER `trg_stock_reservations_apply_sale`
AFTER UPDATE OF `status` ON `stock_reservations`
WHEN OLD.`status` = 'active' AND NEW.`status` = 'converted'
BEGIN
  UPDATE `inventory`
  SET `active_reserved_quantity` = `active_reserved_quantity` - NEW.`quantity`,
      `sold_quantity` = `sold_quantity` + NEW.`quantity`,
      `version` = `version` + 1,
      `updated_at` = NEW.`updated_at`
  WHERE `variant_id` = NEW.`variant_id`;
END;--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_validate_provenance`
BEFORE INSERT ON `webhook_events`
WHEN (NEW.`provider` = 'test' AND NEW.`verification_method` <> 'test_adapter')
  OR (NEW.`provider` = 'stripe' AND NEW.`verification_method` <> 'stripe_signature')
BEGIN
  SELECT RAISE(ABORT, 'commerce_webhook_verification_method_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_validate_replay`
BEFORE INSERT ON `webhook_events`
WHEN EXISTS (
  SELECT 1 FROM `webhook_events`
  WHERE `provider` = NEW.`provider`
    AND `provider_event_id` = NEW.`provider_event_id`
)
AND NOT EXISTS (
  SELECT 1 FROM `webhook_events`
  WHERE `provider` = NEW.`provider`
    AND `provider_event_id` = NEW.`provider_event_id`
    AND `event_type` = NEW.`event_type`
    AND `payload_fingerprint` = NEW.`payload_fingerprint`
    AND `verification_method` = NEW.`verification_method`
    AND `order_id` = NEW.`order_id`
    AND `provider_payment_id` = NEW.`provider_payment_id`
    AND `amount_cents` = NEW.`amount_cents`
    AND `currency` = NEW.`currency`
)
BEGIN
  SELECT RAISE(ABORT, 'commerce_webhook_replay_conflict');
END;--> statement-breakpoint
CREATE TRIGGER `trg_payments_require_verified_event_insert`
BEFORE INSERT ON `payments`
WHEN NEW.`status` = 'succeeded'
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
END;--> statement-breakpoint
CREATE TRIGGER `trg_webhook_events_validate_processed`
BEFORE UPDATE OF `status` ON `webhook_events`
WHEN NEW.`status` = 'processed'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `orders` AS customer_order
    INNER JOIN `carts` AS cart ON cart.`id` = customer_order.`cart_id`
    INNER JOIN `payments` AS payment ON payment.`order_id` = customer_order.`id`
    WHERE customer_order.`id` = NEW.`order_id`
      AND customer_order.`status` = 'paid'
      AND cart.`status` = 'converted'
      AND payment.`provider` = NEW.`provider`
      AND payment.`provider_session_id` = NEW.`provider_payment_id`
      AND payment.`status` = 'succeeded'
      AND payment.`amount_cents` = NEW.`amount_cents`
      AND payment.`currency` = NEW.`currency`
  ) OR NOT EXISTS (
    SELECT 1 FROM `email_outbox`
    WHERE `order_id` = NEW.`order_id` AND `kind` = 'order_confirmation'
  ) OR NOT EXISTS (
    SELECT 1 FROM `audit_log`
    WHERE `entity_type` = 'order'
      AND `entity_id` = NEW.`order_id`
      AND `action` = 'payment_succeeded'
  ) THEN RAISE(ABORT, 'commerce_webhook_processing_incomplete') END;
END;--> statement-breakpoint
PRAGMA optimize;
