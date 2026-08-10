const TOKEN_BYTES = 32;

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

export async function createOneTimeAccessToken(
  now: Date,
  ttlMinutes = 15,
): Promise<OneTimeAccessToken> {
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 60) {
    throw new Error("One-time access token TTL must be between 1 and 60 minutes.");
  }

  const tokenBytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(tokenBytes);
  const token = bytesToBase64Url(tokenBytes);

  return {
    token,
    tokenHash: await hashOneTimeAccessToken(token),
    expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
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
  providedToken: string,
  storedTokenHash: string,
): Promise<boolean> {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(providedToken) ||
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

export function isOneTimeAccessTokenUsable(input: {
  consumedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
  now: Date;
}): boolean {
  const expiresAt = Date.parse(input.expiresAt);
  return (
    input.consumedAt === null &&
    input.revokedAt === null &&
    Number.isFinite(expiresAt) &&
    expiresAt > input.now.getTime()
  );
}
