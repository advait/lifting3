import type { WorkoutMutationInput } from "./actions.ts";
import type { WorkoutDetailLoaderData, WorkoutExercise, WorkoutSet } from "./contracts.ts";
import { workoutSetSchema } from "./contracts.ts";
import { safeParseWorkoutMutationFormData } from "./mutation-form.ts";
import { cascadeSetReps, cascadeSetWeightLbs } from "./set-weight-cascade.ts";

const SET_LOAD_VALUE_KEYS = ["rpe", "weightLbs"] as const;

export interface PendingWorkoutMutationSource {
  readonly formData: FormData | null | undefined;
  readonly key: string;
}

export interface PendingWorkoutMutation {
  readonly key: string;
  readonly mutation: WorkoutMutationInput;
}

function cloneSet(set: WorkoutSet): WorkoutSet {
  return {
    ...set,
    actual: { ...set.actual },
    planned: { ...set.planned },
    previous: set.previous ? { ...set.previous } : null,
  };
}

function cloneExercise(exercise: WorkoutExercise): WorkoutExercise {
  return {
    ...exercise,
    sets: exercise.sets.map(cloneSet),
  };
}

function cloneWorkoutDetailLoaderData(
  loaderData: WorkoutDetailLoaderData,
): WorkoutDetailLoaderData {
  return {
    ...loaderData,
    exercises: loaderData.exercises.map(cloneExercise),
    progress: { ...loaderData.progress },
    workout: { ...loaderData.workout },
  };
}

function mergeDefinedSetLoadValues(
  current: WorkoutSet["planned"],
  patch: Partial<WorkoutSet["planned"]> | undefined,
) {
  const next = { ...current };

  for (const key of SET_LOAD_VALUE_KEYS) {
    const value = patch?.[key];

    if (value !== undefined) {
      next[key] = value;
    }
  }

  return next;
}

function applyDefinedReps(set: WorkoutSet, reps: WorkoutSet["reps"] | undefined) {
  if (reps !== undefined) {
    set.reps = reps;
  }
}

function isSetConfirmed(set: WorkoutSet) {
  return set.confirmedAt != null;
}

function getExerciseCompletionStatus(sets: readonly WorkoutSet[]): WorkoutExercise["status"] {
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

function syncExerciseStatus(exercise: WorkoutExercise) {
  if (exercise.status === "replaced" || exercise.status === "skipped") {
    return;
  }

  exercise.status = getExerciseCompletionStatus(exercise.sets);
}

function reindexSets(sets: WorkoutSet[]) {
  for (const [index, set] of sets.entries()) {
    set.orderIndex = index;
  }
}

function reindexExercises(exercises: WorkoutExercise[]) {
  for (const [index, exercise] of exercises.entries()) {
    exercise.orderIndex = index;
  }
}

function createOptimisticSet(
  key: string,
  input: {
    designation: WorkoutSet["designation"];
    orderIndex: number;
    planned: Partial<WorkoutSet["planned"]> | undefined;
    reps: WorkoutSet["reps"] | undefined;
  },
) {
  return workoutSetSchema.parse({
    actual: {
      rpe: null,
      weightLbs: null,
    },
    confirmedAt: null,
    designation: input.designation,
    id: `optimistic-set:${key}`,
    orderIndex: input.orderIndex,
    planned: {
      rpe: input.planned?.rpe ?? null,
      weightLbs: input.planned?.weightLbs ?? null,
    },
    previous: null,
    reps: input.reps ?? null,
  });
}

function getWorkoutSetCounts(exercises: readonly WorkoutExercise[]) {
  const total = exercises.reduce((count, exercise) => count + exercise.sets.length, 0);
  const confirmed = exercises.reduce(
    (count, exercise) => count + exercise.sets.filter(isSetConfirmed).length,
    0,
  );

  return {
    confirmed,
    total,
    unconfirmed: total - confirmed,
  };
}

function findExercise(loaderData: WorkoutDetailLoaderData, exerciseId: string) {
  return loaderData.exercises.find((exercise) => exercise.id === exerciseId) ?? null;
}

function findSet(exercise: WorkoutExercise, setId: string) {
  return exercise.sets.find((set) => set.id === setId) ?? null;
}

function getMutationTimestamp(mutation: WorkoutMutationInput) {
  if (mutation.action === "finish_workout" && mutation.completedAt) {
    return mutation.completedAt;
  }

  if (mutation.action === "start_workout" && mutation.startedAt) {
    return mutation.startedAt;
  }

  return new Date().toISOString();
}

function applyPendingMutation(
  loaderData: WorkoutDetailLoaderData,
  pendingMutation: PendingWorkoutMutation,
  updatedAt: string,
) {
  const { mutation } = pendingMutation;

  switch (mutation.action) {
    case "delete_workout":
      return false;
    case "start_workout": {
      loaderData.workout.status = "active";
      loaderData.workout.startedAt = mutation.startedAt ?? updatedAt;
      loaderData.workout.completedAt = null;
      return true;
    }
    case "finish_workout": {
      loaderData.workout.completedAt = mutation.completedAt ?? updatedAt;
      loaderData.workout.status = "completed";
      return true;
    }
    case "update_workout_notes": {
      if (mutation.notes.userNotes !== undefined) {
        loaderData.workout.userNotes = mutation.notes.userNotes;
      }

      if (mutation.notes.coachNotes !== undefined) {
        loaderData.workout.coachNotes = mutation.notes.coachNotes;
      }

      return true;
    }
    case "update_exercise_notes": {
      const exercise = findExercise(loaderData, mutation.exerciseId);

      if (!exercise) {
        return false;
      }

      if (mutation.notes.userNotes !== undefined) {
        exercise.userNotes = mutation.notes.userNotes;
      }

      if (mutation.notes.coachNotes !== undefined) {
        exercise.coachNotes = mutation.notes.coachNotes;
      }

      return true;
    }
    case "update_set_planned": {
      if (loaderData.workout.status !== "planned") {
        return false;
      }

      const exercise = findExercise(loaderData, mutation.exerciseId);
      const set = exercise ? findSet(exercise, mutation.setId) : null;

      if (!exercise || !set) {
        return false;
      }

      cascadeSetWeightLbs(exercise.sets, {
        mode: "planned",
        nextWeightLbs: mutation.planned?.weightLbs,
        setId: mutation.setId,
      });
      cascadeSetReps(exercise.sets, {
        nextValue: mutation.reps,
        setId: mutation.setId,
      });
      set.planned = mergeDefinedSetLoadValues(set.planned, mutation.planned);
      applyDefinedReps(set, mutation.reps);
      return true;
    }
    case "update_set_actuals": {
      const exercise = findExercise(loaderData, mutation.exerciseId);
      const set = exercise ? findSet(exercise, mutation.setId) : null;

      if (!exercise || !set) {
        return false;
      }

      cascadeSetWeightLbs(exercise.sets, {
        mode: "actual",
        nextWeightLbs: mutation.actual?.weightLbs,
        setId: mutation.setId,
      });
      cascadeSetReps(exercise.sets, {
        nextValue: mutation.reps,
        setId: mutation.setId,
      });
      const nextActual = mergeDefinedSetLoadValues(set.actual, mutation.actual);
      const nextReps = mutation.reps !== undefined ? mutation.reps : set.reps;

      if (
        isSetConfirmed(set) &&
        nextActual.weightLbs == null &&
        nextActual.rpe == null &&
        nextReps == null
      ) {
        return false;
      }

      set.actual = nextActual;
      applyDefinedReps(set, mutation.reps);
      return true;
    }
    case "update_set_designation": {
      const exercise = findExercise(loaderData, mutation.exerciseId);
      const set = exercise ? findSet(exercise, mutation.setId) : null;

      if (!set) {
        return false;
      }

      set.designation = mutation.designation;
      return true;
    }
    case "confirm_set": {
      const exercise = findExercise(loaderData, mutation.exerciseId);
      const set = exercise ? findSet(exercise, mutation.setId) : null;

      if (!exercise || !set) {
        return false;
      }

      const nextActual = mergeDefinedSetLoadValues(set.actual, mutation.actual);
      const nextReps = mutation.reps !== undefined ? mutation.reps : set.reps;

      if (nextActual.weightLbs == null && nextActual.rpe == null && nextReps == null) {
        return false;
      }

      set.actual = nextActual;
      applyDefinedReps(set, mutation.reps);
      set.confirmedAt = updatedAt;
      syncExerciseStatus(exercise);
      return true;
    }
    case "unconfirm_set": {
      const exercise = findExercise(loaderData, mutation.exerciseId);
      const set = exercise ? findSet(exercise, mutation.setId) : null;

      if (!exercise || !set) {
        return false;
      }

      set.confirmedAt = null;
      syncExerciseStatus(exercise);
      return true;
    }
    case "add_set": {
      const exercise = findExercise(loaderData, mutation.exerciseId);

      if (!exercise) {
        return false;
      }

      const insertAfterIndex =
        mutation.insertAfterSetId == null
          ? exercise.sets.length - 1
          : exercise.sets.findIndex((set) => set.id === mutation.insertAfterSetId);
      const insertAt = insertAfterIndex < 0 ? exercise.sets.length : insertAfterIndex + 1;

      exercise.sets.splice(
        insertAt,
        0,
        createOptimisticSet(pendingMutation.key, {
          designation: mutation.designation,
          orderIndex: insertAt,
          planned: mutation.planned,
          reps: mutation.reps,
        }),
      );
      reindexSets(exercise.sets);
      syncExerciseStatus(exercise);
      return true;
    }
    case "remove_set": {
      const exercise = findExercise(loaderData, mutation.exerciseId);

      if (!exercise) {
        return false;
      }

      const setIndex = exercise.sets.findIndex((set) => set.id === mutation.setId);

      if (setIndex < 0 || isSetConfirmed(exercise.sets[setIndex])) {
        return false;
      }

      exercise.sets.splice(setIndex, 1);
      reindexSets(exercise.sets);
      syncExerciseStatus(exercise);
      return true;
    }
    case "remove_exercise": {
      const exerciseIndex = loaderData.exercises.findIndex(
        (exercise) => exercise.id === mutation.exerciseId,
      );

      if (exerciseIndex < 0) {
        return false;
      }

      if (loaderData.exercises[exerciseIndex]?.sets.some(isSetConfirmed)) {
        return false;
      }

      loaderData.exercises.splice(exerciseIndex, 1);
      reindexExercises(loaderData.exercises);
      return true;
    }
    case "reorder_exercise": {
      const exerciseIndex = loaderData.exercises.findIndex(
        (exercise) => exercise.id === mutation.exerciseId,
      );

      if (exerciseIndex < 0) {
        return false;
      }

      const boundedTargetIndex = Math.max(
        0,
        Math.min(mutation.targetIndex, loaderData.exercises.length - 1),
      );
      const [exercise] = loaderData.exercises.splice(exerciseIndex, 1);

      if (!exercise) {
        return false;
      }

      loaderData.exercises.splice(boundedTargetIndex, 0, exercise);
      reindexExercises(loaderData.exercises);
      return true;
    }
  }
}

export function getPendingWorkoutMutations(
  sources: readonly PendingWorkoutMutationSource[],
  workoutId: string,
): PendingWorkoutMutation[] {
  const pendingMutations: PendingWorkoutMutation[] = [];

  for (const source of sources) {
    if (!source.formData) {
      continue;
    }

    const parsedMutation = safeParseWorkoutMutationFormData(source.formData);

    if (!parsedMutation.success || parsedMutation.data.workoutId !== workoutId) {
      continue;
    }

    pendingMutations.push({
      key: source.key,
      mutation: parsedMutation.data,
    });
  }

  return pendingMutations;
}

export function applyOptimisticWorkoutDetail(
  loaderData: WorkoutDetailLoaderData,
  pendingMutations: readonly PendingWorkoutMutation[],
): WorkoutDetailLoaderData {
  if (pendingMutations.length === 0) {
    return loaderData;
  }

  const optimisticLoaderData = cloneWorkoutDetailLoaderData(loaderData);

  for (const pendingMutation of pendingMutations) {
    const updatedAt = getMutationTimestamp(pendingMutation.mutation);
    const didApplyMutation = applyPendingMutation(optimisticLoaderData, pendingMutation, updatedAt);

    if (!didApplyMutation) {
      continue;
    }

    optimisticLoaderData.loadedAt = updatedAt;
    optimisticLoaderData.workout.updatedAt = updatedAt;
    optimisticLoaderData.workout.version += 1;
  }

  optimisticLoaderData.progress = getWorkoutSetCounts(optimisticLoaderData.exercises);

  return optimisticLoaderData;
}
