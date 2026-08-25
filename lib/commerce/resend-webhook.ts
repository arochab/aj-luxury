import type { CommerceD1Database } from "./d1-port.ts";

const SAFE_EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,191}$/;
const SAFE_MESSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ALLOWED_EVENTS = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
]);
const MAX_CLOCK_SKEW_SECONDS = 300;

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}

export class ResendWebhookError extends Error {
  readonly code: "INVALID_SIGNATURE" | "INVALID_PAYLOAD" | "PERSISTENCE_FAILURE";

  constructor(
    code: "INVALID_SIGNATURE" | "INVALID_PAYLOAD" | "PERSISTENCE_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "ResendWebhookError";
    this.code = code;
  }
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const output = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      output[index] = binary.charCodeAt(index);
    }
    return output;
  } catch {
    return null;
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(input: Readonly<{
  rawBody: Uint8Array;
  secret: string;
  eventId: string;
  timestamp: string;
  signatures: string;
  nowEpochSeconds: number;
}>): Promise<void> {
  if (!input.secret.startsWith("whsec_") || input.secret.length > 512 ||
    !SAFE_EVENT_ID.test(input.eventId) || !/^\d{10}$/.test(input.timestamp) ||
    !Number.isSafeInteger(input.nowEpochSeconds)) {
    throw new ResendWebhookError("INVALID_SIGNATURE", "Resend signature metadata is invalid.");
  }
  const timestamp = Number(input.timestamp);
  if (Math.abs(input.nowEpochSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    throw new ResendWebhookError("INVALID_SIGNATURE", "Resend signature is stale.");
  }
  const keyBytes = decodeBase64(input.secret.slice("whsec_".length));
  if (!keyBytes || keyBytes.byteLength < 16) {
    throw new ResendWebhookError("INVALID_SIGNATURE", "Resend signing secret is invalid.");
  }
  const body = new TextDecoder("utf-8", { fatal: true }).decode(input.rawBody);
  const signed = `${input.eventId}.${input.timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const wanted = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    ownedArrayBuffer(new TextEncoder().encode(signed)),
  ));
  const candidates = input.signatures.split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => decodeBase64(part.slice(3)))
    .filter((value): value is Uint8Array => value !== null);
  if (!candidates.some((candidate) => constantTimeEqual(candidate, wanted))) {
    throw new ResendWebhookError("INVALID_SIGNATURE", "Resend signature does not match.");
  }
}

type ResendEvent = Readonly<{
  eventType: string;
  occurredAt: string;
  providerMessageId: string;
}>;

function parseEvent(rawBody: Uint8Array): ResendEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    throw new ResendWebhookError("INVALID_PAYLOAD", "Resend payload is invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ResendWebhookError("INVALID_PAYLOAD", "Resend payload is invalid.");
  }
  const record = parsed as Record<string, unknown>;
  const data = record.data;
  if (!ALLOWED_EVENTS.has(String(record.type)) ||
    typeof record.created_at !== "string" || !Number.isFinite(Date.parse(record.created_at)) ||
    !data || typeof data !== "object" || Array.isArray(data) ||
    typeof (data as Record<string, unknown>).email_id !== "string" ||
    !SAFE_MESSAGE_ID.test((data as Record<string, string>).email_id)) {
    throw new ResendWebhookError("INVALID_PAYLOAD", "Resend payload is invalid.");
  }
  return Object.freeze({
    eventType: String(record.type),
    occurredAt: new Date(record.created_at).toISOString(),
    providerMessageId: (data as Record<string, string>).email_id,
  });
}

export async function recordVerifiedResendWebhook(input: Readonly<{
  database: CommerceD1Database;
  rawBody: Uint8Array;
  signingSecret: string;
  eventId: string | null;
  timestamp: string | null;
  signature: string | null;
  now: string;
  nowEpochSeconds: number;
}>): Promise<Readonly<{ disposition: "applied" | "duplicate" }>> {
  if (!input.eventId || !input.timestamp || !input.signature ||
    !Number.isFinite(Date.parse(input.now))) {
    throw new ResendWebhookError("INVALID_SIGNATURE", "Resend signature metadata is missing.");
  }
  await verifySignature({
    rawBody: input.rawBody,
    secret: input.signingSecret,
    eventId: input.eventId,
    timestamp: input.timestamp,
    signatures: input.signature,
    nowEpochSeconds: input.nowEpochSeconds,
  });
  const event = parseEvent(input.rawBody);
  const payloadSha256 = hex(new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    ownedArrayBuffer(input.rawBody),
  )));
  if (!SHA256.test(payloadSha256)) {
    throw new ResendWebhookError("PERSISTENCE_FAILURE", "Resend payload fingerprint failed.");
  }
  try {
    const inserted = await input.database.prepare(
      `INSERT OR IGNORE INTO resend_webhook_events (
        id, provider_message_id, event_type, occurred_at, payload_sha256, received_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.eventId,
      event.providerMessageId,
      event.eventType,
      event.occurredAt,
      payloadSha256,
      new Date(input.now).toISOString(),
    ).run();
    const persisted = await input.database.prepare(
      `SELECT provider_message_id, event_type, occurred_at, payload_sha256
      FROM resend_webhook_events WHERE id=?`,
    ).bind(input.eventId).first<{
      provider_message_id: string;
      event_type: string;
      occurred_at: string;
      payload_sha256: string;
    }>();
    if (!persisted || persisted.provider_message_id !== event.providerMessageId ||
      persisted.event_type !== event.eventType || persisted.occurred_at !== event.occurredAt ||
      persisted.payload_sha256 !== payloadSha256) {
      throw new ResendWebhookError("PERSISTENCE_FAILURE", "Resend event replay conflicts.");
    }
    return Object.freeze({
      disposition: Number(inserted.meta?.changes ?? 0) === 1 ? "applied" : "duplicate",
    });
  } catch (cause) {
    if (cause instanceof ResendWebhookError) throw cause;
    throw new ResendWebhookError("PERSISTENCE_FAILURE", "Resend event could not be stored.");
  }
}
