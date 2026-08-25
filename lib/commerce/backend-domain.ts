export type CommerceErrorCode =
  | "INVALID_INPUT"
  | "IDEMPOTENCY_CONFLICT"
  | "CART_ID_CONFLICT"
  | "CART_NOT_FOUND"
  | "CART_CLOSED"
  | "CART_EXPIRED"
  | "VARIANT_NOT_FOUND"
  | "STOCK_UNAVAILABLE"
  | "MAX_QUANTITY"
  | "RESERVES_NOT_VALIDATED"
  | "INSUFFICIENT_STOCK_OR_CART_CLOSED"
  | "RESERVATION_NOT_FOUND"
  | "INVALID_RESERVATION_TRANSITION"
  | "RESERVATION_NOT_EXPIRED"
  | "ORDER_PAYMENT_MISMATCH"
  | "PAYMENT_VERIFICATION_REQUIRED";

export class CommerceError extends Error {
  readonly code: CommerceErrorCode;

  constructor(code: CommerceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CommerceError";
    this.code = code;
  }
}

export type InventoryPosition = {
  variantId: string;
  physicalQuantity: number;
  giftReserveQuantity: number;
  safetyReserveQuantity: number;
  activeReservedQuantity: number;
  soldQuantity: number;
  reservesValidated: boolean;
  version: number;
};

export type ReservationStatus =
  | "active"
  | "released"
  | "converted"
  | "expired";

export type StockReservation = {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
  status: ReservationStatus;
  idempotencyKey: string;
  lastTransitionKey: string | null;
  expiresAt: string;
  convertedOrderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReserveStockInput = {
  reservationId: string;
  cartId: string;
  variantId: string;
  quantity: number;
  idempotencyKey: string;
  expiresAt: string;
  now: string;
};

export type ReleaseStockInput = {
  reservationId: string;
  idempotencyKey: string;
  now: string;
};

export type ConvertStockToSaleInput = {
  reservationId: string;
  orderId: string;
  idempotencyKey: string;
  now: string;
};

export type ExpireStockInput = {
  reservationId: string;
  idempotencyKey: string;
  now: string;
};

const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const strictUtcIsoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function assertSafeIdentifier(value: string, field: string): void {
  if (!safeIdentifierPattern.test(value)) {
    throw new CommerceError(
      "INVALID_INPUT",
      `${field} must be a safe identifier of at most 160 characters.`,
    );
  }
}

export function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CommerceError(
      "INVALID_INPUT",
      `${field} must be a positive safe integer.`,
    );
  }
}

export function assertIsoTimestamp(value: string, field: string): void {
  if (!strictUtcIsoPattern.test(value)) {
    throw new CommerceError(
      "INVALID_INPUT",
      `${field} must use the strict UTC format YYYY-MM-DDTHH:mm:ss.sssZ.`,
    );
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new CommerceError(
      "INVALID_INPUT",
      `${field} must be a real UTC timestamp without calendar rollover.`,
    );
  }
}

export function validateReserveStockInput(input: ReserveStockInput): void {
  assertSafeIdentifier(input.reservationId, "reservationId");
  assertSafeIdentifier(input.cartId, "cartId");
  assertSafeIdentifier(input.variantId, "variantId");
  assertSafeIdentifier(input.idempotencyKey, "idempotencyKey");
  assertPositiveInteger(input.quantity, "quantity");
  assertIsoTimestamp(input.expiresAt, "expiresAt");
  assertIsoTimestamp(input.now, "now");

  if (Date.parse(input.expiresAt) <= Date.parse(input.now)) {
    throw new CommerceError(
      "INVALID_INPUT",
      "expiresAt must be later than now.",
    );
  }
}

export function validateReleaseStockInput(input: ReleaseStockInput): void {
  assertSafeIdentifier(input.reservationId, "reservationId");
  assertSafeIdentifier(input.idempotencyKey, "idempotencyKey");
  assertIsoTimestamp(input.now, "now");
}

export function validateConvertStockToSaleInput(
  input: ConvertStockToSaleInput,
): void {
  assertSafeIdentifier(input.reservationId, "reservationId");
  assertSafeIdentifier(input.orderId, "orderId");
  assertSafeIdentifier(input.idempotencyKey, "idempotencyKey");
  assertIsoTimestamp(input.now, "now");
}

export function validateExpireStockInput(input: ExpireStockInput): void {
  assertSafeIdentifier(input.reservationId, "reservationId");
  assertSafeIdentifier(input.idempotencyKey, "idempotencyKey");
  assertIsoTimestamp(input.now, "now");
}

export function availableToSell(position: InventoryPosition): number {
  const allocated =
    position.giftReserveQuantity +
    position.safetyReserveQuantity +
    position.activeReservedQuantity +
    position.soldQuantity;

  return Math.max(position.physicalQuantity - allocated, 0);
}
