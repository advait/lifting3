import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite-plus";

const DEFAULT_DEV_PORT = 43_110;
const DEV_PORT_ENV_KEY = "LIFTING3_DEV_PORT";

function getDevPort(mode: string) {
  const env = loadEnv(mode, process.cwd(), "");
  const parsedPort = Number(env[DEV_PORT_ENV_KEY]);

  if (
    Number.isInteger(parsedPort) &&
    parsedPort >= 1024 &&
    parsedPort <= 65_535
  ) {
    return parsedPort;
  }

  return DEFAULT_DEV_PORT;
}

export default defineConfig(({ mode }) => {
  const devPort = getDevPort(mode);

  return {
    fmt: {},
    lint: { options: { typeAware: true, typeCheck: true } },
    plugins: [
      cloudflare({ viteEnvironment: { name: "ssr" } }),
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
  };
});
