import type { EmailOutboxClaim } from "./email-outbox.ts";

export type TransactionalEmailDeliveryReadiness =
  | Readonly<{ available: true }>
  | Readonly<{ available: false; reason: string }>;

/**
 * Provider-agnostic queue contract for a scheduled Worker/queue consumer.
 * Implementations own all durable lease and retry transitions. No recipient,
 * message body, provider credential or provider response enters the result.
 */
export interface TransactionalEmailDispatchQueuePort {
  deliveryReadiness(): TransactionalEmailDeliveryReadiness;
  claimNext(input: Readonly<{
    leaseTokenHash: string;
    now: string;
    leaseExpiresAt: string;
  }>): Promise<EmailOutboxClaim | null>;
  deliverClaim(
    claim: EmailOutboxClaim,
    now: string,
  ): Promise<"sent" | "retry" | "failed">;
}

/** Supplies only an irreversible random lease-token hash, never the raw token. */
export interface EmailLeaseTokenHashPort {
  next(): Promise<string>;
}

export type TransactionalEmailDispatchResult = Readonly<{
  closed: boolean;
  reason: string | null;
  claimed: number;
  sent: number;
  retryScheduled: number;
  failed: number;
  queueDrained: boolean;
}>;

export class TransactionalEmailDispatchError extends Error {
  readonly code: "INVALID_INPUT" | "DEPENDENCY_FAILURE";

  constructor(
    code: TransactionalEmailDispatchError["code"],
    message: string,
  ) {
    super(message);
    this.name = "TransactionalEmailDispatchError";
    this.code = code;
  }
}

const canonicalUtcTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const hash = /^[0-9a-f]{64}$/;
const safeReason = /^[a-z0-9][a-z0-9_-]{0,95}$/;

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !canonicalUtcTimestamp.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function addSeconds(timestamp: string, seconds: number): string {
  return new Date(Date.parse(timestamp) + seconds * 1_000).toISOString();
}

/**
 * Runs one bounded dispatch cycle. A closed provider is checked before the
 * first durable claim, so missing configuration cannot consume a lease.
 */
export async function dispatchTransactionalEmailBatch(
  queue: TransactionalEmailDispatchQueuePort,
  leaseHashes: EmailLeaseTokenHashPort,
  input: Readonly<{
    now: string;
    maxMessages?: number;
    leaseSeconds?: number;
  }>,
): Promise<TransactionalEmailDispatchResult> {
  const maxMessages = input.maxMessages ?? 10;
  const leaseSeconds = input.leaseSeconds ?? 120;
  if (
    !isCanonicalTimestamp(input.now) ||
    !Number.isSafeInteger(maxMessages) ||
    maxMessages < 1 ||
    maxMessages > 25 ||
    !Number.isSafeInteger(leaseSeconds) ||
    leaseSeconds < 30 ||
    leaseSeconds > 300
  ) {
    throw new TransactionalEmailDispatchError(
      "INVALID_INPUT",
      "Dispatch bounds or timestamp are invalid.",
    );
  }

  let readiness: TransactionalEmailDeliveryReadiness;
  try {
    readiness = queue.deliveryReadiness();
  } catch {
    throw new TransactionalEmailDispatchError(
      "DEPENDENCY_FAILURE",
      "Email delivery readiness could not be evaluated.",
    );
  }
  if (!readiness.available) {
    if (!safeReason.test(readiness.reason)) {
      throw new TransactionalEmailDispatchError(
        "DEPENDENCY_FAILURE",
        "Email delivery returned an unsafe readiness reason.",
      );
    }
    return Object.freeze({
      closed: true,
      reason: readiness.reason,
      claimed: 0,
      sent: 0,
      retryScheduled: 0,
      failed: 0,
      queueDrained: false,
    });
  }

  const counters = {
    claimed: 0,
    sent: 0,
    retryScheduled: 0,
    failed: 0,
  };
  let queueDrained = false;
  const leaseExpiresAt = addSeconds(input.now, leaseSeconds);
  try {
    for (let index = 0; index < maxMessages; index += 1) {
      const leaseTokenHash = await leaseHashes.next();
      if (!hash.test(leaseTokenHash)) {
        throw new TransactionalEmailDispatchError(
          "INVALID_INPUT",
          "Lease hash generator returned an invalid hash.",
        );
      }
      const claim = await queue.claimNext({
        leaseTokenHash,
        now: input.now,
        leaseExpiresAt,
      });
      if (!claim) {
        queueDrained = true;
        break;
      }
      counters.claimed += 1;
      const outcome = await queue.deliverClaim(claim, input.now);
      if (outcome === "sent") counters.sent += 1;
      else if (outcome === "retry") counters.retryScheduled += 1;
      else if (outcome === "failed") counters.failed += 1;
      else {
        throw new TransactionalEmailDispatchError(
          "DEPENDENCY_FAILURE",
          "Email queue returned an invalid delivery outcome.",
        );
      }
    }
  } catch (error) {
    if (error instanceof TransactionalEmailDispatchError) throw error;
    throw new TransactionalEmailDispatchError(
      "DEPENDENCY_FAILURE",
      "Email dispatch stopped after a durable queue or provider failure.",
    );
  }

  return Object.freeze({
    closed: false,
    reason: null,
    ...counters,
    queueDrained,
  });
}
