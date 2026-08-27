"use client";

import {
  commerceApiPath,
  type ActiveCommerceRuntimeMode,
} from "./commerce-runtime.ts";
import { calculateAjPackPricing } from "./pack-pricing.ts";

function cartApiPath(mode: ActiveCommerceRuntimeMode): string {
  return commerceApiPath(mode, "/cart");
}
const CART_CSRF_COOKIE = "__Host-aj_cart_csrf";
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const publicVariantContract = Object.freeze({
  "variant_boxer_pourpre_s": ["pourpre", "pourpre", "S", "Pourpre Impérial", "/images/client/raw/product-card-pourpre.webp"],
  "variant_boxer_pourpre_m": ["pourpre", "pourpre", "M", "Pourpre Impérial", "/images/client/raw/product-card-pourpre.webp"],
  "variant_boxer_pourpre_l": ["pourpre", "pourpre", "L", "Pourpre Impérial", "/images/client/raw/product-card-pourpre.webp"],
  "variant_boxer_pourpre_xl": ["pourpre", "pourpre", "XL", "Pourpre Impérial", "/images/client/raw/product-card-pourpre.webp"],
  "variant_boxer_rose-pale_s": ["rose-pale", "rose", "S", "Rose Velours", "/images/client/raw/product-rose-profile.webp"],
  "variant_boxer_rose-pale_m": ["rose-pale", "rose", "M", "Rose Velours", "/images/client/raw/product-rose-profile.webp"],
  "variant_boxer_rose-pale_l": ["rose-pale", "rose", "L", "Rose Velours", "/images/client/raw/product-rose-profile.webp"],
  "variant_boxer_rose-pale_xl": ["rose-pale", "rose", "XL", "Rose Velours", "/images/client/raw/product-rose-profile.webp"],
  "variant_boxer_lilas-bleu-clair_s": ["lilas-bleu-clair", "lilas", "S", "Lilas Céleste", "/images/client/raw/product-lilas-model.webp"],
  "variant_boxer_lilas-bleu-clair_m": ["lilas-bleu-clair", "lilas", "M", "Lilas Céleste", "/images/client/raw/product-lilas-model.webp"],
  "variant_boxer_lilas-bleu-clair_l": ["lilas-bleu-clair", "lilas", "L", "Lilas Céleste", "/images/client/raw/product-lilas-model.webp"],
  "variant_boxer_lilas-bleu-clair_xl": ["lilas-bleu-clair", "lilas", "XL", "Lilas Céleste", "/images/client/raw/product-lilas-model.webp"],
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
    line.colorKey !== expected[1] ||
    line.size !== expected[2] ||
    line.colorName !== expected[3] ||
    line.imageUrl !== expected[4] ||
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

export function parseCartSnapshot(
  value: unknown,
  mode: ActiveCommerceRuntimeMode = "preproduction",
): PublicCartSnapshot {
  if (!isRecord(value) || !Array.isArray(value.lines)) {
    throw new CartApiError("MALFORMED_RESPONSE");
  }

  const lines = Object.freeze(value.lines.map(parseCartLine));
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0);
  const listSubtotalCents = lines.reduce(
    (total, line) => total + line.lineTotalCents,
    0,
  );
  let subtotalCents = listSubtotalCents;
  if (mode === "production") {
    try {
      subtotalCents = calculateAjPackPricing(lines).subtotalCents;
    } catch {
      throw new CartApiError("MALFORMED_RESPONSE");
    }
  }
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
  return parseCartSnapshot(
    payload.data,
    path.startsWith("/api/commerce/") ? "production" : "preproduction",
  );
}

function mutationHeaders(includeJson = false): HeadersInit {
  const csrfToken = readCartCsrfToken();
  if (!csrfToken) throw new CartApiError("CSRF_UNAVAILABLE");
  return {
    "X-CSRF-Token": csrfToken,
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
  };
}

function productionIdempotencyHeaders(
  mode: ActiveCommerceRuntimeMode,
  idempotencyKey: string | undefined,
): HeadersInit {
  if (mode === "preproduction" && idempotencyKey === undefined) return {};
  if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new CartApiError("IDEMPOTENCY_KEY_REQUIRED");
  }
  return { "Idempotency-Key": idempotencyKey };
}

export async function getCart(
  mode: ActiveCommerceRuntimeMode = "preproduction",
): Promise<PublicCartSnapshot> {
  const path = cartApiPath(mode);
  try {
    return await cartRequest(path);
  } catch (error) {
    if (
      error instanceof CartApiError &&
      ["CART_SESSION_INVALID", "CART_CLOSED", "CART_EXPIRED"].includes(
        error.code,
      )
    ) {
      return cartRequest(path);
    }
    throw error;
  }
}

export async function ensureOpenCart(
  mode: ActiveCommerceRuntimeMode = "preproduction",
  idempotencyKey?: string,
): Promise<PublicCartSnapshot> {
  const path = cartApiPath(mode);
  const idempotency = productionIdempotencyHeaders(mode, idempotencyKey);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const csrfToken = readCartCsrfToken();
    try {
      return await cartRequest(path, {
        method: "POST",
        headers: {
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          ...idempotency,
        },
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
  mode: ActiveCommerceRuntimeMode = "preproduction",
  idempotencyKey?: string,
): Promise<PublicCartSnapshot> {
  return cartRequest(
    `${cartApiPath(mode)}/lines/${encodeURIComponent(variantId)}`,
    {
      method: "PUT",
      headers: {
        ...mutationHeaders(true),
        ...productionIdempotencyHeaders(mode, idempotencyKey),
      },
      body: JSON.stringify({ quantity }),
    },
  );
}

export function addCartPack(
  variantIds: readonly string[],
  mode: ActiveCommerceRuntimeMode = "preproduction",
  idempotencyKey?: string,
): Promise<PublicCartSnapshot> {
  if (variantIds.length < 2 || variantIds.length > 3) {
    throw new CartApiError("INVALID_PACK");
  }
  const variants = variantIds.map(
    (variantId) =>
      publicVariantContract[variantId as keyof typeof publicVariantContract],
  );
  if (
    variants.some((variant) => !variant) ||
    variants.some((variant) => variant[2] !== variants[0][2])
  ) {
    throw new CartApiError("INVALID_PACK");
  }

  return cartRequest(`${cartApiPath(mode)}/packs`, {
    method: "POST",
    headers: {
      ...mutationHeaders(true),
      ...productionIdempotencyHeaders(mode, idempotencyKey),
    },
    body: JSON.stringify({ variantIds }),
  });
}

export function removeCartLine(
  variantId: string,
  mode: ActiveCommerceRuntimeMode = "preproduction",
  idempotencyKey?: string,
): Promise<PublicCartSnapshot> {
  return cartRequest(
    `${cartApiPath(mode)}/lines/${encodeURIComponent(variantId)}`,
    {
      method: "DELETE",
      headers: {
        ...mutationHeaders(),
        ...productionIdempotencyHeaders(mode, idempotencyKey),
      },
    },
  );
}
