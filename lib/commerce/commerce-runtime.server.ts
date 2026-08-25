import {
  resolveCommerceRuntimeMode,
  type CommerceRuntimeMode,
} from "./commerce-runtime.ts";

/** Server-only injection point. Never derive this value from request headers. */
export function getServerCommerceRuntimeMode(): CommerceRuntimeMode {
  return resolveCommerceRuntimeMode(process.env.APP_ENV);
}

