import {
  hashOneTimeAccessToken,
  isCanonicalUtcTimestamp,
} from "./account-security.ts";
import type { CommerceD1Database, CommerceD1Result } from "./d1-port.ts";
import {
  resolveD1MutationActor,
  type D1MutationActor,
  type ResolvedD1Actor,
} from "./d1-actor-authorization.ts";

export type DataRightsKind = "export" | "rectification" | "erasure";

export class DataRightsError extends Error {
  readonly code:
    | "INVALID_INPUT"
    | "UNAUTHORIZED"
    | "NOT_FOUND"
    | "POLICY_MISSING"
    | "RETENTION_REQUIRED"
    | "PERSISTENCE_FAILURE";

  constructor(
    code:
      | "INVALID_INPUT"
      | "UNAUTHORIZED"
      | "NOT_FOUND"
      | "POLICY_MISSING"
      | "RETENTION_REQUIRED"
      | "PERSISTENCE_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "DataRightsError";
    this.code = code;
  }
}

const safeId = /^[a-z0-9][a-z0-9_.:-]{0,191}$/i;
const profileFieldSet = new Set(["firstName", "lastName"]);
const addressFieldSet = new Set([
  "firstName", "lastName", "company", "line1", "line2",
  "postalCode", "city", "countryCode", "phone",
]);

function changed(result: CommerceD1Result<object>): number {
  return Number(result.meta?.changes ?? 0);
}

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !safeId.test(value)) {
    throw new DataRightsError("INVALID_INPUT", `${field} is invalid.`);
  }
}

function assertNow(value: unknown): asserts value is string {
  if (!isCanonicalUtcTimestamp(value)) {
    throw new DataRightsError("INVALID_INPUT", "Timestamp is invalid.");
  }
}

function sanitizeAddress(raw: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    const result: Record<string, string> = {};
    for (const key of addressFieldSet) {
      const field = (value as Record<string, unknown>)[key];
      if (typeof field === "string" && field.length <= 300) result[key] = field;
    }
    return result;
  } catch {
    return {};
  }
}

type RequestRow = {
  id: string;
  kind: DataRightsKind;
  actor_type: "customer" | "guest" | "admin";
  actor_customer_id: string | null;
  actor_order_id: string | null;
  actor_admin_id: string | null;
  target_customer_id: string | null;
  target_order_id: string | null;
  requested_fields_json: string;
  status: "pending" | "completed" | "rejected";
  retention_decision: "unevaluated" | "retain" | "erase";
  retention_policy_version: string | null;
  retention_required_until: string | null;
  active_dispute: number | null;
};

function actorMatchesRequest(actor: ResolvedD1Actor, request: RequestRow): boolean {
  if (actor.kind === "customer") {
    return request.actor_type === "customer" &&
      request.actor_customer_id === actor.customerId &&
      request.target_customer_id === actor.customerId;
  }
  if (actor.kind === "guest") {
    return request.actor_type === "guest" &&
      request.actor_order_id === actor.orderId &&
      request.target_order_id === actor.orderId;
  }
  return request.actor_type === "admin" && request.actor_admin_id === actor.administratorId;
}

export class D1DataRightsStore {
  private readonly database: CommerceD1Database;

  constructor(database: CommerceD1Database) {
    this.database = database;
  }

  async createRequest(input: Readonly<{
    id: string;
    kind: DataRightsKind;
    actor: D1MutationActor;
    idempotencyKey: string;
    now: string;
    targetCustomerId?: string;
    targetOrderId?: string;
    rectificationFields?: readonly string[];
  }>): Promise<{ id: string; created: boolean }> {
    assertId(input.id, "Request id");
    assertId(input.idempotencyKey, "Idempotency key");
    assertNow(input.now);
    if (!["export", "rectification", "erasure"].includes(input.kind)) {
      throw new DataRightsError("INVALID_INPUT", "Request kind is invalid.");
    }
    const actor = await resolveD1MutationActor(this.database, input.actor, input.now);
    if (!actor) throw new DataRightsError("UNAUTHORIZED", "Verified session required.");

    let targetCustomerId: string | null = null;
    let targetOrderId: string | null = null;
    let actorCustomerId: string | null = null;
    let actorOrderId: string | null = null;
    let actorAdminId: string | null = null;
    let actorType: "customer" | "guest" | "admin";
    if (actor.kind === "customer") {
      if (input.targetCustomerId || input.targetOrderId) {
        throw new DataRightsError("INVALID_INPUT", "Customer target is inferred.");
      }
      actorType = "customer";
      actorCustomerId = actor.customerId;
      targetCustomerId = actor.customerId;
    } else if (actor.kind === "guest") {
      if (input.kind !== "export" || input.targetCustomerId || input.targetOrderId) {
        throw new DataRightsError("UNAUTHORIZED", "Guest access is limited to one order export.");
      }
      actorType = "guest";
      actorOrderId = actor.orderId;
      targetOrderId = actor.orderId;
    } else {
      actorType = "admin";
      actorAdminId = actor.administratorId;
      if ((input.targetCustomerId ? 1 : 0) + (input.targetOrderId ? 1 : 0) !== 1) {
        throw new DataRightsError("INVALID_INPUT", "Admin target must be explicit and singular.");
      }
      if (input.targetCustomerId) {
        assertId(input.targetCustomerId, "Target customer id");
        targetCustomerId = input.targetCustomerId;
      } else {
        assertId(input.targetOrderId, "Target order id");
        targetOrderId = input.targetOrderId;
      }
    }
    if (input.kind !== "export" && targetCustomerId === null) {
      throw new DataRightsError("UNAUTHORIZED", "Profile target required.");
    }
    let requestedFields: string[];
    if (input.kind === "export") {
      requestedFields = targetCustomerId ? ["profile", "orders"] : ["order"];
    } else if (input.kind === "erasure") {
      requestedFields = ["profile"];
    } else {
      const fields = input.rectificationFields;
      if (!Array.isArray(fields) || fields.length < 1 ||
        fields.some((field) => !profileFieldSet.has(field)) ||
        new Set(fields).size !== fields.length) {
        throw new DataRightsError("INVALID_INPUT", "Rectification fields are not allowlisted.");
      }
      requestedFields = [...fields].sort();
    }
    const insert = await this.database
      .prepare(
        `INSERT OR IGNORE INTO data_rights_requests (
          id, kind, actor_type, actor_customer_id, actor_order_id, actor_admin_id,
          target_customer_id, target_order_id, requested_fields_json,
          status, retention_decision, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unevaluated', ?, ?, ?)`,
      )
      .bind(
        input.id, input.kind, actorType, actorCustomerId, actorOrderId, actorAdminId,
        targetCustomerId, targetOrderId, JSON.stringify(requestedFields),
        input.idempotencyKey, input.now, input.now,
      )
      .run();
    const persisted = await this.database
      .prepare(
        `SELECT id, kind, actor_type, actor_customer_id, actor_order_id,
          actor_admin_id, target_customer_id, target_order_id,
          requested_fields_json, status, retention_decision,
          retention_policy_version, retention_required_until, active_dispute
        FROM data_rights_requests WHERE idempotency_key = ?`,
      )
      .bind(input.idempotencyKey)
      .first<RequestRow>();
    if (!persisted || persisted.id !== input.id || persisted.kind !== input.kind ||
      !actorMatchesRequest(actor, persisted) ||
      persisted.requested_fields_json !== JSON.stringify(requestedFields)) {
      throw new DataRightsError("PERSISTENCE_FAILURE", "Idempotency collision.");
    }
    return Object.freeze({ id: persisted.id, created: changed(insert) === 1 });
  }

  private async getAuthorizedRequest(
    requestId: string,
    actorInput: D1MutationActor,
    now: string,
    allowOwnerOverride = false,
  ): Promise<{ actor: ResolvedD1Actor; request: RequestRow }> {
    assertId(requestId, "Request id");
    assertNow(now);
    const actor = await resolveD1MutationActor(this.database, actorInput, now);
    if (!actor) throw new DataRightsError("UNAUTHORIZED", "Verified session required.");
    const request = await this.database
      .prepare(
        `SELECT id, kind, actor_type, actor_customer_id, actor_order_id,
          actor_admin_id, target_customer_id, target_order_id,
          requested_fields_json, status, retention_decision,
          retention_policy_version, retention_required_until, active_dispute
        FROM data_rights_requests WHERE id = ?`,
      )
      .bind(requestId)
      .first<RequestRow>();
    if (!request) throw new DataRightsError("NOT_FOUND", "Request not found.");
    if (!actorMatchesRequest(actor, request) &&
      !(allowOwnerOverride && actor.kind === "admin" && actor.role === "owner")) {
      throw new DataRightsError("UNAUTHORIZED", "Request ownership mismatch.");
    }
    return { actor, request };
  }

  async exportAllowlistedData(input: Readonly<{
    requestId: string;
    actor: D1MutationActor;
    now: string;
  }>): Promise<Readonly<Record<string, unknown>>> {
    const { request } = await this.getAuthorizedRequest(
      input.requestId, input.actor, input.now,
    );
    if (request.kind !== "export") {
      throw new DataRightsError("INVALID_INPUT", "Request is not an export.");
    }
    let result: Record<string, unknown>;
    if (request.target_customer_id) {
      const profile = await this.database
        .prepare(
          `SELECT id, email, first_name, last_name, accepts_marketing,
            marketing_consent_at, created_at, updated_at
          FROM customers WHERE id = ?`,
        )
        .bind(request.target_customer_id)
        .first<Record<string, string | number | null>>();
      const orders = await this.database
        .prepare(
          `SELECT id, order_number, status, currency, subtotal_cents,
            shipping_cents, tax_cents, total_cents, shipping_country_code,
            shipping_address_json, billing_address_json, created_at
          FROM orders WHERE customer_id = ? ORDER BY created_at, id`,
        )
        .bind(request.target_customer_id)
        .all<Record<string, string | number>>();
      result = {
        profile: profile ? {
          id: profile.id,
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
          acceptsMarketing: profile.accepts_marketing === 1,
          marketingConsentAt: profile.marketing_consent_at,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        } : null,
        orders: await Promise.all(orders.results.map((order) => this.exportOrder(order))),
      };
    } else {
      const order = await this.database
        .prepare(
          `SELECT id, order_number, status, currency, subtotal_cents,
            shipping_cents, tax_cents, total_cents, shipping_country_code,
            shipping_address_json, billing_address_json, created_at
          FROM orders WHERE id = ?`,
        )
        .bind(request.target_order_id)
        .first<Record<string, string | number>>();
      result = { order: order ? await this.exportOrder(order) : null };
    }
    if (request.status === "pending") {
      await this.database
        .prepare(
          `UPDATE data_rights_requests SET status = 'completed',
            updated_at = ?, completed_at = ? WHERE id = ? AND status = 'pending'`,
        )
        .bind(input.now, input.now, request.id)
        .run();
    }
    return Object.freeze(result);
  }

  private async exportOrder(order: Record<string, string | number>): Promise<Record<string, unknown>> {
    const lines = await this.database
      .prepare(
        `SELECT product_name, color_name, size, quantity,
          unit_price_cents, line_total_cents
        FROM order_lines WHERE order_id = ? ORDER BY created_at, id`,
      )
      .bind(String(order.id))
      .all<Record<string, string | number>>();
    return {
      id: order.id,
      number: order.order_number,
      status: order.status,
      currency: order.currency,
      subtotalCents: order.subtotal_cents,
      shippingCents: order.shipping_cents,
      taxCents: order.tax_cents,
      totalCents: order.total_cents,
      shippingCountryCode: order.shipping_country_code,
      shippingAddress: sanitizeAddress(String(order.shipping_address_json)),
      billingAddress: sanitizeAddress(String(order.billing_address_json)),
      createdAt: order.created_at,
      lines: lines.results.map((line) => Object.freeze({
        productName: line.product_name,
        colorName: line.color_name,
        size: line.size,
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents,
        lineTotalCents: line.line_total_cents,
      })),
    };
  }

  async applyProfileRectification(input: Readonly<{
    requestId: string;
    actor: D1MutationActor;
    now: string;
    changes: Readonly<{ firstName?: string; lastName?: string }>;
  }>): Promise<void> {
    const { request } = await this.getAuthorizedRequest(
      input.requestId, input.actor, input.now, true,
    );
    if (request.kind !== "rectification" || request.status !== "pending" ||
      !request.target_customer_id || typeof input.changes !== "object" || input.changes === null) {
      throw new DataRightsError("INVALID_INPUT", "Rectification is not applicable.");
    }
    const keys = Object.keys(input.changes);
    const requested = new Set<string>(JSON.parse(request.requested_fields_json));
    if (keys.length < 1 || keys.some((key) => !profileFieldSet.has(key) || !requested.has(key))) {
      throw new DataRightsError("INVALID_INPUT", "Rectification field is outside the request.");
    }
    const normalized: Record<string, string> = {};
    for (const key of keys) {
      const value = input.changes[key as "firstName" | "lastName"];
      if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 100 ||
        /[\u0000-\u001f]/.test(value)) {
        throw new DataRightsError("INVALID_INPUT", "Rectification value is invalid.");
      }
      normalized[key] = value.trim();
    }
    const updateProfile = this.database
      .prepare(
        `UPDATE customers SET first_name = COALESCE(?, first_name),
          last_name = COALESCE(?, last_name), updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(
        normalized.firstName ?? null,
        normalized.lastName ?? null,
        input.now,
        request.target_customer_id,
      );
    const complete = this.database
      .prepare(
        `UPDATE data_rights_requests SET status = 'completed', updated_at = ?,
          completed_at = ? WHERE id = ? AND status = 'pending'`,
      )
      .bind(input.now, input.now, request.id);
    const results = await this.database.batch([updateProfile, complete]);
    if (changed(results[0]) !== 1 || changed(results[1]) !== 1) {
      throw new DataRightsError("PERSISTENCE_FAILURE", "Rectification was rolled back.");
    }
  }

  async recordErasureDecision(input: Readonly<{
    requestId: string;
    actor: D1MutationActor;
    activeDispute: boolean;
    now: string;
  }>): Promise<{ decision: "erase" | "retain" } | { decision: "blocked"; reason: "policy-missing" }> {
    const { actor, request } = await this.getAuthorizedRequest(
      input.requestId, input.actor, input.now, true,
    );
    if (actor.kind !== "admin" || actor.role !== "owner") {
      throw new DataRightsError("UNAUTHORIZED", "Owner decision required.");
    }
    if (request.kind !== "erasure" || request.status !== "pending" || !request.target_customer_id ||
      typeof input.activeDispute !== "boolean") {
      throw new DataRightsError("INVALID_INPUT", "Erasure decision is invalid.");
    }
    const rule = await this.database
      .prepare(
        `SELECT policy_version, retention_seconds FROM data_retention_rules
        WHERE record_class = 'customer_profile' AND active = 1
          AND effective_at <= ? LIMIT 1`,
      )
      .bind(input.now)
      .first<{ policy_version: string; retention_seconds: number }>();
    if (!rule) return { decision: "blocked", reason: "policy-missing" };
    const customer = await this.database
      .prepare("SELECT created_at FROM customers WHERE id = ?")
      .bind(request.target_customer_id)
      .first<{ created_at: string }>();
    if (!customer || !Number.isSafeInteger(rule.retention_seconds) || rule.retention_seconds < 0) {
      throw new DataRightsError("POLICY_MISSING", "Active policy is incomplete.");
    }
    const retentionUntil = new Date(
      Date.parse(customer.created_at) + rule.retention_seconds * 1_000,
    ).toISOString();
    const decision = input.activeDispute || retentionUntil > input.now ? "retain" : "erase";
    const update = await this.database
      .prepare(
        `UPDATE data_rights_requests SET retention_decision = ?,
          retention_policy_version = ?, retention_required_until = ?,
          active_dispute = ?, updated_at = ?
        WHERE id = ? AND status = 'pending' AND retention_decision = 'unevaluated'`,
      )
      .bind(
        decision,
        rule.policy_version,
        retentionUntil,
        input.activeDispute ? 1 : 0,
        input.now,
        request.id,
      )
      .run();
    if (changed(update) !== 1) {
      throw new DataRightsError("PERSISTENCE_FAILURE", "Erasure decision was not recorded.");
    }
    return Object.freeze({ decision });
  }

  async applySoftAnonymization(input: Readonly<{
    requestId: string;
    actor: D1MutationActor;
    now: string;
  }>): Promise<{ applied: true } | { applied: false; reason: "policy-missing" | "retention-or-dispute" }> {
    const { request } = await this.getAuthorizedRequest(
      input.requestId, input.actor, input.now, true,
    );
    if (request.kind !== "erasure" || request.status !== "pending" || !request.target_customer_id) {
      throw new DataRightsError("INVALID_INPUT", "Erasure is not applicable.");
    }
    const rule = await this.database
      .prepare(
        `SELECT policy_version FROM data_retention_rules
        WHERE record_class = 'customer_profile' AND active = 1
          AND effective_at <= ? LIMIT 1`,
      )
      .bind(input.now)
      .first<{ policy_version: string }>();
    if (!rule || !request.retention_policy_version ||
      rule.policy_version !== request.retention_policy_version) {
      return { applied: false, reason: "policy-missing" };
    }
    if (request.retention_decision !== "erase" || request.active_dispute !== 0 ||
      !request.retention_required_until || request.retention_required_until > input.now) {
      return { applied: false, reason: "retention-or-dispute" };
    }
    const anonymousHash = await hashOneTimeAccessToken(`data-rights:${request.id}`);
    const anonymousEmail = `anonymized+${anonymousHash.slice(0, 24)}@invalid.example`;
    const anonymize = this.database
      .prepare(
        `UPDATE customers SET email = ?, first_name = NULL, last_name = NULL,
          accepts_marketing = 0, marketing_consent_at = NULL,
          updated_at = ?, deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(anonymousEmail, input.now, input.now, request.target_customer_id);
    const revokeSessions = this.database
      .prepare(
        `UPDATE customer_sessions SET revoked_at = ?
        WHERE customer_id = ? AND revoked_at IS NULL`,
      )
      .bind(input.now, request.target_customer_id);
    const complete = this.database
      .prepare(
        `UPDATE data_rights_requests SET status = 'completed', updated_at = ?,
          completed_at = ? WHERE id = ? AND status = 'pending'
            AND retention_decision = 'erase' AND active_dispute = 0`,
      )
      .bind(input.now, input.now, request.id);
    const results = await this.database.batch([anonymize, revokeSessions, complete]);
    if (changed(results[0]) !== 1 || changed(results[2]) !== 1) {
      throw new DataRightsError("PERSISTENCE_FAILURE", "Anonymization was rolled back.");
    }
    return Object.freeze({ applied: true });
  }
}
