"use client";

const CART_API_PATH = "/api/preprod/cart";
const CART_CSRF_COOKIE = "__Host-aj_cart_csrf";
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const publicVariantContract = Object.freeze({
  "variant_boxer_pourpre_s": ["pourpre", "S", "Pourpre Impérial", "/images/client/raw/product-card-pourpre.webp"],
  "variant_boxer_pourpre_m": ["pourpre", "M", "Pourpre Impérial", "/images/client/raw/product-card-pourpre.webp"],
  "variant_boxer_pourpre_l": ["pourpre", "L", "Pourpre Impérial", "/images/client/raw/product-card-pourpre.webp"],
  "variant_boxer_pourpre_xl": ["pourpre", "XL", "Pourpre Impérial", "/images/client/raw/product-card-pourpre.webp"],
  "variant_boxer_rose-pale_s": ["rose-pale", "S", "Rose Velours", "/images/client/raw/product-rose-profile.webp"],
  "variant_boxer_rose-pale_m": ["rose-pale", "M", "Rose Velours", "/images/client/raw/product-rose-profile.webp"],
  "variant_boxer_rose-pale_l": ["rose-pale", "L", "Rose Velours", "/images/client/raw/product-rose-profile.webp"],
  "variant_boxer_rose-pale_xl": ["rose-pale", "XL", "Rose Velours", "/images/client/raw/product-rose-profile.webp"],
  "variant_boxer_lilas-bleu-clair_s": ["lilas-bleu-clair", "S", "Lilas Céleste", "/images/client/raw/product-lilas-model.webp"],
  "variant_boxer_lilas-bleu-clair_m": ["lilas-bleu-clair", "M", "Lilas Céleste", "/images/client/raw/product-lilas-model.webp"],
  "variant_boxer_lilas-bleu-clair_l": ["lilas-bleu-clair", "L", "Lilas Céleste", "/images/client/raw/product-lilas-model.webp"],
  "variant_boxer_lilas-bleu-clair_xl": ["lilas-bleu-clair", "XL", "Lilas Céleste", "/images/client/raw/product-lilas-model.webp"],
} as const);

export type PublicCartLine = Readonly<{
  variantId: string;
  productId: string;
  productSlug: string;
  colorKey: string;
  colorName: string;
  size: string;
  imageUrl: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  stockState: "available" | "low-stock" | "sold-out";
}>;

export type PublicCartSnapshot = Readonly<{
  status: "empty" | "open";
  currency: "EUR";
  expiresAt: string | null;
  itemCount: number;
  subtotalCents: number;
  lines: readonly PublicCartLine[];
}>;

type CartErrorPayload = Readonly<{
  error?: Readonly<{ code?: unknown }>;
}>;

export class CartApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super(code);
    this.name = "CartApiError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseCartLine(value: unknown): PublicCartLine {
  if (!isRecord(value)) throw new CartApiError("MALFORMED_RESPONSE");

  const stockState = value.stockState;
  const expected =
    typeof value.variantId === "string"
      ? publicVariantContract[
          value.variantId as keyof typeof publicVariantContract
        ]
      : undefined;
  const line = {
    variantId: value.variantId,
    productId: value.productId,
    productSlug: value.productSlug,
    colorKey: value.colorKey,
    colorName: value.colorName,
    size: value.size,
    imageUrl: value.imageUrl,
    quantity: value.quantity,
    unitPriceCents: value.unitPriceCents,
    lineTotalCents: value.lineTotalCents,
    stockState,
  };

  if (
    !expected ||
    line.productId !== "product_apollon" ||
    line.productSlug !== expected[0] ||
    line.colorKey !== expected[0] ||
    line.size !== expected[1] ||
    line.colorName !== expected[2] ||
    line.imageUrl !== expected[3] ||
    !Number.isSafeInteger(line.quantity) ||
    (line.quantity as number) < 1 ||
    (line.quantity as number) > 5 ||
    !isNonNegativeInteger(line.unitPriceCents) ||
    !isNonNegativeInteger(line.lineTotalCents) ||
    line.lineTotalCents !== line.unitPriceCents * (line.quantity as number) ||
    (stockState !== "available" &&
      stockState !== "low-stock" &&
      stockState !== "sold-out")
  ) {
    throw new CartApiError("MALFORMED_RESPONSE");
  }

  return Object.freeze(line as PublicCartLine);
}

function parseCartSnapshot(value: unknown): PublicCartSnapshot {
  if (!isRecord(value) || !Array.isArray(value.lines)) {
    throw new CartApiError("MALFORMED_RESPONSE");
  }

  const lines = Object.freeze(value.lines.map(parseCartLine));
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0);
  const subtotalCents = lines.reduce(
    (total, line) => total + line.lineTotalCents,
    0,
  );
  const status = value.status;
  const expiresAt = value.expiresAt;

  if (
    (status !== "empty" && status !== "open") ||
    value.currency !== "EUR" ||
    (expiresAt !== null &&
      (typeof expiresAt !== "string" ||
        !UTC_TIMESTAMP_PATTERN.test(expiresAt) ||
        Number.isNaN(Date.parse(expiresAt)) ||
        new Date(expiresAt).toISOString() !== expiresAt)) ||
    !isNonNegativeInteger(value.itemCount) ||
    !isNonNegativeInteger(value.subtotalCents) ||
    value.itemCount !== itemCount ||
    value.subtotalCents !== subtotalCents ||
    (status === "empty" && (expiresAt !== null || lines.length !== 0)) ||
    (status === "open" && typeof expiresAt !== "string")
  ) {
    throw new CartApiError("MALFORMED_RESPONSE");
  }

  return Object.freeze({
    status,
    currency: "EUR",
    expiresAt,
    itemCount,
    subtotalCents,
    lines,
  });
}

export function readCartCsrfToken(cookieHeader?: string): string | null {
  const source =
    cookieHeader ??
    (typeof document === "undefined" ? "" : document.cookie);
  const values = source.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== CART_CSRF_COOKIE) {
      return [];
    }
    return [part.slice(separator + 1).trim()];
  });

  return values.length === 1 && OPAQUE_TOKEN_PATTERN.test(values[0])
    ? values[0]
    : null;
}

async function cartRequest(
  path: string,
  init: RequestInit = {},
): Promise<PublicCartSnapshot> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new CartApiError("NETWORK_UNAVAILABLE");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CartApiError("MALFORMED_RESPONSE", response.status);
  }

  if (!response.ok) {
    const errorCode = isRecord(payload)
      ? (payload as CartErrorPayload).error?.code
      : undefined;
    throw new CartApiError(
      typeof errorCode === "string" ? errorCode : "CART_UNAVAILABLE",
      response.status,
    );
  }

  if (!isRecord(payload) || !("data" in payload)) {
    throw new CartApiError("MALFORMED_RESPONSE", response.status);
  }
  return parseCartSnapshot(payload.data);
}

function mutationHeaders(includeJson = false): HeadersInit {
  const csrfToken = readCartCsrfToken();
  if (!csrfToken) throw new CartApiError("CSRF_UNAVAILABLE");
  return {
    "X-CSRF-Token": csrfToken,
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
  };
}

export async function getCart(): Promise<PublicCartSnapshot> {
  try {
    return await cartRequest(CART_API_PATH);
  } catch (error) {
    if (
      error instanceof CartApiError &&
      ["CART_SESSION_INVALID", "CART_CLOSED", "CART_EXPIRED"].includes(
        error.code,
      )
    ) {
      return cartRequest(CART_API_PATH);
    }
    throw error;
  }
}

export async function ensureOpenCart(): Promise<PublicCartSnapshot> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const csrfToken = readCartCsrfToken();
    try {
      return await cartRequest(CART_API_PATH, {
        method: "POST",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
      });
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof CartApiError &&
        ["CART_SESSION_INVALID", "CART_CLOSED", "CART_EXPIRED"].includes(
          error.code,
        )
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new CartApiError("CART_UNAVAILABLE");
}

export function setCartLineQuantity(
  variantId: string,
  quantity: number,
): Promise<PublicCartSnapshot> {
  return cartRequest(
    `${CART_API_PATH}/lines/${encodeURIComponent(variantId)}`,
    {
      method: "PUT",
      headers: mutationHeaders(true),
      body: JSON.stringify({ quantity }),
    },
  );
}

export function removeCartLine(
  variantId: string,
): Promise<PublicCartSnapshot> {
  return cartRequest(
    `${CART_API_PATH}/lines/${encodeURIComponent(variantId)}`,
    {
      method: "DELETE",
      headers: mutationHeaders(),
    },
  );
}
