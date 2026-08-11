import { deepFreeze } from "../deep-freeze.ts";

export type DemoDestinationCode = "FR" | "CA";

export type DemoAddress = Readonly<{
  label: string;
  line1: string;
  city: string;
  region?: string;
  postalCode: string;
  countryCode: DemoDestinationCode;
  countryName: string;
}>;

export type DemoShippingOption = Readonly<{
  destination: DemoDestinationCode;
  carrier: "DHL Express";
  simulationLabel: "SIMULATION";
  priceCents: number;
  leadTime: string;
  customsTerm: "Taxes incluses" | "DAP";
  customsNote: string;
}>;

export type DemoJourneyLine = Readonly<{
  productName: "Apollon";
  colorName: "Pourpre Impérial";
  size: "M";
  quantity: 1;
  unitPriceCents: 2999;
  imageUrl: "/images/client/raw/product-card-pourpre.webp";
  productUrl: "/products/pourpre";
}>;

export type DemoOrderTimelineStep = Readonly<{
  label: string;
  detail: string;
  state: "complete" | "current";
}>;

export type CustomerJourneySnapshot = Readonly<{
  customer: Readonly<{
    id: "customer_demo_alex";
    firstName: "Alex";
    lastName: "Martin";
    email: "alex.martin@example.com";
    accountLabel: "Compte client fictif";
  }>;
  addresses: Readonly<Record<DemoDestinationCode, DemoAddress>>;
  shippingOptions: Readonly<Record<DemoDestinationCode, DemoShippingOption>>;
  line: DemoJourneyLine;
  payment: Readonly<{
    label: "Carte de démonstration";
    maskedCard: "•••• 4242";
    state: "Paiement simulé accepté";
  }>;
  order: Readonly<{
    id: "order_demo_1042";
    number: "AJ-DEMO-1042";
    shipmentId: "shipment_demo_1042";
    trackingReference: "DEMO-DHL-1042";
    placedAt: "11 août 2026 à 14:20";
    status: "Livraison simulée";
    timeline: readonly DemoOrderTimelineStep[];
  }>;
  returnRequest: Readonly<{
    number: "RET-DEMO-1042";
    reason: "La taille ne convient pas";
    status: "Retour simulé accepté";
  }>;
  refund: Readonly<{
    amountCents: 2999;
    status: "Remboursement simulé validé";
    destination: "Carte •••• 4242";
  }>;
}>;

export const customerJourneyFixture: CustomerJourneySnapshot = deepFreeze({
  customer: {
    id: "customer_demo_alex",
    firstName: "Alex",
    lastName: "Martin",
    email: "alex.martin@example.com",
    accountLabel: "Compte client fictif",
  },
  addresses: {
    FR: {
      label: "Adresse fictive en France",
      line1: "1 rue de la Préproduction",
      postalCode: "75008",
      city: "Paris",
      countryCode: "FR",
      countryName: "France",
    },
    CA: {
      label: "Adresse fictive au Canada",
      line1: "1 Demo Avenue",
      postalCode: "M5V 2T6",
      city: "Toronto",
      region: "ON",
      countryCode: "CA",
      countryName: "Canada",
    },
  },
  shippingOptions: {
    FR: {
      destination: "FR",
      carrier: "DHL Express",
      simulationLabel: "SIMULATION",
      priceCents: 790,
      leadTime: "2 à 3 jours ouvrés",
      customsTerm: "Taxes incluses",
      customsNote: "Aucune formalité douanière simulée pour cette destination.",
    },
    CA: {
      destination: "CA",
      carrier: "DHL Express",
      simulationLabel: "SIMULATION",
      priceCents: 1890,
      leadTime: "3 à 5 jours ouvrés",
      customsTerm: "DAP",
      customsNote:
        "Simulation DAP : droits et taxes à l’import à régler par le destinataire s’ils s’appliquent.",
    },
  },
  line: {
    productName: "Apollon",
    colorName: "Pourpre Impérial",
    size: "M",
    quantity: 1,
    unitPriceCents: 2999,
    imageUrl: "/images/client/raw/product-card-pourpre.webp",
    productUrl: "/products/pourpre",
  },
  payment: {
    label: "Carte de démonstration",
    maskedCard: "•••• 4242",
    state: "Paiement simulé accepté",
  },
  order: {
    id: "order_demo_1042",
    number: "AJ-DEMO-1042",
    shipmentId: "shipment_demo_1042",
    trackingReference: "DEMO-DHL-1042",
    placedAt: "11 août 2026 à 14:20",
    status: "Livraison simulée",
    timeline: [
      {
        label: "Commande confirmée",
        detail: "11 août 2026, 14:20",
        state: "complete",
      },
      {
        label: "Paiement simulé accepté",
        detail: "Carte de démonstration •••• 4242",
        state: "complete",
      },
      {
        label: "Préparation simulée",
        detail: "Article contrôlé et colis préparé",
        state: "complete",
      },
      {
        label: "Expédition simulée",
        detail: "DHL Express · DEMO-DHL-1042",
        state: "complete",
      },
      {
        label: "Livraison simulée",
        detail: "Parcours de démonstration terminé",
        state: "current",
      },
    ],
  },
  returnRequest: {
    number: "RET-DEMO-1042",
    reason: "La taille ne convient pas",
    status: "Retour simulé accepté",
  },
  refund: {
    amountCents: 2999,
    status: "Remboursement simulé validé",
    destination: "Carte •••• 4242",
  },
});

export function formatDemoEuros(amountCents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

export function totalForDestination(
  destination: DemoDestinationCode,
): number {
  return (
    customerJourneyFixture.line.unitPriceCents +
    customerJourneyFixture.shippingOptions[destination].priceCents
  );
}

export function demoDestinationFrom(
  value: string | undefined,
): DemoDestinationCode {
  return value === "CA" ? "CA" : "FR";
}

export function demoDestinationHref(
  pathname: string,
  destination: DemoDestinationCode,
): string {
  return `${pathname}?destination=${destination}`;
}
