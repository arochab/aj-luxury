import assert from "node:assert/strict";
import { test } from "node:test";
import {
  commerceBackendProxyResponse,
  prepareBackendOnlyCommerceRequest,
} from "../worker/commerce-backend-bridge.ts";
import { productionCommerceApiResponse } from "../worker/production-commerce-api.ts";

const publicOrigin = "https://ajluxurystore.com";
const privateOrigin = "https://aj-luxury-awwwards-private.arochab.chatgpt.site";
const backendOrigin = "https://aj-luxury-production.example.workers.dev";
const proxySecret = "proxy-secret-value-longer-than-thirty-two-bytes";
const controlledSecret = "controlled-secret-value-longer-than-thirty-two";
const allowlist = JSON.stringify([publicOrigin, privateOrigin]);

function frontendEnv(overrides = {}) {
  return {
    COMMERCE_BACKEND_ORIGIN: backendOrigin,
    COMMERCE_PROXY_SECRET: proxySecret,
    COMMERCE_STOREFRONT_ORIGINS_JSON: allowlist,
    ...overrides,
  };
}

function backendEnv(overrides = {}) {
  return {
    COMMERCE_BACKEND_ONLY: "true",
    COMMERCE_MODE: "controlled",
    COMMERCE_ORIGIN: publicOrigin,
    COMMERCE_PROXY_SECRET: proxySecret,
    COMMERCE_CONTROLLED_STOREFRONT_ORIGIN: privateOrigin,
    COMMERCE_PUBLIC_STOREFRONT_ORIGINS_JSON: JSON.stringify([publicOrigin]),
    ...overrides,
  };
}

function mutation(origin, pathname = "/api/commerce/cart", headers = {}) {
  return new Request(`${origin}${pathname}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Sec-Fetch-Site": "same-origin",
      "CF-Connecting-IP": "203.0.113.7",
      "Content-Type": "application/json",
      ...headers,
    },
    body: "{}",
    duplex: "half",
  });
}

test("private storefront proxy preserves request data and overwrites spoofed bridge headers", async () => {
  let captured;
  const request = mutation(privateOrigin, "/api/commerce/cart?locale=fr", {
    Cookie: "__Host-aj_cart=one; __Host-aj_cart_csrf=two; CF_Authorization=platform-secret",
    "X-CSRF-Token": "two",
    "X-AJ-Commerce-Proxy-Secret": "spoofed",
    "X-AJ-Storefront-Origin": "https://evil.example",
  });
  const response = await commerceBackendProxyResponse(request, frontendEnv(), async (upstream) => {
    captured = upstream;
    return Response.json({ ok: true });
  });
  assert.equal(response?.status, 200);
  assert.equal(captured.url, `${backendOrigin}/api/commerce/cart?locale=fr`);
  assert.equal(captured.headers.get("Origin"), privateOrigin);
  assert.equal(captured.headers.get("Cookie"), "__Host-aj_cart=one; __Host-aj_cart_csrf=two");
  assert.equal(captured.headers.get("X-CSRF-Token"), "two");
  assert.equal(captured.headers.get("X-AJ-Commerce-Proxy-Secret"), proxySecret);
  assert.equal(captured.headers.get("X-AJ-Storefront-Origin"), privateOrigin);
  assert.match(captured.headers.get("X-AJ-Proxy-Actor"), /^[0-9a-f]{64}$/);
  assert.equal(await captured.text(), "{}");
});

test("public storefront and GET without Origin are allowed", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return new Response("ok"); };
  assert.equal((await commerceBackendProxyResponse(mutation(publicOrigin), frontendEnv(), fetcher))?.status, 200);
  assert.equal((await commerceBackendProxyResponse(
    new Request(`${privateOrigin}/api/commerce/cart`, {
      headers: { "CF-Connecting-IP": "203.0.113.7" },
    }), frontendEnv(), fetcher,
  ))?.status, 200);
  assert.equal(calls, 2);
});

test("hostile request URL and hostile Origin are rejected before upstream", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return new Response("wrong"); };
  assert.equal((await commerceBackendProxyResponse(mutation("https://evil.example"), frontendEnv(), fetcher))?.status, 503);
  const request = mutation(publicOrigin, "/api/commerce/cart", { Origin: "https://evil.example" });
  assert.equal((await commerceBackendProxyResponse(request, frontendEnv(), fetcher))?.status, 403);
  assert.equal(calls, 0);
});

test("browser mutations require exact Origin and same-origin fetch metadata", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return new Response("wrong"); };
  for (const headers of [
    { "Sec-Fetch-Site": "same-origin" },
    { Origin: publicOrigin },
    { Origin: publicOrigin, "Sec-Fetch-Site": "cross-site" },
  ]) {
    const request = new Request(`${publicOrigin}/api/commerce/cart`, {
      method: "POST", headers, body: "{}", duplex: "half",
    });
    assert.equal((await commerceBackendProxyResponse(request, frontendEnv(), fetcher))?.status, 403);
  }
  assert.equal(calls, 0);
});

test("invalid configuration fails closed", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return new Response("wrong"); };
  const configurations = [
    { COMMERCE_STOREFRONT_ORIGINS_JSON: "{" },
    { COMMERCE_STOREFRONT_ORIGINS_JSON: JSON.stringify(["http://ajluxurystore.com"]) },
    { COMMERCE_STOREFRONT_ORIGINS_JSON: JSON.stringify([`${publicOrigin}/shop`]) },
    { COMMERCE_PROXY_SECRET: "short" },
    { COMMERCE_BACKEND_ORIGIN: publicOrigin },
    { COMMERCE_BACKEND_ONLY: "true" },
  ];
  for (const override of configurations) {
    assert.equal((await commerceBackendProxyResponse(
      mutation(publicOrigin), frontendEnv(override), fetcher,
    ))?.status, 503);
  }
  assert.equal(calls, 0);
});

test("encoded path stays pinned to the configured backend origin", async () => {
  let captured;
  const response = await commerceBackendProxyResponse(
    new Request(`${publicOrigin}/api/commerce/%2f%2fevil.example`, {
      headers: { Origin: publicOrigin, "CF-Connecting-IP": "203.0.113.7" },
    }),
    frontendEnv(),
    async (request) => { captured = request; return new Response("ok"); },
  );
  assert.equal(response?.status, 200);
  assert.equal(new URL(captured.url).origin, backendOrigin);
  assert.equal(new URL(captured.url).pathname, "/api/commerce/%2f%2fevil.example");
});

test("upstream redirects and network errors are hidden", async () => {
  const redirected = await commerceBackendProxyResponse(
    new Request(`${publicOrigin}/api/commerce/cart`, {
      headers: { "CF-Connecting-IP": "203.0.113.7" },
    }),
    frontendEnv(),
    async () => new Response(null, { status: 302, headers: { Location: "https://evil.example" } }),
  );
  assert.equal(redirected?.status, 502);
  assert.equal(redirected?.headers.get("Location"), null);
  const failed = await commerceBackendProxyResponse(
    new Request(`${publicOrigin}/api/commerce/cart`, {
      headers: { "CF-Connecting-IP": "203.0.113.7" },
    }),
    frontendEnv(),
    async () => { throw new Error("offline"); },
  );
  assert.equal(failed?.status, 502);
});

test("upstream cookies and request cookies are preserved", async () => {
  let incomingCookie;
  const response = await commerceBackendProxyResponse(
    new Request(`${publicOrigin}/api/commerce/cart`, { headers: {
      Cookie: "__Host-aj_cart=one; CF_Authorization=platform-secret",
      Authorization: "Bearer platform-secret",
      "Cf-Access-Jwt-Assertion": "platform-jwt",
      "CF-Access-Client-Id": "platform-client",
      "CF-Access-Client-Secret": "service-secret",
      "CF-Access-Authenticated-User-Email": "platform@example.com",
      "CF-Connecting-IP": "203.0.113.7",
    } }),
    frontendEnv(),
    async (request) => {
      incomingCookie = request.headers.get("Cookie");
      assert.equal(request.headers.get("Authorization"), null);
      assert.equal(request.headers.get("Cf-Access-Jwt-Assertion"), null);
      assert.equal(request.headers.get("CF-Access-Client-Id"), null);
      assert.equal(request.headers.get("CF-Access-Client-Secret"), null);
      assert.equal(request.headers.get("CF-Access-Authenticated-User-Email"), null);
      const headers = new Headers();
      headers.append("Set-Cookie", "cart=two; Secure; HttpOnly");
      headers.append("Set-Cookie", "csrf=three; Secure");
      headers.append("Set-Cookie", "__Host-aj_cart_csrf=three; Secure");
      headers.set("Clear-Site-Data", '"cookies"');
      headers.set("X-AJ-Commerce-Proxy-Secret", "upstream-secret");
      headers.set("X-AJ-Controlled-Authorization", "upstream-signature");
      headers.set("X-AJ-Proxy-Actor", "upstream-actor");
      headers.set("X-AJ-Trusted-Rate-Limit-Actor", "upstream-rate-limit-actor");
      headers.set("oai-authenticated-user-email", "owner@example.com");
      headers.set("oai-authenticated-user-id", "owner-1");
      return new Response("ok", { headers });
    },
  );
  assert.equal(incomingCookie, "__Host-aj_cart=one");
  const cookies = response?.headers.getSetCookie?.() ?? [];
  assert.deepEqual(cookies, ["__Host-aj_cart_csrf=three; Secure"]);
  assert.equal(response?.headers.get("Clear-Site-Data"), null);
  for (const name of [
    "X-AJ-Commerce-Proxy-Secret", "X-AJ-Controlled-Authorization",
    "X-AJ-Proxy-Actor", "X-AJ-Trusted-Rate-Limit-Actor",
    "oai-authenticated-user-email", "oai-authenticated-user-id",
  ]) assert.equal(response?.headers.get(name), null);
});

test("private bridge authenticates the stock-import route without an injected authenticator", async () => {
  const releaseSha = "a".repeat(40);
  const pathname = "/api/commerce/admin/launch-stock-import";
  const frontend = frontendEnv({
    COMMERCE_STOREFRONT_ORIGINS_JSON: JSON.stringify([privateOrigin]),
    COMMERCE_SITES_OWNER_AUTH_ENABLED: "true",
    COMMERCE_SITES_OWNER_AUTH_ORIGIN: privateOrigin,
    COMMERCE_CONTROLLED_OWNER_EMAIL: "adam@example.com",
    COMMERCE_CONTROLLED_AUTH_HMAC_SECRET: controlledSecret,
  });
  const backend = backendEnv({
    APP_ENV: "production",
    PRODUCTION_STOCK_IMPORT_ENABLED: "true",
    COMMERCE_RELEASE_SHA: releaseSha,
    CF_VERSION_METADATA: { id: "worker-version", tag: releaseSha },
    COMMERCE_ADAM_APPROVAL_SHA: releaseSha,
    COMMERCE_JEREMY_APPROVAL_SHA: releaseSha,
    STOCK_MANIFEST_ID: "ajl-launch-20260825-v1",
    STOCK_MANIFEST_SHA256: "b".repeat(64),
    STOCK_MANIFEST_APPROVED_BY: "jeremy",
    COMMERCE_CONTROLLED_OWNER_EMAIL: "adam@example.com",
    COMMERCE_CONTROLLED_AUTH_HMAC_SECRET: controlledSecret,
    DB: {},
  });
  const request = mutation(privateOrigin, pathname, {
    "oai-authenticated-user-email": "adam@example.com",
    "oai-authenticated-user-id": "owner-1",
    "X-AJ-Release-SHA": releaseSha,
    "X-AJ-Stock-Import-Confirmation": "WRONG_ON_PURPOSE",
  });
  const response = await commerceBackendProxyResponse(request, frontend, async (proxied) => {
    const ingress = prepareBackendOnlyCommerceRequest(proxied, backend);
    assert.equal(ingress.response, undefined);
    return productionCommerceApiResponse(ingress.request, backend, {
      trustedStorefrontOrigin: ingress.storefrontOrigin,
    });
  });
  assert.equal(response?.status, 503);
  assert.equal((await response?.json()).error.code, "STOCK_IMPORT_RELEASE_EVIDENCE_MISSING");
});

test("backend-only mode exposes commerce API only", () => {
  for (const path of ["/", "/assets/x.js", "/api/preprod/cart"]) {
    const result = prepareBackendOnlyCommerceRequest(new Request(`${backendOrigin}${path}`), backendEnv());
    assert.equal(result.response?.status, 404);
  }
});

test("backend-only browser API requires correct proxy secret", () => {
  for (const secret of [undefined, "wrong-secret-value-longer-than-thirty-two"]) {
    const headers = {
      Origin: privateOrigin,
      "Sec-Fetch-Site": "same-origin",
      "X-AJ-Storefront-Origin": privateOrigin,
      "X-AJ-Proxy-Actor": "a".repeat(64),
      ...(secret ? { "X-AJ-Commerce-Proxy-Secret": secret } : {}),
    };
    const result = prepareBackendOnlyCommerceRequest(
      mutation(backendOrigin, "/api/commerce/cart", headers), backendEnv(),
    );
    assert.equal(result.response?.status, 401);
  }
});

test("backend-only normalizes private browser request and preserves controlled authorization", async () => {
  const request = mutation(backendOrigin, "/api/commerce/cart?x=1", {
    Origin: privateOrigin,
    Cookie: "__Host-aj_cart=one",
    "X-AJ-Commerce-Proxy-Secret": proxySecret,
    "X-AJ-Storefront-Origin": privateOrigin,
    "X-AJ-Proxy-Actor": "a".repeat(64),
    "X-AJ-Controlled-Authorization": "t=1000000000,v1=" + "a".repeat(64),
    "oai-authenticated-user-email": "adam@example.com",
    "oai-authenticated-user-id": "owner-1",
  });
  const result = prepareBackendOnlyCommerceRequest(request, backendEnv());
  assert.equal(result.storefrontOrigin, privateOrigin);
  assert.equal(result.request.url, `${publicOrigin}/api/commerce/cart?x=1`);
  assert.equal(result.request.headers.get("Origin"), publicOrigin);
  assert.equal(result.request.headers.get("Cookie"), "__Host-aj_cart=one");
  assert.equal(result.request.headers.get("X-AJ-Commerce-Proxy-Secret"), null);
  assert.equal(result.request.headers.get("X-AJ-Storefront-Origin"), null);
  assert.equal(result.request.headers.get("X-AJ-Trusted-Rate-Limit-Actor"), "a".repeat(64));
  assert.equal(result.request.headers.get("oai-authenticated-user-id"), "owner-1");
  assert.equal(await result.request.text(), "{}");
});

test("backend-only accepts public origin and rejects an unlisted origin", () => {
  const allowed = prepareBackendOnlyCommerceRequest(mutation(backendOrigin, "/api/commerce/cart", {
    Origin: publicOrigin,
    "X-AJ-Commerce-Proxy-Secret": proxySecret,
    "X-AJ-Storefront-Origin": publicOrigin,
    "X-AJ-Proxy-Actor": "a".repeat(64),
  }), backendEnv({ COMMERCE_MODE: "live" }));
  assert.equal(allowed.storefrontOrigin, publicOrigin);
  const hostile = prepareBackendOnlyCommerceRequest(mutation(backendOrigin, "/api/commerce/cart", {
    Origin: "https://evil.example",
    "X-AJ-Commerce-Proxy-Secret": proxySecret,
    "X-AJ-Storefront-Origin": "https://evil.example",
    "X-AJ-Proxy-Actor": "a".repeat(64),
  }), backendEnv());
  assert.equal(hostile.response?.status, 403);
});

test("controlled backend accepts only the private storefront while live partitions public and private", () => {
  const browserRequest = (origin) => mutation(backendOrigin, "/api/commerce/cart", {
    Origin: origin,
    "X-AJ-Commerce-Proxy-Secret": proxySecret,
    "X-AJ-Storefront-Origin": origin,
    "X-AJ-Proxy-Actor": "a".repeat(64),
  });
  assert.equal(
    prepareBackendOnlyCommerceRequest(browserRequest(privateOrigin), backendEnv()).storefrontOrigin,
    privateOrigin,
  );
  assert.equal(
    prepareBackendOnlyCommerceRequest(
      browserRequest(privateOrigin),
      backendEnv({ COMMERCE_PUBLIC_STOREFRONT_ORIGINS_JSON: undefined }),
    ).storefrontOrigin,
    privateOrigin,
  );
  assert.equal(
    prepareBackendOnlyCommerceRequest(browserRequest(publicOrigin), backendEnv()).response?.status,
    403,
  );
  assert.equal(
    prepareBackendOnlyCommerceRequest(
      browserRequest(publicOrigin), backendEnv({ COMMERCE_MODE: "live" }),
    ).storefrontOrigin,
    publicOrigin,
  );
  assert.equal(
    prepareBackendOnlyCommerceRequest(
      browserRequest(privateOrigin), backendEnv({ COMMERCE_MODE: "live" }),
    ).storefrontOrigin,
    privateOrigin,
  );
});

test("private Sites owner gets a fresh signature while public spoofing is removed", async () => {
  let privateHeaders;
  const ownerRequest = mutation(privateOrigin, "/api/commerce/cart", {
    "oai-authenticated-user-email": "adam@example.com",
    "oai-authenticated-user-id": "owner-1",
    "X-AJ-Controlled-Authorization": "spoofed",
  });
  await commerceBackendProxyResponse(ownerRequest, frontendEnv({
    COMMERCE_SITES_OWNER_AUTH_ENABLED: "true",
    COMMERCE_SITES_OWNER_AUTH_ORIGIN: privateOrigin,
    COMMERCE_CONTROLLED_OWNER_EMAIL: "adam@example.com",
    COMMERCE_CONTROLLED_AUTH_HMAC_SECRET: controlledSecret,
  }), async (request) => { privateHeaders = request.headers; return new Response("ok"); });
  assert.match(privateHeaders.get("X-AJ-Controlled-Authorization"), /^t=\d{10},v1=[0-9a-f]{64}$/);

  let publicHeaders;
  await commerceBackendProxyResponse(mutation(publicOrigin, "/api/commerce/cart", {
    "oai-authenticated-user-email": "adam@example.com",
    "oai-authenticated-user-id": "owner-1",
    "X-AJ-Controlled-Authorization": "spoofed",
  }), frontendEnv({
    COMMERCE_SITES_OWNER_AUTH_ENABLED: "true",
    COMMERCE_SITES_OWNER_AUTH_ORIGIN: privateOrigin,
    COMMERCE_CONTROLLED_OWNER_EMAIL: "adam@example.com",
    COMMERCE_CONTROLLED_AUTH_HMAC_SECRET: controlledSecret,
  }), async (request) => { publicHeaders = request.headers; return new Response("ok"); });
  assert.equal(publicHeaders.get("X-AJ-Controlled-Authorization"), null);
  assert.equal(publicHeaders.get("oai-authenticated-user-email"), null);
});

test("backend-only webhooks require metadata but not proxy secret", () => {
  const stripe = prepareBackendOnlyCommerceRequest(new Request(
    `${backendOrigin}/api/commerce/webhooks/stripe`,
    { method: "POST", headers: { "Stripe-Signature": "t=1,v1=abc" }, body: "{}", duplex: "half" },
  ), backendEnv());
  assert.equal(stripe.request.url, `${publicOrigin}/api/commerce/webhooks/stripe`);
  assert.equal(stripe.storefrontOrigin, null);
  const stripeMissing = prepareBackendOnlyCommerceRequest(new Request(
    `${backendOrigin}/api/commerce/webhooks/stripe`,
    { method: "POST", body: "{}", duplex: "half" },
  ), backendEnv());
  assert.equal(stripeMissing.response?.status, 400);

  const resend = prepareBackendOnlyCommerceRequest(new Request(
    `${backendOrigin}/api/commerce/webhooks/resend`,
    { method: "POST", headers: { "svix-id": "id", "svix-timestamp": "1", "svix-signature": "v1,x" }, body: "{}", duplex: "half" },
  ), backendEnv());
  assert.equal(resend.request.url, `${publicOrigin}/api/commerce/webhooks/resend`);
  const resendMissing = prepareBackendOnlyCommerceRequest(new Request(
    `${backendOrigin}/api/commerce/webhooks/resend`,
    { method: "POST", headers: { "svix-id": "id" }, body: "{}", duplex: "half" },
  ), backendEnv());
  assert.equal(resendMissing.response?.status, 400);
});

test("storefront never proxies webhook routes", async () => {
  let calls = 0;
  const response = await commerceBackendProxyResponse(new Request(
    `${publicOrigin}/api/commerce/webhooks/stripe`,
    {
      method: "POST",
      headers: { "Stripe-Signature": "t=1,v1=abc", "CF-Connecting-IP": "203.0.113.8" },
      body: "{}",
      duplex: "half",
    },
  ), frontendEnv(), async () => { calls += 1; return new Response("wrong"); });
  assert.equal(response?.status, 404);
  assert.equal(calls, 0);
});
