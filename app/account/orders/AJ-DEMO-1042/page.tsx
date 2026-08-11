import Link from "next/link";
import DhlSimulationMark from "../../../components/demo/DhlSimulationMark";
import DemoOrderTimeline from "../../../components/demo/DemoOrderTimeline";
import DemoPageFrame from "../../../components/demo/DemoPageFrame";
import {
  demoDestinationFrom,
  demoDestinationHref,
  formatDemoEuros,
  totalForDestination,
} from "@/lib/demo/customer-journey";
import { syntheticCustomerJourneySource } from "@/lib/demo/customer-journey-source";
import styles from "../../../components/demo/DemoJourney.module.css";

export const metadata = {
  title: "Commande AJ-DEMO-1042 | AJ Luxury",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DemoOrderPageProps = {
  searchParams: Promise<{ destination?: string }>;
};

export default async function DemoOrderPage({ searchParams }: DemoOrderPageProps) {
  const journey = await syntheticCustomerJourneySource.read();
  const destination = demoDestinationFrom((await searchParams).destination);
  const address = journey.addresses[destination];
  const shipping = journey.shippingOptions[destination];

  return (
    <DemoPageFrame step="05 · Suivi de commande">
      <div className={styles.orderDetail}>
        <header className={styles.orderDetailHeader}>
          <div>
            <p className={styles.eyebrow}>Commande fictive · {journey.order.placedAt}</p>
            <h1>{journey.order.number}</h1>
          </div>
          <span className={styles.statePill}>{journey.order.status}</span>
        </header>

        <div className={styles.orderGrid}>
          <div className={styles.orderStack}>
            <section className={styles.trackingPanel} aria-labelledby="tracking-title">
              <div id="tracking-title"><DhlSimulationMark /></div>
              <strong className={styles.trackingReference}>{journey.order.trackingReference}</strong>
              <p>
                DHL est montré uniquement comme transporteur hypothétique.
                Aucun service DHL n’est connecté et aucun partenariat n’est
                revendiqué.
              </p>
            </section>

            <section className={styles.orderPanel} aria-labelledby="timeline-title">
              <div className={styles.orderPanelTop}>
                <span>Suivi</span>
                <span>Colis {journey.order.shipmentId}</span>
              </div>
              <h2 id="timeline-title">Parcours du colis</h2>
              <DemoOrderTimeline timeline={journey.order.timeline} />
            </section>
          </div>

          <aside className={styles.orderStack}>
            <section className={styles.orderPanel}>
              <div className={styles.orderPanelTop}><span>Commande</span><span className={styles.statePill}>Payée · simulation</span></div>
              <h2>{journey.line.productName}</h2>
              <dl className={styles.orderFacts}>
                <div><dt>Article</dt><dd>{journey.line.colorName} · {journey.line.size}</dd></div>
                <div><dt>Quantité</dt><dd>{journey.line.quantity}</dd></div>
                <div><dt>Paiement</dt><dd>{journey.payment.maskedCard}</dd></div>
                <div><dt>Douanes</dt><dd>{shipping.customsTerm}</dd></div>
                <div><dt>Total simulé</dt><dd>{formatDemoEuros(totalForDestination(destination))}</dd></div>
              </dl>
            </section>

            <section className={styles.orderPanel}>
              <div className={styles.orderPanelTop}><span>Livraison fictive</span><span>{address.countryCode}</span></div>
              <h2>{address.city}</h2>
              <p>
                {journey.customer.firstName} {journey.customer.lastName}<br />
                {address.line1}<br />
                {address.postalCode} {address.city}<br />
                {address.countryName}
              </p>
            </section>

            <section className={styles.orderPanel}>
              <p className={styles.eyebrow}>Après-vente</p>
              <h2>Besoin de retourner l’article ?</h2>
              <p>Le parcours de retour est lui aussi entièrement simulé et ne génère aucune étiquette.</p>
              <Link className={styles.primaryButton} href={demoDestinationHref("/return", destination)}>Simuler un retour</Link>
            </section>
          </aside>
        </div>
      </div>
    </DemoPageFrame>
  );
}
