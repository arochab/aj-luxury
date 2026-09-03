const PUBLIC_ADMIN_PREFIX = "/api/commerce/management";
const INTERNAL_ADMIN_PREFIX = "/api/commerce/admin";

export function normalizeAdminRoute(request: Request): Request {
  const url = new URL(request.url);
  if (url.pathname !== PUBLIC_ADMIN_PREFIX &&
    !url.pathname.startsWith(`${PUBLIC_ADMIN_PREFIX}/`)) return request;
  url.pathname = `${INTERNAL_ADMIN_PREFIX}${url.pathname.slice(PUBLIC_ADMIN_PREFIX.length)}`;
  return new Request(url, request);
}
