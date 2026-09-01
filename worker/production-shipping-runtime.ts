import { DeliveryReferenceVault } from "../lib/commerce/delivery-reference-vault.ts";

const SAFE_SENDCLOUD_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,190}$/;
const BELMONT_ORIGIN_ATTESTATION = "3 A rue Principale|67130|Belmont|FR";

export type ProductionShippingRuntimeEnvironment = Readonly<{
  DELIVERY_PROVIDER?: string;
  SENDCLOUD_API_VERSION?: string;
  SENDCLOUD_PUBLIC_KEY?: string;
  SENDCLOUD_SECRET_KEY?: string;
  SENDCLOUD_SENDER_ADDRESS_ID?: string;
  SENDCLOUD_SENDER_ADDRESS_ATTESTATION?: string;
  DELIVERY_REFERENCE_ENCRYPTION_KEY_BASE64?: string;
  DELIVERY_REFERENCE_KEY_VERSION?: string;
  DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON?: string;
  OPERATIONS_LABEL_EMAIL?: string;
}>;

/** Exact provider configuration consumed by the outbound-label route. */
export function productionOutboundShippingRuntimeConfigured(
  env: ProductionShippingRuntimeEnvironment | undefined,
): boolean {
  if (!env || env.DELIVERY_PROVIDER !== "sendcloud" ||
    env.SENDCLOUD_API_VERSION !== "3" ||
    !SAFE_SENDCLOUD_CODE.test(env.SENDCLOUD_PUBLIC_KEY?.trim() ?? "") ||
    (env.SENDCLOUD_SECRET_KEY?.trim().length ?? 0) < 16 ||
    (env.SENDCLOUD_SECRET_KEY?.trim().length ?? 0) > 256 ||
    !/^[1-9]\d{0,17}$/.test(env.SENDCLOUD_SENDER_ADDRESS_ID ?? "") ||
    !Number.isSafeInteger(Number(env.SENDCLOUD_SENDER_ADDRESS_ID)) ||
    env.SENDCLOUD_SENDER_ADDRESS_ATTESTATION !== BELMONT_ORIGIN_ATTESTATION ||
    env.OPERATIONS_LABEL_EMAIL !== "jeremy@ajluxurystore.com") {
    return false;
  }
  try {
    const parsed: unknown = env.DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON
      ? JSON.parse(env.DELIVERY_REFERENCE_DECRYPTION_KEYS_JSON)
      : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) ||
      Object.values(parsed).some((value) => typeof value !== "string")) return false;
    new DeliveryReferenceVault({
      encryptionKeyBase64: env.DELIVERY_REFERENCE_ENCRYPTION_KEY_BASE64,
      keyVersion: env.DELIVERY_REFERENCE_KEY_VERSION,
      decryptionKeysBase64: parsed as Record<string, string>,
    });
    return true;
  } catch {
    return false;
  }
}
