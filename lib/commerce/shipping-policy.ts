import { isIso3166Alpha2CountryCode } from "./iso-country-codes.ts";

export const launchShippingZones = Object.freeze([
  "EU",
  "UK",
  "US",
  "CA",
] as const);
export type LaunchShippingZone = (typeof launchShippingZones)[number];

const launchShippingZoneSet = new Set<string>(launchShippingZones);

const euCountryCodes = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);

const usSpecialRegions = new Set([
  "AA",
  "AE",
  "AP",
  "AS",
  "GU",
  "MP",
  "PR",
  "UM",
  "VI",
]);

export type ShippingAddressScopeInput = {
  countryCode: string;
  postalCode?: string;
  regionCode?: string;
};

export type ShippingScopeDecision =
  | {
      inScope: true;
      zone: LaunchShippingZone;
      checkoutEnabled: false;
      reason: "carrier-and-rate-configuration-pending";
    }
  | {
      inScope: false;
      zone: null;
      checkoutEnabled: false;
      reason:
        | "country-outside-launch-scope"
        | "special-territory-needs-explicit-validation"
        | "invalid-country-code"
        | "invalid-address-input";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return isIso3166Alpha2CountryCode(normalized) ? normalized : null;
}

function normalizePostalCode(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

function isShippingAddressScopeInput(
  value: unknown,
): value is ShippingAddressScopeInput {
  return (
    isRecord(value) &&
    typeof value.countryCode === "string" &&
    (value.postalCode === undefined || typeof value.postalCode === "string") &&
    (value.regionCode === undefined || typeof value.regionCode === "string")
  );
}

function isSpecialTerritory(
  input: ShippingAddressScopeInput,
  country: string,
): boolean {
  const postal = normalizePostalCode(input.postalCode);
  const region = (input.regionCode ?? "").trim().toUpperCase();

  if (country === "FR") {
    return /^(97[1-8]|98[4-8])/.test(postal);
  }

  if (country === "GB") {
    return /^(JE|GY|IM|GX)/.test(postal);
  }

  if (country === "US") {
    return usSpecialRegions.has(region);
  }

  if (country === "GR") {
    return /^(?:GR-?)?63086/.test(postal);
  }

  if (country === "ES") {
    return /^(35|38|51|52)/.test(postal);
  }

  if (country === "PT") {
    return /^9/.test(postal);
  }

  if (country === "FI") {
    return /^22/.test(postal);
  }

  if (country === "DE") {
    return /^(27498|78266)/.test(postal);
  }

  if (country === "IT") {
    return /^(22061|23041)/.test(postal);
  }

  return false;
}

export function resolveLaunchShippingScope(
  input: ShippingAddressScopeInput,
): ShippingScopeDecision;
export function resolveLaunchShippingScope(
  input: unknown,
): ShippingScopeDecision {
  if (!isShippingAddressScopeInput(input)) {
    return {
      inScope: false,
      zone: null,
      checkoutEnabled: false,
      reason: "invalid-address-input",
    };
  }

  const country = normalizeCountryCode(input.countryCode);
  if (!country) {
    return {
      inScope: false,
      zone: null,
      checkoutEnabled: false,
      reason: "invalid-country-code",
    };
  }

  if (isSpecialTerritory(input, country)) {
    return {
      inScope: false,
      zone: null,
      checkoutEnabled: false,
      reason: "special-territory-needs-explicit-validation",
    };
  }

  const zone = euCountryCodes.has(country)
    ? "EU"
    : country === "GB"
      ? "UK"
      : country === "US"
        ? "US"
        : country === "CA"
          ? "CA"
          : null;

  if (!zone) {
    return {
      inScope: false,
      zone: null,
      checkoutEnabled: false,
      reason: "country-outside-launch-scope",
    };
  }

  return {
    inScope: true,
    zone,
    checkoutEnabled: false,
    reason: "carrier-and-rate-configuration-pending",
  };
}

export type ParcelConfiguration = {
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  originCountryCode: string | null;
};

export type ZoneActivationInput = {
  zone: LaunchShippingZone;
  carrierServiceCode: string | null;
  priceCents: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  dutiesTerms: "EU_INCLUDED" | "DAP" | "DDP" | null;
  parcel: ParcelConfiguration;
};

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= maximum
  );
}

function isPositiveFinite(value: unknown, maximum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= maximum
  );
}

export function getZoneActivationBlockers(input: ZoneActivationInput): string[];
export function getZoneActivationBlockers(input: unknown): string[] {
  const blockers: string[] = [];
  const record = isRecord(input) ? input : {};
  const parcel = isRecord(record.parcel) ? record.parcel : {};
  const zone = typeof record.zone === "string" ? record.zone : null;
  const zoneIsValid = zone !== null && launchShippingZoneSet.has(zone);

  if (!zoneIsValid) blockers.push("zone");
  if (
    typeof record.carrierServiceCode !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(record.carrierServiceCode)
  ) {
    blockers.push("carrier-service");
  }
  if (!isNonNegativeSafeInteger(record.priceCents)) blockers.push("price");
  if (!isPositiveSafeInteger(record.estimatedDaysMin, 365)) {
    blockers.push("minimum-delivery-time");
  }
  if (
    !isPositiveSafeInteger(record.estimatedDaysMax, 365) ||
    !isPositiveSafeInteger(record.estimatedDaysMin, 365) ||
    record.estimatedDaysMax < record.estimatedDaysMin
  ) {
    blockers.push("maximum-delivery-time");
  }

  const dutiesTerms = record.dutiesTerms;
  const dutiesAreRecognized =
    dutiesTerms === "EU_INCLUDED" || dutiesTerms === "DAP" || dutiesTerms === "DDP";
  if (!dutiesAreRecognized) blockers.push("duties-terms");
  if (zone === "EU" && dutiesAreRecognized && dutiesTerms !== "EU_INCLUDED") {
    blockers.push("eu-duties-terms");
  }
  if (
    zoneIsValid &&
    zone !== "EU" &&
    dutiesAreRecognized &&
    dutiesTerms !== "DAP" &&
    dutiesTerms !== "DDP"
  ) {
    blockers.push("international-duties-terms");
  }

  if (!isPositiveSafeInteger(parcel.weightGrams, 1_000_000)) {
    blockers.push("weight");
  }
  if (!isPositiveFinite(parcel.lengthCm, 1_000)) blockers.push("length");
  if (!isPositiveFinite(parcel.widthCm, 1_000)) blockers.push("width");
  if (!isPositiveFinite(parcel.heightCm, 1_000)) blockers.push("height");
  if (!normalizeCountryCode(parcel.originCountryCode)) {
    blockers.push("origin-country");
  }

  return [...new Set(blockers)];
}
