const LEGACY_PREVIEW_HOSTS = new Set([
  "aj-luxury-preview.adam-chabbi94.workers.dev",
  "aj-luxury-awwwards-branch-preview.adam-chabbi94.workers.dev",
]);

type LegacyPreviewRedirectEnvironment = Readonly<{
  APP_ENV?: string;
}>;

/**
 * Retire the two obsolete customer-facing preview links. Old e-mails cannot be
 * edited after delivery, so their Workers must canonicalize to the live site.
 * Search parameters are deliberately dropped: those previews used visual
 * experiment switches that have no meaning in production.
 */
export function legacyPreviewRedirectResponse(
  request: Request,
  env?: LegacyPreviewRedirectEnvironment,
): Response | null {
  if (env?.APP_ENV !== "preview") return null;
  const source = new URL(request.url);
  if (!LEGACY_PREVIEW_HOSTS.has(source.hostname.toLowerCase())) return null;

  const destination = new URL(source.pathname, "https://ajluxurystore.com");
  return new Response(null, {
    status: 308,
    headers: {
      Location: destination.toString(),
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
