import type {
  CustomerAccountEmailDelivery,
  CustomerAccountEmailPort,
} from "./customer-password-account-store.ts";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const SAFE_MAILBOX = /^[\x21-\x7e]+@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/;

export type ResendIdentityDeliveryConfig = Readonly<{
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  storefrontOrigin: string;
  fetchImpl?: typeof fetch;
}>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function exactHttpsOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === value
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

/** Direct, one-time Resend adapter for account verification and recovery. */
export class ResendIdentityDelivery implements CustomerAccountEmailPort {
  readonly #apiKey: string;
  readonly #fromEmail: string;
  readonly #fromName: string;
  readonly #replyTo: string | undefined;
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(config: ResendIdentityDeliveryConfig) {
    const origin = exactHttpsOrigin(config.storefrontOrigin);
    if (
      !config.apiKey.startsWith("re_") ||
      !SAFE_MAILBOX.test(config.fromEmail) ||
      (config.replyTo !== undefined && !SAFE_MAILBOX.test(config.replyTo)) ||
      !config.fromName.trim() ||
      /[\r\n<>]/.test(config.fromName) ||
      !origin
    ) {
      throw new Error("Identity email delivery configuration is invalid.");
    }
    this.#apiKey = config.apiKey;
    this.#fromEmail = config.fromEmail;
    this.#fromName = config.fromName.trim();
    this.#replyTo = config.replyTo;
    this.#origin = origin;
    this.#fetch = config.fetchImpl ?? fetch;
  }

  async deliver(input: CustomerAccountEmailDelivery): Promise<void> {
    if (
      !["email_verification", "password_reset"].includes(input.purpose) ||
      !SAFE_MAILBOX.test(input.destinationEmail) ||
      !SAFE_IDEMPOTENCY_KEY.test(input.idempotencyKey) ||
      Date.now() >= Date.parse(input.expiresAt)
    ) {
      throw new Error("Identity email delivery is invalid or expired.");
    }
    const accessUrl = new URL(
      input.purpose === "email_verification"
        ? "/api/commerce/account/verify"
        : "/account",
      this.#origin,
    );
    accessUrl.searchParams.set(
      input.purpose === "email_verification" ? "token" : "reset",
      input.rawToken,
    );
    const subject = input.purpose === "email_verification"
      ? "Confirmez votre compte AJ Luxury"
      : "Réinitialisez votre mot de passe AJ Luxury";
    const action = input.purpose === "email_verification"
      ? "Confirmer mon adresse e-mail"
      : "Choisir un nouveau mot de passe";
    const text = [
      subject,
      "",
      `${action} : ${accessUrl.toString()}`,
      "",
      "Ce lien est personnel et temporaire. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.",
    ].join("\n");
    const href = escapeHtml(accessUrl.toString());
    const response = await this.#fetch(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: `${this.#fromName} <${this.#fromEmail}>`,
        to: [input.destinationEmail],
        ...(this.#replyTo ? { reply_to: this.#replyTo } : {}),
        subject,
        text,
        html: `<!doctype html><html lang="fr"><body style="margin:0;background:#f1eee8;color:#111"><main style="max-width:620px;margin:32px auto;background:#fff;padding:40px 32px;font:16px Arial,sans-serif;line-height:1.6"><p style="letter-spacing:.18em">AJ LUXURY</p><h1 style="font:500 28px Georgia,serif">${escapeHtml(subject)}</h1><p>Ce lien personnel est temporaire.</p><p><a href="${href}" style="display:inline-block;background:#111;color:#fff;padding:14px 20px;text-decoration:none">${escapeHtml(action)}</a></p><p style="color:#666">Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p></main></body></html>`,
        tags: [{ name: "kind", value: input.purpose }],
      }),
    });
    if (!response.ok) {
      throw new Error("Identity email provider rejected the request.");
    }
  }
}
