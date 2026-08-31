import type { CommerceD1Database } from "../lib/commerce/d1-port.ts";

type InstalledOperationsSchemaObject = Readonly<{
  type: string;
  name: string;
  table_name: string;
}>;

const expectedOperationsSchema = Object.freeze([
  "table:commerce_operations_schema_installations:commerce_operations_schema_installations",
  "trigger:trg_commerce_operations_schema_0016_immutable_update:commerce_operations_schema_installations",
  "trigger:trg_commerce_operations_schema_0016_retain_delete:commerce_operations_schema_installations",
  "trigger:trg_return_requests_transition:return_requests",
] as const);

const expectedResendSchemaObjects = Object.freeze([
  "index:idx_resend_webhook_message_time:resend_webhook_events",
  "index:ux_email_outbox_provider_message_id:email_outbox",
  "table:resend_webhook_events:resend_webhook_events",
  "trigger:trg_email_outbox_provider_message_transition:email_outbox",
  "trigger:trg_resend_webhook_events_immutable_update:resend_webhook_events",
  "trigger:trg_resend_webhook_events_retain_delete:resend_webhook_events",
  "trigger:trg_resend_webhook_events_validate_insert:resend_webhook_events",
] as const);

const expectedResendSchemaColumns = Object.freeze([
  "email_outbox:provider_message_id",
  "resend_webhook_events:event_type",
  "resend_webhook_events:id",
  "resend_webhook_events:occurred_at",
  "resend_webhook_events:payload_sha256",
  "resend_webhook_events:provider_message_id",
  "resend_webhook_events:received_at",
] as const);

const expectedEmailReconciliationSchemaObjects = Object.freeze([
  "index:idx_email_delivery_provider_evidence_time:email_delivery_provider_evidence",
  "index:ux_email_delivery_provider_evidence_message:email_delivery_provider_evidence",
  "index:ux_email_delivery_provider_evidence_outbox:email_delivery_provider_evidence",
  "table:email_delivery_provider_evidence:email_delivery_provider_evidence",
  "trigger:trg_email_delivery_provider_evidence_immutable_update:email_delivery_provider_evidence",
  "trigger:trg_email_delivery_provider_evidence_retain_delete:email_delivery_provider_evidence",
  "trigger:trg_email_delivery_provider_evidence_validate_insert:email_delivery_provider_evidence",
] as const);

const expectedEmailReconciliationSchemaColumns = Object.freeze([
  "id",
  "outbox_id",
  "provider_created_at",
  "provider_last_event",
  "provider_message_id",
  "reconciled_at",
  "reconciled_by_admin_id",
  "reconciliation_source",
] as const);

const AJ_TRANSACTIONAL_MAILBOX = /^[^@\s]+@ajluxurystore\.com$/i;
const SAFE_TRANSACTIONAL_REPLY_TO = /^[\x21-\x7e]+@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const SAFE_TRANSACTIONAL_FROM_NAME = /^[^\r\n<>]{1,80}$/;

export type ProductionEmailDispatchRuntimeEnvironment = Readonly<{
  APP_ENV?: string;
  COMMERCE_MODE?: string;
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  TRANSACTIONAL_FROM_EMAIL?: string;
  TRANSACTIONAL_FROM_NAME?: string;
  TRANSACTIONAL_REPLY_TO?: string;
  TRANSACTIONAL_EMAIL_DISPATCH_ENABLED?: string;
  TRANSACTIONAL_EMAIL_DISPATCH_MODE?: string;
  TRANSACTIONAL_EMAIL_RECONCILIATION_ENABLED?: string;
}>;

/**
 * One pure configuration proof shared by health and the scheduled dispatcher.
 * Closed mode may drain an already-created outbox only when explicitly allowed.
 */
export function productionEmailDispatchRuntimeConfigured(
  env: ProductionEmailDispatchRuntimeEnvironment | undefined,
  allowClosedDrain = false,
): boolean {
  if (!env || env.APP_ENV !== "production" ||
    env.TRANSACTIONAL_EMAIL_DISPATCH_ENABLED !== "true" ||
    env.EMAIL_PROVIDER !== "resend" ||
    env.RESEND_API_KEY?.startsWith("re_") !== true ||
    !AJ_TRANSACTIONAL_MAILBOX.test(env.TRANSACTIONAL_FROM_EMAIL ?? "") ||
    !SAFE_TRANSACTIONAL_FROM_NAME.test(env.TRANSACTIONAL_FROM_NAME?.trim() ?? "") ||
    (env.TRANSACTIONAL_REPLY_TO !== undefined &&
      (env.TRANSACTIONAL_REPLY_TO.length > 254 ||
        !SAFE_TRANSACTIONAL_REPLY_TO.test(env.TRANSACTIONAL_REPLY_TO)))) {
    return false;
  }
  const dispatchMode = env.TRANSACTIONAL_EMAIL_DISPATCH_MODE;
  if (dispatchMode !== "controlled" && dispatchMode !== "live") return false;
  if (env.COMMERCE_MODE === "closed") return allowClosedDrain;
  return env.COMMERCE_MODE === dispatchMode;
}

/** Provider-read configuration for incident reconciliation. It deliberately
 * does not depend on the outbound dispatcher, so operators can prove an
 * already-sent message while commerce and automatic sending remain closed. */
export function productionEmailReconciliationRuntimeConfigured(
  env: ProductionEmailDispatchRuntimeEnvironment | undefined,
): boolean {
  return Boolean(
    env && env.APP_ENV === "production" &&
    env.TRANSACTIONAL_EMAIL_RECONCILIATION_ENABLED === "true" &&
    ["closed", "sandbox", "controlled", "live"].includes(env.COMMERCE_MODE ?? "") &&
    env.EMAIL_PROVIDER === "resend" &&
    env.RESEND_API_KEY?.startsWith("re_") === true &&
    AJ_TRANSACTIONAL_MAILBOX.test(env.TRANSACTIONAL_FROM_EMAIL ?? "") &&
    SAFE_TRANSACTIONAL_FROM_NAME.test(env.TRANSACTIONAL_FROM_NAME?.trim() ?? "") &&
    (env.TRANSACTIONAL_REPLY_TO === undefined ||
      (env.TRANSACTIONAL_REPLY_TO.length <= 254 &&
        SAFE_TRANSACTIONAL_REPLY_TO.test(env.TRANSACTIONAL_REPLY_TO)))
  );
}

/** Exact hosted D1 proof for the return operator state machine. */
export async function productionOperationsRuntimeInstalled(
  database: CommerceD1Database | undefined,
): Promise<boolean> {
  if (!database) return false;
  try {
    const [installed, sentinel] = await Promise.all([
      database.prepare(
        `SELECT lower(type) AS type, lower(name) AS name,
          lower(tbl_name) AS table_name FROM sqlite_master
        WHERE (lower(type) = 'table'
          AND lower(name) = 'commerce_operations_schema_installations')
          OR (lower(type) = 'trigger' AND lower(name) IN (
            'trg_commerce_operations_schema_0016_immutable_update',
            'trg_commerce_operations_schema_0016_retain_delete',
            'trg_return_requests_transition'
          ))
        ORDER BY type, name`,
      ).all<InstalledOperationsSchemaObject>(),
      database.prepare(
        `SELECT version, contract, installed_at
        FROM commerce_operations_schema_installations
        WHERE version = '0016_return_operator_state_machine'`,
      ).first<{ version: string; contract: string; installed_at: string }>(),
    ]);
    const actual = installed.results
      .map((row) => `${row.type}:${row.name}:${row.table_name}`)
      .sort();
    return actual.length === expectedOperationsSchema.length &&
      actual.every((value, index) => value === expectedOperationsSchema[index]) &&
      sentinel?.version === "0016_return_operator_state_machine" &&
      sentinel.contract === "received-approved-goods_received-inspected-v1" &&
      sentinel.installed_at === "2026-08-15T00:00:00.000Z";
  } catch {
    return false;
  }
}

/** Exact hosted D1 proof for durable Resend receipts and signed event audit. */
export async function productionResendRuntimeInstalled(
  database: CommerceD1Database | undefined,
): Promise<boolean> {
  if (!database) return false;
  try {
    const [objects, columns] = await Promise.all([
      database.prepare(
        `SELECT lower(type) AS type, lower(name) AS name,
          lower(tbl_name) AS table_name FROM sqlite_master
        WHERE lower(name) IN (
          'idx_resend_webhook_message_time',
          'ux_email_outbox_provider_message_id',
          'resend_webhook_events',
          'trg_email_outbox_provider_message_transition',
          'trg_resend_webhook_events_immutable_update',
          'trg_resend_webhook_events_retain_delete',
          'trg_resend_webhook_events_validate_insert'
        )
        ORDER BY type, name`,
      ).all<InstalledOperationsSchemaObject>(),
      database.prepare(
        `SELECT 'email_outbox:' || lower(name) AS signature
        FROM pragma_table_info('email_outbox')
        WHERE lower(name) = 'provider_message_id'
        UNION ALL
        SELECT 'resend_webhook_events:' || lower(name) AS signature
        FROM pragma_table_info('resend_webhook_events')
        ORDER BY signature`,
      ).all<{ signature: string }>(),
    ]);
    const actualObjects = objects.results
      .map((row) => `${row.type}:${row.name}:${row.table_name}`)
      .sort();
    const actualColumns = columns.results.map((row) => row.signature).sort();
    return actualObjects.length === expectedResendSchemaObjects.length &&
      actualObjects.every((value, index) => value === expectedResendSchemaObjects[index]) &&
      actualColumns.length === expectedResendSchemaColumns.length &&
      actualColumns.every((value, index) => value === expectedResendSchemaColumns[index]);
  } catch {
    return false;
  }
}

/** Exact hosted D1 proof for immutable provider-delivery reconciliation. */
export async function productionEmailReconciliationRuntimeInstalled(
  database: CommerceD1Database | undefined,
): Promise<boolean> {
  if (!database) return false;
  try {
    const [objects, columns] = await Promise.all([
      database.prepare(
        `SELECT lower(type) AS type, lower(name) AS name,
          lower(tbl_name) AS table_name FROM sqlite_master
        WHERE lower(name) IN (
          'email_delivery_provider_evidence',
          'idx_email_delivery_provider_evidence_time',
          'ux_email_delivery_provider_evidence_message',
          'ux_email_delivery_provider_evidence_outbox',
          'trg_email_delivery_provider_evidence_immutable_update',
          'trg_email_delivery_provider_evidence_retain_delete',
          'trg_email_delivery_provider_evidence_validate_insert'
        ) ORDER BY type, name`,
      ).all<InstalledOperationsSchemaObject>(),
      database.prepare(
        `SELECT lower(name) AS name
        FROM pragma_table_info('email_delivery_provider_evidence')
        ORDER BY name`,
      ).all<{ name: string }>(),
    ]);
    const actualObjects = objects.results
      .map((row) => `${row.type}:${row.name}:${row.table_name}`)
      .sort();
    const actualColumns = columns.results.map((row) => row.name).sort();
    return actualObjects.length === expectedEmailReconciliationSchemaObjects.length &&
      actualObjects.every((value, index) =>
        value === expectedEmailReconciliationSchemaObjects[index]) &&
      actualColumns.length === expectedEmailReconciliationSchemaColumns.length &&
      actualColumns.every((value, index) =>
        value === expectedEmailReconciliationSchemaColumns[index]);
  } catch {
    return false;
  }
}
