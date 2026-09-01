CREATE TABLE `invoice_sequences` (
	`invoice_year` integer PRIMARY KEY NOT NULL,
	`last_number` integer NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "ck_invoice_sequences_year" CHECK("invoice_sequences"."invoice_year" BETWEEN 2020 AND 9999),
	CONSTRAINT "ck_invoice_sequences_last_number" CHECK("invoice_sequences"."last_number" BETWEEN 1 AND 999999)
);
--> statement-breakpoint
CREATE TABLE `order_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`order_number` text NOT NULL,
	`invoice_number` text NOT NULL,
	`invoice_year` integer NOT NULL,
	`invoice_sequence` integer NOT NULL,
	`issued_at` text NOT NULL,
	`payment_confirmed_at` text NOT NULL,
	`seller_snapshot_json` text NOT NULL,
	`mediator_snapshot_json` text NOT NULL,
	`buyer_email` text NOT NULL,
	`billing_address_json` text NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`merchandise_gross_cents` integer NOT NULL,
	`discount_cents` integer NOT NULL,
	`promotion_code` text,
	`promotion_discount_cents` integer NOT NULL,
	`merchandise_net_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`tax_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`tax_mention` text NOT NULL,
	`line_items_json` text NOT NULL,
	`terms_version` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_order_invoices_currency" CHECK("order_invoices"."currency" = 'EUR'),
	CONSTRAINT "ck_order_invoices_sequence" CHECK("order_invoices"."invoice_year" BETWEEN 2020 AND 9999
        AND "order_invoices"."invoice_sequence" BETWEEN 1 AND 999999
        AND "order_invoices"."invoice_number" = printf(
          'AJL-%04d-%06d', "order_invoices"."invoice_year", "order_invoices"."invoice_sequence"
        )),
	CONSTRAINT "ck_order_invoices_amounts" CHECK("order_invoices"."merchandise_gross_cents" >= 0
        AND "order_invoices"."discount_cents" >= 0
        AND "order_invoices"."promotion_discount_cents" >= 0
        AND "order_invoices"."discount_cents" >= "order_invoices"."promotion_discount_cents"
        AND "order_invoices"."merchandise_net_cents" >= 0
        AND "order_invoices"."shipping_cents" >= 0
        AND "order_invoices"."tax_cents" >= 0
        AND "order_invoices"."total_cents" >= 0
        AND "order_invoices"."merchandise_gross_cents" - "order_invoices"."discount_cents"
          = "order_invoices"."merchandise_net_cents"
        AND "order_invoices"."merchandise_net_cents" + "order_invoices"."shipping_cents"
          + "order_invoices"."tax_cents" = "order_invoices"."total_cents"),
	CONSTRAINT "ck_order_invoices_promotion" CHECK(("order_invoices"."promotion_code" IS NULL
          AND "order_invoices"."promotion_discount_cents" = 0)
        OR ("order_invoices"."promotion_code" IS NOT NULL
          AND "order_invoices"."promotion_discount_cents" > 0)),
	CONSTRAINT "ck_order_invoices_json" CHECK(json_valid("order_invoices"."seller_snapshot_json")
        AND json_valid("order_invoices"."mediator_snapshot_json")
        AND json_valid("order_invoices"."billing_address_json")
        AND json_valid("order_invoices"."line_items_json")
        AND json_array_length("order_invoices"."line_items_json") BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_order_invoices_order` ON `order_invoices` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_order_invoices_number` ON `order_invoices` (`invoice_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_order_invoices_year_sequence` ON `order_invoices` (`invoice_year`,`invoice_sequence`);--> statement-breakpoint
CREATE INDEX `idx_order_invoices_issued_at` ON `order_invoices` (`issued_at`,`id`);--> statement-breakpoint

WITH `eligible_orders` AS (
  SELECT customer_order.*,
    CAST(substr(customer_order.`paid_at`, 1, 4) AS integer) AS `invoice_year`,
    row_number() OVER (
      PARTITION BY substr(customer_order.`paid_at`, 1, 4)
      ORDER BY customer_order.`paid_at`, customer_order.`id`
    ) AS `invoice_sequence`
  FROM `orders` AS customer_order
  WHERE customer_order.`status` IN ('paid','preparing','shipped','refunded')
    AND customer_order.`paid_at` IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM `payments` AS payment
      WHERE payment.`order_id` = customer_order.`id`
        AND payment.`status` IN ('succeeded','refunded')
        AND payment.`amount_cents` = customer_order.`total_cents`
        AND payment.`currency` = customer_order.`currency`
    )
    AND EXISTS (
      SELECT 1 FROM `order_lines` AS order_line
      WHERE order_line.`order_id` = customer_order.`id`
    )
)
INSERT INTO `order_invoices` (
  `id`,`order_id`,`order_number`,`invoice_number`,`invoice_year`,
  `invoice_sequence`,`issued_at`,`payment_confirmed_at`,
  `seller_snapshot_json`,`mediator_snapshot_json`,`buyer_email`,
  `billing_address_json`,`currency`,`merchandise_gross_cents`,
  `discount_cents`,`promotion_code`,`promotion_discount_cents`,
  `merchandise_net_cents`,`shipping_cents`,`tax_cents`,`total_cents`,
  `tax_mention`,`line_items_json`,`terms_version`,`created_at`
)
SELECT
  'invoice:' || eligible.`id`, eligible.`id`, eligible.`order_number`,
  printf('AJL-%04d-%06d', eligible.`invoice_year`, eligible.`invoice_sequence`),
  eligible.`invoice_year`, eligible.`invoice_sequence`, eligible.`paid_at`,
  eligible.`paid_at`,
  json_object(
    'brand', 'AJ Luxury',
    'legalName', 'Jérémy Scheppler, entrepreneur individuel',
    'legalForm', 'Entreprise individuelle — nom commercial AJ Luxury',
    'registeredOffice', '3 A rue Principale, 67130 Belmont, France',
    'registration', 'SIREN 944 996 487 — SIRET du siège 944 996 487 00038 — immatriculée au Registre national des entreprises (RNE) le 28 mai 2025',
    'contactEmail', 'contact@ajluxurystore.com',
    'contactPhone', '+33 6 88 42 40 62'
  ),
  json_object(
    'name', 'Société Médiation Professionnelle – Médiateur de la consommation',
    'address', 'Alteritae, 5 rue Salvaing, 12000 Rodez, France',
    'website', 'https://www.mediateur-consommation-smp.fr/',
    'filingUrl', 'https://www.mediateur-consommation-smp.fr/demander-une-mediation/'
  ),
  eligible.`email`, eligible.`billing_address_json`, eligible.`currency`,
  eligible.`subtotal_cents` + eligible.`discount_cents`,
  eligible.`discount_cents`, eligible.`promotion_code`,
  eligible.`promotion_discount_cents`, eligible.`subtotal_cents`,
  eligible.`shipping_cents`, eligible.`tax_cents`, eligible.`total_cents`,
  'TVA non applicable, art. 293 B du code général des impôts',
  (
    SELECT json_group_array(json(ordered_line.`line_json`))
    FROM (
      SELECT json_object(
        'internalReference', order_line.`internal_reference`,
        'productName', order_line.`product_name`,
        'colorName', order_line.`color_name`,
        'size', order_line.`size`,
        'quantity', order_line.`quantity`,
        'unitPriceCents', order_line.`unit_price_cents`,
        'lineTotalCents', order_line.`line_total_cents`
      ) AS `line_json`
      FROM `order_lines` AS order_line
      WHERE order_line.`order_id` = eligible.`id`
      ORDER BY order_line.`id`
    ) AS ordered_line
  ),
  eligible.`terms_version`, eligible.`paid_at`
FROM `eligible_orders` AS eligible;--> statement-breakpoint

INSERT INTO `invoice_sequences` (`invoice_year`,`last_number`,`updated_at`)
SELECT invoice.`invoice_year`, max(invoice.`invoice_sequence`), max(invoice.`issued_at`)
FROM `order_invoices` AS invoice
GROUP BY invoice.`invoice_year`;--> statement-breakpoint

CREATE TRIGGER `trg_order_invoices_validate_insert`
BEFORE INSERT ON `order_invoices`
WHEN NOT EXISTS (
  SELECT 1 FROM `orders` AS customer_order
  WHERE customer_order.`id` = NEW.`order_id`
    AND customer_order.`status` IN ('paid','preparing','shipped','refunded')
    AND customer_order.`paid_at` IS NOT NULL
    AND customer_order.`order_number` = NEW.`order_number`
    AND NEW.`issued_at` = customer_order.`updated_at`
    AND NEW.`payment_confirmed_at` = customer_order.`paid_at`
    AND NEW.`invoice_year` = CAST(substr(customer_order.`updated_at`, 1, 4) AS integer)
    AND NEW.`invoice_sequence` = (
      SELECT sequence.`last_number` FROM `invoice_sequences` AS sequence
      WHERE sequence.`invoice_year` = NEW.`invoice_year`
    )
    AND NEW.`buyer_email` = customer_order.`email`
    AND NEW.`billing_address_json` = customer_order.`billing_address_json`
    AND NEW.`currency` = customer_order.`currency`
    AND NEW.`merchandise_gross_cents`
      = customer_order.`subtotal_cents` + customer_order.`discount_cents`
    AND NEW.`discount_cents` = customer_order.`discount_cents`
    AND NEW.`promotion_code` IS customer_order.`promotion_code`
    AND NEW.`promotion_discount_cents` = customer_order.`promotion_discount_cents`
    AND NEW.`merchandise_net_cents` = customer_order.`subtotal_cents`
    AND NEW.`shipping_cents` = customer_order.`shipping_cents`
    AND NEW.`tax_cents` = customer_order.`tax_cents`
    AND NEW.`total_cents` = customer_order.`total_cents`
    AND NEW.`terms_version` = customer_order.`terms_version`
    AND NEW.`created_at` = customer_order.`updated_at`
    AND NEW.`tax_mention`
      = 'TVA non applicable, art. 293 B du code général des impôts'
    AND NEW.`seller_snapshot_json` = json_object(
      'brand', 'AJ Luxury',
      'legalName', 'Jérémy Scheppler, entrepreneur individuel',
      'legalForm', 'Entreprise individuelle — nom commercial AJ Luxury',
      'registeredOffice', '3 A rue Principale, 67130 Belmont, France',
      'registration', 'SIREN 944 996 487 — SIRET du siège 944 996 487 00038 — immatriculée au Registre national des entreprises (RNE) le 28 mai 2025',
      'contactEmail', 'contact@ajluxurystore.com',
      'contactPhone', '+33 6 88 42 40 62'
    )
    AND NEW.`mediator_snapshot_json` = json_object(
      'name', 'Société Médiation Professionnelle – Médiateur de la consommation',
      'address', 'Alteritae, 5 rue Salvaing, 12000 Rodez, France',
      'website', 'https://www.mediateur-consommation-smp.fr/',
      'filingUrl', 'https://www.mediateur-consommation-smp.fr/demander-une-mediation/'
    )
    AND NEW.`line_items_json` = (
      SELECT json_group_array(json(ordered_line.`line_json`))
      FROM (
        SELECT json_object(
          'internalReference', order_line.`internal_reference`,
          'productName', order_line.`product_name`,
          'colorName', order_line.`color_name`,
          'size', order_line.`size`,
          'quantity', order_line.`quantity`,
          'unitPriceCents', order_line.`unit_price_cents`,
          'lineTotalCents', order_line.`line_total_cents`
        ) AS `line_json`
        FROM `order_lines` AS order_line
        WHERE order_line.`order_id` = customer_order.`id`
        ORDER BY order_line.`id`
      ) AS ordered_line
    )
    AND EXISTS (
      SELECT 1 FROM `payments` AS payment
      WHERE payment.`order_id` = customer_order.`id`
        AND payment.`status` IN ('succeeded','refunded')
        AND payment.`amount_cents` = customer_order.`total_cents`
        AND payment.`currency` = customer_order.`currency`
    )
)
BEGIN SELECT RAISE(ABORT, 'commerce_invoice_snapshot_invalid'); END;--> statement-breakpoint

CREATE TRIGGER `trg_order_invoices_immutable_update`
BEFORE UPDATE ON `order_invoices`
BEGIN SELECT RAISE(ABORT, 'commerce_invoice_is_immutable'); END;--> statement-breakpoint

CREATE TRIGGER `trg_order_invoices_retain_delete`
BEFORE DELETE ON `order_invoices`
BEGIN SELECT RAISE(ABORT, 'commerce_invoice_must_be_retained'); END;--> statement-breakpoint

CREATE TRIGGER `trg_invoice_sequences_guard_update`
BEFORE UPDATE ON `invoice_sequences`
WHEN NEW.`invoice_year` IS NOT OLD.`invoice_year`
  OR NEW.`last_number` IS NOT OLD.`last_number` + 1
  OR NEW.`last_number` > 999999
  OR NEW.`updated_at` < OLD.`updated_at`
BEGIN SELECT RAISE(ABORT, 'commerce_invoice_sequence_invalid'); END;--> statement-breakpoint

CREATE TRIGGER `trg_invoice_sequences_retain_delete`
BEFORE DELETE ON `invoice_sequences`
BEGIN SELECT RAISE(ABORT, 'commerce_invoice_sequence_must_be_retained'); END;--> statement-breakpoint

CREATE TRIGGER `trg_orders_create_invoice_after_payment`
AFTER UPDATE OF `status` ON `orders`
WHEN OLD.`status` = 'pending_payment' AND NEW.`status` = 'paid'
BEGIN
  INSERT INTO `invoice_sequences` (`invoice_year`,`last_number`,`updated_at`)
  VALUES (CAST(substr(NEW.`updated_at`, 1, 4) AS integer), 1, NEW.`updated_at`)
  ON CONFLICT (`invoice_year`) DO UPDATE SET
    `last_number` = `last_number` + 1,
    `updated_at` = excluded.`updated_at`;

  INSERT INTO `order_invoices` (
    `id`,`order_id`,`order_number`,`invoice_number`,`invoice_year`,
    `invoice_sequence`,`issued_at`,`payment_confirmed_at`,
    `seller_snapshot_json`,`mediator_snapshot_json`,`buyer_email`,
    `billing_address_json`,`currency`,`merchandise_gross_cents`,
    `discount_cents`,`promotion_code`,`promotion_discount_cents`,
    `merchandise_net_cents`,`shipping_cents`,`tax_cents`,`total_cents`,
    `tax_mention`,`line_items_json`,`terms_version`,`created_at`
  )
  SELECT
    'invoice:' || NEW.`id`, NEW.`id`, NEW.`order_number`,
    printf(
      'AJL-%04d-%06d',
      CAST(substr(NEW.`updated_at`, 1, 4) AS integer),
      sequence.`last_number`
    ),
    sequence.`invoice_year`, sequence.`last_number`, NEW.`updated_at`, NEW.`paid_at`,
    json_object(
      'brand', 'AJ Luxury',
      'legalName', 'Jérémy Scheppler, entrepreneur individuel',
      'legalForm', 'Entreprise individuelle — nom commercial AJ Luxury',
      'registeredOffice', '3 A rue Principale, 67130 Belmont, France',
      'registration', 'SIREN 944 996 487 — SIRET du siège 944 996 487 00038 — immatriculée au Registre national des entreprises (RNE) le 28 mai 2025',
      'contactEmail', 'contact@ajluxurystore.com',
      'contactPhone', '+33 6 88 42 40 62'
    ),
    json_object(
      'name', 'Société Médiation Professionnelle – Médiateur de la consommation',
      'address', 'Alteritae, 5 rue Salvaing, 12000 Rodez, France',
      'website', 'https://www.mediateur-consommation-smp.fr/',
      'filingUrl', 'https://www.mediateur-consommation-smp.fr/demander-une-mediation/'
    ),
    NEW.`email`, NEW.`billing_address_json`, NEW.`currency`,
    NEW.`subtotal_cents` + NEW.`discount_cents`, NEW.`discount_cents`,
    NEW.`promotion_code`, NEW.`promotion_discount_cents`, NEW.`subtotal_cents`,
    NEW.`shipping_cents`, NEW.`tax_cents`, NEW.`total_cents`,
    'TVA non applicable, art. 293 B du code général des impôts',
    (
      SELECT json_group_array(json(ordered_line.`line_json`))
      FROM (
        SELECT json_object(
          'internalReference', order_line.`internal_reference`,
          'productName', order_line.`product_name`,
          'colorName', order_line.`color_name`,
          'size', order_line.`size`,
          'quantity', order_line.`quantity`,
          'unitPriceCents', order_line.`unit_price_cents`,
          'lineTotalCents', order_line.`line_total_cents`
        ) AS `line_json`
        FROM `order_lines` AS order_line
        WHERE order_line.`order_id` = NEW.`id`
        ORDER BY order_line.`id`
      ) AS ordered_line
    ),
    NEW.`terms_version`, NEW.`updated_at`
  FROM `invoice_sequences` AS sequence
  WHERE sequence.`invoice_year` = CAST(substr(NEW.`updated_at`, 1, 4) AS integer)
    AND EXISTS (
      SELECT 1 FROM `payments` AS payment
      WHERE payment.`order_id` = NEW.`id`
        AND payment.`status` = 'succeeded'
        AND payment.`amount_cents` = NEW.`total_cents`
        AND payment.`currency` = NEW.`currency`
    )
    AND EXISTS (
      SELECT 1 FROM `order_lines` AS order_line
      WHERE order_line.`order_id` = NEW.`id`
    );

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `order_invoices` AS invoice
    WHERE invoice.`order_id` = NEW.`id`
  ) THEN RAISE(ABORT, 'commerce_invoice_generation_failed') END;
END;--> statement-breakpoint

PRAGMA foreign_key_check;--> statement-breakpoint
PRAGMA optimize;
