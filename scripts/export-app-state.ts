import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { getScriptArgs } from "./cli-args.ts";

import { z } from "zod";

import {
  buildAppStateFile,
  summarizeAppState,
  type AppStateExportRows,
} from "../app/features/import-export/app-state.ts";
import { EXERCISE_SCHEMA_IDS } from "../app/features/exercises/schema.ts";
import { APP_SETTING_KEYS } from "../app/features/settings/contracts.ts";
import { SET_KINDS, WORKOUT_STATUSES } from "../app/features/workouts/file.ts";
import { getD1NamespaceLabel, parseD1Namespace, runWranglerJsonQuery } from "./d1-cli.ts";

const WORKOUT_SOURCES = ["manual", "imported", "agent"] as const;
const EXERCISE_STATUSES = ["planned", "active", "completed", "skipped", "replaced"] as const;

const nullableStringSchema = z.string().nullable();
const nullableNumberSchema = z.number().nullable();
const nonNegativeIntegerSchema = z.number().int().nonnegative();

const appSettingRowSchema = z.strictObject({
  createdAt: z.iso.datetime({ offset: true }),
  key: z.enum(APP_SETTING_KEYS),
  updatedAt: z.iso.datetime({ offset: true }),
  value: z.string(),
});

const workoutRowSchema = z.strictObject({
  coachNotes: nullableStringSchema,
  completedAt: nullableStringSchema,
  createdAt: z.iso.datetime({ offset: true }),
  date: z.iso.datetime({ offset: true }),
  id: z.string().min(1),
  importSourceMetadataJson: nullableStringSchema,
  importSourceSystem: nullableStringSchema,
  importSourceWorkoutId: nullableStringSchema,
  source: z.enum(WORKOUT_SOURCES),
  startedAt: nullableStringSchema,
  status: z.enum(WORKOUT_STATUSES),
  title: z.string().min(1),
  updatedAt: z.iso.datetime({ offset: true }),
  userNotes: nullableStringSchema,
  version: nonNegativeIntegerSchema,
});

const workoutExerciseRowSchema = z.strictObject({
  coachNotes: nullableStringSchema,
  exerciseSchemaId: z.enum(EXERCISE_SCHEMA_IDS),
  id: z.string().min(1),
  orderIndex: nonNegativeIntegerSchema,
  sourceExerciseName: nullableStringSchema,
  status: z.enum(EXERCISE_STATUSES),
  userNotes: nullableStringSchema,
  workoutId: z.string().min(1),
});

const exerciseSetRowSchema = z.strictObject({
  actualRpe: nullableNumberSchema,
  actualWeightLbs: nullableNumberSchema,
  confirmedAt: nullableStringSchema,
  designation: z.enum(SET_KINDS),
  exerciseId: z.string().min(1),
  id: z.string().min(1),
  orderIndex: nonNegativeIntegerSchema,
  plannedRpe: nullableNumberSchema,
  plannedWeightLbs: nullableNumberSchema,
  reps: nonNegativeIntegerSchema.nullable(),
});

function printUsage() {
  process.stdout.write(
    [
      "Usage: pnpm export:app-state -- --namespace <local|dev|prod> <output-file-or->",
      "",
      "Examples:",
      "  pnpm export:app-state -- --namespace local ./tmp/app-state.json",
      "  pnpm export:app-state -- --namespace dev -",
      "",
    ].join("\n"),
  );
}

function loadRows<T>(schema: z.ZodType<T>, rows: readonly Record<string, unknown>[]) {
  return z.array(schema).parse(rows);
}

function loadExportRows(namespace: ReturnType<typeof parseD1Namespace>): AppStateExportRows {
  const settings = loadRows(
    appSettingRowSchema,
    runWranglerJsonQuery(
      namespace,
      [
        "SELECT key, value, created_at AS createdAt, updated_at AS updatedAt",
        "FROM app_settings",
        "ORDER BY key;",
      ].join("\n"),
    ),
  );
  const workoutRows = loadRows(
    workoutRowSchema,
    runWranglerJsonQuery(
      namespace,
      [
        "SELECT id, title, date, status, source, version,",
        "  started_at AS startedAt, completed_at AS completedAt,",
        "  created_at AS createdAt, updated_at AS updatedAt,",
        "  user_notes AS userNotes, coach_notes AS coachNotes,",
        "  import_source_system AS importSourceSystem,",
        "  import_source_workout_id AS importSourceWorkoutId,",
        "  import_source_metadata_json AS importSourceMetadataJson",
        "FROM workouts",
        "ORDER BY date, updated_at, id;",
      ].join("\n"),
    ),
  );
  const workoutExercises = loadRows(
    workoutExerciseRowSchema,
    runWranglerJsonQuery(
      namespace,
      [
        "SELECT id, workout_id AS workoutId, order_index AS orderIndex,",
        "  exercise_schema_id AS exerciseSchemaId, status,",
        "  source_exercise_name AS sourceExerciseName,",
        "  user_notes AS userNotes, coach_notes AS coachNotes",
        "FROM workout_exercises",
        "ORDER BY workout_id, order_index, id;",
      ].join("\n"),
    ),
  );
  const exerciseSetRows = loadRows(
    exerciseSetRowSchema,
    runWranglerJsonQuery(
      namespace,
      [
        "SELECT id, exercise_id AS exerciseId, order_index AS orderIndex, designation,",
        "  reps AS reps, planned_weight_lbs AS plannedWeightLbs, planned_rpe AS plannedRpe,",
        "  actual_weight_lbs AS actualWeightLbs, actual_rpe AS actualRpe,",
        "  confirmed_at AS confirmedAt",
        "FROM exercise_sets",
        "ORDER BY exercise_id, order_index, id;",
      ].join("\n"),
    ),
  );

  return {
    exerciseSetRows,
    settings,
    workoutExercises,
    workoutRows,
  } satisfies AppStateExportRows;
}

async function main() {
  try {
    const { positionals, values } = parseArgs({
      args: getScriptArgs(),
      allowPositionals: true,
      options: {
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
      throw new Error("Pass exactly one output path or - for stdout.");
    }

    const namespace = parseD1Namespace(values.namespace);
    const rows = loadExportRows(namespace);
    const exportedAt = new Date().toISOString();
    const file = buildAppStateFile(rows, exportedAt);
    const json = `${JSON.stringify(file, null, 2)}\n`;
    const summary = summarizeAppState(file);
    const outputPath = positionals[0];

    if (outputPath === "-") {
      process.stdout.write(json);
      return;
    }

    const resolvedOutputPath = resolve(process.cwd(), outputPath);

    mkdirSync(dirname(resolvedOutputPath), { recursive: true });
    writeFileSync(resolvedOutputPath, json, "utf8");
    process.stdout.write(
      [
        `Exported app state from the ${getD1NamespaceLabel(namespace)}.`,
        `Output: ${resolvedOutputPath}`,
        `Workouts: ${summary.workoutCount}, exercises: ${summary.exerciseCount}, sets: ${summary.setCount}`,
        `User profile: ${summary.hasUserProfile ? "present" : "absent"}`,
        "",
      ].join("\n"),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  }
}

await main();
