import assert from "node:assert/strict";
import test from "node:test";
import {
  ResendEmailProvider,
  ResendEmailProviderError,
} from "../lib/commerce/resend-email-provider.ts";

function delivery(payload = { subject: "Paiement confirmé AJ-1", text: "Merci." }) {
  return Object.freeze({
    idempotencyKey: "payment_confirmation:order_12345678",
    message: Object.freeze({
      id: "outbox_12345678",
      kind: "payment_confirmation",
      sourceEventId: "event_12345678",
      recipientEmail: "client@example.com",
      orderId: "order_12345678",
      locale: "fr",
      templateVersion: "payment-v1",
      payloadJson: JSON.stringify(payload),
      attempts: 1,
      maxAttempts: 5,
      leaseTokenHash: "a".repeat(64),
      providerIdempotencyKey: "payment_confirmation:order_12345678",
    }),
  });
}

function provider(fetchImpl) {
  return new ResendEmailProvider({
    apiKey: "re_redacted",
    fromEmail: "commandes@ajluxurystore.com",
    fromName: "AJ Luxury",
    replyTo: "contact@ajluxurystore.com",
    fetchImpl,
  });
}

test("Resend receives one bounded branded email with the durable idempotency key", async () => {
  let call;
  const adapter = provider(async (url, init) => {
    call = { url, init };
    return Response.json({ id: "email_123" }, { status: 200 });
  });
  const receipt = await adapter.deliver(delivery());
  assert.equal(receipt.idempotencyKey, "payment_confirmation:order_12345678");
  assert.equal(receipt.providerMessageId, "email_123");
  assert.equal(call.url, "https://api.resend.com/emails");
  assert.equal(Object.isFrozen(call.init), false);
  assert.equal(Object.isFrozen(call.init.headers), false);
  assert.equal(call.init.headers["Idempotency-Key"], receipt.idempotencyKey);
  assert.equal(call.init.headers["User-Agent"], undefined);
  assert.equal(call.init.headers.Accept, undefined);
  assert.match(call.init.headers.Authorization, /^Bearer re_/);
  const body = JSON.parse(call.init.body);
  assert.deepEqual(body.to, ["client@example.com"]);
  assert.equal(body.from, "AJ Luxury <commandes@ajluxurystore.com>");
  assert.match(body.html, /AJ LUXURY/);
  assert.match(body.html, /Paiement confirmé AJ-1/);
  assert.equal(body.text, "Merci.");
  assert.deepEqual(body.tags, [
    { name: "kind", value: "payment_confirmation" },
    { name: "locale", value: "fr" },
    { name: "outbox_id", value: "outbox_12345678" },
  ]);
});

test("Resend receives one bounded PDF attachment for the operator label email", async () => {
  let body;
  const adapter = provider(async (_url, init) => {
    body = JSON.parse(init.body);
    return Response.json({ id: "email_label_123" }, { status: 200 });
  });
  const payload = delivery({
    subject: "AJ Luxury — étiquette A4 prête — AJ-TEST",
    text: "Étiquette jointe. https://ajluxurystore.com/admin",
  });
  await adapter.deliver({
    ...payload,
    message: { ...payload.message, kind: "operator_label_ready" },
    attachments: [{
      filename: "AJL-AJ-TEST-A4.pdf",
      contentBase64: Buffer.from("%PDF-1.7\n%%EOF").toString("base64"),
    }],
  });
  assert.deepEqual(body.attachments, [{
    filename: "AJL-AJ-TEST-A4.pdf",
    content: Buffer.from("%PDF-1.7\n%%EOF").toString("base64"),
  }]);
  assert.match(body.html, /href="https:\/\/ajluxurystore\.com\/admin"/);
  assert.equal(body.tags[0].value, "operator_label_ready");
});

test("Resend accepts the exact label plus customs A4 pair", async () => {
  let body;
  const adapter = provider(async (_url, init) => {
    body = JSON.parse(init.body);
    return Response.json({ id: "email_documents_123" }, { status: 200 });
  });
  const contentBase64 = Buffer.from("%PDF-1.7\n%%EOF").toString("base64");
  await adapter.deliver({
    ...delivery(),
    attachments: [
      { filename: "AJL-AJ-TEST-ETIQUETTE-A4.pdf", contentBase64 },
      { filename: "AJL-AJ-TEST-DOUANE-A4.pdf", contentBase64 },
    ],
  });
  assert.deepEqual(body.attachments.map((attachment) => attachment.filename), [
    "AJL-AJ-TEST-ETIQUETTE-A4.pdf",
    "AJL-AJ-TEST-DOUANE-A4.pdf",
  ]);
});

test("Resend rejects unsafe or more than two operator attachments before transport", async () => {
  let calls = 0;
  const adapter = provider(async () => {
    calls += 1;
    return Response.json({ id: "unexpected" });
  });
  await assert.rejects(
    adapter.deliver({
      ...delivery(),
      attachments: [
        { filename: "label.pdf", contentBase64: "JVBERi0x" },
        { filename: "customs.pdf", contentBase64: "JVBERi0x" },
        { filename: "third.pdf", contentBase64: "JVBERi0x" },
      ],
    }),
    (error) => error instanceof ResendEmailProviderError && error.outcome === "rejected",
  );
  assert.equal(calls, 0);
});

test("exact delivered Resend record becomes minimal evidence without exposing content", async () => {
  let sentBody;
  const adapter = provider(async (url, init) => {
    if (init.method === "POST") {
      sentBody = JSON.parse(init.body);
      return Response.json({ id: "email_delivered_123" });
    }
    assert.equal(url, "https://api.resend.com/emails/email_delivered_123");
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    return Response.json({
      ...sentBody,
      id: "email_delivered_123",
      created_at: "2026-08-28T19:25:00.000Z",
      last_event: "delivered",
      cc: [],
      bcc: [],
      attachments: [],
    });
  });
  await adapter.deliver(delivery());
  const evidence = await adapter.retrieveDeliveredEvidence(
    "email_delivered_123",
    {
      outboxId: delivery().message.id,
      kind: delivery().message.kind,
      locale: delivery().message.locale,
      recipientEmail: delivery().message.recipientEmail,
      payloadJson: delivery().message.payloadJson,
    },
  );
  assert.deepEqual(evidence, {
    providerMessageId: "email_delivered_123",
    providerLastEvent: "delivered",
    providerCreatedAt: "2026-08-28T19:25:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(evidence), /client@|Merci|Paiement confirmé/);
});

test("provider lookup is aborted within its bounded incident-read timeout", async () => {
  const adapter = new ResendEmailProvider({
    apiKey: "re_redacted",
    fromEmail: "commandes@ajluxurystore.com",
    fromName: "AJ Luxury",
    replyTo: "contact@ajluxurystore.com",
    lookupTimeoutMs: 20,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    }),
  });
  await assert.rejects(
    adapter.retrieveDeliveredEvidence("email_timeout_1", {
      outboxId: delivery().message.id,
      kind: delivery().message.kind,
      locale: delivery().message.locale,
      recipientEmail: delivery().message.recipientEmail,
      payloadJson: delivery().message.payloadJson,
    }),
    (error) => error instanceof ResendEmailProviderError && error.outcome === "ambiguous",
  );
});

test("lookup never treats 404, accepted-only or crossed content as delivery proof", async () => {
  const expected = {
    outboxId: delivery().message.id,
    kind: delivery().message.kind,
    locale: delivery().message.locale,
    recipientEmail: delivery().message.recipientEmail,
    payloadJson: delivery().message.payloadJson,
  };
  for (const response of [
    new Response(null, { status: 404 }),
    Response.json({
      id: "email_accepted_only",
      from: "AJ Luxury <commandes@ajluxurystore.com>",
      to: ["client@example.com"],
      subject: "Paiement confirmé AJ-1",
      text: "Merci.",
      html: "crossed",
      reply_to: "contact@ajluxurystore.com",
      tags: [
        { name: "kind", value: "payment_confirmation" },
        { name: "locale", value: "fr" },
      ],
      created_at: "2026-08-28T19:25:00.000Z",
      last_event: "sent",
    }),
  ]) {
    const messageId = response.status === 404 ? "email_missing" : "email_accepted_only";
    const adapter = provider(async () => response);
    await assert.rejects(
      adapter.retrieveDeliveredEvidence(messageId, expected),
      (error) => error instanceof ResendEmailProviderError &&
        error.outcome === "ambiguous",
    );
  }
});

test("Resend sends the detailed durable order proof in text and linked HTML", async () => {
  let requestBody;
  const adapter = provider(async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return Response.json({ id: "email_durable_123" }, { status: 200 });
  });
  const text = [
    "Articles",
    "- Apollon · Rose · Taille M × 2 — 59,98 €",
    "Livraison (Mondial Relay · Point relais) : 3,50 €",
    "TVA : 0,00 €",
    "Total payé : 53,49 €",
    "TVA non applicable, art. 293 B du code général des impôts.",
    "Conditions générales de vente, version 2026-08-26 : https://ajluxurystore.com/terms?version=2026-08-26",
  ].join("\n");
  await adapter.deliver(delivery({ subject: "Commande confirmée AJ-1", text }));
  assert.equal(requestBody.text, text);
  assert.match(requestBody.html, /art\. 293 B/);
  assert.match(requestBody.html, /<a href="https:\/\/ajluxurystore\.com\/terms\?version=2026-08-26"/);
  assert.doesNotMatch(requestBody.html, /<script/i);
});

test("invalid or expanded payloads are rejected before network access", async () => {
  let calls = 0;
  const adapter = provider(async () => {
    calls += 1;
    return Response.json({ id: "never" });
  });
  await assert.rejects(
    adapter.deliver(delivery({ subject: "Hi", text: "Body", html: "<b>x</b>" })),
    ResendEmailProviderError,
  );
  await assert.rejects(
    adapter.deliver(delivery({ subject: "Bad\r\nBcc: x@y.z", text: "Body" })),
    ResendEmailProviderError,
  );
  assert.equal(calls, 0);
});

test("provider conflicts, throttling and invalid receipts stay ambiguous", async () => {
  for (const responseFactory of [
    () => Response.json({ message: "conflict" }, { status: 409 }),
    () => Response.json({ message: "slow" }, { status: 429 }),
    () => Response.json({ ok: true }, { status: 200 }),
  ]) {
    let calls = 0;
    const adapter = provider(async () => {
      calls += 1;
      return responseFactory();
    });
    await assert.rejects(
      adapter.deliver(delivery()),
      (error) => error instanceof ResendEmailProviderError && error.outcome === "ambiguous",
    );
    assert.equal(calls, 3);
  }
});

test("transient transport failures retry with the exact same idempotency key", async () => {
  const keys = [];
  let calls = 0;
  const adapter = provider(async (_url, init) => {
    calls += 1;
    keys.push(init.headers["Idempotency-Key"]);
    if (calls < 3) throw new TypeError("transient network failure");
    return Response.json({ id: "email_after_retry" }, { status: 200 });
  });
  const receipt = await adapter.deliver(delivery());
  assert.equal(receipt.providerMessageId, "email_after_retry");
  assert.equal(calls, 3);
  assert.deepEqual(keys, [
    "payment_confirmation:order_12345678",
    "payment_confirmation:order_12345678",
    "payment_confirmation:order_12345678",
  ]);
});

test("configuration never accepts non-Resend keys or an unverified sender shape", () => {
  assert.throws(
    () => new ResendEmailProvider({
      apiKey: "secret",
      fromEmail: "commandes@ajluxurystore.com",
      fromName: "AJ Luxury",
    }),
    ResendEmailProviderError,
  );
  assert.throws(
    () => new ResendEmailProvider({
      apiKey: "re_redacted",
      fromEmail: "bad address",
      fromName: "AJ Luxury",
    }),
    ResendEmailProviderError,
  );
});
