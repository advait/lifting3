import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

const DEFAULT_DEV_PORT = 43_110;
const PORT_ENV_KEY = "PORT";
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const isVitest = process.env.VITEST === "true";

function getDevPort() {
  const parsedPort = Number(process.env[PORT_ENV_KEY]);

  if (Number.isInteger(parsedPort) && parsedPort >= 1_024 && parsedPort <= 65_535) {
    return parsedPort;
  }

  return DEFAULT_DEV_PORT;
}

const devPort = getDevPort();

export default defineConfig({
  fmt: {
    ignorePatterns: [".agents/**"],
  },
  lint: {
    ignorePatterns: [".agents/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  staged: {
    "*.{css,js,json,jsonc,jsx,md,mdx,ts,tsx,yaml,yml}": "vp check --fix",
  },
  plugins: [
    ...(isVitest
      ? [
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
        ]
      : [cloudflare({ viteEnvironment: { name: "ssr" } })]),
    tailwindcss(),
    reactRouter(),
  ],
  preview: {
    port: devPort,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: devPort,
    strictPort: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup/apply-d1-migrations.ts"],
  },
});
