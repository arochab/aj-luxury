import type { CommerceD1Database } from "./d1-port.ts";
import type {
  PaymentWebhookApplyDisposition,
  PaymentWebhookEffectsPort,
  VerifiedPaymentProviderEvent,
  VerifiedRefundProviderEvent,
} from "./payment-provider.ts";
import { assertFulfillmentTimestamp, sha256Hex } from "./fulfillment-domain.ts";
import { buildPaidOrderEmail } from "./paid-order-email.ts";

export class StripePaymentEffectsError extends Error {
  readonly code: "MISMATCH" | "PERSISTENCE_FAILURE";
  constructor(code: StripePaymentEffectsError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StripePaymentEffectsError";
    this.code = code;
  }
}

type OrderPaymentRow = Readonly<{
  id: string;
  order_number: string;
  cart_id: string;
  email: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  terms_version: string;
  shipping_address_json: string;
  delivery_display_name: string | null;
  delivery_mode: "home" | "service_point" | null;
  checkout_session_id: string | null;
  checkout_status: string | null;
  checkout_amount: number | null;
  checkout_currency: string | null;
  succeeded_payment_id: string | null;
}>;

export class D1StripePaymentEffectsStore implements PaymentWebhookEffectsPort {
  readonly #database: CommerceD1Database;
  readonly #expectedLivemode: boolean;
  constructor(database: CommerceD1Database, expectedLivemode: boolean) {
    this.#database = database;
    this.#expectedLivemode = expectedLivemode;
  }

  async applyVerified(
    event: VerifiedPaymentProviderEvent | VerifiedRefundProviderEvent,
  ): Promise<PaymentWebhookApplyDisposition> {
    if (event.kind !== "payment" || event.state !== "paid") return "stale";
    if (event.livemode !== this.#expectedLivemode || !event.providerCheckoutSessionId) {
      throw new StripePaymentEffectsError("MISMATCH", "Paid event mode or Checkout session is invalid.");
    }
    assertFulfillmentTimestamp(event.occurredAt, "occurredAt");
    const verifiedAt = new Date().toISOString();
    const order = await this.#order(event.orderId, event.providerCheckoutSessionId);
    if (order?.status === "paid") {
      return await this.#semanticComplete(event) ? "duplicate" : "stale";
    }
    if (
      !order || !["pending_payment", "cancelled"].includes(order.status) ||
      order.currency !== "EUR" ||
      order.total_cents !== event.amountCents || event.currency !== "EUR" ||
      order.checkout_session_id !== event.providerCheckoutSessionId ||
      order.checkout_status !== "created" || order.checkout_amount !== order.total_cents ||
      order.checkout_currency !== "EUR" || order.succeeded_payment_id !== null
    ) throw new StripePaymentEffectsError("MISMATCH", "Stripe payment does not match the server order.");
    if (order.status === "cancelled") {
      return await this.#latePaymentRecorded(event)
        ? "duplicate"
        : this.#recordLatePaymentDivergence(
          event,
          order,
          verifiedAt,
          "stock_reservation_inactive_or_missing",
        );
    }
    const timing = await this.#database.prepare(
      `SELECT COUNT(*) AS total_count,
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN status='active' AND EXISTS (
          SELECT 1 FROM order_lines WHERE order_id=?
            AND variant_id=stock_reservations.variant_id
            AND quantity=stock_reservations.quantity
        ) THEN 1 ELSE 0 END) AS matched_count,
        (SELECT COUNT(*) FROM order_lines WHERE order_id=?) AS order_line_count,
        MIN(CASE WHEN status='active' THEN expires_at END) AS minimum_active_expires_at
      FROM stock_reservations WHERE cart_id = ?`,
    ).bind(order.id, order.id, order.cart_id).first<{
      total_count: number;
      active_count: number;
      matched_count: number;
      order_line_count: number;
      minimum_active_expires_at: string | null;
    }>();
    if (!timing || timing.total_count < 1 || timing.order_line_count < 1 ||
      timing.total_count !== timing.order_line_count ||
      timing.active_count !== timing.order_line_count ||
      timing.matched_count !== timing.order_line_count ||
      !timing.minimum_active_expires_at) {
      return await this.#recordLatePaymentDivergence(event, order, verifiedAt, "stock_reservation_inactive_or_missing");
    }
    if (timing.minimum_active_expires_at <= event.occurredAt) {
      return await this.#recordLatePaymentDivergence(event, order, verifiedAt, "stock_reservation_expired_at_payment");
    }
    const semanticHash = await sha256Hex(event.semanticKey);
    const eventHash = await sha256Hex(event.providerEventId);
    const eventKey = `webhook:stripe:${event.providerEventId}`;
    const lineRows = await this.#database.prepare(
      `SELECT product_name, color_name, size, quantity, line_total_cents
      FROM order_lines WHERE order_id=? ORDER BY id`,
    ).bind(order.id).all<{
      product_name: string;
      color_name: string;
      size: string;
      quantity: number;
      line_total_cents: number;
    }>();
    if (!order.delivery_display_name || !order.delivery_mode || lineRows.results.length < 1) {
      throw new StripePaymentEffectsError("MISMATCH", "Paid order email snapshot is incomplete.");
    }
    let deliveryAddressLines: string[];
    try {
      const address = JSON.parse(order.shipping_address_json) as Record<string, unknown>;
      if (
        !address || typeof address !== "object" || Array.isArray(address) ||
        typeof address.recipient !== "string" || typeof address.line1 !== "string" ||
        typeof address.postalCode !== "string" || typeof address.city !== "string" ||
        typeof address.countryCode !== "string" ||
        (address.line2 !== undefined && address.line2 !== null && typeof address.line2 !== "string")
      ) throw new Error("invalid address");
      deliveryAddressLines = [
        address.recipient,
        address.line1,
        ...(typeof address.line2 === "string" && address.line2.trim() ? [address.line2] : []),
        `${address.postalCode} ${address.city}`,
        address.countryCode,
      ];
    } catch (cause) {
      throw new StripePaymentEffectsError("MISMATCH", "Paid order delivery address is invalid.", { cause });
    }
    const emailSnapshot = {
      orderNumber: order.order_number,
      lines: lineRows.results.map((line) => ({
        productName: line.product_name,
        colorName: line.color_name,
        size: line.size,
        quantity: line.quantity,
        lineTotalCents: line.line_total_cents,
      })),
      subtotalCents: order.subtotal_cents,
      discountCents: order.discount_cents,
      shippingCents: order.shipping_cents,
      taxCents: order.tax_cents,
      totalCents: order.total_cents,
      deliveryName: order.delivery_display_name,
      deliveryMode: order.delivery_mode,
      deliveryAddressLines,
      termsVersion: order.terms_version,
    } as const;
    let orderEmail;
    let paymentEmail;
    try {
      orderEmail = buildPaidOrderEmail("order-confirmation", emailSnapshot);
      paymentEmail = buildPaidOrderEmail("payment-confirmation", emailSnapshot);
    } catch (cause) {
      throw new StripePaymentEffectsError("MISMATCH", "Paid order email snapshot is incoherent.", { cause });
    }
    const orderPayloadJson = JSON.stringify(orderEmail);
    const paymentPayloadJson = JSON.stringify(paymentEmail);
    if (orderPayloadJson.length > 12_500 || paymentPayloadJson.length > 12_500) {
      throw new StripePaymentEffectsError("MISMATCH", "Email payload is too large.");
    }
    try {
      await this.#database.batch([
        this.#database.prepare(
          `INSERT INTO webhook_events (
            id, provider, provider_event_id, event_type, payload_fingerprint,
            verification_method, verified_at, order_id, provider_payment_id,
            amount_cents, currency, status, attempts, received_at
          ) VALUES (?, 'stripe', ?, 'payment.succeeded', ?, 'stripe_signature',
            ?, ?, ?, ?, 'EUR', 'verified', 0, ?)`,
        ).bind(`webhook_stripe_${eventHash}`, event.providerEventId, semanticHash, verifiedAt, order.id, event.providerPaymentId, order.total_cents, event.occurredAt),
        this.#database.prepare(
          `INSERT INTO payments (
            id, order_id, provider, provider_session_id, status, amount_cents,
            currency, idempotency_key, failure_code, created_at, updated_at
          ) VALUES (?, ?, 'stripe', ?, 'succeeded', ?, 'EUR', ?, NULL, ?, ?)`,
        ).bind(`payment_stripe_paid_${eventHash}`, order.id, event.providerPaymentId, order.total_cents, `payment:stripe:${event.providerPaymentId}`, event.occurredAt, verifiedAt),
        this.#database.prepare(
          `UPDATE stock_reservations SET status='converted', converted_order_id=?,
            last_transition_key=?, updated_at=?
          WHERE cart_id=? AND status='active' AND expires_at>?`,
        ).bind(order.id, eventKey, event.occurredAt, order.cart_id, event.occurredAt),
        this.#database.prepare(
          `INSERT INTO inventory_movements (
            id, variant_id, kind, quantity, reference_type, reference_id,
            actor_type, actor_id, idempotency_key, created_at
          ) SELECT 'movement_sale_' || id, variant_id, 'sale', quantity,
            'order', converted_order_id, 'system', NULL,
            'sale:' || ? || ':' || id, ? FROM stock_reservations
          WHERE cart_id=? AND converted_order_id=? AND status='converted'
            AND last_transition_key=?`,
        ).bind(eventKey, event.occurredAt, order.cart_id, order.id, eventKey),
        this.#database.prepare(
          `UPDATE orders SET status='paid', paid_at=?, updated_at=?
          WHERE id=? AND cart_id=? AND status='pending_payment'
            AND total_cents=? AND currency='EUR'`,
        ).bind(event.occurredAt, verifiedAt, order.id, order.cart_id, order.total_cents),
        this.#database.prepare(
          `UPDATE carts SET status='converted', updated_at=? WHERE id=?
          AND status='open' AND EXISTS (
            SELECT 1 FROM orders WHERE id=? AND status='paid'
          )`,
        ).bind(verifiedAt, order.cart_id, order.id),
        this.#database.prepare(
          `INSERT INTO email_outbox (
            id, kind, transaction_intent, source_event_id, recipient_email,
            order_id, access_challenge_id, locale, template_version,
            payload_json, status, attempts, max_attempts, next_attempt_at,
            lease_token_hash, leased_at, lease_expires_at, last_error_code,
            idempotency_key, provider_idempotency_key, created_at, updated_at,
            sent_at, terminal_at, purged_at
          ) VALUES (?, 'order_confirmation', 'payment_succeeded', ?, ?, ?,
            NULL, 'fr', 'order-confirmation-v2', ?, 'pending', 0, 5, ?,
            NULL, NULL, NULL, NULL, ?, ?, ?, ?, NULL, NULL, NULL)`,
        ).bind(`outbox_order_${eventHash}`, event.providerEventId, order.email, order.id, orderPayloadJson, verifiedAt, `email:order-confirmation:${order.id}`, `order_confirmation:${order.id}`, verifiedAt, verifiedAt),
        this.#database.prepare(
          `INSERT INTO email_outbox (
            id, kind, transaction_intent, source_event_id, recipient_email,
            order_id, access_challenge_id, locale, template_version,
            payload_json, status, attempts, max_attempts, next_attempt_at,
            lease_token_hash, leased_at, lease_expires_at, last_error_code,
            idempotency_key, provider_idempotency_key, created_at, updated_at,
            sent_at, terminal_at, purged_at
          ) VALUES (?, 'payment_confirmation', 'payment_succeeded', ?, ?, ?,
            NULL, 'fr', 'payment-confirmation-v1', ?, 'pending', 0, 5, ?,
            NULL, NULL, NULL, NULL, ?, ?, ?, ?, NULL, NULL, NULL)`,
        ).bind(`outbox_stripe_${eventHash}`, event.providerEventId, order.email, order.id, paymentPayloadJson, verifiedAt, `email:payment-confirmation:${order.id}`, `payment_confirmation:${order.id}`, verifiedAt, verifiedAt),
        this.#database.prepare(
          `INSERT INTO audit_log (
            id, actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key, metadata_json, created_at
          ) VALUES (?, 'system', NULL, 'payment_succeeded', 'order', ?, ?, ?, ?)`,
        ).bind(`audit_stripe_${semanticHash}`, order.id, `stripe-semantic:${semanticHash}`, JSON.stringify({ checkoutSessionId: event.providerCheckoutSessionId, eventId: event.providerEventId, paymentId: event.providerPaymentId }), verifiedAt),
        this.#database.prepare(
          `UPDATE webhook_events SET status='processed', attempts=1,
            processed_at=?, last_error_code=NULL WHERE provider='stripe'
            AND provider_event_id=? AND order_id=? AND provider_payment_id=?
            AND amount_cents=? AND currency='EUR' AND status='verified'`,
        ).bind(verifiedAt, event.providerEventId, order.id, event.providerPaymentId, order.total_cents),
      ]);
    } catch (cause) {
      if (await this.#semanticComplete(event)) return "duplicate";
      throw new StripePaymentEffectsError("PERSISTENCE_FAILURE", "Atomic Stripe payment commit failed.", { cause });
    }
    if (!await this.#complete(event)) {
      throw new StripePaymentEffectsError("PERSISTENCE_FAILURE", "Atomic Stripe payment commit is incomplete.");
    }
    return "applied";
  }

  async #order(
    orderId: string,
    providerCheckoutSessionId: string,
  ): Promise<OrderPaymentRow | null> {
    return this.#database.prepare(
      `SELECT customer_order.id, customer_order.order_number,
        customer_order.cart_id, customer_order.email, customer_order.status,
        customer_order.currency, customer_order.subtotal_cents,
        customer_order.discount_cents, customer_order.shipping_cents,
        customer_order.tax_cents, customer_order.total_cents,
        customer_order.terms_version,
        customer_order.shipping_address_json,
        delivery_option.display_name AS delivery_display_name,
        delivery_option.delivery_mode AS delivery_mode,
        checkout.provider_session_id AS checkout_session_id,
        checkout.status AS checkout_status,
        checkout.amount_cents AS checkout_amount,
        checkout.currency AS checkout_currency,
        succeeded.provider_session_id AS succeeded_payment_id
      FROM orders AS customer_order
      LEFT JOIN payments AS checkout ON checkout.order_id=customer_order.id
        AND checkout.provider='stripe'
        AND checkout.provider_session_id=?
        AND checkout.status IN ('created','requires_action')
      LEFT JOIN payments AS succeeded ON succeeded.order_id=customer_order.id
        AND succeeded.provider='stripe' AND succeeded.status='succeeded'
      LEFT JOIN delivery_option_snapshots AS delivery_option
        ON delivery_option.shipping_quote_id=customer_order.shipping_quote_id
      WHERE customer_order.id=? LIMIT 1`,
    ).bind(providerCheckoutSessionId, orderId).first<OrderPaymentRow>();
  }

  async #recordLatePaymentDivergence(
    event: VerifiedPaymentProviderEvent,
    order: OrderPaymentRow,
    recordedAt: string,
    reason: "stock_reservation_inactive_or_missing" | "stock_reservation_expired_at_payment",
  ): Promise<PaymentWebhookApplyDisposition> {
    const semanticHash = await sha256Hex(event.semanticKey);
    const eventHash = await sha256Hex(event.providerEventId);
    const paymentHash = await sha256Hex(event.providerPaymentId);
    const webhookId = `webhook_stripe_late_${eventHash}`;
    const intentId = `late_refund_${paymentHash}`;
    try {
      await this.#database.batch([
        this.#database.prepare(
          `INSERT INTO webhook_events (
            id, provider, provider_event_id, event_type, payload_fingerprint,
            verification_method, verified_at, order_id, provider_payment_id,
            amount_cents, currency, status, attempts, received_at
          ) VALUES (?, 'stripe', ?, 'payment.succeeded', ?, 'stripe_signature',
            ?, ?, ?, ?, 'EUR', 'verified', 0, ?)`,
        ).bind(webhookId, event.providerEventId, semanticHash, recordedAt, order.id, event.providerPaymentId, order.total_cents, event.occurredAt),
        this.#database.prepare(
          `INSERT INTO late_payment_refund_intents (
            id, webhook_event_id, order_id, provider_event_id,
            provider_checkout_session_id, provider_payment_id, amount_cents,
            currency, divergence_reason, status, idempotency_key,
            attempts, max_attempts, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EUR', ?, 'pending', ?, 0, 5, ?, ?)`,
        ).bind(
          intentId,
          webhookId,
          order.id,
          event.providerEventId,
          event.providerCheckoutSessionId,
          event.providerPaymentId,
          order.total_cents,
          reason,
          `late-refund:${paymentHash}`,
          recordedAt,
          recordedAt,
        ),
        this.#database.prepare(
          `INSERT INTO audit_log (
            id, actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key, metadata_json, created_at
          ) VALUES (?, 'system', NULL, 'late_payment_refund_obligation_created',
            'late_payment_refund_intent', ?, ?, ?, ?)`,
        ).bind(
          `audit_stripe_late_${semanticHash}`,
          intentId,
          `stripe-late-payment:${semanticHash}`,
          JSON.stringify({
            checkoutSessionId: event.providerCheckoutSessionId,
            eventId: event.providerEventId,
            paymentId: event.providerPaymentId,
            reason,
          }),
          recordedAt,
        ),
        this.#database.prepare(
          `UPDATE webhook_events SET status='processed', attempts=1,
            processed_at=?, last_error_code=NULL
          WHERE id=? AND status='verified' AND provider='stripe'
            AND provider_event_id=? AND order_id=?
            AND provider_payment_id=? AND amount_cents=? AND currency='EUR'`,
        ).bind(
          recordedAt,
          webhookId,
          event.providerEventId,
          order.id,
          event.providerPaymentId,
          order.total_cents,
        ),
      ]);
    } catch (cause) {
      const recorded = await this.#latePaymentRecorded(event);
      if (!recorded) {
        throw new StripePaymentEffectsError(
          "PERSISTENCE_FAILURE",
          "Late-payment divergence could not be recorded.",
          { cause },
        );
      }
      return "duplicate";
    }
    if (!await this.#latePaymentRecorded(event)) {
      throw new StripePaymentEffectsError(
        "PERSISTENCE_FAILURE",
        "Late-payment refund obligation commit is incomplete.",
      );
    }
    return "applied";
  }

  async #latePaymentRecorded(
    event: VerifiedPaymentProviderEvent,
  ): Promise<boolean> {
    const semanticHash = await sha256Hex(event.semanticKey);
    const row = await this.#database.prepare(
      `SELECT COUNT(*) AS count FROM late_payment_refund_intents AS intent
      INNER JOIN webhook_events AS original
        ON original.id=intent.webhook_event_id
      INNER JOIN audit_log AS evidence
        ON evidence.entity_type='late_payment_refund_intent'
        AND evidence.entity_id=intent.id
        AND evidence.action='late_payment_refund_obligation_created'
      INNER JOIN orders ON orders.id=intent.order_id
      WHERE intent.provider_payment_id=?
        AND intent.provider_checkout_session_id=?
        AND intent.amount_cents=? AND intent.currency='EUR'
        AND intent.order_id=?
        AND original.provider='stripe' AND original.status='processed'
        AND (NOT EXISTS (
          SELECT 1 FROM webhook_events AS collision
          WHERE collision.provider='stripe' AND collision.provider_event_id=?
        ) OR EXISTS (
          SELECT 1 FROM webhook_events AS replay
          WHERE replay.provider='stripe' AND replay.provider_event_id=?
            AND replay.provider_payment_id=?
            AND replay.payload_fingerprint=?
            AND replay.order_id=? AND replay.amount_cents=?
            AND replay.currency='EUR' AND replay.status='processed'
        ))
        AND NOT EXISTS (SELECT 1 FROM payments WHERE order_id=orders.id
          AND provider='stripe' AND status='succeeded')
        AND NOT EXISTS (SELECT 1 FROM inventory_movements
          WHERE reference_type='order' AND reference_id=orders.id AND kind='sale')`,
    ).bind(
      event.providerPaymentId,
      event.providerCheckoutSessionId,
      event.amountCents,
      event.orderId,
      event.providerEventId,
      event.providerEventId,
      event.providerPaymentId,
      semanticHash,
      event.orderId,
      event.amountCents,
    ).first<{ count: number }>();
    return Number(row?.count ?? 0) === 1;
  }

  async #complete(event: VerifiedPaymentProviderEvent): Promise<boolean> {
    const semanticHash = await sha256Hex(event.semanticKey);
    const row = await this.#database.prepare(
      `SELECT COUNT(*) AS count FROM orders
      INNER JOIN carts ON carts.id=orders.cart_id
      INNER JOIN payments ON payments.order_id=orders.id
        AND payments.provider='stripe' AND payments.status='succeeded'
        AND payments.provider_session_id=? AND payments.amount_cents=orders.total_cents
        AND payments.currency=orders.currency
      INNER JOIN webhook_events ON webhook_events.order_id=orders.id
        AND webhook_events.provider='stripe' AND webhook_events.provider_event_id=?
        AND webhook_events.provider_payment_id=? AND webhook_events.status='processed'
      INNER JOIN audit_log ON audit_log.entity_id=orders.id
        AND audit_log.idempotency_key=?
      INNER JOIN email_outbox AS payment_email ON payment_email.order_id=orders.id
        AND payment_email.kind='payment_confirmation' AND payment_email.status='pending'
      INNER JOIN email_outbox AS order_email ON order_email.order_id=orders.id
        AND order_email.kind='order_confirmation' AND order_email.status='pending'
      WHERE orders.id=? AND orders.status='paid' AND carts.status='converted'
        AND orders.total_cents=? AND orders.currency='EUR'
        AND EXISTS (SELECT 1 FROM stock_reservations WHERE cart_id=orders.cart_id
          AND status='converted' AND converted_order_id=orders.id)`,
    ).bind(event.providerPaymentId, event.providerEventId, event.providerPaymentId, `stripe-semantic:${semanticHash}`, event.orderId, event.amountCents).first<{ count: number }>();
    return Number(row?.count ?? 0) === 1;
  }

  async #semanticComplete(event: VerifiedPaymentProviderEvent): Promise<boolean> {
    const semanticHash = await sha256Hex(event.semanticKey);
    const row = await this.#database.prepare(
      `SELECT COUNT(*) AS count FROM orders
      INNER JOIN carts ON carts.id=orders.cart_id
      INNER JOIN payments ON payments.order_id=orders.id
        AND payments.provider='stripe' AND payments.status='succeeded'
        AND payments.provider_session_id=? AND payments.amount_cents=orders.total_cents
        AND payments.currency=orders.currency
      INNER JOIN audit_log ON audit_log.entity_id=orders.id
        AND audit_log.idempotency_key=?
      INNER JOIN email_outbox AS payment_email ON payment_email.order_id=orders.id
        AND payment_email.kind='payment_confirmation'
      INNER JOIN email_outbox AS order_email ON order_email.order_id=orders.id
        AND order_email.kind='order_confirmation'
      WHERE orders.id=? AND orders.status='paid' AND carts.status='converted'
        AND orders.total_cents=? AND orders.currency='EUR'
        AND EXISTS (SELECT 1 FROM webhook_events WHERE order_id=orders.id
          AND provider='stripe' AND provider_payment_id=? AND status='processed')
        AND EXISTS (SELECT 1 FROM stock_reservations WHERE cart_id=orders.cart_id
          AND status='converted' AND converted_order_id=orders.id)`,
    ).bind(event.providerPaymentId, `stripe-semantic:${semanticHash}`, event.orderId, event.amountCents, event.providerPaymentId).first<{ count: number }>();
    return Number(row?.count ?? 0) === 1;
  }
}
