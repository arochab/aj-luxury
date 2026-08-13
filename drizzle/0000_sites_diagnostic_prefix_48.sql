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
CREATE INDEX `idx_webhook_events_status_received_at` ON `webhook_events` (`status`,`received_at`);
