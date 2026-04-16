import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";

import type { AppDatabase } from "../../lib/.server/db/index.ts";
import {
  exerciseSets,
  workoutExercises,
  workouts,
  type ExerciseSetRow,
  type NewExerciseSetRow,
  type NewWorkoutExerciseRow,
  type WorkoutExerciseRow,
  type WorkoutRow,
} from "../../lib/.server/db/schema.ts";
import {
  createExerciseInvalidateKey,
  createWorkoutInvalidateKey,
  uniqueInvalidateKeys,
} from "../app-events/schema.ts";
import { getExerciseSchemaById } from "../exercises/schema.ts";
import type { WorkoutMutationInput, WorkoutMutationResult } from "./actions.ts";
import { workoutMutationResultSchema } from "./actions.ts";
import type {
  WorkoutDetailParams,
  WorkoutDetailWorkout,
  WorkoutExerciseState,
  WorkoutListSearch,
  WorkoutSet,
} from "./contracts.ts";
import {
  workoutDetailLoaderDataSchema,
  workoutDetailWorkoutSchema,
  workoutExerciseSchema,
  workoutExerciseStateSchema,
  workoutListItemSchema,
  workoutListLoaderDataSchema,
  workoutSetCountsSchema,
  workoutSetSchema,
} from "./contracts.ts";
import type { WorkoutRouteService } from "./service.ts";
import {
  WorkoutConflictError,
  WorkoutMutationError,
  WorkoutNotFoundError,
} from "./service.ts";

interface StoredWorkoutRecord {
  exercises: WorkoutExerciseState[];
  workout: WorkoutDetailWorkout;
}

type MutationHandler<K extends WorkoutMutationInput["action"]> = (
  record: StoredWorkoutRecord,
  input: Extract<WorkoutMutationInput, { action: K }>,
  updatedAt: string,
) => WorkoutMutationResult;

class VersionGuardError extends Error {}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function createSet(input: {
  actual?: Partial<WorkoutSet["actual"]>;
  completedAt?: string | null;
  designation: WorkoutSet["designation"];
  id: string;
  orderIndex: number;
  planned?: Partial<WorkoutSet["planned"]>;
  status: WorkoutSet["status"];
}) {
  return workoutSetSchema.parse({
    actual: {
      reps: input.actual?.reps ?? null,
      rpe: input.actual?.rpe ?? null,
      weightLbs: input.actual?.weightLbs ?? null,
    },
    completedAt: input.completedAt ?? null,
    designation: input.designation,
    id: input.id,
    orderIndex: input.orderIndex,
    planned: {
      reps: input.planned?.reps ?? null,
      rpe: input.planned?.rpe ?? null,
      weightLbs: input.planned?.weightLbs ?? null,
    },
    status: input.status,
  });
}

function createExercise(input: {
  coachNotes?: WorkoutExerciseState["coachNotes"];
  exerciseSchemaId: WorkoutExerciseState["exerciseSchemaId"];
  id: string;
  orderIndex: number;
  sets: WorkoutExerciseState["sets"];
  status?: WorkoutExerciseState["status"];
  userNotes?: WorkoutExerciseState["userNotes"];
}) {
  return workoutExerciseStateSchema.parse({
    coachNotes: input.coachNotes ?? null,
    exerciseSchemaId: input.exerciseSchemaId,
    id: input.id,
    orderIndex: input.orderIndex,
    sets: input.sets,
    status: input.status ?? "planned",
    userNotes: input.userNotes ?? null,
  });
}

function decorateExercise(exercise: WorkoutExerciseState) {
  const exerciseSchema = getExerciseSchemaById(exercise.exerciseSchemaId);

  if (!exerciseSchema) {
    throw new Error(`Unknown exercise schema id: ${exercise.exerciseSchemaId}`);
  }

  return workoutExerciseSchema.parse({
    classification: exerciseSchema.classification,
    coachNotes: exercise.coachNotes,
    displayName: exerciseSchema.displayName,
    equipment: exerciseSchema.equipment,
    exerciseSchemaId: exerciseSchema.id,
    exerciseSlug: exerciseSchema.slug,
    id: exercise.id,
    logging: exerciseSchema.logging,
    movementPattern: exerciseSchema.movementPattern,
    orderIndex: exercise.orderIndex,
    sets: cloneValue(exercise.sets),
    status: exercise.status,
    userNotes: exercise.userNotes,
  });
}

function getWorkoutSetCounts(exercises: readonly WorkoutExerciseState[]) {
  let total = 0;
  let tbd = 0;
  let done = 0;
  let skipped = 0;

  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      total += 1;

      switch (set.status) {
        case "tbd":
          tbd += 1;
          break;
        case "done":
          done += 1;
          break;
        case "skipped":
          skipped += 1;
          break;
        default:
          break;
      }
    }
  }

  return workoutSetCountsSchema.parse({
    done,
    skipped,
    tbd,
    total,
  });
}

function buildWorkoutListItem(record: StoredWorkoutRecord) {
  return workoutListItemSchema.parse({
    completedAt: record.workout.completedAt,
    counts: getWorkoutSetCounts(record.exercises),
    date: record.workout.date,
    exerciseCount: record.exercises.length,
    id: record.workout.id,
    source: record.workout.source,
    startedAt: record.workout.startedAt,
    status: record.workout.status,
    title: record.workout.title,
    updatedAt: record.workout.updatedAt,
    version: record.workout.version,
  });
}

function buildWorkoutDetail(record: StoredWorkoutRecord) {
  return workoutDetailLoaderDataSchema.parse({
    agentTarget: {
      instanceName: record.workout.id,
      kind: "workout",
    },
    exercises: record.exercises.map((exercise) => decorateExercise(exercise)),
    progress: getWorkoutSetCounts(record.exercises),
    workout: cloneValue(record.workout),
  });
}

function reindexExercises(exercises: WorkoutExerciseState[]) {
  for (const [index, exercise] of exercises.entries()) {
    exercise.orderIndex = index;
  }
}

function reindexSets(sets: WorkoutSet[]) {
  for (const [index, set] of sets.entries()) {
    set.orderIndex = index;
  }
}

function findExercise(record: StoredWorkoutRecord, exerciseId: string) {
  const exercise = record.exercises.find((item) => item.id === exerciseId);

  if (!exercise) {
    throw new WorkoutMutationError(`Unknown exercise: ${exerciseId}`);
  }

  return exercise;
}

function findSet(exercise: WorkoutExerciseState, setId: string) {
  const set = exercise.sets.find((item) => item.id === setId);

  if (!set) {
    throw new WorkoutMutationError(`Unknown set: ${setId}`);
  }

  return set;
}

function createMutationResult(
  input: WorkoutMutationInput,
  record: StoredWorkoutRecord,
  eventType: WorkoutMutationResult["eventType"],
  additionalInvalidations: readonly WorkoutMutationResult["invalidate"][number][] = [],
) {
  const invalidate = uniqueInvalidateKeys([
    "workouts:list",
    createWorkoutInvalidateKey(record.workout.id),
    ...additionalInvalidations,
  ]);

  return workoutMutationResultSchema.parse({
    action: input.action,
    eventId: `${record.workout.id}-v${record.workout.version}-${eventType}`,
    eventType,
    invalidate,
    ok: true,
    version: record.workout.version,
    workoutId: record.workout.id,
  });
}

function matchesWorkoutSearch(record: StoredWorkoutRecord, search: WorkoutListSearch) {
  if (search.status.length > 0 && !search.status.includes(record.workout.status)) {
    return false;
  }

  if (search.source.length > 0 && !search.source.includes(record.workout.source)) {
    return false;
  }

  if (search.dateFrom && record.workout.date.slice(0, 10) < search.dateFrom) {
    return false;
  }

  if (search.dateTo && record.workout.date.slice(0, 10) > search.dateTo) {
    return false;
  }

  const exerciseQuery = search.exercise?.toLowerCase();

  if (
    exerciseQuery &&
    !record.exercises.some(
      (exercise) =>
        getExerciseSchemaById(exercise.exerciseSchemaId)
          ?.displayName.toLowerCase()
          .includes(exerciseQuery) ?? false,
    )
  ) {
    return false;
  }

  return true;
}

function getMutationTimestamp(input: WorkoutMutationInput) {
  if ("completedAt" in input && input.completedAt) {
    return input.completedAt;
  }

  if ("startedAt" in input && input.startedAt) {
    return input.startedAt;
  }

  return new Date().toISOString();
}

const startWorkout: MutationHandler<"start_workout"> = (record, input, updatedAt) => {
  record.workout.status = "active";
  record.workout.startedAt = input.startedAt ?? updatedAt;
  record.workout.completedAt = null;
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "workout_started");
};

const updateSetActuals: MutationHandler<"update_set_actuals"> = (record, input, updatedAt) => {
  const exercise = findExercise(record, input.exerciseId);
  const set = findSet(exercise, input.setId);

  if (set.status === "skipped") {
    throw new WorkoutMutationError("Skipped sets cannot accept actual-field updates.");
  }

  set.actual = {
    ...set.actual,
    ...input.actual,
  };
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "set_actuals_updated", [
    createExerciseInvalidateKey(exercise.exerciseSchemaId),
  ]);
};

const confirmSet: MutationHandler<"confirm_set"> = (record, input, updatedAt) => {
  const exercise = findExercise(record, input.exerciseId);
  const set = findSet(exercise, input.setId);

  set.actual = {
    ...set.actual,
    ...input.actual,
  };
  set.completedAt = updatedAt;
  set.status = "done";
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "set_confirmed", [
    createExerciseInvalidateKey(exercise.exerciseSchemaId),
  ]);
};

const skipSet: MutationHandler<"skip_set"> = (record, input, updatedAt) => {
  const exercise = findExercise(record, input.exerciseId);
  const set = findSet(exercise, input.setId);

  set.actual = {
    reps: null,
    rpe: null,
    weightLbs: null,
  };
  set.completedAt = null;
  set.status = "skipped";
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "set_corrected", [
    createExerciseInvalidateKey(exercise.exerciseSchemaId),
  ]);
};

const addSet: MutationHandler<"add_set"> = (record, input, updatedAt) => {
  const exercise = findExercise(record, input.exerciseId);
  const insertAfterIndex =
    input.insertAfterSetId == null
      ? exercise.sets.length - 1
      : exercise.sets.findIndex((set) => set.id === input.insertAfterSetId);
  const insertAt = insertAfterIndex < 0 ? exercise.sets.length : insertAfterIndex + 1;

  exercise.sets.splice(
    insertAt,
    0,
    createSet({
      designation: input.designation,
      id: crypto.randomUUID(),
      orderIndex: insertAt,
      planned: {
        reps: input.planned?.reps ?? null,
        rpe: input.planned?.rpe ?? null,
        weightLbs: input.planned?.weightLbs ?? null,
      },
      status: "tbd",
    }),
  );
  reindexSets(exercise.sets);
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "set_added", [
    createExerciseInvalidateKey(exercise.exerciseSchemaId),
  ]);
};

const removeSet: MutationHandler<"remove_set"> = (record, input, updatedAt) => {
  const exercise = findExercise(record, input.exerciseId);
  const setIndex = exercise.sets.findIndex((set) => set.id === input.setId);

  if (setIndex < 0) {
    throw new WorkoutMutationError(`Unknown set: ${input.setId}`);
  }

  if (exercise.sets[setIndex].status === "done") {
    throw new WorkoutMutationError("Completed sets are not removable.");
  }

  exercise.sets.splice(setIndex, 1);
  reindexSets(exercise.sets);
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "set_removed", [
    createExerciseInvalidateKey(exercise.exerciseSchemaId),
  ]);
};

const reorderExercise: MutationHandler<"reorder_exercise"> = (record, input, updatedAt) => {
  const exerciseIndex = record.exercises.findIndex((exercise) => exercise.id === input.exerciseId);

  if (exerciseIndex < 0) {
    throw new WorkoutMutationError(`Unknown exercise: ${input.exerciseId}`);
  }

  const boundedTargetIndex = Math.max(0, Math.min(input.targetIndex, record.exercises.length - 1));
  const [exercise] = record.exercises.splice(exerciseIndex, 1);

  record.exercises.splice(boundedTargetIndex, 0, exercise);
  reindexExercises(record.exercises);
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "exercise_reordered");
};

const updateWorkoutNotes: MutationHandler<"update_workout_notes"> = (record, input, updatedAt) => {
  if (input.notes.userNotes !== undefined) {
    record.workout.userNotes = input.notes.userNotes;
  }

  if (input.notes.coachNotes !== undefined) {
    record.workout.coachNotes = input.notes.coachNotes;
  }

  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "workout_note_updated");
};

const updateExerciseNotes: MutationHandler<"update_exercise_notes"> = (
  record,
  input,
  updatedAt,
) => {
  const exercise = findExercise(record, input.exerciseId);

  if (input.notes.userNotes !== undefined) {
    exercise.userNotes = input.notes.userNotes;
  }

  if (input.notes.coachNotes !== undefined) {
    exercise.coachNotes = input.notes.coachNotes;
  }

  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "exercise_note_updated", [
    createExerciseInvalidateKey(exercise.exerciseSchemaId),
  ]);
};

const finishWorkout: MutationHandler<"finish_workout"> = (record, input, updatedAt) => {
  record.workout.completedAt = input.completedAt ?? updatedAt;
  record.workout.status = "completed";
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "workout_completed");
};

const mutationHandlers = {
  add_set: addSet,
  confirm_set: confirmSet,
  finish_workout: finishWorkout,
  remove_set: removeSet,
  reorder_exercise: reorderExercise,
  skip_set: skipSet,
  start_workout: startWorkout,
  update_exercise_notes: updateExerciseNotes,
  update_set_actuals: updateSetActuals,
  update_workout_notes: updateWorkoutNotes,
} satisfies {
  [K in WorkoutMutationInput["action"]]: MutationHandler<K>;
};

function applyWorkoutMutation(
  record: StoredWorkoutRecord,
  input: WorkoutMutationInput,
  updatedAt: string,
) {
  const handler = mutationHandlers[input.action] as MutationHandler<typeof input.action>;

  return handler(record, input, updatedAt);
}

function buildWhereClause(conditions: Array<ReturnType<typeof eq>>) {
  if (conditions.length === 0) {
    return undefined;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return and(...conditions);
}

function buildStoredWorkoutRecords(
  workoutRows: readonly WorkoutRow[],
  exerciseRows: readonly WorkoutExerciseRow[],
  setRows: readonly ExerciseSetRow[],
) {
  const setRowsByExerciseId = new Map<string, ExerciseSetRow[]>();

  for (const setRow of setRows) {
    const rows = setRowsByExerciseId.get(setRow.exerciseId) ?? [];
    rows.push(setRow);
    setRowsByExerciseId.set(setRow.exerciseId, rows);
  }

  const exercisesByWorkoutId = new Map<string, WorkoutExerciseState[]>();

  for (const exerciseRow of exerciseRows) {
    const sets = (setRowsByExerciseId.get(exerciseRow.id) ?? []).map((setRow) =>
      createSet({
        actual: {
          reps: setRow.actualReps,
          rpe: setRow.actualRpe,
          weightLbs: setRow.actualWeightLbs,
        },
        completedAt: setRow.completedAt,
        designation: setRow.designation,
        id: setRow.id,
        orderIndex: setRow.orderIndex,
        planned: {
          reps: setRow.plannedReps,
          rpe: setRow.plannedRpe,
          weightLbs: setRow.plannedWeightLbs,
        },
        status: setRow.status,
      }),
    );

    const exercises = exercisesByWorkoutId.get(exerciseRow.workoutId) ?? [];
    exercises.push(
      createExercise({
        coachNotes: exerciseRow.coachNotes,
        exerciseSchemaId: exerciseRow.exerciseSchemaId,
        id: exerciseRow.id,
        orderIndex: exerciseRow.orderIndex,
        sets,
        status: exerciseRow.status,
        userNotes: exerciseRow.userNotes,
      }),
    );
    exercisesByWorkoutId.set(exerciseRow.workoutId, exercises);
  }

  return workoutRows.map((workoutRow) => ({
    exercises: cloneValue(exercisesByWorkoutId.get(workoutRow.id) ?? []),
    workout: workoutDetailWorkoutSchema.parse({
      coachNotes: workoutRow.coachNotes,
      completedAt: workoutRow.completedAt,
      createdAt: workoutRow.createdAt,
      date: workoutRow.date,
      id: workoutRow.id,
      source: workoutRow.source,
      startedAt: workoutRow.startedAt,
      status: workoutRow.status,
      title: workoutRow.title,
      updatedAt: workoutRow.updatedAt,
      userNotes: workoutRow.userNotes,
      version: workoutRow.version,
    }),
  }));
}

async function loadStoredWorkoutRecords(
  db: AppDatabase,
  workoutRows: readonly WorkoutRow[],
): Promise<StoredWorkoutRecord[]> {
  if (workoutRows.length === 0) {
    return [];
  }

  const workoutIds = workoutRows.map((row) => row.id);
  const exerciseRows = await db
    .select()
    .from(workoutExercises)
    .where(inArray(workoutExercises.workoutId, workoutIds))
    .orderBy(asc(workoutExercises.workoutId), asc(workoutExercises.orderIndex));
  const exerciseIds = exerciseRows.map((row) => row.id);
  const setRows =
    exerciseIds.length === 0
      ? []
      : await db
          .select()
          .from(exerciseSets)
          .where(inArray(exerciseSets.exerciseId, exerciseIds))
          .orderBy(asc(exerciseSets.exerciseId), asc(exerciseSets.orderIndex));

  return buildStoredWorkoutRecords(workoutRows, exerciseRows, setRows);
}

async function loadStoredWorkoutRecord(db: AppDatabase, workoutId: string) {
  const [workoutRow] = await db
    .select()
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .limit(1);

  if (!workoutRow) {
    throw new WorkoutNotFoundError(workoutId);
  }

  const [record] = await loadStoredWorkoutRecords(db, [workoutRow]);

  return record;
}

async function loadCurrentWorkoutVersion(db: AppDatabase, workoutId: string) {
  const [row] = await db
    .select({ version: workouts.version })
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .limit(1);

  return row?.version ?? null;
}

function assertExpectedVersion(record: StoredWorkoutRecord, expectedVersion: number) {
  if (record.workout.version !== expectedVersion) {
    throw new WorkoutConflictError(
      record.workout.id,
      expectedVersion,
      record.workout.version,
    );
  }
}

function toWorkoutExerciseInsertRows(record: StoredWorkoutRecord): NewWorkoutExerciseRow[] {
  return record.exercises.map((exercise) => ({
    coachNotes: exercise.coachNotes,
    exerciseSchemaId: exercise.exerciseSchemaId,
    id: exercise.id,
    orderIndex: exercise.orderIndex,
    status: exercise.status,
    userNotes: exercise.userNotes,
    workoutId: record.workout.id,
  }));
}

function toExerciseSetInsertRows(record: StoredWorkoutRecord): NewExerciseSetRow[] {
  return record.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({
      actualReps: set.actual.reps,
      actualRpe: set.actual.rpe,
      actualWeightLbs: set.actual.weightLbs,
      completedAt: set.completedAt,
      designation: set.designation,
      exerciseId: exercise.id,
      id: set.id,
      orderIndex: set.orderIndex,
      plannedReps: set.planned.reps,
      plannedRpe: set.planned.rpe,
      plannedWeightLbs: set.planned.weightLbs,
      status: set.status,
    })),
  );
}

async function persistStoredWorkoutRecord(
  db: AppDatabase,
  record: StoredWorkoutRecord,
  expectedVersion: number,
) {
  const exerciseRows = toWorkoutExerciseInsertRows(record);
  const setRows = toExerciseSetInsertRows(record);

  try {
    await db.transaction(async (tx) => {
      const updateResult = await tx
        .update(workouts)
        .set({
          coachNotes: record.workout.coachNotes,
          completedAt: record.workout.completedAt,
          createdAt: record.workout.createdAt,
          date: record.workout.date,
          source: record.workout.source,
          startedAt: record.workout.startedAt,
          status: record.workout.status,
          title: record.workout.title,
          updatedAt: record.workout.updatedAt,
          userNotes: record.workout.userNotes,
          version: record.workout.version,
        })
        .where(and(eq(workouts.id, record.workout.id), eq(workouts.version, expectedVersion)))
        .run();

      if (updateResult.meta.changes !== 1) {
        throw new VersionGuardError();
      }

      await tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, record.workout.id)).run();

      if (exerciseRows.length > 0) {
        await tx.insert(workoutExercises).values(exerciseRows).run();
      }

      if (setRows.length > 0) {
        await tx.insert(exerciseSets).values(setRows).run();
      }
    });
  } catch (error) {
    if (error instanceof VersionGuardError) {
      const currentVersion = await loadCurrentWorkoutVersion(db, record.workout.id);

      throw new WorkoutConflictError(
        record.workout.id,
        expectedVersion,
        currentVersion ?? expectedVersion,
      );
    }

    throw error;
  }
}

export function createWorkoutRouteService(db: AppDatabase): WorkoutRouteService {
  return {
    async loadWorkoutDetail(params: WorkoutDetailParams) {
      return buildWorkoutDetail(await loadStoredWorkoutRecord(db, params.workoutId));
    },

    async loadWorkoutList(search: WorkoutListSearch) {
      const conditions = [];

      if (search.status.length > 0) {
        conditions.push(inArray(workouts.status, [...search.status]));
      }

      if (search.source.length > 0) {
        conditions.push(inArray(workouts.source, [...search.source]));
      }

      if (search.dateFrom) {
        conditions.push(gte(workouts.date, `${search.dateFrom}T00:00:00.000Z`));
      }

      if (search.dateTo) {
        conditions.push(lte(workouts.date, `${search.dateTo}T23:59:59.999Z`));
      }

      const workoutRows = await db
        .select()
        .from(workouts)
        .where(buildWhereClause(conditions))
        .orderBy(desc(workouts.date), desc(workouts.updatedAt));
      const activeWorkout = await db
        .select({ id: workouts.id })
        .from(workouts)
        .where(eq(workouts.status, "active"))
        .orderBy(desc(workouts.updatedAt))
        .limit(1);
      const records = await loadStoredWorkoutRecords(db, workoutRows);
      const items = records
        .filter((record) => matchesWorkoutSearch(record, search))
        .map(buildWorkoutListItem);

      return workoutListLoaderDataSchema.parse({
        activeWorkoutId: activeWorkout[0]?.id ?? null,
        filters: search,
        items,
      });
    },

    async mutateWorkout(input: WorkoutMutationInput) {
      const record = await loadStoredWorkoutRecord(db, input.workoutId);

      assertExpectedVersion(record, input.expectedVersion);

      const result = applyWorkoutMutation(record, input, getMutationTimestamp(input));

      await persistStoredWorkoutRecord(db, record, input.expectedVersion);

      return result;
    },
  };
}
