import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { z } from "zod";

import * as schema from "./schema.ts";

export type AppDatabase = DrizzleD1Database<typeof schema>;

const d1DatabaseBindingSchema = z.custom<D1Database>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "prepare" in value &&
    typeof value.prepare === "function",
  { error: "Expected a Cloudflare D1 database binding." },
);

const d1BoundEnvSchema = z.looseObject({
  DB: d1DatabaseBindingSchema,
});

export function createAppDatabase(env: Env): AppDatabase {
  const { DB } = d1BoundEnvSchema.parse(env);

  return drizzle(DB, { schema });
}

export { schema };
