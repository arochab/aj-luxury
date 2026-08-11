export const DEMO_ALLOWED_HOSTS = Object.freeze([
  "localhost",
  "localhost:3000",
  "localhost:3107",
  "127.0.0.1",
  "127.0.0.1:3000",
  "127.0.0.1:3107",
] as const);

export const DEMO_ROUTE_PATHS = Object.freeze([
  "/cart",
  "/checkout",
  "/account",
  "/return",
  "/refund",
  "/demo-control",
] as const);

export type DemoRuntimeInput = Readonly<{
  runtime: string | undefined;
  environment: string | undefined;
  host: string | undefined;
}>;

export type DemoRuntimeContext = Readonly<{
  runtime: "demo";
  environment: "preproduction";
  host: (typeof DEMO_ALLOWED_HOSTS)[number];
}>;

export class DemoRuntimeDeniedError extends Error {
  constructor() {
    super("Customer journey demo is unavailable in this environment.");
    this.name = "DemoRuntimeDeniedError";
  }
}

export function isDemoRoute(pathname: string): boolean {
  let canonical = pathname;

  try {
    for (let pass = 0; pass < 8 && canonical.includes("%"); pass += 1) {
      const decoded = decodeURIComponent(canonical);
      if (decoded === canonical) break;
      canonical = decoded;
    }
  } catch {
    // A malformed encoded path must never reach a demo page unchecked.
    return true;
  }

  // Deeply nested encoding is invalid for this surface and denied in bounded time.
  if (canonical.includes("%")) return true;

  const normalized = canonical === "/" ? canonical : canonical.replace(/\/+$/, "");
  return DEMO_ROUTE_PATHS.some(
    (route) => normalized === route || normalized.startsWith(`${route}/`),
  );
}

export function assertDemoRuntime(
  input: DemoRuntimeInput,
): DemoRuntimeContext {
  const host = input.host?.trim().toLowerCase();
  const isAllowedHost = DEMO_ALLOWED_HOSTS.some(
    (allowedHost) => allowedHost === host,
  );

  if (
    input.runtime !== "demo" ||
    input.environment !== "preproduction" ||
    !host ||
    host.includes(",") ||
    !isAllowedHost
  ) {
    throw new DemoRuntimeDeniedError();
  }

  return {
    runtime: "demo",
    environment: "preproduction",
    host: host as DemoRuntimeContext["host"],
  };
}
