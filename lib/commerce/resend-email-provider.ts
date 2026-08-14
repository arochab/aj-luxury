import type {
  TransactionalEmailDelivery,
  TransactionalEmailDeliveryReceipt,
  TransactionalEmailProviderPort,
} from "./email-outbox.ts";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
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
          "Content-Type": "application/json",
          "Idempotency-Key": delivery.idempotencyKey,
        },
        body: JSON.stringify({
          from: `${this.#fromName} <${this.#fromEmail}>`,
          to: [delivery.message.recipientEmail],
          subject: content.subject,
          text: content.text,
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
      typeof (payload as Record<string, unknown>).id !== "string"
    ) {
      throw new ResendEmailProviderError("ambiguous", "Email acceptance receipt is invalid.");
    }
    return Object.freeze({ idempotencyKey: delivery.idempotencyKey });
  }
}
