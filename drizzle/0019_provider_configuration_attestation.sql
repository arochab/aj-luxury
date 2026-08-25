CREATE TABLE `production_provider_configuration_attestations` (
	`release_sha` text PRIMARY KEY NOT NULL,
	`worker_version_id` text NOT NULL,
	`stock_manifest_id` text NOT NULL,
	`protocol` text NOT NULL,
	`configuration_sha256` text NOT NULL,
	`stripe_account_id` text NOT NULL,
	`sendcloud_integration_id` text NOT NULL,
	`sendcloud_sender_address_id` text NOT NULL,
	`resend_domain` text NOT NULL,
	`commerce_origin` text NOT NULL,
	`transactional_from_email` text NOT NULL,
	`attested_at` text NOT NULL,
	FOREIGN KEY (`stock_manifest_id`) REFERENCES `production_launch_stock_manifests`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_production_provider_configuration_protocol" CHECK("production_provider_configuration_attestations"."protocol" = 'ajl-production-provider-configuration-v1'),
	CONSTRAINT "ck_production_provider_configuration_hashes" CHECK(
		length("production_provider_configuration_attestations"."release_sha") = 40
		AND "production_provider_configuration_attestations"."release_sha" = lower("production_provider_configuration_attestations"."release_sha")
		AND "production_provider_configuration_attestations"."release_sha" NOT GLOB '*[^0-9a-f]*'
		AND length("production_provider_configuration_attestations"."worker_version_id") = 36
		AND lower("production_provider_configuration_attestations"."worker_version_id") = "production_provider_configuration_attestations"."worker_version_id"
		AND "production_provider_configuration_attestations"."worker_version_id" NOT GLOB '*[^0-9a-f-]*'
		AND substr("production_provider_configuration_attestations"."worker_version_id", 9, 1) = '-'
		AND substr("production_provider_configuration_attestations"."worker_version_id", 14, 1) = '-'
		AND substr("production_provider_configuration_attestations"."worker_version_id", 19, 1) = '-'
		AND substr("production_provider_configuration_attestations"."worker_version_id", 24, 1) = '-'
		AND length("production_provider_configuration_attestations"."configuration_sha256") = 64
		AND "production_provider_configuration_attestations"."configuration_sha256" = lower("production_provider_configuration_attestations"."configuration_sha256")
		AND "production_provider_configuration_attestations"."configuration_sha256" NOT GLOB '*[^0-9a-f]*'
	),
	CONSTRAINT "ck_production_provider_configuration_identities" CHECK(
		length("production_provider_configuration_attestations"."stripe_account_id") BETWEEN 13 AND 69
		AND substr("production_provider_configuration_attestations"."stripe_account_id", 1, 5) = 'acct_'
		AND substr("production_provider_configuration_attestations"."stripe_account_id", 6) NOT GLOB '*[^A-Za-z0-9]*'
		AND length("production_provider_configuration_attestations"."sendcloud_integration_id") BETWEEN 1 AND 128
		AND "production_provider_configuration_attestations"."sendcloud_integration_id" NOT GLOB '*[^A-Za-z0-9_.:-]*'
		AND length("production_provider_configuration_attestations"."sendcloud_sender_address_id") BETWEEN 1 AND 128
		AND "production_provider_configuration_attestations"."sendcloud_sender_address_id" NOT GLOB '*[^A-Za-z0-9_.:-]*'
		AND length("production_provider_configuration_attestations"."resend_domain") BETWEEN 4 AND 253
		AND "production_provider_configuration_attestations"."resend_domain" = lower("production_provider_configuration_attestations"."resend_domain")
		AND "production_provider_configuration_attestations"."resend_domain" GLOB '*.*'
		AND "production_provider_configuration_attestations"."resend_domain" NOT GLOB '*[^a-z0-9.-]*'
		AND length("production_provider_configuration_attestations"."commerce_origin") BETWEEN 12 AND 261
		AND substr("production_provider_configuration_attestations"."commerce_origin", 1, 8) = 'https://'
		AND substr("production_provider_configuration_attestations"."commerce_origin", 9) = lower(substr("production_provider_configuration_attestations"."commerce_origin", 9))
		AND substr("production_provider_configuration_attestations"."commerce_origin", 9) NOT GLOB '*[^a-z0-9.-]*'
		AND length("production_provider_configuration_attestations"."transactional_from_email") BETWEEN 3 AND 254
		AND "production_provider_configuration_attestations"."transactional_from_email" = lower("production_provider_configuration_attestations"."transactional_from_email")
		AND instr("production_provider_configuration_attestations"."transactional_from_email", '@') > 1
		AND substr("production_provider_configuration_attestations"."transactional_from_email", instr("production_provider_configuration_attestations"."transactional_from_email", '@') + 1) = "production_provider_configuration_attestations"."resend_domain"
	),
	CONSTRAINT "ck_production_provider_configuration_timestamp" CHECK(
		strftime('%Y-%m-%dT%H:%M:%fZ', "production_provider_configuration_attestations"."attested_at") = "production_provider_configuration_attestations"."attested_at"
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_production_provider_configuration_manifest`
ON `production_provider_configuration_attestations` (`stock_manifest_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_production_provider_configuration_digest`
ON `production_provider_configuration_attestations` (`configuration_sha256`);--> statement-breakpoint

CREATE TRIGGER `trg_production_provider_configuration_validate`
BEFORE INSERT ON `production_provider_configuration_attestations`
WHEN NOT EXISTS (
	SELECT 1 FROM `production_launch_stock_manifests` AS manifest
	WHERE manifest.`id` = NEW.`stock_manifest_id`
		AND manifest.`release_sha` = NEW.`release_sha`
		AND lower(manifest.`worker_version_id`) = NEW.`worker_version_id`
		AND NEW.`attested_at` >= manifest.`activated_at`
)
BEGIN
	SELECT RAISE(ABORT, 'production_provider_configuration_attestation_invalid');
END;--> statement-breakpoint

CREATE TRIGGER `trg_production_provider_configuration_immutable`
BEFORE UPDATE ON `production_provider_configuration_attestations`
BEGIN
	SELECT RAISE(ABORT, 'production_provider_configuration_attestation_is_immutable');
END;--> statement-breakpoint

CREATE TRIGGER `trg_production_provider_configuration_retain`
BEFORE DELETE ON `production_provider_configuration_attestations`
BEGIN
	SELECT RAISE(ABORT, 'production_provider_configuration_attestation_must_be_retained');
END;--> statement-breakpoint

INSERT INTO `production_runtime_schema_proofs` (`migration_id`, `contract_sha256`, `installed_at`)
VALUES (
	'0019_provider_configuration_attestation',
	'9f95eb43716e3cc288d197fc045df8e71d227bbd151179c2aa3e72b2de02524d',
	'2026-08-25T12:00:00.000Z'
);
