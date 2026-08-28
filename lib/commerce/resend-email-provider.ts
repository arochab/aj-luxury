import type {
  TransactionalEmailDelivery,
  TransactionalEmailDeliveryReceipt,
  TransactionalEmailProviderPort,
} from "./email-outbox.ts";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const RESEND_USER_AGENT = "aj-luxury-commerce/1.0";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/;
const SAFE_MAILBOX = /^[\x21-\x7e]+@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;

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
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}>;

type EmailContent = Readonly<{ subject: string; text: string }>;
const SAFE_PROVIDER_MESSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

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
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    throw new ResendEmailProviderError("ambiguous", "Email provider response is too large.");
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ResendEmailProviderError("ambiguous", "Email provider response is invalid.");
  }
}

/** Resend HTTP adapter with provider-side 24-hour idempotency. */
export class ResendEmailProvider implements TransactionalEmailProviderPort {
  readonly #apiKey: string;
  readonly #fromEmail: string;
  readonly #fromName: string;
  readonly #replyTo: string | undefined;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

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
    this.#timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 1_000 || this.#timeoutMs > 15_000) {
      throw new ResendEmailProviderError("invalid-config", "timeoutMs is invalid.");
    }
    this.#fetch = config.fetchImpl ?? fetch;
  }

  async deliver(
    delivery: TransactionalEmailDelivery,
  ): Promise<TransactionalEmailDeliveryReceipt> {
    if (!SAFE_IDEMPOTENCY_KEY.test(delivery.idempotencyKey)) {
      throw new ResendEmailProviderError("rejected", "Email idempotency key is invalid.");
    }
    const content = parseContent(delivery.message.payloadJson);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(RESEND_EMAILS_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": delivery.idempotencyKey,
          "User-Agent": RESEND_USER_AGENT,
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
          ],
        }),
        signal: controller.signal,
      });
    } catch {
      throw new ResendEmailProviderError("ambiguous", "Email provider request failed.");
    } finally {
      clearTimeout(timeout);
    }
    const payload = await boundedJson(response);
    if (!response.ok) {
      throw new ResendEmailProviderError(
        response.status === 409 || response.status === 429 || response.status >= 500
          ? "ambiguous"
          : "rejected",
        "Email provider rejected the request.",
      );
    }
    if (
      !payload || typeof payload !== "object" || Array.isArray(payload) ||
      typeof (payload as Record<string, unknown>).id !== "string" ||
      !SAFE_PROVIDER_MESSAGE_ID.test((payload as Record<string, unknown>).id as string)
    ) {
      throw new ResendEmailProviderError("ambiguous", "Email acceptance receipt is invalid.");
    }
    return Object.freeze({
      idempotencyKey: delivery.idempotencyKey,
      providerMessageId: (payload as Record<string, string>).id,
    });
  }
}
