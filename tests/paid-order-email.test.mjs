import assert from "node:assert/strict";
import test from "node:test";
import { buildPaidOrderEmail } from "../lib/commerce/paid-order-email.ts";
import {
  DURABLE_TERMS_SHA256,
  DURABLE_TERMS_TEXT,
  durableTermsSnapshotFor,
} from "../lib/legal-terms-snapshot.ts";

test("durable terms hash identifies the exact embedded snapshot", async () => {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(DURABLE_TERMS_TEXT),
  ));
  assert.equal(
    Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    DURABLE_TERMS_SHA256,
  );
});

test("the previous contractual snapshot remains immutable and replayable", async () => {
  const legacy = durableTermsSnapshotFor("2026-08-26");
  assert.ok(legacy);
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(legacy.text),
  ));
  assert.equal(
    Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    legacy.sha256,
  );
  assert.equal(legacy.sha256, "f36436387b875dfeee3e538cf9b51005e04bbea5bbb7e809e870e52c81e4ea82");
});

test("the first 2026-09-01 contractual snapshot remains immutable after r2", async () => {
  const legacy = durableTermsSnapshotFor("2026-09-01");
  assert.ok(legacy);
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(legacy.text),
  ));
  assert.equal(
    Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    legacy.sha256,
  );
  assert.equal(legacy.sha256, "f90633c3c43de0fbb7b43d55723243b482e574f870824d8942aae0cdfcb9bb85");
});

test("the 2026-09-01-r2 contractual snapshot remains immutable after international launch", async () => {
  const legacy = durableTermsSnapshotFor("2026-09-01-r2");
  assert.ok(legacy);
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(legacy.text),
  ));
  assert.equal(
    Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    legacy.sha256,
  );
  assert.equal(legacy.sha256, "adceef68a1e5ba6d1453f73e0c67273a0efff9458cfb584b08032c371911bd96");
});

test("order confirmation embeds line, delivery, zero VAT and the immutable terms snapshot", () => {
  const email = buildPaidOrderEmail("order-confirmation", {
    orderNumber: "AJ-2026-0042",
    lines: [
      { productName: "Apollon", colorName: "Rose", size: "M", quantity: 2, lineTotalCents: 5998 },
    ],
    subtotalCents: 4999,
    discountCents: 999,
    shippingCents: 350,
    taxCents: 0,
    totalCents: 5349,
    deliveryName: "Mondial Relay",
    deliveryMode: "service_point",
    deliveryAddressLines: ["Ada Test", "1 rue du Test", "75001 Paris", "FR"],
    termsVersion: "2026-08-26",
  });
  assert.match(email.text, /Apollon · Rose · Taille M × 2 — 59,98 €/);
  assert.match(email.text, /Remise pack : −9,99 €/);
  assert.match(email.text, /Mondial Relay · Point relais/);
  assert.match(email.text, /Adresse de livraison : Ada Test, 1 rue du Test, 75001 Paris, FR/);
  assert.match(email.text, /TVA : 0,00 €/);
  assert.match(email.text, /art\. 293 B/);
  assert.match(email.text, /Facture commerciale numérotée : https:\/\/ajluxurystore\.com\/account/);
  assert.match(email.text, /terms\?version=2026-08-26/);
  assert.match(email.text, /Empreinte SHA-256 du snapshot contractuel : [0-9a-f]{64}/);
  assert.match(email.text, /CONDITIONS GÉNÉRALES DE VENTE AJ LUXURY/);
  assert.ok(new TextEncoder().encode(email.text).byteLength < 12_000);
});

test("payment confirmation is a distinct concise receipt", () => {
  const email = buildPaidOrderEmail("payment-confirmation", {
    orderNumber: "AJ-2026-0042",
    lines: [{ productName: "Apollon", colorName: "Rose", size: "M", quantity: 1, lineTotalCents: 2999 }],
    subtotalCents: 2999,
    discountCents: 0,
    shippingCents: 350,
    taxCents: 0,
    totalCents: 3349,
    deliveryName: "Colissimo",
    deliveryMode: "home",
    deliveryAddressLines: ["Ada Test", "1 rue du Test", "75001 Paris", "FR"],
    termsVersion: "2026-08-26",
  });
  assert.match(email.text, /Montant payé : 33,49 €/);
  assert.doesNotMatch(email.text, /CONDITIONS GÉNÉRALES DE VENTE/);
  assert.doesNotMatch(email.text, /Articles/);
});

test("paid-order durable copy rejects non-zero VAT and crossed totals", () => {
  const base = {
    orderNumber: "AJ-2026-0042",
    lines: [{ productName: "Apollon", colorName: "Rose", size: "M", quantity: 1, lineTotalCents: 2999 }],
    subtotalCents: 2999,
    discountCents: 0,
    shippingCents: 350,
    taxCents: 0,
    totalCents: 3349,
    deliveryName: "Colissimo",
    deliveryMode: "home",
    deliveryAddressLines: ["Ada Test", "1 rue du Test", "75001 Paris", "FR"],
    termsVersion: "2026-08-26",
  };
  assert.throws(() => buildPaidOrderEmail("order-confirmation", { ...base, taxCents: 1, totalCents: 3350 }), /Incoherent/);
  assert.throws(() => buildPaidOrderEmail("order-confirmation", { ...base, totalCents: 1 }), /Incoherent/);
});
