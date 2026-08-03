import { defineConfig } from "vite-plus";

/** Browser-component tests run in Node because workerd does not implement node:vm. */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: [
      "test/coach/app-shell.test.ts",
      "test/coach/coach-sheet.test.ts",
      "test/workouts/exercise-rest-timer.test.tsx",
    ],
    setupFiles: ["./test/setup/react-dom.ts"],
  },
});
