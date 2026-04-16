import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  out: "./drizzle",
  schema: "./app/lib/.server/db/schema.ts",
  strict: true,
  verbose: true,
});
