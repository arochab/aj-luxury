"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  CustomerJourneySnapshot,
  DemoDestinationCode,
} from "@/lib/demo/customer-journey";
import {
  formatDemoEuros,
} from "@/lib/demo/customer-journey";
import DemoSandboxPayment from "./DemoSandboxPayment";
import DemoShippingOption from "./DemoShippingOption";
import styles from "./DemoJourney.module.css";

type DemoCheckoutJourneyProps = {
  journey: CustomerJourneySnapshot;
};

export default function DemoCheckoutJourney({
  journey,
}: DemoCheckoutJourneyProps) {
  const router = useRouter();
  const [destination, setDestination] = useState<DemoDestinationCode>("FR");
  const address = journey.addresses[destination];
  const shipping = journey.shippingOptions[destination];
  const totalCents = journey.line.unitPriceCents + shipping.priceCents;

  function submitSimulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/checkout/confirmation?destination=${destination}`);
  }

  return (
    <form className={styles.checkoutGrid} onSubmit={submitSimulation}>
      <div className={styles.checkoutFlow}>
        <header className={styles.pageHeading}>
          <p className={styles.eyebrow}>Commande de démonstration</p>
          <h1>Livraison et paiement</h1>
          <p>
            Un parcours réaliste, entièrement fictif, pour valider l’expérience avant toute connexion à un prestataire.
          </p>
        </header>

        <section className={styles.sectionCard} aria-labelledby="identity-title">
          <div className={styles.sectionNumber}>01</div>
          <div className={styles.sectionContent}>
            <h2 id="identity-title">Coordonnées</h2>
            <div className={styles.formGrid}>
              <label>
                Prénom
                <input value={journey.customer.firstName} readOnly />
              </label>
              <label>
                Nom
                <input value={journey.customer.lastName} readOnly />
              </label>
            </div>
            <label>
              E-mail
              <input type="email" value={journey.customer.email} readOnly />
            </label>
            <p className={styles.fieldNote}>Identité et e-mail entièrement fictifs.</p>
          </div>
        </section>

        <section className={styles.sectionCard} aria-labelledby="destination-title">
          <div className={styles.sectionNumber}>02</div>
          <div className={styles.sectionContent}>
            <h2 id="destination-title">Destination</h2>
            <fieldset className={styles.destinationPicker}>
              <legend>Choisir un scénario de livraison</legend>
              {(["FR", "CA"] as const).map((code) => (
                <label key={code} className={styles.destinationChoice}>
                  <input
                    type="radio"
                    name="destination"
                    value={code}
                    checked={destination === code}
                    onChange={() => setDestination(code)}
                  />
                  <span>
                    <strong>{journey.addresses[code].countryName}</strong>
                    <small>{code === "FR" ? "Scénario Europe" : "Scénario international DAP"}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className={styles.addressPreview} aria-live="polite">
              <span>{address.label}</span>
              <strong>{journey.customer.firstName} {journey.customer.lastName}</strong>
              <p>
                {address.line1}<br />
                {address.postalCode} {address.city}{address.region ? `, ${address.region}` : ""}<br />
                {address.countryName}
              </p>
            </div>
          </div>
        </section>

        <section className={styles.sectionCard} aria-labelledby="shipping-title">
          <div className={styles.sectionNumber}>03</div>
          <div className={styles.sectionContent}>
            <h2 id="shipping-title">Livraison</h2>
            <DemoShippingOption option={shipping} />
          </div>
        </section>

        <section className={styles.sectionCard} aria-labelledby="payment-title">
          <div className={styles.sectionNumber}>04</div>
          <div className={styles.sectionContent}>
            <h2 id="payment-title">Paiement</h2>
            <DemoSandboxPayment payment={journey.payment} />
          </div>
        </section>
      </div>

      <aside className={styles.orderSummary} aria-label="Récapitulatif de la commande">
        <p className={styles.eyebrow}>Votre sélection</p>
        <h2>{journey.line.productName}</h2>
        <div className={styles.summaryProduct}>
          {/* eslint-disable-next-line @next/next/no-img-element -- retained local optimized product asset */}
          <img src={journey.line.imageUrl} alt="Boxer Apollon Pourpre Impérial" />
          <div>
            <strong>{journey.line.colorName}</strong>
            <span>Taille {journey.line.size} · Qté {journey.line.quantity}</span>
          </div>
        </div>
        <dl className={styles.totals} aria-live="polite">
          <div>
            <dt>Sous-total</dt>
            <dd>{formatDemoEuros(journey.line.unitPriceCents)}</dd>
          </div>
          <div>
            <dt>Livraison simulée</dt>
            <dd>{formatDemoEuros(shipping.priceCents)}</dd>
          </div>
          <div className={styles.grandTotal}>
            <dt>Total simulé</dt>
            <dd>{formatDemoEuros(totalCents)}</dd>
          </div>
        </dl>
        <button className={styles.primaryButton} type="submit">
          Simuler le paiement
        </button>
        <p className={styles.summarySafety}>
          Aucun débit, aucune commande, aucun e-mail et aucune réservation de stock ne seront créés.
        </p>
      </aside>
    </form>
  );
}
