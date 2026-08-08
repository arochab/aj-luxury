/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { createStaticFileSignal } from "vinext/server/request-pipeline";

interface Env {
  ASSETS?: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

type RuntimeEnv = Env | undefined;

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const STATIC_ASSET_PREFIXES = ["/assets/", "/fonts/", "/images/", "/videos/"];
const CACHEABLE_HTML_ROUTES = new Set([
  "/",
  "/contact",
  "/cookies",
  "/legal-notice",
  "/notre-histoire",
  "/privacy",
  "/shipping-returns",
  "/shop",
  "/terms",
  "/withdrawal",
]);
// Bump this namespace whenever cacheable server-rendered content changes so a
// deployment never inherits HTML written by an older Worker version.
const HTML_CACHE_VERSION = "2026-08-08-v1";

declare global {
  interface CacheStorage {
    readonly default: Cache;
  }
}

function isStaticAsset(pathname: string): boolean {
  return STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function contentTypeFor(pathname: string): string | null {
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  return null;
}

function localStaticPath(pathname: string): string {
  if (typeof process !== "undefined" && process.platform === "win32") {
    return `/${pathname.slice(1).replaceAll("/", "\\")}`;
  }

  return pathname;
}

function normalizedPathname(pathname: string): string {
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
}

function isCacheableHtmlRequest(request: Request): boolean {
  const pathname = normalizedPathname(new URL(request.url).pathname);
  const isPublicRoute =
    CACHEABLE_HTML_ROUTES.has(pathname) || pathname.startsWith("/products/");

  return (
    request.method === "GET" &&
    isPublicRoute &&
    (request.headers.get("Accept")?.includes("text/html") ?? false) &&
    !request.headers.has("Authorization") &&
    !request.headers.has("Cookie") &&
    !request.headers.has("RSC")
  );
}

function cacheRequestDirective(request: Request): string {
  return `${request.headers.get("Cache-Control") ?? ""},${request.headers.get("Pragma") ?? ""}`.toLowerCase();
}

function shouldBypassCacheLookup(request: Request): boolean {
  const directive = cacheRequestDirective(request);
  return (
    directive.includes("no-cache") ||
    directive.includes("no-store") ||
    directive.includes("max-age=0")
  );
}

function allowsCacheWrite(request: Request): boolean {
  return !cacheRequestDirective(request).includes("no-store");
}

function htmlCacheKey(request: Request): Request {
  const url = new URL(request.url);
  url.searchParams.set("__aj_html_cache", HTML_CACHE_VERSION);
  return new Request(url, { headers: request.headers });
}

function edgeCache(): Cache | null {
  return typeof caches === "undefined" || !("default" in caches)
    ? null
    : caches.default;
}

function withEdgeCacheStatus(
  response: Response,
  status: "HIT" | "MISS",
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-AJ-Edge-Cache", status);
  headers.append("Server-Timing", `aj-edge-cache;desc=\"${status}\"`);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function serveStaticAsset(
  request: Request,
  assets: Fetcher,
): Promise<Response> {
  const url = new URL(request.url);
  const response = await assets.fetch(request);
  const headers = new Headers(response.headers);
  const contentType = contentTypeFor(url.pathname);
  const immutable =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/fonts/") ||
    (url.pathname.startsWith("/images/client/hero-duo-cutout") &&
      url.pathname.endsWith("-v1.webp")) ||
    url.searchParams.get("v") === "v1";

  if (contentType) headers.set("Content-Type", contentType);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Cache-Control",
    response.ok || response.status === 206 || response.status === 304
      ? immutable
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600, stale-while-revalidate=86400"
      : "no-store",
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function serveApplication(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const cacheableRequest = isCacheableHtmlRequest(request);
  const cache = cacheableRequest ? edgeCache() : null;
  const cacheKey = cache ? htmlCacheKey(request) : null;

  if (cache && cacheKey && !shouldBypassCacheLookup(request)) {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) return withEdgeCacheStatus(cachedResponse, "HIT");
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "html edge cache lookup failed",
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  const response = await handler.fetch(request, env, ctx);
  const acceptsHtml = request.headers.get("Accept")?.includes("text/html") ?? false;
  const returnsHtml =
    response.headers.get("Content-Type")?.includes("text/html") ?? false;
  const hasPrivateContext =
    request.headers.has("Authorization") || request.headers.has("Cookie");

  if (
    request.method !== "GET" ||
    !acceptsHtml ||
    !returnsHtml ||
    hasPrivateContext ||
    request.headers.has("RSC") ||
    response.headers.has("Set-Cookie") ||
    !cacheableRequest ||
    !response.ok
  ) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
  );
  headers.set("Cache-Tag", `aj-luxury-html,aj-luxury-html-${HTML_CACHE_VERSION}`);

  const publicResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  if (cache && cacheKey && allowsCacheWrite(request)) {
    ctx.waitUntil(
      cache.put(cacheKey, publicResponse.clone()).catch((error) => {
        console.error(
          JSON.stringify({
            message: "html edge cache write failed",
            path: new URL(request.url).pathname,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }),
    );
  }

  return withEdgeCacheStatus(publicResponse, "MISS");
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env: RuntimeEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (isStaticAsset(url.pathname)) {
      if (env?.ASSETS) return serveStaticAsset(request, env.ASSETS);

      if (env === undefined) {
        return createStaticFileSignal(localStaticPath(url.pathname), {
          headers: null,
          status: null,
        });
      }
    }

    const assets = env?.ASSETS;
    if (url.pathname === "/_vinext/image" && assets && env?.IMAGES) {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => assets.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return serveApplication(request, env, ctx);
  },
};

export default worker;
