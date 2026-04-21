import type { WorkoutSet, WorkoutSetPersonalRecord } from "./contracts.ts";

interface GetWorkoutSetPersonalRecordInput {
  previousMaxWeightLbs: number | null;
  set: WorkoutSet;
}

/**
 * A set is a weight PR when its confirmed actual load exceeds every previously
 * confirmed load for that exercise schema.
 */
export function getWorkoutSetPersonalRecord({
  previousMaxWeightLbs,
  set,
}: GetWorkoutSetPersonalRecordInput): WorkoutSetPersonalRecord | null {
  if (set.confirmedAt == null || set.actual.weightLbs == null) {
    return null;
  }

  if (previousMaxWeightLbs != null && set.actual.weightLbs <= previousMaxWeightLbs) {
    return null;
  }

  return {
    kind: "weight",
    previousMaxWeightLbs,
  };
}

export function buildWorkoutSetPersonalRecords(
  sets: readonly WorkoutSet[],
  previousMaxWeightLbs: number | null,
) {
  const personalRecordsBySetId = new Map<WorkoutSet["id"], WorkoutSetPersonalRecord | null>();
  let runningMaxWeightLbs = previousMaxWeightLbs;

  for (const set of sets) {
    personalRecordsBySetId.set(
      set.id,
      getWorkoutSetPersonalRecord({
        previousMaxWeightLbs: runningMaxWeightLbs,
        set,
      }),
    );

    const actualWeightLbs = set.confirmedAt != null ? set.actual.weightLbs : null;

    if (actualWeightLbs == null) {
      continue;
    }

    runningMaxWeightLbs =
      runningMaxWeightLbs == null
        ? actualWeightLbs
        : Math.max(runningMaxWeightLbs, actualWeightLbs);
  }

  return personalRecordsBySetId;
}

export function countWorkoutSetPersonalRecords(sets: readonly WorkoutSet[]) {
  return sets.filter((set) => set.personalRecord != null).length;
}

export function countWorkoutPersonalRecords<TExercise extends { sets: readonly WorkoutSet[] }>(
  exercises: readonly TExercise[],
) {
  return exercises.reduce(
    (total, exercise) => total + countWorkoutSetPersonalRecords(exercise.sets),
    0,
  );
}
