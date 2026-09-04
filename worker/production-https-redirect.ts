type ProductionHttpsRedirectEnv = Readonly<{
  APP_ENV?: string;
  COMMERCE_ORIGIN?: string;
}>;

const PERMANENT_REDIRECT_CACHE = "public, max-age=31536000";
const RETIRED_PUBLIC_PATHS = new Map([
  ["/preouverture", "/"],
  ["/operations", "/admin"],
  ["/operations/", "/admin"],
]);

/**
 * Canonicalize the public storefront before any commerce or asset handler runs.
 *
 * HSTS only protects a browser after a successful HTTPS visit. This explicit
 * 308 protects a first visit made from an old `http://` bookmark. The same
 * redirect consolidates the legacy `www` hostname, retires private launch
 * pages, and removes the internal `release` cache-buster from any previously
 * shared verification URL.
 * Request method, path and every other query parameter are preserved.
 */
export function productionHttpsRedirectResponse(
  request: Request,
  env: ProductionHttpsRedirectEnv | undefined,
): Response | null {
  if (env?.APP_ENV !== "production") return null;

  const incoming = new URL(request.url);

  let canonical: URL;
  try {
    canonical = new URL(env.COMMERCE_ORIGIN ?? "");
  } catch {
    return null;
  }
  if (
    canonical.protocol !== "https:" ||
    canonical.pathname !== "/" ||
    canonical.search !== "" ||
    canonical.hash !== ""
  ) return null;

  const allowedHosts = new Set([
    canonical.hostname,
    `www.${canonical.hostname}`,
  ]);
  if (!allowedHosts.has(incoming.hostname)) return null;

  const isLegacyHostname = incoming.hostname === `www.${canonical.hostname}`;
  const hasReleaseMarker = incoming.searchParams.has("release");
  const retiredDestination = RETIRED_PUBLIC_PATHS.get(incoming.pathname);
  if (
    incoming.protocol === "https:" &&
    !isLegacyHostname &&
    !hasReleaseMarker &&
    retiredDestination === undefined
  ) return null;

  incoming.searchParams.delete("release");

  const destination = new URL(
    `${retiredDestination ?? incoming.pathname}${incoming.search}`,
    canonical.origin,
  );
  return new Response(null, {
    status: 308,
    headers: {
      "Cache-Control": PERMANENT_REDIRECT_CACHE,
      Location: destination.toString(),
    },
  });
}
