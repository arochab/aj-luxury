export type CommerceD1Value = string | number | null;

export type CommerceD1Meta = {
  changes?: number;
  last_row_id?: number;
};

export type CommerceD1Result<Row extends object = Record<string, never>> = {
  success: boolean;
  results: Row[];
  meta: CommerceD1Meta;
  error?: string;
};

export interface CommerceD1PreparedStatement {
  bind(...values: CommerceD1Value[]): CommerceD1PreparedStatement;
  first<Row extends object>(): Promise<Row | null>;
  all<Row extends object>(): Promise<CommerceD1Result<Row>>;
  run<Row extends object = Record<string, never>>(): Promise<
    CommerceD1Result<Row>
  >;
}

/**
 * Port structurel minimal utilisé par le cœur commerce.
 *
 * Il correspond aux méthodes D1 appelées ici sans dupliquer une interface Env
 * ni coupler la logique métier au point d'entrée Worker.
 */
export interface CommerceD1Database {
  prepare(query: string): CommerceD1PreparedStatement;
  batch(
    statements: CommerceD1PreparedStatement[],
  ): Promise<CommerceD1Result<object>[]>;
}
