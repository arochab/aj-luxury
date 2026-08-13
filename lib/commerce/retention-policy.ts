import { isCanonicalUtcTimestamp } from "./account-security.ts";
import type { CommerceD1Database } from "./d1-port.ts";
import {
  resolveD1MutationActor,
  type D1MutationActor,
} from "./d1-actor-authorization.ts";

export type RetentionRecordClass =
  | "customer_profile"
  | "email_content"
  | "order_record";

const safeId = /^[a-z0-9][a-z0-9_.:-]{0,191}$/i;

export class RetentionPolicyError extends Error {
  readonly code: "INVALID_INPUT" | "UNAUTHORIZED" | "PERSISTENCE_FAILURE";

  constructor(
    code: "INVALID_INPUT" | "UNAUTHORIZED" | "PERSISTENCE_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "RetentionPolicyError";
    this.code = code;
  }
}

export class D1RetentionPolicyStore {
  private readonly database: CommerceD1Database;

  constructor(database: CommerceD1Database) {
    this.database = database;
  }

  async activate(input: Readonly<{
    id: string;
    recordClass: RetentionRecordClass;
    policyVersion: string;
    retentionSeconds: number;
    effectiveAt: string;
    actor: D1MutationActor;
    now: string;
  }>): Promise<void> {
    if (
      !safeId.test(input.id) || !safeId.test(input.policyVersion) ||
      !["customer_profile", "email_content", "order_record"].includes(input.recordClass) ||
      !Number.isSafeInteger(input.retentionSeconds) || input.retentionSeconds < 0 ||
      !isCanonicalUtcTimestamp(input.effectiveAt) ||
      !isCanonicalUtcTimestamp(input.now) || input.effectiveAt > input.now
    ) {
      throw new RetentionPolicyError("INVALID_INPUT", "Retention rule is invalid.");
    }
    const actor = await resolveD1MutationActor(this.database, input.actor, input.now);
    if (!actor || actor.kind !== "admin" || actor.role !== "owner") {
      throw new RetentionPolicyError("UNAUTHORIZED", "Owner authorization is required.");
    }
    const disable = this.database
      .prepare(
        `UPDATE data_retention_rules SET active = 0, updated_at = ?
        WHERE record_class = ? AND active = 1`,
      )
      .bind(input.now, input.recordClass);
    const insert = this.database
      .prepare(
        `INSERT INTO data_retention_rules (
          id, record_class, policy_version, retention_seconds, active,
          effective_at, created_by_admin_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.recordClass,
        input.policyVersion,
        input.retentionSeconds,
        input.effectiveAt,
        actor.administratorId,
        input.now,
        input.now,
      );
    const results = await this.database.batch([disable, insert]);
    if (Number(results[1].meta?.changes ?? 0) !== 1) {
      throw new RetentionPolicyError("PERSISTENCE_FAILURE", "Retention rule was not activated.");
    }
  }
}
