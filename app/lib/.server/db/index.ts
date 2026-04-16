import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "./schema.ts";

export type AppDatabase = DrizzleD1Database<typeof schema>;

type D1BoundEnv = Env & {
  DB: D1Database;
};

function hasD1Binding(env: Env): env is D1BoundEnv {
  return (
    "DB" in env &&
    typeof env.DB === "object" &&
    env.DB !== null &&
    "prepare" in env.DB &&
    typeof env.DB.prepare === "function"
  );
}

export function createAppDatabase(env: Env): AppDatabase | null {
  if (!hasD1Binding(env)) {
    return null;
  }

  return drizzle(env.DB, { schema });
}

export { schema };
