import type { AnalyticsConsentController } from "./consent.ts";
import type {
  ClientAnalyticsEventName,
  ClientAnalyticsInputByName,
} from "./client-events.ts";
import type { AnalyticsContextInput } from "./shared.ts";

export type ClientAnalyticsTrackResult =
  | { accepted: false; reason: "consent_not_granted" }
  | { accepted: false; reason: "analytics_inactive" };

export type ClientAnalyticsFacade = {
  track<Name extends ClientAnalyticsEventName>(
    name: Name,
    input: ClientAnalyticsInputByName[Name],
    context: AnalyticsContextInput,
  ): ClientAnalyticsTrackResult;
};

type CreateClientAnalyticsFacadeOptions = {
  consent: AnalyticsConsentController;
};

/**
 * Inactive browser facade. It never reads event input, allocates an event,
 * invokes a callback, schedules work or buffers data. Runtime work is O(1)
 * relative to payload and catalogue size and is limited to the first-party
 * consent controller lookup plus the result object.
 */
export function createClientAnalyticsFacade({
  consent,
}: CreateClientAnalyticsFacadeOptions): ClientAnalyticsFacade {
  return {
    track() {
      try {
        if (consent.getState() !== "granted") {
          return { accepted: false, reason: "consent_not_granted" };
        }
      } catch {
        return { accepted: false, reason: "consent_not_granted" };
      }
      return { accepted: false, reason: "analytics_inactive" };
    },
  };
}
