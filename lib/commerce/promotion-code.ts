export type PromotionKind = "percentage" | "fixed";

export type PromotionCodeRule = Readonly<{
  id: string;
  code: string;
  kind: PromotionKind;
  percentageBasisPoints: number | null;
  fixedDiscountCents: number | null;
  minimumSubtotalCents: number;
  maximumDiscountCents: number | null;
  maximumRedemptions: number | null;
  active: boolean;
  startsAt: string;
  endsAt: string | null;
}>;

export type PromotionQuote = Readonly<{
  code: string;
  discountCents: number;
  subtotalAfterDiscountCents: number;
}>;

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export class PromotionCodeError extends Error {
  readonly code:
    | "INVALID_PROMOTION_CODE"
    | "PROMOTION_NOT_FOUND"
    | "PROMOTION_NOT_ACTIVE"
    | "PROMOTION_NOT_STARTED"
    | "PROMOTION_EXPIRED"
    | "PROMOTION_MINIMUM_NOT_REACHED"
    | "PROMOTION_USAGE_LIMIT_REACHED";

  constructor(code: PromotionCodeError["code"]) {
    super(code);
    this.name = "PromotionCodeError";
    this.code = code;
  }
}

export function normalizePromotionCode(value: unknown): string {
  if (typeof value !== "string") throw new PromotionCodeError("INVALID_PROMOTION_CODE");
  const code = value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new PromotionCodeError("INVALID_PROMOTION_CODE");
  return code;
}

export function calculatePromotionQuote(
  rule: PromotionCodeRule,
  subtotalCents: number,
  redeemedCount: number,
  now: string,
): PromotionQuote {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 1 ||
    !Number.isSafeInteger(redeemedCount) || redeemedCount < 0) {
    throw new TypeError("Promotion calculation input is invalid.");
  }
  if (!rule.active) throw new PromotionCodeError("PROMOTION_NOT_ACTIVE");
  if (rule.startsAt > now) throw new PromotionCodeError("PROMOTION_NOT_STARTED");
  if (rule.endsAt !== null && rule.endsAt <= now) {
    throw new PromotionCodeError("PROMOTION_EXPIRED");
  }
  if (subtotalCents < rule.minimumSubtotalCents) {
    throw new PromotionCodeError("PROMOTION_MINIMUM_NOT_REACHED");
  }
  if (rule.maximumRedemptions !== null && redeemedCount >= rule.maximumRedemptions) {
    throw new PromotionCodeError("PROMOTION_USAGE_LIMIT_REACHED");
  }
  const rawDiscount = rule.kind === "percentage"
    ? Math.floor(subtotalCents * (rule.percentageBasisPoints ?? 0) / 10_000)
    : rule.fixedDiscountCents ?? 0;
  const cappedDiscount = rule.maximumDiscountCents === null
    ? rawDiscount
    : Math.min(rawDiscount, rule.maximumDiscountCents);
  const discountCents = Math.min(subtotalCents, cappedDiscount);
  if (!Number.isSafeInteger(discountCents) || discountCents < 1) {
    throw new PromotionCodeError("PROMOTION_NOT_ACTIVE");
  }
  return Object.freeze({
    code: rule.code,
    discountCents,
    subtotalAfterDiscountCents: subtotalCents - discountCents,
  });
}
