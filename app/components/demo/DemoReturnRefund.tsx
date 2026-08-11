"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  demoDestinationHref,
  type CustomerJourneySnapshot,
  type DemoDestinationCode,
} from "@/lib/demo/customer-journey";
import styles from "./DemoJourney.module.css";

type DemoReturnRefundProps = {
  journey: CustomerJourneySnapshot;
  destination: DemoDestinationCode;
};

export default function DemoReturnRefund({
  journey,
  destination,
}: DemoReturnRefundProps) {
  const [submitted, setSubmitted] = useState(false);
  const [selected, setSelected] = useState(true);
  const successRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <section
        className={styles.successPanel}
        aria-live="polite"
        ref={successRef}
        tabIndex={-1}
      >
        <span className={styles.successMark} aria-hidden="true">✓</span>
        <p className={styles.eyebrow}>Demande enregistrée dans la simulation</p>
        <h1>{journey.returnRequest.status}</h1>
        <p>
          Référence <strong>{journey.returnRequest.number}</strong>. Aucune donnée n’a été transmise et aucun retour réel n’a été créé.
        </p>
        <div className={styles.actionRow}>
          <Link className={styles.primaryButton} href={demoDestinationHref("/refund", destination)}>Voir le remboursement simulé</Link>
          <Link className={styles.textButton} href={demoDestinationHref(`/account/orders/${journey.order.number}`, destination)}>Retour à la commande</Link>
        </div>
      </section>
    );
  }

  return (
    <form className={styles.returnForm} onSubmit={submitReturn}>
      <header className={styles.pageHeading}>
        <p className={styles.eyebrow}>Commande {journey.order.number}</p>
        <h1>Simuler un retour</h1>
        <p>
          Vérification in situ du parcours après-vente, sans action logistique ni remboursement réel.
        </p>
      </header>
      <section className={styles.returnPanel}>
        <div className={styles.returnLine}>
          {/* eslint-disable-next-line @next/next/no-img-element -- retained local optimized product asset */}
          <img src={journey.line.imageUrl} alt="Boxer Apollon Pourpre Impérial" />
          <div>
            <strong>{journey.line.productName} · {journey.line.colorName}</strong>
            <span>Taille {journey.line.size} · Quantité {journey.line.quantity}</span>
          </div>
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => setSelected(event.target.checked)}
            aria-label="Sélectionner l’article Apollon"
          />
        </div>
        <label>
          Motif du retour
          <select defaultValue="size">
            <option value="size">La taille ne convient pas</option>
            <option value="changed-mind">J’ai changé d’avis</option>
            <option value="other">Autre motif</option>
          </select>
        </label>
        <label>
          Commentaire facultatif
          <textarea defaultValue="Simulation du parcours retour avant mise en production." rows={4} />
        </label>
        <div className={styles.returnNotice}>
          <strong>SIMULATION</strong>
          <p>Aucune étiquette, aucun enlèvement et aucun flux DHL ne seront générés.</p>
        </div>
        <button className={styles.primaryButton} type="submit" disabled={!selected}>Simuler la demande de retour</button>
      </section>
    </form>
  );
}
