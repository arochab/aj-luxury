import type { CommerceD1Database } from "./d1-port.ts";
import { D1FulfillmentStore } from "./d1-fulfillment-store.ts";
import {
  assertFulfillmentIdentifier,
  assertFulfillmentTimestamp,
  sha256Hex,
} from "./fulfillment-domain.ts";
import { verifyPreprodSyntheticCarrierEvent } from "./preprod-test-carrier-adapter.internal.ts";

const OWNER_EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9.-]{1,190}$/;
const SYNTHETIC_PROVIDER_CODE = "synthetic_demo";

type OwnerOrderRow = {
  id: string;
  order_number: string;
  status: string;
  currency: "EUR";
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  created_at: string;
  paid_at: string | null;
  shipment_id: string | null;
  shipment_status: string | null;
  tracking_reference: string | null;
  label_created_at: string | null;
  handed_over_at: string | null;
  delivered_at: string | null;
};

type ShipmentStateRow = {
  id: string;
  order_id: string;
  status:
    | "label_pending"
    | "label_claimed"
    | "label_ready"
    | "handed_over"
    | "in_transit"
    | "delivered"
    | "failed";
  tracking_reference: string | null;
  label_created_at: string | null;
  handed_over_at: string | null;
  delivered_at: string | null;
  lease_expires_at: string | null;
  updated_at: string;
};

export type PreprodOwner = Readonly<{
  customerId: string;
  email: string;
}>;

export type PreprodDeliveryStage =
  | "paid"
  | "label_ready"
  | "handed_over"
  | "in_transit"
  | "delivered";

export type PreprodOwnerOrder = Readonly<{
  orderNumber: string;
  status: "pending_payment" | "paid";
  currency: "EUR";
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  delivery: Readonly<{
    simulation: true;
    provider: "synthetic-demo";
    externalCarrierContacted: false;
    parcelSent: false;
    stage: PreprodDeliveryStage;
    trackingReference: string | null;
    labelCreatedAt: string | null;
    handedOverAt: string | null;
    deliveredAt: string | null;
  }>;
  lines: readonly Readonly<{
    productName: string;
    colorName: string;
    size: "S" | "M" | "L" | "XL";
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>[];
}>;

export type PreprodOwnerAccount = Readonly<{
  email: string;
  authentication: "platform-passwordless";
  access: "owner-only";
  emailSent: false;
  orders: readonly PreprodOwnerOrder[];
}>;

function normalizeOwnerEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!OWNER_EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error("PREPROD_OWNER_INVALID");
  }
  return email;
}

export async function derivePreprodOwner(email: unknown): Promise<PreprodOwner> {
  const normalized = normalizeOwnerEmail(email);
  return Object.freeze({
    customerId: `customer_${await sha256Hex(`preprod-owner\u0000${normalized}`)}`,
    email: normalized,
  });
}

function deliveryStage(row: OwnerOrderRow): PreprodDeliveryStage {
  if (row.shipment_status === "delivered") return "delivered";
  if (row.shipment_status === "in_transit") return "in_transit";
  if (row.shipment_status === "handed_over") return "handed_over";
  if (row.shipment_status === "label_ready") return "label_ready";
  return "paid";
}

function strictIsoAfter(value: string, milliseconds = 1): string {
  assertFulfillmentTimestamp(value, "timestamp");
  return new Date(Date.parse(value) + milliseconds).toISOString();
}

export class D1PreprodOwnerDemoStore {
  readonly #database: CommerceD1Database;
  readonly #fulfillment: D1FulfillmentStore;

  constructor(database: CommerceD1Database, environment: unknown) {
    this.#database = database;
    this.#fulfillment = new D1FulfillmentStore(database, {
      shippingLabel: {
        async createLabel(request) {
          const receiptFingerprint = await sha256Hex(JSON.stringify({
            idempotencyKey: request.idempotencyKey,
            orderId: request.orderId,
            provider: SYNTHETIC_PROVIDER_CODE,
            shipmentId: request.shipmentId,
            simulation: true,
          }));
          return Object.freeze({
            shipmentId: request.shipmentId,
            orderId: request.orderId,
            idempotencyKey: request.idempotencyKey,
            providerCode: SYNTHETIC_PROVIDER_CODE,
            providerShipmentReference: `simulation_${request.shipmentId}`,
            trackingReference: `AJ-SIM-${receiptFingerprint.slice(0, 16).toUpperCase()}`,
            receiptFingerprint,
          });
        },
      },
      tracking: {
        verifyEvent(candidate) {
          return verifyPreprodSyntheticCarrierEvent(environment, candidate);
        },
      },
    });
  }

  async ensureOwner(owner: PreprodOwner, now: string): Promise<void> {
    assertFulfillmentIdentifier(owner.customerId, "customerId");
    const email = normalizeOwnerEmail(owner.email);
    assertFulfillmentTimestamp(now, "now");
    await this.#database.prepare(
      `INSERT OR IGNORE INTO customers (
        id, email, first_name, last_name, accepts_marketing,
        marketing_consent_at, account_enabled_at, created_at, updated_at,
        deleted_at
      ) VALUES (?, ?, NULL, NULL, 0, NULL, ?, ?, ?, NULL)`,
    ).bind(owner.customerId, email, now, now, now).run();
    const persisted = await this.#database.prepare(
      `SELECT id, email, account_enabled_at, deleted_at
      FROM customers WHERE id = ?`,
    ).bind(owner.customerId).first<{
      id: string;
      email: string;
      account_enabled_at: string | null;
      deleted_at: string | null;
    }>();
    if (
      !persisted || persisted.email.toLowerCase() !== email ||
      persisted.account_enabled_at === null || persisted.deleted_at !== null
    ) {
      throw new Error("PREPROD_OWNER_CONFLICT");
    }
  }

  async readAccount(owner: PreprodOwner): Promise<PreprodOwnerAccount> {
    assertFulfillmentIdentifier(owner.customerId, "customerId");
    const email = normalizeOwnerEmail(owner.email);
    const rows = await this.#database.prepare(
      `SELECT customer_order.id, customer_order.order_number,
        customer_order.status, customer_order.currency,
        customer_order.subtotal_cents, customer_order.shipping_cents,
        customer_order.total_cents, customer_order.created_at,
        customer_order.paid_at, shipment.id AS shipment_id,
        shipment.status AS shipment_status,
        shipment.tracking_reference, shipment.label_created_at,
        shipment.handed_over_at, shipment.delivered_at
      FROM orders AS customer_order
      LEFT JOIN shipments AS shipment ON shipment.order_id = customer_order.id
      WHERE customer_order.customer_id = ?
      ORDER BY customer_order.created_at DESC, customer_order.id DESC
      LIMIT 20`,
    ).bind(owner.customerId).all<OwnerOrderRow>();
    const orders = await Promise.all(rows.results.map(async (row) => {
      const lines = await this.#database.prepare(
        `SELECT product_name, color_name, size, quantity,
          unit_price_cents, line_total_cents
        FROM order_lines WHERE order_id = ? ORDER BY id`,
      ).bind(row.id).all<{
        product_name: string;
        color_name: string;
        size: "S" | "M" | "L" | "XL";
        quantity: number;
        unit_price_cents: number;
        line_total_cents: number;
      }>();
      return Object.freeze({
        orderNumber: row.order_number,
        status: row.status as "pending_payment" | "paid",
        currency: row.currency,
        subtotalCents: row.subtotal_cents,
        shippingCents: row.shipping_cents,
        totalCents: row.total_cents,
        createdAt: row.created_at,
        paidAt: row.paid_at,
        delivery: Object.freeze({
          simulation: true as const,
          provider: "synthetic-demo" as const,
          externalCarrierContacted: false as const,
          parcelSent: false as const,
          stage: deliveryStage(row),
          trackingReference: row.tracking_reference,
          labelCreatedAt: row.label_created_at,
          handedOverAt: row.handed_over_at,
          deliveredAt: row.delivered_at,
        }),
        lines: Object.freeze(lines.results.map((line) => Object.freeze({
          productName: line.product_name,
          colorName: line.color_name,
          size: line.size,
          quantity: line.quantity,
          unitPriceCents: line.unit_price_cents,
          lineTotalCents: line.line_total_cents,
        }))),
      });
    }));
    return Object.freeze({
      email,
      authentication: "platform-passwordless",
      access: "owner-only",
      emailSent: false,
      orders: Object.freeze(orders),
    });
  }

  async advanceCurrentOrder(
    owner: PreprodOwner,
    cartId: string,
    now: string,
  ): Promise<PreprodOwnerAccount> {
    assertFulfillmentIdentifier(owner.customerId, "customerId");
    assertFulfillmentIdentifier(cartId, "cartId");
    assertFulfillmentTimestamp(now, "now");
    const order = await this.#database.prepare(
      `SELECT id, status, paid_at FROM orders
      WHERE cart_id = ? AND customer_id = ?`,
    ).bind(cartId, owner.customerId).first<{
      id: string;
      status: string;
      paid_at: string | null;
    }>();
    if (!order || order.status !== "paid" || !order.paid_at) {
      throw new Error("PREPROD_PAID_ORDER_REQUIRED");
    }
    const shipment = await this.#database.prepare(
      `SELECT id, order_id, status, tracking_reference, label_created_at,
        handed_over_at, delivered_at, lease_expires_at, updated_at
      FROM shipments WHERE order_id = ?`,
    ).bind(order.id).first<ShipmentStateRow>();

    const shipmentHash = await sha256Hex(`preprod-shipment\u0000${order.id}`);
    const shipmentId = `shipment_${shipmentHash}`;
    const createOrRecoverLabel = async () => {
      try {
        await this.#fulfillment.createShipmentLabel({
          shipmentId,
          orderId: order.id,
          idempotencyKey: `shipment:synthetic:${shipmentHash}`,
          leaseToken: `lease_synthetic_${shipmentHash}`,
          leaseExpiresAt: new Date(Date.parse(now) + 60_000).toISOString(),
          now,
        });
      } catch (error) {
        // A simultaneous replay can observe the order before the first batch
        // commits. Converge only when the deterministic shipment is now fully
        // ready; every partial or unrelated failure remains closed.
        const converged = await this.#database.prepare(
          `SELECT status FROM shipments WHERE id = ? AND order_id = ?`,
        ).bind(shipmentId, order.id).first<{ status: string }>();
        if (
          !converged ||
          !["label_pending", "label_claimed", "label_ready"].includes(
            converged.status,
          )
        ) throw error;
      }
    };

    if (!shipment) {
      await createOrRecoverLabel();
      return this.readAccount(owner);
    }

    if (shipment.status === "label_ready") {
      if (!shipment.tracking_reference || !shipment.label_created_at) {
        throw new Error("PREPROD_TRACKING_CONFLICT");
      }
      const eventAt = strictIsoAfter(shipment.label_created_at);
      const eventHash = await sha256Hex(`synthetic-handover\u0000${shipment.id}`);
      const eventId = `handover_${eventHash}`;
      const eventFingerprint = await sha256Hex(JSON.stringify({
        eventType: "handed_over",
        occurredAt: eventAt,
        shipmentId: shipment.id,
        trackingReference: shipment.tracking_reference,
      }));
      await this.#database.batch([
        this.#database.prepare(
          `UPDATE customs_records SET status = 'ready',
            manual_reference = ?, record_fingerprint = ?, ready_at = ?,
            updated_at = ? WHERE shipment_id = ? AND status = 'pending'`,
        ).bind(
          `SIMULATION-${eventHash.slice(0, 12).toUpperCase()}`,
          eventFingerprint,
          eventAt,
          eventAt,
          shipment.id,
        ),
        this.#database.prepare(
          `INSERT OR IGNORE INTO shipment_tracking_events (
            id, shipment_id, provider_code, provider_event_id,
            carrier_receipt_id, event_type, tracking_reference,
            event_fingerprint, occurred_at, received_at
          ) VALUES (?, ?, 'internal_handover', ?, NULL, 'handed_over', ?, ?, ?, ?)`,
        ).bind(
          eventId,
          shipment.id,
          eventId,
          shipment.tracking_reference,
          eventFingerprint,
          eventAt,
          eventAt,
        ),
        this.#database.prepare(
          `UPDATE shipments SET status = 'handed_over', handed_over_at = ?,
            updated_at = ? WHERE id = ? AND status = 'label_ready'`,
        ).bind(eventAt, eventAt, shipment.id),
        this.#database.prepare(
          `INSERT OR IGNORE INTO audit_log (
            id, actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key, metadata_json, created_at
          ) VALUES (?, 'system', NULL, 'synthetic_shipment_handed_over',
            'shipment', ?, ?, ?, ?)`,
        ).bind(
          `audit_${eventId}`,
          shipment.id,
          `audit:synthetic-handover:${shipment.id}`,
          JSON.stringify({ externalCarrierContacted: false, simulation: true }),
          eventAt,
        ),
      ]);
      return this.readAccount(owner);
    }

    if (shipment.status === "handed_over" || shipment.status === "in_transit") {
      if (!shipment.tracking_reference || !shipment.handed_over_at) {
        throw new Error("PREPROD_TRACKING_CONFLICT");
      }
      const target = shipment.status === "handed_over" ? "in_transit" : "delivered";
      const previous = shipment.status === "handed_over"
        ? shipment.handed_over_at
        : shipment.updated_at;
      const eventAt = strictIsoAfter(previous);
      const eventHash = await sha256Hex(`synthetic-${target}\u0000${shipment.id}`);
      const providerEventId = `synthetic_${target}_${eventHash}`;
      const eventFingerprint = await sha256Hex(JSON.stringify({
        eventType: target,
        occurredAt: eventAt,
        providerCode: SYNTHETIC_PROVIDER_CODE,
        providerEventId,
        shipmentId: shipment.id,
        trackingReference: shipment.tracking_reference,
      }));
      await this.#fulfillment.recordTrackingEvent({
        shipmentId: shipment.id,
        providerCode: SYNTHETIC_PROVIDER_CODE,
        providerEventId,
        trackingReference: shipment.tracking_reference,
        eventType: target,
        eventFingerprint,
        occurredAt: eventAt,
      }, eventAt);
      return this.readAccount(owner);
    }

    if (shipment.status === "label_pending") {
      await createOrRecoverLabel();
      return this.readAccount(owner);
    }
    if (shipment.status === "label_claimed") {
      if (!shipment.lease_expires_at) {
        throw new Error("PREPROD_TRACKING_CONFLICT");
      }
      if (shipment.lease_expires_at <= now) {
        // The provider key and shipment id are stable. Once D1's short lease
        // expires, the existing fulfillment boundary safely reclaims it and
        // repeats the simulated provider call idempotently.
        await createOrRecoverLabel();
      }
      return this.readAccount(owner);
    }
    if (shipment.status === "delivered") return this.readAccount(owner);
    throw new Error("PREPROD_TRACKING_CONFLICT");
  }
}
