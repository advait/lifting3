import {
  workoutDetailWorkoutSchema,
  workoutExerciseStateSchema,
  workoutSetSchema,
  type WorkoutDetailWorkout,
  type WorkoutExerciseState,
  type WorkoutSet,
} from "./contracts.ts";
import { DEFAULT_EXERCISE_REST_SECONDS } from "./rest-timer.ts";
import type { WorkoutFileExercise, WorkoutFile, WorkoutFileSet } from "./file.ts";
import type {
  NewExerciseSetRow,
  NewWorkoutExerciseRow,
  NewWorkoutRow,
} from "../../lib/.server/db/schema.ts";

const EMPTY_SET_LOAD_VALUES = {
  rpe: null,
  weightLbs: null,
} as const satisfies WorkoutSet["actual"];

const IMPORT_WORKOUT_COLUMNS = [
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
] as const;

const IMPORT_EXERCISE_COLUMNS = [
  "id",
  "workout_id",
  "order_index",
  "exercise_schema_id",
  "status",
  "rest_seconds",
  "source_exercise_name",
  "user_notes",
  "coach_notes",
] as const;

const IMPORT_SET_COLUMNS = [
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
] as const;

export interface ValidatedWorkoutFile {
  readonly file: WorkoutFile;
  readonly filePath: string;
}

interface ImportedExerciseRecord {
  readonly sourceExerciseName: string | null;
  readonly state: WorkoutExerciseState;
}

interface ImportedWorkoutSourceRecord {
  readonly metadataJson: string;
  readonly system: string;
  readonly workoutId: string | null;
}

export interface ImportedWorkoutRecord {
  readonly exercises: readonly ImportedExerciseRecord[];
  readonly filePath: string;
  readonly importSource: ImportedWorkoutSourceRecord;
  readonly workout: WorkoutDetailWorkout;
}

export interface ImportedWorkoutRows {
  readonly exerciseRows: readonly NewWorkoutExerciseRow[];
  readonly filePath: string;
  readonly setRows: readonly NewExerciseSetRow[];
  readonly workoutId: string;
  readonly workoutRow: NewWorkoutRow;
}

export interface WorkoutImportSummary {
  readonly exerciseCount: number;
  readonly fileCount: number;
  readonly setCount: number;
  readonly workoutCount: number;
}

export function assertUniqueWorkoutIds(files: readonly ValidatedWorkoutFile[]) {
  const filePathByWorkoutId = new Map<string, string>();

  for (const file of files) {
    const existingFilePath = filePathByWorkoutId.get(file.file.workout.id);

    if (existingFilePath !== undefined) {
      throw new Error(
        `Duplicate workout id "${file.file.workout.id}" in ${existingFilePath} and ${file.filePath}.`,
      );
    }

    filePathByWorkoutId.set(file.file.workout.id, file.filePath);
  }
}

function mapSetLoadValues(set: WorkoutFileSet): WorkoutSet["planned"] {
  return {
    rpe: set.rpe ?? null,
    weightLbs: set.weight_lbs ?? null,
  };
}

function createImportedExerciseId(workoutId: string, orderIndex: number, sourceExerciseId: string) {
  return `${workoutId}::exercise:${orderIndex}:${sourceExerciseId}`;
}

function createImportedSetId(
  workoutId: string,
  exerciseOrderIndex: number,
  sourceExerciseId: string,
  setOrderIndex: number,
  sourceSetId: string,
) {
  return `${workoutId}::set:${exerciseOrderIndex}:${setOrderIndex}:${sourceExerciseId}:${sourceSetId}`;
}

function isSetConfirmed(set: WorkoutSet) {
  return set.confirmedAt != null;
}

function getExerciseCompletionStatus(sets: readonly WorkoutSet[]): WorkoutExerciseState["status"] {
  const confirmedCount = sets.filter(isSetConfirmed).length;
  const unconfirmedCount = sets.length - confirmedCount;

  if (unconfirmedCount > 0 && confirmedCount > 0) {
    return "active";
  }

  if (unconfirmedCount > 0) {
    return "planned";
  }

  if (confirmedCount > 0) {
    return "completed";
  }

  return "planned";
}

function createImportedSet(
  workoutId: string,
  exerciseOrderIndex: number,
  sourceExerciseId: string,
  setOrderIndex: number,
  set: WorkoutFileSet,
) {
  const setLoadValues = mapSetLoadValues(set);

  return workoutSetSchema.parse({
    actual: set.confirmed_at != null ? setLoadValues : EMPTY_SET_LOAD_VALUES,
    confirmedAt: set.confirmed_at ?? null,
    designation: set.set_kind,
    id: createImportedSetId(workoutId, exerciseOrderIndex, sourceExerciseId, setOrderIndex, set.id),
    orderIndex: setOrderIndex,
    planned: setLoadValues,
    previous: null,
    personalRecord: null,
    reps: set.reps ?? null,
  });
}

function createImportedExercise(
  workoutId: string,
  exerciseOrderIndex: number,
  exercise: WorkoutFileExercise,
): ImportedExerciseRecord {
  const sets = exercise.sets.map((set, setOrderIndex) =>
    createImportedSet(workoutId, exerciseOrderIndex, exercise.id, setOrderIndex, set),
  );

  return {
    sourceExerciseName: exercise.source_exercise_name ?? null,
    state: workoutExerciseStateSchema.parse({
      coachNotes: exercise.coach_notes ?? null,
      exerciseSchemaId: exercise.exercise_schema_id,
      id: createImportedExerciseId(workoutId, exerciseOrderIndex, exercise.id),
      orderIndex: exerciseOrderIndex,
      restSeconds: exercise.rest_seconds,
      sets,
      status: getExerciseCompletionStatus(sets),
      userNotes: exercise.user_notes ?? null,
    }),
  };
}

export function buildImportedWorkoutRecord(
  workoutFile: ValidatedWorkoutFile,
  importedAt: string,
): ImportedWorkoutRecord {
  const { file, filePath } = workoutFile;
  const exercises = file.workout.exercises.map((exercise, orderIndex) =>
    createImportedExercise(file.workout.id, orderIndex, exercise),
  );

  return {
    exercises,
    filePath,
    importSource: {
      metadataJson: JSON.stringify(file.workout.source.metadata),
      system: file.workout.source.system,
      workoutId: file.workout.source.workout_id ?? null,
    },
    workout: workoutDetailWorkoutSchema.parse({
      coachNotes: file.workout.coach_notes ?? null,
      completedAt: file.workout.completed_at ?? null,
      createdAt: file.exported_at ?? importedAt,
      date: file.workout.date,
      id: file.workout.id,
      source: "imported",
      startedAt: file.workout.started_at ?? null,
      status: file.workout.status,
      title: file.workout.title,
      updatedAt: file.exported_at ?? importedAt,
      userNotes: file.workout.user_notes ?? null,
      version: 1,
    }),
  };
}

export function toImportedWorkoutRows(record: ImportedWorkoutRecord): ImportedWorkoutRows {
  return {
    exerciseRows: record.exercises.map(({ sourceExerciseName, state }) => ({
      coachNotes: state.coachNotes,
      exerciseSchemaId: state.exerciseSchemaId,
      id: state.id,
      orderIndex: state.orderIndex,
      restSeconds: state.restSeconds,
      sourceExerciseName,
      status: state.status,
      userNotes: state.userNotes,
      workoutId: record.workout.id,
    })),
    filePath: record.filePath,
    setRows: record.exercises.flatMap(({ state }) =>
      state.sets.map((set) => ({
        actualRpe: set.actual.rpe,
        actualWeightLbs: set.actual.weightLbs,
        confirmedAt: set.confirmedAt,
        designation: set.designation,
        exerciseId: state.id,
        id: set.id,
        orderIndex: set.orderIndex,
        plannedRpe: set.planned.rpe,
        plannedWeightLbs: set.planned.weightLbs,
        reps: set.reps,
      })),
    ),
    workoutId: record.workout.id,
    workoutRow: {
      coachNotes: record.workout.coachNotes,
      completedAt: record.workout.completedAt,
      createdAt: record.workout.createdAt,
      date: record.workout.date,
      id: record.workout.id,
      importSourceMetadataJson: record.importSource.metadataJson,
      importSourceSystem: record.importSource.system,
      importSourceWorkoutId: record.importSource.workoutId,
      source: record.workout.source,
      startedAt: record.workout.startedAt,
      status: record.workout.status,
      title: record.workout.title,
      updatedAt: record.workout.updatedAt,
      userNotes: record.workout.userNotes,
      version: record.workout.version,
    },
  };
}

export function summarizeWorkoutImport(rows: readonly ImportedWorkoutRows[]): WorkoutImportSummary {
  return {
    exerciseCount: rows.reduce((count, row) => count + row.exerciseRows.length, 0),
    fileCount: rows.length,
    setCount: rows.reduce((count, row) => count + row.setRows.length, 0),
    workoutCount: rows.length,
  };
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

export function buildWorkoutImportSql(rows: readonly ImportedWorkoutRows[]) {
  const workoutRows = rows.map(
    ({ workoutRow }) =>
      [
        workoutRow.id,
        workoutRow.title,
        workoutRow.date,
        workoutRow.status,
        workoutRow.source,
        workoutRow.version ?? 1,
        workoutRow.startedAt ?? null,
        workoutRow.completedAt ?? null,
        workoutRow.createdAt,
        workoutRow.updatedAt,
        workoutRow.userNotes ?? null,
        workoutRow.coachNotes ?? null,
        workoutRow.importSourceSystem ?? null,
        workoutRow.importSourceWorkoutId ?? null,
        workoutRow.importSourceMetadataJson ?? null,
      ] satisfies ReadonlyArray<number | string | null>,
  );

  const exerciseRows = rows.flatMap(({ exerciseRows: importedExerciseRows }) =>
    importedExerciseRows.map(
      (exerciseRow) =>
        [
          exerciseRow.id,
          exerciseRow.workoutId,
          exerciseRow.orderIndex,
          exerciseRow.exerciseSchemaId,
          exerciseRow.status,
          exerciseRow.restSeconds ?? DEFAULT_EXERCISE_REST_SECONDS,
          exerciseRow.sourceExerciseName ?? null,
          exerciseRow.userNotes ?? null,
          exerciseRow.coachNotes ?? null,
        ] satisfies ReadonlyArray<number | string | null>,
    ),
  );

  const setRows = rows.flatMap(({ setRows: importedSetRows }) =>
    importedSetRows.map(
      (setRow) =>
        [
          setRow.id,
          setRow.exerciseId,
          setRow.orderIndex,
          setRow.designation,
          setRow.reps ?? null,
          setRow.plannedWeightLbs ?? null,
          setRow.plannedRpe ?? null,
          setRow.actualWeightLbs ?? null,
          setRow.actualRpe ?? null,
          setRow.confirmedAt ?? null,
        ] satisfies ReadonlyArray<number | string | null>,
    ),
  );

  const statements = [
    "PRAGMA foreign_keys = ON;",
    "BEGIN TRANSACTION;",
    ...createInsertStatements("workouts", IMPORT_WORKOUT_COLUMNS, workoutRows, 50),
    ...createInsertStatements("workout_exercises", IMPORT_EXERCISE_COLUMNS, exerciseRows, 100),
    ...createInsertStatements("exercise_sets", IMPORT_SET_COLUMNS, setRows, 100),
    "COMMIT;",
    "",
  ];

  return statements.join("\n\n");
}

export function buildExistingWorkoutIdsQuery(workoutIds: readonly string[]) {
  if (workoutIds.length === 0) {
    return "";
  }

  return [
    "SELECT id",
    "FROM workouts",
    `WHERE id IN (${workoutIds.map((workoutId) => sqlValue(workoutId)).join(", ")})`,
    "ORDER BY id;",
  ].join("\n");
}

export function createImportedWorkoutRows(
  files: readonly ValidatedWorkoutFile[],
  importedAt: string,
) {
  return files
    .map((file) => buildImportedWorkoutRecord(file, importedAt))
    .map((record) => toImportedWorkoutRows(record));
}
