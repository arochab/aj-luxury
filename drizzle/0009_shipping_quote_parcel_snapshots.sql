CREATE TABLE `shipping_quote_parcel_snapshots` (
	`quote_id` text PRIMARY KEY NOT NULL,
	`profile_code` text NOT NULL,
	`source_version` text NOT NULL,
	`item_count` integer NOT NULL,
	`weight_grams` integer NOT NULL,
	`length_mm` integer NOT NULL,
	`width_mm` integer NOT NULL,
	`height_mm` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `shipping_quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_shipping_quote_parcel_snapshots_exact_profile" CHECK("shipping_quote_parcel_snapshots"."source_version" = 'client-validated-2026-08-13'
        AND "shipping_quote_parcel_snapshots"."length_mm" = 400
        AND "shipping_quote_parcel_snapshots"."width_mm" = 320
        AND "shipping_quote_parcel_snapshots"."height_mm" = 40
        AND (
          ("shipping_quote_parcel_snapshots"."item_count" = 1
            AND "shipping_quote_parcel_snapshots"."profile_code" = 'AJL_ENVELOPE_1_ITEM_V1'
            AND "shipping_quote_parcel_snapshots"."weight_grams" = 150)
          OR ("shipping_quote_parcel_snapshots"."item_count" = 2
            AND "shipping_quote_parcel_snapshots"."profile_code" = 'AJL_ENVELOPE_2_ITEMS_V1'
            AND "shipping_quote_parcel_snapshots"."weight_grams" = 250)
          OR ("shipping_quote_parcel_snapshots"."item_count" = 3
            AND "shipping_quote_parcel_snapshots"."profile_code" = 'AJL_ENVELOPE_3_ITEMS_V1'
            AND "shipping_quote_parcel_snapshots"."weight_grams" = 350)
        ))
);--> statement-breakpoint
CREATE TRIGGER `trg_shipping_quote_parcel_snapshot_matches_cart`
BEFORE INSERT ON `shipping_quote_parcel_snapshots`
WHEN NEW.`item_count` <> COALESCE((
  SELECT SUM(line.`quantity`)
  FROM `shipping_quotes` AS quote
  INNER JOIN `cart_lines` AS line ON line.`cart_id` = quote.`cart_id`
  WHERE quote.`id` = NEW.`quote_id`
), 0)
BEGIN SELECT RAISE(ABORT, 'shipping_quote_parcel_cart_mismatch'); END;--> statement-breakpoint
CREATE TRIGGER `trg_shipping_quote_parcel_snapshot_immutable_update`
BEFORE UPDATE ON `shipping_quote_parcel_snapshots`
BEGIN SELECT RAISE(ABORT, 'shipping_quote_parcel_snapshot_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `trg_shipping_quote_parcel_snapshot_retain_delete`
BEFORE DELETE ON `shipping_quote_parcel_snapshots`
WHEN EXISTS (
  SELECT 1 FROM `shipping_quotes` WHERE `id` = OLD.`quote_id`
)
BEGIN SELECT RAISE(ABORT, 'shipping_quote_parcel_snapshot_retain'); END;
