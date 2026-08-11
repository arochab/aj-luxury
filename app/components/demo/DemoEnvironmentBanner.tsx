import Link from "next/link";
import styles from "./DemoJourney.module.css";

type DemoEnvironmentBannerProps = {
  step?: string;
};

export default function DemoEnvironmentBanner({
  step,
}: DemoEnvironmentBannerProps) {
  return (
    <aside className={styles.environmentBanner} aria-label="Environnement de démonstration">
      <span className={styles.simulationPill}>SIMULATION</span>
      <span>Démo locale isolée</span>
      {step ? <span className={styles.bannerStep}>{step}</span> : null}
      <Link href="/demo-control">Parcours complet</Link>
    </aside>
  );
}
