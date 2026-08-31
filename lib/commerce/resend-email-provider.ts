import type {
  TransactionalEmailDelivery,
  TransactionalEmailDeliveryReceipt,
  TransactionalEmailProviderPort,
} from "./email-outbox.ts";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const MAX_TRANSPORT_ATTEMPTS = 3;
const MAX_RESPONSE_BYTES = 64 * 1024;
const PROVIDER_LOOKUP_TIMEOUT_MS = 5_000;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/;
const SAFE_MAILBOX = /^[\x21-\x7e]+@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const SAFE_TAG_VALUE = /^[A-Za-z0-9_-]{1,256}$/;

export class ResendEmailProviderError extends Error {
  readonly outcome: "invalid-config" | "rejected" | "ambiguous";

  constructor(
    outcome: "invalid-config" | "rejected" | "ambiguous",
    message: string,
  ) {
    super(message);
    this.name = "ResendEmailProviderError";
    this.outcome = outcome;
  }
}

export type ResendEmailProviderConfig = Readonly<{
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  fetchImpl?: typeof fetch;
  lookupTimeoutMs?: number;
}>;

type EmailContent = Readonly<{ subject: string; text: string }>;
const SAFE_PROVIDER_MESSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

export type ResendExpectedEmail = Readonly<{
  outboxId: string;
  kind: string;
  locale: "fr" | "en";
  recipientEmail: string;
  payloadJson: string;
}>;

export type ResendDeliveredEmailEvidence = Readonly<{
  providerMessageId: string;
  providerLastEvent: "delivered" | "opened" | "clicked";
  providerCreatedAt: string;
}>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function brandedHtml(content: EmailContent): string {
  const title = escapeHtml(content.subject);
  const termsUrl = /https:\/\/ajluxurystore\.com\/terms\?version=[A-Za-z0-9._%+-]{1,80}/g;
  let cursor = 0;
  const linked: string[] = [];
  for (const match of content.text.matchAll(termsUrl)) {
    const index = match.index ?? 0;
    linked.push(escapeHtml(content.text.slice(cursor, index)));
    const url = escapeHtml(match[0]);
    linked.push(`<a href="${url}" style="color:#282828;text-decoration:underline">${url}</a>`);
    cursor = index + match[0].length;
  }
  linked.push(escapeHtml(content.text.slice(cursor)));
  const body = linked.join("").replaceAll("\n", "<br>");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#f1eee8;color:#111"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1eee8;padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff"><tr><td style="background:#0a0a0a;color:#f4eee4;padding:28px 32px;font:600 18px Arial,sans-serif;letter-spacing:.18em">AJ LUXURY</td></tr><tr><td style="padding:40px 32px 24px"><h1 style="margin:0 0 24px;font:500 28px Georgia,serif;line-height:1.2">${title}</h1><p style="margin:0;font:16px Arial,sans-serif;line-height:1.65;color:#282828">${body}</p></td></tr><tr><td style="padding:24px 32px 32px;border-top:1px solid #e8e3db;font:12px Arial,sans-serif;line-height:1.5;color:#6b665e">AJ Luxury · ajluxurystore.com</td></tr></table></td></tr></table></body></html>`;
}

function requireMailbox(value: string, field: string): string {
  if (value.length > 254 || !SAFE_MAILBOX.test(value)) {
    throw new ResendEmailProviderError("invalid-config", `${field} is invalid.`);
  }
  return value;
}

function parseContent(payloadJson: string): EmailContent {
  if (new TextEncoder().encode(payloadJson).byteLength > 16 * 1024) {
    throw new ResendEmailProviderError("rejected", "Email payload is too large.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    throw new ResendEmailProviderError("rejected", "Email payload is invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ResendEmailProviderError("rejected", "Email payload is invalid.");
  }
  const record = parsed as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== "subject" && key !== "text") ||
    typeof record.subject !== "string" || record.subject.length < 1 ||
    record.subject.length > 200 || /[\r\n]/.test(record.subject) ||
    typeof record.text !== "string" || record.text.length < 1 ||
    record.text.length > 12_000
  ) {
    throw new ResendEmailProviderError("rejected", "Email content is invalid.");
  }
  return Object.freeze({ subject: record.subject, text: record.text });
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new ResendEmailProviderError("ambiguous", "Email provider response is too large.");
  }
  if (!response.body) {
    throw new ResendEmailProviderError("ambiguous", "Email provider response is invalid.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ResendEmailProviderError(
          "ambiguous",
          "Email provider response is too large.",
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ResendEmailProviderError("ambiguous", "Email provider response is invalid.");
  }
}

function tagValue(value: string): string {
  const safe = value.replaceAll(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
  if (!SAFE_TAG_VALUE.test(safe)) {
    throw new ResendEmailProviderError("rejected", "Email tag is invalid.");
  }
  return safe;
}

function mailboxList(value: unknown): string[] | null {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return value as string[];
}

function exactOptionalMailboxList(value: unknown, expected?: string): boolean {
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
    return expected === undefined;
  }
  const actual = mailboxList(value);
  return actual !== null && actual.length === 1 && actual[0] === expected;
}

function emptyMailboxList(value: unknown): boolean {
  return value === undefined || value === null ||
    (Array.isArray(value) && value.length === 0);
}

function exactTags(value: unknown, expected: ResendExpectedEmail): boolean {
  if (!Array.isArray(value)) return false;
  const tags = new Map<string, string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const entry = candidate as Record<string, unknown>;
    if (
      typeof entry.name !== "string" || typeof entry.value !== "string" ||
      tags.has(entry.name)
    ) return false;
    tags.set(entry.name, entry.value);
  }
  if (tags.get("kind") !== expected.kind || tags.get("locale") !== expected.locale) {
    return false;
  }
  const historicalOutboxTag = tags.get("outbox_id");
  return historicalOutboxTag === undefined || historicalOutboxTag === tagValue(expected.outboxId);
}

function canonicalProviderTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

/** Resend HTTP adapter with provider-side 24-hour idempotency. */
export class ResendEmailProvider implements TransactionalEmailProviderPort {
  readonly #apiKey: string;
  readonly #fromEmail: string;
  readonly #fromName: string;
  readonly #replyTo: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #lookupTimeoutMs: number;

  constructor(config: ResendEmailProviderConfig) {
    if (!config.apiKey.startsWith("re_") || config.apiKey.length < 6) {
      throw new ResendEmailProviderError("invalid-config", "Resend API key is invalid.");
    }
    this.#apiKey = config.apiKey;
    this.#fromEmail = requireMailbox(config.fromEmail, "fromEmail");
    this.#fromName = config.fromName.trim();
    if (!this.#fromName || this.#fromName.length > 80 || /[\r\n<>]/.test(this.#fromName)) {
      throw new ResendEmailProviderError("invalid-config", "fromName is invalid.");
    }
    this.#replyTo = config.replyTo
      ? requireMailbox(config.replyTo, "replyTo")
      : undefined;
    this.#fetch = config.fetchImpl ?? fetch;
    this.#lookupTimeoutMs = config.lookupTimeoutMs ?? PROVIDER_LOOKUP_TIMEOUT_MS;
    if (!Number.isInteger(this.#lookupTimeoutMs) ||
      this.#lookupTimeoutMs < 10 || this.#lookupTimeoutMs > 10_000) {
      throw new ResendEmailProviderError("invalid-config", "lookupTimeoutMs is invalid.");
    }
  }

  async deliver(
    delivery: TransactionalEmailDelivery,
  ): Promise<TransactionalEmailDeliveryReceipt> {
    if (!SAFE_IDEMPOTENCY_KEY.test(delivery.idempotencyKey)) {
      throw new ResendEmailProviderError("rejected", "Email idempotency key is invalid.");
    }
    const content = parseContent(delivery.message.payloadJson);
    // Keep RequestInit and its headers mutable. Cloudflare's native fetch
    // normalizes these objects internally; freezing them can fail before the
    // request ever reaches Resend. The account-email adapter already uses the
    // same plain-object shape successfully in production.
    const request: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": delivery.idempotencyKey,
      },
      body: JSON.stringify({
        from: `${this.#fromName} <${this.#fromEmail}>`,
        to: [delivery.message.recipientEmail],
        subject: content.subject,
        text: content.text,
        html: brandedHtml(content),
        ...(this.#replyTo ? { reply_to: this.#replyTo } : {}),
        tags: [
          { name: "kind", value: delivery.message.kind },
          { name: "locale", value: delivery.message.locale },
          { name: "outbox_id", value: tagValue(delivery.message.id) },
        ],
      }),
    };
    let lastAmbiguous: ResendEmailProviderError | null = null;
    for (let attempt = 1; attempt <= MAX_TRANSPORT_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        // This deliberately mirrors the account-email transport that is already
        // proven in production. Replays keep the same provider idempotency key.
        response = await this.#fetch(RESEND_EMAILS_ENDPOINT, request);
      } catch {
        lastAmbiguous = new ResendEmailProviderError(
          "ambiguous",
          "Email provider request failed.",
        );
        continue;
      }
      let payload: unknown;
      try {
        payload = await boundedJson(response);
      } catch (cause) {
        lastAmbiguous = cause instanceof ResendEmailProviderError
          ? cause
          : new ResendEmailProviderError("ambiguous", "Email provider response is invalid.");
        continue;
      }
      if (!response.ok) {
        const ambiguous = response.status === 409 || response.status === 429 ||
          response.status >= 500;
        const rejection = new ResendEmailProviderError(
          ambiguous ? "ambiguous" : "rejected",
          "Email provider rejected the request.",
        );
        if (!ambiguous) throw rejection;
        lastAmbiguous = rejection;
        continue;
      }
      if (
        !payload || typeof payload !== "object" || Array.isArray(payload) ||
        typeof (payload as Record<string, unknown>).id !== "string" ||
        !SAFE_PROVIDER_MESSAGE_ID.test((payload as Record<string, unknown>).id as string)
      ) {
        lastAmbiguous = new ResendEmailProviderError(
          "ambiguous",
          "Email acceptance receipt is invalid.",
        );
        continue;
      }
      return Object.freeze({
        idempotencyKey: delivery.idempotencyKey,
        providerMessageId: (payload as Record<string, string>).id,
      });
    }
    throw lastAmbiguous ?? new ResendEmailProviderError(
      "ambiguous",
      "Email provider request failed.",
    );
  }

  /**
   * Reads one immutable provider record and returns proof only when the exact
   * AJ Luxury message is already delivered. A 404, a merely accepted message,
   * or any content mismatch is inconclusive and can never authorize a replay.
   */
  async retrieveDeliveredEvidence(
    providerMessageId: string,
    expected: ResendExpectedEmail,
  ): Promise<ResendDeliveredEmailEvidence> {
    if (!SAFE_PROVIDER_MESSAGE_ID.test(providerMessageId)) {
      throw new ResendEmailProviderError("rejected", "Email provider id is invalid.");
    }
    if (
      !SAFE_IDEMPOTENCY_KEY.test(expected.outboxId) ||
      !SAFE_TAG_VALUE.test(expected.kind) ||
      !["fr", "en"].includes(expected.locale) ||
      expected.recipientEmail.length > 254 || !SAFE_MAILBOX.test(expected.recipientEmail)
    ) {
      throw new ResendEmailProviderError("rejected", "Expected email is invalid.");
    }
    const content = parseContent(expected.payloadJson);
    let response: Response;
    try {
      response = await this.#fetch(
        `${RESEND_EMAILS_ENDPOINT}/${encodeURIComponent(providerMessageId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${this.#apiKey}` },
          redirect: "error",
          signal: AbortSignal.timeout(this.#lookupTimeoutMs),
        },
      );
    } catch {
      throw new ResendEmailProviderError("ambiguous", "Email lookup failed.");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ResendEmailProviderError("ambiguous", "Email lookup is inconclusive.");
    }
    const payload = await boundedJson(response);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ResendEmailProviderError("ambiguous", "Email lookup is inconclusive.");
    }
    const record = payload as Record<string, unknown>;
    const to = mailboxList(record.to);
    const createdAt = canonicalProviderTimestamp(record.created_at);
    const lastEvent = record.last_event;
    const exactMessage = record.id === providerMessageId &&
      record.from === `${this.#fromName} <${this.#fromEmail}>` &&
      to?.length === 1 && to[0] === expected.recipientEmail &&
      record.subject === content.subject && record.text === content.text &&
      record.html === brandedHtml(content) && emptyMailboxList(record.cc) &&
      emptyMailboxList(record.bcc) &&
      exactOptionalMailboxList(record.reply_to, this.#replyTo) &&
      (record.attachments === undefined ||
        (Array.isArray(record.attachments) && record.attachments.length === 0)) &&
      exactTags(record.tags, expected) && createdAt !== null;
    if (!exactMessage || !["delivered", "opened", "clicked"].includes(String(lastEvent))) {
      throw new ResendEmailProviderError("ambiguous", "Email delivery is inconclusive.");
    }
    const providerLastEvent = lastEvent as "delivered" | "opened" | "clicked";
    return Object.freeze({
      providerMessageId,
      providerLastEvent,
      providerCreatedAt: createdAt,
    });
  }
}
