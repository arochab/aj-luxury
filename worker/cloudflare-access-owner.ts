export type CloudflareAccessOwnerEnvironment = Readonly<{
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  COMMERCE_CONTROLLED_OWNER_EMAIL?: string;
}>;

const TEAM_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
const AUDIENCE = /^[A-Za-z0-9_-]{16,256}$/;
const JWT_SEGMENT = /^[A-Za-z0-9_-]+$/;
const MAX_JWT_BYTES = 16 * 1024;
const MAX_CERTS_BYTES = 128 * 1024;
const CLOCK_SKEW_SECONDS = 30;

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}

type AccessConfiguration = Readonly<{
  issuer: string;
  audience: string;
  ownerEmail: string;
}>;

function exactText(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function readConfiguration(
  env: CloudflareAccessOwnerEnvironment,
): AccessConfiguration | null {
  const rawDomain = env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim() ?? "";
  const audience = env.CLOUDFLARE_ACCESS_AUD?.trim() ?? "";
  const ownerEmail = env.COMMERCE_CONTROLLED_OWNER_EMAIL?.trim().toLowerCase() ?? "";
  try {
    const domain = new URL(rawDomain);
    if (domain.protocol !== "https:" || domain.origin !== rawDomain ||
      domain.pathname !== "/" || domain.search || domain.hash ||
      domain.username || domain.password || !TEAM_HOST.test(domain.hostname) ||
      !AUDIENCE.test(audience) || !ownerEmail || ownerEmail.length > 320 ||
      !/^[^@\s]+@[^@\s]+$/.test(ownerEmail)) return null;
    return Object.freeze({ issuer: domain.origin, audience, ownerEmail });
  } catch {
    return null;
  }
}

export function cloudflareAccessOwnerConfigurationValid(
  env: CloudflareAccessOwnerEnvironment,
): boolean {
  return readConfiguration(env) !== null;
}

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  if (!segment || !JWT_SEGMENT.test(segment)) return null;
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - segment.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function decodeSignature(segment: string): Uint8Array | null {
  if (!segment || !JWT_SEGMENT.test(segment)) return null;
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - segment.length % 4) % 4);
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function responseBytes(response: Response, maximum: number): Promise<Uint8Array | null> {
  const declared = response.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function resolveVerificationKey(issuer: string, kid: string): Promise<CryptoKey | null> {
  try {
    const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
      headers: { Accept: "application/json" },
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const raw = await responseBytes(response, MAX_CERTS_BYTES);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const keys = (parsed as { keys?: unknown }).keys;
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > 16) return null;
    const jwk = keys.find((candidate) => {
      if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return false;
      const value = candidate as Record<string, unknown>;
      return value.kid === kid && value.kty === "RSA" &&
        (value.alg === undefined || value.alg === "RS256") &&
        (value.use === undefined || value.use === "sig") &&
        typeof value.n === "string" && typeof value.e === "string";
    }) as JsonWebKey | undefined;
    if (!jwk) return null;
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }
}

function validAudience(value: unknown, expected: string): boolean {
  return typeof value === "string"
    ? exactText(value, expected)
    : Array.isArray(value) && value.length <= 16 &&
      value.some((candidate) => typeof candidate === "string" && exactText(candidate, expected));
}

export async function cloudflareAccessOwnerRequestAuthenticated(
  request: Request,
  env: CloudflareAccessOwnerEnvironment,
): Promise<boolean> {
  const configuration = readConfiguration(env);
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion")?.trim() ?? "";
  if (!configuration || !assertion || assertion.length > MAX_JWT_BYTES) return false;
  const segments = assertion.split(".");
  if (segments.length !== 3) return false;
  const header = decodeJsonSegment(segments[0]);
  const claims = decodeJsonSegment(segments[1]);
  const signature = decodeSignature(segments[2]);
  const kid = header?.kid;
  if (!header || header.alg !== "RS256" ||
    (header.typ !== undefined && header.typ !== "JWT") ||
    typeof kid !== "string" || kid.length < 1 || kid.length > 256 ||
    !claims || !signature) return false;
  const key = await resolveVerificationKey(configuration.issuer, kid);
  if (!key) return false;
  let validSignature = false;
  try {
    validSignature = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      ownedArrayBuffer(signature),
      ownedArrayBuffer(new TextEncoder().encode(`${segments[0]}.${segments[1]}`)),
    );
  } catch {
    return false;
  }
  if (!validSignature) return false;

  const now = Math.floor(Date.now() / 1000);
  const issuer = claims.iss;
  const subject = claims.sub;
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const expiresAt = claims.exp;
  const notBefore = claims.nbf;
  const issuedAt = claims.iat;
  return typeof issuer === "string" && exactText(issuer, configuration.issuer) &&
    validAudience(claims.aud, configuration.audience) &&
    typeof subject === "string" && subject.length >= 1 && subject.length <= 512 &&
    exactText(email, configuration.ownerEmail) &&
    typeof expiresAt === "number" && Number.isSafeInteger(expiresAt) &&
    expiresAt > now - CLOCK_SKEW_SECONDS &&
    (notBefore === undefined || (typeof notBefore === "number" &&
      Number.isSafeInteger(notBefore) && notBefore <= now + CLOCK_SKEW_SECONDS)) &&
    (issuedAt === undefined || (typeof issuedAt === "number" &&
      Number.isSafeInteger(issuedAt) && issuedAt <= now + CLOCK_SKEW_SECONDS));
}
