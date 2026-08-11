import type { DemoShippingOption as DemoShippingOptionData } from "@/lib/demo/customer-journey";
import { formatDemoEuros } from "@/lib/demo/customer-journey";
import DhlSimulationMark from "./DhlSimulationMark";
import styles from "./DemoJourney.module.css";

type DemoShippingOptionProps = {
  option: DemoShippingOptionData;
};

export default function DemoShippingOption({ option }: DemoShippingOptionProps) {
  return (
    <section className={styles.shippingCard} aria-label="Mode de livraison simulé">
      <div className={styles.shippingHeading}>
        <DhlSimulationMark />
        <strong>{formatDemoEuros(option.priceCents)}</strong>
      </div>
      <p className={styles.shippingLead}>{option.leadTime}</p>
      <p className={styles.customsLine}>
        <strong>{option.customsTerm}</strong> · {option.customsNote}
      </p>
      <p className={styles.disclaimer}>
        DHL est montré uniquement comme transporteur hypothétique. Aucun
        service DHL n’est connecté : ni compte, ni partenariat, ni tarif, ni
        suivi. Délais et prix non contractuels.
      </p>
    </section>
  );
}
