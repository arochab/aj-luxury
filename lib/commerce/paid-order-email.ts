export type PaidOrderEmailLine = Readonly<{
  productName: string;
  colorName: string;
  size: string;
  quantity: number;
  lineTotalCents: number;
}>;

export type PaidOrderEmailSnapshot = Readonly<{
  orderNumber: string;
  lines: readonly PaidOrderEmailLine[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  deliveryName: string;
  deliveryMode: "home" | "service_point";
  deliveryAddressLines: readonly string[];
  termsVersion: string;
}>;

export type PaidOrderEmailKind = "order-confirmation" | "payment-confirmation";

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid paid-order amount.");
  return euro.format(cents / 100).replace(/\u202f/g, " ").replace(/\u00a0/g, " ");
}

function safeText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`Invalid paid-order field: ${field}.`);
  }
  return normalized;
}

export function buildPaidOrderEmail(
  kind: PaidOrderEmailKind,
  snapshot: PaidOrderEmailSnapshot,
): Readonly<{ subject: string; text: string }> {
  const orderNumber = safeText(snapshot.orderNumber, "orderNumber");
  const termsVersion = safeText(snapshot.termsVersion, "termsVersion");
  const deliveryName = safeText(snapshot.deliveryName, "deliveryName");
  if (
    !snapshot.lines.length ||
    !snapshot.deliveryAddressLines.length ||
    !["home", "service_point"].includes(snapshot.deliveryMode)
  ) {
    throw new Error("Invalid paid-order snapshot.");
  }
  const lineTotal = snapshot.lines.reduce((sum, line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new Error("Invalid paid-order line quantity.");
    }
    return sum + line.lineTotalCents;
  }, 0);
  if (
    lineTotal !== snapshot.subtotalCents + snapshot.discountCents ||
    snapshot.totalCents !== snapshot.subtotalCents + snapshot.shippingCents + snapshot.taxCents ||
    snapshot.taxCents !== 0
  ) throw new Error("Incoherent paid-order totals.");

  const title = kind === "order-confirmation" ? "Commande confirmée" : "Paiement confirmé";
  if (snapshot.termsVersion !== DURABLE_TERMS_VERSION) {
    throw new Error("Unsupported paid-order terms version.");
  }
  if (kind === "payment-confirmation") {
    return Object.freeze({
      subject: `${title} ${orderNumber}`,
      text: [
        `Le paiement de la commande ${orderNumber} est confirmé.`,
        `Montant payé : ${money(snapshot.totalCents)}`,
        "Votre commande passe en préparation. Vous recevrez le suivi dès sa remise au transporteur.",
        `TVA : ${money(snapshot.taxCents)}`,
        "TVA non applicable, article 293 B du Code général des impôts.",
        "Le récapitulatif détaillé et le snapshot des conditions acceptées sont conservés dans la confirmation de commande envoyée séparément.",
      ].join("\n"),
    });
  }
  const lines = snapshot.lines.map((line) =>
    `- ${safeText(line.productName, "productName")} · ${safeText(line.colorName, "colorName")} · Taille ${safeText(line.size, "size")} × ${line.quantity} — ${money(line.lineTotalCents)}`
  );
  const deliveryMode = snapshot.deliveryMode === "home" ? "À domicile" : "Point relais";
  const totals = [
    `Sous-total : ${money(snapshot.subtotalCents + snapshot.discountCents)}`,
    ...(snapshot.discountCents > 0 ? [`Remise pack : −${money(snapshot.discountCents)}`] : []),
    `Livraison (${deliveryName} · ${deliveryMode}) : ${money(snapshot.shippingCents)}`,
    `Adresse de livraison : ${snapshot.deliveryAddressLines.map((line) => safeText(line, "deliveryAddress")).join(", ")}`,
    `TVA : ${money(snapshot.taxCents)}`,
    `Total payé : ${money(snapshot.totalCents)}`,
  ];
  const termsUrl = `https://ajluxurystore.com/terms?version=${encodeURIComponent(termsVersion)}`;
  return Object.freeze({
    subject: `${title} ${orderNumber}`,
    text: [
      `${title} pour la commande ${orderNumber}.`,
      "",
      "Articles",
      ...lines,
      "",
      ...totals,
      "",
      "TVA non applicable, article 293 B du Code général des impôts.",
      `Conditions générales de vente, version ${termsVersion} : ${termsUrl}`,
      `Empreinte SHA-256 du snapshot contractuel : ${DURABLE_TERMS_SHA256}`,
      "",
      "SNAPSHOT CONTRACTUEL CONSERVÉ AVEC CETTE COMMANDE",
      DURABLE_TERMS_TEXT,
    ].join("\n"),
  });
}
import {
  DURABLE_TERMS_SHA256,
  DURABLE_TERMS_TEXT,
  DURABLE_TERMS_VERSION,
} from "../legal-terms-snapshot.ts";
