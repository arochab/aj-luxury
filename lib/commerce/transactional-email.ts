export const transactionalEmailKinds = Object.freeze([
  "order-confirmation",
  "payment-confirmation",
  "shipment-confirmation",
  "withdrawal-acknowledgement",
  "refund-confirmation",
  "account-access",
] as const);

export type TransactionalEmailKind = (typeof transactionalEmailKinds)[number];

export type TransactionalEmailInput = {
  kind: TransactionalEmailKind;
  eventId: string;
  locale: "fr" | "en";
  recipientEmail: string;
  orderNumber?: string;
  trackingUrl?: string;
  accessUrl?: string;
};

export type TransactionalEmail = {
  deduplicationKey: string;
  recipientEmail: string;
  subject: string;
  text: string;
};

const transactionalEmailKindSet = new Set<string>(transactionalEmailKinds);
const supportedLocaleSet = new Set<string>(["fr", "en"]);
const safeEventId = /^[a-z0-9][a-z0-9_.-]{0,127}$/i;
const safeOrderNumber = /^AJ-[A-Z0-9][A-Z0-9-]{0,31}$/;
const safeAccessToken = /^[A-Za-z0-9_-]{43}$/;
const ajAccountAccessOrigin = "https://ajluxurystore.com";
const ajAccountAccessPath = "/account/access";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing transactional email field: ${field}`);
  }
  return value.trim();
}

function requireIdentifier(
  value: unknown,
  field: string,
  pattern: RegExp,
): string {
  const normalized = requireValue(value, field);
  if (!pattern.test(normalized)) {
    throw new Error(`Invalid transactional email field: ${field}`);
  }
  return normalized;
}

function requireAjAccountAccessUrl(value: unknown): string {
  const raw = requireValue(value, "accessUrl");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid transactional email field: accessUrl");
  }

  const queryKeys = [...url.searchParams.keys()];
  const token = url.searchParams.get("token") ?? "";
  if (
    url.origin !== ajAccountAccessOrigin ||
    url.pathname !== ajAccountAccessPath ||
    Boolean(url.username) ||
    Boolean(url.password) ||
    Boolean(url.hash) ||
    queryKeys.length !== 1 ||
    queryKeys[0] !== "token" ||
    !safeAccessToken.test(token)
  ) {
    throw new Error("Invalid transactional email field: accessUrl");
  }
  return url.toString();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function fingerprintRecipient(recipient: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(recipient),
  );
  return bytesToHex(new Uint8Array(digest));
}

export function buildTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmail>;
export async function buildTransactionalEmail(
  input: unknown,
): Promise<TransactionalEmail> {
  if (!isRecord(input)) {
    throw new Error("Invalid transactional email input.");
  }
  if (
    typeof input.kind !== "string" ||
    !transactionalEmailKindSet.has(input.kind)
  ) {
    throw new Error("Invalid transactional email field: kind");
  }
  if (
    typeof input.locale !== "string" ||
    !supportedLocaleSet.has(input.locale)
  ) {
    throw new Error("Invalid transactional email field: locale");
  }

  const kind = input.kind as TransactionalEmailKind;
  const locale = input.locale as "fr" | "en";
  const eventId = requireIdentifier(input.eventId, "eventId", safeEventId);
  const recipient = requireValue(input.recipientEmail, "recipientEmail")
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("Invalid transactional email recipient.");
  }
  const recipientFingerprint = await fingerprintRecipient(recipient);

  if (kind === "account-access") {
    const accessUrl = requireAjAccountAccessUrl(input.accessUrl);
    return {
      deduplicationKey: `${kind}:${eventId}:${recipientFingerprint}`,
      recipientEmail: recipient,
      subject:
        locale === "fr"
          ? "Votre accès sécurisé AJ Luxury"
          : "Your secure AJ Luxury access",
      text:
        locale === "fr"
          ? `Utilisez ce lien à usage unique pour accéder à votre compte AJ Luxury : ${accessUrl}`
          : `Use this one-time link to access your AJ Luxury account: ${accessUrl}`,
    };
  }

  if (kind === "shipment-confirmation") {
    throw new Error(
      "Shipment tracking email is unavailable until a server-owned carrier policy is configured.",
    );
  }

  const orderNumber = requireIdentifier(
    input.orderNumber,
    "orderNumber",
    safeOrderNumber,
  );
  const copyByKind = {
    "order-confirmation": {
      frSubject: "Commande reçue",
      enSubject: "Order received",
      frLine: "Nous avons bien reçu votre commande",
      enLine: "We have received your order",
    },
    "payment-confirmation": {
      frSubject: "Paiement confirmé",
      enSubject: "Payment confirmed",
      frLine: "Votre paiement est confirmé pour la commande",
      enLine: "Your payment is confirmed for order",
    },
    "refund-confirmation": {
      frSubject: "Remboursement confirmé",
      enSubject: "Refund confirmed",
      frLine: "Votre remboursement est confirmé pour la commande",
      enLine: "Your refund is confirmed for order",
    },
    "withdrawal-acknowledgement": {
      frSubject: "Demande de rétractation reçue",
      enSubject: "Withdrawal request received",
      frLine: "Nous avons reçu votre demande de rétractation pour la commande",
      enLine: "We have received your withdrawal request for order",
    },
  } as const;

  const copy = copyByKind[kind];
  const subjectPrefix = locale === "fr" ? copy.frSubject : copy.enSubject;
  const line = locale === "fr" ? copy.frLine : copy.enLine;

  return {
    deduplicationKey: `${kind}:${eventId}:${orderNumber}:${recipientFingerprint}`,
    recipientEmail: recipient,
    subject: `${subjectPrefix} ${orderNumber}`,
    text: `${line} ${orderNumber}.`,
  };
}
