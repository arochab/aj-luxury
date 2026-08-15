import type { CommerceD1Database } from "./d1-port.ts";
import {
  DeliveryReferenceVault,
  type DeliveryProviderReferenceKind,
  type SealedDeliveryProviderReference,
} from "./delivery-reference-vault.ts";

type VaultRow = Readonly<{
  id: string;
  algorithm: "A256GCM";
  key_version: number;
  provider_code: string;
  reference_kind: DeliveryProviderReferenceKind;
  owner_id: string;
  reference_sha256: string;
  iv_base64: string;
  ciphertext_base64: string;
}>;

const columns = `id, algorithm, key_version, provider_code, reference_kind,
  owner_id, reference_sha256, iv_base64, ciphertext_base64`;

export class D1DeliveryReferenceStoreError extends Error {
  readonly code: "REFERENCE_NOT_FOUND" | "REFERENCE_CONFLICT" | "PERSISTENCE_FAILURE";

  constructor(
    code: "REFERENCE_NOT_FOUND" | "REFERENCE_CONFLICT" | "PERSISTENCE_FAILURE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "D1DeliveryReferenceStoreError";
    this.code = code;
  }
}

function fromRow(row: VaultRow): SealedDeliveryProviderReference {
  return Object.freeze({
    id: row.id,
    algorithm: row.algorithm,
    keyVersion: row.key_version,
    providerCode: row.provider_code,
    referenceKind: row.reference_kind,
    ownerId: row.owner_id,
    referenceSha256: row.reference_sha256,
    ivBase64: row.iv_base64,
    ciphertextBase64: row.ciphertext_base64,
  });
}

function sameIdentity(left: SealedDeliveryProviderReference, right: SealedDeliveryProviderReference): boolean {
  return left.id === right.id && left.algorithm === right.algorithm &&
    left.keyVersion === right.keyVersion && left.providerCode === right.providerCode &&
    left.referenceKind === right.referenceKind && left.ownerId === right.ownerId &&
    left.referenceSha256 === right.referenceSha256;
}

export class D1DeliveryReferenceStore {
  readonly #database: CommerceD1Database;
  readonly #vault: DeliveryReferenceVault;

  constructor(database: CommerceD1Database, vault: DeliveryReferenceVault) {
    this.#database = database;
    this.#vault = vault;
  }

  async put(record: SealedDeliveryProviderReference, createdAt: string): Promise<void> {
    try {
      await this.#database.prepare(
        `INSERT OR IGNORE INTO delivery_provider_reference_vault (
          id, algorithm, key_version, provider_code, reference_kind, owner_id,
          reference_sha256, iv_base64, ciphertext_base64, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        record.id,
        record.algorithm,
        record.keyVersion,
        record.providerCode,
        record.referenceKind,
        record.ownerId,
        record.referenceSha256,
        record.ivBase64,
        record.ciphertextBase64,
        createdAt,
      ).run();
    } catch (error) {
      throw new D1DeliveryReferenceStoreError(
        "PERSISTENCE_FAILURE",
        "Encrypted provider reference could not be recorded.",
        { cause: error },
      );
    }
    const stored = await this.get(record.referenceKind, record.ownerId);
    if (!stored || !sameIdentity(stored, record)) {
      throw new D1DeliveryReferenceStoreError(
        "REFERENCE_CONFLICT",
        "Encrypted provider reference conflicts with its immutable owner.",
      );
    }
  }

  async get(
    referenceKind: DeliveryProviderReferenceKind,
    ownerId: string,
  ): Promise<SealedDeliveryProviderReference | null> {
    const row = await this.#database.prepare(
      `SELECT ${columns} FROM delivery_provider_reference_vault
      WHERE reference_kind = ? AND owner_id = ?`,
    ).bind(referenceKind, ownerId).first<VaultRow>();
    return row ? fromRow(row) : null;
  }

  async open(referenceKind: DeliveryProviderReferenceKind, ownerId: string): Promise<string> {
    const record = await this.get(referenceKind, ownerId);
    if (!record) {
      throw new D1DeliveryReferenceStoreError(
        "REFERENCE_NOT_FOUND",
        "Encrypted provider reference was not found.",
      );
    }
    return this.#vault.open(record);
  }
}
