import assert from "node:assert/strict";
import test from "node:test";

async function invokeDemo(pathname, envOverrides = {}, host = "localhost", headers = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("demo-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://${host}${pathname}`, {
      headers: { accept: "text/html", ...headers },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      AJ_RUNTIME: "demo",
      AJ_ENVIRONMENT: "preproduction",
      ...envOverrides,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

const routeCases = [
  ["/cart", /Panier/],
  ["/checkout", /Livraison et paiement/],
  ["/checkout/confirmation?destination=CA", /AJ-DEMO-1042/],
  ["/account", /Bonjour Alex/],
  ["/account/orders/AJ-DEMO-1042", /DEMO-DHL-1042/],
  ["/return", /Simuler un retour/],
  ["/refund", /29,99/],
  ["/demo-control", /Le client, de l’achat au remboursement/],
];

for (const [pathname, marker] of routeCases) {
  test(`private demo renders ${pathname} with no-store and noindex`, async () => {
    const response = await invokeDemo(pathname);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    assert.equal(response.headers.get("cache-tag"), null);
    assert.equal(response.headers.get("set-cookie"), null);
    const html = await response.text();
    assert.match(html, marker);
    assert.match(html, /SIMULATION/);
    assert.doesNotMatch(html, /sk_live_|pk_live_|client_secret/i);
  });
}

test("edge guard hides the demo from production runtime and production host", async () => {
  const wrongRuntime = await invokeDemo("/account", {
    AJ_RUNTIME: "production",
    AJ_ENVIRONMENT: "production",
  });
  assert.equal(wrongRuntime.status, 404);
  assert.equal(await wrongRuntime.text(), "Not found");

  const productionHost = await invokeDemo("/account", {}, "ajluxurystore.com");
  assert.equal(productionHost.status, 404);
  assert.equal(await productionHost.text(), "Not found");

  const spoofedHost = await invokeDemo(
    "/account",
    {},
    "ajluxurystore.com",
    { "x-forwarded-host": "localhost" },
  );
  assert.equal(spoofedHost.status, 404);
  assert.equal(await spoofedHost.text(), "Not found");

  for (const pathname of [
    "/%61ccount",
    "/%2561ccount",
    "/%63art",
    "/%63heckout",
    "/%72eturn",
    "/%72efund",
    "/%64emo-control",
  ]) {
    const encoded = await invokeDemo(pathname, {
      AJ_RUNTIME: "production",
      AJ_ENVIRONMENT: "production",
    });
    assert.equal(encoded.status, 404, pathname);
    assert.equal(await encoded.text(), "Not found", pathname);
  }
});

test("Canada remains Canada from confirmation through account and tracking", async () => {
  const confirmation = await invokeDemo("/checkout/confirmation?destination=CA");
  const confirmationHtml = await confirmation.text();
  assert.match(confirmationHtml, /Toronto[\s\S]*Canada/);
  assert.match(confirmationHtml, /48,89/);
  assert.match(confirmationHtml, /account\/orders\/AJ-DEMO-1042\?destination=CA/);
  assert.match(confirmationHtml, /account\?destination=CA/);

  const account = await invokeDemo("/account?destination=CA");
  const accountHtml = await account.text();
  assert.match(accountHtml, /Total simulé[\s\S]*Canada/);
  assert.match(accountHtml, /48,89/);
  assert.match(accountHtml, /Toronto/);
  assert.match(accountHtml, /AJ-DEMO-1042\?destination=CA/);

  const order = await invokeDemo("/account/orders/AJ-DEMO-1042?destination=CA");
  const orderHtml = await order.text();
  assert.match(orderHtml, /Toronto/);
  assert.match(orderHtml, /Canada/);
  assert.match(orderHtml, /DAP/);
  assert.match(orderHtml, /48,89/);
  assert.match(orderHtml, /return\?destination=CA/);
});
