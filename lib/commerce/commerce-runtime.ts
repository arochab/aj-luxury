export type CommerceRuntimeMode = "preproduction" | "production" | "closed";
export type ActiveCommerceRuntimeMode = Exclude<CommerceRuntimeMode, "closed">;

const API_PREFIX = Object.freeze({
  preproduction: "/api/preprod",
  production: "/api/commerce",
} as const);

/**
 * The commerce namespace is selected only from an explicit server-supplied
 * environment. Unknown values fail closed; the browser hostname is never an
 * authority for choosing a transactional backend.
 */
export function resolveCommerceRuntimeMode(
  appEnvironment: unknown,
): CommerceRuntimeMode {
  if (appEnvironment === "preproduction") return "preproduction";
  if (appEnvironment === "production") return "production";
  return "closed";
}

export function commerceApiPath(
  mode: ActiveCommerceRuntimeMode,
  suffix: string,
): string {
  if (!/^\/[a-z0-9][a-z0-9_/-]*$/i.test(suffix) || suffix.includes("//")) {
    throw new TypeError("Invalid commerce API suffix.");
  }
  return `${API_PREFIX[mode]}${suffix}`;
}

