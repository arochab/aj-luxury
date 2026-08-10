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

const usLaunchRegions = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
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

function snapshotShippingAddressScopeInput(
  value: unknown,
): ShippingAddressScopeInput | null {
  if (!isRecord(value)) return null;

  try {
    // Read each untrusted property exactly once, then make every decision from
    // this plain snapshot. This closes accessor/Proxy TOCTOU switching.
    const countryCode = value.countryCode;
    const postalCode = value.postalCode;
    const regionCode = value.regionCode;
    if (
      typeof countryCode !== "string" ||
      (postalCode !== undefined && typeof postalCode !== "string") ||
      (regionCode !== undefined && typeof regionCode !== "string")
    ) {
      return null;
    }
    return { countryCode, postalCode, regionCode };
  } catch {
    return null;
  }
}

function normalizeRegionCode(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function isSpecialTerritory(
  input: ShippingAddressScopeInput,
  country: string,
  region: string | null,
): boolean {
  const postal = normalizePostalCode(input.postalCode);

  if (country === "FR") {
    return /^(97[1-8]|98[4-8])/.test(postal);
  }

  if (country === "GB") {
    return /^(JE|GY|IM|GX)/.test(postal);
  }

  if (country === "US") {
    return region !== null && usSpecialRegions.has(region);
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
  const snapshot = snapshotShippingAddressScopeInput(input);
  if (!snapshot) {
    return {
      inScope: false,
      zone: null,
      checkoutEnabled: false,
      reason: "invalid-address-input",
    };
  }

  const country = normalizeCountryCode(snapshot.countryCode);
  if (!country) {
    return {
      inScope: false,
      zone: null,
      checkoutEnabled: false,
      reason: "invalid-country-code",
    };
  }

  const region = normalizeRegionCode(snapshot.regionCode);
  if (country === "US" && region === null) {
    return {
      inScope: false,
      zone: null,
      checkoutEnabled: false,
      reason: "invalid-address-input",
    };
  }

  if (isSpecialTerritory(snapshot, country, region)) {
    return {
      inScope: false,
      zone: null,
      checkoutEnabled: false,
      reason: "special-territory-needs-explicit-validation",
    };
  }

  if (country === "US" && !usLaunchRegions.has(region!)) {
    return {
      inScope: false,
      zone: null,
      checkoutEnabled: false,
      reason: "invalid-address-input",
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

type ZoneActivationSnapshot = {
  zone: unknown;
  carrierServiceCode: unknown;
  priceCents: unknown;
  estimatedDaysMin: unknown;
  estimatedDaysMax: unknown;
  dutiesTerms: unknown;
  parcel: {
    weightGrams: unknown;
    lengthCm: unknown;
    widthCm: unknown;
    heightCm: unknown;
    originCountryCode: unknown;
  };
};

function snapshotZoneActivationInput(
  input: unknown,
): ZoneActivationSnapshot | null {
  if (!isRecord(input)) return null;

  try {
    const zone = input.zone;
    const carrierServiceCode = input.carrierServiceCode;
    const priceCents = input.priceCents;
    const estimatedDaysMin = input.estimatedDaysMin;
    const estimatedDaysMax = input.estimatedDaysMax;
    const dutiesTerms = input.dutiesTerms;
    const parcelInput = input.parcel;

    let weightGrams: unknown;
    let lengthCm: unknown;
    let widthCm: unknown;
    let heightCm: unknown;
    let originCountryCode: unknown;
    if (isRecord(parcelInput)) {
      weightGrams = parcelInput.weightGrams;
      lengthCm = parcelInput.lengthCm;
      widthCm = parcelInput.widthCm;
      heightCm = parcelInput.heightCm;
      originCountryCode = parcelInput.originCountryCode;
    }

    return {
      zone,
      carrierServiceCode,
      priceCents,
      estimatedDaysMin,
      estimatedDaysMax,
      dutiesTerms,
      parcel: {
        weightGrams,
        lengthCm,
        widthCm,
        heightCm,
        originCountryCode,
      },
    };
  } catch {
    return null;
  }
}

export function getZoneActivationBlockers(input: ZoneActivationInput): string[];
export function getZoneActivationBlockers(input: unknown): string[] {
  const blockers: string[] = [];
  const snapshot = snapshotZoneActivationInput(input);
  const zone = typeof snapshot?.zone === "string" ? snapshot.zone : null;
  const zoneIsValid = zone !== null && launchShippingZoneSet.has(zone);

  if (!zoneIsValid) blockers.push("zone");
  if (
    typeof snapshot?.carrierServiceCode !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(
      snapshot.carrierServiceCode,
    )
  ) {
    blockers.push("carrier-service");
  }
  if (!isNonNegativeSafeInteger(snapshot?.priceCents)) blockers.push("price");
  if (!isPositiveSafeInteger(snapshot?.estimatedDaysMin, 365)) {
    blockers.push("minimum-delivery-time");
  }
  if (
    !isPositiveSafeInteger(snapshot?.estimatedDaysMax, 365) ||
    !isPositiveSafeInteger(snapshot?.estimatedDaysMin, 365) ||
    snapshot.estimatedDaysMax < snapshot.estimatedDaysMin
  ) {
    blockers.push("maximum-delivery-time");
  }

  const dutiesTerms = snapshot?.dutiesTerms;
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

  if (!isPositiveSafeInteger(snapshot?.parcel.weightGrams, 1_000_000)) {
    blockers.push("weight");
  }
  if (!isPositiveFinite(snapshot?.parcel.lengthCm, 1_000)) {
    blockers.push("length");
  }
  if (!isPositiveFinite(snapshot?.parcel.widthCm, 1_000)) {
    blockers.push("width");
  }
  if (!isPositiveFinite(snapshot?.parcel.heightCm, 1_000)) {
    blockers.push("height");
  }
  if (!normalizeCountryCode(snapshot?.parcel.originCountryCode)) {
    blockers.push("origin-country");
  }

  return [...new Set(blockers)];
}
