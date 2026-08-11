/**
 * ISO 3166-1 alpha-2 assigned codes, frozen snapshot checked 2026-08-10.
 *
 * Authority: ISO 3166 Maintenance Agency
 * https://www.iso.org/iso-3166-country-codes.html
 * Verifiable table including ISO-alpha2 codes: UN Statistics Division M49
 * https://unstats.un.org/unsd/methodology/m49/overview/
 *
 * User-assigned/reserved values such as XK and ZZ are intentionally absent.
 * This snapshot is local so checkout validation never depends on runtime I/O.
 */
export const iso3166Alpha2CountryCodes = Object.freeze([
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS",
  "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG",
  "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT",
  "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI",
  "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY",
  "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH",
  "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB",
  "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ",
  "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT",
  "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP",
  "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS",
  "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH",
  "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU",
  "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI",
  "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA",
  "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG",
  "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST",
  "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK",
  "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG",
  "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU",
  "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const);

const iso3166Alpha2CountryCodeSet = new Set<string>(
  iso3166Alpha2CountryCodes,
);

export type Iso3166Alpha2CountryCode =
  (typeof iso3166Alpha2CountryCodes)[number];

export function isIso3166Alpha2CountryCode(
  value: string,
): value is Iso3166Alpha2CountryCode {
  return iso3166Alpha2CountryCodeSet.has(value);
}
