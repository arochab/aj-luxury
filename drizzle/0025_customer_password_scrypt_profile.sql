-- Preserve historical credentials while making the production-proven,
-- memory-hard OWASP scrypt profile authoritative for new passwords.
DROP TRIGGER IF EXISTS `trg_customer_password_credentials_audit_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_customer_password_credentials_audit_update`;--> statement-breakpoint

ALTER TABLE `customer_password_credentials`
RENAME TO `customer_password_credentials_legacy_0025`;--> statement-breakpoint

CREATE TABLE `customer_password_credentials` (
  `customer_id` text PRIMARY KEY NOT NULL,
  `algorithm` text NOT NULL,
  `iterations` integer NOT NULL,
  `salt_base64url` text NOT NULL,
  `hash_base64url` text NOT NULL,
  `failed_attempts` integer DEFAULT 0 NOT NULL,
  `locked_until` text,
  `password_changed_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_customer_password_hash` CHECK(
    (
      (`algorithm` = 'scrypt-n16384-r8-p5' AND `iterations` = 5)
      OR (`algorithm` = 'pbkdf2-sha512' AND `iterations` = 220000)
      OR (`algorithm` = 'pbkdf2-sha256' AND `iterations` = 600000)
    )
    AND length(`salt_base64url`) = 22
    AND `salt_base64url` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND length(`hash_base64url`) = 43
    AND `hash_base64url` NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  CONSTRAINT `ck_customer_password_failures` CHECK(
    `failed_attempts` >= 0 AND `failed_attempts` <= 100
  )
);--> statement-breakpoint

INSERT INTO `customer_password_credentials` (
  `customer_id`,`algorithm`,`iterations`,`salt_base64url`,`hash_base64url`,
  `failed_attempts`,`locked_until`,`password_changed_at`,`created_at`,`updated_at`
)
SELECT
  `customer_id`,`algorithm`,`iterations`,`salt_base64url`,`hash_base64url`,
  `failed_attempts`,`locked_until`,`password_changed_at`,`created_at`,`updated_at`
FROM `customer_password_credentials_legacy_0025`;--> statement-breakpoint

DROP TABLE `customer_password_credentials_legacy_0025`;--> statement-breakpoint

CREATE TRIGGER `trg_customer_password_credentials_audit_insert`
AFTER INSERT ON `customer_password_credentials`
BEGIN
  INSERT INTO `audit_log` (
    `id`,`actor_type`,`actor_id`,`action`,`entity_type`,`entity_id`,
    `idempotency_key`,`metadata_json`,`created_at`
  ) VALUES (
    'audit_password_created_' || NEW.`customer_id`, 'customer', NEW.`customer_id`,
    'identity_password_created', 'customer', NEW.`customer_id`,
    'identity:password:' || NEW.`customer_id` || ':created', '{}', NEW.`created_at`
  );
END;--> statement-breakpoint

CREATE TRIGGER `trg_customer_password_credentials_audit_update`
AFTER UPDATE OF `password_changed_at` ON `customer_password_credentials`
WHEN OLD.`password_changed_at` IS NOT NEW.`password_changed_at`
BEGIN
  INSERT INTO `audit_log` (
    `id`,`actor_type`,`actor_id`,`action`,`entity_type`,`entity_id`,
    `idempotency_key`,`metadata_json`,`created_at`
  ) VALUES (
    'audit_password_changed_' || NEW.`customer_id` || '_' || replace(NEW.`password_changed_at`, ':', ''),
    'customer', NEW.`customer_id`, 'identity_password_changed', 'customer', NEW.`customer_id`,
    'identity:password:' || NEW.`customer_id` || ':changed:' || NEW.`password_changed_at`,
    '{}', NEW.`password_changed_at`
  );
END;--> statement-breakpoint

PRAGMA optimize;
