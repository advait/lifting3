import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

const DEFAULT_DEV_PORT = 43_110;
const PORT_ENV_KEY = "PORT";

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
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), tailwindcss(), reactRouter()],
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
});
