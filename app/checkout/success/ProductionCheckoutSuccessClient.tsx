"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCurrentProductionOrder,
  type PublicProductionOrder,
} from "../../../lib/commerce/production-order-client";
import LocalizedPrice from "../../components/LocalizedPrice";
import styles from "../../cart/CommerceShell.module.css";

const MAX_POLLS = 5;
const POLL_DELAY_MS = 2_000;

/** The Stripe query parameter is intentionally ignored; D1 is authoritative. */
export default function ProductionCheckoutSuccessClient() {
  const [order, setOrder] = useState<PublicProductionOrder | null>(null);
  const [poll, setPoll] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let timeout: number | undefined;
    void getCurrentProductionOrder()
      .then((current) => {
        if (!active) return;
        setOrder(current);
        setFailed(current === null);
        if (current?.status === "pending_payment" && poll < MAX_POLLS - 1) {
          timeout = window.setTimeout(() => setPoll((value) => value + 1), POLL_DELAY_MS);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [poll]);

  const pending = order?.status === "pending_payment";
  return (
    <div className={styles.main} aria-busy={!failed && (!order || pending)}>
      <section aria-labelledby="payment-result-title">
        <p className={styles.eyebrow}>Paiement</p>
        <h1 className={styles.title} id="payment-result-title">
          {order?.status === "paid"
            ? "Paiement confirmé."
            : failed
              ? "Vérification indisponible."
              : "Vérification du paiement…"}
        </h1>
        {order?.status === "paid" && (
          <div className={styles.quote} role="status">
            <strong>Commande {order.orderNumber}</strong>
            <p>Votre commande est enregistrée et payée.</p>
            <p><LocalizedPrice amountCents={order.totalCents} /></p>
          </div>
        )}
        {pending && poll >= MAX_POLLS - 1 && (
          <div className={styles.error} role="status">
            <p>Le prestataire n’a pas encore confirmé le paiement. Aucun statut n’a été inventé.</p>
          </div>
        )}
        {failed && (
          <div className={styles.error} role="alert">
            <p>Impossible de relire la commande depuis cette session sécurisée.</p>
          </div>
        )}
        <Link className={styles.button} href="/account">Voir ma commande</Link>
        <Link className={styles.secondary} href="/shop">Retour à la collection</Link>
      </section>
    </div>
  );
}

