const TOKEN_BYTES = 32;
const canonicalUtcTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const HASH_PROTOCOL = "aj-luxury.identity-token.v1";

export const accessTokenHashContexts = Object.freeze({
  oneTimeAccess: "one-time-access",
  customerChallenge: "challenge:customer-sign-in",
  guestOrderChallenge: "challenge:guest-order-access",
  customerSession: "session:customer",
  guestOrderSession: "session:guest-order",
  adminSession: "session:admin",
  cartSession: "session:cart",
  customerCsrf: "csrf:customer",
  guestOrderCsrf: "csrf:guest-order",
  adminCsrf: "csrf:admin",
  cartCsrf: "csrf:cart",
  customerRateLimit: "rate-limit:customer-sign-in",
  guestOrderRateLimit: "rate-limit:guest-order-access",
  adminRateLimit: "rate-limit:admin-sign-in",
  customerEmailVerification: "challenge:customer-email-verification",
  customerPasswordReset: "challenge:customer-password-reset",
  customerCheckoutLink: "session:customer-checkout-link",
} as const);

export type AccessTokenHashContext =
  (typeof accessTokenHashContexts)[keyof typeof accessTokenHashContexts];

const allowedHashContexts = new Set<AccessTokenHashContext>(
  Object.values(accessTokenHashContexts),
);

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type OneTimeAccessToken = {
  token: string;
  tokenHash: string;
  expiresAt: string;
};

export type OpaqueAccessToken = Readonly<{
  token: string;
  tokenHash: string;
}>;

export function isOpaqueAccessToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export async function createOpaqueAccessToken(
  hashContext: AccessTokenHashContext = accessTokenHashContexts.oneTimeAccess,
): Promise<OpaqueAccessToken> {
  const tokenBytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(tokenBytes);
  const token = bytesToBase64Url(tokenBytes);

  return Object.freeze({
    token,
    tokenHash: await hashOneTimeAccessToken(token, hashContext),
  });
}

export async function createOneTimeAccessToken(
  now: Date,
  ttlMinutes = 15,
  hashContext: AccessTokenHashContext = accessTokenHashContexts.oneTimeAccess,
): Promise<OneTimeAccessToken> {
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 60) {
    throw new Error("One-time access token TTL must be between 1 and 60 minutes.");
  }

  let nowMs: number;
  try {
    nowMs = Date.prototype.getTime.call(now);
  } catch {
    throw new Error("One-time access token creation requires a valid Date.");
  }
  if (!Number.isFinite(nowMs)) {
    throw new Error("One-time access token creation requires a valid Date.");
  }

  const { token, tokenHash } = await createOpaqueAccessToken(hashContext);

  return {
    token,
    tokenHash,
    expiresAt: new Date(nowMs + ttlMinutes * 60_000).toISOString(),
  };
}

export async function hashOneTimeAccessToken(
  token: string,
  hashContext: AccessTokenHashContext = accessTokenHashContexts.oneTimeAccess,
): Promise<string> {
  if (
    typeof token !== "string" ||
    !allowedHashContexts.has(hashContext)
  ) {
    throw new Error("Access token hash input is invalid.");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${HASH_PROTOCOL}\0${hashContext}\0${token}`),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyOneTimeAccessToken(
  providedToken: unknown,
  storedTokenHash: unknown,
  hashContext: AccessTokenHashContext = accessTokenHashContexts.oneTimeAccess,
): Promise<boolean> {
  if (
    typeof providedToken !== "string" ||
    typeof storedTokenHash !== "string" ||
    !isOpaqueAccessToken(providedToken) ||
    !/^[0-9a-f]{64}$/i.test(storedTokenHash)
  ) {
    return false;
  }
  const providedHash = await hashOneTimeAccessToken(providedToken, hashContext);
  let difference = 0;
  for (let index = 0; index < providedHash.length; index += 1) {
    difference |= providedHash.charCodeAt(index) ^ storedTokenHash.charCodeAt(index);
  }
  return difference === 0;
}

export function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !canonicalUtcTimestamp.test(value)) {
    return false;
  }

  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

export function isOneTimeAccessTokenUsable(input: unknown): boolean {
  if (!isRecord(input)) return false;

  try {
    const consumedAt = input.consumedAt;
    const revokedAt = input.revokedAt;
    const expiresAt = input.expiresAt;
    const now = input.now;
    const nowMs = Date.prototype.getTime.call(now);
    if (
      consumedAt !== null ||
      revokedAt !== null ||
      !isCanonicalUtcTimestamp(expiresAt) ||
      !Number.isFinite(nowMs)
    ) {
      return false;
    }

    return Date.parse(expiresAt) > nowMs;
  } catch {
    return false;
  }
}
