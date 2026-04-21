import type {
  AppSettingRow,
  ExerciseSetRow,
  WorkoutExerciseRow,
  WorkoutRow,
} from "../../lib/.server/db/schema.ts";
import {
  appStateFileSchema,
  appStateImportSourceSchema,
  appStatePayloadSchema,
  type AppStateFile,
  type AppStateImportSource,
  type AppStatePayload,
} from "./file.ts";

export interface AppStateExportRows {
  readonly settings: readonly AppSettingRow[];
  readonly workoutExercises: readonly WorkoutExerciseRow[];
  readonly workoutRows: readonly WorkoutRow[];
  readonly exerciseSetRows: readonly ExerciseSetRow[];
}

export interface AppStateSummary {
  readonly exerciseCount: number;
  readonly hasUserProfile: boolean;
  readonly setCount: number;
  readonly workoutCount: number;
}

function parseImportSource(workoutRow: WorkoutRow): AppStateImportSource | null {
  const hasImportSource =
    workoutRow.importSourceSystem != null ||
    workoutRow.importSourceWorkoutId != null ||
    workoutRow.importSourceMetadataJson != null;

  if (!hasImportSource) {
    return null;
  }

  if (workoutRow.importSourceSystem == null) {
    throw new Error(`Imported workout "${workoutRow.id}" is missing import_source_system.`);
  }

  const rawMetadata = workoutRow.importSourceMetadataJson ?? "{}";
  const parsedMetadata = JSON.parse(rawMetadata) as unknown;

  return appStateImportSourceSchema.parse({
    metadata: parsedMetadata,
    system: workoutRow.importSourceSystem,
    workout_id: workoutRow.importSourceWorkoutId,
  });
}

function groupSetsByExerciseId(exerciseSetRows: readonly ExerciseSetRow[]) {
  const setsByExerciseId = new Map<string, ExerciseSetRow[]>();

  for (const setRow of exerciseSetRows) {
    const sets = setsByExerciseId.get(setRow.exerciseId) ?? [];

    sets.push(setRow);
    setsByExerciseId.set(setRow.exerciseId, sets);
  }

  return setsByExerciseId;
}

function groupExercisesByWorkoutId(
  workoutExercises: readonly WorkoutExerciseRow[],
  exerciseSetRows: readonly ExerciseSetRow[],
) {
  const setsByExerciseId = groupSetsByExerciseId(exerciseSetRows);
  const exercisesByWorkoutId = new Map<string, AppStatePayload["workouts"][number]["exercises"]>();

  for (const exerciseRow of workoutExercises) {
    const sets = (setsByExerciseId.get(exerciseRow.id) ?? [])
      .slice()
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((setRow) => ({
        actual_rpe: setRow.actualRpe,
        actual_weight_lbs: setRow.actualWeightLbs,
        confirmed_at: setRow.confirmedAt,
        designation: setRow.designation,
        id: setRow.id,
        order_index: setRow.orderIndex,
        planned_rpe: setRow.plannedRpe,
        planned_weight_lbs: setRow.plannedWeightLbs,
        reps: setRow.reps,
      }));
    const exercises = exercisesByWorkoutId.get(exerciseRow.workoutId) ?? [];

    exercises.push({
      coach_notes: exerciseRow.coachNotes,
      exercise_schema_id: exerciseRow.exerciseSchemaId,
      id: exerciseRow.id,
      rest_seconds: exerciseRow.restSeconds,
      order_index: exerciseRow.orderIndex,
      sets,
      source_exercise_name: exerciseRow.sourceExerciseName,
      status: exerciseRow.status,
      user_notes: exerciseRow.userNotes,
    });
    exercisesByWorkoutId.set(exerciseRow.workoutId, exercises);
  }

  return exercisesByWorkoutId;
}

function buildAppStateSettings(settings: readonly AppSettingRow[]) {
  let userProfile: AppStatePayload["settings"]["user_profile"] = null;

  for (const setting of settings) {
    userProfile = {
      created_at: setting.createdAt,
      updated_at: setting.updatedAt,
      value: setting.value,
    };
  }

  return { user_profile: userProfile };
}

export function buildAppStatePayload(rows: AppStateExportRows): AppStatePayload {
  const exercisesByWorkoutId = groupExercisesByWorkoutId(
    rows.workoutExercises,
    rows.exerciseSetRows,
  );
  const workouts = rows.workoutRows
    .slice()
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.updatedAt.localeCompare(right.updatedAt) ||
        left.id.localeCompare(right.id),
    )
    .map((workoutRow) => ({
      coach_notes: workoutRow.coachNotes,
      completed_at: workoutRow.completedAt,
      created_at: workoutRow.createdAt,
      date: workoutRow.date,
      exercises: (exercisesByWorkoutId.get(workoutRow.id) ?? [])
        .slice()
        .sort((left, right) => left.order_index - right.order_index),
      id: workoutRow.id,
      import_source: parseImportSource(workoutRow),
      source: workoutRow.source,
      started_at: workoutRow.startedAt,
      status: workoutRow.status,
      title: workoutRow.title,
      updated_at: workoutRow.updatedAt,
      user_notes: workoutRow.userNotes,
      version: workoutRow.version,
    }));

  return appStatePayloadSchema.parse({
    settings: buildAppStateSettings(rows.settings),
    workouts,
  });
}

export function buildAppStateFile(rows: AppStateExportRows, exportedAt: string): AppStateFile {
  return appStateFileSchema.parse({
    app_state: buildAppStatePayload(rows),
    exported_at: exportedAt,
    format: "lifting3.app_state",
    schema_version: 1,
  });
}

function sqlValue(value: number | string | null) {
  if (value === null) {
    return "NULL";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot serialize non-finite number: ${value}`);
    }

    return String(value);
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function createInsertStatement(
  tableName: string,
  columns: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<number | string | null>>,
) {
  if (rows.length === 0) {
    return "";
  }

  const renderedRows = rows.map((row) => `  (${row.map((value) => sqlValue(value)).join(", ")})`);

  return [
    `INSERT INTO ${tableName} (${columns.join(", ")})`,
    "VALUES",
    renderedRows.join(",\n"),
    ";",
  ].join("\n");
}

function chunkValues<T>(values: readonly T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function createInsertStatements(
  tableName: string,
  columns: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<number | string | null>>,
  chunkSize: number,
) {
  return chunkValues(rows, chunkSize)
    .map((chunk) => createInsertStatement(tableName, columns, chunk))
    .filter((statement) => statement.length > 0);
}

export function summarizeAppState(file: AppStateFile | AppStatePayload): AppStateSummary {
  const payload = "app_state" in file ? file.app_state : file;

  return {
    exerciseCount: payload.workouts.reduce((count, workout) => count + workout.exercises.length, 0),
    hasUserProfile: payload.settings.user_profile != null,
    setCount: payload.workouts.reduce(
      (count, workout) =>
        count +
        workout.exercises.reduce(
          (exerciseCount, exercise) => exerciseCount + exercise.sets.length,
          0,
        ),
      0,
    ),
    workoutCount: payload.workouts.length,
  };
}

export function buildAppStateImportSql(file: AppStateFile) {
  const workoutRows = file.app_state.workouts.map(
    (workout) =>
      [
        workout.id,
        workout.title,
        workout.date,
        workout.status,
        workout.source,
        workout.version,
        workout.started_at,
        workout.completed_at,
        workout.created_at,
        workout.updated_at,
        workout.user_notes,
        workout.coach_notes,
        workout.import_source?.system ?? null,
        workout.import_source?.workout_id ?? null,
        workout.import_source ? JSON.stringify(workout.import_source.metadata) : null,
      ] satisfies ReadonlyArray<number | string | null>,
  );

  const exerciseRows = file.app_state.workouts.flatMap((workout) =>
    workout.exercises.map(
      (exercise) =>
        [
          exercise.id,
          workout.id,
          exercise.order_index,
          exercise.exercise_schema_id,
          exercise.status,
          exercise.rest_seconds ?? null,
          exercise.source_exercise_name,
          exercise.user_notes,
          exercise.coach_notes,
        ] satisfies ReadonlyArray<number | string | null>,
    ),
  );

  const setRows = file.app_state.workouts.flatMap((workout) =>
    workout.exercises.flatMap((exercise) =>
      exercise.sets.map(
        (set) =>
          [
            set.id,
            exercise.id,
            set.order_index,
            set.designation,
            set.reps,
            set.planned_weight_lbs,
            set.planned_rpe,
            set.actual_weight_lbs,
            set.actual_rpe,
            set.confirmed_at,
          ] satisfies ReadonlyArray<number | string | null>,
      ),
    ),
  );

  const settingRows = file.app_state.settings.user_profile
    ? [
        [
          "user_profile",
          file.app_state.settings.user_profile.value,
          file.app_state.settings.user_profile.created_at,
          file.app_state.settings.user_profile.updated_at,
        ] satisfies ReadonlyArray<number | string | null>,
      ]
    : [];

  return [
    "PRAGMA foreign_keys = ON;",
    "BEGIN TRANSACTION;",
    "DELETE FROM app_settings;",
    "DELETE FROM workouts;",
    ...createInsertStatements(
      "workouts",
      [
        "id",
        "title",
        "date",
        "status",
        "source",
        "version",
        "started_at",
        "completed_at",
        "created_at",
        "updated_at",
        "user_notes",
        "coach_notes",
        "import_source_system",
        "import_source_workout_id",
        "import_source_metadata_json",
      ],
      workoutRows,
      50,
    ),
    ...createInsertStatements(
      "workout_exercises",
      [
        "id",
        "workout_id",
        "order_index",
        "exercise_schema_id",
        "status",
        "rest_seconds",
        "source_exercise_name",
        "user_notes",
        "coach_notes",
      ],
      exerciseRows,
      100,
    ),
    ...createInsertStatements(
      "exercise_sets",
      [
        "id",
        "exercise_id",
        "order_index",
        "designation",
        "reps",
        "planned_weight_lbs",
        "planned_rpe",
        "actual_weight_lbs",
        "actual_rpe",
        "confirmed_at",
      ],
      setRows,
      100,
    ),
    ...createInsertStatements(
      "app_settings",
      ["key", "value", "created_at", "updated_at"],
      settingRows,
      10,
    ),
    "COMMIT;",
    "",
  ]
    .filter((statement) => statement.length > 0)
    .join("\n\n");
}
