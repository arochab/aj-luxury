ALTER TABLE `customers` ADD COLUMN `account_enabled_at` text;--> statement-breakpoint
CREATE INDEX `idx_customers_account_enabled` ON `customers` (`account_enabled_at`) WHERE `account_enabled_at` IS NOT NULL AND `deleted_at` IS NULL;--> statement-breakpoint
CREATE TRIGGER `trg_customers_account_activation_insert`
BEFORE INSERT ON `customers`
WHEN NEW.`account_enabled_at` IS NOT NULL
  AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`account_enabled_at`) IS NOT NEW.`account_enabled_at`
    OR NEW.`account_enabled_at` < NEW.`created_at`
  )
BEGIN
  SELECT RAISE(ABORT, 'identity_customer_account_activation_not_allowed');
END;--> statement-breakpoint
CREATE TRIGGER `trg_customers_account_activation`
BEFORE UPDATE OF `account_enabled_at` ON `customers`
WHEN (OLD.`account_enabled_at` IS NOT NULL AND OLD.`account_enabled_at` IS NOT NEW.`account_enabled_at`)
  OR (NEW.`account_enabled_at` IS NOT NULL AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`account_enabled_at`) IS NOT NEW.`account_enabled_at`
    OR NEW.`account_enabled_at` < NEW.`created_at`
  ))
BEGIN
  SELECT RAISE(ABORT, 'identity_customer_account_activation_not_allowed');
END;--> statement-breakpoint
CREATE TRIGGER `trg_customers_account_activation_audit`
AFTER UPDATE OF `account_enabled_at` ON `customers`
WHEN OLD.`account_enabled_at` IS NULL AND NEW.`account_enabled_at` IS NOT NULL
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_customer_enabled_' || NEW.`id`, 'customer', NEW.`id`,
    'identity_customer_account_enabled', 'customer', NEW.`id`,
    'identity:customer:' || NEW.`id` || ':account-enabled', '{}', NEW.`account_enabled_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_customers_account_activation_insert_audit`
AFTER INSERT ON `customers`
WHEN NEW.`account_enabled_at` IS NOT NULL
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_customer_enabled_' || NEW.`id`, 'customer', NEW.`id`,
    'identity_customer_account_enabled', 'customer', NEW.`id`,
    'identity:customer:' || NEW.`id` || ':account-enabled', '{}', NEW.`account_enabled_at`
  );
END;--> statement-breakpoint

CREATE TABLE `access_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`customer_id` text,
	`order_id` text,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`dispatched_at` text,
	`consumed_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `ck_access_challenges_purpose` CHECK(`purpose` IN ('customer_sign_in', 'guest_order_access')),
	CONSTRAINT `ck_access_challenges_target` CHECK(
		(`purpose` = 'customer_sign_in' AND `order_id` IS NULL)
		OR (`purpose` = 'guest_order_access' AND `customer_id` IS NULL AND `order_id` IS NOT NULL)
	),
	CONSTRAINT `ck_access_challenges_token_hash` CHECK(
		length(`token_hash`) = 64
		AND `token_hash` = lower(`token_hash`)
		AND `token_hash` NOT GLOB '*[^0-9a-f]*'
	),
	CONSTRAINT `ck_access_challenges_timestamps` CHECK(
		strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) = `created_at`
		AND strftime('%Y-%m-%dT%H:%M:%fZ', `expires_at`) = `expires_at`
		AND `expires_at` > `created_at`
		AND CAST(strftime('%s', `expires_at`) AS integer) - CAST(strftime('%s', `created_at`) AS integer) <= 3600
		AND (`dispatched_at` IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', `dispatched_at`) = `dispatched_at`)
		AND (`consumed_at` IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', `consumed_at`) = `consumed_at`)
		AND (`revoked_at` IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', `revoked_at`) = `revoked_at`)
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_access_challenges_token_hash` ON `access_challenges` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_access_challenges_customer_active` ON `access_challenges` (`customer_id`,`purpose`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_access_challenges_order_active` ON `access_challenges` (`order_id`,`purpose`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_customers_email_normalized` ON `customers` (lower(`email`)) WHERE `deleted_at` IS NULL;--> statement-breakpoint

CREATE TRIGGER `trg_access_challenges_customer_account_insert`
BEFORE INSERT ON `access_challenges`
WHEN NEW.`purpose` = 'customer_sign_in'
  AND NEW.`customer_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `customers`
    WHERE `id` = NEW.`customer_id`
      AND `account_enabled_at` IS NOT NULL
      AND `deleted_at` IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'identity_customer_challenge_requires_enabled_account');
END;--> statement-breakpoint

CREATE TRIGGER `trg_access_challenges_guest_order_insert`
BEFORE INSERT ON `access_challenges`
WHEN NEW.`purpose` = 'guest_order_access'
  AND NOT EXISTS (
    SELECT 1 FROM `orders`
    WHERE `id` = NEW.`order_id` AND `customer_id` IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'identity_guest_challenge_requires_guest_order');
END;--> statement-breakpoint
CREATE TRIGGER `trg_access_challenges_immutable_identity`
BEFORE UPDATE ON `access_challenges`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`purpose` IS NOT NEW.`purpose`
  OR OLD.`customer_id` IS NOT NEW.`customer_id`
  OR OLD.`order_id` IS NOT NEW.`order_id`
  OR OLD.`token_hash` IS NOT NEW.`token_hash`
  OR OLD.`expires_at` IS NOT NEW.`expires_at`
  OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'identity_challenge_identity_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_access_challenges_state_transition`
BEFORE UPDATE ON `access_challenges`
WHEN (OLD.`dispatched_at` IS NOT NULL AND OLD.`dispatched_at` IS NOT NEW.`dispatched_at`)
  OR (OLD.`consumed_at` IS NOT NULL AND OLD.`consumed_at` IS NOT NEW.`consumed_at`)
  OR (OLD.`revoked_at` IS NOT NULL AND OLD.`revoked_at` IS NOT NEW.`revoked_at`)
  OR (NEW.`dispatched_at` IS NOT NULL AND (
    NEW.`revoked_at` IS NOT NULL
    OR NEW.`dispatched_at` < NEW.`created_at` OR NEW.`dispatched_at` >= NEW.`expires_at`
  ))
  OR (NEW.`consumed_at` IS NOT NULL AND (
    OLD.`dispatched_at` IS NULL OR NEW.`dispatched_at` IS NULL OR NEW.`revoked_at` IS NOT NULL
    OR NEW.`consumed_at` < NEW.`created_at` OR NEW.`consumed_at` >= NEW.`expires_at`
  ))
  OR (NEW.`revoked_at` IS NOT NULL AND NEW.`revoked_at` < NEW.`created_at`)
BEGIN
  SELECT RAISE(ABORT, 'identity_challenge_transition_not_allowed');
END;--> statement-breakpoint

CREATE TABLE `customer_sessions_d01` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_token_hash` text,
	`session_family_id` text NOT NULL,
	`authentication_source` text NOT NULL,
	`issued_by_challenge_id` text,
	`rotated_from_session_id` text,
	`expires_at` text NOT NULL,
	`idle_expires_at` text NOT NULL,
	`last_seen_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_by_challenge_id`) REFERENCES `access_challenges`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rotated_from_session_id`) REFERENCES `customer_sessions_d01`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_customer_sessions_authentication_source` CHECK(`authentication_source` IN ('challenge', 'rotation', 'legacy_revoked')),
	CONSTRAINT `ck_customer_sessions_source_shape` CHECK(
		(`authentication_source` = 'challenge' AND `issued_by_challenge_id` IS NOT NULL AND `rotated_from_session_id` IS NULL)
		OR (`authentication_source` = 'rotation' AND `issued_by_challenge_id` IS NULL AND `rotated_from_session_id` IS NOT NULL)
		OR (`authentication_source` = 'legacy_revoked' AND `issued_by_challenge_id` IS NULL AND `rotated_from_session_id` IS NULL AND `revoked_at` IS NOT NULL)
	)
);--> statement-breakpoint
INSERT INTO `customer_sessions_d01` (
  `id`, `customer_id`, `token_hash`, `csrf_token_hash`, `session_family_id`,
  `authentication_source`, `issued_by_challenge_id`, `rotated_from_session_id`,
  `expires_at`, `idle_expires_at`, `last_seen_at`, `revoked_at`, `created_at`
)
SELECT
  `id`, `customer_id`, `token_hash`, NULL, `id`, 'legacy_revoked', NULL, NULL,
  COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', `expires_at`), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', `last_seen_at`), strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CASE WHEN `last_seen_at` IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', `last_seen_at`) END,
  COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', `revoked_at`), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM `customer_sessions`;--> statement-breakpoint
DROP TABLE `customer_sessions`;--> statement-breakpoint
ALTER TABLE `customer_sessions_d01` RENAME TO `customer_sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_customer_sessions_token_hash` ON `customer_sessions` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_customer_sessions_issued_challenge` ON `customer_sessions` (`issued_by_challenge_id`) WHERE `issued_by_challenge_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_customer_sessions_rotated_from` ON `customer_sessions` (`rotated_from_session_id`) WHERE `rotated_from_session_id` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_customer_sessions_customer_expires_at` ON `customer_sessions` (`customer_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_customer_sessions_family_created_at` ON `customer_sessions` (`session_family_id`,`created_at`);--> statement-breakpoint

CREATE TRIGGER `trg_customer_sessions_validate_insert`
BEFORE INSERT ON `customer_sessions`
WHEN length(NEW.`token_hash`) <> 64
  OR NEW.`token_hash` <> lower(NEW.`token_hash`)
  OR NEW.`token_hash` GLOB '*[^0-9a-f]*'
  OR NEW.`csrf_token_hash` IS NULL
  OR length(NEW.`csrf_token_hash`) <> 64
  OR NEW.`csrf_token_hash` <> lower(NEW.`csrf_token_hash`)
  OR NEW.`csrf_token_hash` GLOB '*[^0-9a-f]*'
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`created_at`) IS NOT NEW.`created_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`expires_at`) IS NOT NEW.`expires_at`
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`idle_expires_at`) IS NOT NEW.`idle_expires_at`
  OR NEW.`expires_at` <= NEW.`created_at`
  OR NEW.`idle_expires_at` <= NEW.`created_at`
  OR NEW.`idle_expires_at` > NEW.`expires_at`
  OR CAST(strftime('%s', NEW.`expires_at`) AS integer) - CAST(strftime('%s', NEW.`created_at`) AS integer) > 604800
  OR CAST(strftime('%s', NEW.`idle_expires_at`) AS integer) - CAST(strftime('%s', NEW.`created_at`) AS integer) > 1800
  OR NEW.`last_seen_at` IS NOT NULL
  OR NEW.`revoked_at` IS NOT NULL
  OR NOT EXISTS (
    SELECT 1 FROM `customers`
    WHERE `id` = NEW.`customer_id`
      AND `account_enabled_at` IS NOT NULL
      AND `deleted_at` IS NULL
  )
  OR (
    NEW.`authentication_source` = 'challenge'
    AND NOT EXISTS (
      SELECT 1 FROM `access_challenges`
      WHERE `id` = NEW.`issued_by_challenge_id`
        AND `purpose` = 'customer_sign_in'
        AND `customer_id` = NEW.`customer_id`
        AND `consumed_at` IS NOT NULL
        AND `consumed_at` = NEW.`created_at`
        AND `expires_at` > NEW.`created_at`
        AND `revoked_at` IS NULL
    )
  )
  OR (
    NEW.`authentication_source` = 'rotation'
    AND NOT EXISTS (
      SELECT 1 FROM `customer_sessions`
      WHERE `id` = NEW.`rotated_from_session_id`
        AND `customer_id` = NEW.`customer_id`
        AND `session_family_id` = NEW.`session_family_id`
        AND `revoked_at` = NEW.`created_at`
        AND `expires_at` > NEW.`created_at`
    )
  )
  OR NEW.`authentication_source` = 'legacy_revoked'
BEGIN
  SELECT RAISE(ABORT, 'identity_customer_session_insert_not_allowed');
END;--> statement-breakpoint
CREATE TRIGGER `trg_customer_sessions_immutable_identity`
BEFORE UPDATE ON `customer_sessions`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`customer_id` IS NOT NEW.`customer_id`
  OR OLD.`token_hash` IS NOT NEW.`token_hash`
  OR OLD.`csrf_token_hash` IS NOT NEW.`csrf_token_hash`
  OR OLD.`session_family_id` IS NOT NEW.`session_family_id`
  OR OLD.`authentication_source` IS NOT NEW.`authentication_source`
  OR OLD.`issued_by_challenge_id` IS NOT NEW.`issued_by_challenge_id`
  OR OLD.`rotated_from_session_id` IS NOT NEW.`rotated_from_session_id`
  OR OLD.`expires_at` IS NOT NEW.`expires_at`
  OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'identity_customer_session_identity_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_customer_sessions_state_transition`
BEFORE UPDATE ON `customer_sessions`
WHEN (OLD.`revoked_at` IS NOT NULL AND OLD.`revoked_at` IS NOT NEW.`revoked_at`)
  OR (OLD.`last_seen_at` IS NOT NULL AND (NEW.`last_seen_at` IS NULL OR NEW.`last_seen_at` < OLD.`last_seen_at`))
  OR NEW.`idle_expires_at` < OLD.`idle_expires_at`
  OR NEW.`idle_expires_at` > NEW.`expires_at`
  OR (NEW.`last_seen_at` IS NOT NULL AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`last_seen_at`) IS NOT NEW.`last_seen_at`
    OR NEW.`last_seen_at` >= NEW.`expires_at`
  ))
  OR (NEW.`revoked_at` IS NOT NULL AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`revoked_at`) IS NOT NEW.`revoked_at`
    OR NEW.`revoked_at` < NEW.`created_at`
  ))
BEGIN
  SELECT RAISE(ABORT, 'identity_customer_session_transition_not_allowed');
END;--> statement-breakpoint

CREATE TABLE `guest_order_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_token_hash` text NOT NULL,
	`issued_by_challenge_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`idle_expires_at` text NOT NULL,
	`last_seen_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_by_challenge_id`) REFERENCES `access_challenges`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_guest_order_sessions_token_hash` CHECK(
		length(`token_hash`) = 64
		AND `token_hash` = lower(`token_hash`)
		AND `token_hash` NOT GLOB '*[^0-9a-f]*'
		AND length(`csrf_token_hash`) = 64
		AND `csrf_token_hash` = lower(`csrf_token_hash`)
		AND `csrf_token_hash` NOT GLOB '*[^0-9a-f]*'
	),
	CONSTRAINT `ck_guest_order_sessions_timestamps` CHECK(
		strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) = `created_at`
		AND strftime('%Y-%m-%dT%H:%M:%fZ', `expires_at`) = `expires_at`
		AND strftime('%Y-%m-%dT%H:%M:%fZ', `idle_expires_at`) = `idle_expires_at`
		AND `expires_at` > `created_at`
		AND `idle_expires_at` > `created_at`
		AND `idle_expires_at` <= `expires_at`
		AND CAST(strftime('%s', `expires_at`) AS integer) - CAST(strftime('%s', `created_at`) AS integer) <= 86400
		AND CAST(strftime('%s', `idle_expires_at`) AS integer) - CAST(strftime('%s', `created_at`) AS integer) <= 900
		AND (`last_seen_at` IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', `last_seen_at`) = `last_seen_at`)
		AND (`revoked_at` IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', `revoked_at`) = `revoked_at`)
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_guest_order_sessions_token_hash` ON `guest_order_sessions` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_guest_order_sessions_issued_challenge` ON `guest_order_sessions` (`issued_by_challenge_id`);--> statement-breakpoint
CREATE INDEX `idx_guest_order_sessions_order_expires_at` ON `guest_order_sessions` (`order_id`,`expires_at`);--> statement-breakpoint

CREATE TRIGGER `trg_guest_order_sessions_validate_insert`
BEFORE INSERT ON `guest_order_sessions`
WHEN NEW.`last_seen_at` IS NOT NULL
  OR NEW.`revoked_at` IS NOT NULL
  OR NOT EXISTS (
    SELECT 1
    FROM `access_challenges` AS challenge
    INNER JOIN `orders` AS customer_order ON customer_order.`id` = challenge.`order_id`
    WHERE challenge.`id` = NEW.`issued_by_challenge_id`
      AND challenge.`purpose` = 'guest_order_access'
      AND challenge.`order_id` = NEW.`order_id`
      AND challenge.`consumed_at` IS NOT NULL
      AND challenge.`consumed_at` = NEW.`created_at`
      AND challenge.`expires_at` > NEW.`created_at`
      AND challenge.`revoked_at` IS NULL
      AND customer_order.`customer_id` IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'identity_guest_session_insert_not_allowed');
END;--> statement-breakpoint
CREATE TRIGGER `trg_guest_order_sessions_immutable_identity`
BEFORE UPDATE ON `guest_order_sessions`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`order_id` IS NOT NEW.`order_id`
  OR OLD.`token_hash` IS NOT NEW.`token_hash`
  OR OLD.`csrf_token_hash` IS NOT NEW.`csrf_token_hash`
  OR OLD.`issued_by_challenge_id` IS NOT NEW.`issued_by_challenge_id`
  OR OLD.`expires_at` IS NOT NEW.`expires_at`
  OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'identity_guest_session_identity_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_guest_order_sessions_state_transition`
BEFORE UPDATE ON `guest_order_sessions`
WHEN (OLD.`revoked_at` IS NOT NULL AND OLD.`revoked_at` IS NOT NEW.`revoked_at`)
  OR (OLD.`last_seen_at` IS NOT NULL AND (NEW.`last_seen_at` IS NULL OR NEW.`last_seen_at` < OLD.`last_seen_at`))
  OR NEW.`idle_expires_at` < OLD.`idle_expires_at`
  OR NEW.`idle_expires_at` > NEW.`expires_at`
  OR (NEW.`last_seen_at` IS NOT NULL AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`last_seen_at`) IS NOT NEW.`last_seen_at`
    OR NEW.`last_seen_at` >= NEW.`expires_at`
  ))
  OR (NEW.`revoked_at` IS NOT NULL AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`revoked_at`) IS NOT NEW.`revoked_at`
    OR NEW.`revoked_at` < NEW.`created_at`
  ))
BEGIN
  SELECT RAISE(ABORT, 'identity_guest_session_transition_not_allowed');
END;--> statement-breakpoint

CREATE TABLE `administrators` (
	`id` text PRIMARY KEY NOT NULL,
	`external_subject_hash` text NOT NULL,
	`role` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`authz_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `ck_administrators_subject_hash` CHECK(
		length(`external_subject_hash`) = 64
		AND `external_subject_hash` = lower(`external_subject_hash`)
		AND `external_subject_hash` NOT GLOB '*[^0-9a-f]*'
	),
	CONSTRAINT `ck_administrators_role` CHECK(`role` IN ('owner', 'operations')),
	CONSTRAINT `ck_administrators_enabled` CHECK(`enabled` IN (0, 1)),
	CONSTRAINT `ck_administrators_authz_version` CHECK(`authz_version` > 0),
	CONSTRAINT `ck_administrators_timestamps` CHECK(
		strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) = `created_at`
		AND strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) = `updated_at`
		AND `updated_at` >= `created_at`
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_administrators_external_subject_hash` ON `administrators` (`external_subject_hash`);--> statement-breakpoint
CREATE INDEX `idx_administrators_enabled_role` ON `administrators` (`enabled`,`role`);--> statement-breakpoint
CREATE TRIGGER `trg_administrators_identity_and_version`
BEFORE UPDATE ON `administrators`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`external_subject_hash` IS NOT NEW.`external_subject_hash`
  OR OLD.`created_at` IS NOT NEW.`created_at`
  OR NEW.`authz_version` < OLD.`authz_version`
  OR (
    (OLD.`role` IS NOT NEW.`role` OR OLD.`enabled` IS NOT NEW.`enabled`)
    AND NEW.`authz_version` <= OLD.`authz_version`
  )
  OR NEW.`updated_at` < OLD.`updated_at`
BEGIN
  SELECT RAISE(ABORT, 'identity_admin_update_requires_version_bump');
END;--> statement-breakpoint

CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`administrator_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_token_hash` text NOT NULL,
	`evidence_hash` text NOT NULL,
	`authz_version` integer NOT NULL,
	`aal` integer NOT NULL,
	`external_authenticated_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`idle_expires_at` text NOT NULL,
	`last_seen_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`administrator_id`) REFERENCES `administrators`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `ck_admin_sessions_token_hash` CHECK(
		length(`token_hash`) = 64
		AND `token_hash` = lower(`token_hash`)
		AND `token_hash` NOT GLOB '*[^0-9a-f]*'
		AND length(`csrf_token_hash`) = 64
		AND `csrf_token_hash` = lower(`csrf_token_hash`)
		AND `csrf_token_hash` NOT GLOB '*[^0-9a-f]*'
		AND length(`evidence_hash`) = 64
		AND `evidence_hash` = lower(`evidence_hash`)
		AND `evidence_hash` NOT GLOB '*[^0-9a-f]*'
	),
	CONSTRAINT `ck_admin_sessions_aal` CHECK(`aal` >= 2),
	CONSTRAINT `ck_admin_sessions_timestamps` CHECK(
		strftime('%Y-%m-%dT%H:%M:%fZ', `external_authenticated_at`) = `external_authenticated_at`
		AND strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) = `created_at`
		AND strftime('%Y-%m-%dT%H:%M:%fZ', `expires_at`) = `expires_at`
		AND strftime('%Y-%m-%dT%H:%M:%fZ', `idle_expires_at`) = `idle_expires_at`
		AND `external_authenticated_at` <= `created_at`
		AND `expires_at` > `created_at`
		AND `idle_expires_at` > `created_at`
		AND `idle_expires_at` <= `expires_at`
		AND CAST(strftime('%s', `created_at`) AS integer) - CAST(strftime('%s', `external_authenticated_at`) AS integer) <= 300
		AND CAST(strftime('%s', `expires_at`) AS integer) - CAST(strftime('%s', `created_at`) AS integer) <= 28800
		AND CAST(strftime('%s', `idle_expires_at`) AS integer) - CAST(strftime('%s', `created_at`) AS integer) <= 900
		AND (`last_seen_at` IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', `last_seen_at`) = `last_seen_at`)
		AND (`revoked_at` IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', `revoked_at`) = `revoked_at`)
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_admin_sessions_token_hash` ON `admin_sessions` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_admin_sessions_evidence_hash` ON `admin_sessions` (`evidence_hash`);--> statement-breakpoint
CREATE INDEX `idx_admin_sessions_admin_expires_at` ON `admin_sessions` (`administrator_id`,`expires_at`);--> statement-breakpoint
CREATE TRIGGER `trg_admin_sessions_validate_insert`
BEFORE INSERT ON `admin_sessions`
WHEN NEW.`last_seen_at` IS NOT NULL
  OR NEW.`revoked_at` IS NOT NULL
  OR NOT EXISTS (
    SELECT 1 FROM `administrators`
    WHERE `id` = NEW.`administrator_id`
      AND `enabled` = 1
      AND `authz_version` = NEW.`authz_version`
  )
BEGIN
  SELECT RAISE(ABORT, 'identity_admin_session_requires_current_mfa_principal');
END;--> statement-breakpoint
CREATE TRIGGER `trg_admin_sessions_immutable_identity`
BEFORE UPDATE ON `admin_sessions`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`administrator_id` IS NOT NEW.`administrator_id`
  OR OLD.`token_hash` IS NOT NEW.`token_hash`
  OR OLD.`csrf_token_hash` IS NOT NEW.`csrf_token_hash`
  OR OLD.`evidence_hash` IS NOT NEW.`evidence_hash`
  OR OLD.`authz_version` IS NOT NEW.`authz_version`
  OR OLD.`aal` IS NOT NEW.`aal`
  OR OLD.`external_authenticated_at` IS NOT NEW.`external_authenticated_at`
  OR OLD.`expires_at` IS NOT NEW.`expires_at`
  OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'identity_admin_session_identity_is_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_admin_sessions_state_transition`
BEFORE UPDATE ON `admin_sessions`
WHEN (OLD.`revoked_at` IS NOT NULL AND OLD.`revoked_at` IS NOT NEW.`revoked_at`)
  OR (OLD.`last_seen_at` IS NOT NULL AND (NEW.`last_seen_at` IS NULL OR NEW.`last_seen_at` < OLD.`last_seen_at`))
  OR NEW.`idle_expires_at` < OLD.`idle_expires_at`
  OR NEW.`idle_expires_at` > NEW.`expires_at`
  OR (NEW.`last_seen_at` IS NOT NULL AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`last_seen_at`) IS NOT NEW.`last_seen_at`
    OR NEW.`last_seen_at` >= NEW.`expires_at`
  ))
  OR (NEW.`revoked_at` IS NOT NULL AND (
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`revoked_at`) IS NOT NEW.`revoked_at`
    OR NEW.`revoked_at` < NEW.`created_at`
  ))
BEGIN
  SELECT RAISE(ABORT, 'identity_admin_session_transition_not_allowed');
END;--> statement-breakpoint

CREATE TRIGGER `trg_access_challenges_audit_insert`
AFTER INSERT ON `access_challenges`
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_challenge_created_' || NEW.`id`, 'system', NULL,
    'identity_challenge_created', 'access_challenge', NEW.`id`,
    'identity:challenge:' || NEW.`id` || ':created', '{}', NEW.`created_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_access_challenges_audit_consumed`
AFTER UPDATE OF `consumed_at` ON `access_challenges`
WHEN OLD.`consumed_at` IS NULL AND NEW.`consumed_at` IS NOT NULL
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_challenge_consumed_' || NEW.`id`, 'system', NULL,
    'identity_challenge_consumed', 'access_challenge', NEW.`id`,
    'identity:challenge:' || NEW.`id` || ':consumed', '{}', NEW.`consumed_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_access_challenges_audit_revoked`
AFTER UPDATE OF `revoked_at` ON `access_challenges`
WHEN OLD.`revoked_at` IS NULL AND NEW.`revoked_at` IS NOT NULL
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_challenge_revoked_' || NEW.`id`, 'system', NULL,
    'identity_challenge_revoked', 'access_challenge', NEW.`id`,
    'identity:challenge:' || NEW.`id` || ':revoked', '{}', NEW.`revoked_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_customer_sessions_audit_insert`
AFTER INSERT ON `customer_sessions`
WHEN NEW.`authentication_source` <> 'legacy_revoked'
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_customer_session_' || NEW.`id`, 'customer', NEW.`customer_id`,
    'identity_session_started', 'customer_session', NEW.`id`,
    'identity:customer-session:' || NEW.`id` || ':started', '{}', NEW.`created_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_customer_sessions_audit_revoked`
AFTER UPDATE OF `revoked_at` ON `customer_sessions`
WHEN OLD.`revoked_at` IS NULL AND NEW.`revoked_at` IS NOT NULL
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_customer_revoked_' || NEW.`id`, 'customer', NEW.`customer_id`,
    'identity_session_revoked', 'customer_session', NEW.`id`,
    'identity:customer-session:' || NEW.`id` || ':revoked', '{}', NEW.`revoked_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_guest_order_sessions_audit_insert`
AFTER INSERT ON `guest_order_sessions`
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_guest_session_' || NEW.`id`, 'system', NULL,
    'identity_guest_session_started', 'guest_order_session', NEW.`id`,
    'identity:guest-session:' || NEW.`id` || ':started', '{}', NEW.`created_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_guest_order_sessions_audit_revoked`
AFTER UPDATE OF `revoked_at` ON `guest_order_sessions`
WHEN OLD.`revoked_at` IS NULL AND NEW.`revoked_at` IS NOT NULL
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_guest_revoked_' || NEW.`id`, 'system', NULL,
    'identity_guest_session_revoked', 'guest_order_session', NEW.`id`,
    'identity:guest-session:' || NEW.`id` || ':revoked', '{}', NEW.`revoked_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_administrators_audit_insert`
AFTER INSERT ON `administrators`
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_admin_created_' || NEW.`id`, 'system', NULL,
    'identity_admin_created', 'administrator', NEW.`id`,
    'identity:administrator:' || NEW.`id` || ':created', '{}', NEW.`created_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_administrators_audit_update`
AFTER UPDATE OF `role`, `enabled`, `authz_version` ON `administrators`
WHEN OLD.`role` IS NOT NEW.`role`
  OR OLD.`enabled` IS NOT NEW.`enabled`
  OR OLD.`authz_version` IS NOT NEW.`authz_version`
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_admin_changed_' || NEW.`id` || '_' || NEW.`authz_version`,
    'system', NULL, 'identity_admin_changed', 'administrator', NEW.`id`,
    'identity:administrator:' || NEW.`id` || ':version:' || NEW.`authz_version`,
    '{}', NEW.`updated_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_admin_sessions_audit_insert`
AFTER INSERT ON `admin_sessions`
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_admin_session_' || NEW.`id`, 'admin', NEW.`administrator_id`,
    'identity_admin_session_started', 'admin_session', NEW.`id`,
    'identity:admin-session:' || NEW.`id` || ':started', '{}', NEW.`created_at`
  );
END;--> statement-breakpoint
CREATE TRIGGER `trg_admin_sessions_audit_revoked`
AFTER UPDATE OF `revoked_at` ON `admin_sessions`
WHEN OLD.`revoked_at` IS NULL AND NEW.`revoked_at` IS NOT NULL
BEGIN
  INSERT INTO `audit_log` (
    `id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`,
    `idempotency_key`, `metadata_json`, `created_at`
  ) VALUES (
    'audit_identity_admin_revoked_' || NEW.`id`, 'admin', NEW.`administrator_id`,
    'identity_admin_session_revoked', 'admin_session', NEW.`id`,
    'identity:admin-session:' || NEW.`id` || ':revoked', '{}', NEW.`revoked_at`
  );
END;
