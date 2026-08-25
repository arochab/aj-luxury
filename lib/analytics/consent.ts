export const ANALYTICS_CONSENT_STATES = [
  "unknown",
  "denied",
  "granted",
] as const;

export type AnalyticsConsentState =
  (typeof ANALYTICS_CONSENT_STATES)[number];

export type AnalyticsConsentController = {
  getState(): AnalyticsConsentState;
  setState(nextState: AnalyticsConsentState): AnalyticsConsentState;
  reset(): AnalyticsConsentState;
};

const consentStateAllowlist = new Set<string>(ANALYTICS_CONSENT_STATES);

function normalizeConsentState(value: unknown): AnalyticsConsentState {
  return typeof value === "string" && consentStateAllowlist.has(value)
    ? (value as AnalyticsConsentState)
    : "unknown";
}

export function createAnalyticsConsentController(
  initialState: AnalyticsConsentState = "unknown",
): AnalyticsConsentController {
  let state = normalizeConsentState(initialState);

  return {
    getState() {
      return state;
    },
    setState(nextState) {
      state = normalizeConsentState(nextState);
      return state;
    },
    reset() {
      state = "unknown";
      return state;
    },
  };
}
