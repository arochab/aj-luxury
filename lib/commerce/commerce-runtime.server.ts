import {
  resolveCommerceRuntimeMode,
  type CommerceRuntimeMode,
} from "./commerce-runtime.ts";

/** Server-only injection point. Never derive this value from request headers. */
export function getServerCommerceRuntimeMode(): CommerceRuntimeMode {
  return resolveCommerceRuntimeMode(process.env.APP_ENV);
}

/**
 * Public review surface: exposes the exact launch offer and stock vocabulary,
 * while keeping every transactional mutation closed. This flag is never a
 * commerce authority and cannot select an API namespace.
 */
export function isServerCommerceReview(): boolean {
  return process.env.COMMERCE_REVIEW_MODE === "true";
}
