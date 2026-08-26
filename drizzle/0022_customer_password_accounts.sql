-- Customer credentials are one-way PBKDF2-HMAC-SHA-256 hashes. Verification
-- and recovery tokens are also stored only as contextual SHA-256 digests.
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
    `algorithm` = 'pbkdf2-sha256' AND `iterations` = 600000
    AND length(`salt_base64url`) = 22
    AND `salt_base64url` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND length(`hash_base64url`) = 43
    AND `hash_base64url` NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  CONSTRAINT `ck_customer_password_failures` CHECK(
    `failed_attempts` >= 0 AND `failed_attempts` <= 100
  )
);--> statement-breakpoint

CREATE TABLE `customer_account_challenges` (
  `id` text PRIMARY KEY NOT NULL,
  `purpose` text NOT NULL,
  `customer_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `consumed_at` text,
  `revoked_at` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_customer_account_challenge_purpose` CHECK(
    `purpose` IN ('email_verification', 'password_reset')
  ),
  CONSTRAINT `ck_customer_account_challenge_hash` CHECK(
    length(`token_hash`) = 64 AND `token_hash` = lower(`token_hash`)
    AND `token_hash` NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT `ck_customer_account_challenge_ttl` CHECK(
    `expires_at` > `created_at`
    AND CAST(strftime('%s', `expires_at`) AS integer)
      - CAST(strftime('%s', `created_at`) AS integer)
      <= CASE WHEN `purpose` = 'email_verification' THEN 86400 ELSE 3600 END
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_customer_account_challenges_token_hash`
ON `customer_account_challenges` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_customer_account_challenges_active`
ON `customer_account_challenges` (`customer_id`,`purpose`,`expires_at`);--> statement-breakpoint

CREATE TABLE `customer_checkout_links` (
  `id` text PRIMARY KEY NOT NULL,
  `customer_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `revoked_at` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_customer_checkout_link_hash` CHECK(
    length(`token_hash`) = 64 AND `token_hash` = lower(`token_hash`)
    AND `token_hash` NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT `ck_customer_checkout_link_ttl` CHECK(
    `expires_at` > `created_at`
    AND CAST(strftime('%s', `expires_at`) AS integer)
      - CAST(strftime('%s', `created_at`) AS integer) <= 3600
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_customer_checkout_links_token_hash`
ON `customer_checkout_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_customer_checkout_links_customer_expires`
ON `customer_checkout_links` (`customer_id`,`expires_at`);--> statement-breakpoint

-- Marketing is deliberately separate from contract/order processing. This
-- append-only ledger proves the explicit choice and its exact source/version.
CREATE TABLE `customer_marketing_consents` (
  `id` text PRIMARY KEY NOT NULL,
  `customer_id` text NOT NULL,
  `decision` text NOT NULL,
  `source` text NOT NULL,
  `privacy_version` text NOT NULL,
  `occurred_at` text NOT NULL,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_customer_marketing_consent_decision` CHECK(
    `decision` IN ('granted', 'withdrawn')
  ),
  CONSTRAINT `ck_customer_marketing_consent_source` CHECK(
    `source` IN ('account_registration', 'checkout', 'account_settings')
  )
);--> statement-breakpoint
CREATE INDEX `idx_customer_marketing_consents_customer_time`
ON `customer_marketing_consents` (`customer_id`,`occurred_at`);--> statement-breakpoint

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
