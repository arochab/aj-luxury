import type { CommerceD1Database } from "./d1-port.ts";
import {
  PaymentProviderError,
  type RefundPaymentProviderPort,
  type RefundReceipt,
} from "./payment-provider.ts";
import {
  assertFulfillmentTimestamp,
  sha256Hex,
} from "./fulfillment-domain.ts";

const DEFAULT_LIMIT = 3;
const DEFAULT_LEASE_SECONDS = 120;

type LatePaymentRefundRow = Readonly<{
  id: string;
  order_id: string;
  provider_event_id: string;
  provider_checkout_session_id: string;
  provider_payment_id: string;
  amount_cents: number;
  currency: "EUR";
  status: "pending" | "claimed" | "succeeded" | "rejected" | "attention_required";
  idempotency_key: string;
  lease_token_hash: string | null;
  lease_expires_at: string | null;
  provider_refund_id: string | null;
  attempts: number;
  max_attempts: number;
}>;

export type LatePaymentRefundDispatchReport = Readonly<{
  claimed: number;
  succeeded: number;
  rejected: number;
  unknown: number;
  attentionRequired: number;
}>;

export class LatePaymentRefundDispatchError extends Error {
  readonly code: "INVALID_INPUT" | "PERSISTENCE_FAILURE";

  constructor(
    code: LatePaymentRefundDispatchError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LatePaymentRefundDispatchError";
    this.code = code;
  }
}

function changes(result: Readonly<{ meta?: Readonly<{ changes?: number }> }>): number {
  return Number(result.meta?.changes ?? 0);
}

function integer(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function receiptMatches(row: LatePaymentRefundRow, receipt: RefundReceipt): boolean {
  return receipt.provider === "stripe" &&
    receipt.providerPaymentId === row.provider_payment_id &&
    receipt.amountCents === row.amount_cents &&
    receipt.currency === row.currency &&
    (row.provider_refund_id === null || row.provider_refund_id === receipt.providerRefundId);
}

async function receiptFingerprint(receipt: RefundReceipt): Promise<string> {
  return sha256Hex([
    receipt.provider,
    receipt.providerRefundId,
    receipt.providerPaymentId,
    String(receipt.amountCents),
    receipt.currency,
    receipt.state,
  ].join("\0"));
}

/**
 * Durable Stripe-refund worker for payments that arrived after stock safety
 * expired. Unknown provider outcomes deliberately retain their lease: a later
 * worker replays the exact same Stripe Idempotency-Key after expiry.
 */
export class D1LatePaymentRefundDispatcher {
  readonly #database: CommerceD1Database;
  readonly #provider: RefundPaymentProviderPort;
  readonly #leaseToken: () => string;

  constructor(
    database: CommerceD1Database,
    provider: RefundPaymentProviderPort,
    leaseToken: () => string = () => crypto.randomUUID(),
  ) {
    this.#database = database;
    this.#provider = provider;
    this.#leaseToken = leaseToken;
  }

  async dispatch(input: Readonly<{
    now: string;
    limit?: number;
    leaseSeconds?: number;
  }>): Promise<LatePaymentRefundDispatchReport> {
    assertFulfillmentTimestamp(input.now, "now");
    const limit = input.limit ?? DEFAULT_LIMIT;
    const leaseSeconds = input.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
    if (!integer(limit, 1, 10) || !integer(leaseSeconds, 30, 900)) {
      throw new LatePaymentRefundDispatchError("INVALID_INPUT", "Refund dispatcher limits are invalid.");
    }

    const report = {
      claimed: 0,
      succeeded: 0,
      rejected: 0,
      unknown: 0,
      attentionRequired: 0,
    };
    for (let index = 0; index < limit; index += 1) {
      const claim = await this.#claim(input.now, leaseSeconds);
      if (!claim) break;
      report.claimed += 1;
      const outcome = await this.#deliver(claim, input.now);
      report[outcome] += 1;
    }
    return Object.freeze(report);
  }

  async #claim(now: string, leaseSeconds: number): Promise<LatePaymentRefundRow | null> {
    const candidate = await this.#database.prepare(
      `SELECT id FROM late_payment_refund_intents
      WHERE attempts < max_attempts AND (
        status='pending' OR (status='claimed' AND lease_expires_at<=?)
      ) ORDER BY created_at, id LIMIT 1`,
    ).bind(now).first<{ id: string }>();
    if (!candidate) return null;
    const token = this.#leaseToken();
    if (typeof token !== "string" || token.length < 8 || token.length > 512) {
      throw new LatePaymentRefundDispatchError("PERSISTENCE_FAILURE", "Refund lease token is invalid.");
    }
    const tokenHash = await sha256Hex(token);
    const leaseExpiresAt = new Date(Date.parse(now) + leaseSeconds * 1_000).toISOString();
    let result;
    try {
      result = await this.#database.prepare(
        `UPDATE late_payment_refund_intents SET status='claimed',
          lease_token_hash=?, leased_at=?, lease_expires_at=?,
          attempts=attempts+1, last_error_code=NULL, updated_at=?
        WHERE id=? AND attempts<max_attempts AND (
          status='pending' OR (status='claimed' AND lease_expires_at<=?)
        )`,
      ).bind(tokenHash, now, leaseExpiresAt, now, candidate.id, now).run();
    } catch (cause) {
      throw new LatePaymentRefundDispatchError(
        "PERSISTENCE_FAILURE",
        "Late-payment refund claim could not be persisted.",
        { cause },
      );
    }
    if (changes(result) !== 1) return null;
    const claim = await this.#database.prepare(
      `SELECT id, order_id, provider_event_id, provider_checkout_session_id,
        provider_payment_id, amount_cents, currency, status, idempotency_key,
        lease_token_hash, lease_expires_at, provider_refund_id, attempts, max_attempts
      FROM late_payment_refund_intents WHERE id=? AND status='claimed'
        AND lease_token_hash=? AND lease_expires_at>?`,
    ).bind(candidate.id, tokenHash, now).first<LatePaymentRefundRow>();
    if (!claim || !claim.lease_token_hash || !claim.lease_expires_at ||
      claim.currency !== "EUR" || claim.amount_cents < 1 ||
      claim.attempts < 1 || claim.attempts > claim.max_attempts) {
      throw new LatePaymentRefundDispatchError(
        "PERSISTENCE_FAILURE",
        "Late-payment refund lease could not be verified.",
      );
    }
    return claim;
  }

  async #deliver(
    claim: LatePaymentRefundRow,
    now: string,
  ): Promise<"succeeded" | "rejected" | "unknown" | "attentionRequired"> {
    let receipt: RefundReceipt;
    try {
      receipt = await this.#provider.createRefund({
        idempotencyKey: claim.idempotency_key,
        orderId: claim.order_id,
        providerPaymentId: claim.provider_payment_id,
        amountCents: claim.amount_cents,
        currency: claim.currency,
        reason: "requested_by_customer",
      });
    } catch (cause) {
      if (cause instanceof PaymentProviderError && cause.code === "REJECTED") {
        await this.#markRejected(claim, now, null);
        return "rejected";
      }
      return this.#markUnknown(claim, now, null);
    }

    if (!receiptMatches(claim, receipt)) {
      return this.#markUnknown(claim, now, null);
    }
    if (receipt.state === "succeeded") {
      await this.#markSucceeded(claim, receipt, now);
      return "succeeded";
    }
    if (receipt.state === "failed" || receipt.state === "canceled") {
      await this.#markRejected(claim, now, receipt.providerRefundId);
      return "rejected";
    }
    return this.#markUnknown(claim, now, receipt.providerRefundId);
  }

  async #markUnknown(
    claim: LatePaymentRefundRow,
    now: string,
    providerRefundId: string | null,
  ): Promise<"unknown" | "attentionRequired"> {
    const terminal = claim.attempts >= claim.max_attempts;
    const result = await this.#database.prepare(
      `UPDATE late_payment_refund_intents SET
        status=?, lease_token_hash=?, leased_at=?, lease_expires_at=?,
        provider_refund_id=COALESCE(provider_refund_id, ?),
        last_error_code=?, terminal_at=?, updated_at=?
      WHERE id=? AND status='claimed' AND lease_token_hash=?
        AND (? IS NULL OR provider_refund_id IS NULL OR provider_refund_id=?)`,
    ).bind(
      terminal ? "attention_required" : "claimed",
      terminal ? null : claim.lease_token_hash,
      terminal ? null : now,
      terminal ? null : claim.lease_expires_at,
      providerRefundId,
      terminal ? "attempts_exhausted" : "outcome_unknown",
      terminal ? now : null,
      now,
      claim.id,
      claim.lease_token_hash,
      providerRefundId,
      providerRefundId,
    ).run();
    if (changes(result) !== 1) {
      throw new LatePaymentRefundDispatchError(
        "PERSISTENCE_FAILURE",
        "Unknown Stripe refund outcome could not be retained safely.",
      );
    }
    return terminal ? "attentionRequired" : "unknown";
  }

  async #markRejected(
    claim: LatePaymentRefundRow,
    now: string,
    providerRefundId: string | null,
  ): Promise<void> {
    const result = await this.#database.prepare(
      `UPDATE late_payment_refund_intents SET status='rejected',
        lease_token_hash=NULL, leased_at=NULL, lease_expires_at=NULL,
        provider_refund_id=COALESCE(provider_refund_id, ?),
        last_error_code='provider_rejected', terminal_at=?, updated_at=?
      WHERE id=? AND status='claimed' AND lease_token_hash=?
        AND (? IS NULL OR provider_refund_id IS NULL OR provider_refund_id=?)`,
    ).bind(
      providerRefundId,
      now,
      now,
      claim.id,
      claim.lease_token_hash,
      providerRefundId,
      providerRefundId,
    ).run();
    if (changes(result) !== 1) {
      throw new LatePaymentRefundDispatchError(
        "PERSISTENCE_FAILURE",
        "Rejected Stripe refund outcome could not be persisted.",
      );
    }
  }

  async #markSucceeded(
    claim: LatePaymentRefundRow,
    receipt: RefundReceipt,
    now: string,
  ): Promise<void> {
    const fingerprint = await receiptFingerprint(receipt);
    const transitionKey = `late-refund:${claim.id}`;
    const auditId = `audit_late_refund_${await sha256Hex(claim.id)}`;
    try {
      await this.#database.batch([
        this.#database.prepare(
          `UPDATE stock_reservations SET status='released',
            last_transition_key=?, converted_order_id=NULL, updated_at=?
          WHERE cart_id=(SELECT cart_id FROM orders WHERE id=?)
            AND status='active'`,
        ).bind(transitionKey, now, claim.order_id),
        this.#database.prepare(
          `INSERT OR IGNORE INTO inventory_movements (
            id, variant_id, kind, quantity, reference_type, reference_id,
            actor_type, actor_id, idempotency_key, created_at
          ) SELECT 'movement_' || ? || '_' || id, variant_id, 'release', quantity,
            'reservation', id, 'system', NULL, ? || ':' || id, ?
          FROM stock_reservations
          WHERE cart_id=(SELECT cart_id FROM orders WHERE id=?)
            AND status='released' AND last_transition_key=?`,
        ).bind(transitionKey, transitionKey, now, claim.order_id, transitionKey),
        this.#database.prepare(
          `UPDATE orders SET status='cancelled', updated_at=?
          WHERE id=? AND status='pending_payment' AND paid_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM payments WHERE order_id=orders.id
                AND status IN ('succeeded','refunded')
            ) AND NOT EXISTS (
              SELECT 1 FROM stock_reservations WHERE cart_id=orders.cart_id
                AND status IN ('active','converted')
            )`,
        ).bind(now, claim.order_id),
        this.#database.prepare(
          `INSERT OR IGNORE INTO audit_log (
            id, actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key, metadata_json, created_at
          ) VALUES (?, 'system', NULL, 'late_payment_refund_succeeded',
            'late_payment_refund_intent', ?, ?, ?, ?)`,
        ).bind(
          auditId,
          claim.id,
          `late-payment-refund-succeeded:${claim.id}`,
          JSON.stringify({
            providerEventId: claim.provider_event_id,
            providerPaymentId: claim.provider_payment_id,
            providerRefundId: receipt.providerRefundId,
          }),
          now,
        ),
        this.#database.prepare(
          `UPDATE late_payment_refund_intents SET status='succeeded',
            lease_token_hash=NULL, leased_at=NULL, lease_expires_at=NULL,
            provider_refund_id=?, provider_receipt_fingerprint=?,
            last_error_code=NULL, succeeded_at=?, terminal_at=?, updated_at=?
          WHERE id=? AND status='claimed' AND lease_token_hash=?
            AND (provider_refund_id IS NULL OR provider_refund_id=?)`,
        ).bind(
          receipt.providerRefundId,
          fingerprint,
          now,
          now,
          now,
          claim.id,
          claim.lease_token_hash,
          receipt.providerRefundId,
        ),
      ]);
    } catch (cause) {
      throw new LatePaymentRefundDispatchError(
        "PERSISTENCE_FAILURE",
        "Confirmed Stripe refund could not be committed atomically.",
        { cause },
      );
    }
    const complete = await this.#database.prepare(
      `SELECT COUNT(*) AS count FROM late_payment_refund_intents AS intent
      INNER JOIN orders AS customer_order ON customer_order.id=intent.order_id
      INNER JOIN audit_log AS evidence
        ON evidence.entity_type='late_payment_refund_intent'
        AND evidence.entity_id=intent.id
        AND evidence.action='late_payment_refund_succeeded'
      WHERE intent.id=? AND intent.status='succeeded'
        AND intent.provider_payment_id=? AND intent.provider_refund_id=?
        AND intent.amount_cents=? AND intent.currency='EUR'
        AND customer_order.status='cancelled' AND customer_order.paid_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM inventory_movements
          WHERE reference_type='order' AND reference_id=customer_order.id AND kind='sale')`,
    ).bind(
      claim.id,
      claim.provider_payment_id,
      receipt.providerRefundId,
      claim.amount_cents,
    ).first<{ count: number }>();
    if (Number(complete?.count ?? 0) !== 1) {
      throw new LatePaymentRefundDispatchError(
        "PERSISTENCE_FAILURE",
        "Confirmed Stripe refund commit is incomplete.",
      );
    }
  }
}
