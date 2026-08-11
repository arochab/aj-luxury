import Link from "next/link";
import DemoPageFrame from "../components/demo/DemoPageFrame";
import {
  demoDestinationFrom,
  demoDestinationHref,
  formatDemoEuros,
} from "@/lib/demo/customer-journey";
import { syntheticCustomerJourneySource } from "@/lib/demo/customer-journey-source";
import styles from "../components/demo/DemoJourney.module.css";

export const metadata = {
  title: "Remboursement simulé | AJ Luxury",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DemoRefundPageProps = {
  searchParams: Promise<{ destination?: string }>;
};

export default async function DemoRefundPage({ searchParams }: DemoRefundPageProps) {
  const journey = await syntheticCustomerJourneySource.read();
  const destination = demoDestinationFrom((await searchParams).destination);

  return (
    <DemoPageFrame step="07 · Remboursement">
      <section className={styles.successPanel}>
        <span className={styles.successMark} aria-hidden="true">✓</span>
        <p className={styles.eyebrow}>Référence {journey.returnRequest.number}</p>
        <h1>{journey.refund.status}</h1>
        <p>
          Cette confirmation clôt uniquement le scénario de présentation. Aucun remboursement réel n’a été émis.
        </p>
        <div className={styles.refundBreakdown}>
          <p className={styles.eyebrow}>Montant fictif</p>
          <strong className={styles.refundAmount}>{formatDemoEuros(journey.refund.amountCents)}</strong>
          <dl className={styles.orderFacts}>
            <div><dt>Destination simulée</dt><dd>{journey.refund.destination}</dd></div>
            <div><dt>Commande</dt><dd>{journey.order.number}</dd></div>
            <div><dt>Retour</dt><dd>{journey.returnRequest.number}</dd></div>
          </dl>
        </div>
        <div className={styles.actionRow}>
          <Link className={styles.primaryButton} href={demoDestinationHref("/account", destination)}>Retour au compte fictif</Link>
          <Link className={styles.textButton} href="/demo-control">Revoir le parcours</Link>
        </div>
      </section>
    </DemoPageFrame>
  );
}
