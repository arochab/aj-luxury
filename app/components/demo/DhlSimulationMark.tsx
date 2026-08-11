import styles from "./DemoJourney.module.css";

/**
 * Demo-only nominative carrier mark. The official wordmark is always coupled
 * to a visible SIMULATION label and to a non-integration disclaimer nearby.
 */
export default function DhlSimulationMark() {
  return (
    <span
      className={styles.dhlSimulationMark}
      aria-label="DHL Express, simulation sans service connecté"
    >
      <span className={styles.dhlLogoPanel} aria-hidden="true" />
      <span className={styles.dhlSimulationText} aria-hidden="true">
        Express <strong>SIMULATION</strong>
      </span>
    </span>
  );
}
