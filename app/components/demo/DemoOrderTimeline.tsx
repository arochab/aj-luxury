import type { CustomerJourneySnapshot } from "@/lib/demo/customer-journey";
import styles from "./DemoJourney.module.css";

type DemoOrderTimelineProps = {
  timeline: CustomerJourneySnapshot["order"]["timeline"];
};

export default function DemoOrderTimeline({ timeline }: DemoOrderTimelineProps) {
  return (
    <ol className={styles.timeline} aria-label="Suivi simulé de la commande">
      {timeline.map((step) => (
        <li key={step.label} data-state={step.state}>
          <span className={styles.timelineMarker} aria-hidden="true" />
          <div>
            <strong>{step.label}</strong>
            <p>{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
