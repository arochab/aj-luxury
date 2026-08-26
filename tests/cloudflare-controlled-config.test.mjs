import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import JSON5 from "json5";
import { prepareBackendOnlyCommerceRequest } from "../worker/commerce-backend-bridge.ts";

const projectRoot = new URL("../", import.meta.url);
const privateOrigin = "https://aj-luxury-awwwards-private.arochab.chatgpt.site";

test("controlled Worker config is isolated from every public production resource", async () => {
  const source = await readFile(
    new URL("cloudflare.controlled.jsonc", projectRoot),
    "utf8",
  );
  const config = JSON5.parse(source);

  assert.equal(config.name, "aj-luxury-controlled-20260826");
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.equal("route" in config, false);
  assert.equal("routes" in config, false);

  assert.deepEqual(config.d1_databases, [{
    binding: "DB",
    database_name: "aj-luxury-controlled-20260826",
    database_id: "97ec3a4c-6299-41a0-bffd-cf9f010fa7c6",
  }]);
  assert.deepEqual(
    config.ratelimits.map(({ name, namespace_id: namespaceId }) => ({
      name,
      namespaceId,
    })),
    [
      { name: "COMMERCE_RATE_LIMITER", namespaceId: "8262601" },
      { name: "PROVIDER_RATE_LIMITER", namespaceId: "8262602" },
      { name: "WEBHOOK_RATE_LIMITER", namespaceId: "8262603" },
      { name: "OPERATOR_RATE_LIMITER", namespaceId: "8262604" },
    ],
  );

  assert.equal(config.vars.APP_ENV, "production");
  assert.equal(config.vars.COMMERCE_MODE, "controlled");
  assert.equal(config.vars.COMMERCE_BACKEND_ONLY, "true");
  assert.equal(config.vars.COMMERCE_ORIGIN, privateOrigin);
  assert.equal(config.vars.COMMERCE_CONTROLLED_STOREFRONT_ORIGIN, privateOrigin);
  assert.equal(config.vars.PAYMENT_PROVIDER, "stripe");
  assert.equal(config.vars.DELIVERY_PROVIDER, "sendcloud");
  assert.equal(config.vars.EMAIL_PROVIDER, "resend");
  assert.equal(config.vars.TRANSACTIONAL_FROM_EMAIL, "commandes@ajluxurystore.com");
  assert.equal(config.vars.TRANSACTIONAL_FROM_NAME, "AJ Luxury");

  const sourceWithoutApprovedSender = source.replace(
    '"TRANSACTIONAL_FROM_EMAIL": "commandes@ajluxurystore.com"',
    '"TRANSACTIONAL_FROM_EMAIL": "<approved-sender>"',
  );
  assert.doesNotMatch(sourceWithoutApprovedSender, /ajluxurystore\.com/i);
  assert.doesNotMatch(source, /aj-luxury-production/i);
  assert.doesNotMatch(source, /b02e8fc8-7309-43f7-a596-78fa51dc110d/i);
  assert.doesNotMatch(source, /826250[1-4]/);

  const forbiddenReleaseVariables = Object.keys(config.vars).filter((key) =>
    /SECRET|APPROVAL|RELEASE_SHA|PROMOTED_FROM|MANIFEST|ACCOUNT_ID|INTEGRATION_ID|SENDER_ADDRESS_ID|RESEND_DOMAIN|LEGAL_IDENTITY|POLICY_APPROVED|DRILL_APPROVED|ALERTS_APPROVED|CONTROLLED_OWNER|STOCK_IMPORT_ENABLED/.test(key),
  );
  assert.deepEqual(forbiddenReleaseVariables, []);

  const proxySecret = "controlled-proxy-secret-at-least-thirty-two-bytes";
  const prepared = prepareBackendOnlyCommerceRequest(new Request(
    "https://worker-controlled.example/api/commerce/cart",
    {
      method: "POST",
      headers: {
        Origin: privateOrigin,
        "Sec-Fetch-Site": "same-origin",
        "X-AJ-Commerce-Proxy-Secret": proxySecret,
        "X-AJ-Storefront-Origin": privateOrigin,
        "X-AJ-Proxy-Actor": "a".repeat(64),
        "X-AJ-Controlled-Authorization": `t=1000000000,v1=${"b".repeat(64)}`,
        "oai-authenticated-user-email": "owner@example.com",
        "oai-authenticated-user-id": "owner-controlled-1",
      },
      body: "{}",
      duplex: "half",
    },
  ), {
    ...config.vars,
    COMMERCE_PROXY_SECRET: proxySecret,
  });
  assert.equal(prepared.response, undefined);
  assert.equal(prepared.storefrontOrigin, privateOrigin);
  assert.equal(prepared.request.headers.get("X-AJ-Controlled-Authorization"), `t=1000000000,v1=${"b".repeat(64)}`);
  assert.equal(prepared.request.headers.get("oai-authenticated-user-id"), "owner-controlled-1");
});
