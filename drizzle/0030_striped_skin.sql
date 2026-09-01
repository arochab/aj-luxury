CREATE TABLE `credit_note_sequences` (
	`credit_note_year` integer PRIMARY KEY NOT NULL,
	`last_number` integer NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "ck_credit_note_sequences_year" CHECK("credit_note_sequences"."credit_note_year" BETWEEN 2020 AND 9999),
	CONSTRAINT "ck_credit_note_sequences_last_number" CHECK("credit_note_sequences"."last_number" BETWEEN 1 AND 999999)
);
--> statement-breakpoint
CREATE TABLE `order_credit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`refund_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`order_id` text NOT NULL,
	`order_number` text NOT NULL,
	`original_invoice_number` text NOT NULL,
	`original_invoice_issued_at` text NOT NULL,
	`credit_note_number` text NOT NULL,
	`credit_note_year` integer NOT NULL,
	`credit_note_sequence` integer NOT NULL,
	`issued_at` text NOT NULL,
	`refund_succeeded_at` text NOT NULL,
	`refund_reason` text NOT NULL,
	`refund_provider_reference` text NOT NULL,
	`seller_snapshot_json` text NOT NULL,
	`mediator_snapshot_json` text NOT NULL,
	`buyer_email` text NOT NULL,
	`billing_address_json` text NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`original_total_cents` integer NOT NULL,
	`credit_amount_cents` integer NOT NULL,
	`credit_lines_json` text NOT NULL,
	`tax_credit_cents` integer DEFAULT 0 NOT NULL,
	`remaining_balance_cents` integer NOT NULL,
	`tax_mention` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`refund_id`) REFERENCES `refunds`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`invoice_id`) REFERENCES `order_invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_order_credit_notes_currency" CHECK("order_credit_notes"."currency" = 'EUR'),
	CONSTRAINT "ck_order_credit_notes_reason" CHECK("order_credit_notes"."refund_reason" IN ('return', 'withdrawal')),
	CONSTRAINT "ck_order_credit_notes_sequence" CHECK("order_credit_notes"."credit_note_year" BETWEEN 2020 AND 9999
        AND "order_credit_notes"."credit_note_sequence" BETWEEN 1 AND 999999
        AND "order_credit_notes"."credit_note_number" = printf(
          'AJL-AV-%04d-%06d', "order_credit_notes"."credit_note_year", "order_credit_notes"."credit_note_sequence"
        )),
	CONSTRAINT "ck_order_credit_notes_amounts" CHECK("order_credit_notes"."original_total_cents" > 0
        AND "order_credit_notes"."credit_amount_cents" > 0
        AND "order_credit_notes"."credit_amount_cents" <= "order_credit_notes"."original_total_cents"
        AND "order_credit_notes"."tax_credit_cents" = 0
        AND "order_credit_notes"."remaining_balance_cents" >= 0
        AND "order_credit_notes"."remaining_balance_cents" < "order_credit_notes"."original_total_cents"),
	CONSTRAINT "ck_order_credit_notes_json" CHECK(json_valid("order_credit_notes"."seller_snapshot_json")
        AND json_valid("order_credit_notes"."mediator_snapshot_json")
        AND json_valid("order_credit_notes"."billing_address_json")
        AND json_valid("order_credit_notes"."credit_lines_json")
        AND json_array_length("order_credit_notes"."credit_lines_json") BETWEEN 1 AND 16)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_order_credit_notes_refund` ON `order_credit_notes` (`refund_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_order_credit_notes_number` ON `order_credit_notes` (`credit_note_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_order_credit_notes_year_sequence` ON `order_credit_notes` (`credit_note_year`,`credit_note_sequence`);--> statement-breakpoint
CREATE INDEX `idx_order_credit_notes_invoice` ON `order_credit_notes` (`invoice_id`,`issued_at`,`id`);--> statement-breakpoint

WITH `eligible_refunds` AS (
  SELECT
    refund.`id` AS `refund_id`, refund.`reason`, refund.`amount_cents`,
    refund.`currency`, refund.`provider_refund_reference`, refund.`succeeded_at`,
    invoice.`id` AS `invoice_id`, invoice.`order_id`, invoice.`order_number`,
    invoice.`invoice_number`, invoice.`issued_at` AS `invoice_issued_at`,
    invoice.`seller_snapshot_json`, invoice.`mediator_snapshot_json`,
    invoice.`buyer_email`, invoice.`billing_address_json`, invoice.`total_cents`,
    invoice.`tax_mention`,
    (
      SELECT json_group_array(json(lines.`line_json`))
      FROM (
        SELECT return_line.`id` AS `sort_key`, json_object(
          'kind', 'item', 'orderLineId', order_line.`id`,
          'internalReference', order_line.`internal_reference`,
          'productName', order_line.`product_name`,
          'colorName', order_line.`color_name`, 'size', order_line.`size`,
          'quantity', return_line.`received_quantity`,
          'unitPriceCents', order_line.`unit_price_cents`,
          'amountCents', return_line.`received_quantity` * order_line.`unit_price_cents`
        ) AS `line_json`
        FROM `return_lines` AS return_line
        INNER JOIN `order_lines` AS order_line
          ON order_line.`id` = return_line.`order_line_id`
        WHERE return_line.`return_request_id` = refund.`return_request_id`
          AND return_line.`inspection_result` = 'complete'
          AND return_line.`received_quantity` > 0
        UNION ALL
        SELECT '~adjustment' AS `sort_key`, json_object(
          'kind', 'adjustment',
          'label', 'Ajustement / remboursement livraison',
          'amountCents', refund.`amount_cents` - COALESCE((
            SELECT sum(return_line.`received_quantity` * order_line.`unit_price_cents`)
            FROM `return_lines` AS return_line
            INNER JOIN `order_lines` AS order_line
              ON order_line.`id` = return_line.`order_line_id`
            WHERE return_line.`return_request_id` = refund.`return_request_id`
              AND return_line.`inspection_result` = 'complete'
              AND return_line.`received_quantity` > 0
          ), 0)
        ) AS `line_json`
        WHERE refund.`amount_cents` > COALESCE((
          SELECT sum(return_line.`received_quantity` * order_line.`unit_price_cents`)
          FROM `return_lines` AS return_line
          INNER JOIN `order_lines` AS order_line
            ON order_line.`id` = return_line.`order_line_id`
          WHERE return_line.`return_request_id` = refund.`return_request_id`
            AND return_line.`inspection_result` = 'complete'
            AND return_line.`received_quantity` > 0
        ), 0)
        ORDER BY `sort_key`
      ) AS lines
    ) AS `credit_lines_json`,
    CAST(substr(refund.`succeeded_at`, 1, 4) AS integer) AS `credit_note_year`,
    row_number() OVER (
      PARTITION BY substr(refund.`succeeded_at`, 1, 4)
      ORDER BY refund.`succeeded_at`, refund.`id`
    ) AS `credit_note_sequence`,
    sum(refund.`amount_cents`) OVER (
      PARTITION BY invoice.`id`
      ORDER BY refund.`succeeded_at`, refund.`id`
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS `credited_to_date`
  FROM `refunds` AS refund
  INNER JOIN `payments` AS payment ON payment.`id` = refund.`payment_id`
  INNER JOIN `return_requests` AS request
    ON request.`id` = refund.`return_request_id`
  INNER JOIN `order_invoices` AS invoice ON invoice.`order_id` = request.`order_id`
  WHERE refund.`status` = 'succeeded'
    AND refund.`succeeded_at` IS NOT NULL
    AND refund.`provider_refund_reference` IS NOT NULL
    AND refund.`provider_receipt_fingerprint` IS NOT NULL
    AND request.`status` = 'resolved' AND request.`resolution` = 'refund'
    AND payment.`order_id` = request.`order_id`
    AND payment.`status` = 'succeeded'
    AND payment.`amount_cents` = invoice.`total_cents`
    AND payment.`currency` = invoice.`currency`
    AND refund.`currency` = invoice.`currency`
    AND refund.`amount_cents` >= COALESCE((
      SELECT sum(return_line.`received_quantity` * order_line.`unit_price_cents`)
      FROM `return_lines` AS return_line
      INNER JOIN `order_lines` AS order_line
        ON order_line.`id` = return_line.`order_line_id`
      WHERE return_line.`return_request_id` = refund.`return_request_id`
        AND return_line.`inspection_result` = 'complete'
        AND return_line.`received_quantity` > 0
    ), 0)
    AND NOT EXISTS (
      SELECT 1 FROM `refunds` AS sibling_refund
      INNER JOIN `return_requests` AS sibling_request
        ON sibling_request.`id` = sibling_refund.`return_request_id`
      INNER JOIN `return_lines` AS sibling_line
        ON sibling_line.`return_request_id` = sibling_request.`id`
      INNER JOIN `return_lines` AS current_line
        ON current_line.`return_request_id` = refund.`return_request_id`
        AND current_line.`order_line_id` = sibling_line.`order_line_id`
      WHERE sibling_refund.`id` <> refund.`id`
        AND sibling_refund.`status` = 'succeeded'
        AND sibling_request.`order_id` = invoice.`order_id`
        AND sibling_line.`inspection_result` = 'complete'
        AND current_line.`inspection_result` = 'complete'
    )
)
INSERT INTO `order_credit_notes` (
  `id`,`refund_id`,`invoice_id`,`order_id`,`order_number`,
  `original_invoice_number`,`original_invoice_issued_at`,`credit_note_number`,
  `credit_note_year`,`credit_note_sequence`,`issued_at`,`refund_succeeded_at`,
  `refund_reason`,`refund_provider_reference`,`seller_snapshot_json`,
  `mediator_snapshot_json`,`buyer_email`,`billing_address_json`,`currency`,
  `original_total_cents`,`credit_amount_cents`,`credit_lines_json`,
  `tax_credit_cents`,`remaining_balance_cents`,`tax_mention`,`created_at`
)
SELECT
  'credit-note:' || eligible.`refund_id`, eligible.`refund_id`,
  eligible.`invoice_id`, eligible.`order_id`, eligible.`order_number`,
  eligible.`invoice_number`, eligible.`invoice_issued_at`,
  printf(
    'AJL-AV-%04d-%06d',
    eligible.`credit_note_year`, eligible.`credit_note_sequence`
  ),
  eligible.`credit_note_year`, eligible.`credit_note_sequence`,
  eligible.`succeeded_at`, eligible.`succeeded_at`, eligible.`reason`,
  eligible.`provider_refund_reference`, eligible.`seller_snapshot_json`,
  eligible.`mediator_snapshot_json`, eligible.`buyer_email`,
  eligible.`billing_address_json`, eligible.`currency`, eligible.`total_cents`,
  eligible.`amount_cents`, eligible.`credit_lines_json`, 0,
  eligible.`total_cents` - eligible.`credited_to_date`, eligible.`tax_mention`,
  eligible.`succeeded_at`
FROM `eligible_refunds` AS eligible
WHERE eligible.`credited_to_date` <= eligible.`total_cents`;--> statement-breakpoint

INSERT INTO `credit_note_sequences` (`credit_note_year`,`last_number`,`updated_at`)
SELECT note.`credit_note_year`, max(note.`credit_note_sequence`), max(note.`issued_at`)
FROM `order_credit_notes` AS note
GROUP BY note.`credit_note_year`;--> statement-breakpoint

CREATE TRIGGER `trg_order_credit_notes_validate_insert`
BEFORE INSERT ON `order_credit_notes`
WHEN NOT EXISTS (
  SELECT 1
  FROM `refunds` AS refund
  INNER JOIN `payments` AS payment ON payment.`id` = refund.`payment_id`
  INNER JOIN `return_requests` AS request
    ON request.`id` = refund.`return_request_id`
  INNER JOIN `order_invoices` AS invoice ON invoice.`order_id` = request.`order_id`
  WHERE refund.`id` = NEW.`refund_id` AND refund.`status` = 'succeeded'
    AND refund.`succeeded_at` IS NOT NULL
    AND refund.`provider_refund_reference` IS NOT NULL
    AND refund.`provider_receipt_fingerprint` IS NOT NULL
    AND request.`status` IN ('inspected','resolved')
    AND (request.`status` <> 'resolved' OR request.`resolution` = 'refund')
    AND payment.`order_id` = request.`order_id`
    AND payment.`status` = 'succeeded'
    AND payment.`amount_cents` = invoice.`total_cents`
    AND payment.`currency` = invoice.`currency`
    AND NEW.`invoice_id` = invoice.`id`
    AND NEW.`order_id` = invoice.`order_id`
    AND NEW.`order_number` = invoice.`order_number`
    AND NEW.`original_invoice_number` = invoice.`invoice_number`
    AND NEW.`original_invoice_issued_at` = invoice.`issued_at`
    AND NEW.`issued_at` = refund.`succeeded_at`
    AND NEW.`refund_succeeded_at` = refund.`succeeded_at`
    AND NEW.`refund_reason` = refund.`reason`
    AND NEW.`refund_provider_reference` = refund.`provider_refund_reference`
    AND NEW.`seller_snapshot_json` = invoice.`seller_snapshot_json`
    AND NEW.`mediator_snapshot_json` = invoice.`mediator_snapshot_json`
    AND NEW.`buyer_email` = invoice.`buyer_email`
    AND NEW.`billing_address_json` = invoice.`billing_address_json`
    AND NEW.`currency` = invoice.`currency`
    AND NEW.`original_total_cents` = invoice.`total_cents`
    AND NEW.`credit_amount_cents` = refund.`amount_cents`
    AND json_array_length(NEW.`credit_lines_json`) BETWEEN 1 AND 16
    AND NEW.`credit_amount_cents` = (
      SELECT sum(CAST(json_extract(line.value, '$.amountCents') AS integer))
      FROM json_each(NEW.`credit_lines_json`) AS line
    )
    AND 1 >= (
      SELECT count(*) FROM json_each(NEW.`credit_lines_json`) AS line
      WHERE json_extract(line.value, '$.kind') = 'adjustment'
    )
    AND NOT EXISTS (
      SELECT 1 FROM json_each(NEW.`credit_lines_json`) AS line
      WHERE json_extract(line.value, '$.kind') NOT IN ('item','adjustment')
        OR CAST(json_extract(line.value, '$.amountCents') AS integer) <= 0
        OR (
          json_extract(line.value, '$.kind') = 'adjustment' AND (
            json_extract(line.value, '$.label')
              <> 'Ajustement / remboursement livraison'
          )
        )
    )
    AND (
      SELECT count(*) FROM json_each(NEW.`credit_lines_json`) AS line
      WHERE json_extract(line.value, '$.kind') = 'item'
    ) = (
      SELECT count(DISTINCT json_extract(line.value, '$.orderLineId'))
      FROM json_each(NEW.`credit_lines_json`) AS line
      WHERE json_extract(line.value, '$.kind') = 'item'
    )
    AND NOT EXISTS (
      SELECT 1 FROM json_each(NEW.`credit_lines_json`) AS line
      WHERE json_extract(line.value, '$.kind') = 'item' AND NOT EXISTS (
        SELECT 1 FROM `return_lines` AS return_line
        INNER JOIN `order_lines` AS order_line
          ON order_line.`id` = return_line.`order_line_id`
        WHERE return_line.`return_request_id` = refund.`return_request_id`
          AND return_line.`inspection_result` = 'complete'
          AND order_line.`id` = json_extract(line.value, '$.orderLineId')
          AND order_line.`internal_reference`
            = json_extract(line.value, '$.internalReference')
          AND order_line.`product_name` = json_extract(line.value, '$.productName')
          AND order_line.`color_name` = json_extract(line.value, '$.colorName')
          AND order_line.`size` = json_extract(line.value, '$.size')
          AND order_line.`unit_price_cents`
            = CAST(json_extract(line.value, '$.unitPriceCents') AS integer)
          AND CAST(json_extract(line.value, '$.quantity') AS integer) > 0
          AND CAST(json_extract(line.value, '$.amountCents') AS integer)
            = order_line.`unit_price_cents`
              * CAST(json_extract(line.value, '$.quantity') AS integer)
          AND CAST(json_extract(line.value, '$.quantity') AS integer) + COALESCE((
            SELECT sum(CAST(json_extract(previous_line.value, '$.quantity') AS integer))
            FROM `order_credit_notes` AS previous_note,
              json_each(previous_note.`credit_lines_json`) AS previous_line
            WHERE previous_note.`invoice_id` = invoice.`id`
              AND json_extract(previous_line.value, '$.kind') = 'item'
              AND json_extract(previous_line.value, '$.orderLineId') = order_line.`id`
          ), 0) <= (
            SELECT sum(eligible_line.`received_quantity`)
            FROM `return_lines` AS eligible_line
            INNER JOIN `return_requests` AS eligible_request
              ON eligible_request.`id` = eligible_line.`return_request_id`
            WHERE eligible_request.`order_id` = invoice.`order_id`
              AND eligible_request.`status` IN ('inspected','resolved')
              AND (eligible_request.`status` <> 'resolved'
                OR eligible_request.`resolution` = 'refund')
              AND eligible_line.`inspection_result` = 'complete'
              AND eligible_line.`order_line_id` = order_line.`id`
          )
      )
    )
    AND NEW.`tax_credit_cents` = 0
    AND NEW.`remaining_balance_cents` = invoice.`total_cents` - (
      NEW.`credit_amount_cents` + COALESCE((
        SELECT sum(existing.`credit_amount_cents`)
        FROM `order_credit_notes` AS existing
        WHERE existing.`invoice_id` = invoice.`id`
      ), 0)
    )
    AND NEW.`remaining_balance_cents` >= 0
    AND NEW.`tax_mention` = invoice.`tax_mention`
    AND NEW.`created_at` = refund.`succeeded_at`
    AND NEW.`credit_note_year`
      = CAST(substr(refund.`succeeded_at`, 1, 4) AS integer)
    AND NEW.`credit_note_sequence` = (
      SELECT sequence.`last_number`
      FROM `credit_note_sequences` AS sequence
      WHERE sequence.`credit_note_year` = NEW.`credit_note_year`
    )
)
BEGIN SELECT RAISE(ABORT, 'commerce_credit_note_snapshot_invalid'); END;--> statement-breakpoint

CREATE TRIGGER `trg_order_credit_notes_immutable_update`
BEFORE UPDATE ON `order_credit_notes`
BEGIN SELECT RAISE(ABORT, 'commerce_credit_note_is_immutable'); END;--> statement-breakpoint

CREATE TRIGGER `trg_order_credit_notes_retain_delete`
BEFORE DELETE ON `order_credit_notes`
BEGIN SELECT RAISE(ABORT, 'commerce_credit_note_must_be_retained'); END;--> statement-breakpoint

CREATE TRIGGER `trg_credit_note_sequences_guard_update`
BEFORE UPDATE ON `credit_note_sequences`
WHEN NEW.`credit_note_year` IS NOT OLD.`credit_note_year`
  OR NEW.`last_number` IS NOT OLD.`last_number` + 1
  OR NEW.`last_number` > 999999
  OR NEW.`updated_at` < OLD.`updated_at`
BEGIN SELECT RAISE(ABORT, 'commerce_credit_note_sequence_invalid'); END;--> statement-breakpoint

CREATE TRIGGER `trg_credit_note_sequences_retain_delete`
BEFORE DELETE ON `credit_note_sequences`
BEGIN SELECT RAISE(ABORT, 'commerce_credit_note_sequence_must_be_retained'); END;--> statement-breakpoint

PRAGMA foreign_key_check;
