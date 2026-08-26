import assert from "node:assert/strict";
import test from "node:test";
import {
  cloudflareAccessOwnerConfigurationValid,
  cloudflareAccessOwnerRequestAuthenticated,
} from "../worker/cloudflare-access-owner.ts";

const env = Object.freeze({
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://aj-luxury.cloudflareaccess.com",
  CLOUDFLARE_ACCESS_AUD: "accessAudience_1234567890",
  COMMERCE_CONTROLLED_OWNER_EMAIL: "adam@example.com",
});

function base64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function fixture(overrides = {}) {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "owner-key-1" }));
  const claims = base64Url(JSON.stringify({
    iss: env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
    aud: [env.CLOUDFLARE_ACCESS_AUD],
    sub: "access-user-1",
    email: "adam@example.com",
    iat: now - 1,
    nbf: now - 1,
    exp: now + 300,
    ...overrides,
  }));
  const signingInput = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" }, privateKey, new TextEncoder().encode(signingInput),
  ));
  const assertion = `${signingInput}.${base64Url(signature)}`;
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  return { assertion, jwk: { ...jwk, kid: "owner-key-1", alg: "RS256", use: "sig" } };
}

async function withCertificates(jwk, callback) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    assert.equal(url, `${env.CLOUDFLARE_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    return Response.json({ keys: [jwk] });
  };
  try {
    return await callback(() => calls);
  } finally {
    globalThis.fetch = original;
  }
}

test("Cloudflare Access owner configuration rejects attacker-controlled certificate origins", () => {
  assert.equal(cloudflareAccessOwnerConfigurationValid(env), true);
  assert.equal(cloudflareAccessOwnerConfigurationValid({ ...env, CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://example.com" }), false);
  assert.equal(cloudflareAccessOwnerConfigurationValid({ ...env, CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://aj-luxury.cloudflareaccess.com/path" }), false);
  assert.equal(cloudflareAccessOwnerConfigurationValid({ ...env, CLOUDFLARE_ACCESS_AUD: "short" }), false);
});

test("a valid signed Access assertion authenticates only the configured owner", async () => {
  const { assertion, jwk } = await fixture();
  await withCertificates(jwk, async (calls) => {
    const request = new Request("https://ajluxurystore.com/api/commerce/cart", {
      headers: { "Cf-Access-Jwt-Assertion": assertion },
    });
    assert.equal(await cloudflareAccessOwnerRequestAuthenticated(request, env), true);
    assert.equal(calls(), 1);
  });
});

test("Access assertions fail closed on wrong claims, expiry, or signature", async () => {
  for (const overrides of [
    { email: "other@example.com" },
    { aud: ["anotherAudience_1234567890"] },
    { iss: "https://other.cloudflareaccess.com" },
    { exp: Math.floor(Date.now() / 1000) - 120 },
  ]) {
    const { assertion, jwk } = await fixture(overrides);
    await withCertificates(jwk, async () => {
      const request = new Request("https://ajluxurystore.com/api/commerce/cart", {
        headers: { "Cf-Access-Jwt-Assertion": assertion },
      });
      assert.equal(await cloudflareAccessOwnerRequestAuthenticated(request, env), false);
    });
  }
  const signed = await fixture();
  const other = await fixture();
  await withCertificates(other.jwk, async () => {
    const request = new Request("https://ajluxurystore.com/api/commerce/cart", {
      headers: { "Cf-Access-Jwt-Assertion": signed.assertion },
    });
    assert.equal(await cloudflareAccessOwnerRequestAuthenticated(request, env), false);
  });
});

test("malformed or absent assertions never trigger a certificate fetch", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("not expected"); };
  try {
    assert.equal(await cloudflareAccessOwnerRequestAuthenticated(
      new Request("https://ajluxurystore.com/api/commerce/cart"), env,
    ), false);
    assert.equal(await cloudflareAccessOwnerRequestAuthenticated(
      new Request("https://ajluxurystore.com/api/commerce/cart", {
        headers: { "Cf-Access-Jwt-Assertion": "not-a-jwt" },
      }), env,
    ), false);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
