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
