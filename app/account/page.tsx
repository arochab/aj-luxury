import Link from "next/link";
import DemoPageFrame from "../components/demo/DemoPageFrame";
import {
  demoDestinationFrom,
  demoDestinationHref,
  formatDemoEuros,
  totalForDestination,
} from "@/lib/demo/customer-journey";
import { syntheticCustomerJourneySource } from "@/lib/demo/customer-journey-source";
import styles from "../components/demo/DemoJourney.module.css";

export const metadata = {
  title: "Compte client fictif | AJ Luxury",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AccountPageProps = {
  searchParams: Promise<{ destination?: string }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const journey = await syntheticCustomerJourneySource.read();
  const destination = demoDestinationFrom((await searchParams).destination);
  const address = journey.addresses[destination];

  return (
    <DemoPageFrame step="04 · Compte client">
      <div className={styles.accountLayout}>
        <section className={styles.profilePanel} aria-labelledby="account-title">
          <div className={styles.profileAvatar} aria-hidden="true">AM</div>
          <p className={styles.eyebrow}>{journey.customer.accountLabel}</p>
          <h1 id="account-title">Bonjour Alex</h1>
          <div className={styles.profileMeta}>
            <strong>{journey.customer.firstName} {journey.customer.lastName}</strong>
            <span>{journey.customer.email}</span>
            <span>Identité entièrement fictive</span>
          </div>
        </section>

        <div className={styles.accountCards}>
          <article className={styles.accountCard}>
            <div className={styles.cardTopline}>
              <span>Dernière commande · {journey.order.placedAt}</span>
              <span className={styles.statePill}>{journey.order.status}</span>
            </div>
            <h2>{journey.order.number}</h2>
            <p>
              {journey.line.productName} {journey.line.colorName} · Taille {journey.line.size}<br />
              Total simulé {address.countryName} : {formatDemoEuros(totalForDestination(destination))}
            </p>
            <div className={styles.cardActions}>
              <Link className={styles.primaryButton} href={demoDestinationHref(`/account/orders/${journey.order.number}`, destination)}>Voir la commande</Link>
              <Link className={styles.textButton} href={demoDestinationHref("/return", destination)}>Simuler un retour</Link>
            </div>
          </article>

          <article className={styles.accountCard}>
            <div className={styles.cardTopline}>
              <span>Adresse par défaut</span>
              <span className={styles.statePill}>Fictive</span>
            </div>
            <h2>{address.countryName}</h2>
            <p>
              {journey.customer.firstName} {journey.customer.lastName}<br />
              {address.line1}<br />
              {address.postalCode} {address.city}
            </p>
          </article>

          <article className={styles.accountCard}>
            <div className={styles.cardTopline}>
              <span>Sécurité et données</span>
              <span className={styles.statePill}>Simulation privée</span>
            </div>
            <h2>Aucun accès réel</h2>
            <p>
              Ce compte ne possède ni mot de passe, ni session, ni données persistées. Il sert uniquement à éprouver l’interface avant connexion au backend accepté.
            </p>
          </article>
        </div>
      </div>
    </DemoPageFrame>
  );
}
