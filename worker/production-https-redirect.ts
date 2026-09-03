type ProductionHttpsRedirectEnv = Readonly<{
  APP_ENV?: string;
  COMMERCE_ORIGIN?: string;
}>;

const PERMANENT_REDIRECT_CACHE = "public, max-age=31536000";

/**
 * Upgrade the public storefront before any commerce or asset handler runs.
 *
 * HSTS only protects a browser after a successful HTTPS visit. This explicit
 * 308 also protects a first visit made from an old `http://` bookmark while
 * preserving the request method, path and query string.
 */
export function productionHttpsRedirectResponse(
  request: Request,
  env: ProductionHttpsRedirectEnv | undefined,
): Response | null {
  if (env?.APP_ENV !== "production") return null;

  const incoming = new URL(request.url);
  if (incoming.protocol !== "http:") return null;

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

  const destination = new URL(`${incoming.pathname}${incoming.search}`, canonical.origin);
  return new Response(null, {
    status: 308,
    headers: {
      "Cache-Control": PERMANENT_REDIRECT_CACHE,
      Location: destination.toString(),
    },
  });
}
