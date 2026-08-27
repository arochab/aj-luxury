import assert from "node:assert/strict";
import test from "node:test";

const productRoutes = [
  "/products/pourpre",
  "/products/rose-pale",
  "/products/lilas-bleu-clair",
];

async function renderProductionProduct(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "size-guide",
    `${process.pid}-${Date.now()}-${Math.random()}`,
  );
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`https://ajluxurystore.com${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      APP_ENV: "production",
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

for (const pathname of productRoutes) {
  test(`${pathname} renders the validated body-waist size guide`, async () => {
    const response = await renderProductionProduct(pathname);
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.match(html, /<summary>Guide des tailles<\/summary>/);
    assert.match(html, /Mesurez votre tour de taille/);
    assert.match(html, /Tour de taille conseillé/);
    assert.match(html, /67–73 cm/);
    assert.match(html, /74–80 cm/);
    assert.match(html, /81–87 cm/);
    assert.match(html, /88–97 cm/);
    assert.match(html, /Ces indications concernent votre corps/);
    assert.doesNotMatch(html, />XS<|>XXL<|mesures? à confirmer/i);
  });
}
