import assert from "node:assert/strict";
import test from "node:test";

import { DeliveryProviderError } from "../lib/commerce/delivery-provider.ts";
import { resolveClientValidatedParcelProfile } from "../lib/commerce/parcel-profiles.ts";
import {
  createApprovedReturnShipment,
  ReturnOrchestrationError,
} from "../lib/commerce/return-provider.ts";
import { createSendcloudProviderPorts } from "../lib/commerce/sendcloud-provider.ts";

const parcel = resolveClientValidatedParcelProfile([{ quantity: 1 }]);
assert.ok(parcel);

function approved(overrides = {}) {
  return {
    returnRequestId: "return_request_1",
    orderNumber: "AJL-2026-0001",
    status: "approved",
    requestedAt: "2026-08-15T10:00:00.000Z",
    approvedAt: "2026-08-15T11:00:00.000Z",
    shippingOptionCode: "colissimo:return/drop_off",
    dutiesTerms: "EU_INCLUDED",
    customerAddress: {
      name: "Cliente Démo",
      addressLine1: "rue de Rivoli",
      houseNumber: "1",
      postalCode: "75001",
      city: "Paris",
      countryCode: "FR",
      email: "client@example.invalid",
    },
    parcel,
    items: [{
      orderLineId: "order_line_1",
      description: "Boxer AJ Luxury",
      quantity: 1,
      netWeightGrams: 130,
      unitPriceCents: 2999,
      sku: "AJL-BOXER-POURPRE-M",
      productId: "boxer_pourpre",
      returnReasonId: "26",
    }],
    ...overrides,
  };
}

test("approved return is validated then created with the exact AJ Luxury return address", async () => {
  const calls = [];
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async (url, init) => {
      calls.push({ url: String(url), init, body: JSON.parse(init.body) });
      if (String(url).endsWith("/api/v3/returns/validate")) {
        return Response.json({
          from_address: {},
          to_address: {},
          ship_with: {},
          weight: 0.15,
        });
      }
      return Response.json({ return_id: 12345, parcel_id: 67880, multi_collo_ids: [] }, { status: 201 });
    },
  );

  const receipt = await createApprovedReturnShipment(approved(), ports.returns);
  assert.equal(receipt.providerCode, "sendcloud");
  assert.equal(receipt.providerReturnReference, "12345");
  assert.equal(receipt.providerParcelReference, "67880");
  assert.equal(receipt.idempotencyKey, "return:return_request_1");
  assert.match(receipt.receiptFingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(calls.map((call) => call.url), [
    "https://panel.sendcloud.sc/api/v3/returns/validate",
    "https://panel.sendcloud.sc/api/v3/returns",
  ]);
  assert.deepEqual(calls[0].body.to_address, {
    name: "AJ Luxury",
    address_line_1: "rue Principale",
    house_number: "3 A",
    postal_code: "67130",
    city: "Belmont",
    country_code: "FR",
  });
  assert.deepEqual(calls[0].body.dimensions, {
    length: 40,
    width: 32,
    height: 4,
    unit: "cm",
  });
  assert.deepEqual(calls[0].body.weight, { value: 150, unit: "g" });
  assert.equal(calls[0].body.external_reference, "return:return_request_1");
  assert.equal(calls[0].body.delivery_option, "drop_off_point");
  assert.equal(calls[0].body.send_tracking_emails, false);
  assert.equal(calls[0].body.apply_rules, false);
  assert.equal("customs_invoice_nr" in calls[0].body, false);
  assert.deepEqual(calls[0].body, calls[1].body);
  assert.equal(calls[0].init.headers.Authorization.startsWith("Basic "), true);
});

test("received or rejected requests never contact Sendcloud or create a label", async () => {
  let calls = 0;
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async () => {
      calls += 1;
      return Response.json({});
    },
  );
  for (const status of ["received", "rejected"]) {
    await assert.rejects(
      () => createApprovedReturnShipment(approved({ status, approvedAt: undefined }), ports.returns),
      (error) => error instanceof ReturnOrchestrationError && error.code === "NOT_APPROVED",
    );
  }
  assert.equal(calls, 0);
});

test("launch scope and customs terms fail closed before the provider", async () => {
  let calls = 0;
  const provider = {
    async validate() { calls += 1; },
    async create() { calls += 1; throw new Error("unreachable"); },
  };
  await assert.rejects(
    () => createApprovedReturnShipment(approved({
      customerAddress: { ...approved().customerAddress, countryCode: "US", postalCode: "10001", stateProvinceCode: "NY" },
      dutiesTerms: "DDP",
    }), provider),
    (error) => error instanceof ReturnOrchestrationError && error.code === "CUSTOMS_NOT_READY",
  );
  await assert.rejects(
    () => createApprovedReturnShipment(approved({
      customerAddress: { ...approved().customerAddress, countryCode: "US", postalCode: "10001", stateProvinceCode: "NY" },
      dutiesTerms: "DAP",
    }), provider),
    (error) => error instanceof ReturnOrchestrationError && error.code === "CUSTOMS_NOT_READY",
  );
  await assert.rejects(
    () => createApprovedReturnShipment(approved({
      customerAddress: { ...approved().customerAddress, countryCode: "AU", postalCode: "2000" },
    }), provider),
    (error) => error instanceof ReturnOrchestrationError && error.code === "DESTINATION_UNAVAILABLE",
  );
  assert.equal(calls, 0);
});

test("parcel document retrieval uses V3, validates binary type and returns an immutable Blob", async () => {
  const calls = [];
  const pdf = new TextEncoder().encode("%PDF-1.7 AJ Luxury test label");
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(pdf, { headers: { "Content-Type": "application/pdf" } });
    },
  );
  const receipt = await ports.documents.document({
    requestId: "document_attempt_1",
    providerParcelReference: "67880",
    documentKind: "return_label",
  });
  assert.match(calls[0].url, /\/api\/v3\/parcels\/67880\/documents\/label\?/);
  assert.match(calls[0].url, /dpi=72/);
  assert.match(calls[0].url, /paper_size=A6/);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(receipt.providerDocumentReference, "sendcloud:parcel:67880:document:label");
  assert.equal(receipt.mediaType, "application/pdf");
  assert.equal(receipt.byteLength, pdf.byteLength);
  assert.match(receipt.contentSha256, /^[0-9a-f]{64}$/);
  assert.equal(receipt.content instanceof Blob, true);
  assert.equal(await receipt.content.text(), new TextDecoder().decode(pdf));
});

test("document retrieval rejects injection, oversized content and unexpected media without leaking details", async () => {
  let calls = 0;
  const noNetwork = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async () => { calls += 1; return Response.json({}); },
  );
  await assert.rejects(
    () => noNetwork.documents.document({
      requestId: "document_attempt_1",
      providerParcelReference: "67880/../../secret",
      documentKind: "label",
    }),
    (error) => error instanceof DeliveryProviderError && error.code === "REJECTED",
  );
  await assert.rejects(
    () => noNetwork.documents.document({
      requestId: "document_attempt_1",
      providerParcelReference: "67880",
      documentKind: "proof-of-delivery",
    }),
    (error) => error instanceof DeliveryProviderError && error.code === "REJECTED",
  );
  assert.equal(calls, 0);

  let cancelled = false;
  const oversized = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      headers: { "Content-Type": "application/pdf", "Content-Length": String(9 * 1024 * 1024) },
    }),
  );
  await assert.rejects(
    () => oversized.documents.document({ requestId: "doc_2", providerParcelReference: "1", documentKind: "customs" }),
    (error) => error instanceof DeliveryProviderError && error.code === "MALFORMED_RESPONSE",
  );
  assert.equal(cancelled, true);

  const wrongType = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async () => new Response("<html>not a label</html>", { headers: { "Content-Type": "text/html" } }),
  );
  await assert.rejects(
    () => wrongType.documents.document({ requestId: "doc_3", providerParcelReference: "1", documentKind: "label" }),
    (error) => error instanceof DeliveryProviderError && error.code === "MALFORMED_RESPONSE",
  );

  const transportError = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async () => { throw new Error("client@example.invalid secret payload"); },
  );
  await assert.rejects(
    () => transportError.documents.document({ requestId: "doc_4", providerParcelReference: "1", documentKind: "label" }),
    (error) => {
      assert.equal(error instanceof DeliveryProviderError, true);
      assert.equal(error.code, "OUTCOME_UNKNOWN");
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(error.message, /client|secret/i);
      return true;
    },
  );
});

test("a rejected create response stays outcome-unknown to forbid blind retries", async () => {
  let call = 0;
  const ports = createSendcloudProviderPorts(
    { publicKey: "public_key", secretKey: "x".repeat(32) },
    async (url) => {
      call += 1;
      if (String(url).endsWith("/validate")) {
        return Response.json({ from_address: {}, to_address: {}, ship_with: {}, weight: 0.15 });
      }
      return Response.json({ error: { message: "external_reference already used" } }, { status: 400 });
    },
  );
  await assert.rejects(
    () => createApprovedReturnShipment(approved(), ports.returns),
    (error) => error instanceof DeliveryProviderError && error.code === "OUTCOME_UNKNOWN",
  );
  assert.equal(call, 2);
});

test("Sendcloud return receipt parser rejects extra or multicollo data for one-parcel returns", async () => {
  const responses = [
    { return_id: 1, parcel_id: 2, multi_collo_ids: [], injected: true },
    { return_id: 1, parcel_id: 2, multi_collo_ids: [3] },
  ];
  for (const response of responses) {
    let call = 0;
    const ports = createSendcloudProviderPorts(
      { publicKey: "public_key", secretKey: "x".repeat(32) },
      async (url) => {
        call += 1;
        if (String(url).endsWith("/validate")) {
          return Response.json({ from_address: {}, to_address: {}, ship_with: {}, weight: 0.15 });
        }
        return Response.json(response, { status: 201 });
      },
    );
    await assert.rejects(
      () => createApprovedReturnShipment(approved(), ports.returns),
      (error) => error instanceof DeliveryProviderError && error.code === "MALFORMED_RESPONSE",
    );
    assert.equal(call, 2);
  }
});
