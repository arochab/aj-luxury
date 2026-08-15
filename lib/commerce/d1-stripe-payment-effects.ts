import type { CommerceD1Database } from "./d1-port.ts";
import type {
  PaymentWebhookApplyDisposition,
  PaymentWebhookEffectsPort,
  VerifiedPaymentProviderEvent,
  VerifiedRefundProviderEvent,
} from "./payment-provider.ts";
import { assertFulfillmentTimestamp, sha256Hex } from "./fulfillment-domain.ts";
import { buildTransactionalEmail } from "./transactional-email.ts";

export class StripePaymentEffectsError extends Error {
  readonly code: "MISMATCH" | "PERSISTENCE_FAILURE" | "LATE_PAYMENT_COMPENSATION_REQUIRED";
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
  total_cents: number;
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
    const order = await this.#order(event.orderId);
    if (order?.status === "paid") {
      return await this.#semanticComplete(event) ? "duplicate" : "stale";
    }
    if (
      !order || order.status !== "pending_payment" || order.currency !== "EUR" ||
      order.total_cents !== event.amountCents || event.currency !== "EUR" ||
      order.checkout_session_id !== event.providerCheckoutSessionId ||
      order.checkout_status !== "created" || order.checkout_amount !== order.total_cents ||
      order.checkout_currency !== "EUR" || order.succeeded_payment_id !== null
    ) throw new StripePaymentEffectsError("MISMATCH", "Stripe payment does not match the server order.");
    const timing = await this.#database.prepare(
      `SELECT COUNT(*) AS total_count,
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_count,
        MIN(CASE WHEN status='active' THEN expires_at END) AS minimum_active_expires_at
      FROM stock_reservations WHERE cart_id = ?`,
    ).bind(order.cart_id).first<{
      total_count: number;
      active_count: number;
      minimum_active_expires_at: string | null;
    }>();
    if (!timing || timing.total_count < 1 || timing.active_count < 1 || !timing.minimum_active_expires_at) {
      return await this.#recordLatePaymentDivergence(event, order, verifiedAt, "stock_reservation_inactive_or_missing");
    }
    if (timing.minimum_active_expires_at <= event.occurredAt) {
      return await this.#recordLatePaymentDivergence(event, order, verifiedAt, "stock_reservation_expired_at_payment");
    }
    const semanticHash = await sha256Hex(event.semanticKey);
    const eventHash = await sha256Hex(event.providerEventId);
    const eventKey = `webhook:stripe:${event.providerEventId}`;
    const email = await buildTransactionalEmail({
      kind: "payment-confirmation",
      eventId: event.providerEventId,
      locale: "fr",
      recipientEmail: order.email,
      orderNumber: order.order_number,
    });
    const payloadJson = JSON.stringify({ subject: email.subject, text: email.text });
    if (payloadJson.length > 12_500) throw new StripePaymentEffectsError("MISMATCH", "Email payload is too large.");
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
          ) VALUES (?, 'payment_confirmation', 'payment_succeeded', ?, ?, ?,
            NULL, 'fr', 'payment-confirmation-v1', ?, 'pending', 0, 5, ?,
            NULL, NULL, NULL, NULL, ?, ?, ?, ?, NULL, NULL, NULL)`,
        ).bind(`outbox_stripe_${eventHash}`, event.providerEventId, order.email, order.id, payloadJson, verifiedAt, `email:payment-confirmation:${order.id}`, `payment_confirmation:${order.id}`, verifiedAt, verifiedAt),
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

  async #order(orderId: string): Promise<OrderPaymentRow | null> {
    return this.#database.prepare(
      `SELECT customer_order.id, customer_order.order_number,
        customer_order.cart_id, customer_order.email, customer_order.status,
        customer_order.currency, customer_order.total_cents,
        checkout.provider_session_id AS checkout_session_id,
        checkout.status AS checkout_status,
        checkout.amount_cents AS checkout_amount,
        checkout.currency AS checkout_currency,
        succeeded.provider_session_id AS succeeded_payment_id
      FROM orders AS customer_order
      LEFT JOIN payments AS checkout ON checkout.order_id=customer_order.id
        AND checkout.provider='stripe' AND checkout.status='created'
      LEFT JOIN payments AS succeeded ON succeeded.order_id=customer_order.id
        AND succeeded.provider='stripe' AND succeeded.status='succeeded'
      WHERE customer_order.id=? LIMIT 1`,
    ).bind(orderId).first<OrderPaymentRow>();
  }

  async #recordLatePaymentDivergence(
    event: VerifiedPaymentProviderEvent,
    order: OrderPaymentRow,
    recordedAt: string,
    reason: "stock_reservation_inactive_or_missing" | "stock_reservation_expired_at_payment",
  ): Promise<never> {
    const semanticHash = await sha256Hex(event.semanticKey);
    const eventHash = await sha256Hex(event.providerEventId);
    try {
      await this.#database.batch([
        this.#database.prepare(
          `INSERT INTO webhook_events (
            id, provider, provider_event_id, event_type, payload_fingerprint,
            verification_method, verified_at, order_id, provider_payment_id,
            amount_cents, currency, status, attempts, received_at
          ) VALUES (?, 'stripe', ?, 'payment.succeeded', ?, 'stripe_signature',
            ?, ?, ?, ?, 'EUR', 'verified', 0, ?)`,
        ).bind(`webhook_stripe_late_${eventHash}`, event.providerEventId, semanticHash, recordedAt, order.id, event.providerPaymentId, order.total_cents, event.occurredAt),
        this.#database.prepare(
          `INSERT INTO audit_log (
            id, actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key, metadata_json, created_at
          ) VALUES (?, 'system', NULL, 'late_payment_compensation_required',
            'order', ?, ?, ?, ?)`,
        ).bind(
          `audit_stripe_late_${semanticHash}`,
          order.id,
          `stripe-late-payment:${semanticHash}`,
          JSON.stringify({
            checkoutSessionId: event.providerCheckoutSessionId,
            eventId: event.providerEventId,
            paymentId: event.providerPaymentId,
            reason,
          }),
          recordedAt,
        ),
      ]);
    } catch (cause) {
      const recorded = await this.#latePaymentRecorded(event, semanticHash);
      if (!recorded) {
        throw new StripePaymentEffectsError(
          "PERSISTENCE_FAILURE",
          "Late-payment divergence could not be recorded.",
          { cause },
        );
      }
    }
    throw new StripePaymentEffectsError(
      "LATE_PAYMENT_COMPENSATION_REQUIRED",
      "Late payment requires an idempotent refund or cancellation workflow.",
    );
  }

  async #latePaymentRecorded(
    event: VerifiedPaymentProviderEvent,
    semanticHash: string,
  ): Promise<boolean> {
    const row = await this.#database.prepare(
      `SELECT COUNT(*) AS count FROM webhook_events
      INNER JOIN audit_log ON audit_log.entity_id=webhook_events.order_id
        AND audit_log.idempotency_key=?
      INNER JOIN orders ON orders.id=webhook_events.order_id
      INNER JOIN carts ON carts.id=orders.cart_id
      WHERE webhook_events.provider='stripe'
        AND webhook_events.provider_event_id=?
        AND webhook_events.provider_payment_id=?
        AND webhook_events.payload_fingerprint=?
        AND webhook_events.status='verified'
        AND orders.id=? AND orders.status='pending_payment'
        AND carts.status='open'
        AND NOT EXISTS (SELECT 1 FROM payments WHERE order_id=orders.id
          AND provider='stripe' AND status='succeeded')
        AND NOT EXISTS (SELECT 1 FROM inventory_movements
          WHERE reference_type='order' AND reference_id=orders.id AND kind='sale')`,
    ).bind(`stripe-late-payment:${semanticHash}`, event.providerEventId, event.providerPaymentId, semanticHash, event.orderId).first<{ count: number }>();
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
      INNER JOIN email_outbox ON email_outbox.order_id=orders.id
        AND email_outbox.kind='payment_confirmation' AND email_outbox.status='pending'
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
      INNER JOIN email_outbox ON email_outbox.order_id=orders.id
        AND email_outbox.kind='payment_confirmation'
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
