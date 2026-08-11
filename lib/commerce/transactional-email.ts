export const transactionalEmailKinds = Object.freeze([
  "order-confirmation",
  "payment-confirmation",
  "shipment-confirmation",
  "return-acknowledgement",
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
  /** Deterministic candidate only; this builder does not reserve or persist it. */
  deduplicationKey: string;
  deduplicationPersisted: false;
  recipientEmail: string;
  subject: string;
  text: string;
};

export const transactionalEmailKindAvailability = Object.freeze({
  "order-confirmation": Object.freeze({ available: true } as const),
  "payment-confirmation": Object.freeze({ available: true } as const),
  "shipment-confirmation": Object.freeze({
    available: false,
    reason: "server-owned-carrier-policy-required",
  } as const),
  "return-acknowledgement": Object.freeze({ available: true } as const),
  "withdrawal-acknowledgement": Object.freeze({ available: true } as const),
  "refund-confirmation": Object.freeze({ available: true } as const),
  "account-access": Object.freeze({
    available: false,
    reason: "account-access-route-and-persistent-d1-token-store-required",
  } as const),
} as const);

const transactionalEmailKindSet = new Set<string>(transactionalEmailKinds);
const supportedLocaleSet = new Set<string>(["fr", "en"]);
const safeEventId = /^[a-z0-9][a-z0-9_.-]{0,127}$/i;
const safeOrderNumber = /^AJ-[A-Z0-9][A-Z0-9-]{0,31}$/;
const transactionalEmailInputKeys = new Set([
  "kind",
  "eventId",
  "locale",
  "recipientEmail",
  "orderNumber",
  "trackingUrl",
  "accessUrl",
]);

type TransactionalEmailSnapshot = {
  kind: unknown;
  eventId: unknown;
  locale: unknown;
  recipientEmail: unknown;
  orderNumber: unknown;
  trackingUrl: unknown;
  accessUrl: unknown;
};

function snapshotTransactionalEmailInput(
  input: unknown,
): TransactionalEmailSnapshot | null {
  if (typeof input !== "object" || input === null) return null;

  try {
    if (Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
      return null;
    }

    const descriptors = new Map<string, PropertyDescriptor>();
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== "string" || !transactionalEmailInputKeys.has(key)) {
        return null;
      }

      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (
        !descriptor ||
        !("value" in descriptor) ||
        !descriptor.enumerable ||
        (descriptor.value !== undefined && typeof descriptor.value !== "string")
      ) {
        return null;
      }
      descriptors.set(key, descriptor);
    }

    // All accepted own values are primitive data properties, so this clone
    // cannot execute an accessor. It rejects transparent and revoked Proxies.
    structuredClone(input);

    return {
      kind: descriptors.get("kind")?.value,
      eventId: descriptors.get("eventId")?.value,
      locale: descriptors.get("locale")?.value,
      recipientEmail: descriptors.get("recipientEmail")?.value,
      orderNumber: descriptors.get("orderNumber")?.value,
      trackingUrl: descriptors.get("trackingUrl")?.value,
      accessUrl: descriptors.get("accessUrl")?.value,
    };
  } catch {
    return null;
  }
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

function isStrictMailboxAddress(value: string): boolean {
  if (value.length > 254) return false;

  const atIndex = value.indexOf("@");
  if (atIndex < 1 || atIndex !== value.lastIndexOf("@")) return false;

  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(localPart)
  ) {
    return false;
  }

  const labels = domain.split(".");
  if (
    domain.length > 253 ||
    labels.length < 2 ||
    !labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
    ) ||
    !/^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/.test(labels.at(-1)!)
  ) {
    return false;
  }

  return true;
}

function requireStrictMailboxAddress(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Missing transactional email field: recipientEmail");
  }

  // Validate the raw caller string before trimming or case normalization.
  // This excludes Unicode lookalikes, non-ASCII whitespace and control bytes.
  if (!/^[\x20-\x7e]+$/.test(value)) {
    throw new Error("Invalid transactional email recipient.");
  }

  const mailbox = value.replace(/^ +| +$/g, "");
  if (!isStrictMailboxAddress(mailbox)) {
    throw new Error("Invalid transactional email recipient.");
  }

  const atIndex = mailbox.indexOf("@");
  const localPart = mailbox.slice(0, atIndex);
  const domain = mailbox.slice(atIndex + 1).toLowerCase();
  return `${localPart}@${domain}`;
}

export function buildTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmail>;
export async function buildTransactionalEmail(
  input: unknown,
): Promise<TransactionalEmail> {
  const snapshot = snapshotTransactionalEmailInput(input);
  if (!snapshot) {
    throw new Error("Invalid transactional email input.");
  }
  if (
    typeof snapshot.kind !== "string" ||
    !transactionalEmailKindSet.has(snapshot.kind)
  ) {
    throw new Error("Invalid transactional email field: kind");
  }
  if (
    typeof snapshot.locale !== "string" ||
    !supportedLocaleSet.has(snapshot.locale)
  ) {
    throw new Error("Invalid transactional email field: locale");
  }

  const kind = snapshot.kind as TransactionalEmailKind;
  const locale = snapshot.locale as "fr" | "en";

  if (kind === "account-access") {
    throw new Error(
      "Account access email is unavailable until the account-access route and persistent D1 token store are implemented.",
    );
  }

  if (kind === "shipment-confirmation") {
    throw new Error(
      "Shipment tracking email is unavailable until a server-owned carrier policy is configured.",
    );
  }

  const eventId = requireIdentifier(snapshot.eventId, "eventId", safeEventId);
  const recipient = requireStrictMailboxAddress(snapshot.recipientEmail);
  const recipientFingerprint = await fingerprintRecipient(recipient);
  const orderNumber = requireIdentifier(
    snapshot.orderNumber,
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
    "return-acknowledgement": {
      frSubject: "Demande de retour re\u00e7ue",
      enSubject: "Return request received",
      frLine: "Nous avons re\u00e7u votre demande de retour pour la commande",
      enLine: "We have received your return request for order",
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
    deduplicationPersisted: false,
    recipientEmail: recipient,
    subject: `${subjectPrefix} ${orderNumber}`,
    text: `${line} ${orderNumber}.`,
  };
}
