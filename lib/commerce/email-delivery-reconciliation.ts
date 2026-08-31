import { isCanonicalUtcTimestamp } from "./account-security.ts";
import {
  resolveD1MutationActor,
  type D1MutationActor,
} from "./d1-actor-authorization.ts";
import type { CommerceD1Database } from "./d1-port.ts";
import {
  ResendEmailProvider,
  ResendEmailProviderError,
} from "./resend-email-provider.ts";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

type AmbiguousOutboxRow = Readonly<{
  id: string;
  kind: "order_confirmation" | "payment_confirmation";
  recipient_email: string | null;
  locale: "fr" | "en";
  payload_json: string | null;
  status: string;
  last_error_code: string | null;
  provider_message_id: string | null;
  purged_at: string | null;
  order_status: string | null;
  paid_at: string | null;
  payment_succeeded: number;
  evidence_provider_message_id: string | null;
  evidence_provider_last_event: "delivered" | "opened" | "clicked" | null;
}>;

export class EmailDeliveryReconciliationError extends Error {
  readonly code:
    | "INVALID_INPUT"
    | "OWNER_REQUIRED"
    | "OUTBOX_NOT_ELIGIBLE"
    | "PROVIDER_EVIDENCE_INCONCLUSIVE"
    | "RECONCILIATION_CONFLICT"
    | "PERSISTENCE_FAILURE";

  constructor(
    code: EmailDeliveryReconciliationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "EmailDeliveryReconciliationError";
    this.code = code;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  ));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class D1EmailDeliveryReconciler {
  readonly #database: CommerceD1Database;
  readonly #provider: Pick<ResendEmailProvider, "retrieveDeliveredEvidence">;

  constructor(
    database: CommerceD1Database,
    provider: Pick<ResendEmailProvider, "retrieveDeliveredEvidence">,
  ) {
    this.#database = database;
    this.#provider = provider;
  }

  async reconcile(input: Readonly<{
    outboxId: string;
    providerMessageId: string;
    actor: D1MutationActor;
    now: string;
  }>): Promise<Readonly<{
    outboxId: string;
    kind: "order_confirmation" | "payment_confirmation";
    providerMessageId: string;
    providerLastEvent: "delivered" | "opened" | "clicked";
    created: boolean;
  }>> {
    if (
      !SAFE_ID.test(input.outboxId) || !SAFE_ID.test(input.providerMessageId) ||
      !isCanonicalUtcTimestamp(input.now)
    ) {
      throw new EmailDeliveryReconciliationError("INVALID_INPUT", "Input is invalid.");
    }
    const resolved = await resolveD1MutationActor(this.#database, input.actor, input.now);
    if (resolved?.kind !== "admin" || resolved.role !== "owner") {
      throw new EmailDeliveryReconciliationError("OWNER_REQUIRED", "Owner session is required.");
    }
    let row: AmbiguousOutboxRow | null;
    try {
      row = await this.#database.prepare(
        `SELECT message.id, message.kind, message.recipient_email, message.locale,
          message.payload_json, message.status, message.last_error_code,
          message.provider_message_id, message.purged_at,
          customer_order.status AS order_status, customer_order.paid_at,
          EXISTS(SELECT 1 FROM payments AS payment
            WHERE payment.order_id = customer_order.id
              AND payment.provider = 'stripe' AND payment.status = 'succeeded'
              AND payment.amount_cents = customer_order.total_cents
              AND payment.currency = customer_order.currency) AS payment_succeeded,
          evidence.provider_message_id AS evidence_provider_message_id,
          evidence.provider_last_event AS evidence_provider_last_event
        FROM email_outbox AS message
        LEFT JOIN orders AS customer_order ON customer_order.id = message.order_id
        LEFT JOIN email_delivery_provider_evidence AS evidence
          ON evidence.outbox_id = message.id
        WHERE message.id = ? LIMIT 1`,
      ).bind(input.outboxId).first<AmbiguousOutboxRow>();
    } catch {
      throw new EmailDeliveryReconciliationError(
        "PERSISTENCE_FAILURE",
        "Outbox evidence could not be read.",
      );
    }
    if (!row || !["order_confirmation", "payment_confirmation"].includes(row.kind)) {
      throw new EmailDeliveryReconciliationError(
        "OUTBOX_NOT_ELIGIBLE",
        "Outbox item is not eligible.",
      );
    }
    if (row.evidence_provider_message_id !== null) {
      if (
        row.evidence_provider_message_id !== input.providerMessageId ||
        !row.evidence_provider_last_event
      ) {
        throw new EmailDeliveryReconciliationError(
          "RECONCILIATION_CONFLICT",
          "Different immutable evidence already exists.",
        );
      }
      return Object.freeze({
        outboxId: row.id,
        kind: row.kind,
        providerMessageId: row.evidence_provider_message_id,
        providerLastEvent: row.evidence_provider_last_event,
        created: false,
      });
    }
    if (
      row.status !== "failed" || row.last_error_code !== "delivery_ambiguous" ||
      row.provider_message_id !== null || row.purged_at !== null ||
      !row.recipient_email || !row.payload_json ||
      !["paid", "preparing", "shipped"].includes(row.order_status ?? "") ||
      !isCanonicalUtcTimestamp(row.paid_at) || row.paid_at > input.now ||
      row.payment_succeeded !== 1
    ) {
      throw new EmailDeliveryReconciliationError(
        "OUTBOX_NOT_ELIGIBLE",
        "Outbox item is not an ambiguous verified payment confirmation.",
      );
    }
    let providerEvidence;
    try {
      providerEvidence = await this.#provider.retrieveDeliveredEvidence(
        input.providerMessageId,
        {
          outboxId: row.id,
          kind: row.kind,
          locale: row.locale,
          recipientEmail: row.recipient_email,
          payloadJson: row.payload_json,
        },
      );
    } catch (cause) {
      if (cause instanceof ResendEmailProviderError) {
        throw new EmailDeliveryReconciliationError(
          cause.outcome === "rejected" ? "INVALID_INPUT" : "PROVIDER_EVIDENCE_INCONCLUSIVE",
          "Provider evidence is inconclusive.",
        );
      }
      throw new EmailDeliveryReconciliationError(
        "PROVIDER_EVIDENCE_INCONCLUSIVE",
        "Provider evidence is inconclusive.",
      );
    }
    if (
      !isCanonicalUtcTimestamp(providerEvidence.providerCreatedAt) ||
      providerEvidence.providerCreatedAt < row.paid_at ||
      providerEvidence.providerCreatedAt > input.now
    ) {
      throw new EmailDeliveryReconciliationError(
        "PROVIDER_EVIDENCE_INCONCLUSIVE",
        "Provider timestamp is inconclusive.",
      );
    }
    const identity = await sha256Hex(`${row.id}\0${input.providerMessageId}`);
    const evidenceId = `email_evidence_${identity}`;
    const auditId = `audit_email_evidence_${identity}`;
    const metadata = JSON.stringify({
      evidenceId,
      provider: "resend",
      providerLastEvent: providerEvidence.providerLastEvent,
      providerMessageId: input.providerMessageId,
    });
    const readPersistedProof = async () => Promise.all([
      this.#database.prepare(
        `SELECT provider_message_id, provider_last_event,
          reconciled_by_admin_id FROM email_delivery_provider_evidence
        WHERE outbox_id = ? LIMIT 1`,
      ).bind(row.id).first<{
        provider_message_id: string;
        provider_last_event: "delivered" | "opened" | "clicked";
        reconciled_by_admin_id: string;
      }>(),
      this.#database.prepare(
        `SELECT actor_id, action, entity_id FROM audit_log WHERE id = ? LIMIT 1`,
      ).bind(auditId).first<{
        actor_id: string;
        action: string;
        entity_id: string;
      }>(),
    ]);
    const exactProof = (
      persisted: Awaited<ReturnType<typeof readPersistedProof>>[0],
      audit: Awaited<ReturnType<typeof readPersistedProof>>[1],
    ) => Boolean(
      persisted?.provider_message_id === input.providerMessageId &&
      persisted.provider_last_event === providerEvidence.providerLastEvent &&
      audit?.actor_id === persisted.reconciled_by_admin_id &&
      audit.action === "email_delivery_reconciled" && audit.entity_id === row.id
    );
    try {
      await this.#database.batch([
        this.#database.prepare(
          `INSERT INTO email_delivery_provider_evidence (
            id, outbox_id, provider_message_id, provider_last_event,
            provider_created_at, reconciliation_source,
            reconciled_by_admin_id, reconciled_at
          ) VALUES (?, ?, ?, ?, ?, 'resend_api', ?, ?)`,
        ).bind(
          evidenceId,
          row.id,
          input.providerMessageId,
          providerEvidence.providerLastEvent,
          providerEvidence.providerCreatedAt,
          resolved.administratorId,
          input.now,
        ),
        this.#database.prepare(
          `INSERT INTO audit_log (
            id, actor_type, actor_id, action, entity_type, entity_id,
            idempotency_key, metadata_json, created_at
          ) VALUES (?, 'admin', ?, 'email_delivery_reconciled',
            'email_outbox', ?, ?, ?, ?)`,
        ).bind(
          auditId,
          resolved.administratorId,
          row.id,
          `audit:email_delivery_reconciled:${identity}`,
          metadata,
          input.now,
        ),
      ]);
    } catch {
      try {
        const [persisted, audit] = await readPersistedProof();
        if (exactProof(persisted, audit)) {
          return Object.freeze({
            outboxId: row.id,
            kind: row.kind,
            providerMessageId: input.providerMessageId,
            providerLastEvent: providerEvidence.providerLastEvent,
            created: false,
          });
        }
        if (persisted || audit) {
          throw new EmailDeliveryReconciliationError(
            "RECONCILIATION_CONFLICT",
            "Different immutable evidence won the reconciliation race.",
          );
        }
      } catch (cause) {
        if (cause instanceof EmailDeliveryReconciliationError) throw cause;
      }
      throw new EmailDeliveryReconciliationError(
        "PERSISTENCE_FAILURE",
        "Provider evidence could not be persisted.",
      );
    }
    const [persisted, audit] = await readPersistedProof();
    if (!exactProof(persisted, audit) ||
      persisted?.reconciled_by_admin_id !== resolved.administratorId) {
      throw new EmailDeliveryReconciliationError(
        "RECONCILIATION_CONFLICT",
        "Persisted evidence does not match the provider proof.",
      );
    }
    return Object.freeze({
      outboxId: row.id,
      kind: row.kind,
      providerMessageId: input.providerMessageId,
      providerLastEvent: providerEvidence.providerLastEvent,
      created: true,
    });
  }
}
