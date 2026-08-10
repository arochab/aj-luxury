export const transactionalEmailKinds = [
  "order-confirmation",
  "payment-confirmation",
  "shipment-confirmation",
  "withdrawal-acknowledgement",
  "refund-confirmation",
  "account-access",
] as const;

export type TransactionalEmailKind = (typeof transactionalEmailKinds)[number];

export type TransactionalEmailInput = {
  kind: TransactionalEmailKind;
  eventId: string;
  locale: "fr" | "en";
  recipientEmail: string;
  orderNumber?: string;
  trackingUrl?: string;
  accessUrl?: string;
  allowedUrlHosts?: readonly string[];
};

export type TransactionalEmail = {
  deduplicationKey: string;
  recipientEmail: string;
  subject: string;
  text: string;
};

function requireValue(value: string | undefined, field: string): string {
  if (!value?.trim()) throw new Error(`Missing transactional email field: ${field}`);
  return value.trim();
}

const safeEventId = /^[a-z0-9][a-z0-9_.-]{0,127}$/i;
const safeOrderNumber = /^AJ-[A-Z0-9][A-Z0-9-]{0,31}$/;

function requireIdentifier(
  value: string | undefined,
  field: string,
  pattern: RegExp,
): string {
  const normalized = requireValue(value, field);
  if (!pattern.test(normalized)) {
    throw new Error(`Invalid transactional email field: ${field}`);
  }
  return normalized;
}

function requireSecureUrl(
  value: string | undefined,
  field: string,
  allowedHosts: readonly string[] | undefined,
): string {
  const raw = requireValue(value, field);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid transactional email field: ${field}`);
  }
  const hosts = new Set(
    (allowedHosts ?? []).map((host) => host.trim().toLowerCase()).filter(Boolean),
  );
  if (
    url.protocol !== "https:" ||
    Boolean(url.username) ||
    Boolean(url.password) ||
    !hosts.has(url.hostname.toLowerCase())
  ) {
    throw new Error(`Invalid transactional email field: ${field}`);
  }
  return url.toString();
}

function orderCopy(
  input: TransactionalEmailInput,
  french: string,
  english: string,
): { orderNumber: string; line: string } {
  const orderNumber = requireIdentifier(
    input.orderNumber,
    "orderNumber",
    safeOrderNumber,
  );
  return { orderNumber, line: input.locale === "fr" ? french : english };
}

export function buildTransactionalEmail(
  input: TransactionalEmailInput,
): TransactionalEmail {
  const eventId = requireIdentifier(input.eventId, "eventId", safeEventId);
  const recipient = input.recipientEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("Invalid transactional email recipient.");
  }

  if (input.kind === "account-access") {
    const accessUrl = requireSecureUrl(
      input.accessUrl,
      "accessUrl",
      input.allowedUrlHosts,
    );
    return {
      deduplicationKey: `${input.kind}:${eventId}`,
      recipientEmail: recipient,
      subject:
        input.locale === "fr"
          ? "Votre accès sécurisé AJ Luxury"
          : "Your secure AJ Luxury access",
      text:
        input.locale === "fr"
          ? `Utilisez ce lien à usage unique pour accéder à votre compte AJ Luxury : ${accessUrl}`
          : `Use this one-time link to access your AJ Luxury account: ${accessUrl}`,
    };
  }

  if (input.kind === "shipment-confirmation") {
    const { orderNumber } = orderCopy(input, "", "");
    const trackingUrl = requireSecureUrl(
      input.trackingUrl,
      "trackingUrl",
      input.allowedUrlHosts,
    );
    return {
      deduplicationKey: `${input.kind}:${eventId}`,
      recipientEmail: recipient,
      subject:
        input.locale === "fr"
          ? `Votre commande ${orderNumber} a été expédiée`
          : `Your order ${orderNumber} has shipped`,
      text:
        input.locale === "fr"
          ? `Votre commande ${orderNumber} a été expédiée. Suivez-la ici : ${trackingUrl}`
          : `Your order ${orderNumber} has shipped. Track it here: ${trackingUrl}`,
    };
  }

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

  const copy = copyByKind[input.kind];
  const { orderNumber } = orderCopy(input, copy.frLine, copy.enLine);
  const subjectPrefix = input.locale === "fr" ? copy.frSubject : copy.enSubject;
  const line = input.locale === "fr" ? copy.frLine : copy.enLine;

  return {
    deduplicationKey: `${input.kind}:${eventId}`,
    recipientEmail: recipient,
    subject: `${subjectPrefix} ${orderNumber}`,
    text: `${line} ${orderNumber}.`,
  };
}
