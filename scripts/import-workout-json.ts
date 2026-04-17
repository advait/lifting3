import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  buildExistingWorkoutIdsQuery,
  buildWorkoutImportSql,
  createImportedWorkoutRows,
  formatWorkoutFileError,
  loadValidatedWorkoutFiles,
  summarizeWorkoutImport,
} from "./workout-json-helpers.ts";

type ImportNamespace = "dev" | "prod";

const WORKOUT_ID_QUERY_BATCH_SIZE = 100;

function printUsage() {
  process.stdout.write(
    [
      "Usage: pnpm import:workout-json -- --namespace <dev|prod> [--dry-run] <file-or-directory> [more-paths...]",
      "",
      "Examples:",
      "  pnpm import:workout-json -- --namespace dev --dry-run ./tmp/workouts",
      "  pnpm import:workout-json -- --namespace prod ./exports/*.json",
      "",
      "Namespace mapping:",
      "  dev  -> remote preview D1 database",
      "  prod -> remote primary D1 database",
      "",
    ].join("\n"),
  );
}

function getPackageManagerExecutable() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function getWranglerTargetFlags(namespace: ImportNamespace) {
  return namespace === "dev" ? ["--remote", "--preview"] : ["--remote"];
}

function getNamespaceLabel(namespace: ImportNamespace) {
  return namespace === "dev" ? "dev preview namespace" : "prod namespace";
}

function chunkValues<T>(values: readonly T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function parseNamespace(value: string | undefined): ImportNamespace {
  if (value === "dev" || value === "prod") {
    return value;
  }

  throw new Error("Pass --namespace dev or --namespace prod.");
}

function runWranglerCommand(args: readonly string[], options?: { captureStdout?: boolean }) {
  const result = spawnSync(getPackageManagerExecutable(), ["wrangler", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options?.captureStdout === true ? ["inherit", "pipe", "inherit"] : "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`Wrangler failed with exit code ${result.status ?? "unknown"}.`);
  }

  return result.stdout ?? "";
}

function runWranglerImport(namespace: ImportNamespace, sqlFilePath: string) {
  runWranglerCommand([
    "d1",
    "execute",
    "DB",
    ...getWranglerTargetFlags(namespace),
    "--yes",
    "--file",
    sqlFilePath,
  ]);
}

function runWranglerJsonQuery(namespace: ImportNamespace, query: string) {
  const stdout = runWranglerCommand(
    ["d1", "execute", "DB", ...getWranglerTargetFlags(namespace), "--json", "--command", query],
    { captureStdout: true },
  );

  const parsed = JSON.parse(stdout) as Array<{
    readonly results?: ReadonlyArray<Record<string, unknown>>;
  }>;

  return parsed.flatMap((entry) => entry.results ?? []);
}

function findExistingWorkoutIds(namespace: ImportNamespace, workoutIds: readonly string[]) {
  const existingWorkoutIds = new Set<string>();

  for (const workoutIdBatch of chunkValues(workoutIds, WORKOUT_ID_QUERY_BATCH_SIZE)) {
    const query = buildExistingWorkoutIdsQuery(workoutIdBatch);

    if (query.length === 0) {
      continue;
    }

    for (const row of runWranglerJsonQuery(namespace, query)) {
      const workoutId = row.id;

      if (typeof workoutId === "string") {
        existingWorkoutIds.add(workoutId);
      }
    }
  }

  return [...existingWorkoutIds].sort();
}

async function main() {
  try {
    const { positionals, values } = parseArgs({
      allowPositionals: true,
      options: {
        "dry-run": {
          default: false,
          type: "boolean",
        },
        help: {
          short: "h",
          type: "boolean",
        },
        namespace: {
          type: "string",
        },
      },
      strict: true,
    });

    if (values.help) {
      printUsage();
      return;
    }

    if (positionals.length === 0) {
      printUsage();
      throw new Error("Pass at least one workout JSON path.");
    }

    const namespace = parseNamespace(values.namespace);
    const files = await loadValidatedWorkoutFiles(positionals);

    if (files.length === 0) {
      throw new Error(`No JSON files found in ${positionals.join(", ")}.`);
    }

    const importedRows = createImportedWorkoutRows(files, new Date().toISOString());
    const summary = summarizeWorkoutImport(importedRows);
    const existingWorkoutIds = findExistingWorkoutIds(
      namespace,
      importedRows.map((row) => row.workoutId),
    );

    if (existingWorkoutIds.length > 0) {
      throw new Error(
        [
          `The ${getNamespaceLabel(namespace)} already contains ${existingWorkoutIds.length} workout(s) with matching ids.`,
          `Existing ids: ${existingWorkoutIds.join(", ")}`,
        ].join("\n"),
      );
    }

    if (values["dry-run"]) {
      process.stdout.write(
        [
          `Dry run complete for ${summary.workoutCount} workout(s).`,
          `Target: ${getNamespaceLabel(namespace)}`,
          `Files: ${summary.fileCount}, exercises: ${summary.exerciseCount}, sets: ${summary.setCount}`,
          "",
        ].join("\n"),
      );
      return;
    }

    const sql = buildWorkoutImportSql(importedRows);
    const tempDirectory = mkdtempSync(join(tmpdir(), "lifting3-import-"));
    const sqlFilePath = join(tempDirectory, "import-workouts.sql");

    writeFileSync(sqlFilePath, sql, "utf8");

    try {
      runWranglerImport(namespace, sqlFilePath);
    } finally {
      rmSync(tempDirectory, { force: true, recursive: true });
    }

    process.stdout.write(
      [
        `Imported ${summary.workoutCount} workout(s) into the ${getNamespaceLabel(namespace)}.`,
        `Exercises: ${summary.exerciseCount}, sets: ${summary.setCount}`,
        "",
      ].join("\n"),
    );
  } catch (error) {
    console.error(formatWorkoutFileError(error));
    process.exitCode = 1;
  }
}

await main();
