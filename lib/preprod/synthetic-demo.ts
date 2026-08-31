import type { ShippingAddressInput } from "../commerce/fulfillment-domain.ts";

export const SYNTHETIC_DEMO_DATASET_KIND = "synthetic-demo" as const;
export const SYNTHETIC_DEMO_FIXTURE_VERSION = "aj-demo-v1" as const;
export const SYNTHETIC_DEMO_MIGRATION =
  "0008_preprod_synthetic_demo_dataset.sql" as const;
export const SYNTHETIC_DEMO_EXPIRES_AT =
  "2026-09-30T23:59:59.999Z" as const;

export type SyntheticDemoZone = "EU" | "UK" | "US" | "CA";

export type SyntheticDemoAddressFixture = Readonly<{
  zone: SyntheticDemoZone;
  label: string;
  address: ShippingAddressInput;
}>;

/**
 * Exact, non-deliverable fixtures for the owner-only private preproduction.
 * The server compares the normalized canonical value; clients cannot submit a
 * free-form address to the synthetic checkout.
 */
export const SYNTHETIC_DEMO_ADDRESS_FIXTURES:
  readonly SyntheticDemoAddressFixture[] = Object.freeze([
    Object.freeze({
      zone: "EU",
      label: "Union européenne - adresse fictive, ne pas expédier",
      address: Object.freeze({
        recipient: "AJ LUXURY DEMO - NE PAS EXPEDIER",
        line1: "1 RUE DEMONSTRATION - NE PAS EXPEDIER",
        postalCode: "75001",
        city: "PARIS DEMO",
        countryCode: "FR",
      }),
    }),
    Object.freeze({
      zone: "UK",
      label: "Royaume-Uni - adresse fictive, ne pas expédier",
      address: Object.freeze({
        recipient: "AJ LUXURY DEMO - DO NOT SHIP",
        line1: "1 DEMO STREET - DO NOT SHIP",
        postalCode: "SW1A 1AA",
        city: "LONDON DEMO",
        countryCode: "GB",
      }),
    }),
    Object.freeze({
      zone: "US",
      label: "Etats-Unis - adresse fictive, ne pas expédier",
      address: Object.freeze({
        recipient: "AJ LUXURY DEMO - DO NOT SHIP",
        line1: "1 DEMO AVENUE - DO NOT SHIP",
        postalCode: "10001",
        city: "NEW YORK DEMO",
        regionCode: "NY",
        countryCode: "US",
      }),
    }),
    Object.freeze({
      zone: "CA",
      label: "Canada - adresse fictive, ne pas expédier",
      address: Object.freeze({
        recipient: "AJ LUXURY DEMO - NE PAS EXPEDIER",
        line1: "1 RUE DEMONSTRATION - NE PAS EXPEDIER",
        postalCode: "H2X 1Y4",
        city: "MONTREAL DEMO",
        regionCode: "QC",
        countryCode: "CA",
      }),
    }),
  ]);

export const SYNTHETIC_DEMO_EMAIL = "client@demo.invalid" as const;

function canonicalFixtureJson(address: ShippingAddressInput): string {
  return JSON.stringify({
    recipient: address.recipient,
    company: address.company ?? null,
    line1: address.line1,
    line2: address.line2 ?? null,
    postalCode: address.postalCode,
    city: address.city,
    regionCode: address.regionCode ?? null,
    countryCode: address.countryCode,
  });
}

const canonicalFixtureByZone = new Map<string, string>(
  SYNTHETIC_DEMO_ADDRESS_FIXTURES.map((fixture) => [
    fixture.zone,
    canonicalFixtureJson(fixture.address),
  ]),
);

export function isExactSyntheticDemoAddress(
  zone: string,
  canonicalJson: string,
): boolean {
  return canonicalFixtureByZone.get(zone) === canonicalJson;
}
