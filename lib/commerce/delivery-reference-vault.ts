const KEY_BYTES = 32;
const IV_BYTES = 12;
const MAX_REFERENCE_BYTES = 512;
const BASE64_KEY = /^[A-Za-z0-9+/]{43}=$/;
const BASE64_IV = /^[A-Za-z0-9+/]{16}$/;
const BASE64_CIPHERTEXT = /^[A-Za-z0-9+/]+={0,2}$/;
const SAFE_OWNER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
const SAFE_PROVIDER = /^[a-z][a-z0-9_-]{0,63}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
type CryptoBytes = Uint8Array<ArrayBuffer>;

export type DeliveryProviderReferenceKind = "delivery_quote" | "service_point";

export type SealedDeliveryProviderReference = Readonly<{
  id: string;
  algorithm: "A256GCM";
  keyVersion: number;
  providerCode: string;
  referenceKind: DeliveryProviderReferenceKind;
  ownerId: string;
  referenceSha256: string;
  ivBase64: string;
  ciphertextBase64: string;
}>;

export type DeliveryReferenceVaultConfiguration = Readonly<{
  /** Standard padded Base64 encoding of exactly 32 random bytes. */
  encryptionKeyBase64?: string;
  keyVersion?: string | number;
  /** Previous version -> padded Base64 key. Retain until every referenced order is terminal. */
  decryptionKeysBase64?: Readonly<Record<string, string>>;
}>;

export class DeliveryReferenceVaultError extends Error {
  readonly code: "NOT_CONFIGURED" | "INVALID_INPUT" | "AUTHENTICATION_FAILED";

  constructor(
    code: "NOT_CONFIGURED" | "INVALID_INPUT" | "AUTHENTICATION_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "DeliveryReferenceVaultError";
    this.code = code;
  }
}

function bytesToBase64(bytes: CryptoBytes): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): CryptoBytes {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new DeliveryReferenceVaultError("INVALID_INPUT", "Encrypted provider reference is invalid.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function assertContext(input: Readonly<{
  providerCode: string;
  referenceKind: DeliveryProviderReferenceKind;
  ownerId: string;
}>): void {
  if (
    !SAFE_PROVIDER.test(input.providerCode) || !SAFE_OWNER.test(input.ownerId) ||
    !["delivery_quote", "service_point"].includes(input.referenceKind)
  ) {
    throw new DeliveryReferenceVaultError("INVALID_INPUT", "Provider reference context is invalid.");
  }
}

function assertVersion(value: string | number | undefined): number {
  const normalized = typeof value === "string" && /^[1-9]\d{0,8}$/.test(value)
    ? Number(value)
    : value;
  if (typeof normalized !== "number" || !Number.isSafeInteger(normalized) || normalized < 1) {
    throw new DeliveryReferenceVaultError("NOT_CONFIGURED", "Provider reference encryption is not configured.");
  }
  return Number(normalized);
}

async function sha256Hex(bytes: CryptoBytes): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deterministicId(
  providerCode: string,
  referenceKind: DeliveryProviderReferenceKind,
  ownerId: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `ajl-provider-reference-v1\u0000${providerCode}\u0000${referenceKind}\u0000${ownerId}`,
  );
  return `ref_${await sha256Hex(bytes)}`;
}

function aad(record: Readonly<{
  algorithm: "A256GCM";
  keyVersion: number;
  providerCode: string;
  referenceKind: DeliveryProviderReferenceKind;
  ownerId: string;
  referenceSha256: string;
}>): CryptoBytes {
  return new TextEncoder().encode(JSON.stringify({
    algorithm: record.algorithm,
    context: "ajl-delivery-provider-reference-v1",
    keyVersion: record.keyVersion,
    ownerId: record.ownerId,
    providerCode: record.providerCode,
    referenceKind: record.referenceKind,
    referenceSha256: record.referenceSha256,
  }));
}

function assertSealed(record: SealedDeliveryProviderReference): void {
  assertContext(record);
  if (
    record.algorithm !== "A256GCM" || !Number.isSafeInteger(record.keyVersion) ||
    record.keyVersion < 1 || !SAFE_OWNER.test(record.id) ||
    !SHA256_HEX.test(record.referenceSha256) || !BASE64_IV.test(record.ivBase64) ||
    record.ciphertextBase64.length < 24 || record.ciphertextBase64.length > 704 ||
    record.ciphertextBase64.length % 4 !== 0 ||
    !BASE64_CIPHERTEXT.test(record.ciphertextBase64)
  ) {
    throw new DeliveryReferenceVaultError("INVALID_INPUT", "Encrypted provider reference is invalid.");
  }
}

function fixedTimeEqual(left: CryptoBytes, right: CryptoBytes): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export class DeliveryReferenceVault {
  readonly #key: Promise<CryptoKey>;
  readonly #keys: ReadonlyMap<number, Promise<CryptoKey>>;
  readonly #keyVersion: number;

  constructor(configuration: DeliveryReferenceVaultConfiguration) {
    const encodedKey = configuration.encryptionKeyBase64 ?? "";
    if (!BASE64_KEY.test(encodedKey)) {
      throw new DeliveryReferenceVaultError("NOT_CONFIGURED", "Provider reference encryption is not configured.");
    }
    const keyBytes = base64ToBytes(encodedKey);
    if (keyBytes.byteLength !== KEY_BYTES || bytesToBase64(keyBytes) !== encodedKey) {
      throw new DeliveryReferenceVaultError("NOT_CONFIGURED", "Provider reference encryption is not configured.");
    }
    this.#keyVersion = assertVersion(configuration.keyVersion);
    const keys = new Map<number, Promise<CryptoKey>>();
    const importKey = (encoded: string): Promise<CryptoKey> => {
      if (!BASE64_KEY.test(encoded)) {
        throw new DeliveryReferenceVaultError("NOT_CONFIGURED", "Provider reference encryption is not configured.");
      }
      const bytes = base64ToBytes(encoded);
      if (bytes.byteLength !== KEY_BYTES || bytesToBase64(bytes) !== encoded) {
        bytes.fill(0);
        throw new DeliveryReferenceVaultError("NOT_CONFIGURED", "Provider reference encryption is not configured.");
      }
      return crypto.subtle.importKey(
        "raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"],
      ).finally(() => bytes.fill(0));
    };
    keys.set(this.#keyVersion, crypto.subtle.importKey(
      "raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"],
    ).finally(() => keyBytes.fill(0)));
    for (const [rawVersion, encoded] of Object.entries(configuration.decryptionKeysBase64 ?? {})) {
      const version = assertVersion(rawVersion);
      if (version === this.#keyVersion) {
        if (encoded !== encodedKey) {
          throw new DeliveryReferenceVaultError("NOT_CONFIGURED", "Provider reference encryption is not configured.");
        }
        continue;
      }
      if (keys.has(version)) {
        throw new DeliveryReferenceVaultError("NOT_CONFIGURED", "Provider reference encryption is not configured.");
      }
      keys.set(version, importKey(encoded));
    }
    this.#keys = keys;
    this.#key = keys.get(this.#keyVersion)!;
  }

  async seal(input: Readonly<{
    providerCode: string;
    referenceKind: DeliveryProviderReferenceKind;
    ownerId: string;
    rawReference: string;
  }>): Promise<SealedDeliveryProviderReference> {
    assertContext(input);
    const plaintext = new TextEncoder().encode(input.rawReference);
    if (
      plaintext.byteLength < 1 || plaintext.byteLength > MAX_REFERENCE_BYTES ||
      /[\u0000-\u001f\u007f]/.test(input.rawReference)
    ) {
      throw new DeliveryReferenceVaultError("INVALID_INPUT", "Provider reference is invalid.");
    }
    const referenceSha256 = await sha256Hex(plaintext);
    const context = Object.freeze({
      algorithm: "A256GCM" as const,
      keyVersion: this.#keyVersion,
      providerCode: input.providerCode,
      referenceKind: input.referenceKind,
      ownerId: input.ownerId,
      referenceSha256,
    });
    const iv = new Uint8Array(IV_BYTES);
    crypto.getRandomValues(iv);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(context), tagLength: 128 },
      await this.#key,
      plaintext,
    ));
    plaintext.fill(0);
    return Object.freeze({
      id: await deterministicId(input.providerCode, input.referenceKind, input.ownerId),
      ...context,
      ivBase64: bytesToBase64(iv),
      ciphertextBase64: bytesToBase64(ciphertext),
    });
  }

  async open(record: SealedDeliveryProviderReference): Promise<string> {
    assertSealed(record);
    const decryptionKey = this.#keys.get(record.keyVersion);
    if (!decryptionKey) {
      throw new DeliveryReferenceVaultError("AUTHENTICATION_FAILED", "Provider reference could not be authenticated.");
    }
    const expectedId = await deterministicId(
      record.providerCode,
      record.referenceKind,
      record.ownerId,
    );
    if (record.id !== expectedId) {
      throw new DeliveryReferenceVaultError("AUTHENTICATION_FAILED", "Provider reference could not be authenticated.");
    }
    const iv = base64ToBytes(record.ivBase64);
    const ciphertext = base64ToBytes(record.ciphertextBase64);
    if (iv.byteLength !== IV_BYTES || bytesToBase64(iv) !== record.ivBase64 ||
      bytesToBase64(ciphertext) !== record.ciphertextBase64) {
      throw new DeliveryReferenceVaultError("AUTHENTICATION_FAILED", "Provider reference could not be authenticated.");
    }
    let plaintext: CryptoBytes;
    try {
      plaintext = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad(record), tagLength: 128 },
        await decryptionKey,
        ciphertext,
      ));
    } catch {
      throw new DeliveryReferenceVaultError("AUTHENTICATION_FAILED", "Provider reference could not be authenticated.");
    }
    const actualHash = new TextEncoder().encode(await sha256Hex(plaintext));
    const expectedHash = new TextEncoder().encode(record.referenceSha256);
    if (!fixedTimeEqual(actualHash, expectedHash)) {
      plaintext.fill(0);
      throw new DeliveryReferenceVaultError("AUTHENTICATION_FAILED", "Provider reference could not be authenticated.");
    }
    try {
      const reference = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
      if (!reference || /[\u0000-\u001f\u007f]/.test(reference)) throw new Error("invalid");
      return reference;
    } catch {
      throw new DeliveryReferenceVaultError("AUTHENTICATION_FAILED", "Provider reference could not be authenticated.");
    } finally {
      plaintext.fill(0);
    }
  }
}
