import {
  hashOneTimeAccessToken,
  isCanonicalUtcTimestamp,
} from "./account-security.ts";
import type { CommerceD1Database, CommerceD1Result } from "./d1-port.ts";

export const transactionalEmailProviderClosed = Object.freeze({
  available: false,
  reason: "transactional-email-provider-not-configured",
} as const);

export type EmailOutboxKind =
  | "payment_confirmation"
  | "payment_failed"
  | "shipment_confirmation"
  | "refund_confirmation"
  | "withdrawal_acknowledgement"
  | "account_access";

export type EmailOutboxClaim = Readonly<{
  id: string;
  kind: EmailOutboxKind;
  sourceEventId: string;
  recipientEmail: string;
  orderId: string | null;
  accessChallengeId: string | null;
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
const opaqueTokenRun = /[A-Za-z0-9_-]{43,}/g;
const opaqueTokenLength = 43;
const maxOpaqueTokenRunLength = 256;
const maxOpaqueTokenCandidates = 1_024;

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
  accessChallengeId?: string;
}>): string {
  if (input.kind === "account_access") {
    return `account_access:${input.accessChallengeId}`;
  }
  if (input.kind === "payment_confirmation") {
    return `payment_confirmation:${input.orderId}`;
  }
  return `${input.kind}:${input.sourceEventId}`;
}

async function assertAccountAccessFieldsContainNoRawToken(
  database: CommerceD1Database,
  accessChallengeId: string,
  durableFields: readonly string[],
): Promise<void> {
  const challenge = await database
    .prepare("SELECT token_hash FROM access_challenges WHERE id = ?")
    .bind(accessChallengeId)
    .first<{ token_hash: string }>();
  if (!challenge || !hash.test(challenge.token_hash)) {
    throw new EmailOutboxError("INVALID_INPUT", "Access challenge is invalid.");
  }

  let candidates = 0;
  for (const field of durableFields) {
    for (const run of field.match(opaqueTokenRun) ?? []) {
      if (run.length > maxOpaqueTokenRunLength) {
        throw new EmailOutboxError(
          "INVALID_INPUT",
          "Account access content contains forbidden token-shaped data.",
        );
      }
      for (let offset = 0; offset <= run.length - opaqueTokenLength; offset += 1) {
        candidates += 1;
        if (candidates > maxOpaqueTokenCandidates) {
          throw new EmailOutboxError(
            "INVALID_INPUT",
            "Account access content contains too much token-shaped data.",
          );
        }
        const candidate = run.slice(offset, offset + opaqueTokenLength);
        if ((await hashOneTimeAccessToken(candidate)) === challenge.token_hash) {
          throw new EmailOutboxError(
            "INVALID_INPUT",
            "Account access tokens must never enter durable email fields.",
          );
        }
      }
    }
  }
}

type ClaimRow = {
  id: string;
  kind: EmailOutboxKind;
  source_event_id: string;
  recipient_email: string;
  order_id: string | null;
  access_challenge_id: string | null;
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
    accessChallengeId: row.access_challenge_id,
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

  async enqueue(candidate: Readonly<{
    id: string;
    kind: EmailOutboxKind;
    sourceEventId: string;
    recipientEmail: string;
    orderId?: string;
    accessChallengeId?: string;
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
      accessChallengeId: candidate.accessChallengeId,
      locale: candidate.locale,
      templateVersion: candidate.templateVersion,
      subject: candidate.subject,
      text: candidate.text,
      idempotencyKey: candidate.idempotencyKey,
      createdAt: candidate.createdAt,
    });
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
    let orderId: string | undefined;
    let accessChallengeId: string | undefined;
    if (input.kind === "account_access") {
      const candidate = input.accessChallengeId;
      assertId(candidate, "Access challenge id");
      accessChallengeId = candidate;
      if (input.orderId !== undefined) {
        throw new EmailOutboxError(
          "INVALID_INPUT",
          "Account access emails cannot reference an order directly.",
        );
      }
    } else {
      const candidate = input.orderId;
      assertId(candidate, "Order id");
      orderId = candidate;
      if (input.accessChallengeId !== undefined) {
        throw new EmailOutboxError("INVALID_INPUT", "Unexpected access challenge.");
      }
    }
    const intents: Record<EmailOutboxKind, string> = {
      payment_confirmation: "payment_succeeded",
      payment_failed: "payment_failed",
      shipment_confirmation: "shipment_created",
      refund_confirmation: "refund_succeeded",
      withdrawal_acknowledgement: "withdrawal_received",
      account_access: "account_access_challenge",
    };
    const payloadJson = JSON.stringify({ subject: input.subject, text: input.text });
    const deliveryIdempotencyKey = providerIdempotencyKey({
      kind: input.kind,
      sourceEventId: input.sourceEventId,
      orderId,
      accessChallengeId,
    });
    if (accessChallengeId !== undefined) {
      await assertAccountAccessFieldsContainNoRawToken(
        this.database,
        accessChallengeId,
        Object.freeze([
          input.id,
          input.sourceEventId,
          input.recipientEmail,
          accessChallengeId,
          input.locale,
          input.templateVersion,
          input.subject,
          input.text,
          input.idempotencyKey,
          input.createdAt,
          payloadJson,
          deliveryIdempotencyKey,
        ]),
      );
    }
    const maxAttempts = input.kind === "account_access" ? 1 : 5;
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
        orderId ?? null,
        accessChallengeId ?? null,
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
    if (accessChallengeId !== undefined) {
      selection = Object.freeze({
        sql: `SELECT id, kind, source_event_id, recipient_email, order_id,
          access_challenge_id, locale, template_version, payload_json,
          idempotency_key, provider_idempotency_key FROM email_outbox
          WHERE kind = 'account_access' AND access_challenge_id = ?`,
        value: accessChallengeId,
      });
    } else if (input.kind === "payment_confirmation") {
      assertId(orderId, "Order id");
      selection = Object.freeze({
        sql: `SELECT id, kind, source_event_id, recipient_email, order_id,
          access_challenge_id, locale, template_version, payload_json,
          idempotency_key, provider_idempotency_key FROM email_outbox
          WHERE kind = 'payment_confirmation' AND order_id = ?`,
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
    const hasBusinessDedupe =
      input.kind === "account_access" || input.kind === "payment_confirmation";
    if (
      !persisted || persisted.kind !== input.kind ||
      persisted.recipient_email !== input.recipientEmail ||
      persisted.order_id !== (orderId ?? null) ||
      persisted.access_challenge_id !== (accessChallengeId ?? null) ||
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
          WHERE status = 'pending' AND next_attempt_at <= ?
          ORDER BY next_attempt_at, created_at, id LIMIT 1
        ) AND status = 'pending' AND next_attempt_at <= ?`,
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
        FROM email_outbox WHERE lease_token_hash = ? AND status = 'sending'`,
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

  async markSent(claim: EmailOutboxClaim, now: string): Promise<void> {
    assertTimestamp(now, "Now");
    const result = await this.database
      .prepare(
        `UPDATE email_outbox SET status = 'sent', lease_token_hash = NULL,
          leased_at = NULL, lease_expires_at = NULL, sent_at = ?, terminal_at = ?,
          last_error_code = NULL, updated_at = ?
        WHERE id = ? AND status = 'sending' AND lease_token_hash = ?`,
      )
      .bind(now, now, now, claim.id, claim.leaseTokenHash)
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
    assertTimestamp(now, "Now");
    const terminal =
      claim.kind === "account_access" || claim.attempts >= claim.maxAttempts;
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
        WHERE id = ? AND status = 'sending' AND lease_token_hash = ?`,
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
          AND lease_expires_at <= ?`,
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
    const terminal = row.kind === "account_access" || row.attempts >= row.max_attempts;
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
          AND lease_expires_at <= ?`,
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
    if (!this.provider) {
      throw new EmailOutboxError(
        "DEPENDENCY_UNAVAILABLE",
        transactionalEmailProviderClosed.reason,
      );
    }
    let receipt: TransactionalEmailDeliveryReceipt;
    try {
      receipt = await this.provider.deliver(Object.freeze({
        message: claim,
        idempotencyKey: claim.providerIdempotencyKey,
      }));
    } catch {
      return this.markDeliveryFailure(claim, now, true);
    }
    if (!receipt || receipt.idempotencyKey !== claim.providerIdempotencyKey) {
      return this.markDeliveryFailure(claim, now, true);
    }
    await this.markSent(claim, now);
    return "sent";
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
