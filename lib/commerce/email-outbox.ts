import { isCanonicalUtcTimestamp } from "./account-security.ts";
import type { TransactionalEmailDeliveryReadiness } from "./email-outbox-dispatcher.ts";
import type { CommerceD1Database, CommerceD1Result } from "./d1-port.ts";

export const transactionalEmailProviderClosed = Object.freeze({
  available: false,
  reason: "transactional-email-provider-not-configured",
} as const);

export type EmailOutboxKind =
  | "order_confirmation"
  | "payment_confirmation"
  | "payment_failed"
  | "shipment_confirmation"
  | "refund_confirmation"
  | "return_acknowledgement"
  | "withdrawal_acknowledgement";

export type EmailOutboxClaim = Readonly<{
  id: string;
  kind: EmailOutboxKind;
  sourceEventId: string;
  recipientEmail: string;
  orderId: string | null;
  locale: "fr" | "en";
  templateVersion: string;
  payloadJson: string;
  attempts: number;
  maxAttempts: number;
  leaseTokenHash: string;
  providerIdempotencyKey: string;
}>;

export type TransactionalEmailDelivery = Readonly<{
  message: EmailOutboxClaim;
  idempotencyKey: string;
}>;

export type TransactionalEmailDeliveryReceipt = Readonly<{
  idempotencyKey: string;
  providerMessageId: string;
}>;

/**
 * An adapter must submit the supplied key to a provider-side idempotency
 * facility and echo that exact key only after the provider accepts it. The
 * outbox retries with one stable key, but cannot promise exactly-once delivery
 * when an eventual provider does not honour its own idempotency contract.
 */
export interface TransactionalEmailProviderPort {
  deliver(
    delivery: TransactionalEmailDelivery,
  ): Promise<TransactionalEmailDeliveryReceipt>;
}

export class EmailOutboxError extends Error {
  readonly code:
    | "INVALID_INPUT"
    | "DEPENDENCY_UNAVAILABLE"
    | "LEASE_LOST"
    | "PERSISTENCE_FAILURE";

  constructor(
    code:
      | "INVALID_INPUT"
      | "DEPENDENCY_UNAVAILABLE"
      | "LEASE_LOST"
      | "PERSISTENCE_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "EmailOutboxError";
    this.code = code;
  }
}

const safeId = /^[a-z0-9][a-z0-9_.:-]{0,191}$/i;
const hash = /^[0-9a-f]{64}$/;
const mailbox = /^[\x21-\x7e]+@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const retrySeconds = Object.freeze([60, 300, 1_800, 7_200] as const);

function changed(result: CommerceD1Result<object>): number {
  return Number(result.meta?.changes ?? 0);
}

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !safeId.test(value)) {
    throw new EmailOutboxError("INVALID_INPUT", `${field} is invalid.`);
  }
}

function assertTimestamp(value: unknown, field: string): asserts value is string {
  if (!isCanonicalUtcTimestamp(value)) {
    throw new EmailOutboxError("INVALID_INPUT", `${field} is invalid.`);
  }
}

function addSeconds(timestamp: string, seconds: number): string {
  return new Date(Date.parse(timestamp) + seconds * 1_000).toISOString();
}

function resultRows<Row extends object>(result: CommerceD1Result<object>): Row[] {
  return (result.results ?? []) as Row[];
}

function providerIdempotencyKey(input: Readonly<{
  kind: EmailOutboxKind;
  sourceEventId: string;
  orderId?: string;
}>): string {
  if (input.kind === "payment_confirmation") {
    return `payment_confirmation:${input.orderId}`;
  }
  if (input.kind === "order_confirmation") {
    return `order_confirmation:${input.orderId}`;
  }
  return `${input.kind}:${input.sourceEventId}`;
}

type ClaimRow = {
  id: string;
  kind: EmailOutboxKind;
  source_event_id: string;
  recipient_email: string;
  order_id: string | null;
  locale: "fr" | "en";
  template_version: string;
  payload_json: string;
  attempts: number;
  max_attempts: number;
  lease_token_hash: string;
  provider_idempotency_key: string;
};

function freezeClaim(row: ClaimRow): EmailOutboxClaim {
  return Object.freeze({
    id: row.id,
    kind: row.kind,
    sourceEventId: row.source_event_id,
    recipientEmail: row.recipient_email,
    orderId: row.order_id,
    locale: row.locale,
    templateVersion: row.template_version,
    payloadJson: row.payload_json,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    leaseTokenHash: row.lease_token_hash,
    providerIdempotencyKey: row.provider_idempotency_key,
  });
}

export class D1EmailOutbox {
  private readonly database: CommerceD1Database;
  private readonly provider?: TransactionalEmailProviderPort;

  constructor(
    database: CommerceD1Database,
    provider?: TransactionalEmailProviderPort,
  ) {
    this.database = database;
    this.provider = provider;
  }

  deliveryReadiness(): TransactionalEmailDeliveryReadiness {
    return this.provider
      ? Object.freeze({ available: true } as const)
      : transactionalEmailProviderClosed;
  }

  async enqueue(candidate: Readonly<{
    id: string;
    kind: EmailOutboxKind;
    sourceEventId: string;
    recipientEmail: string;
    orderId?: string;
    locale: "fr" | "en";
    templateVersion: string;
    subject: string;
    text: string;
    idempotencyKey: string;
    createdAt: string;
  }>): Promise<{ id: string; created: boolean }> {
    const input = Object.freeze({
      id: candidate.id,
      kind: candidate.kind,
      sourceEventId: candidate.sourceEventId,
      recipientEmail: candidate.recipientEmail,
      orderId: candidate.orderId,
      unexpectedAccessChallengeId: (
        candidate as Readonly<{ accessChallengeId?: unknown }>
      ).accessChallengeId,
      locale: candidate.locale,
      templateVersion: candidate.templateVersion,
      subject: candidate.subject,
      text: candidate.text,
      idempotencyKey: candidate.idempotencyKey,
      createdAt: candidate.createdAt,
    });
    if ((input.kind as string) === "account_access") {
      throw new EmailOutboxError(
        "INVALID_INPUT",
        "Account access delivery is disabled for the durable outbox.",
      );
    }
    assertId(input.id, "Outbox id");
    assertId(input.sourceEventId, "Source event id");
    assertId(input.templateVersion, "Template version");
    assertId(input.idempotencyKey, "Idempotency key");
    assertTimestamp(input.createdAt, "Created at");
    if (!mailbox.test(input.recipientEmail) || input.recipientEmail.length > 254) {
      throw new EmailOutboxError("INVALID_INPUT", "Recipient is invalid.");
    }
    if (!["fr", "en"].includes(input.locale)) {
      throw new EmailOutboxError("INVALID_INPUT", "Locale is invalid.");
    }
    if (
      typeof input.subject !== "string" || input.subject.length < 1 || input.subject.length > 200 ||
      typeof input.text !== "string" || input.text.length < 1 || input.text.length > 20_000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.subject + input.text)
    ) {
      throw new EmailOutboxError("INVALID_INPUT", "Email copy is invalid.");
    }
    const orderId = input.orderId;
    assertId(orderId, "Order id");
    if (input.unexpectedAccessChallengeId !== undefined) {
      throw new EmailOutboxError("INVALID_INPUT", "Unexpected access challenge.");
    }
    const intents: Record<EmailOutboxKind, string> = {
      order_confirmation: "payment_succeeded",
      payment_confirmation: "payment_succeeded",
      payment_failed: "payment_failed",
      shipment_confirmation: "shipment_created",
      refund_confirmation: "refund_succeeded",
      return_acknowledgement: "return_received",
      withdrawal_acknowledgement: "withdrawal_received",
    };
    const payloadJson = JSON.stringify({ subject: input.subject, text: input.text });
    const deliveryIdempotencyKey = providerIdempotencyKey({
      kind: input.kind,
      sourceEventId: input.sourceEventId,
      orderId,
    });
    const maxAttempts = 5;
    const insert = await this.database
      .prepare(
        `INSERT OR IGNORE INTO email_outbox (
          id, kind, transaction_intent, source_event_id, recipient_email,
          order_id, access_challenge_id, locale, template_version, payload_json,
          status, attempts, max_attempts, next_attempt_at, idempotency_key,
          provider_idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.kind,
        intents[input.kind],
        input.sourceEventId,
        input.recipientEmail,
        orderId,
        null,
        input.locale,
        input.templateVersion,
        payloadJson,
        maxAttempts,
        input.createdAt,
        input.idempotencyKey,
        deliveryIdempotencyKey,
        input.createdAt,
        input.createdAt,
      )
      .run();
    let selection: Readonly<{ sql: string; value: string }>;
    if (input.kind === "payment_confirmation" || input.kind === "order_confirmation") {
      assertId(orderId, "Order id");
      selection = Object.freeze({
        sql: `SELECT id, kind, source_event_id, recipient_email, order_id,
          access_challenge_id, locale, template_version, payload_json,
          idempotency_key, provider_idempotency_key FROM email_outbox
          WHERE kind = '${input.kind}' AND order_id = ?`,
        value: orderId,
      });
    } else {
      selection = Object.freeze({
        sql: `SELECT id, kind, source_event_id, recipient_email, order_id,
          access_challenge_id, locale, template_version, payload_json,
          idempotency_key, provider_idempotency_key FROM email_outbox
          WHERE idempotency_key = ?`,
        value: input.idempotencyKey,
      });
    }
    const persisted = await this.database
      .prepare(selection.sql)
      .bind(selection.value)
      .first<{
        id: string;
        kind: string;
        source_event_id: string;
        recipient_email: string | null;
        order_id: string | null;
        access_challenge_id: string | null;
        locale: string;
        template_version: string;
        payload_json: string | null;
        idempotency_key: string;
        provider_idempotency_key: string;
      }>();
    const hasBusinessDedupe = input.kind === "payment_confirmation";
    if (
      !persisted || persisted.kind !== input.kind ||
      persisted.recipient_email !== input.recipientEmail ||
      persisted.order_id !== orderId ||
      persisted.access_challenge_id !== null ||
      persisted.locale !== input.locale ||
      persisted.template_version !== input.templateVersion ||
      persisted.payload_json !== payloadJson ||
      persisted.provider_idempotency_key !== deliveryIdempotencyKey ||
      (!hasBusinessDedupe && (
        persisted.id !== input.id ||
        persisted.source_event_id !== input.sourceEventId ||
        persisted.idempotency_key !== input.idempotencyKey
      ))
    ) {
      throw new EmailOutboxError(
        "PERSISTENCE_FAILURE",
        "A durable email key was already used for another intent or payload.",
      );
    }
    return Object.freeze({ id: persisted.id, created: changed(insert) === 1 });
  }

  async claimNext(input: Readonly<{
    leaseTokenHash: string;
    now: string;
    leaseExpiresAt: string;
  }>): Promise<EmailOutboxClaim | null> {
    if (!hash.test(input.leaseTokenHash)) {
      throw new EmailOutboxError("INVALID_INPUT", "Lease token hash is invalid.");
    }
    assertTimestamp(input.now, "Now");
    assertTimestamp(input.leaseExpiresAt, "Lease expiry");
    if (input.leaseExpiresAt <= input.now) {
      throw new EmailOutboxError("INVALID_INPUT", "Lease must expire after now.");
    }

    const update = this.database
      .prepare(
        `UPDATE email_outbox
        SET status = 'sending', attempts = attempts + 1, next_attempt_at = NULL,
          lease_token_hash = ?, leased_at = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = (
          SELECT id FROM email_outbox
          WHERE status = 'pending' AND kind <> 'account_access'
            AND next_attempt_at <= ?
          ORDER BY next_attempt_at, created_at, id LIMIT 1
        ) AND status = 'pending' AND kind <> 'account_access'
          AND next_attempt_at <= ?`,
      )
      .bind(
        input.leaseTokenHash,
        input.now,
        input.leaseExpiresAt,
        input.now,
        input.now,
        input.now,
      );
    const select = this.database
      .prepare(
        `SELECT id, kind, source_event_id, recipient_email, order_id,
          access_challenge_id, locale, template_version, payload_json,
          attempts, max_attempts, lease_token_hash, provider_idempotency_key
        FROM email_outbox WHERE lease_token_hash = ? AND status = 'sending'
          AND kind <> 'account_access'`,
      )
      .bind(input.leaseTokenHash);
    const results = await this.database.batch([update, select]);
    if (changed(results[0]) !== 1) return null;
    const row = resultRows<ClaimRow>(results[1])[0];
    if (!row) {
      throw new EmailOutboxError("PERSISTENCE_FAILURE", "Claim was not readable.");
    }
    return freezeClaim(row);
  }

  /**
   * Claims one paid-order confirmation immediately after a verified payment
   * signal. This intentionally bypasses only the scheduled backoff clock: the
   * same durable lease, attempt ceiling and provider idempotency key remain in
   * force. A one-minute cool-down prevents repeated Stripe deliveries from
   * consuming the retry budget during a provider outage.
   */
  async claimNextForVerifiedPaidOrder(input: Readonly<{
    orderId: string;
    leaseTokenHash: string;
    now: string;
    leaseExpiresAt: string;
  }>): Promise<EmailOutboxClaim | null> {
    assertId(input.orderId, "Order id");
    if (!hash.test(input.leaseTokenHash)) {
      throw new EmailOutboxError("INVALID_INPUT", "Lease token hash is invalid.");
    }
    assertTimestamp(input.now, "Now");
    assertTimestamp(input.leaseExpiresAt, "Lease expiry");
    if (input.leaseExpiresAt <= input.now) {
      throw new EmailOutboxError("INVALID_INPUT", "Lease must expire after now.");
    }
    const retryCutoff = addSeconds(input.now, -60);
    const update = this.database
      .prepare(
        `UPDATE email_outbox
        SET status = 'sending', attempts = attempts + 1, next_attempt_at = NULL,
          lease_token_hash = ?, leased_at = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = (
          SELECT message.id FROM email_outbox AS message
          INNER JOIN orders AS customer_order ON customer_order.id = message.order_id
          WHERE message.order_id = ? AND customer_order.status = 'paid'
            AND message.status = 'pending' AND message.attempts < message.max_attempts
            AND message.kind IN ('order_confirmation', 'payment_confirmation')
            AND (message.last_error_code IS NULL OR message.updated_at <= ?)
          ORDER BY CASE message.kind WHEN 'order_confirmation' THEN 0 ELSE 1 END,
            message.created_at, message.id LIMIT 1
        ) AND status = 'pending' AND attempts < max_attempts
          AND kind IN ('order_confirmation', 'payment_confirmation')`,
      )
      .bind(
        input.leaseTokenHash,
        input.now,
        input.leaseExpiresAt,
        input.now,
        input.orderId,
        retryCutoff,
      );
    const select = this.database
      .prepare(
        `SELECT id, kind, source_event_id, recipient_email, order_id,
          access_challenge_id, locale, template_version, payload_json,
          attempts, max_attempts, lease_token_hash, provider_idempotency_key
        FROM email_outbox WHERE lease_token_hash = ? AND status = 'sending'
          AND order_id = ? AND kind IN ('order_confirmation', 'payment_confirmation')`,
      )
      .bind(input.leaseTokenHash, input.orderId);
    const results = await this.database.batch([update, select]);
    if (changed(results[0]) !== 1) return null;
    const row = resultRows<ClaimRow>(results[1])[0];
    if (!row) {
      throw new EmailOutboxError("PERSISTENCE_FAILURE", "Paid-order claim was not readable.");
    }
    return freezeClaim(row);
  }

  async markSent(
    claim: EmailOutboxClaim,
    now: string,
    providerMessageId: string,
  ): Promise<void> {
    this.rejectHistoricalAccountAccessClaim(claim);
    assertTimestamp(now, "Now");
    assertId(providerMessageId, "Provider message id");
    const result = await this.database
      .prepare(
        `UPDATE email_outbox SET status = 'sent', lease_token_hash = NULL,
          leased_at = NULL, lease_expires_at = NULL, sent_at = ?, terminal_at = ?,
          last_error_code = NULL, provider_message_id = ?, updated_at = ?
        WHERE id = ? AND status = 'sending' AND kind <> 'account_access'
          AND lease_token_hash = ?`,
      )
      .bind(now, now, providerMessageId, now, claim.id, claim.leaseTokenHash)
      .run();
    if (changed(result) !== 1) {
      throw new EmailOutboxError("LEASE_LOST", "Email lease is no longer current.");
    }
  }

  async markDeliveryFailure(
    claim: EmailOutboxClaim,
    now: string,
    ambiguous = false,
  ): Promise<"retry" | "failed"> {
    this.rejectHistoricalAccountAccessClaim(claim);
    assertTimestamp(now, "Now");
    const terminal = claim.attempts >= claim.maxAttempts;
    const errorCode = ambiguous ? "delivery_ambiguous" : terminal
      ? "attempts_exhausted"
      : "provider_rejected";
    const nextAttemptAt = terminal
      ? null
      : addSeconds(
          now,
          retrySeconds[Math.min(claim.attempts - 1, retrySeconds.length - 1)],
        );
    const result = await this.database
      .prepare(
        `UPDATE email_outbox SET status = ?, next_attempt_at = ?,
          lease_token_hash = NULL, leased_at = NULL, lease_expires_at = NULL,
          last_error_code = ?, terminal_at = ?, updated_at = ?
        WHERE id = ? AND status = 'sending' AND kind <> 'account_access'
          AND lease_token_hash = ?`,
      )
      .bind(
        terminal ? "failed" : "pending",
        nextAttemptAt,
        errorCode,
        terminal ? now : null,
        now,
        claim.id,
        claim.leaseTokenHash,
      )
      .run();
    if (changed(result) !== 1) {
      throw new EmailOutboxError("LEASE_LOST", "Email lease is no longer current.");
    }
    return terminal ? "failed" : "retry";
  }

  async recoverStaleLease(id: string, now: string): Promise<"retry" | "failed" | null> {
    assertId(id, "Outbox id");
    assertTimestamp(now, "Now");
    const row = await this.database
      .prepare(
        `SELECT id, kind, attempts, max_attempts, lease_token_hash
        FROM email_outbox WHERE id = ? AND status = 'sending'
          AND kind <> 'account_access' AND lease_expires_at <= ?`,
      )
      .bind(id, now)
      .first<{
        id: string;
        kind: EmailOutboxKind;
        attempts: number;
        max_attempts: number;
        lease_token_hash: string;
      }>();
    if (!row) return null;
    const terminal = row.attempts >= row.max_attempts;
    const nextAttemptAt = terminal
      ? null
      : addSeconds(
          now,
          retrySeconds[Math.min(row.attempts - 1, retrySeconds.length - 1)],
        );
    const result = await this.database
      .prepare(
        `UPDATE email_outbox SET status = ?, next_attempt_at = ?,
          lease_token_hash = NULL, leased_at = NULL, lease_expires_at = NULL,
          last_error_code = 'delivery_ambiguous', terminal_at = ?, updated_at = ?
        WHERE id = ? AND status = 'sending' AND lease_token_hash = ?
          AND kind <> 'account_access' AND lease_expires_at <= ?`,
      )
      .bind(
        terminal ? "failed" : "pending",
        nextAttemptAt,
        terminal ? now : null,
        now,
        id,
        row.lease_token_hash,
        now,
      )
      .run();
    if (changed(result) !== 1) return null;
    return terminal ? "failed" : "retry";
  }

  async deliverClaim(claim: EmailOutboxClaim, now: string): Promise<"sent" | "retry" | "failed"> {
    this.rejectHistoricalAccountAccessClaim(claim);
    assertTimestamp(now, "Now");
    const verifiedClaim = await this.readCurrentDeliverableClaim(claim, now);
    if (!this.provider) {
      throw new EmailOutboxError(
        "DEPENDENCY_UNAVAILABLE",
        transactionalEmailProviderClosed.reason,
      );
    }
    let receipt: TransactionalEmailDeliveryReceipt;
    try {
      receipt = await this.provider.deliver(Object.freeze({
        message: verifiedClaim,
        idempotencyKey: verifiedClaim.providerIdempotencyKey,
      }));
    } catch {
      return this.markDeliveryFailure(verifiedClaim, now, true);
    }
    if (!receipt || receipt.idempotencyKey !== verifiedClaim.providerIdempotencyKey ||
      typeof receipt.providerMessageId !== "string" || !safeId.test(receipt.providerMessageId)) {
      return this.markDeliveryFailure(verifiedClaim, now, true);
    }
    await this.markSent(verifiedClaim, now, receipt.providerMessageId);
    return "sent";
  }

  private async readCurrentDeliverableClaim(
    claimed: EmailOutboxClaim,
    now: string,
  ): Promise<EmailOutboxClaim> {
    const row = await this.database
      .prepare(
        `SELECT id, kind, source_event_id, recipient_email, order_id,
          locale, template_version, payload_json, attempts, max_attempts,
          lease_token_hash, provider_idempotency_key
        FROM email_outbox
        WHERE id = ? AND status = 'sending' AND kind <> 'account_access'
          AND lease_token_hash = ? AND lease_expires_at > ?`,
      )
      .bind(claimed.id, claimed.leaseTokenHash, now)
      .first<ClaimRow>();
    if (!row) {
      throw new EmailOutboxError("LEASE_LOST", "Email lease is no longer current.");
    }
    const current = freezeClaim(row);
    for (const key of Object.keys(current) as (keyof EmailOutboxClaim)[]) {
      if (current[key] !== claimed[key]) {
        throw new EmailOutboxError(
          "LEASE_LOST",
          "Email claim does not match the durable lease.",
        );
      }
    }
    return current;
  }

  private rejectHistoricalAccountAccessClaim(claim: EmailOutboxClaim): void {
    if ((claim as Readonly<{ kind?: unknown }>).kind === "account_access") {
      throw new EmailOutboxError(
        "INVALID_INPUT",
        "Historical account access records cannot be delivered by the durable outbox.",
      );
    }
  }

  async purgeEligibleTerminalContent(now: string): Promise<number> {
    assertTimestamp(now, "Now");
    const rule = await this.database
      .prepare(
        `SELECT retention_seconds FROM data_retention_rules
        WHERE record_class = 'email_content' AND active = 1
          AND effective_at <= ? LIMIT 1`,
      )
      .bind(now)
      .first<{ retention_seconds: number }>();
    if (!rule || !Number.isSafeInteger(rule.retention_seconds) || rule.retention_seconds < 0) {
      return 0;
    }
    const cutoff = addSeconds(now, -rule.retention_seconds);
    const rows = await this.database
      .prepare(
        `SELECT id FROM email_outbox
        WHERE status IN ('sent', 'failed', 'cancelled') AND purged_at IS NULL
          AND terminal_at <= ? ORDER BY terminal_at, id`,
      )
      .bind(cutoff)
      .all<{ id: string }>();
    let purged = 0;
    for (const row of rows.results) {
      const result = await this.database
        .prepare(
          `UPDATE email_outbox SET recipient_email = NULL, payload_json = NULL,
            purged_at = ?, updated_at = ?
          WHERE id = ? AND status IN ('sent', 'failed', 'cancelled')
            AND purged_at IS NULL AND terminal_at <= ?`,
        )
        .bind(now, now, row.id, cutoff)
        .run();
      purged += changed(result);
    }
    return purged;
  }
}
