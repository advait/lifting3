import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const EDA_SUBMODULE_PATH = "effect-durable-agent";
const repositoryRoot = resolve(import.meta.dirname, "..");
const edaManifestPath = resolve(repositoryRoot, EDA_SUBMODULE_PATH, "package.json");

if (!existsSync(edaManifestPath)) {
  const result = spawnSync(
    "git",
    ["submodule", "update", "--init", "--recursive", "--", EDA_SUBMODULE_PATH],
    {
      cwd: repositoryRoot,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw new Error("Could not initialize the effect-durable-agent submodule.", {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    throw new Error(
      `Git exited with status ${result.status ?? "unknown"} while initializing effect-durable-agent.`,
    );
  }
  if (!existsSync(edaManifestPath)) {
    throw new Error("effect-durable-agent was initialized without a package.json.");
  }
}
