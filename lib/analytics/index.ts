export * from "./consent.ts";
export {
  CLIENT_ANALYTICS_EVENT_NAMES,
  CLIENT_ANALYTICS_INPUT_FIELD_ALLOWLIST,
} from "./client-events.ts";
export type {
  ClientAnalyticsEventName,
  ClientAnalyticsInputByName,
} from "./client-events.ts";
export {
  ANALYTICS_SCHEMA_VERSION,
  ANALYTICS_UTM_KEYS,
} from "./shared.ts";
export type {
  AnalyticsContextInput,
  AnalyticsDataPolicy,
  AnalyticsLineInput,
  AnalyticsUtm,
  AnalyticsUtmKey,
  SanitizedAnalyticsContext,
} from "./shared.ts";
export {
  createClientAnalyticsFacade,
  type ClientAnalyticsFacade,
  type ClientAnalyticsTrackResult,
} from "./facade.ts";
