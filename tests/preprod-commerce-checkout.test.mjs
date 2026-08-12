import assert from "node:assert/strict";
import test from "node:test";
import { listLaunchVariants } from "../lib/commerce/catalog.ts";
import {
  PREPROD_DEMO_MODE,
  PREPROD_DEMO_SHIPPING_FEES_CENTS,
  PreprodCommerceError,
  createPreprodCommerceService,
  createPreprodTestPaymentAdapter,
} from "../lib/preprod/commerce-checkout.ts";

function clock(...timestamps) {
  let index = 0;
  return () => timestamps[Math.min(index++, timestamps.length - 1)];
}

function fixture() {
  const now = clock(
    "2099-08-12T10:00:00.000Z",
    "2099-08-12T10:01:00.000Z",
    "2099-08-12T10:02:00.000Z",
    "2099-08-12T10:03:00.000Z",
    "2099-08-12T10:04:00.000Z",
    "2099-08-12T10:05:00.000Z",
    "2099-08-12T10:06:00.000Z",
    "2099-08-12T10:07:00.000Z",
    "2099-08-12T10:08:00.000Z",
    "2099-08-12T10:09:00.000Z",
    "2099-08-12T10:10:00.000Z",
    "2099-08-12T10:11:00.000Z",
    "2099-08-12T10:12:00.000Z",
    "2099-08-12T10:13:00.000Z",
    "2099-08-12T10:14:00.000Z",
    "2099-08-12T10:15:00.000Z",
  );
  const adapter = createPreprodTestPaymentAdapter({
    mode: PREPROD_DEMO_MODE,
    clock: now,
  });
  return {
    adapter,
    service: createPreprodCommerceService({
      mode: PREPROD_DEMO_MODE,
      paymentAdapter: adapter,
      clock: now,
    }),
  };
}

function payload(overrides = {}) {
  const addressOverrides = overrides.shippingAddress ?? {};
  const checkoutOverrides = { ...overrides };
  delete checkoutOverrides.shippingAddress;
  return {
    variantId: "variant_boxer_pourpre_m",
    quantity: 1,
    email: "client@example.com",
    shippingAddress: {
      firstName: "Ada",
      lastName: "Lovelace",
      line1: "1 rue du Test",
      postalCode: "75001",
      city: "Paris",
      countryCode: "FR",
      ...addressOverrides,
    },
    ...checkoutOverrides,
  };
}

function assertCode(code) {
  return (error) => error instanceof PreprodCommerceError && error.code === code;
}

test("fails closed outside the explicit PREPROD_DEMO environment", () => {
  assert.throws(
    () => createPreprodTestPaymentAdapter({ mode: "production" }),
    assertCode("PREPROD_DEMO_DISABLED"),
  );
  assert.throws(
    () => createPreprodTestPaymentAdapter({ mode: undefined }),
    assertCode("PREPROD_DEMO_DISABLED"),
  );
  assert.throws(
    () =>
      createPreprodCommerceService({
        mode: PREPROD_DEMO_MODE,
        paymentAdapter: Object.freeze({
          kind: "preprod-test-adapter",
          async authorize() {
            return {};
          },
        }),
      }),
    assertCode("PAYMENT_VERIFICATION_REQUIRED"),
  );
});

test("accepts exactly the twelve launch variants and recalculates their price", async () => {
  const { service } = fixture();
  const variants = listLaunchVariants();
  assert.equal(variants.length, 12);

  for (const [index, variant] of variants.entries()) {
    const order = await service.submitCheckout(
      payload({ variantId: variant.id }),
      `checkout_variant_${index}`,
    );
    assert.equal(order.line.variantId, variant.id);
    assert.equal(order.line.unitPriceCents, 2_999);
    assert.equal(order.subtotalCents, 2_999);
  }

  await assert.rejects(
    () =>
      service.submitCheckout(
        payload({ variantId: "variant_boxer_invented_xxl" }),
        "checkout_bad_variant",
      ),
    assertCode("UNSUPPORTED_VARIANT"),
  );
});

test("rejects client price injection and unsafe payload shapes", async () => {
  const { service } = fixture();
  await assert.rejects(
    () =>
      service.submitCheckout(
        { ...payload(), unitPriceCents: 1 },
        "checkout_forged_price",
      ),
    assertCode("INVALID_PAYLOAD"),
  );

  const getterPayload = payload();
  Object.defineProperty(getterPayload, "email", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  await assert.rejects(
    () => service.submitCheckout(getterPayload, "checkout_getter"),
    assertCode("INVALID_PAYLOAD"),
  );

  for (const [index, invalidPayload] of [
    payload({ quantity: 0 }),
    payload({ quantity: 6 }),
    payload({ quantity: 1.5 }),
    payload({ email: "not-an-email" }),
    payload({ shippingAddress: { firstName: "" } }),
    payload({ shippingAddress: { countryCode: "FRA" } }),
  ].entries()) {
    await assert.rejects(
      () => service.submitCheckout(invalidPayload, `checkout_invalid_${index}`),
      assertCode("INVALID_PAYLOAD"),
    );
  }
});

test("uses shipping-policy for EU, UK, US and Canada while rejecting excluded zones", async () => {
  const { service } = fixture();
  const cases = [
    {
      zone: "EU",
      address: { countryCode: "FR", postalCode: "75001", city: "Paris" },
    },
    {
      zone: "UK",
      address: { countryCode: "GB", postalCode: "SW1A 1AA", city: "London" },
    },
    {
      zone: "US",
      address: {
        countryCode: "US",
        postalCode: "10001",
        regionCode: "NY",
        city: "New York",
      },
    },
    {
      zone: "CA",
      address: { countryCode: "CA", postalCode: "M5V 3A8", city: "Toronto" },
    },
  ];
  for (const [index, entry] of cases.entries()) {
    const order = await service.submitCheckout(
      payload({ shippingAddress: entry.address }),
      `checkout_zone_${index}`,
    );
    assert.equal(order.shippingZone, entry.zone);
    assert.equal(
      order.shippingCents,
      PREPROD_DEMO_SHIPPING_FEES_CENTS[entry.zone],
    );
    assert.equal(order.shippingRateKind, "fictitious-preprod-demo");
  }

  for (const [index, address] of [
    { countryCode: "AU", postalCode: "2000", city: "Sydney" },
    { countryCode: "FR", postalCode: "97100", city: "Basse-Terre" },
    {
      countryCode: "US",
      postalCode: "00901",
      regionCode: "PR",
      city: "San Juan",
    },
    { countryCode: "GB", postalCode: "JE2 3QA", city: "Saint Helier" },
  ].entries()) {
    await assert.rejects(
      () =>
        service.submitCheckout(
          payload({ shippingAddress: address }),
          `checkout_excluded_${index}`,
        ),
      assertCode("SHIPPING_ADDRESS_REJECTED"),
    );
  }
});

test("double click creates one order and conflicting replay is rejected", async () => {
  const { service } = fixture();
  const request = payload({ quantity: 2 });
  const [first, second] = await Promise.all([
    service.submitCheckout(request, "checkout_double_click"),
    service.submitCheckout(request, "checkout_double_click"),
  ]);
  assert.strictEqual(first, second);
  assert.equal(first.id, "order_preprod_000001");

  await assert.rejects(
    () =>
      service.submitCheckout(
        payload({ quantity: 3 }),
        "checkout_double_click",
      ),
    assertCode("IDEMPOTENCY_CONFLICT"),
  );
});

test("quantity total always uses the server catalogue plus an explicit fictitious fee", async () => {
  const { service } = fixture();
  const order = await service.submitCheckout(
    payload({ quantity: 3 }),
    "checkout_quantity_total",
  );
  assert.deepEqual(
    {
      quantity: order.line.quantity,
      unitPriceCents: order.line.unitPriceCents,
      lineTotalCents: order.line.lineTotalCents,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      taxCents: order.taxCents,
      totalCents: order.totalCents,
    },
    {
      quantity: 3,
      unitPriceCents: 2_999,
      lineTotalCents: 8_997,
      subtotalCents: 8_997,
      shippingCents: 500,
      taxCents: 0,
      totalCents: 9_497,
    },
  );
  assert.equal(Object.isFrozen(order), true);
  assert.equal(Object.isFrozen(order.line), true);
});

test("only a matching non-forgeable test receipt moves pending to paid", async () => {
  const { adapter, service } = fixture();
  const order = await service.submitCheckout(payload(), "checkout_payment");
  assert.equal(order.status, "pending");

  const forgedReceipt = Object.freeze({
    kind: "preprod-test-payment",
    environment: PREPROD_DEMO_MODE,
    paymentId: "payment_forged",
    orderId: order.id,
    amountCents: order.totalCents,
    currency: "EUR",
    authorizedAt: "2099-08-12T10:30:00.000Z",
  });
  await assert.rejects(
    () => service.confirmTestPayment(order.id, forgedReceipt),
    assertCode("PAYMENT_VERIFICATION_REQUIRED"),
  );
  assert.equal(service.getOrder(order.id).status, "pending");

  const wrongAmount = await adapter.authorize({
    orderId: order.id,
    amountCents: 1,
    currency: "EUR",
    idempotencyKey: "payment_wrong_amount",
  });
  await assert.rejects(
    () => service.confirmTestPayment(order.id, wrongAmount),
    assertCode("PAYMENT_VERIFICATION_REQUIRED"),
  );
  assert.equal(service.getOrder(order.id).status, "pending");

  const paid = await service.payOrder(order.id, "payment_valid");
  const replay = await service.payOrder(order.id, "payment_valid");
  assert.strictEqual(paid, replay);
  assert.equal(paid.status, "paid");
  assert.match(paid.paymentId, /^payment_preprod_\d{6}$/);
  assert.equal(paid.paidAt, "2099-08-12T10:02:00.000Z");
});

test("payment idempotency keys cannot be reused across different orders", async () => {
  const { service } = fixture();
  const first = await service.submitCheckout(payload(), "checkout_payment_a");
  const second = await service.submitCheckout(
    payload({ variantId: "variant_boxer_rose-pale_m" }),
    "checkout_payment_b",
  );
  await service.payOrder(first.id, "shared_payment_key");
  await assert.rejects(
    () => service.payOrder(second.id, "shared_payment_key"),
    assertCode("IDEMPOTENCY_CONFLICT"),
  );
  assert.equal(service.getOrder(second.id).status, "pending");
});

test("the complete checkout and payment path performs no network access", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("network access is forbidden");
  };
  try {
    const { service } = fixture();
    const order = await service.submitCheckout(payload(), "checkout_offline");
    const paid = await service.payOrder(order.id, "payment_offline");
    assert.equal(paid.status, "paid");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
