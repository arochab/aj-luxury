import {
  evaluateProductionReleaseGate,
  type ProductionCommerceEnvironment,
} from "../lib/commerce/production-release-gate.ts";

const PRODUCTION_COMMERCE_PREFIX = "/api/commerce/";
const PRODUCTION_HEALTH_PATH = `${PRODUCTION_COMMERCE_PREFIX}health`;

function json(payload: unknown, status: number): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/**
 * Production namespace boundary. Only a secret-safe health contract is
 * exposed until the complete commerce router is explicitly wired and tested.
 */
export function productionCommerceApiResponse(
  request: Request,
  env: ProductionCommerceEnvironment | undefined,
): Response | null {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PRODUCTION_COMMERCE_PREFIX)) return null;
  if (env?.APP_ENV !== "production") return json({ error: "not-found" }, 404);
  if (url.pathname !== PRODUCTION_HEALTH_PATH) {
    return json({ error: "not-found" }, 404);
  }
  if (request.method !== "GET") {
    return json({ error: "method-not-allowed" }, 405);
  }

  const gate = evaluateProductionReleaseGate(env);
  return json({
    status: gate.ready ? "ready" : "closed",
    environment: "production",
    mode: gate.mode,
    releaseSha: gate.releaseSha,
    origin: gate.origin,
    launchZones: gate.launchZones,
    blockers: gate.blockers,
    capabilities: gate.capabilities,
  }, gate.ready ? 200 : 503);
}
