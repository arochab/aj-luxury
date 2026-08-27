import assert from "node:assert/strict";
import test from "node:test";

import { ResendIdentityDelivery } from "../lib/commerce/resend-identity-delivery.ts";

function deliveryHarness() {
  const requests = [];
  const delivery = new ResendIdentityDelivery({
    apiKey: "re_production_test_only",
    fromEmail: "commandes@ajluxurystore.com",
    fromName: "AJ Luxury",
    replyTo: "contact@ajluxurystore.com",
    storefrontOrigin: "https://ajluxurystore.com",
    fetchImpl: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
    },
  });
  return { delivery, requests };
}

const base = Object.freeze({
  destinationEmail: "adam@example.com",
  rawToken: "A".repeat(64),
  expiresAt: "2099-08-27T20:00:00.000Z",
});

test("account verification email is concise, branded and action-led in HTML and text", async () => {
  const { delivery, requests } = deliveryHarness();
  await delivery.deliver({
    ...base,
    purpose: "email_verification",
    idempotencyKey: "account-verify:challenge_20260827",
  });
  assert.equal(requests.length, 1);
  const { init, body } = requests[0];
  assert.equal(body.from, "AJ Luxury <commandes@ajluxurystore.com>");
  assert.equal(body.reply_to, "contact@ajluxurystore.com");
  assert.equal(body.subject, "Confirmez votre adresse e-mail | AJ Luxury");
  assert.match(body.text, /Une dernière étape/);
  assert.match(body.text, /Confirmer mon adresse : https:\/\/ajluxurystore\.com\/api\/commerce\/account\/verify\?token=/);
  assert.match(body.html, /Votre espace AJ Luxury/);
  assert.match(body.html, /Espace client/);
  assert.match(body.html, /Ignorez simplement cet e-mail/);
  assert.match(body.html, /role="presentation"/);
  assert.equal(init.headers["Idempotency-Key"], "account-verify:challenge_20260827");
});

test("password recovery email keeps the same restrained system and the correct secure action", async () => {
  const { delivery, requests } = deliveryHarness();
  await delivery.deliver({
    ...base,
    purpose: "password_reset",
    idempotencyKey: "account-reset:challenge_20260827",
  });
  const { body } = requests[0];
  assert.equal(body.subject, "Nouveau mot de passe | AJ Luxury");
  assert.match(body.text, /Choisir un mot de passe : https:\/\/ajluxurystore\.com\/account\?reset=/);
  assert.match(body.html, />Nouveau mot de passe</);
  assert.match(body.html, /Vous n’êtes pas à l’origine/);
  assert.doesNotMatch(body.html, /Réinitialisez votre mot de passe AJ Luxury/);
});
