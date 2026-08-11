import type { CustomerJourneySnapshot } from "./customer-journey.ts";
import { customerJourneyFixture } from "./customer-journey.ts";

export interface CustomerJourneySource {
  read(): Promise<CustomerJourneySnapshot>;
}

/**
 * Source locale, immuable et sans I/O. Elle matérialise uniquement le parcours
 * de préproduction. Une future source D1 devra implémenter la même interface,
 * mais seulement après acceptation formelle du lot logistique D03.
 */
export class SyntheticCustomerJourneySource implements CustomerJourneySource {
  async read(): Promise<CustomerJourneySnapshot> {
    return customerJourneyFixture;
  }
}

export const syntheticCustomerJourneySource =
  new SyntheticCustomerJourneySource();
