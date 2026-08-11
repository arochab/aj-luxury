const TOKEN_BYTES = 32;
const canonicalUtcTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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

export async function createOpaqueAccessToken(): Promise<OpaqueAccessToken> {
  const tokenBytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(tokenBytes);
  const token = bytesToBase64Url(tokenBytes);

  return Object.freeze({
    token,
    tokenHash: await hashOneTimeAccessToken(token),
  });
}

export async function createOneTimeAccessToken(
  now: Date,
  ttlMinutes = 15,
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

  const { token, tokenHash } = await createOpaqueAccessToken();

  return {
    token,
    tokenHash,
    expiresAt: new Date(nowMs + ttlMinutes * 60_000).toISOString(),
  };
}

export async function hashOneTimeAccessToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyOneTimeAccessToken(
  providedToken: unknown,
  storedTokenHash: unknown,
): Promise<boolean> {
  if (
    typeof providedToken !== "string" ||
    typeof storedTokenHash !== "string" ||
    !isOpaqueAccessToken(providedToken) ||
    !/^[0-9a-f]{64}$/i.test(storedTokenHash)
  ) {
    return false;
  }
  const providedHash = await hashOneTimeAccessToken(providedToken);
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
