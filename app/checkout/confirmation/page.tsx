import Link from "next/link";
import DemoPageFrame from "../../components/demo/DemoPageFrame";
import {
  demoDestinationFrom,
  demoDestinationHref,
  formatDemoEuros,
  totalForDestination,
} from "@/lib/demo/customer-journey";
import { syntheticCustomerJourneySource } from "@/lib/demo/customer-journey-source";
import styles from "../../components/demo/DemoJourney.module.css";

export const metadata = {
  title: "Commande simulée confirmée | AJ Luxury",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ConfirmationPageProps = {
  searchParams: Promise<{ destination?: string }>;
};

export default async function ConfirmationPage({
  searchParams,
}: ConfirmationPageProps) {
  const journey = await syntheticCustomerJourneySource.read();
  const destination = demoDestinationFrom((await searchParams).destination);
  const address = journey.addresses[destination];
  const shipping = journey.shippingOptions[destination];

  return (
    <DemoPageFrame step="03 · Confirmation">
      <section className={styles.successPanel}>
        <span className={styles.successMark} aria-hidden="true">✓</span>
        <p className={styles.eyebrow}>Commande de démonstration confirmée</p>
        <h1>Merci Alex</h1>
        <p>
          La simulation <strong>{journey.order.number}</strong> illustre une commande complète. Aucun débit, e-mail, stock ou envoi réel n’a été déclenché.
        </p>

        <div className={styles.refundBreakdown}>
          <div className={styles.cardTopline}>
            <span>Récapitulatif</span>
            <span className={styles.statePill}>SIMULATION</span>
          </div>
          <dl className={styles.orderFacts}>
            <div><dt>Article</dt><dd>{journey.line.productName} · {journey.line.colorName} · {journey.line.size}</dd></div>
            <div><dt>Destination fictive</dt><dd>{address.city}, {address.countryName}</dd></div>
            <div><dt>Livraison simulée</dt><dd>{shipping.carrier} · {shipping.leadTime}</dd></div>
            <div><dt>Douanes</dt><dd>{shipping.customsTerm}</dd></div>
            <div><dt>Total simulé</dt><dd>{formatDemoEuros(totalForDestination(destination))}</dd></div>
          </dl>
        </div>

        <div className={styles.actionRow}>
          <Link className={styles.primaryButton} href={demoDestinationHref(`/account/orders/${journey.order.number}`, destination)}>Suivre la commande</Link>
          <Link className={styles.textButton} href={demoDestinationHref("/account", destination)}>Voir le compte fictif</Link>
        </div>
      </section>
    </DemoPageFrame>
  );
}
