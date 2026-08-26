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
  /63\D{0,40}63\D{0,40}63\D{0,40}63/,
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
    /(?:60|61|63)\s+(?:en stock|disponibles?)/i,
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
    physical: 102,
    reserved: 2,
    availableToSell: 100,
  });
  assert.deepEqual(getInternalStockPosition("unknown", "S"), {
    physical: 0,
    reserved: 0,
    availableToSell: 0,
  });
});

test("public stock projection never exposes a quantity above five", () => {
  assert.deepEqual(toPublicStockStatus(61), { state: "available" });
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
  /* `aria-disabled`, pas `disabled`. L'assertion attendait encore la forme
     native, abandonnee depuis : un bouton nativement desactive sort de l'ordre
     de tabulation et n'est plus annonce, donc le refus de vente devient muet
     pour un lecteur d'ecran. Le contrat verifie ici est donc double, et plus
     strict que l'ancien : la taille epuisee porte bien l'etat refuse, ET le
     refus est reellement applique dans le gestionnaire de selection, pas
     seulement signale visuellement. */
  assert.match(clientSource, /aria-disabled=\{soldOut/);
  assert.match(clientSource, /if \(isSoldOut\(size\)\) return;/);
  assert.match(clientSource, /product\.available/);
  assert.match(clientSource, /product\.lowStockSimulated/);
  /* L'interdiction seche de `product.onlyLeft` datait du temps ou ce composant
     ne servait que la preproduction : afficher un compte exact y aurait ete un
     chiffre invente. Depuis, une branche production existe et affiche le compte
     reel. Interdire le libelle partout revenait a interdire une fonctionnalite
     du magasin en ligne, pas a proteger une donnee.
     Ce qui doit rester garanti est plus precis, et c'est ce qu'on verifie ici :
     le chemin SIMULE ne divulgue jamais de compte, le compte exact appartient
     au seul chemin reel. La forme ternaire est donc epinglee telle quelle. */
  assert.match(
    clientSource,
    /simulated\s*\?\s*t\("product\.lowStockSimulated"\)\s*:\s*t\("product\.onlyLeft"\)/,
  );
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
    "/cart?variant=variant_boxer_pourpre_m",
    "/checkout?variant=variant_boxer_pourpre_m",
  ]) {
    const response = await render(pathname);
    const html = await response.text();

    assert.equal(response.status, 200);
    assertNoStockLeak(html);
  }
});
