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

const STATIC_ASSET_PREFIXES = [
  "/assets/",
  "/fonts/",
  "/i18n/",
  "/images/",
  "/videos/",
];
const MEDIA_ASSET_PREFIX = "/media/";
const MEDIA_ASSET_ROOTS = new Set(["i18n", "images", "videos"]);
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
const HTML_CACHE_VERSION = "2026-08-10-hero-v4";

type ByteRange = {
  start: number;
  end: number;
};

function mediaAssetPath(pathname: string): string | null {
  if (!pathname.startsWith(MEDIA_ASSET_PREFIX)) return null;

  const relativePath = pathname.slice(MEDIA_ASSET_PREFIX.length);
  const root = relativePath.split("/", 1)[0];
  if (!root || !MEDIA_ASSET_ROOTS.has(root)) return null;

  return `/${relativePath}`;
}

function isStaticAsset(pathname: string): boolean {
  return (
    mediaAssetPath(pathname) !== null ||
    STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function contentTypeFor(pathname: string): string | null {
  if (pathname.endsWith(".avif")) return "image/avif";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
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

function rewrittenAssetRequest(request: Request): Request {
  const url = new URL(request.url);
  const physicalPath = mediaAssetPath(url.pathname);
  if (!physicalPath) return request;

  url.pathname = physicalPath;
  return new Request(url, {
    method: request.method,
    headers: request.headers,
  });
}

function parseContentLength(response: Response): number | null {
  const rawLength = response.headers.get("Content-Length");
  if (!rawLength || !/^\d+$/.test(rawLength)) return null;

  const length = Number(rawLength);
  return Number.isSafeInteger(length) ? length : null;
}

function parseSingleByteRange(
  rangeHeader: string,
  totalLength: number,
): ByteRange | null {
  if (!Number.isSafeInteger(totalLength) || totalLength <= 0) return null;

  const match = /^bytes\s*=\s*(\d*)\s*-\s*(\d*)$/i.exec(
    rangeHeader.trim(),
  );
  if (!match || (!match[1] && !match[2])) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;

    return {
      start: Math.max(totalLength - suffixLength, 0),
      end: totalLength - 1,
    };
  }

  const start = Number(rawStart);
  if (!Number.isSafeInteger(start) || start >= totalLength) return null;

  if (!rawEnd) return { start, end: totalLength - 1 };

  const requestedEnd = Number(rawEnd);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return null;

  return { start, end: Math.min(requestedEnd, totalLength - 1) };
}

function rangeHeaders(
  response: Response,
  range: ByteRange | null,
  totalLength: number,
): Headers {
  const headers = new Headers(response.headers);
  headers.delete("Content-Encoding");
  headers.set("Accept-Ranges", "bytes");

  if (!range) {
    headers.set("Content-Range", `bytes */${totalLength}`);
    headers.set("Content-Length", "0");
    return headers;
  }

  headers.set(
    "Content-Range",
    `bytes ${range.start}-${range.end}/${totalLength}`,
  );
  headers.set("Content-Length", String(range.end - range.start + 1));
  return headers;
}

async function serveMp4Range(
  request: Request,
  assetRequest: Request,
  assets: Fetcher,
): Promise<Response> {
  const rangeHeader = request.headers.get("Range");
  if (!rangeHeader) return assets.fetch(assetRequest);

  const fullHeaders = new Headers(assetRequest.headers);
  fullHeaders.delete("Range");
  let fullResponse = await assets.fetch(
    new Request(assetRequest.url, {
      method: request.method,
      headers: fullHeaders,
    }),
  );
  if (!fullResponse.ok) return fullResponse;

  let totalLength = parseContentLength(fullResponse);
  let fullBytes: ArrayBuffer | null = null;

  if (request.method === "GET") {
    fullBytes = await fullResponse.arrayBuffer();
    totalLength = fullBytes.byteLength;
  } else if (totalLength === null) {
    const getResponse = await assets.fetch(
      new Request(assetRequest.url, { method: "GET", headers: fullHeaders }),
    );
    if (!getResponse.ok) return fullResponse;

    fullBytes = await getResponse.arrayBuffer();
    totalLength = fullBytes.byteLength;
    fullResponse = new Response(null, {
      status: fullResponse.status,
      statusText: fullResponse.statusText,
      headers: getResponse.headers,
    });
  }

  if (totalLength === null) {
    return new Response(null, {
      status: 416,
      statusText: "Range Not Satisfiable",
      headers: rangeHeaders(fullResponse, null, 0),
    });
  }

  const range = parseSingleByteRange(rangeHeader, totalLength);
  if (!range) {
    return new Response(null, {
      status: 416,
      statusText: "Range Not Satisfiable",
      headers: rangeHeaders(fullResponse, null, totalLength),
    });
  }

  const body =
    request.method === "HEAD"
      ? null
      : fullBytes?.slice(range.start, range.end + 1) ?? null;

  return new Response(body, {
    status: 206,
    statusText: "Partial Content",
    headers: rangeHeaders(fullResponse, range, totalLength),
  });
}

async function serveStaticAsset(
  request: Request,
  assets: Fetcher,
): Promise<Response> {
  const url = new URL(request.url);
  const assetRequest = rewrittenAssetRequest(request);
  const isMp4RangeRequest =
    url.pathname.endsWith(".mp4") &&
    (request.method === "GET" || request.method === "HEAD") &&
    request.headers.has("Range");
  const response = isMp4RangeRequest
    ? await serveMp4Range(request, assetRequest, assets)
    : await assets.fetch(assetRequest);
  const headers = new Headers(response.headers);
  const contentType = contentTypeFor(url.pathname);
  const assetVersion = url.searchParams.get("v");
  const immutable =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/fonts/") ||
    /^v\d+$/.test(assetVersion ?? "");

  if (contentType) headers.set("Content-Type", contentType);
  if (url.pathname.endsWith(".mp4") && response.ok) {
    headers.set("Accept-Ranges", "bytes");
  }
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

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
        const physicalPath = mediaAssetPath(url.pathname) ?? url.pathname;
        const staticHeaders = new Headers();
        const contentType = contentTypeFor(url.pathname);
        if (contentType) staticHeaders.set("Content-Type", contentType);
        if (url.pathname.endsWith(".mp4")) {
          // vinext start currently maps MP4 to application/octet-stream and
          // strips an explicit Content-Type from static-file signals. Avoid
          // nosniff only in this local fallback so browsers may decode it.
          staticHeaders.set("Accept-Ranges", "bytes");
        } else {
          staticHeaders.set("X-Content-Type-Options", "nosniff");
        }
        return createStaticFileSignal(localStaticPath(physicalPath), {
          headers: staticHeaders,
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
