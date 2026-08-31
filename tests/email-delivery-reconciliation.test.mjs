import assert from "node:assert/strict";
import test from "node:test";

import {
  D1EmailDeliveryReconciler,
  EmailDeliveryReconciliationError,
} from "../lib/commerce/email-delivery-reconciliation.ts";
import { ResendEmailProviderError } from "../lib/commerce/resend-email-provider.ts";

const now = "2026-08-31T10:00:00.000Z";
const providerMessageId = "email_delivered_1";
const actor = Object.freeze({
  kind: "admin",
  sessionToken: "A".repeat(43),
  csrfToken: "B".repeat(43),
});

function databaseFixture() {
  const state = {
    evidence: null,
    auditId: null,
    batchCalls: [],
  };
  const row = {
    id: "outbox_payment_1",
    kind: "payment_confirmation",
    recipient_email: "client@example.com",
    locale: "fr",
    payload_json: JSON.stringify({ subject: "Paiement confirmé", text: "Merci." }),
    status: "failed",
    last_error_code: "delivery_ambiguous",
    provider_message_id: null,
    purged_at: null,
    order_status: "paid",
    paid_at: "2026-08-28T19:25:00.000Z",
    payment_succeeded: 1,
    evidence_provider_message_id: null,
    evidence_provider_last_event: null,
  };
  function statement(query, values = []) {
    return {
      query,
      values,
      bind(...next) { return statement(query, next); },
      async first() {
        if (/FROM admin_sessions/.test(query)) {
          return { session_id: "admin_session_1", id: "admin_owner_1", role: "owner" };
        }
        if (/FROM email_outbox AS message/.test(query)) {
          return {
            ...row,
            evidence_provider_message_id: state.evidence?.providerMessageId ?? null,
            evidence_provider_last_event: state.evidence?.providerLastEvent ?? null,
          };
        }
        if (/FROM email_delivery_provider_evidence/.test(query)) {
          return state.evidence && {
            provider_message_id: state.evidence.providerMessageId,
            provider_last_event: state.evidence.providerLastEvent,
            reconciled_by_admin_id: "admin_owner_1",
          };
        }
        if (/FROM audit_log/.test(query)) {
          return state.auditId === values[0] && {
            actor_id: "admin_owner_1",
            action: "email_delivery_reconciled",
            entity_id: row.id,
          };
        }
        throw new Error(`Unexpected first query: ${query}`);
      },
      async all() { return { success: true, results: [], meta: { changes: 0 } }; },
      async run() { return { success: true, results: [], meta: { changes: 1 } }; },
    };
  }
  return {
    state,
    database: {
      prepare(query) { return statement(query); },
      async batch(statements) {
        state.batchCalls.push(statements);
        const evidenceStatement = statements[0];
        state.evidence = {
          evidenceId: evidenceStatement.values[0],
          providerMessageId: evidenceStatement.values[2],
          providerLastEvent: evidenceStatement.values[3],
        };
        state.auditId = statements[1].values[0];
        return statements.map(() => ({ success: true, results: [], meta: { changes: 1 } }));
      },
    },
  };
}

function deliveredProvider(calls) {
  return {
    async retrieveDeliveredEvidence(id, expected) {
      calls.push({ id, expected });
      return {
        providerMessageId: id,
        providerLastEvent: "delivered",
        providerCreatedAt: "2026-08-28T19:25:01.000Z",
        recipientSha256: "a".repeat(64),
        subjectSha256: "b".repeat(64),
        bodySha256: "c".repeat(64),
        providerSnapshotSha256: "d".repeat(64),
      };
    },
  };
}

test("exact delivered provider record appends one PII-free immutable proof", async () => {
  const fixture = databaseFixture();
  const providerCalls = [];
  const reconciler = new D1EmailDeliveryReconciler(
    fixture.database,
    deliveredProvider(providerCalls),
  );
  const first = await reconciler.reconcile({
    outboxId: "outbox_payment_1",
    providerMessageId,
    actor,
    now,
  });
  assert.deepEqual(first, {
    outboxId: "outbox_payment_1",
    kind: "payment_confirmation",
    providerMessageId,
    providerLastEvent: "delivered",
    created: true,
  });
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].expected.recipientEmail, "client@example.com");
  assert.equal(fixture.state.batchCalls.length, 1);
  const persistedValues = fixture.state.batchCalls[0]
    .flatMap((statement) => statement.values)
    .map(String)
    .join(" ");
  assert.doesNotMatch(persistedValues, /client@example\.com|Merci\.|Paiement confirmé/);

  const replay = await reconciler.reconcile({
    outboxId: "outbox_payment_1",
    providerMessageId,
    actor,
    now: "2026-08-31T10:01:00.000Z",
  });
  assert.equal(replay.created, false);
  assert.equal(providerCalls.length, 1);
  assert.equal(fixture.state.batchCalls.length, 1);
});

test("inconclusive provider state never writes evidence and never authorizes replay", async () => {
  const fixture = databaseFixture();
  const reconciler = new D1EmailDeliveryReconciler(fixture.database, {
    async retrieveDeliveredEvidence() {
      throw new ResendEmailProviderError("ambiguous", "not proven");
    },
  });
  await assert.rejects(
    reconciler.reconcile({
      outboxId: "outbox_payment_1",
      providerMessageId,
      actor,
      now,
    }),
    (error) => error instanceof EmailDeliveryReconciliationError &&
      error.code === "PROVIDER_EVIDENCE_INCONCLUSIVE",
  );
  assert.equal(fixture.state.batchCalls.length, 0);
});

test("provider delivery from before the paid order cannot prove its confirmation", async () => {
  const fixture = databaseFixture();
  const reconciler = new D1EmailDeliveryReconciler(fixture.database, {
    async retrieveDeliveredEvidence() {
      return {
        providerMessageId,
        providerLastEvent: "delivered",
        providerCreatedAt: "2026-08-28T19:24:59.999Z",
        recipientSha256: "a".repeat(64),
        subjectSha256: "b".repeat(64),
        bodySha256: "c".repeat(64),
        providerSnapshotSha256: "d".repeat(64),
      };
    },
  });
  await assert.rejects(
    reconciler.reconcile({
      outboxId: "outbox_payment_1",
      providerMessageId,
      actor,
      now,
    }),
    (error) => error instanceof EmailDeliveryReconciliationError &&
      error.code === "PROVIDER_EVIDENCE_INCONCLUSIVE",
  );
  assert.equal(fixture.state.batchCalls.length, 0);
});

test("a different provider id conflicts with already-recorded immutable evidence", async () => {
  const fixture = databaseFixture();
  fixture.state.evidence = {
    providerMessageId,
    providerLastEvent: "delivered",
  };
  const providerCalls = [];
  const reconciler = new D1EmailDeliveryReconciler(
    fixture.database,
    deliveredProvider(providerCalls),
  );
  await assert.rejects(
    reconciler.reconcile({
      outboxId: "outbox_payment_1",
      providerMessageId: "email_crossed_2",
      actor,
      now,
    }),
    (error) => error instanceof EmailDeliveryReconciliationError &&
      error.code === "RECONCILIATION_CONFLICT",
  );
  assert.equal(providerCalls.length, 0);
  assert.equal(fixture.state.batchCalls.length, 0);
});

test("a concurrent exact winner is idempotent and cannot create a second audit", async () => {
  const fixture = databaseFixture();
  fixture.database.batch = async (statements) => {
    fixture.state.batchCalls.push(statements);
    fixture.state.evidence = {
      evidenceId: statements[0].values[0],
      providerMessageId,
      providerLastEvent: "delivered",
    };
    fixture.state.auditId = statements[1].values[0];
    throw new Error("unique constraint: concurrent winner");
  };
  const reconciler = new D1EmailDeliveryReconciler(
    fixture.database,
    deliveredProvider([]),
  );
  const result = await reconciler.reconcile({
    outboxId: "outbox_payment_1",
    providerMessageId,
    actor,
    now,
  });
  assert.equal(result.created, false);
  assert.equal(fixture.state.batchCalls.length, 1);
});

test("a concurrent different provider winner conflicts without a false loser audit", async () => {
  const fixture = databaseFixture();
  fixture.database.batch = async (statements) => {
    fixture.state.batchCalls.push(statements);
    fixture.state.evidence = {
      evidenceId: "email_evidence_winner",
      providerMessageId: "email_concurrent_winner",
      providerLastEvent: "delivered",
    };
    fixture.state.auditId = "audit_email_evidence_winner";
    throw new Error("unique constraint: concurrent winner");
  };
  const reconciler = new D1EmailDeliveryReconciler(
    fixture.database,
    deliveredProvider([]),
  );
  await assert.rejects(
    reconciler.reconcile({
      outboxId: "outbox_payment_1",
      providerMessageId,
      actor,
      now,
    }),
    (error) => error instanceof EmailDeliveryReconciliationError &&
      error.code === "RECONCILIATION_CONFLICT",
  );
  assert.equal(fixture.state.auditId, "audit_email_evidence_winner");
});
