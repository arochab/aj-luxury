const COMMERCE_PREFIX = "/api/commerce/";
const STRIPE_WEBHOOK = `${COMMERCE_PREFIX}webhooks/stripe`;
const RESEND_WEBHOOK = `${COMMERCE_PREFIX}webhooks/resend`;
const PROXY_SECRET_HEADER = "X-AJ-Commerce-Proxy-Secret";
const STOREFRONT_ORIGIN_HEADER = "X-AJ-Storefront-Origin";
const CONTROLLED_AUTHORIZATION_HEADER = "X-AJ-Controlled-Authorization";
const PROXY_ACTOR_HEADER = "X-AJ-Proxy-Actor";
const TRUSTED_RATE_LIMIT_ACTOR_HEADER = "X-AJ-Trusted-Rate-Limit-Actor";
const OWNER_EMAIL_HEADER = "oai-authenticated-user-email";
const OWNER_ID_HEADER = "oai-authenticated-user-id";
const ACCESS_ASSERTION_HEADER = "Cf-Access-Jwt-Assertion";
const CONTROLLED_AUTH_WINDOW_SECONDS = 300;

export type CommerceBackendBridgeEnvironment = Readonly<{
  COMMERCE_BACKEND_ONLY?: string;
  COMMERCE_BACKEND_ORIGIN?: string;
  COMMERCE_MODE?: string;
  COMMERCE_ORIGIN?: string;
  COMMERCE_PROXY_SECRET?: string;
  COMMERCE_STOREFRONT_ORIGINS_JSON?: string;
  COMMERCE_CONTROLLED_STOREFRONT_ORIGIN?: string;
  COMMERCE_PUBLIC_STOREFRONT_ORIGINS_JSON?: string;
  COMMERCE_SITES_OWNER_AUTH_ENABLED?: string;
  COMMERCE_SITES_OWNER_AUTH_ORIGIN?: string;
  COMMERCE_CONTROLLED_OWNER_EMAIL?: string;
  COMMERCE_CONTROLLED_AUTH_HMAC_SECRET?: string;
}>;

export type PreparedBackendOnlyCommerceRequest =
  | Readonly<{ request: Request; storefrontOrigin: string | null; response?: never }>
  | Readonly<{ response: Response; request?: never; storefrontOrigin?: never }>;

function bridgeResponse(code: string, status: number): Response {
  return Response.json(
    { error: { code, requestId: `req_${crypto.randomUUID()}` } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

function exactOrigin(value: string | undefined): string | null {
  if (typeof value !== "string" || value.length < 9 || value.length > 512) {
    return null;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== value ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredStorefrontOrigins(
  env: CommerceBackendBridgeEnvironment,
): readonly string[] | null {
  try {
    const parsed: unknown = JSON.parse(env.COMMERCE_STOREFRONT_ORIGINS_JSON ?? "");
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 8) return null;
    const origins = parsed.map((value) =>
      typeof value === "string" ? exactOrigin(value) : null
    );
    if (origins.some((origin) => origin === null)) return null;
    const values = origins as string[];
    if (new Set(values).size !== values.length) return null;
    return Object.freeze(values);
  } catch {
    return null;
  }
}

function parsedOriginArray(value: string | undefined): readonly string[] | null {
  try {
    const parsed: unknown = JSON.parse(value ?? "");
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 4) return null;
    const origins = parsed.map((origin) =>
      typeof origin === "string" ? exactOrigin(origin) : null
    );
    if (origins.some((origin) => origin === null)) return null;
    const values = origins as string[];
    return new Set(values).size === values.length ? Object.freeze(values) : null;
  } catch {
    return null;
  }
}

function backendStorefrontConfiguration(
  env: CommerceBackendBridgeEnvironment,
): Readonly<{ controlled: string; public: readonly string[] }> | null {
  const controlled = exactOrigin(env.COMMERCE_CONTROLLED_STOREFRONT_ORIGIN);
  if (!controlled) return null;
  if (["sandbox", "controlled"].includes(env.COMMERCE_MODE ?? "")) {
    // A controlled Worker has one private browser origin. Requiring the public
    // allowlist here both couples the candidate to production and prevents an
    // intentionally isolated config from starting. Public origins remain a
    // mandatory, separate proof for live/closed backends below.
    return Object.freeze({ controlled, public: Object.freeze([]) });
  }
  const publicOrigins = parsedOriginArray(env.COMMERCE_PUBLIC_STOREFRONT_ORIGINS_JSON);
  if (!publicOrigins || publicOrigins.includes(controlled)) return null;
  return Object.freeze({ controlled, public: publicOrigins });
}

function backendStorefrontAllowed(
  value: string,
  env: CommerceBackendBridgeEnvironment,
): boolean {
  const configured = backendStorefrontConfiguration(env);
  if (!configured) return false;
  if (["sandbox", "controlled"].includes(env.COMMERCE_MODE ?? "")) {
    return value === configured.controlled;
  }
  if (env.COMMERCE_MODE === "live") {
    return value === configured.controlled || configured.public.includes(value);
  }
  return value === configured.controlled || configured.public.includes(value);
}

function configuredSecret(value: string | undefined): value is string {
  return typeof value === "string" && value.length >= 32 && value.length <= 512 &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function exactText(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isWebhook(pathname: string): boolean {
  return pathname === STRIPE_WEBHOOK || pathname === RESEND_WEBHOOK;
}

function webhookMetadataPresent(request: Request, pathname: string): boolean {
  if (request.method !== "POST") return false;
  if (pathname === STRIPE_WEBHOOK) {
    return Boolean(request.headers.get("Stripe-Signature"));
  }
  if (pathname === RESEND_WEBHOOK) {
    return ["svix-id", "svix-timestamp", "svix-signature"]
      .every((header) => Boolean(request.headers.get(header)));
  }
  return false;
}

function mutationMetadataValid(request: Request, storefrontOrigin: string): boolean {
  const origin = request.headers.get("Origin");
  if (request.method === "GET" || request.method === "HEAD") {
    return origin === null || origin === storefrontOrigin;
  }
  return origin === storefrontOrigin &&
    request.headers.get("Sec-Fetch-Site")?.toLowerCase() === "same-origin";
}

function filteredHeaders(headers: Headers): Headers {
  const output = new Headers();
  const allowed = [
    "Accept", "Accept-Language", "Content-Encoding", "Content-Length",
    "Content-Type", "Idempotency-Key", "Origin", "Sec-Fetch-Site",
    "Stripe-Signature", "svix-id", "svix-signature", "svix-timestamp",
    "X-AJ-Release-SHA", "X-AJ-Stock-Import-Confirmation", "X-CSRF-Token",
  ];
  for (const name of allowed) {
    const value = headers.get(name);
    if (value !== null) output.set(name, value);
  }
  return output;
}

function forwardAccessAssertion(request: Request, pathname: string, headers: Headers): void {
  if (!pathname.startsWith("/api/commerce/admin/")) return;
  const assertion = request.headers.get(ACCESS_ASSERTION_HEADER)?.trim() ?? "";
  if (assertion.length < 32 || assertion.length > 16 * 1024 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(assertion)) return;
  headers.set(ACCESS_ASSERTION_HEADER, assertion);
}

const commerceCookieNames = new Set([
  "__Host-aj_cart", "__Host-aj_cart_csrf",
  "__Host-aj_guest_order", "__Host-aj_guest_order_csrf",
  "__Host-aj_customer", "__Host-aj_customer_csrf",
  "__Host-aj_admin", "__Host-aj_admin_csrf",
]);

function commerceCookieHeader(raw: string | null): string | null {
  if (!raw || raw.length > 16 * 1024) return null;
  const selected = raw.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 1) return [];
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return commerceCookieNames.has(name) && value.length <= 512 &&
      !/[\u0000-\u001f\u007f;]/.test(value)
      ? [`${name}=${value}`]
      : [];
  });
  return selected.length ? selected.join("; ") : null;
}

function allowedSetCookie(value: string): boolean {
  const separator = value.indexOf("=");
  if (separator < 1 || value.length > 2048) return false;
  return commerceCookieNames.has(value.slice(0, separator).trim());
}

function sanitizedUpstreamResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("Set-Cookie");
  headers.delete("Clear-Site-Data");
  headers.delete("Authorization");
  headers.delete("Proxy-Authenticate");
  headers.delete("WWW-Authenticate");
  headers.delete(PROXY_SECRET_HEADER);
  headers.delete(CONTROLLED_AUTHORIZATION_HEADER);
  headers.delete(PROXY_ACTOR_HEADER);
  headers.delete(TRUSTED_RATE_LIMIT_ACTOR_HEADER);
  headers.delete(OWNER_EMAIL_HEADER);
  headers.delete(OWNER_ID_HEADER);
  const cookieHeaders = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  for (const value of cookieHeaders.getSetCookie?.() ?? []) {
    if (allowedSetCookie(value)) headers.append("Set-Cookie", value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function requestWithUrl(request: Request, target: string, headers: Headers): Request {
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: request.signal,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  return new Request(target, init);
}

async function hmacHex(secretValue: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretValue),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  ));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function controlledAuthorization(
  request: Request,
  env: CommerceBackendBridgeEnvironment,
  headers: Headers,
): Promise<void> {
  if (env.COMMERCE_SITES_OWNER_AUTH_ENABLED !== "true") return;
  const requestOrigin = new URL(request.url).origin;
  const ownerAuthOrigin = exactOrigin(env.COMMERCE_SITES_OWNER_AUTH_ORIGIN);
  if (!ownerAuthOrigin || requestOrigin !== ownerAuthOrigin ||
    !isConfiguredStorefrontOrigin(ownerAuthOrigin, env)) return;
  const expected = env.COMMERCE_CONTROLLED_OWNER_EMAIL?.trim().toLowerCase() ?? "";
  const actual = request.headers.get(OWNER_EMAIL_HEADER)?.trim().toLowerCase() ?? "";
  const userId = request.headers.get(OWNER_ID_HEADER)?.trim() ?? "";
  const secretValue = env.COMMERCE_CONTROLLED_AUTH_HMAC_SECRET ?? "";
  if (!expected || !exactText(expected, actual) || !userId || userId.length > 512 ||
    !configuredSecret(secretValue)) return;
  const timestamp = Math.floor(Date.now() / 1_000);
  const pathname = new URL(request.url).pathname;
  const canonical = `ajl-controlled-v1\n${timestamp}\n${request.method}\n${pathname}\n${expected}`;
  headers.set(OWNER_EMAIL_HEADER, expected);
  headers.set(OWNER_ID_HEADER, userId);
  headers.set(
    CONTROLLED_AUTHORIZATION_HEADER,
    `t=${timestamp},v1=${await hmacHex(secretValue, canonical)}`,
  );
}

async function proxyActor(
  request: Request,
  storefrontOrigin: string,
  secretValue: string,
): Promise<string | null> {
  const address = request.headers.get("CF-Connecting-IP")?.trim().toLowerCase() ?? "";
  if (!address || address.length > 64 || !/^[0-9a-f:.]+$/i.test(address)) return null;
  return hmacHex(secretValue, `ajl-proxy-actor-v1\n${storefrontOrigin}\n${address}`);
}

export function isConfiguredStorefrontOrigin(
  value: string,
  env: CommerceBackendBridgeEnvironment,
): boolean {
  if (env.COMMERCE_BACKEND_ONLY === "true") {
    return backendStorefrontAllowed(value, env);
  }
  const origins = configuredStorefrontOrigins(env);
  return exactOrigin(value) !== null && origins !== null && origins.includes(value);
}

export async function commerceBackendProxyResponse(
  request: Request,
  env: CommerceBackendBridgeEnvironment | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(COMMERCE_PREFIX) || !env?.COMMERCE_BACKEND_ORIGIN) {
    return null;
  }
  const backendOrigin = exactOrigin(env.COMMERCE_BACKEND_ORIGIN);
  const storefrontOrigins = configuredStorefrontOrigins(env);
  const proxySecret = env.COMMERCE_PROXY_SECRET;
  const storefrontOrigin = url.origin;
  if (
    env.COMMERCE_BACKEND_ONLY === "true" ||
    !backendOrigin ||
    !storefrontOrigins ||
    storefrontOrigins.includes(backendOrigin) ||
    !configuredSecret(proxySecret) ||
    !storefrontOrigins.includes(storefrontOrigin)
  ) return bridgeResponse("COMMERCE_BRIDGE_UNAVAILABLE", 503);

  if (isWebhook(url.pathname)) {
    return bridgeResponse("NOT_FOUND", 404);
  }
  if (!mutationMetadataValid(request, storefrontOrigin)) {
    return bridgeResponse("ORIGIN_REJECTED", 403);
  }

  const headers = filteredHeaders(request.headers);
  forwardAccessAssertion(request, url.pathname, headers);
  const cookies = commerceCookieHeader(request.headers.get("Cookie"));
  if (cookies) headers.set("Cookie", cookies);
  headers.set(PROXY_SECRET_HEADER, proxySecret);
  headers.set(STOREFRONT_ORIGIN_HEADER, storefrontOrigin);
  if (!isWebhook(url.pathname)) {
    const actor = await proxyActor(request, storefrontOrigin, proxySecret);
    if (!actor) return bridgeResponse("COMMERCE_BRIDGE_CLIENT_UNAVAILABLE", 503);
    headers.set(PROXY_ACTOR_HEADER, actor);
  }
  await controlledAuthorization(request, env, headers);
  const upstreamRequest = requestWithUrl(
    request,
    `${backendOrigin}${url.pathname}${url.search}`,
    headers,
  );
  try {
    const response = await fetchImpl(upstreamRequest);
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      return bridgeResponse("COMMERCE_BRIDGE_REDIRECT_REJECTED", 502);
    }
    return sanitizedUpstreamResponse(response);
  } catch {
    return bridgeResponse("COMMERCE_BRIDGE_UPSTREAM_UNAVAILABLE", 502);
  }
}

export function prepareBackendOnlyCommerceRequest(
  request: Request,
  env: CommerceBackendBridgeEnvironment | undefined,
): PreparedBackendOnlyCommerceRequest {
  if (env?.COMMERCE_BACKEND_ONLY !== "true") {
    return { request, storefrontOrigin: null };
  }
  const url = new URL(request.url);
  if (!url.pathname.startsWith(COMMERCE_PREFIX)) {
    return { response: bridgeResponse("NOT_FOUND", 404) };
  }
  const canonicalOrigin = exactOrigin(env.COMMERCE_ORIGIN);
  if (!canonicalOrigin || !backendStorefrontConfiguration(env) ||
    !configuredSecret(env.COMMERCE_PROXY_SECRET)) {
    return { response: bridgeResponse("COMMERCE_BACKEND_UNAVAILABLE", 503) };
  }

  const webhook = isWebhook(url.pathname);
  if (webhook) {
    if (!webhookMetadataPresent(request, url.pathname)) {
      return { response: bridgeResponse("INVALID_WEBHOOK", 400) };
    }
    const headers = filteredHeaders(request.headers);
    const edgeAddress = request.headers.get("CF-Connecting-IP")?.trim().toLowerCase() ?? "";
    if (edgeAddress && edgeAddress.length <= 64 && /^[0-9a-f:.]+$/i.test(edgeAddress)) {
      headers.set("CF-Connecting-IP", edgeAddress);
    }
    if (request.headers.has("Stripe-Signature")) {
      headers.set("Stripe-Signature", request.headers.get("Stripe-Signature")!);
    }
    for (const name of ["svix-id", "svix-timestamp", "svix-signature"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    return {
      request: requestWithUrl(
        request,
        `${canonicalOrigin}${url.pathname}${url.search}`,
        headers,
      ),
      storefrontOrigin: null,
    };
  }

  const receivedSecret = request.headers.get(PROXY_SECRET_HEADER) ?? "";
  const storefrontOrigin = request.headers.get(STOREFRONT_ORIGIN_HEADER) ?? "";
  const proxyActorValue = request.headers.get(PROXY_ACTOR_HEADER) ?? "";
  if (!exactText(env.COMMERCE_PROXY_SECRET, receivedSecret)) {
    return { response: bridgeResponse("COMMERCE_PROXY_AUTH_REQUIRED", 401) };
  }
  if (!backendStorefrontAllowed(storefrontOrigin, env) ||
    !mutationMetadataValid(request, storefrontOrigin) ||
    !/^[0-9a-f]{64}$/.test(proxyActorValue)) {
    return { response: bridgeResponse("ORIGIN_REJECTED", 403) };
  }

  const headers = filteredHeaders(request.headers);
  forwardAccessAssertion(request, url.pathname, headers);
  const cookies = commerceCookieHeader(request.headers.get("Cookie"));
  if (cookies) headers.set("Cookie", cookies);
  headers.set("Origin", canonicalOrigin);
  headers.set(TRUSTED_RATE_LIMIT_ACTOR_HEADER, proxyActorValue);
  const controlledAuthorizationValue = request.headers.get(CONTROLLED_AUTHORIZATION_HEADER);
  const ownerEmail = request.headers.get(OWNER_EMAIL_HEADER);
  const ownerId = request.headers.get(OWNER_ID_HEADER);
  if (controlledAuthorizationValue && ownerEmail && ownerId) {
    headers.set(CONTROLLED_AUTHORIZATION_HEADER, controlledAuthorizationValue);
    headers.set(OWNER_EMAIL_HEADER, ownerEmail);
    headers.set(OWNER_ID_HEADER, ownerId);
  }
  return {
    request: requestWithUrl(
      request,
      `${canonicalOrigin}${url.pathname}${url.search}`,
      headers,
    ),
    storefrontOrigin,
  };
}

export const commerceBackendBridgeInternals = Object.freeze({
  CONTROLLED_AUTH_WINDOW_SECONDS,
  PROXY_SECRET_HEADER,
  STOREFRONT_ORIGIN_HEADER,
  PROXY_ACTOR_HEADER,
  TRUSTED_RATE_LIMIT_ACTOR_HEADER,
});
