import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(rootDir, "drizzle")),
        },
      },
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    })),
  ],
  resolve: {
    alias: {
      "~": path.join(rootDir, "app"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup/apply-d1-migrations.ts"],
  },
});
