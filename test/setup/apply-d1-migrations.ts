import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll } from "vite-plus/test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

beforeAll(async () => {
  const { DB, TEST_MIGRATIONS } = env as Env & { TEST_MIGRATIONS: D1Migration[] };

  await applyD1Migrations(DB, TEST_MIGRATIONS);
});
