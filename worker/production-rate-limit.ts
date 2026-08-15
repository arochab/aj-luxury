type RateLimitBinding = Readonly<{
  limit(input: Readonly<{ key: string }>): Promise<Readonly<{ success: boolean }>>;
}>;

export type ProductionRateLimitEnvironment = Readonly<{
  APP_ENV?: string;
  COMMERCE_RATE_LIMITER?: RateLimitBinding;
  PROVIDER_RATE_LIMITER?: RateLimitBinding;
  WEBHOOK_RATE_LIMITER?: RateLimitBinding;
  OPERATOR_RATE_LIMITER?: RateLimitBinding;
}>;

type LimitClass = "commerce" | "provider" | "webhook" | "operator";

const exactRoutes = new Map<string, LimitClass>([
  ["/api/commerce/health", "commerce"],
  ["/api/commerce/cart", "commerce"],
  ["/api/commerce/checkout/delivery-options", "provider"],
  ["/api/commerce/checkout/service-points", "provider"],
  ["/api/commerce/checkout/delivery-options/select", "commerce"],
  ["/api/commerce/checkout/order", "commerce"],
  ["/api/commerce/checkout/payment-session", "provider"],
  ["/api/commerce/webhooks/stripe", "webhook"],
  ["/api/commerce/orders/current", "commerce"],
  ["/api/commerce/account/current", "commerce"],
  ["/api/commerce/returns", "commerce"],
  ["/api/commerce/admin/health", "operator"],
  ["/api/commerce/admin/reporting", "operator"],
  ["/api/commerce/admin/late-payment-refunds/dispatch", "operator"],
]);

const cartLine = /^\/api\/commerce\/cart\/lines\/[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const shippingLabel = /^\/api\/commerce\/admin\/orders\/[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}\/shipping-label$/;
const returnOperator = /^\/api\/commerce\/admin\/returns\/[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}\/(?:approve|inspect)$/;

function routeClass(pathname: string): LimitClass | null {
  if (cartLine.test(pathname)) return "commerce";
  if (shippingLabel.test(pathname)) return "operator";
  if (returnOperator.test(pathname)) return "operator";
  return exactRoutes.get(pathname) ?? null;
}

function cookie(request: Request, name: string): string | null {
  const values = (request.headers.get("Cookie") ?? "").split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    return separator >= 0 && part.slice(0, separator).trim() === name
      ? [part.slice(separator + 1).trim()]
      : [];
  });
  return values.length === 1 && values[0].length <= 512 ? values[0] : null;
}

function safeActor(request: Request): string {
  // Cloudflare supplies this value at the edge. It remains the mandatory base
  // for anonymous commerce so rotating a forged cart/owner header cannot mint
  // unlimited counters. No raw address is persisted or exposed.
  const address = request.headers.get("CF-Connecting-IP")?.trim();
  if (address && address.length <= 64 && /^[0-9a-f:.]+$/i.test(address)) {
    return `edge:${address.toLowerCase()}`;
  }
  const owner = request.headers.get("oai-authenticated-user-id")?.trim();
  if (owner && owner.length <= 512 && !/[\u0000-\u001f\u007f]/.test(owner)) {
    return `owner-fallback:${owner}`;
  }
  const cart = cookie(request, "__Host-aj_cart");
  if (cart) return `cart-fallback:${cart}`;
  return "unattributed";
}

async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`ajl-rate-limit-v1\0${value}`),
  ));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function failure(code: string, status: 429 | 503): Response {
  return Response.json(
    { error: { code, requestId: `req_${crypto.randomUUID()}` } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

export function productionRateLimitBindingsReady(
  env: ProductionRateLimitEnvironment | undefined,
): boolean {
  return Boolean(
    env?.COMMERCE_RATE_LIMITER?.limit &&
    env.PROVIDER_RATE_LIMITER?.limit &&
    env.WEBHOOK_RATE_LIMITER?.limit &&
    env.OPERATOR_RATE_LIMITER?.limit,
  );
}

/**
 * Cost-abuse boundary placed before every D1/provider production router.
 * Cloudflare owns the counters; this module never stores an IP, cookie or id.
 */
export async function productionCommerceRateLimitResponse(
  request: Request,
  env: ProductionRateLimitEnvironment | undefined,
): Promise<Response | null> {
  if (env?.APP_ENV !== "production") return null;
  const pathname = new URL(request.url).pathname;
  const classification = routeClass(pathname);
  if (!classification) return null;
  const binding = classification === "commerce"
    ? env.COMMERCE_RATE_LIMITER
    : classification === "provider"
      ? env.PROVIDER_RATE_LIMITER
      : classification === "webhook"
        ? env.WEBHOOK_RATE_LIMITER
        : env.OPERATOR_RATE_LIMITER;
  if (!binding?.limit) return failure("RATE_LIMIT_UNAVAILABLE", 503);
  try {
    const key = `${classification}:${await digest(safeActor(request))}`;
    const result = await binding.limit({ key });
    return result.success ? null : failure("RATE_LIMIT_EXCEEDED", 429);
  } catch {
    return failure("RATE_LIMIT_UNAVAILABLE", 503);
  }
}

export type ScheduledProductionOperation =
  | "transactional-email-dispatch"
  | "reservation-expiry";

/**
 * The scheduled path has no HTTP request, but it shares the same bounded
 * operator counter before D1 or a provider can be touched.
 */
export async function productionScheduledRateLimit(
  env: ProductionRateLimitEnvironment | undefined,
  operation: ScheduledProductionOperation,
): Promise<"allowed" | "limited" | "unavailable"> {
  if (env?.APP_ENV !== "production" || !env.OPERATOR_RATE_LIMITER?.limit) {
    return "unavailable";
  }
  try {
    const key = `operator:${await digest(`scheduled:${operation}`)}`;
    const result = await env.OPERATOR_RATE_LIMITER.limit({ key });
    return result.success ? "allowed" : "limited";
  } catch {
    return "unavailable";
  }
}
