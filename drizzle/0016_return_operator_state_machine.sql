CREATE TABLE `commerce_operations_schema_installations` (
	`version` text PRIMARY KEY NOT NULL,
	`contract` text NOT NULL,
	`installed_at` text NOT NULL,
	CONSTRAINT "ck_commerce_operations_schema_0016" CHECK(
		`version` = '0016_return_operator_state_machine'
		AND `contract` = 'received-approved-goods_received-inspected-v1'
		AND `installed_at` = '2026-08-15T00:00:00.000Z'
	)
);--> statement-breakpoint
INSERT INTO `commerce_operations_schema_installations` (`version`, `contract`, `installed_at`)
VALUES ('0016_return_operator_state_machine',
  'received-approved-goods_received-inspected-v1', '2026-08-15T00:00:00.000Z');--> statement-breakpoint
CREATE TRIGGER `trg_commerce_operations_schema_0016_immutable_update`
BEFORE UPDATE ON `commerce_operations_schema_installations`
BEGIN
  SELECT RAISE(ABORT, 'commerce_operations_schema_installation_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_commerce_operations_schema_0016_retain_delete`
BEFORE DELETE ON `commerce_operations_schema_installations`
BEGIN
  SELECT RAISE(ABORT, 'commerce_operations_schema_installation_is_immutable');
END;--> statement-breakpoint
DROP TRIGGER `trg_return_requests_transition`;--> statement-breakpoint
CREATE TRIGGER `trg_return_requests_transition`
BEFORE UPDATE ON `return_requests`
WHEN NOT (
  OLD.`status` = 'received' AND NEW.`status` = 'approved'
  AND NEW.`resolution` = 'pending' AND NEW.`resolved_at` IS NULL
  AND EXISTS (
    SELECT 1 FROM `audit_log` AS approval
    INNER JOIN `administrators` AS administrator
      ON administrator.`id` = approval.`actor_id`
    WHERE approval.`id` = 'audit_return_approval_' || OLD.`id`
      AND approval.`actor_type` = 'admin'
      AND approval.`action` = 'return_request_approved'
      AND approval.`entity_type` = 'return_request'
      AND approval.`entity_id` = OLD.`id`
      AND approval.`idempotency_key` = 'audit:return_approved:' || OLD.`id`
      AND approval.`metadata_json` = '{}'
      AND administrator.`enabled` = 1 AND administrator.`role` = 'owner'
  )
) AND NOT (
  OLD.`status` = 'approved' AND NEW.`status` = 'goods_received'
  AND NEW.`resolution` = 'pending' AND NEW.`resolved_at` IS NULL
  AND EXISTS (
    SELECT 1 FROM `audit_log`
    WHERE `id` = 'audit_return_approval_' || OLD.`id`
      AND `actor_type` = 'admin' AND `action` = 'return_request_approved'
      AND `entity_type` = 'return_request' AND `entity_id` = OLD.`id`
      AND `idempotency_key` = 'audit:return_approved:' || OLD.`id`
  )
) AND NOT (
  OLD.`status` = 'goods_received'
  AND NEW.`status` = 'inspected' AND NEW.`resolution` = 'pending'
  AND NEW.`resolved_at` IS NULL
  AND OLD.`declared_line_count` = (
    SELECT COUNT(*) FROM `return_lines` WHERE `return_request_id` = OLD.`id`
  )
  AND NOT EXISTS (
    SELECT 1 FROM `return_lines`
    WHERE `return_request_id` = OLD.`id` AND `inspection_result` <> 'complete'
  )
  AND NOT EXISTS (
    SELECT 1 FROM `return_lines` AS return_line
    INNER JOIN `order_lines` AS order_line ON order_line.`id` = return_line.`order_line_id`
    WHERE return_line.`return_request_id` = OLD.`id`
      AND return_line.`restocked_quantity` > 0
      AND order_line.`variant_id` IS NULL
  )
) AND NOT (
  OLD.`status` = 'inspected' AND NEW.`status` = 'resolved'
  AND NEW.`resolution` IN ('refund', 'no_refund')
  AND NEW.`resolved_at` IS NOT NULL
) AND NOT (
  OLD.`status` IN ('received', 'approved', 'goods_received')
  AND NEW.`status` IN ('rejected', 'cancelled')
  AND NEW.`resolution` IN ('rejected', 'no_refund')
  AND NEW.`resolved_at` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'fulfillment_invalid_transition');
END;
