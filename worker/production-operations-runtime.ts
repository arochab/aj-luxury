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
