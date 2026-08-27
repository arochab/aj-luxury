const PASSWORD_ALGORITHM = "pbkdf2-sha256" as const;
const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 32;
const MIN_PASSWORD_CHARACTERS = 12;
const MAX_PASSWORD_CHARACTERS = 128;
const MAX_PASSWORD_BYTES = 512;

export type CustomerPasswordHash = Readonly<{
  algorithm: typeof PASSWORD_ALGORITHM;
  iterations: typeof PASSWORD_ITERATIONS;
  salt: string;
  hash: string;
}>;

export const customerPasswordPolicy = Object.freeze({
  minimumCharacters: MIN_PASSWORD_CHARACTERS,
  maximumCharacters: MAX_PASSWORD_CHARACTERS,
  algorithm: PASSWORD_ALGORITHM,
  iterations: PASSWORD_ITERATIONS,
});

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function passwordBytes(password: unknown): Uint8Array | null {
  if (typeof password !== "string" || password.includes("\0")) return null;
  const characters = Array.from(password).length;
  if (characters < MIN_PASSWORD_CHARACTERS || characters > MAX_PASSWORD_CHARACTERS) {
    return null;
  }
  const encoded = new TextEncoder().encode(password);
  return encoded.byteLength <= MAX_PASSWORD_BYTES ? encoded : null;
}

async function derive(
  encodedPassword: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    pbkdf2(
      Uint8Array.from(encodedPassword),
      Uint8Array.from(salt),
      iterations,
      PASSWORD_HASH_BYTES,
      "sha256",
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(Uint8Array.from(derivedKey));
      },
    );
  });
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function isCustomerPasswordValid(password: unknown): password is string {
  return passwordBytes(password) !== null;
}

export async function hashCustomerPassword(password: unknown): Promise<CustomerPasswordHash> {
  const encoded = passwordBytes(password);
  if (!encoded) throw new Error("CUSTOMER_PASSWORD_POLICY_REJECTED");
  const salt = new Uint8Array(PASSWORD_SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await derive(encoded, salt, PASSWORD_ITERATIONS);
  return Object.freeze({
    algorithm: PASSWORD_ALGORITHM,
    iterations: PASSWORD_ITERATIONS,
    salt: base64Url(salt),
    hash: base64Url(hash),
  });
}

export async function verifyCustomerPassword(
  password: unknown,
  stored: Readonly<{
    algorithm: unknown;
    iterations: unknown;
    salt: unknown;
    hash: unknown;
  }>,
): Promise<boolean> {
  const encoded = passwordBytes(password);
  const salt = typeof stored.salt === "string" ? decodeBase64Url(stored.salt) : null;
  const expected = typeof stored.hash === "string" ? decodeBase64Url(stored.hash) : null;
  if (
    !encoded || stored.algorithm !== PASSWORD_ALGORITHM ||
    stored.iterations !== PASSWORD_ITERATIONS ||
    salt?.byteLength !== PASSWORD_SALT_BYTES ||
    expected?.byteLength !== PASSWORD_HASH_BYTES
  ) {
    return false;
  }
  return constantTimeEqual(await derive(encoded, salt, PASSWORD_ITERATIONS), expected);
}

/** Performs the same expensive work for an unknown account to reduce enumeration signals. */
export async function consumeDummyPasswordWork(password: unknown): Promise<void> {
  const fallback = typeof password === "string" && password.length >= MIN_PASSWORD_CHARACTERS
    ? password.slice(0, MAX_PASSWORD_CHARACTERS)
    : "AJ-Luxury-invalid-password";
  const encoded = new TextEncoder().encode(fallback);
  const salt = new Uint8Array(PASSWORD_SALT_BYTES);
  salt.fill(0xa7);
  await derive(encoded, salt, PASSWORD_ITERATIONS);
}
import { pbkdf2 } from "node:crypto";
