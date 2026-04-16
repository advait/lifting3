import type { BatchItem } from "drizzle-orm/batch";
import { and, asc, desc, eq, gte, inArray, lt, lte, ne, or } from "drizzle-orm";

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
import type {
  CreateWorkoutToolInput,
  ExerciseSetTemplateInput,
  PatchWorkoutToolInput,
  PatchWorkoutToolOp,
  QueryHistoryToolInput,
  WorkoutExercisePlanInput,
} from "./agent-tools.ts";
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
  workoutListExerciseSummarySchema,
  workoutListItemSchema,
  workoutListLoaderDataSchema,
  workoutSetCountsSchema,
  workoutSetSchema,
} from "./contracts.ts";
import type { WorkoutRouteService } from "./service.ts";
import { WorkoutConflictError, WorkoutMutationError, WorkoutNotFoundError } from "./service.ts";

interface StoredWorkoutRecord {
  exercises: WorkoutExerciseState[];
  workout: WorkoutDetailWorkout;
}

type CreateWorkoutToolResult =
  | {
      createdAt: string;
      exerciseCount: number;
      invalidate: ReturnType<typeof uniqueInvalidateKeys>;
      ok: true;
      title: string;
      workoutId: string;
      workoutUrl: string;
    }
  | {
      code: "UNKNOWN_SOURCE_WORKOUT";
      message: string;
      ok: false;
      sourceWorkoutId: string;
    };

type PatchWorkoutToolResult =
  | {
      applied: Array<{
        summary: string;
        type: PatchWorkoutToolOp["type"];
      }>;
      invalidate: ReturnType<typeof uniqueInvalidateKeys>;
      ok: true;
      reason: string;
      version: number;
      workoutId: string;
    }
  | {
      code: "UNKNOWN_WORKOUT" | "VERSION_MISMATCH" | "MUTATION_ERROR";
      currentVersion?: number;
      message: string;
      ok: false;
      workoutId: string;
    };

type QueryHistoryToolResult =
  | {
      code: "INVALID_FILTERS";
      message: string;
      ok: false;
    }
  | {
      compare?: {
        delta: number | null;
        sampleSize: number;
        value: number | string | null;
        window: {
          dateFrom: string | null;
          dateTo: string | null;
        };
      };
      details?: Record<string, unknown>;
      filters: QueryHistoryToolInput["filters"];
      metric: QueryHistoryToolInput["metric"];
      ok: true;
      result: {
        sampleSize: number;
        sessions: Array<{
          date: string;
          title: string;
          value: number;
          workoutId: string;
          workoutStatus: WorkoutDetailWorkout["status"];
        }>;
        unit: "count" | "e1rm_lbs" | "load_lbs" | "reps" | "volume_lbs" | null;
        value: number | string | null;
      };
      subject: QueryHistoryToolInput["subject"];
      window: {
        dateFrom: string | null;
        dateTo: string | null;
      };
    };

type NonDeleteWorkoutMutationInput = Exclude<WorkoutMutationInput, { action: "delete_workout" }>;

type MutationHandler<K extends WorkoutMutationInput["action"]> = (
  record: StoredWorkoutRecord,
  input: Extract<WorkoutMutationInput, { action: K }>,
  updatedAt: string,
) => WorkoutMutationResult;

const D1_MAX_VARIABLES_PER_STATEMENT = 90;
const WORKOUT_EXERCISE_INSERT_VARIABLE_COUNT = 7;
const EXERCISE_SET_INSERT_VARIABLE_COUNT = 12;

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
  previous?: WorkoutSet["previous"];
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
    previous: input.previous ?? null,
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

function clonePlannedSetTemplate(orderIndex: number, template: ExerciseSetTemplateInput) {
  return createSet({
    designation: template.designation,
    id: crypto.randomUUID(),
    orderIndex,
    planned: {
      reps: template.planned?.reps ?? null,
      rpe: template.planned?.rpe ?? null,
      weightLbs: template.planned?.weightLbs ?? null,
    },
    status: "tbd",
  });
}

function buildPlannedSetsFromTemplates(templates: readonly ExerciseSetTemplateInput[]) {
  const sets: WorkoutSet[] = [];

  for (const template of templates) {
    for (let index = 0; index < template.count; index += 1) {
      sets.push(clonePlannedSetTemplate(sets.length, template));
    }
  }

  return sets;
}

function createExerciseFromPlan(orderIndex: number, plan: WorkoutExercisePlanInput) {
  const exerciseId = crypto.randomUUID();

  return createExercise({
    coachNotes: plan.coachNotes ?? null,
    exerciseSchemaId: plan.exerciseSchemaId,
    id: exerciseId,
    orderIndex,
    sets: buildPlannedSetsFromTemplates(plan.setTemplates),
    status: "planned",
    userNotes: plan.userNotes ?? null,
  });
}

function appendNote(existingValue: string | null, nextValue: string) {
  const trimmedNextValue = nextValue.trim();

  if (trimmedNextValue.length === 0) {
    return existingValue;
  }

  const trimmedExistingValue = existingValue?.trim() ?? "";

  return trimmedExistingValue.length === 0
    ? trimmedNextValue
    : `${trimmedExistingValue}\n${trimmedNextValue}`;
}

function getExerciseCompletionStatus(sets: readonly WorkoutSet[]): WorkoutExerciseState["status"] {
  const doneCount = sets.filter((set) => set.status === "done").length;
  const remainingCount = sets.filter((set) => set.status === "tbd").length;
  const skippedCount = sets.filter((set) => set.status === "skipped").length;

  if (remainingCount > 0 && doneCount > 0) {
    return "active";
  }

  if (remainingCount > 0) {
    return "planned";
  }

  if (doneCount > 0) {
    return "completed";
  }

  if (skippedCount > 0) {
    return "skipped";
  }

  return "planned";
}

function syncExerciseStatus(exercise: WorkoutExerciseState) {
  if (exercise.status === "replaced") {
    return;
  }

  exercise.status = getExerciseCompletionStatus(exercise.sets);
}

function hasLoggedSetPerformance(set: WorkoutSet) {
  return set.actual.weightLbs != null || set.actual.reps != null || set.actual.rpe != null;
}

function hasLoggedExercisePerformance(exercise: WorkoutExerciseState) {
  return exercise.sets.some((set) => hasLoggedSetPerformance(set));
}

function getPreviousSetValues(set: WorkoutSet): WorkoutSet["previous"] {
  if (!hasLoggedSetPerformance(set)) {
    return null;
  }

  return {
    reps: set.actual.reps,
    rpe: set.actual.rpe,
    weightLbs: set.actual.weightLbs,
  };
}

function getAlignedPreviousSetValues(
  currentSets: readonly WorkoutSet[],
  previousExercise: WorkoutExerciseState | null,
) {
  if (!previousExercise) {
    return currentSets.map(() => null);
  }

  const previousWarmupSets = previousExercise.sets.filter((set) => set.designation === "warmup");
  const previousWorkingSets = previousExercise.sets.filter((set) => set.designation === "working");
  let warmupIndex = 0;
  let workingIndex = 0;

  return currentSets.map((set) => {
    if (set.designation === "warmup") {
      const previousSet = previousWarmupSets[warmupIndex];
      warmupIndex += 1;

      return previousSet ? getPreviousSetValues(previousSet) : null;
    }

    const previousSet = previousWorkingSets[workingIndex];
    workingIndex += 1;

    return previousSet ? getPreviousSetValues(previousSet) : null;
  });
}

function decorateExercise(
  exercise: WorkoutExerciseState,
  previousExercise: WorkoutExerciseState | null = null,
) {
  const exerciseSchema = getExerciseSchemaById(exercise.exerciseSchemaId);

  if (!exerciseSchema) {
    throw new Error(`Unknown exercise schema id: ${exercise.exerciseSchemaId}`);
  }

  const alignedPreviousSetValues = getAlignedPreviousSetValues(exercise.sets, previousExercise);

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
    sets: exercise.sets.map((set, index) => ({
      ...cloneValue(set),
      previous: alignedPreviousSetValues[index],
    })),
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

function getTopSetSummary(sets: readonly WorkoutSet[]) {
  let topWeightLbs: number | null = null;
  let topSetRpe: number | null = null;

  for (const set of sets) {
    const weightLbs = set.actual.weightLbs ?? set.planned.weightLbs;
    const rpe = set.actual.rpe ?? set.planned.rpe;

    if (weightLbs == null) {
      continue;
    }

    if (
      topWeightLbs == null ||
      weightLbs > topWeightLbs ||
      (weightLbs === topWeightLbs && topSetRpe == null && rpe != null)
    ) {
      topWeightLbs = weightLbs;
      topSetRpe = rpe;
    }
  }

  return {
    rpe: topSetRpe,
    weightLbs: topWeightLbs,
  };
}

function buildWorkoutListExerciseSummary(exercise: WorkoutExerciseState) {
  const exerciseSchema = getExerciseSchemaById(exercise.exerciseSchemaId);
  const counts = getWorkoutSetCounts([exercise]);

  if (!exerciseSchema) {
    throw new WorkoutMutationError(`Unknown exercise schema: ${exercise.exerciseSchemaId}`);
  }

  return workoutListExerciseSummarySchema.parse({
    completedSetCount: counts.done,
    displayName: exerciseSchema.displayName,
    orderIndex: exercise.orderIndex,
    topSet: getTopSetSummary(exercise.sets),
    totalSetCount: counts.total,
  });
}

function buildWorkoutListItem(record: StoredWorkoutRecord) {
  return workoutListItemSchema.parse({
    completedAt: record.workout.completedAt,
    counts: getWorkoutSetCounts(record.exercises),
    date: record.workout.date,
    exerciseCount: record.exercises.length,
    exerciseSummaries: record.exercises.map(buildWorkoutListExerciseSummary),
    id: record.workout.id,
    source: record.workout.source,
    startedAt: record.workout.startedAt,
    status: record.workout.status,
    title: record.workout.title,
    updatedAt: record.workout.updatedAt,
    version: record.workout.version,
  });
}

function buildWorkoutDetail(
  record: StoredWorkoutRecord,
  previousExercisesBySchemaId: ReadonlyMap<
    WorkoutExerciseState["exerciseSchemaId"],
    WorkoutExerciseState
  >,
) {
  return workoutDetailLoaderDataSchema.parse({
    agentTarget: {
      instanceName: record.workout.id,
      kind: "workout",
    },
    exercises: record.exercises.map((exercise) =>
      decorateExercise(
        exercise,
        previousExercisesBySchemaId.get(exercise.exerciseSchemaId) ?? null,
      ),
    ),
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

const updateSetPlanned: MutationHandler<"update_set_planned"> = (record, input, updatedAt) => {
  if (record.workout.status !== "planned") {
    throw new WorkoutMutationError(
      "Planned set values can only be edited before the workout starts.",
    );
  }

  const exercise = findExercise(record, input.exerciseId);
  const set = findSet(exercise, input.setId);

  set.planned = {
    ...set.planned,
    ...input.planned,
  };
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "set_planned_updated", [
    createExerciseInvalidateKey(exercise.exerciseSchemaId),
  ]);
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

const updateSetDesignation: MutationHandler<"update_set_designation"> = (
  record,
  input,
  updatedAt,
) => {
  const exercise = findExercise(record, input.exerciseId);
  const set = findSet(exercise, input.setId);

  set.designation = input.designation;
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "set_designation_updated", [
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

const removeExercise: MutationHandler<"remove_exercise"> = (record, input, updatedAt) => {
  const exerciseIndex = record.exercises.findIndex((exercise) => exercise.id === input.exerciseId);

  if (exerciseIndex < 0) {
    throw new WorkoutMutationError(`Unknown exercise: ${input.exerciseId}`);
  }

  const exercise = record.exercises[exerciseIndex];

  if (exercise.sets.some((set) => set.status === "done")) {
    throw new WorkoutMutationError("Exercises with completed sets are not removable.");
  }

  record.exercises.splice(exerciseIndex, 1);
  reindexExercises(record.exercises);
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;

  return createMutationResult(input, record, "exercise_removed", [
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
  remove_exercise: removeExercise,
  remove_set: removeSet,
  reorder_exercise: reorderExercise,
  skip_set: skipSet,
  start_workout: startWorkout,
  update_exercise_notes: updateExerciseNotes,
  update_set_designation: updateSetDesignation,
  update_set_planned: updateSetPlanned,
  update_set_actuals: updateSetActuals,
  update_workout_notes: updateWorkoutNotes,
} satisfies {
  [K in Exclude<WorkoutMutationInput["action"], "delete_workout">]: MutationHandler<K>;
};

function applyWorkoutMutation(
  record: StoredWorkoutRecord,
  input: NonDeleteWorkoutMutationInput,
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
  const [workoutRow] = await db.select().from(workouts).where(eq(workouts.id, workoutId)).limit(1);

  if (!workoutRow) {
    throw new WorkoutNotFoundError(workoutId);
  }

  const [record] = await loadStoredWorkoutRecords(db, [workoutRow]);

  return record;
}

async function loadPreviousExercisesBySchemaId(
  db: AppDatabase,
  record: StoredWorkoutRecord,
): Promise<Map<WorkoutExerciseState["exerciseSchemaId"], WorkoutExerciseState>> {
  const exerciseSchemaIds = [
    ...new Set(record.exercises.map((exercise) => exercise.exerciseSchemaId)),
  ];

  if (exerciseSchemaIds.length === 0) {
    return new Map();
  }

  const priorWorkoutRows = await db
    .select()
    .from(workouts)
    .where(
      and(
        ne(workouts.id, record.workout.id),
        or(
          lt(workouts.date, record.workout.date),
          and(
            eq(workouts.date, record.workout.date),
            lt(workouts.updatedAt, record.workout.updatedAt),
          ),
        ),
      ),
    )
    .orderBy(desc(workouts.date), desc(workouts.updatedAt));
  const priorRecords = await loadStoredWorkoutRecords(db, priorWorkoutRows);
  const previousExercisesBySchemaId = new Map<
    WorkoutExerciseState["exerciseSchemaId"],
    WorkoutExerciseState
  >();

  for (const priorRecord of priorRecords) {
    for (const exercise of priorRecord.exercises) {
      if (
        !exerciseSchemaIds.includes(exercise.exerciseSchemaId) ||
        previousExercisesBySchemaId.has(exercise.exerciseSchemaId) ||
        !hasLoggedExercisePerformance(exercise)
      ) {
        continue;
      }

      previousExercisesBySchemaId.set(exercise.exerciseSchemaId, cloneValue(exercise));

      if (previousExercisesBySchemaId.size === exerciseSchemaIds.length) {
        return previousExercisesBySchemaId;
      }
    }
  }

  return previousExercisesBySchemaId;
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
    throw new WorkoutConflictError(record.workout.id, expectedVersion, record.workout.version);
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

function chunkRows<T>(rows: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }

  return chunks;
}

async function persistStoredWorkoutRecord(
  db: AppDatabase,
  record: StoredWorkoutRecord,
  expectedVersion: number,
) {
  const exerciseRows = toWorkoutExerciseInsertRows(record);
  const setRows = toExerciseSetInsertRows(record);
  const maxExerciseRowsPerInsert = Math.max(
    1,
    Math.floor(D1_MAX_VARIABLES_PER_STATEMENT / WORKOUT_EXERCISE_INSERT_VARIABLE_COUNT),
  );
  const maxSetRowsPerInsert = Math.max(
    1,
    Math.floor(D1_MAX_VARIABLES_PER_STATEMENT / EXERCISE_SET_INSERT_VARIABLE_COUNT),
  );

  try {
    const batchStatements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
      db
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
        .where(and(eq(workouts.id, record.workout.id), eq(workouts.version, expectedVersion))),
      db.delete(workoutExercises).where(eq(workoutExercises.workoutId, record.workout.id)),
      ...chunkRows(exerciseRows, maxExerciseRowsPerInsert).map((rows) =>
        db.insert(workoutExercises).values(rows),
      ),
      ...chunkRows(setRows, maxSetRowsPerInsert).map((rows) =>
        db.insert(exerciseSets).values(rows),
      ),
    ];
    const [updateResult] = await db.batch(batchStatements);

    if (updateResult.meta.changes !== 1) {
      throw new VersionGuardError();
    }
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

async function deleteStoredWorkoutRecord(
  db: AppDatabase,
  workoutId: string,
  expectedVersion: number,
) {
  try {
    const deleteStatements: [BatchItem<"sqlite">] = [
      db
        .delete(workouts)
        .where(and(eq(workouts.id, workoutId), eq(workouts.version, expectedVersion))),
    ];
    const [deleteResult] = await db.batch(deleteStatements);

    if (deleteResult.meta.changes !== 1) {
      throw new VersionGuardError();
    }
  } catch (error) {
    if (error instanceof VersionGuardError) {
      const currentVersion = await loadCurrentWorkoutVersion(db, workoutId);

      throw new WorkoutConflictError(workoutId, expectedVersion, currentVersion ?? expectedVersion);
    }

    throw error;
  }
}

function createToolInvalidateKeys(workoutId: string, exerciseSchemaIds: readonly string[] = []) {
  return uniqueInvalidateKeys([
    "home",
    "workouts:list",
    "analytics",
    createWorkoutInvalidateKey(workoutId),
    ...exerciseSchemaIds.map((exerciseSchemaId) => createExerciseInvalidateKey(exerciseSchemaId)),
  ]);
}

function buildWorkoutDateTimestamp(targetDate: string) {
  return `${targetDate}T00:00:00.000Z`;
}

function buildCreatedWorkoutTitle(input: CreateWorkoutToolInput) {
  const explicitTitle = input.title?.trim();

  if (explicitTitle) {
    return explicitTitle;
  }

  return input.intent.trim().slice(0, 120);
}

function buildCreatedWorkoutCoachNotes(
  input: CreateWorkoutToolInput,
  sourceWorkoutTitle: string | null,
) {
  const noteLines = [
    input.coachNotes?.trim() ?? null,
    `Planning intent: ${input.intent.trim()}`,
    input.constraints.length > 0 ? `Constraints: ${input.constraints.join("; ")}` : null,
    sourceWorkoutTitle ? `Adapted from: ${sourceWorkoutTitle}` : null,
  ].filter((line) => line !== null);

  return noteLines.length > 0 ? noteLines.join("\n") : null;
}

function cloneExerciseForPlannedWorkout(
  workoutId: string,
  orderIndex: number,
  sourceExercise: WorkoutExerciseState,
) {
  const exerciseId = crypto.randomUUID();

  return createExercise({
    coachNotes: sourceExercise.coachNotes,
    exerciseSchemaId: sourceExercise.exerciseSchemaId,
    id: exerciseId,
    orderIndex,
    sets: sourceExercise.sets.map((set, setIndex) =>
      createSet({
        designation: set.designation,
        id: crypto.randomUUID(),
        orderIndex: setIndex,
        planned: {
          reps: set.planned.reps,
          rpe: set.planned.rpe,
          weightLbs: set.planned.weightLbs,
        },
        status: "tbd",
      }),
    ),
    status: "planned",
    userNotes: sourceExercise.userNotes,
  });
}

function createPlannedWorkoutRecord(
  input: CreateWorkoutToolInput,
  createdAt: string,
  sourceRecord: StoredWorkoutRecord | null,
) {
  const workoutId = crypto.randomUUID();
  const exercises =
    input.exercises?.map((exercisePlan, orderIndex) =>
      createExerciseFromPlan(orderIndex, exercisePlan),
    ) ??
    sourceRecord?.exercises.map((exercise, orderIndex) =>
      cloneExerciseForPlannedWorkout(workoutId, orderIndex, exercise),
    ) ??
    [];

  return {
    exercises,
    workout: workoutDetailWorkoutSchema.parse({
      coachNotes: buildCreatedWorkoutCoachNotes(input, sourceRecord?.workout.title ?? null),
      completedAt: null,
      createdAt,
      date: buildWorkoutDateTimestamp(input.targetDate),
      id: workoutId,
      source: "agent",
      startedAt: null,
      status: "planned",
      title: buildCreatedWorkoutTitle(input),
      updatedAt: createdAt,
      userNotes: input.userNotes ?? null,
      version: 1,
    }),
  } satisfies StoredWorkoutRecord;
}

async function insertStoredWorkoutRecord(db: AppDatabase, record: StoredWorkoutRecord) {
  const exerciseRows = toWorkoutExerciseInsertRows(record);
  const setRows = toExerciseSetInsertRows(record);
  const maxExerciseRowsPerInsert = Math.max(
    1,
    Math.floor(D1_MAX_VARIABLES_PER_STATEMENT / WORKOUT_EXERCISE_INSERT_VARIABLE_COUNT),
  );
  const maxSetRowsPerInsert = Math.max(
    1,
    Math.floor(D1_MAX_VARIABLES_PER_STATEMENT / EXERCISE_SET_INSERT_VARIABLE_COUNT),
  );

  const batchStatements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
    db.insert(workouts).values({
      coachNotes: record.workout.coachNotes,
      completedAt: record.workout.completedAt,
      createdAt: record.workout.createdAt,
      date: record.workout.date,
      id: record.workout.id,
      source: record.workout.source,
      startedAt: record.workout.startedAt,
      status: record.workout.status,
      title: record.workout.title,
      updatedAt: record.workout.updatedAt,
      userNotes: record.workout.userNotes,
      version: record.workout.version,
    }),
    ...chunkRows(exerciseRows, maxExerciseRowsPerInsert).map((rows) =>
      db.insert(workoutExercises).values(rows),
    ),
    ...chunkRows(setRows, maxSetRowsPerInsert).map((rows) => db.insert(exerciseSets).values(rows)),
  ];

  await db.batch(batchStatements);
}

type AppliedPatchOperation = {
  exerciseSchemaIds: string[];
  summary: string;
  type: PatchWorkoutToolOp["type"];
};

function skipPendingSets(exercise: WorkoutExerciseState, note: string | undefined) {
  let skippedCount = 0;

  for (const set of exercise.sets) {
    if (set.status !== "tbd") {
      continue;
    }

    skippedCount += 1;
    set.actual = {
      reps: null,
      rpe: null,
      weightLbs: null,
    };
    set.completedAt = null;
    set.status = "skipped";
  }

  if (note) {
    exercise.coachNotes = appendNote(exercise.coachNotes, note);
  }

  syncExerciseStatus(exercise);

  return skippedCount;
}

function applyPatchOperation(
  record: StoredWorkoutRecord,
  op: PatchWorkoutToolOp,
): AppliedPatchOperation {
  switch (op.type) {
    case "add_exercise": {
      const targetIndex = Math.min(
        op.targetIndex ?? record.exercises.length,
        record.exercises.length,
      );
      const exercise = createExerciseFromPlan(targetIndex, op.exercise);

      record.exercises.splice(targetIndex, 0, exercise);
      reindexExercises(record.exercises);

      return {
        exerciseSchemaIds: [exercise.exerciseSchemaId],
        summary: `Added ${getExerciseSchemaById(exercise.exerciseSchemaId)?.displayName ?? exercise.exerciseSchemaId}.`,
        type: op.type,
      };
    }
    case "replace_exercise": {
      const exerciseIndex = record.exercises.findIndex((exercise) => exercise.id === op.exerciseId);

      if (exerciseIndex < 0) {
        throw new WorkoutMutationError(`Unknown exercise: ${op.exerciseId}`);
      }

      const existingExercise = record.exercises[exerciseIndex];
      const replacementExercise = createExerciseFromPlan(exerciseIndex, op.replacement);
      const existingDisplayName =
        getExerciseSchemaById(existingExercise.exerciseSchemaId)?.displayName ??
        existingExercise.exerciseSchemaId;
      const replacementDisplayName =
        getExerciseSchemaById(replacementExercise.exerciseSchemaId)?.displayName ??
        replacementExercise.exerciseSchemaId;
      const doneSetCount = existingExercise.sets.filter((set) => set.status === "done").length;

      if (doneSetCount > 0) {
        skipPendingSets(existingExercise, undefined);
        existingExercise.status = "replaced";
        record.exercises.splice(exerciseIndex + 1, 0, replacementExercise);
      } else {
        record.exercises.splice(exerciseIndex, 1, replacementExercise);
      }

      reindexExercises(record.exercises);

      return {
        exerciseSchemaIds: [
          existingExercise.exerciseSchemaId,
          replacementExercise.exerciseSchemaId,
        ],
        summary:
          doneSetCount > 0
            ? `Preserved logged work for ${existingDisplayName} and inserted ${replacementDisplayName} for the remaining work.`
            : `Replaced ${existingDisplayName} with ${replacementDisplayName}.`,
        type: op.type,
      };
    }
    case "skip_exercise": {
      const exercise = findExercise(record, op.exerciseId);
      const skippedCount = skipPendingSets(exercise, op.note);
      const displayName =
        getExerciseSchemaById(exercise.exerciseSchemaId)?.displayName ?? exercise.exerciseSchemaId;

      return {
        exerciseSchemaIds: [exercise.exerciseSchemaId],
        summary:
          skippedCount > 0
            ? `Skipped ${skippedCount} remaining set${skippedCount === 1 ? "" : "s"} in ${displayName}.`
            : `No remaining sets were skipped in ${displayName}.`,
        type: op.type,
      };
    }
    case "reorder_exercise": {
      const exerciseIndex = record.exercises.findIndex((exercise) => exercise.id === op.exerciseId);

      if (exerciseIndex < 0) {
        throw new WorkoutMutationError(`Unknown exercise: ${op.exerciseId}`);
      }

      const targetIndex = Math.max(0, Math.min(op.targetIndex, record.exercises.length - 1));
      const [exercise] = record.exercises.splice(exerciseIndex, 1);

      record.exercises.splice(targetIndex, 0, exercise);
      reindexExercises(record.exercises);

      return {
        exerciseSchemaIds: [exercise.exerciseSchemaId],
        summary: `Moved ${getExerciseSchemaById(exercise.exerciseSchemaId)?.displayName ?? exercise.exerciseSchemaId} to position ${targetIndex + 1}.`,
        type: op.type,
      };
    }
    case "update_exercise_targets": {
      const exercise = findExercise(record, op.exerciseId);

      for (const setUpdate of op.setUpdates) {
        const set = findSet(exercise, setUpdate.setId);

        if (set.status !== "tbd") {
          throw new WorkoutMutationError(
            `Only remaining sets can be retargeted. Set ${setUpdate.setId} is ${set.status}.`,
          );
        }

        if (setUpdate.designation !== undefined) {
          set.designation = setUpdate.designation;
        }

        if (setUpdate.planned !== undefined) {
          set.planned = {
            ...set.planned,
            ...setUpdate.planned,
          };
        }
      }

      syncExerciseStatus(exercise);

      return {
        exerciseSchemaIds: [exercise.exerciseSchemaId],
        summary: `Updated targets for ${op.setUpdates.length} set${op.setUpdates.length === 1 ? "" : "s"} in ${getExerciseSchemaById(exercise.exerciseSchemaId)?.displayName ?? exercise.exerciseSchemaId}.`,
        type: op.type,
      };
    }
    case "add_set": {
      const exercise = findExercise(record, op.exerciseId);
      const insertAfterIndex =
        op.insertAfterSetId == null
          ? exercise.sets.length - 1
          : exercise.sets.findIndex((set) => set.id === op.insertAfterSetId);
      const insertAt = insertAfterIndex < 0 ? exercise.sets.length : insertAfterIndex + 1;

      for (let index = 0; index < op.template.count; index += 1) {
        exercise.sets.splice(
          insertAt + index,
          0,
          clonePlannedSetTemplate(insertAt + index, {
            ...op.template,
            count: 1,
          }),
        );
      }

      reindexSets(exercise.sets);
      syncExerciseStatus(exercise);

      return {
        exerciseSchemaIds: [exercise.exerciseSchemaId],
        summary: `Added ${op.template.count} ${op.template.designation} set${op.template.count === 1 ? "" : "s"} to ${getExerciseSchemaById(exercise.exerciseSchemaId)?.displayName ?? exercise.exerciseSchemaId}.`,
        type: op.type,
      };
    }
    case "skip_remaining_sets": {
      const exercise = findExercise(record, op.exerciseId);
      const skippedCount = skipPendingSets(exercise, op.note);

      return {
        exerciseSchemaIds: [exercise.exerciseSchemaId],
        summary: `Skipped ${skippedCount} remaining set${skippedCount === 1 ? "" : "s"} in ${getExerciseSchemaById(exercise.exerciseSchemaId)?.displayName ?? exercise.exerciseSchemaId}.`,
        type: op.type,
      };
    }
    case "add_note": {
      if (op.scope === "workout") {
        if (op.field === "coach") {
          record.workout.coachNotes = appendNote(record.workout.coachNotes, op.text);
        } else {
          record.workout.userNotes = appendNote(record.workout.userNotes, op.text);
        }

        return {
          exerciseSchemaIds: [],
          summary: `Added a ${op.field} note to the workout.`,
          type: op.type,
        };
      }

      if (!op.exerciseId) {
        throw new WorkoutMutationError("exerciseId is required when adding an exercise note.");
      }

      const exercise = findExercise(record, op.exerciseId);

      if (op.field === "coach") {
        exercise.coachNotes = appendNote(exercise.coachNotes, op.text);
      } else {
        exercise.userNotes = appendNote(exercise.userNotes, op.text);
      }

      return {
        exerciseSchemaIds: [exercise.exerciseSchemaId],
        summary: `Added a ${op.field} note to ${getExerciseSchemaById(exercise.exerciseSchemaId)?.displayName ?? exercise.exerciseSchemaId}.`,
        type: op.type,
      };
    }
  }
}

type HistoryMatchedSet = {
  exerciseSchemaId: WorkoutExerciseState["exerciseSchemaId"];
  set: WorkoutSet;
  workout: WorkoutDetailWorkout;
};

type HistorySessionSummary = {
  date: string;
  e1rm: number;
  maxLoad: number;
  topSet: HistoryMatchedSet | null;
  title: string;
  volume: number;
  workoutId: string;
  workoutStatus: WorkoutDetailWorkout["status"];
};

function getEstimatedE1rm(set: WorkoutSet) {
  const weight = set.actual.weightLbs;
  const reps = set.actual.reps;

  if (weight == null || reps == null || reps <= 0) {
    return null;
  }

  return weight * (1 + reps / 30);
}

function loadFilterMatchesSet(set: WorkoutSet, filters: QueryHistoryToolInput["filters"]) {
  if (set.status !== "done") {
    return false;
  }

  const reps = set.actual.reps;
  const weight = set.actual.weightLbs;

  if (filters.minReps !== undefined && (reps == null || reps < filters.minReps)) {
    return false;
  }

  if (filters.maxReps !== undefined && (reps == null || reps > filters.maxReps)) {
    return false;
  }

  if (filters.loadLbs !== undefined && weight !== filters.loadLbs) {
    return false;
  }

  return true;
}

function summarizeHistorySessions(
  records: readonly StoredWorkoutRecord[],
  filters: QueryHistoryToolInput["filters"],
) {
  const matchedSets: HistoryMatchedSet[] = [];

  for (const record of records) {
    for (const exercise of record.exercises) {
      if (
        filters.exerciseSchemaId !== undefined &&
        exercise.exerciseSchemaId !== filters.exerciseSchemaId
      ) {
        continue;
      }

      for (const set of exercise.sets) {
        if (!loadFilterMatchesSet(set, filters)) {
          continue;
        }

        matchedSets.push({
          exerciseSchemaId: exercise.exerciseSchemaId,
          set,
          workout: record.workout,
        });
      }
    }
  }

  const sessionsByWorkoutId = new Map<string, HistorySessionSummary>();

  for (const matchedSet of matchedSets) {
    const weight = matchedSet.set.actual.weightLbs ?? 0;
    const reps = matchedSet.set.actual.reps ?? 0;
    const volume = weight * reps;
    const e1rm = getEstimatedE1rm(matchedSet.set) ?? 0;
    const session =
      sessionsByWorkoutId.get(matchedSet.workout.id) ??
      ({
        date: matchedSet.workout.date,
        e1rm: 0,
        maxLoad: 0,
        topSet: null,
        title: matchedSet.workout.title,
        volume: 0,
        workoutId: matchedSet.workout.id,
        workoutStatus: matchedSet.workout.status,
      } satisfies HistorySessionSummary);

    session.volume += volume;
    session.maxLoad = Math.max(session.maxLoad, weight);
    session.e1rm = Math.max(session.e1rm, e1rm);

    const currentTopSet = session.topSet;
    const currentTopSetWeight = currentTopSet?.set.actual.weightLbs ?? -1;
    const currentTopSetReps = currentTopSet?.set.actual.reps ?? -1;

    if (
      session.topSet === null ||
      weight > currentTopSetWeight ||
      (weight === currentTopSetWeight && reps > currentTopSetReps)
    ) {
      session.topSet = matchedSet;
    }

    sessionsByWorkoutId.set(matchedSet.workout.id, session);
  }

  return {
    matchedSets,
    sessions: [...sessionsByWorkoutId.values()].sort((left, right) =>
      right.date.localeCompare(left.date),
    ),
  };
}

async function loadHistoryRecords(
  db: AppDatabase,
  filters: QueryHistoryToolInput["filters"],
  compareWindow: QueryHistoryToolInput["compareWindow"] | undefined,
) {
  const earliestDate = [filters.dateFrom, compareWindow?.dateFrom]
    .filter((date): date is string => date !== undefined)
    .sort()[0];
  const latestDate = [filters.dateTo, compareWindow?.dateTo]
    .filter((date): date is string => date !== undefined)
    .sort()
    .at(-1);
  const conditions = [];

  if (filters.status.length > 0) {
    conditions.push(inArray(workouts.status, [...filters.status]));
  }

  if (earliestDate) {
    conditions.push(gte(workouts.date, `${earliestDate}T00:00:00.000Z`));
  }

  if (latestDate) {
    conditions.push(lte(workouts.date, `${latestDate}T23:59:59.999Z`));
  }

  const workoutRows = await db
    .select()
    .from(workouts)
    .where(buildWhereClause(conditions))
    .orderBy(desc(workouts.date), desc(workouts.updatedAt));

  return loadStoredWorkoutRecords(db, workoutRows);
}

function evaluateHistoryWindow(
  records: readonly StoredWorkoutRecord[],
  input: QueryHistoryToolInput,
  dateFrom: string | undefined,
  dateTo: string | undefined,
) {
  const windowedRecords = records.filter((record) => {
    const workoutDate = record.workout.date.slice(0, 10);

    if (dateFrom && workoutDate < dateFrom) {
      return false;
    }

    if (dateTo && workoutDate > dateTo) {
      return false;
    }

    return true;
  });
  const { matchedSets, sessions } = summarizeHistorySessions(windowedRecords, input.filters);

  switch (input.metric) {
    case "frequency":
      return {
        details: undefined,
        sampleSize: sessions.length,
        sessions: sessions.map((session) => ({
          date: session.date,
          title: session.title,
          value: 1,
          workoutId: session.workoutId,
          workoutStatus: session.workoutStatus,
        })),
        unit: "count" as const,
        value: sessions.length,
      };
    case "volume":
      return {
        details: undefined,
        sampleSize: sessions.length,
        sessions: sessions
          .map((session) => ({
            date: session.date,
            title: session.title,
            value: session.volume,
            workoutId: session.workoutId,
            workoutStatus: session.workoutStatus,
          }))
          .sort((left, right) => right.value - left.value)
          .slice(0, 5),
        unit: "volume_lbs" as const,
        value: sessions.reduce((total, session) => total + session.volume, 0),
      };
    case "max_load": {
      const maxLoad = matchedSets.reduce(
        (currentMax, entry) => Math.max(currentMax, entry.set.actual.weightLbs ?? 0),
        0,
      );

      return {
        details: undefined,
        sampleSize: matchedSets.length,
        sessions: sessions
          .map((session) => ({
            date: session.date,
            title: session.title,
            value: session.maxLoad,
            workoutId: session.workoutId,
            workoutStatus: session.workoutStatus,
          }))
          .sort((left, right) => right.value - left.value)
          .slice(0, 5),
        unit: "load_lbs" as const,
        value: maxLoad,
      };
    }
    case "e1rm": {
      const peakE1rm = matchedSets.reduce(
        (currentMax, entry) => Math.max(currentMax, getEstimatedE1rm(entry.set) ?? 0),
        0,
      );

      return {
        details: undefined,
        sampleSize: matchedSets.length,
        sessions: sessions
          .map((session) => ({
            date: session.date,
            title: session.title,
            value: session.e1rm,
            workoutId: session.workoutId,
            workoutStatus: session.workoutStatus,
          }))
          .sort((left, right) => right.value - left.value)
          .slice(0, 5),
        unit: "e1rm_lbs" as const,
        value: Math.round(peakE1rm * 10) / 10,
      };
    }
    case "reps_at_load": {
      if (input.filters.loadLbs === undefined) {
        return null;
      }

      const totalReps = matchedSets.reduce(
        (total, entry) => total + (entry.set.actual.reps ?? 0),
        0,
      );

      return {
        details: {
          loadLbs: input.filters.loadLbs,
        },
        sampleSize: matchedSets.length,
        sessions: sessions
          .map((session) => ({
            date: session.date,
            title: session.title,
            value: matchedSets
              .filter((entry) => entry.workout.id === session.workoutId)
              .reduce((total, entry) => total + (entry.set.actual.reps ?? 0), 0),
            workoutId: session.workoutId,
            workoutStatus: session.workoutStatus,
          }))
          .sort((left, right) => right.value - left.value)
          .slice(0, 5),
        unit: "reps" as const,
        value: totalReps,
      };
    }
    case "top_set": {
      const topSet = matchedSets.reduce<HistoryMatchedSet | null>((currentTopSet, entry) => {
        if (currentTopSet === null) {
          return entry;
        }

        const currentWeight = currentTopSet.set.actual.weightLbs ?? -1;
        const nextWeight = entry.set.actual.weightLbs ?? -1;

        if (nextWeight > currentWeight) {
          return entry;
        }

        if (nextWeight < currentWeight) {
          return currentTopSet;
        }

        return (entry.set.actual.reps ?? -1) > (currentTopSet.set.actual.reps ?? -1)
          ? entry
          : currentTopSet;
      }, null);

      return {
        details:
          topSet === null
            ? undefined
            : {
                reps: topSet.set.actual.reps,
                rpe: topSet.set.actual.rpe,
                setId: topSet.set.id,
                workoutId: topSet.workout.id,
              },
        sampleSize: matchedSets.length,
        sessions: sessions
          .map((session) => ({
            date: session.date,
            title: session.title,
            value: session.topSet?.set.actual.weightLbs ?? 0,
            workoutId: session.workoutId,
            workoutStatus: session.workoutStatus,
          }))
          .sort((left, right) => right.value - left.value)
          .slice(0, 5),
        unit: "load_lbs" as const,
        value:
          topSet === null
            ? null
            : `${topSet.set.actual.weightLbs ?? 0} lb x ${topSet.set.actual.reps ?? 0}`,
      };
    }
    case "best_session": {
      const bestSession =
        [...sessions].sort((left, right) => right.volume - left.volume)[0] ?? null;

      return {
        details:
          bestSession === null
            ? undefined
            : {
                metric: "volume",
                workoutId: bestSession.workoutId,
              },
        sampleSize: sessions.length,
        sessions: sessions
          .map((session) => ({
            date: session.date,
            title: session.title,
            value: session.volume,
            workoutId: session.workoutId,
            workoutStatus: session.workoutStatus,
          }))
          .sort((left, right) => right.value - left.value)
          .slice(0, 5),
        unit: "volume_lbs" as const,
        value:
          bestSession === null ? null : `${bestSession.title} (${bestSession.date.slice(0, 10)})`,
      };
    }
  }
}

export function createWorkoutAgentToolService(db: AppDatabase) {
  return {
    async createWorkout(input: CreateWorkoutToolInput): Promise<CreateWorkoutToolResult> {
      const createdAt = new Date().toISOString();
      const sourceRecord = input.sourceWorkoutId
        ? await loadStoredWorkoutRecord(db, input.sourceWorkoutId).catch((error) => {
            if (error instanceof WorkoutNotFoundError) {
              return null;
            }

            throw error;
          })
        : null;

      if (input.sourceWorkoutId && sourceRecord === null) {
        return {
          code: "UNKNOWN_SOURCE_WORKOUT",
          message: `Unknown workout: ${input.sourceWorkoutId}`,
          ok: false,
          sourceWorkoutId: input.sourceWorkoutId,
        };
      }

      const record = createPlannedWorkoutRecord(input, createdAt, sourceRecord);

      await insertStoredWorkoutRecord(db, record);

      return {
        createdAt,
        exerciseCount: record.exercises.length,
        invalidate: createToolInvalidateKeys(
          record.workout.id,
          record.exercises.map((exercise) => exercise.exerciseSchemaId),
        ),
        ok: true,
        title: record.workout.title,
        workoutId: record.workout.id,
        workoutUrl: `/workouts/${record.workout.id}`,
      };
    },

    async patchWorkout(input: PatchWorkoutToolInput): Promise<PatchWorkoutToolResult> {
      try {
        const record = await loadStoredWorkoutRecord(db, input.workoutId);

        assertExpectedVersion(record, input.expectedVersion);

        const applied = input.ops.map((operation) => applyPatchOperation(record, operation));

        record.workout.updatedAt = new Date().toISOString();
        record.workout.version += 1;

        await persistStoredWorkoutRecord(db, record, input.expectedVersion);

        return {
          applied: applied.map(({ summary, type }) => ({ summary, type })),
          invalidate: createToolInvalidateKeys(
            record.workout.id,
            applied.flatMap((operation) => operation.exerciseSchemaIds),
          ),
          ok: true,
          reason: input.reason,
          version: record.workout.version,
          workoutId: record.workout.id,
        };
      } catch (error) {
        if (error instanceof WorkoutNotFoundError) {
          return {
            code: "UNKNOWN_WORKOUT",
            message: error.message,
            ok: false,
            workoutId: input.workoutId,
          };
        }

        if (error instanceof WorkoutConflictError) {
          return {
            code: "VERSION_MISMATCH",
            currentVersion: error.currentVersion,
            message: error.message,
            ok: false,
            workoutId: input.workoutId,
          };
        }

        if (error instanceof WorkoutMutationError) {
          return {
            code: "MUTATION_ERROR",
            message: error.message,
            ok: false,
            workoutId: input.workoutId,
          };
        }

        throw error;
      }
    },

    async queryHistory(input: QueryHistoryToolInput): Promise<QueryHistoryToolResult> {
      if (input.metric === "reps_at_load" && input.filters.loadLbs === undefined) {
        return {
          code: "INVALID_FILTERS",
          message: "reps_at_load requires filters.loadLbs.",
          ok: false,
        };
      }

      const records = await loadHistoryRecords(db, input.filters, input.compareWindow);
      const baseWindowResult = evaluateHistoryWindow(
        records,
        input,
        input.filters.dateFrom,
        input.filters.dateTo,
      );

      if (baseWindowResult === null) {
        return {
          code: "INVALID_FILTERS",
          message: "The requested metric requires additional filters.",
          ok: false,
        };
      }

      const compareWindowResult =
        input.compareWindow === undefined
          ? undefined
          : evaluateHistoryWindow(
              records,
              input,
              input.compareWindow.dateFrom,
              input.compareWindow.dateTo,
            );

      return {
        compare:
          compareWindowResult === undefined || compareWindowResult === null
            ? undefined
            : {
                delta:
                  typeof baseWindowResult.value === "number" &&
                  typeof compareWindowResult.value === "number"
                    ? baseWindowResult.value - compareWindowResult.value
                    : null,
                sampleSize: compareWindowResult.sampleSize,
                value: compareWindowResult.value,
                window: {
                  dateFrom: input.compareWindow?.dateFrom ?? null,
                  dateTo: input.compareWindow?.dateTo ?? null,
                },
              },
        details: baseWindowResult.details,
        filters: input.filters,
        metric: input.metric,
        ok: true,
        result: {
          sampleSize: baseWindowResult.sampleSize,
          sessions: baseWindowResult.sessions,
          unit: baseWindowResult.unit,
          value: baseWindowResult.value,
        },
        subject: input.subject,
        window: {
          dateFrom: input.filters.dateFrom ?? null,
          dateTo: input.filters.dateTo ?? null,
        },
      };
    },
  };
}

export function createWorkoutRouteService(db: AppDatabase): WorkoutRouteService {
  return {
    async loadWorkoutDetail(params: WorkoutDetailParams) {
      const record = await loadStoredWorkoutRecord(db, params.workoutId);
      const previousExercisesBySchemaId = await loadPreviousExercisesBySchemaId(db, record);

      return buildWorkoutDetail(record, previousExercisesBySchemaId);
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

      if (input.action === "delete_workout") {
        record.workout.updatedAt = getMutationTimestamp(input);
        record.workout.version += 1;

        const result = createMutationResult(input, record, "workout_deleted");

        await deleteStoredWorkoutRecord(db, record.workout.id, input.expectedVersion);

        return result;
      }

      const result = applyWorkoutMutation(record, input, getMutationTimestamp(input));

      await persistStoredWorkoutRecord(db, record, input.expectedVersion);

      return result;
    },
  };
}
