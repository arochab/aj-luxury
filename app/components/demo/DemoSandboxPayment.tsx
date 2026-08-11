import type { CustomerJourneySnapshot } from "@/lib/demo/customer-journey";
import styles from "./DemoJourney.module.css";

type DemoSandboxPaymentProps = {
  payment: CustomerJourneySnapshot["payment"];
};

export default function DemoSandboxPayment({
  payment,
}: DemoSandboxPaymentProps) {
  return (
    <section className={styles.paymentCard} aria-label="Paiement de démonstration">
      <div className={styles.paymentCardTop}>
        <span>{payment.label}</span>
        <span className={styles.miniSimulation}>SIMULATION</span>
      </div>
      <strong className={styles.maskedCard}>{payment.maskedCard}</strong>
      <p>
        Aucun numéro de carte réel n’est demandé, transmis ou enregistré dans cette présentation.
      </p>
    </section>
  );
}
