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

function identityCopy(purpose: CustomerAccountEmailDelivery["purpose"]): Readonly<{
  subject: string;
  heading: string;
  body: string;
  action: string;
  note: string;
}> {
  return purpose === "email_verification"
    ? Object.freeze({
      subject: "Confirmez votre adresse e-mail | AJ Luxury",
      heading: "Votre espace AJ Luxury",
      body: "Une dernière étape : confirmez votre adresse e-mail pour activer votre compte.",
      action: "Confirmer mon adresse",
      note: "Vous n’avez pas créé ce compte ? Ignorez simplement cet e-mail.",
    })
    : Object.freeze({
      subject: "Nouveau mot de passe | AJ Luxury",
      heading: "Nouveau mot de passe",
      body: "Vous avez demandé à modifier le mot de passe de votre espace AJ Luxury.",
      action: "Choisir un mot de passe",
      note: "Vous n’êtes pas à l’origine de cette demande ? Ignorez simplement cet e-mail.",
    });
}

function identityHtml(copy: ReturnType<typeof identityCopy>, href: string): string {
  const subject = escapeHtml(copy.subject);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="margin:0;background:#f2f0eb;color:#111"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(copy.body)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f0eb;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dedbd4"><tr><td style="background:#0a0a0a;color:#fff;padding:24px 28px;font:600 16px Arial,sans-serif;letter-spacing:.2em">AJ LUXURY</td></tr><tr><td style="padding:40px 28px 36px"><p style="margin:0 0 14px;color:#6a665f;font:600 11px Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase">Espace client</p><h1 style="margin:0 0 18px;color:#111;font:400 30px Arial,sans-serif;line-height:1.2">${escapeHtml(copy.heading)}</h1><p style="margin:0 0 28px;color:#333;font:15px Arial,sans-serif;line-height:1.65">${escapeHtml(copy.body)}</p><p style="margin:0 0 30px"><a href="${href}" style="display:inline-block;background:#0a0a0a;color:#fff;padding:15px 22px;font:600 13px Arial,sans-serif;letter-spacing:.08em;text-decoration:none">${escapeHtml(copy.action)}</a></p><p style="margin:0;color:#77726a;font:13px Arial,sans-serif;line-height:1.55">${escapeHtml(copy.note)}</p></td></tr><tr><td style="padding:20px 28px;border-top:1px solid #e8e5df;color:#77726a;font:12px Arial,sans-serif;line-height:1.5">AJ Luxury · ajluxurystore.com</td></tr></table></td></tr></table></body></html>`;
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
    const copy = identityCopy(input.purpose);
    const text = [
      "AJ LUXURY",
      "",
      copy.heading,
      copy.body,
      "",
      `${copy.action} : ${accessUrl.toString()}`,
      "",
      copy.note,
      "",
      "ajluxurystore.com",
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
        subject: copy.subject,
        text,
        html: identityHtml(copy, href),
        tags: [{ name: "kind", value: input.purpose }],
      }),
    });
    if (!response.ok) {
      throw new Error("Identity email provider rejected the request.");
    }
  }
}
