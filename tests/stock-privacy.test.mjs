import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getInternalStockPosition,
  getPublicStockBySize,
  toPublicStockStatus,
} from "../lib/commerce/internal-stock.ts";

function readSource(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

function readTree(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory() ? [readTree(path)] : [readFileSync(path, "utf8")];
    })
    .join("\n");
}

const exactStockSignatures = [
  /26\D{0,40}103\D{0,40}87\D{0,40}36/,
  /26\D{0,40}102\D{0,40}88\D{0,40}36/,
];

function assertNoStockLeak(payload) {
  assert.doesNotMatch(
    payload,
    /availableToSell|inventoryQuantity|product\.inventory/,
  );
  assert.doesNotMatch(
    payload,
    /physical.{0,160}reserved.{0,160}availableToSell/,
  );
  assert.doesNotMatch(
    payload,
    /(?:26|36|87|88|102|103)\s+(?:en stock|disponibles?)/i,
  );

  for (const signature of exactStockSignatures) {
    assert.doesNotMatch(payload, signature);
  }
}

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "stock-audit",
    `${process.pid}-${Date.now()}-${Math.random()}`,
  );
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
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

test("internal stock separates physical, reserved and available-to-sell", () => {
  assert.deepEqual(getInternalStockPosition("pourpre", "M"), {
    physical: 103,
    reserved: 0,
    availableToSell: 103,
  });
  assert.deepEqual(getInternalStockPosition("unknown", "S"), {
    physical: 0,
    reserved: 0,
    availableToSell: 0,
  });
});

test("public stock projection never exposes a quantity above five", () => {
  assert.deepEqual(toPublicStockStatus(103), { state: "available" });
  assert.deepEqual(toPublicStockStatus(6), { state: "available" });
  assert.deepEqual(toPublicStockStatus(5), {
    state: "low-stock",
    remaining: 5,
  });
  assert.deepEqual(toPublicStockStatus(1), {
    state: "low-stock",
    remaining: 1,
  });
  assert.deepEqual(toPublicStockStatus(0), { state: "sold-out" });

  const publicProjection = getPublicStockBySize("pourpre");
  assert.deepEqual(publicProjection, {
    S: { state: "available" },
    M: { state: "available" },
    L: { state: "available" },
    XL: { state: "available" },
  });
  assert.doesNotMatch(
    JSON.stringify(publicProjection),
    /physical|reserved|availableToSell|inventory|quantity|remaining/i,
  );
});

test("the client purchase component receives only public stock states", () => {
  const clientSource = readSource(
    "../app/components/ProductPurchase.tsx",
  );
  const productSource = readSource("../lib/products.ts");
  const productPageSource = readSource(
    "../app/products/[slug]/page.tsx",
  );

  assert.match(clientSource, /PublicStockBySize/);
  assert.match(clientSource, /disabled=\{soldOut\}/);
  assert.match(clientSource, /product\.available/);
  assert.match(clientSource, /product\.onlyLeft/);
  assert.match(clientSource, /product\.soldOut/);
  assert.match(productPageSource, /getPublicStockBySize/);
  assert.match(productPageSource, /availability=\{availability\}/);
  assert.doesNotMatch(
    clientSource,
    /physical|reserved|availableToSell|inventoryQuantity|product\.inventory/,
  );
  assert.doesNotMatch(productSource, /\binventory\s*:/);
});

test("client bundles and RSC HTML contain no internal stock payload", async () => {
  const clientDirectory = fileURLToPath(
    new URL("../dist/client", import.meta.url),
  );
  assert.equal(statSync(clientDirectory).isDirectory(), true);

  const clientBundle = readTree(clientDirectory);
  assertNoStockLeak(clientBundle);

  for (const pathname of [
    "/products/pourpre",
    "/cart?variant=AJ-APO-POU-M",
    "/checkout?variant=AJ-APO-POU-M",
  ]) {
    const response = await render(pathname);
    const html = await response.text();

    assert.equal(response.status, 200);
    assertNoStockLeak(html);
  }
});
