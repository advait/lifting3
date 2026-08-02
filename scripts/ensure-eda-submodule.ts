import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Source archives omit both Git metadata and submodule contents. Keep this in
// sync with the effect-durable-agent gitlink when updating the submodule.
const EDA_ARCHIVE_REVISION = "16ed5f4a3f7049fb84a150d6266534eee6725305";
const EDA_REPOSITORY_URL = "https://github.com/advait/effect-durable-agent.git";
const EDA_SUBMODULE_PATH = "effect-durable-agent";
const repositoryRoot = resolve(import.meta.dirname, "..");
const edaDirectory = resolve(repositoryRoot, EDA_SUBMODULE_PATH);
const edaManifestPath = resolve(edaDirectory, "package.json");

const runGit = (args: readonly string[], cwd: string, operation: string): void => {
  const result = spawnSync("git", args, { cwd, stdio: "inherit" });

  if (result.error) {
    throw new Error(`Could not ${operation}.`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(`Git exited with status ${result.status ?? "unknown"} while ${operation}.`);
  }
};

const initializeFromSourceArchive = (): void => {
  mkdirSync(edaDirectory, { recursive: true });
  if (readdirSync(edaDirectory).length > 0) {
    throw new Error(
      "Cannot initialize effect-durable-agent from a source archive because its directory is not empty.",
    );
  }

  runGit(["init"], edaDirectory, "initializing the effect-durable-agent repository");
  runGit(
    ["remote", "add", "origin", EDA_REPOSITORY_URL],
    edaDirectory,
    "configuring the effect-durable-agent repository",
  );
  runGit(
    ["fetch", "--depth", "1", "origin", EDA_ARCHIVE_REVISION],
    edaDirectory,
    "fetching the pinned effect-durable-agent revision",
  );
  runGit(
    ["checkout", "--detach", "FETCH_HEAD"],
    edaDirectory,
    "checking out the pinned effect-durable-agent revision",
  );
};

if (!existsSync(edaManifestPath)) {
  if (existsSync(resolve(repositoryRoot, ".git"))) {
    runGit(
      ["submodule", "update", "--init", "--recursive", "--", EDA_SUBMODULE_PATH],
      repositoryRoot,
      "initializing the effect-durable-agent submodule",
    );
  } else {
    initializeFromSourceArchive();
  }

  if (!existsSync(edaManifestPath)) {
    throw new Error("effect-durable-agent was initialized without a package.json.");
  }
}
