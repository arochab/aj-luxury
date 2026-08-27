import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPaymentTransition,
  verifyAndDeliverPaymentWebhook,
} from "../lib/commerce/payment-provider.ts";
import {
  STRIPE_API_VERSION,
  createStripePaymentProviderPorts,
} from "../lib/commerce/stripe-payment-provider.ts";

const API_KEY = `sk_test_${"a".repeat(32)}`;
const WEBHOOK_SECRET = `whsec_${"b".repeat(32)}`;
const RECEIVED_AT = 2_000_000_000;

function ports(fetchImpl = async () => {
  throw new Error("Unexpected Stripe request.");
}) {
  return createStripePaymentProviderPorts({
    apiKey: API_KEY,
    webhookSecret: WEBHOOK_SECRET,
    mode: "test",
  }, fetchImpl);
}

function checkoutRequest() {
  return {
    idempotencyKey: "checkout-order-aj-00000001",
    orderId: "order_aj_00000001",
    customerEmail: "client@example.com",
    successUrl: "https://ajluxurystore.com/checkout/success",
    cancelUrl: "https://ajluxurystore.com/checkout",
    locale: "fr",
    currency: "EUR",
    settlementMode: "test",
    lines: [
      {
        internalReference: "AJ-BOXER-POURPRE-M",
        displayName: "Boxer Pourpre - M",
        unitAmountCents: 2_999,
        quantity: 1,
      },
      {
        internalReference: "AJ-SHIPPING-HOME",
        displayName: "Livraison suivie",
        unitAmountCents: 900,
        quantity: 1,
      },
    ],
  };
}

function checkoutResponse() {
  return {
    id: "cs_test_checkout123456789",
    object: "checkout.session",
    amount_total: 3_899,
    currency: "eur",
    client_reference_id: "order_aj_00000001",
    metadata: { order_id: "order_aj_00000001" },
    livemode: false,
    payment_intent: null,
    payment_status: "unpaid",
    status: "open",
    url: "https://checkout.stripe.com/c/pay/cs_test_checkout123456789",
  };
}

async function signature(rawBody, timestamp = RECEIVED_AT, secret = WEBHOOK_SECRET) {
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const signed = new Uint8Array(prefix.byteLength + rawBody.byteLength);
  signed.set(prefix);
  signed.set(rawBody, prefix.byteLength);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

function paymentIntentEvent({
  eventId,
  eventType,
  created,
  status,
  paymentId = "pi_payment123456789",
  amount = 2_999,
  amountReceived = 0,
  lastPaymentError = null,
}) {
  return {
    id: eventId,
    object: "event",
    type: eventType,
    created,
    livemode: false,
    data: {
      object: {
        id: paymentId,
        object: "payment_intent",
        amount,
        amount_received: amountReceived,
        currency: "eur",
        status,
        metadata: { order_id: "order_aj_00000001" },
        last_payment_error: lastPaymentError,
      },
    },
  };
}

function checkoutEvent({
  eventId,
  eventType,
  created,
  paymentStatus = "paid",
  paymentId = "pi_payment123456789",
  sessionId = "cs_test_checkout123456789",
}) {
  return {
    id: eventId,
    object: "event",
    type: eventType,
    created,
    livemode: false,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        amount_total: 2_999,
        currency: "eur",
        client_reference_id: "order_aj_00000001",
        metadata: { order_id: "order_aj_00000001" },
        payment_intent: paymentId,
        payment_status: paymentStatus,
      },
    },
  };
}

async function webhookInput(payload, timestamp = RECEIVED_AT) {
  const rawBody = new TextEncoder().encode(JSON.stringify(payload));
  return {
    rawBody,
    stripeSignature: await signature(rawBody, timestamp),
    receivedAtEpochSeconds: timestamp,
  };
}

test("Stripe Checkout Session uses pinned API, form encoding and idempotency", async () => {
  const calls = [];
  const provider = ports(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(checkoutResponse()), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Request-Id": "req_checkout123456789",
      },
    });
  });

  const receipt = await provider.checkout.createSession(checkoutRequest());
  assert.deepEqual(receipt, {
    provider: "stripe",
    providerSessionId: "cs_test_checkout123456789",
    providerPaymentId: null,
    checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_checkout123456789",
    state: "open",
    amountTotalCents: 3_899,
    currency: "EUR",
    livemode: false,
    providerRequestId: "req_checkout123456789",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.headers["Stripe-Version"], STRIPE_API_VERSION);
  assert.equal(calls[0].init.headers["Idempotency-Key"], "checkout-order-aj-00000001");
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get("mode"), "payment");
  assert.equal(form.get("payment_method_types[0]"), "card");
  assert.equal(form.get("client_reference_id"), "order_aj_00000001");
  assert.equal(form.get("metadata[order_id]"), "order_aj_00000001");
  assert.equal(form.get("payment_intent_data[metadata][order_id]"), "order_aj_00000001");
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "2999");
  assert.equal(form.get("line_items[1][price_data][unit_amount]"), "900");
});

test("Stripe connector fails closed on missing or cross-mode credentials", () => {
  assert.throws(
    () => createStripePaymentProviderPorts({ mode: "test" }),
    (error) => error.code === "NOT_CONFIGURED",
  );
  assert.throws(
    () => createStripePaymentProviderPorts({
      mode: "live",
      apiKey: API_KEY,
      webhookSecret: WEBHOOK_SECRET,
    }),
    (error) => error.code === "NOT_CONFIGURED",
  );
});

test("Checkout rejects a mismatched amount, mode or oversized response", async () => {
  const request = checkoutRequest();
  for (const response of [
    { ...checkoutResponse(), amount_total: 3_898 },
    { ...checkoutResponse(), livemode: true },
  ]) {
    const provider = ports(async () => new Response(JSON.stringify(response), { status: 200 }));
    await assert.rejects(
      () => provider.checkout.createSession(request),
      (error) => error.code === "MALFORMED_RESPONSE",
    );
  }
  const provider = ports(async () => new Response("{}", {
    status: 200,
    headers: { "Content-Length": String(256 * 1024 + 1) },
  }));
  await assert.rejects(
    () => provider.checkout.createSession(request),
    (error) => error.code === "MALFORMED_RESPONSE",
  );
});

test("a valid raw-body signature delivers a paid event exactly after verification", async () => {
  const event = checkoutEvent({
    eventId: "evt_paid123456789",
    eventType: "checkout.session.completed",
    created: RECEIVED_AT - 2,
  });
  const input = await webhookInput(event);
  const multipleSignatures = {
    ...input,
    stripeSignature: input.stripeSignature.replace(
      ",v1=",
      `,v1=${"0".repeat(64)},v1=`,
    ),
  };
  let applied = null;
  const result = await verifyAndDeliverPaymentWebhook(
    ports().webhooks,
    multipleSignatures,
    {
      async applyVerified(verified) {
        applied = verified;
        return "applied";
      },
    },
  );
  assert.equal(result.disposition, "applied");
  assert.equal(applied.kind, "payment");
  assert.equal(applied.state, "paid");
  assert.equal(applied.orderId, "order_aj_00000001");
  assert.equal(applied.amountCents, 2_999);
  assert.equal(applied.semanticKey, "stripe:payment:pi_payment123456789:paid");
});

test("invalid, stale or reserialized signatures have a zero-effect contract", async () => {
  const event = paymentIntentEvent({
    eventId: "evt_invalid123456789",
    eventType: "payment_intent.succeeded",
    created: RECEIVED_AT - 2,
    status: "succeeded",
    amountReceived: 2_999,
  });
  const valid = await webhookInput(event);
  const effects = {
    calls: 0,
    async applyVerified() {
      this.calls += 1;
      return "applied";
    },
  };
  const currentLastCharacter = valid.stripeSignature.at(-1);
  const invalid = {
    ...valid,
    stripeSignature: `${valid.stripeSignature.slice(0, -1)}${currentLastCharacter === "0" ? "1" : "0"}`,
  };
  await assert.rejects(
    () => verifyAndDeliverPaymentWebhook(ports().webhooks, invalid, effects),
    (error) => error.code === "INVALID_SIGNATURE",
  );
  const staleRaw = valid.rawBody;
  const staleSignature = await signature(staleRaw, RECEIVED_AT - 301);
  await assert.rejects(
    () => verifyAndDeliverPaymentWebhook(ports().webhooks, {
      rawBody: staleRaw,
      stripeSignature: staleSignature,
      receivedAtEpochSeconds: RECEIVED_AT,
    }, effects),
    (error) => error.code === "STALE_SIGNATURE",
  );
  const reserialized = new TextEncoder().encode(JSON.stringify(event, null, 2));
  await assert.rejects(
    () => verifyAndDeliverPaymentWebhook(ports().webhooks, {
      rawBody: reserialized,
      stripeSignature: valid.stripeSignature,
      receivedAtEpochSeconds: RECEIVED_AT,
    }, effects),
    (error) => error.code === "INVALID_SIGNATURE",
  );
  const oversized = {
    rawBody: new Uint8Array(64 * 1024 + 1),
    stripeSignature: valid.stripeSignature,
    receivedAtEpochSeconds: RECEIVED_AT,
  };
  await assert.rejects(
    () => verifyAndDeliverPaymentWebhook(ports().webhooks, oversized, effects),
    (error) => error.code === "INVALID_SIGNATURE",
  );
  assert.equal(effects.calls, 0);
});

test("Checkout-only settlement acknowledges PaymentIntent events without effects", async () => {
  const action = await ports().webhooks.verify(await webhookInput(paymentIntentEvent({
    eventId: "evt_action123456789",
    eventType: "payment_intent.requires_action",
    created: RECEIVED_AT - 3,
    status: "requires_action",
  })));
  assert.equal(action.kind, "ignored");
  assert.equal(action.reason, "event-type-not-required");

  const refused = await ports().webhooks.verify(await webhookInput(paymentIntentEvent({
    eventId: "evt_refused123456789",
    eventType: "payment_intent.payment_failed",
    created: RECEIVED_AT - 2,
    status: "requires_payment_method",
    lastPaymentError: {
      decline_code: "do_not_honor",
      code: "card_declined",
      message: "Never expose this provider message.",
    },
  })));
  assert.equal(refused.kind, "ignored");
  assert.equal(refused.reason, "event-type-not-required");
  assert.doesNotMatch(JSON.stringify(refused), /Never expose/);
});

test("event keys plus monotonic classification handle duplicates and out-of-order delivery", async () => {
  const projections = new Map();
  const eventIds = new Set();
  const semanticKeys = new Set();
  const effects = {
    async applyVerified(event) {
      if (eventIds.has(event.providerEventId) || semanticKeys.has(event.semanticKey)) return "duplicate";
      eventIds.add(event.providerEventId);
      semanticKeys.add(event.semanticKey);
      if (event.kind !== "payment") return "applied";
      const current = projections.get(event.providerPaymentId) ?? null;
      const disposition = classifyPaymentTransition(current, event);
      if (disposition === "stale") return "stale";
      assert.equal(disposition, "apply");
      projections.set(event.providerPaymentId, {
        providerPaymentId: event.providerPaymentId,
        state: event.state,
        semanticKey: event.semanticKey,
        occurredAt: event.occurredAt,
      });
      return "applied";
    },
  };
  const paid = checkoutEvent({
    eventId: "evt_order_paid123456789",
    eventType: "checkout.session.completed",
    created: RECEIVED_AT - 10,
  });
  const sameTransition = checkoutEvent({
    eventId: "evt_order_paid_duplicate123",
    eventType: "checkout.session.completed",
    created: RECEIVED_AT - 9,
  });
  const earlierProcessing = checkoutEvent({
    eventId: "evt_order_processing12345",
    eventType: "checkout.session.expired",
    created: RECEIVED_AT - 20,
    paymentStatus: "unpaid",
  });

  const first = await verifyAndDeliverPaymentWebhook(ports().webhooks, await webhookInput(paid), effects);
  const exactReplay = await verifyAndDeliverPaymentWebhook(ports().webhooks, await webhookInput(paid), effects);
  const semanticReplay = await verifyAndDeliverPaymentWebhook(
    ports().webhooks,
    await webhookInput(sameTransition),
    effects,
  );
  const outOfOrder = await verifyAndDeliverPaymentWebhook(
    ports().webhooks,
    await webhookInput(earlierProcessing),
    effects,
  );
  assert.deepEqual(
    [first.disposition, exactReplay.disposition, semanticReplay.disposition, outOfOrder.disposition],
    ["applied", "duplicate", "duplicate", "stale"],
  );
  assert.equal(projections.get("pi_payment123456789").state, "paid");
});

test("refund requests are bounded, carry an idempotency key and replay to one provider refund", async () => {
  const calls = [];
  const provider = ports(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      id: "re_refund123456789",
      object: "refund",
      amount: 2_999,
      currency: "eur",
      metadata: { order_id: "order_aj_00000001" },
      payment_intent: "pi_payment123456789",
      status: "requires_action",
    }), {
      status: 200,
      headers: { "Request-Id": "req_refund123456789" },
    });
  });
  const request = {
    idempotencyKey: "refund-order-aj-00000001-full",
    orderId: "order_aj_00000001",
    providerPaymentId: "pi_payment123456789",
    amountCents: 2_999,
    currency: "EUR",
    reason: "requested_by_customer",
  };
  const first = await provider.refunds.createRefund(request);
  const replay = await provider.refunds.createRefund(request);
  assert.deepEqual(replay, first);
  assert.equal(first.state, "action_required");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, "https://api.stripe.com/v1/refunds");
    assert.equal(call.init.headers["Idempotency-Key"], request.idempotencyKey);
    const form = new URLSearchParams(call.init.body);
    assert.equal(form.get("payment_intent"), request.providerPaymentId);
    assert.equal(form.get("amount"), "2999");
    assert.equal(form.get("metadata[order_id]"), request.orderId);
  }
});

test("a known refund is reconciled with one exact bounded GET and no idempotent POST replay", async () => {
  const calls = [];
  const provider = ports(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      id: "re_refund123456789",
      object: "refund",
      amount: 2_999,
      currency: "eur",
      metadata: { order_id: "order_aj_00000001" },
      payment_intent: "pi_payment123456789",
      status: "succeeded",
    }), {
      status: 200,
      headers: { "Request-Id": "req_reconcile123456789" },
    });
  });
  const receipt = await provider.refunds.retrieveRefund({
    orderId: "order_aj_00000001",
    providerPaymentId: "pi_payment123456789",
    providerRefundId: "re_refund123456789",
    amountCents: 2_999,
    currency: "EUR",
  });
  assert.equal(receipt.state, "succeeded");
  assert.equal(receipt.providerRefundId, "re_refund123456789");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/refunds/re_refund123456789");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.headers["Idempotency-Key"], undefined);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${API_KEY}`);
  assert.equal(calls[0].init.headers["Stripe-Version"], STRIPE_API_VERSION);
});

test("refund reconciliation rejects every mismatched durable binding", async () => {
  const request = {
    orderId: "order_aj_00000001",
    providerPaymentId: "pi_payment123456789",
    providerRefundId: "re_refund123456789",
    amountCents: 2_999,
    currency: "EUR",
  };
  const valid = {
    id: request.providerRefundId,
    object: "refund",
    amount: request.amountCents,
    currency: "eur",
    metadata: { order_id: request.orderId },
    payment_intent: request.providerPaymentId,
    status: "succeeded",
  };
  for (const mismatch of [
    { id: "re_wrong123456789" },
    { payment_intent: "pi_wrong123456789" },
    { amount: 1 },
    { currency: "usd" },
    { metadata: { order_id: "order_wrong_00000001" } },
  ]) {
    const provider = ports(async () => new Response(JSON.stringify({ ...valid, ...mismatch }), {
      status: 200,
    }));
    await assert.rejects(
      () => provider.refunds.retrieveRefund(request),
      (error) => error?.code === "MALFORMED_RESPONSE",
    );
  }
});
