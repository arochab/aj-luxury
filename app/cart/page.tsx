import Link from "next/link";
import DemoPageFrame from "../components/demo/DemoPageFrame";
import {
  formatDemoEuros,
} from "@/lib/demo/customer-journey";
import { syntheticCustomerJourneySource } from "@/lib/demo/customer-journey-source";
import styles from "../components/demo/DemoJourney.module.css";

export const metadata = {
  title: "Panier simulé | AJ Luxury",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CartPage() {
  const journey = await syntheticCustomerJourneySource.read();

  return (
    <DemoPageFrame step="01 · Panier">
      <div className={styles.demoPage}>
        <header className={styles.pageHeading}>
          <p className={styles.eyebrow}>Votre sélection · Simulation</p>
          <h1>Panier</h1>
          <p>
            Un article fictif est prêt pour tester la livraison, le paiement, le suivi et le retour de bout en bout.
          </p>
        </header>

        <div className={styles.orderGrid}>
          <section className={styles.orderPanel} aria-labelledby="cart-product-title">
            <div className={styles.cardTopline}>
              <span>Article 01</span>
              <span className={styles.statePill}>En stock · simulation</span>
            </div>
            <div className={styles.returnLine}>
              {/* eslint-disable-next-line @next/next/no-img-element -- retained local optimized product asset */}
              <img src={journey.line.imageUrl} alt="Boxer Apollon Pourpre Impérial" />
              <div>
                <h2 id="cart-product-title">{journey.line.productName}</h2>
                <span>{journey.line.colorName} · Taille {journey.line.size} · Qté {journey.line.quantity}</span>
              </div>
              <strong>{formatDemoEuros(journey.line.unitPriceCents)}</strong>
            </div>
            <div className={styles.cardActions}>
              <Link className={styles.textButton} href={journey.line.productUrl}>Modifier la sélection</Link>
            </div>
          </section>

          <aside className={styles.orderPanel} aria-label="Total du panier simulé">
            <p className={styles.eyebrow}>Récapitulatif</p>
            <h2>Total provisoire</h2>
            <dl className={styles.orderFacts}>
              <div><dt>Sous-total</dt><dd>{formatDemoEuros(journey.line.unitPriceCents)}</dd></div>
              <div><dt>Livraison</dt><dd>Calculée à l’étape suivante</dd></div>
            </dl>
            <Link className={styles.primaryButton} href="/checkout">Continuer vers la livraison</Link>
            <p className={styles.summarySafety}>
              Aucun stock n’est réservé et aucune commande ne sera enregistrée.
            </p>
          </aside>
        </div>
      </div>
    </DemoPageFrame>
  );
}
