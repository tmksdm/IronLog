// Ambient declaration for sql.js.
//
// The application never imports sql.js directly — jeep-sqlite loads it for the
// local database. Tests use the same wasm build as a real SQLite engine, and
// the package ships no type declarations.

declare module 'sql.js' {
  export interface Statement {
    bind(values: unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
  }

  export interface Database {
    run(sql: string, values?: unknown[]): void;
    exec(sql: string): unknown[];
    prepare(sql: string): Statement;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | null) => Database;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
