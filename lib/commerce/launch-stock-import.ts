import { launchVariantSeed } from "../../db/seed.ts";
import { isCanonicalUtcTimestamp } from "./account-security.ts";
import {
  getLaunchInventoryPosition,
  LAUNCH_CURRENT_PHYSICAL_QUANTITY,
  LAUNCH_CURRENT_SELLABLE_QUANTITY,
  LAUNCH_REMAINING_GIFT_RESERVE_QUANTITY,
} from "./launch-inventory.ts";

export const launchStockImportProtocol = "ajl-launch-stock-import-v2" as const;

export const launchStockApprovalRoles = Object.freeze([
  "stock_owner",
  "release_owner",
] as const);

export type LaunchStockApprovalRole =
  (typeof launchStockApprovalRoles)[number];

export type LaunchStockImportVariant = Readonly<{
  variantId: string;
  internalReference: string;
  physicalQuantity: number;
  giftingReserveQuantity: number;
  safetyReserveQuantity: number;
  savReserveQuantity: number;
}>;

export type LaunchStockImportTotals = Readonly<{
  physicalQuantity: number;
  giftingReserveQuantity: number;
  safetyReserveQuantity: number;
  savReserveQuantity: number;
  sellableQuantity: number;
}>;

export type LaunchStockImportApproval = Readonly<{
  role: LaunchStockApprovalRole;
  signerId: string;
  signedAt: string;
  payloadSha256: string;
  attestation: "I_APPROVE_THIS_EXACT_STOCK_IMPORT";
}>;

export type LaunchStockImportManifest = Readonly<{
  protocol: typeof launchStockImportProtocol;
  manifestId: string;
  countedAt: string;
  variants: readonly LaunchStockImportVariant[];
  totals: LaunchStockImportTotals;
  approvals: readonly LaunchStockImportApproval[];
}>;

export type ValidatedLaunchStockImport = Readonly<{
  manifestId: string;
  countedAt: string;
  payloadSha256: string;
  variants: readonly Readonly<
    LaunchStockImportVariant & {
      sellableQuantity: number;
      /** Current D1 combines the operational safety and SAV reserves. */
      d1SafetyReserveQuantity: number;
    }
  >[];
  totals: LaunchStockImportTotals;
  approvedBy: Readonly<Record<LaunchStockApprovalRole, string>>;
  approvedAt: Readonly<Record<LaunchStockApprovalRole, string>>;
}>;

export class LaunchStockImportError extends Error {
  readonly code:
    | "INVALID_MANIFEST"
    | "CATALOG_MISMATCH"
    | "TOTAL_MISMATCH"
    | "APPROVAL_MISSING"
    | "DIGEST_MISMATCH";

  constructor(code: LaunchStockImportError["code"], message: string) {
    super(message);
    this.name = "LaunchStockImportError";
    this.code = code;
  }
}

const safeId = /^[a-z0-9][a-z0-9_.:-]{0,127}$/i;
const sha256 = /^[0-9a-f]{64}$/;
const calendarDate = /^\d{4}-\d{2}-\d{2}$/;

function isCanonicalStockCountDate(value: unknown): value is string {
  if (isCanonicalUtcTimestamp(value)) return true;
  if (typeof value !== "string" || !calendarDate.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function approvalFollowsCount(
  signedAt: string,
  countedAt: string,
): boolean {
  return calendarDate.test(countedAt)
    ? signedAt.slice(0, 10) >= countedAt
    : signedAt >= countedAt;
}

const expectedVariants = Object.freeze(
  launchVariantSeed.map((variant) => {
    const position = getLaunchInventoryPosition(variant.sourceSlug, variant.size);
    if (!position) throw new Error("The launch stock import grid is incomplete.");
    return Object.freeze({
      variantId: variant.id,
      internalReference: variant.internalReference,
      physicalQuantity: position.currentPhysicalQuantity,
      giftingReserveQuantity: position.remainingGiftReserveQuantity,
    });
  }),
);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  let keys: string[];
  try {
    keys = Object.keys(value).sort();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      keys.some((key) => {
        const descriptor = descriptors[key];
        return !descriptor || !("value" in descriptor) || !descriptor.enumerable;
      })
    ) {
      throw new Error("accessor-field");
    }
  } catch {
    throw new LaunchStockImportError("INVALID_MANIFEST", `${label} is unreadable.`);
  }
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new LaunchStockImportError(
      "INVALID_MANIFEST",
      `${label} must contain only the documented fields.`,
    );
  }
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new LaunchStockImportError(
      "INVALID_MANIFEST",
      `${label} must be a non-negative safe integer.`,
    );
  }
  return value as number;
}

function requireSafeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !safeId.test(value)) {
    throw new LaunchStockImportError("INVALID_MANIFEST", `${label} is invalid.`);
  }
  return value;
}

function parseVariant(
  candidate: unknown,
  expected: (typeof expectedVariants)[number],
  index: number,
): LaunchStockImportVariant {
  if (!isPlainRecord(candidate)) {
    throw new LaunchStockImportError("INVALID_MANIFEST", `Variant ${index} is invalid.`);
  }
  assertExactKeys(
    candidate,
    [
      "variantId",
      "internalReference",
      "physicalQuantity",
      "giftingReserveQuantity",
      "safetyReserveQuantity",
      "savReserveQuantity",
    ],
    `Variant ${index}`,
  );
  if (
    candidate.variantId !== expected.variantId ||
    candidate.internalReference !== expected.internalReference ||
    candidate.physicalQuantity !== expected.physicalQuantity ||
    candidate.giftingReserveQuantity !== expected.giftingReserveQuantity
  ) {
    throw new LaunchStockImportError(
      "CATALOG_MISMATCH",
      `Variant ${index} does not match the approved 12-variant physical count.`,
    );
  }
  const giftingReserveQuantity = requireNonNegativeInteger(
    candidate.giftingReserveQuantity,
    `Variant ${index} gifting reserve`,
  );
  const safetyReserveQuantity = requireNonNegativeInteger(
    candidate.safetyReserveQuantity,
    `Variant ${index} safety reserve`,
  );
  const savReserveQuantity = requireNonNegativeInteger(
    candidate.savReserveQuantity,
    `Variant ${index} SAV reserve`,
  );
  if (
    giftingReserveQuantity + safetyReserveQuantity + savReserveQuantity >
    expected.physicalQuantity
  ) {
    throw new LaunchStockImportError(
      "TOTAL_MISMATCH",
      `Variant ${index} reserves exceed physical stock.`,
    );
  }
  return Object.freeze({
    variantId: expected.variantId,
    internalReference: expected.internalReference,
    physicalQuantity: expected.physicalQuantity,
    giftingReserveQuantity,
    safetyReserveQuantity,
    savReserveQuantity,
  });
}

function calculateTotals(
  variants: readonly LaunchStockImportVariant[],
): LaunchStockImportTotals {
  const totals = variants.reduce(
    (result, variant) => {
      result.physicalQuantity += variant.physicalQuantity;
      result.giftingReserveQuantity += variant.giftingReserveQuantity;
      result.safetyReserveQuantity += variant.safetyReserveQuantity;
      result.savReserveQuantity += variant.savReserveQuantity;
      result.sellableQuantity +=
        variant.physicalQuantity -
        variant.giftingReserveQuantity -
        variant.safetyReserveQuantity -
        variant.savReserveQuantity;
      return result;
    },
    {
      physicalQuantity: 0,
      giftingReserveQuantity: 0,
      safetyReserveQuantity: 0,
      savReserveQuantity: 0,
      sellableQuantity: 0,
    },
  );
  return Object.freeze(totals);
}

function parseTotals(candidate: unknown): LaunchStockImportTotals {
  if (!isPlainRecord(candidate)) {
    throw new LaunchStockImportError("INVALID_MANIFEST", "Totals are invalid.");
  }
  assertExactKeys(
    candidate,
    [
      "physicalQuantity",
      "giftingReserveQuantity",
      "safetyReserveQuantity",
      "savReserveQuantity",
      "sellableQuantity",
    ],
    "Totals",
  );
  return Object.freeze({
    physicalQuantity: requireNonNegativeInteger(
      candidate.physicalQuantity,
      "Physical total",
    ),
    giftingReserveQuantity: requireNonNegativeInteger(
      candidate.giftingReserveQuantity,
      "Gifting reserve total",
    ),
    safetyReserveQuantity: requireNonNegativeInteger(
      candidate.safetyReserveQuantity,
      "Safety reserve total",
    ),
    savReserveQuantity: requireNonNegativeInteger(
      candidate.savReserveQuantity,
      "SAV reserve total",
    ),
    sellableQuantity: requireNonNegativeInteger(
      candidate.sellableQuantity,
      "Sellable total",
    ),
  });
}

function canonicalPayload(input: Readonly<{
  protocol: string;
  manifestId: string;
  countedAt: string;
  variants: readonly LaunchStockImportVariant[];
  totals: LaunchStockImportTotals;
}>): string {
  return JSON.stringify({
    protocol: input.protocol,
    manifestId: input.manifestId,
    countedAt: input.countedAt,
    variants: input.variants.map((variant) => ({
      variantId: variant.variantId,
      internalReference: variant.internalReference,
      physicalQuantity: variant.physicalQuantity,
      giftingReserveQuantity: variant.giftingReserveQuantity,
      safetyReserveQuantity: variant.safetyReserveQuantity,
      savReserveQuantity: variant.savReserveQuantity,
    })),
    totals: {
      physicalQuantity: input.totals.physicalQuantity,
      giftingReserveQuantity: input.totals.giftingReserveQuantity,
      safetyReserveQuantity: input.totals.safetyReserveQuantity,
      savReserveQuantity: input.totals.savReserveQuantity,
      sellableQuantity: input.totals.sellableQuantity,
    },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashCanonicalPayload(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function createLaunchStockPayloadSha256(
  manifest: Omit<LaunchStockImportManifest, "approvals">,
): Promise<string> {
  return hashCanonicalPayload(canonicalPayload(manifest));
}

export async function validateLaunchStockImport(
  candidate: unknown,
): Promise<ValidatedLaunchStockImport> {
  if (!isPlainRecord(candidate)) {
    throw new LaunchStockImportError("INVALID_MANIFEST", "Manifest is invalid.");
  }
  assertExactKeys(
    candidate,
    ["protocol", "manifestId", "countedAt", "variants", "totals", "approvals"],
    "Manifest",
  );
  if (candidate.protocol !== launchStockImportProtocol) {
    throw new LaunchStockImportError("INVALID_MANIFEST", "Protocol is invalid.");
  }
  const manifestId = requireSafeId(candidate.manifestId, "Manifest id");
  if (!isCanonicalStockCountDate(candidate.countedAt)) {
    throw new LaunchStockImportError("INVALID_MANIFEST", "Stock count date is invalid.");
  }
  const rawVariants = candidate.variants;
  if (!Array.isArray(rawVariants) || rawVariants.length !== 12) {
    throw new LaunchStockImportError(
      "CATALOG_MISMATCH",
      "Manifest must contain exactly the approved 12 variants.",
    );
  }
  const variants = expectedVariants.map((expected, index) =>
    parseVariant(rawVariants[index], expected, index),
  );
  const totals = parseTotals(candidate.totals);
  const calculatedTotals = calculateTotals(variants);
  if (
    calculatedTotals.physicalQuantity !== LAUNCH_CURRENT_PHYSICAL_QUANTITY ||
    calculatedTotals.giftingReserveQuantity !== LAUNCH_REMAINING_GIFT_RESERVE_QUANTITY ||
    calculatedTotals.safetyReserveQuantity !== 0 ||
    calculatedTotals.savReserveQuantity !== 0 ||
    calculatedTotals.sellableQuantity !== LAUNCH_CURRENT_SELLABLE_QUANTITY ||
    Object.keys(calculatedTotals).some(
      (key) =>
        calculatedTotals[key as keyof LaunchStockImportTotals] !==
        totals[key as keyof LaunchStockImportTotals],
    )
  ) {
    throw new LaunchStockImportError(
      "TOTAL_MISMATCH",
      "Manifest totals must reconcile to 749 current physical, 23 remaining gifts and 726 sellable units with no additional launch reserve.",
    );
  }

  const payloadSha256 = await hashCanonicalPayload(
    canonicalPayload({
      protocol: launchStockImportProtocol,
      manifestId,
      countedAt: candidate.countedAt,
      variants,
      totals,
    }),
  );
  if (!Array.isArray(candidate.approvals) || candidate.approvals.length !== 2) {
    throw new LaunchStockImportError(
      "APPROVAL_MISSING",
      "Stock owner and release owner approvals are both required.",
    );
  }
  const approvedBy = {} as Record<LaunchStockApprovalRole, string>;
  const approvedAt = {} as Record<LaunchStockApprovalRole, string>;
  const signerIds = new Set<string>();
  for (const rawApproval of candidate.approvals) {
    if (!isPlainRecord(rawApproval)) {
      throw new LaunchStockImportError("APPROVAL_MISSING", "Approval is invalid.");
    }
    assertExactKeys(
      rawApproval,
      ["role", "signerId", "signedAt", "payloadSha256", "attestation"],
      "Approval",
    );
    if (!launchStockApprovalRoles.includes(rawApproval.role as LaunchStockApprovalRole)) {
      throw new LaunchStockImportError("APPROVAL_MISSING", "Approval role is invalid.");
    }
    const role = rawApproval.role as LaunchStockApprovalRole;
    const signerId = requireSafeId(rawApproval.signerId, "Signer id");
    if (
      approvedBy[role] ||
      signerIds.has(signerId) ||
      !isCanonicalUtcTimestamp(rawApproval.signedAt) ||
      !approvalFollowsCount(rawApproval.signedAt, candidate.countedAt) ||
      rawApproval.attestation !== "I_APPROVE_THIS_EXACT_STOCK_IMPORT"
    ) {
      throw new LaunchStockImportError(
        "APPROVAL_MISSING",
        "Approvals must be complete, distinct and subsequent to the count.",
      );
    }
    if (!sha256.test(String(rawApproval.payloadSha256))) {
      throw new LaunchStockImportError("DIGEST_MISMATCH", "Approval digest is invalid.");
    }
    if (rawApproval.payloadSha256 !== payloadSha256) {
      throw new LaunchStockImportError(
        "DIGEST_MISMATCH",
        "An approval does not cover this exact stock payload.",
      );
    }
    approvedBy[role] = signerId;
    approvedAt[role] = rawApproval.signedAt;
    signerIds.add(signerId);
  }
  if (!approvedBy.stock_owner || !approvedBy.release_owner) {
    throw new LaunchStockImportError(
      "APPROVAL_MISSING",
      "Stock owner and release owner approvals are both required.",
    );
  }

  return Object.freeze({
    manifestId,
    countedAt: candidate.countedAt,
    payloadSha256,
    variants: Object.freeze(
      variants.map((variant) =>
        Object.freeze({
          ...variant,
          sellableQuantity:
            variant.physicalQuantity -
            variant.giftingReserveQuantity -
            variant.safetyReserveQuantity -
            variant.savReserveQuantity,
          d1SafetyReserveQuantity:
            variant.safetyReserveQuantity + variant.savReserveQuantity,
        }),
      ),
    ),
    totals,
    approvedBy: Object.freeze({ ...approvedBy }),
    approvedAt: Object.freeze({ ...approvedAt }),
  });
}
