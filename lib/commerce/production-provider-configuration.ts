export const productionProviderConfigurationProtocol =
  "ajl-production-provider-configuration-v1" as const;

export const productionProviderConfigurationSchemaContract =
  "AJL_PRODUCTION_PROVIDER_CONFIGURATION_ATTESTATION_CONTRACT_V1" as const;

export const productionProviderConfigurationSchemaContractSha256 =
  "9f95eb43716e3cc288d197fc045df8e71d227bbd151179c2aa3e72b2de02524d" as const;

const SHA_1 = /^[0-9a-f]{40}$/;
const WORKER_VERSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const STRIPE_ACCOUNT_ID = /^acct_[A-Za-z0-9]{8,64}$/;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type ProductionProviderConfigurationInput = Readonly<{
  releaseSha: string;
  workerVersionId: string;
  stockManifestId: string;
  stripeAccountId: string;
  sendcloudIntegrationId: string;
  sendcloudSenderAddressId: string;
  resendDomain: string;
  commerceOrigin: string;
  transactionalFromEmail: string;
}>;

export type ProductionProviderIdentities = Readonly<
  Omit<
    ProductionProviderConfigurationInput,
    "releaseSha" | "workerVersionId" | "stockManifestId"
  >
>;

export type ProductionProviderConfigurationAttestation = Readonly<
  ProductionProviderConfigurationInput & {
    protocol: typeof productionProviderConfigurationProtocol;
    configurationSha256: string;
  }
>;

function exactHttpsOrigin(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === value &&
        parsed.pathname === "/" && !parsed.search && !parsed.hash &&
        !parsed.username && !parsed.password
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function validDomain(value: string): boolean {
  return value.length >= 4 && value.length <= 253 && value === value.toLowerCase() &&
    value.includes(".") && value.split(".").every((label) => DNS_LABEL.test(label));
}

export function productionProviderConfigurationInputValid(
  input: ProductionProviderConfigurationInput,
): boolean {
  const origin = exactHttpsOrigin(input.commerceOrigin);
  const at = input.transactionalFromEmail.lastIndexOf("@");
  const fromDomain = at > 0 ? input.transactionalFromEmail.slice(at + 1) : "";
  return SHA_1.test(input.releaseSha) &&
    WORKER_VERSION_ID.test(input.workerVersionId) &&
    SAFE_REFERENCE.test(input.stockManifestId) &&
    STRIPE_ACCOUNT_ID.test(input.stripeAccountId) &&
    SAFE_REFERENCE.test(input.sendcloudIntegrationId) &&
    SAFE_REFERENCE.test(input.sendcloudSenderAddressId) &&
    validDomain(input.resendDomain) && origin !== null &&
    validDomain(origin.hostname) &&
    input.transactionalFromEmail.length <= 254 &&
    input.transactionalFromEmail === input.transactionalFromEmail.trim().toLowerCase() &&
    fromDomain === input.resendDomain &&
    !/[\u0000-\u001f\u007f\s]/.test(input.transactionalFromEmail);
}

function canonicalPayload(input: ProductionProviderConfigurationInput): string {
  return JSON.stringify({
    protocol: productionProviderConfigurationProtocol,
    releaseSha: input.releaseSha,
    workerVersionId: input.workerVersionId.toLowerCase(),
    stockManifestId: input.stockManifestId,
    stripeAccountId: input.stripeAccountId,
    sendcloudIntegrationId: input.sendcloudIntegrationId,
    sendcloudSenderAddressId: input.sendcloudSenderAddressId,
    resendDomain: input.resendDomain,
    commerceOrigin: input.commerceOrigin,
    transactionalFromEmail: input.transactionalFromEmail,
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createProductionProviderConfigurationAttestation(
  input: ProductionProviderConfigurationInput,
): Promise<ProductionProviderConfigurationAttestation> {
  if (!productionProviderConfigurationInputValid(input)) {
    throw new TypeError("Production provider configuration identity is invalid.");
  }
  const normalized = Object.freeze({
    ...input,
    workerVersionId: input.workerVersionId.toLowerCase(),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalPayload(normalized)),
  );
  return Object.freeze({
    protocol: productionProviderConfigurationProtocol,
    ...normalized,
    configurationSha256: bytesToHex(new Uint8Array(digest)),
  });
}
