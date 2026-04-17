interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env extends Record<string, unknown> {
  AI: Ai;
  DB: D1Database;
}

interface ExecutionContext {
  passThroughOnException?(): void;
  waitUntil(promise: Promise<unknown>): void;
}
