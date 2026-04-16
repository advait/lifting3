import {
  createExerciseInvalidateKey,
  createWorkoutInvalidateKey,
  uniqueInvalidateKeys,
} from "../app-events/schema.ts";
import { getExerciseSchemaById } from "../exercises/schema.ts";
import type {
  WorkoutDetailParams,
  WorkoutDetailWorkout,
  WorkoutExerciseState,
  WorkoutListSearch,
  WorkoutMutationInput,
  WorkoutMutationResult,
  WorkoutSet,
} from "./contracts.ts";
import {
  workoutDetailLoaderDataSchema,
  workoutExerciseSchema,
  workoutExerciseStateSchema,
  workoutListItemSchema,
  workoutListLoaderDataSchema,
  workoutMutationResultSchema,
  workoutSetCountsSchema,
  workoutSetSchema,
} from "./contracts.ts";
import type { WorkoutRouteService } from "./service.ts";

interface StoredWorkoutRecord {
  exercises: WorkoutExerciseState[];
  workout: WorkoutDetailWorkout;
}

type MutationHandler<K extends WorkoutMutationInput["action"]> = (
  record: StoredWorkoutRecord,
  input: Extract<WorkoutMutationInput, { action: K }>,
  updatedAt: string
) => WorkoutMutationResult;

export class FixtureWorkoutNotFoundError extends Error {
  constructor(workoutId: string) {
    super(`Unknown workout fixture: ${workoutId}`);
  }
}

export class FixtureWorkoutConflictError extends Error {
  constructor(workoutId: string, expectedVersion: number, currentVersion: number) {
    super(
      `Version mismatch for ${workoutId}: expected ${expectedVersion}, got ${currentVersion}`
    );
  }
}

export class FixtureWorkoutMutationError extends Error {}

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

function createSeedWorkouts() {
  const records: StoredWorkoutRecord[] = [
    {
      exercises: [
        createExercise({
          exerciseSchemaId: "deadlift_barbell",
          id: "exercise-active-deadlift",
          orderIndex: 0,
          sets: [
            createSet({
              actual: { reps: 5, weightLbs: 225 },
              designation: "warmup",
              id: "set-active-deadlift-1",
              orderIndex: 0,
              planned: { reps: 5, weightLbs: 225 },
              status: "tbd",
            }),
            createSet({
              designation: "working",
              id: "set-active-deadlift-2",
              orderIndex: 1,
              planned: { reps: 5, weightLbs: 275 },
              status: "tbd",
            }),
            createSet({
              completedAt: "2026-04-16T00:12:00.000Z",
              designation: "working",
              id: "set-active-deadlift-3",
              orderIndex: 2,
              planned: { reps: 5, weightLbs: 295 },
              actual: { reps: 5, rpe: 8, weightLbs: 295 },
              status: "done",
            }),
          ],
          status: "active",
          userNotes: "Brace hard before the pull.",
        }),
        createExercise({
          exerciseSchemaId: "split_squat_dumbbell",
          id: "exercise-active-split-squat",
          orderIndex: 1,
          sets: [
            createSet({
              designation: "working",
              id: "set-active-split-squat-1",
              orderIndex: 0,
              planned: { reps: 10, weightLbs: 40 },
              status: "tbd",
            }),
            createSet({
              designation: "working",
              id: "set-active-split-squat-2",
              orderIndex: 1,
              planned: { reps: 10, weightLbs: 40 },
              status: "tbd",
            }),
          ],
          status: "planned",
        }),
        createExercise({
          exerciseSchemaId: "cable_core_pallof_press",
          id: "exercise-active-pallof",
          orderIndex: 2,
          sets: [
            createSet({
              designation: "working",
              id: "set-active-pallof-1",
              orderIndex: 0,
              planned: { reps: 12, weightLbs: 25 },
              status: "tbd",
            }),
          ],
          status: "planned",
        }),
      ],
      workout: {
        coachNotes: "Keep the session crisp and cut accessories if fatigue spikes.",
        completedAt: null,
        createdAt: "2026-04-16T00:00:00.000Z",
        date: "2026-04-16T00:00:00.000Z",
        id: "workout-active-lower-a",
        source: "manual",
        startedAt: "2026-04-16T00:05:00.000Z",
        status: "active",
        title: "Lower A",
        updatedAt: "2026-04-16T00:15:00.000Z",
        userNotes: "Low back feels fine, but keep the pace tight.",
        version: 7,
      } satisfies WorkoutDetailWorkout,
    },
    {
      exercises: [
        createExercise({
          exerciseSchemaId: "bench_press_barbell",
          id: "exercise-completed-bench",
          orderIndex: 0,
          sets: [
            createSet({
              completedAt: "2026-04-14T18:10:00.000Z",
              designation: "working",
              id: "set-completed-bench-1",
              orderIndex: 0,
              planned: { reps: 8, weightLbs: 175 },
              actual: { reps: 8, rpe: 8.5, weightLbs: 175 },
              status: "done",
            }),
            createSet({
              completedAt: "2026-04-14T18:16:00.000Z",
              designation: "working",
              id: "set-completed-bench-2",
              orderIndex: 1,
              planned: { reps: 8, weightLbs: 175 },
              actual: { reps: 8, rpe: 9, weightLbs: 175 },
              status: "done",
            }),
          ],
          status: "completed",
        }),
        createExercise({
          exerciseSchemaId: "machine_row",
          id: "exercise-completed-row",
          orderIndex: 1,
          sets: [
            createSet({
              completedAt: "2026-04-14T18:26:00.000Z",
              designation: "working",
              id: "set-completed-row-1",
              orderIndex: 0,
              planned: { reps: 12, weightLbs: 110 },
              actual: { reps: 12, rpe: 8, weightLbs: 110 },
              status: "done",
            }),
            createSet({
              designation: "working",
              id: "set-completed-row-2",
              orderIndex: 1,
              planned: { reps: 12, weightLbs: 110 },
              status: "tbd",
            }),
          ],
          status: "completed",
          coachNotes: "Leave one clean rep in reserve.",
        }),
      ],
      workout: {
        coachNotes: "Bench volume moved well. Keep rows strict next time.",
        completedAt: "2026-04-14T18:40:00.000Z",
        createdAt: "2026-04-14T17:45:00.000Z",
        date: "2026-04-14T00:00:00.000Z",
        id: "workout-completed-upper-a",
        source: "agent",
        startedAt: "2026-04-14T17:55:00.000Z",
        status: "completed",
        title: "Upper A",
        updatedAt: "2026-04-14T18:40:00.000Z",
        userNotes: "Shoulder felt better after the first warmup set.",
        version: 4,
      } satisfies WorkoutDetailWorkout,
    },
    {
      exercises: [
        createExercise({
          exerciseSchemaId: "seated_overhead_press_dumbbell",
          id: "exercise-planned-ohp",
          orderIndex: 0,
          sets: [
            createSet({
              designation: "working",
              id: "set-planned-ohp-1",
              orderIndex: 0,
              planned: { reps: 10, weightLbs: 45 },
              status: "tbd",
            }),
            createSet({
              designation: "working",
              id: "set-planned-ohp-2",
              orderIndex: 1,
              planned: { reps: 10, weightLbs: 45 },
              status: "tbd",
            }),
          ],
        }),
        createExercise({
          exerciseSchemaId: "chest_supported_incline_row_dumbbell",
          id: "exercise-planned-row",
          orderIndex: 1,
          sets: [
            createSet({
              designation: "working",
              id: "set-planned-row-1",
              orderIndex: 0,
              planned: { reps: 12, weightLbs: 50 },
              status: "tbd",
            }),
          ],
        }),
      ],
      workout: {
        coachNotes: "Planned as a lighter upper session after deadlifts.",
        completedAt: null,
        createdAt: "2026-04-16T00:20:00.000Z",
        date: "2026-04-18T00:00:00.000Z",
        id: "workout-planned-press-pull",
        source: "agent",
        startedAt: null,
        status: "planned",
        title: "Press + Pull",
        updatedAt: "2026-04-16T00:20:00.000Z",
        userNotes: null,
        version: 1,
      } satisfies WorkoutDetailWorkout,
    },
  ];

  return new Map(records.map((record) => [record.workout.id, cloneValue(record)]));
}

const fixtureWorkouts = createSeedWorkouts();

function getStoredWorkoutRecord(workoutId: string) {
  const record = fixtureWorkouts.get(workoutId);

  if (!record) {
    throw new FixtureWorkoutNotFoundError(workoutId);
  }

  return record;
}

function assertExpectedVersion(
  record: StoredWorkoutRecord,
  expectedVersion: number
) {
  if (record.workout.version !== expectedVersion) {
    throw new FixtureWorkoutConflictError(
      record.workout.id,
      expectedVersion,
      record.workout.version
    );
  }
}

function bumpWorkoutVersion(record: StoredWorkoutRecord, updatedAt: string) {
  record.workout.updatedAt = updatedAt;
  record.workout.version += 1;
}

function reindexExercises(exercises: WorkoutExerciseState[]) {
  exercises.forEach((exercise, index) => {
    exercise.orderIndex = index;
  });
}

function reindexSets(sets: WorkoutSet[]) {
  sets.forEach((set, index) => {
    set.orderIndex = index;
  });
}

function findExercise(record: StoredWorkoutRecord, exerciseId: string) {
  const exercise = record.exercises.find((item) => item.id === exerciseId);

  if (!exercise) {
    throw new FixtureWorkoutMutationError(`Unknown exercise: ${exerciseId}`);
  }

  return exercise;
}

function findSet(exercise: WorkoutExerciseState, setId: string) {
  const set = exercise.sets.find((item) => item.id === setId);

  if (!set) {
    throw new FixtureWorkoutMutationError(`Unknown set: ${setId}`);
  }

  return set;
}

function createMutationResult(
  input: WorkoutMutationInput,
  record: StoredWorkoutRecord,
  eventType: WorkoutMutationResult["eventType"],
  additionalInvalidations: readonly WorkoutMutationResult["invalidate"][number][] = []
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

function matchesWorkoutSearch(
  record: StoredWorkoutRecord,
  search: WorkoutListSearch
) {
  if (
    search.status.length > 0 &&
    !search.status.includes(record.workout.status)
  ) {
    return false;
  }

  if (
    search.source.length > 0 &&
    !search.source.includes(record.workout.source)
  ) {
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
    !record.exercises.some((exercise) =>
      getExerciseSchemaById(exercise.exerciseSchemaId)
        ?.displayName.toLowerCase()
        .includes(exerciseQuery) ?? false
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

const startWorkout: MutationHandler<"start_workout"> = (
  record,
  input,
  updatedAt
) => {
  record.workout.status = "active";
  record.workout.startedAt = input.startedAt ?? updatedAt;
  bumpWorkoutVersion(record, updatedAt);

  return createMutationResult(input, record, "workout_started");
};

const updateSetActuals: MutationHandler<"update_set_actuals"> = (
  record,
  input,
  updatedAt
) => {
  const exercise = findExercise(record, input.exerciseId);
  const set = findSet(exercise, input.setId);

  if (set.status === "skipped") {
    throw new FixtureWorkoutMutationError(
      "Skipped sets cannot accept actual-field updates."
    );
  }

  set.actual = {
    ...set.actual,
    ...input.actual,
  };
  bumpWorkoutVersion(record, updatedAt);

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
  bumpWorkoutVersion(record, updatedAt);

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
  bumpWorkoutVersion(record, updatedAt);

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
    })
  );
  reindexSets(exercise.sets);
  bumpWorkoutVersion(record, updatedAt);

  return createMutationResult(input, record, "set_added", [
    createExerciseInvalidateKey(exercise.exerciseSchemaId),
  ]);
};

const removeSet: MutationHandler<"remove_set"> = (record, input, updatedAt) => {
  const exercise = findExercise(record, input.exerciseId);
  const setIndex = exercise.sets.findIndex((set) => set.id === input.setId);

  if (setIndex < 0) {
    throw new FixtureWorkoutMutationError(`Unknown set: ${input.setId}`);
  }

  if (exercise.sets[setIndex].status === "done") {
    throw new FixtureWorkoutMutationError(
      "Completed sets are not removable in the fixture reducer."
    );
  }

  exercise.sets.splice(setIndex, 1);
  reindexSets(exercise.sets);
  bumpWorkoutVersion(record, updatedAt);

  return createMutationResult(input, record, "set_removed", [
    createExerciseInvalidateKey(exercise.exerciseSchemaId),
  ]);
};

const reorderExercise: MutationHandler<"reorder_exercise"> = (
  record,
  input,
  updatedAt
) => {
  const exerciseIndex = record.exercises.findIndex(
    (exercise) => exercise.id === input.exerciseId
  );

  if (exerciseIndex < 0) {
    throw new FixtureWorkoutMutationError(`Unknown exercise: ${input.exerciseId}`);
  }

  const boundedTargetIndex = Math.max(
    0,
    Math.min(input.targetIndex, record.exercises.length - 1)
  );
  const [exercise] = record.exercises.splice(exerciseIndex, 1);

  record.exercises.splice(boundedTargetIndex, 0, exercise);
  reindexExercises(record.exercises);
  bumpWorkoutVersion(record, updatedAt);

  return createMutationResult(input, record, "exercise_reordered");
};

const updateWorkoutNotes: MutationHandler<"update_workout_notes"> = (
  record,
  input,
  updatedAt
) => {
  if (input.notes.userNotes !== undefined) {
    record.workout.userNotes = input.notes.userNotes;
  }

  if (input.notes.coachNotes !== undefined) {
    record.workout.coachNotes = input.notes.coachNotes;
  }

  bumpWorkoutVersion(record, updatedAt);

  return createMutationResult(input, record, "workout_note_updated");
};

const updateExerciseNotes: MutationHandler<"update_exercise_notes"> = (
  record,
  input,
  updatedAt
) => {
  const exercise = findExercise(record, input.exerciseId);

  if (input.notes.userNotes !== undefined) {
    exercise.userNotes = input.notes.userNotes;
  }

  if (input.notes.coachNotes !== undefined) {
    exercise.coachNotes = input.notes.coachNotes;
  }

  bumpWorkoutVersion(record, updatedAt);

  return createMutationResult(input, record, "exercise_note_updated", [
    createExerciseInvalidateKey(exercise.exerciseSchemaId),
  ]);
};

const finishWorkout: MutationHandler<"finish_workout"> = (
  record,
  input,
  updatedAt
) => {
  record.workout.completedAt = input.completedAt ?? updatedAt;
  record.workout.status = "completed";
  bumpWorkoutVersion(record, updatedAt);

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
  updatedAt: string
) {
  const handler = mutationHandlers[input.action] as MutationHandler<
    typeof input.action
  >;

  return handler(record, input, updatedAt);
}

const fixtureWorkoutRouteService: WorkoutRouteService = {
  loadWorkoutDetail(params: WorkoutDetailParams) {
    return Promise.resolve(
      buildWorkoutDetail(getStoredWorkoutRecord(params.workoutId))
    );
  },

  loadWorkoutList(search: WorkoutListSearch) {
    const items = [...fixtureWorkouts.values()]
      .filter((record) => matchesWorkoutSearch(record, search))
      .sort((left, right) => right.workout.date.localeCompare(left.workout.date))
      .map(buildWorkoutListItem);
    const activeWorkout = [...fixtureWorkouts.values()].find(
      (record) => record.workout.status === "active"
    );

    return Promise.resolve(
      workoutListLoaderDataSchema.parse({
        activeWorkoutId: activeWorkout?.workout.id ?? null,
        filters: search,
        items,
      })
    );
  },

  mutateWorkout(input: WorkoutMutationInput) {
    const record = getStoredWorkoutRecord(input.workoutId);

    assertExpectedVersion(record, input.expectedVersion);

    return Promise.resolve(
      applyWorkoutMutation(record, input, getMutationTimestamp(input))
    );
  },
};

/** Provides the mutable in-memory service used by the RR7 fixture slice. */
export function getWorkoutRouteService() {
  return fixtureWorkoutRouteService;
}
