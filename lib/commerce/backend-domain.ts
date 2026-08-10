export type CommerceErrorCode =
  | "INVALID_INPUT"
  | "IDEMPOTENCY_CONFLICT"
  | "INSUFFICIENT_STOCK_OR_CART_CLOSED"
  | "RESERVATION_NOT_FOUND"
  | "INVALID_RESERVATION_TRANSITION";

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

const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

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
  if (value.length > 40 || Number.isNaN(Date.parse(value))) {
    throw new CommerceError(
      "INVALID_INPUT",
      `${field} must be a valid ISO timestamp.`,
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

export function availableToSell(position: InventoryPosition): number {
  const allocated =
    position.giftReserveQuantity +
    position.safetyReserveQuantity +
    position.activeReservedQuantity +
    position.soldQuantity;

  return Math.max(position.physicalQuantity - allocated, 0);
}
