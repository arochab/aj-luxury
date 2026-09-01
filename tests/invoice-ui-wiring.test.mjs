import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("customer account exposes the printable invoice only for settled order statuses", async () => {
  const source = await readFile(
    new URL("../app/account/ProductionAccountClient.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /\["paid", "preparing", "shipped", "refunded"\]/);
  assert.match(source, /\/api\/commerce\/account\/invoices\/\$\{encodeURIComponent\(order\.orderNumber\)\}/);
  assert.match(source, /Ouvrir facture et avoirs A4/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /Aucun document de facturation tant que le paiement n’est pas confirmé/);
  assert.match(source, /l’avoir correspondant\s+y apparaît automatiquement/);
});

test("operator console keeps invoices and shipping labels explicitly separate", async () => {
  const source = await readFile(
    new URL("../app/operations/OperatorConsole.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /\["paid", "preparing", "shipped", "refunded"\]/);
  assert.match(source, /\/api\/commerce\/admin\/orders\/\$\{encodeURIComponent\(order\.orderId\)\}\/invoice/);
  assert.match(source, /Ouvrir facture et avoirs A4/);
  assert.match(source, /Télécharger l’étiquette transporteur A4/);
  assert.match(source, /Ce n’est pas une facture/);
  assert.match(source, /l’avoir correspondant est ajouté automatiquement/);
});
