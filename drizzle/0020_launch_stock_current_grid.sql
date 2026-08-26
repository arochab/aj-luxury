PRAGMA foreign_keys=OFF;
--> statement-breakpoint
PRAGMA legacy_alter_table=ON;
--> statement-breakpoint
DROP TRIGGER `trg_production_stock_manifest_immutable`;
--> statement-breakpoint
DROP TRIGGER `trg_production_stock_manifest_retain`;
--> statement-breakpoint
CREATE TABLE `production_launch_stock_manifests_current` (
  `id` text PRIMARY KEY NOT NULL,
  `protocol` text NOT NULL,
  `payload_sha256` text NOT NULL,
  `counted_at` text NOT NULL,
  `release_sha` text NOT NULL,
  `worker_version_id` text NOT NULL,
  `physical_total` integer NOT NULL,
  `variant_count` integer NOT NULL,
  `gifting_reserve_total` integer NOT NULL,
  `safety_reserve_total` integer NOT NULL,
  `sav_reserve_total` integer NOT NULL,
  `sellable_total` integer NOT NULL,
  `stock_owner_id` text NOT NULL,
  `release_owner_id` text NOT NULL,
  `stock_owner_signed_at` text NOT NULL,
  `release_owner_signed_at` text NOT NULL,
  `activated_at` text NOT NULL,
  CONSTRAINT "ck_production_stock_manifest_protocol" CHECK(
    `protocol` IN ('ajl-launch-stock-import-v1', 'ajl-launch-stock-import-v2')
  ),
  CONSTRAINT "ck_production_stock_manifest_hashes" CHECK(
    length(`payload_sha256`) = 64
    AND `payload_sha256` = lower(`payload_sha256`)
    AND `payload_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`release_sha`) = 40
    AND `release_sha` = lower(`release_sha`)
    AND `release_sha` NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT "ck_production_stock_manifest_totals" CHECK(
    `variant_count` = 12
    AND (
      (`protocol` = 'ajl-launch-stock-import-v1' AND `physical_total` = 756)
      OR (`protocol` = 'ajl-launch-stock-import-v2'
        AND `physical_total` = 749
        AND `gifting_reserve_total` = 23
        AND `safety_reserve_total` = 0
        AND `sav_reserve_total` = 0
        AND `sellable_total` = 726)
    )
    AND `gifting_reserve_total` >= 0
    AND `safety_reserve_total` >= 0
    AND `sav_reserve_total` >= 0
    AND `sellable_total` >= 0
    AND `gifting_reserve_total` + `safety_reserve_total`
      + `sav_reserve_total` + `sellable_total` = `physical_total`
  ),
  CONSTRAINT "ck_production_stock_manifest_distinct_approvers" CHECK(
    `stock_owner_id` <> `release_owner_id`
  )
);
--> statement-breakpoint
INSERT INTO `production_launch_stock_manifests_current` (
  `id`, `protocol`, `payload_sha256`, `counted_at`, `release_sha`,
  `worker_version_id`, `physical_total`, `variant_count`,
  `gifting_reserve_total`, `safety_reserve_total`, `sav_reserve_total`,
  `sellable_total`, `stock_owner_id`, `release_owner_id`,
  `stock_owner_signed_at`, `release_owner_signed_at`, `activated_at`
)
SELECT `id`, `protocol`, `payload_sha256`, `counted_at`, `release_sha`,
  `worker_version_id`, `physical_total`, `variant_count`,
  `gifting_reserve_total`, `safety_reserve_total`, `sav_reserve_total`,
  `sellable_total`, `stock_owner_id`, `release_owner_id`,
  `stock_owner_signed_at`, `release_owner_signed_at`, `activated_at`
FROM `production_launch_stock_manifests`;
--> statement-breakpoint
DROP TABLE `production_launch_stock_manifests`;
--> statement-breakpoint
ALTER TABLE `production_launch_stock_manifests_current`
RENAME TO `production_launch_stock_manifests`;
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_production_stock_manifest_payload`
ON `production_launch_stock_manifests` (`payload_sha256`);
--> statement-breakpoint
CREATE TRIGGER `trg_production_stock_manifest_immutable`
BEFORE UPDATE ON `production_launch_stock_manifests`
BEGIN
  SELECT RAISE(ABORT, 'production_stock_manifest_is_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_production_stock_manifest_retain`
BEFORE DELETE ON `production_launch_stock_manifests`
BEGIN
  SELECT RAISE(ABORT, 'production_stock_manifest_must_be_retained');
END;
--> statement-breakpoint
INSERT INTO `production_runtime_schema_proofs` (
  `migration_id`, `contract_sha256`, `installed_at`
) VALUES (
  '0020_launch_stock_current_grid',
  '8116bfbc132aa2db8e06c82d1575afe63886c9213dc61c395627089219e53cc3',
  '2026-08-26T00:00:00.000Z'
);
--> statement-breakpoint
PRAGMA legacy_alter_table=OFF;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
