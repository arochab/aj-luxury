export const CLIENT_VALIDATED_PARCEL_SOURCE = "client-validated-2026-08-13" as const;
export const CLIENT_VALIDATED_PARCEL_MAX_ITEMS = 3 as const;
export const CLIENT_VALIDATED_PARCEL_MIGRATION =
  "0009_shipping_quote_parcel_snapshots.sql" as const;

export type ClientValidatedParcelProfile = Readonly<{
  profileCode:
    | "AJL_ENVELOPE_1_ITEM_V1"
    | "AJL_ENVELOPE_2_ITEMS_V1"
    | "AJL_ENVELOPE_3_ITEMS_V1";
  sourceVersion: typeof CLIENT_VALIDATED_PARCEL_SOURCE;
  itemCount: 1 | 2 | 3;
  weightGrams: 150 | 250 | 350;
  lengthMm: 400;
  widthMm: 320;
  heightMm: 40;
}>;

const parcelProfiles = Object.freeze({
  1: Object.freeze({
    profileCode: "AJL_ENVELOPE_1_ITEM_V1",
    sourceVersion: CLIENT_VALIDATED_PARCEL_SOURCE,
    itemCount: 1,
    weightGrams: 150,
    lengthMm: 400,
    widthMm: 320,
    heightMm: 40,
  }),
  2: Object.freeze({
    profileCode: "AJL_ENVELOPE_2_ITEMS_V1",
    sourceVersion: CLIENT_VALIDATED_PARCEL_SOURCE,
    itemCount: 2,
    weightGrams: 250,
    lengthMm: 400,
    widthMm: 320,
    heightMm: 40,
  }),
  3: Object.freeze({
    profileCode: "AJL_ENVELOPE_3_ITEMS_V1",
    sourceVersion: CLIENT_VALIDATED_PARCEL_SOURCE,
    itemCount: 3,
    weightGrams: 350,
    lengthMm: 400,
    widthMm: 320,
    heightMm: 40,
  }),
} as const satisfies Readonly<Record<1 | 2 | 3, ClientValidatedParcelProfile>>);

const profileKeys = Object.freeze([
  "profileCode",
  "sourceVersion",
  "itemCount",
  "weightGrams",
  "lengthMm",
  "widthMm",
  "heightMm",
] as const);

const missing = Symbol("missing-own-data-property");

function readOwnDataProperty(
  value: object,
  key: PropertyKey,
): unknown | typeof missing {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : missing;
}

/**
 * Resolves only the three parcel profiles physically measured and rounded up
 * by AJ Luxury on 2026-08-13. Four or more items deliberately have no inferred
 * profile: using the three-item weight would understate the shipment.
 */
export function resolveClientValidatedParcelProfile(
  lines: unknown,
): ClientValidatedParcelProfile | null {
  if (!Array.isArray(lines) || lines.length < 1) return null;

  let itemCount = 0;
  try {
    for (const line of lines) {
      if (typeof line !== "object" || line === null || Array.isArray(line)) {
        return null;
      }
      const quantity = readOwnDataProperty(line, "quantity");
      if (
        typeof quantity !== "number" ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1
      ) {
        return null;
      }
      itemCount += quantity;
      if (itemCount > CLIENT_VALIDATED_PARCEL_MAX_ITEMS) return null;
    }
  } catch {
    return null;
  }

  return parcelProfiles[itemCount as 1 | 2 | 3] ?? null;
}

export function isClientValidatedParcelProfile(
  value: unknown,
): value is ClientValidatedParcelProfile {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return false;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== profileKeys.length ||
      !profileKeys.every((key) => keys.includes(key))
    ) {
      return false;
    }
    const itemCount = readOwnDataProperty(value, "itemCount");
    if (itemCount !== 1 && itemCount !== 2 && itemCount !== 3) return false;
    const expected = parcelProfiles[itemCount];
    return profileKeys.every(
      (key) => readOwnDataProperty(value, key) === expected[key],
    );
  } catch {
    return false;
  }
}

export function parcelSnapshotMatchesProfile(
  snapshot: Readonly<{
    profile_code: string;
    source_version: string;
    item_count: number;
    weight_grams: number;
    length_mm: number;
    width_mm: number;
    height_mm: number;
  }> | null,
  profile: ClientValidatedParcelProfile,
): boolean {
  return snapshot !== null &&
    snapshot.profile_code === profile.profileCode &&
    snapshot.source_version === profile.sourceVersion &&
    snapshot.item_count === profile.itemCount &&
    snapshot.weight_grams === profile.weightGrams &&
    snapshot.length_mm === profile.lengthMm &&
    snapshot.width_mm === profile.widthMm &&
    snapshot.height_mm === profile.heightMm;
}
