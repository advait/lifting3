import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { getScriptArgs } from "./cli-args.ts";

import {
  buildExistingWorkoutIdsQuery,
  buildWorkoutImportSql,
  createImportedWorkoutRows,
  formatWorkoutFileError,
  loadValidatedWorkoutFiles,
  summarizeWorkoutImport,
} from "./workout-json-helpers.ts";
import {
  getD1NamespaceLabel,
  parseD1Namespace,
  runWranglerJsonQuery,
  runWranglerSqlFile,
  type D1Namespace,
} from "./d1-cli.ts";

const WORKOUT_ID_QUERY_BATCH_SIZE = 100;

function printUsage() {
  process.stdout.write(
    [
      "Usage: pnpm import:workout-json -- --namespace <local|dev|prod> [--dry-run] <file-or-directory> [more-paths...]",
      "",
      "Examples:",
      "  pnpm import:workout-json -- --namespace local --dry-run ./tmp/workouts",
      "  pnpm import:workout-json -- --namespace dev ./exports/*.json",
      "",
    ].join("\n"),
  );
}

function chunkValues<T>(values: readonly T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function findExistingWorkoutIds(namespace: D1Namespace, workoutIds: readonly string[]) {
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
      args: getScriptArgs(),
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

    const namespace = parseD1Namespace(values.namespace);
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
          `The ${getD1NamespaceLabel(namespace)} already contains ${existingWorkoutIds.length} workout(s) with matching ids.`,
          `Existing ids: ${existingWorkoutIds.join(", ")}`,
        ].join("\n"),
      );
    }

    if (values["dry-run"]) {
      process.stdout.write(
        [
          `Dry run complete for ${summary.workoutCount} workout(s).`,
          `Target: ${getD1NamespaceLabel(namespace)}`,
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
      runWranglerSqlFile(namespace, sqlFilePath);
    } finally {
      rmSync(tempDirectory, { force: true, recursive: true });
    }

    process.stdout.write(
      [
        `Imported ${summary.workoutCount} workout(s) into the ${getD1NamespaceLabel(namespace)}.`,
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
