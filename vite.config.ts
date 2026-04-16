import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

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
  resolve: {
    tsconfigPaths: true,
  },
});
