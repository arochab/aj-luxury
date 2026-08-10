export const launchShippingZones = ["EU", "UK", "US", "CA"] as const;
export type LaunchShippingZone = (typeof launchShippingZones)[number];

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

const usTerritories = new Set(["AS", "GU", "MP", "PR", "UM", "VI"]);

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
        | "invalid-country-code";
    };

function normalizeCountryCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function normalizePostalCode(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

function isSpecialTerritory(input: ShippingAddressScopeInput): boolean {
  const country = normalizeCountryCode(input.countryCode);
  const postal = normalizePostalCode(input.postalCode);
  const region = (input.regionCode ?? "").trim().toUpperCase();

  if (!country) {
    return false;
  }

  if (country === "FR") {
    return /^(97[1-8]|98[4-8])/.test(postal);
  }

  if (country === "US") {
    return usTerritories.has(region);
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
): ShippingScopeDecision {
  const country = normalizeCountryCode(input.countryCode);

  if (!country) {
    return {
      inScope: false,
      zone: null,
      checkoutEnabled: false,
      reason: "invalid-country-code",
    };
  }

  if (isSpecialTerritory(input)) {
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

export function getZoneActivationBlockers(
  input: ZoneActivationInput,
): string[] {
  const blockers: string[] = [];
  const { parcel } = input;

  const isNonNegativeSafeInteger = (value: number | null): value is number =>
    value !== null && Number.isSafeInteger(value) && value >= 0;
  const isPositiveSafeInteger = (
    value: number | null,
    maximum = Number.MAX_SAFE_INTEGER,
  ): value is number =>
    value !== null &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= maximum;
  const isPositiveFinite = (
    value: number | null,
    maximum: number,
  ): value is number =>
    value !== null && Number.isFinite(value) && value > 0 && value <= maximum;

  if (!(launchShippingZones as readonly string[]).includes(input.zone)) {
    blockers.push("zone");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(input.carrierServiceCode ?? "")) {
    blockers.push("carrier-service");
  }
  if (!isNonNegativeSafeInteger(input.priceCents)) blockers.push("price");
  if (!isPositiveSafeInteger(input.estimatedDaysMin, 365)) {
    blockers.push("minimum-delivery-time");
  }
  if (
    !isPositiveSafeInteger(input.estimatedDaysMax, 365) ||
    !isPositiveSafeInteger(input.estimatedDaysMin, 365) ||
    input.estimatedDaysMax < input.estimatedDaysMin
  ) {
    blockers.push("maximum-delivery-time");
  }
  if (!input.dutiesTerms) blockers.push("duties-terms");
  if (input.zone === "EU" && input.dutiesTerms && input.dutiesTerms !== "EU_INCLUDED") {
    blockers.push("eu-duties-terms");
  }
  if (
    input.zone !== "EU" &&
    input.dutiesTerms &&
    input.dutiesTerms !== "DAP" &&
    input.dutiesTerms !== "DDP"
  ) {
    blockers.push("international-duties-terms");
  }
  if (!isPositiveSafeInteger(parcel.weightGrams, 1_000_000)) blockers.push("weight");
  if (!isPositiveFinite(parcel.lengthCm, 1_000)) blockers.push("length");
  if (!isPositiveFinite(parcel.widthCm, 1_000)) blockers.push("width");
  if (!isPositiveFinite(parcel.heightCm, 1_000)) blockers.push("height");
  if (!normalizeCountryCode(parcel.originCountryCode ?? "")) {
    blockers.push("origin-country");
  }

  return [...new Set(blockers)];
}
