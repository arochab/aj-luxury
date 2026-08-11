import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  customerJourneyFixture,
  formatDemoEuros,
  totalForDestination,
} from "../lib/demo/customer-journey.ts";
import {
  SyntheticCustomerJourneySource,
} from "../lib/demo/customer-journey-source.ts";

test("synthetic customer fixture is exact, coherent and deeply immutable", () => {
  const fixture = customerJourneyFixture;

  assert.deepEqual(fixture.customer, {
    id: "customer_demo_alex",
    firstName: "Alex",
    lastName: "Martin",
    email: "alex.martin@example.com",
    accountLabel: "Compte client fictif",
  });
  assert.equal(fixture.addresses.FR.line1, "1 rue de la Préproduction");
  assert.equal(fixture.addresses.FR.postalCode, "75008");
  assert.equal(fixture.addresses.CA.line1, "1 Demo Avenue");
  assert.equal(fixture.addresses.CA.postalCode, "M5V 2T6");
  assert.equal(fixture.line.productName, "Apollon");
  assert.equal(fixture.line.colorName, "Pourpre Impérial");
  assert.equal(fixture.line.size, "M");
  assert.equal(fixture.line.quantity, 1);
  assert.equal(fixture.line.unitPriceCents, 2999);
  assert.equal(fixture.payment.maskedCard, "•••• 4242");
  assert.equal(fixture.order.number, "AJ-DEMO-1042");
  assert.equal(fixture.order.shipmentId, "shipment_demo_1042");
  assert.equal(fixture.order.trackingReference, "DEMO-DHL-1042");
  assert.equal(fixture.returnRequest.number, "RET-DEMO-1042");
  assert.equal(fixture.refund.amountCents, 2999);

  assert.ok(Object.isFrozen(fixture));
  assert.ok(Object.isFrozen(fixture.customer));
  assert.ok(Object.isFrozen(fixture.addresses));
  assert.ok(Object.isFrozen(fixture.addresses.CA));
  assert.ok(Object.isFrozen(fixture.order.timeline));
  assert.ok(Object.isFrozen(fixture.order.timeline[0]));
});

test("France and Canada totals, delays and customs terms remain deterministic", () => {
  assert.deepEqual(Object.keys(customerJourneyFixture.shippingOptions).sort(), [
    "CA",
    "FR",
  ]);
  assert.equal(customerJourneyFixture.shippingOptions.FR.priceCents, 790);
  assert.equal(customerJourneyFixture.shippingOptions.FR.leadTime, "2 à 3 jours ouvrés");
  assert.equal(customerJourneyFixture.shippingOptions.FR.customsTerm, "Taxes incluses");
  assert.equal(customerJourneyFixture.shippingOptions.CA.priceCents, 1890);
  assert.equal(customerJourneyFixture.shippingOptions.CA.leadTime, "3 à 5 jours ouvrés");
  assert.equal(customerJourneyFixture.shippingOptions.CA.customsTerm, "DAP");
  assert.equal(totalForDestination("FR"), 3789);
  assert.equal(totalForDestination("CA"), 4889);
  assert.match(formatDemoEuros(2999), /29,99/);
});

test("the customer journey uses the explicit source seam and no D03 import", async () => {
  const source = new SyntheticCustomerJourneySource();
  assert.equal(await source.read(), customerJourneyFixture);

  const sourceFile = await readFile(
    new URL("../lib/demo/customer-journey-source.ts", import.meta.url),
    "utf8",
  );
  assert.match(sourceFile, /implements CustomerJourneySource/);
  assert.match(sourceFile, /SyntheticCustomerJourneySource/);
  assert.doesNotMatch(
    sourceFile,
    /(?:import|export)[^\n]*(?:d1-fulfillment|fulfillment-domain)/i,
  );
});
