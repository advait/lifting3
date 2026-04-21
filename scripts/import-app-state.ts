import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { getScriptArgs } from "./cli-args.ts";

import {
  formatAppStateFileError,
  formatAppStateSummary,
  loadValidatedAppStateFile,
} from "./app-state-json-helpers.ts";
import {
  getD1NamespaceLabel,
  getD1TableColumnNames,
  parseD1Namespace,
  runWranglerSqlFile,
} from "./d1-cli.ts";
import {
  buildAppStateImportSql,
  summarizeAppState,
} from "../app/features/import-export/app-state.ts";

function printUsage() {
  process.stdout.write(
    [
      "Usage: pnpm import:app-state -- --namespace <local|dev|prod> [--dry-run] <app-state-json>",
      "",
      "Examples:",
      "  pnpm import:app-state -- --namespace local --dry-run ./tmp/app-state.json",
      "  pnpm import:app-state -- --namespace prod ./backups/app-state.json",
      "",
    ].join("\n"),
  );
}

function assertNewExerciseSetSchema(namespace: ReturnType<typeof parseD1Namespace>) {
  const columnNames = new Set(getD1TableColumnNames(namespace, "exercise_sets"));

  if (columnNames.has("reps")) {
    return;
  }

  throw new Error(
    `App-state import into the ${getD1NamespaceLabel(namespace)} requires the migrated exercise_sets schema with a "reps" column. Apply the single-reps migration before importing.`,
  );
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

    if (positionals.length !== 1) {
      printUsage();
      throw new Error("Pass exactly one app-state JSON file.");
    }

    const namespace = parseD1Namespace(values.namespace);
    const { file, filePath } = await loadValidatedAppStateFile(positionals[0]);
    const summary = summarizeAppState(file);

    if (values["dry-run"]) {
      process.stdout.write(
        [
          `Dry run complete for ${filePath}.`,
          `Target: ${getD1NamespaceLabel(namespace)}`,
          formatAppStateSummary(summary),
          "",
        ].join("\n"),
      );
      return;
    }

    assertNewExerciseSetSchema(namespace);

    const sql = buildAppStateImportSql(file);
    const tempDirectory = mkdtempSync(join(tmpdir(), "lifting3-app-state-import-"));
    const sqlFilePath = join(tempDirectory, "import-app-state.sql");

    writeFileSync(sqlFilePath, sql, "utf8");

    try {
      runWranglerSqlFile(namespace, sqlFilePath);
    } finally {
      rmSync(tempDirectory, { force: true, recursive: true });
    }

    process.stdout.write(
      [
        `Imported app state from ${filePath} into the ${getD1NamespaceLabel(namespace)}.`,
        formatAppStateSummary(summary),
        "",
      ].join("\n"),
    );
  } catch (error) {
    console.error(formatAppStateFileError(error));
    process.exitCode = 1;
  }
}

await main();
