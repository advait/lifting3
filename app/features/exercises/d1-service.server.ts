import type { AppDatabase } from "../../lib/.server/db/index.ts";
import {
  exerciseSets,
  workoutExercises,
  workouts,
  type ExerciseSetRow,
  type WorkoutExerciseRow,
  type WorkoutRow,
} from "../../lib/.server/db/schema.ts";

import type { ExerciseListItem, ExerciseListSearch } from "./contracts";
import { exerciseListItemSchema, exerciseListLoaderDataSchema } from "./contracts";
import { EXERCISE_SCHEMAS, type ExerciseSchema } from "./schema";

type ExerciseHistoryAggregate = {
  sessionWorkoutIds: Set<string>;
  totalSets: number;
  weightedSessionMaxByWorkoutId: Map<string, number>;
  workoutIds: Set<string>;
};

function createEmptyAggregate(): ExerciseHistoryAggregate {
  return {
    sessionWorkoutIds: new Set<string>(),
    totalSets: 0,
    weightedSessionMaxByWorkoutId: new Map<string, number>(),
    workoutIds: new Set<string>(),
  };
}

function getExerciseHistoryAggregate(
  aggregatesBySchemaId: Map<string, ExerciseHistoryAggregate>,
  exerciseSchemaId: string,
) {
  const existingAggregate = aggregatesBySchemaId.get(exerciseSchemaId);

  if (existingAggregate) {
    return existingAggregate;
  }

  const nextAggregate = createEmptyAggregate();
  aggregatesBySchemaId.set(exerciseSchemaId, nextAggregate);

  return nextAggregate;
}

function hasLoggedSetPerformance(set: ExerciseSetRow) {
  return (
    set.confirmedAt != null ||
    set.actualWeightLbs != null ||
    set.actualReps != null ||
    set.actualRpe != null
  );
}

function getWorkoutSortValue(workout: Pick<WorkoutRow, "date" | "id" | "updatedAt"> | undefined) {
  if (!workout) {
    return "";
  }

  return `${workout.date}::${workout.updatedAt}::${workout.id}`;
}

function getSessionMaxWeightLbs(setRows: readonly ExerciseSetRow[]) {
  let maxWeightLbs: number | null = null;

  for (const set of setRows) {
    if (set.actualWeightLbs == null) {
      continue;
    }

    maxWeightLbs =
      maxWeightLbs == null ? set.actualWeightLbs : Math.max(maxWeightLbs, set.actualWeightLbs);
  }

  return maxWeightLbs;
}

function getExerciseProgress(
  aggregate: ExerciseHistoryAggregate | undefined,
  workoutsById: ReadonlyMap<string, Pick<WorkoutRow, "date" | "id" | "updatedAt">>,
) {
  const weightedSessions = [...(aggregate?.weightedSessionMaxByWorkoutId.entries() ?? [])];

  if (weightedSessions.length === 0) {
    return {
      firstSessionMaxWeightLbs: null,
      latestSessionMaxWeightLbs: null,
    };
  }

  weightedSessions.sort(([workoutIdA], [workoutIdB]) =>
    getWorkoutSortValue(workoutsById.get(workoutIdA)).localeCompare(
      getWorkoutSortValue(workoutsById.get(workoutIdB)),
    ),
  );

  return {
    firstSessionMaxWeightLbs: weightedSessions[0]?.[1] ?? null,
    latestSessionMaxWeightLbs: weightedSessions.at(-1)?.[1] ?? null,
  };
}

function buildExerciseHistoryBySchemaId(
  exerciseRows: readonly WorkoutExerciseRow[],
  setRows: readonly ExerciseSetRow[],
) {
  const setRowsByExerciseId = new Map<string, ExerciseSetRow[]>();

  for (const set of setRows) {
    const existingSetRows = setRowsByExerciseId.get(set.exerciseId) ?? [];
    existingSetRows.push(set);
    setRowsByExerciseId.set(set.exerciseId, existingSetRows);
  }

  const aggregatesBySchemaId = new Map<string, ExerciseHistoryAggregate>();

  for (const exercise of exerciseRows) {
    const aggregate = getExerciseHistoryAggregate(aggregatesBySchemaId, exercise.exerciseSchemaId);
    const relatedSetRows = setRowsByExerciseId.get(exercise.id) ?? [];
    let hasLoggedSession = false;
    const sessionMaxWeightLbs = getSessionMaxWeightLbs(relatedSetRows);

    aggregate.workoutIds.add(exercise.workoutId);
    aggregate.totalSets += relatedSetRows.length;

    for (const set of relatedSetRows) {
      if (hasLoggedSetPerformance(set)) {
        hasLoggedSession = true;
      }
    }

    if (hasLoggedSession) {
      aggregate.sessionWorkoutIds.add(exercise.workoutId);
    }

    if (sessionMaxWeightLbs != null) {
      const existingMaxWeightLbs = aggregate.weightedSessionMaxByWorkoutId.get(exercise.workoutId);
      aggregate.weightedSessionMaxByWorkoutId.set(
        exercise.workoutId,
        existingMaxWeightLbs == null
          ? sessionMaxWeightLbs
          : Math.max(existingMaxWeightLbs, sessionMaxWeightLbs),
      );
    }
  }

  return aggregatesBySchemaId;
}

function buildExerciseListItem(
  exerciseSchema: ExerciseSchema,
  aggregate: ExerciseHistoryAggregate | undefined,
  workoutsById: ReadonlyMap<string, Pick<WorkoutRow, "date" | "id" | "updatedAt">>,
) {
  return exerciseListItemSchema.parse({
    classification: exerciseSchema.classification,
    displayName: exerciseSchema.displayName,
    equipment: exerciseSchema.equipment,
    exerciseSchemaId: exerciseSchema.id,
    exerciseSlug: exerciseSchema.slug,
    hasDone: (aggregate?.sessionWorkoutIds.size ?? 0) > 0,
    logging: exerciseSchema.logging,
    movementPattern: exerciseSchema.movementPattern,
    progress: getExerciseProgress(aggregate, workoutsById),
    totalSets: aggregate?.totalSets ?? 0,
    totalWorkouts: aggregate?.workoutIds.size ?? 0,
  });
}

function matchesExerciseSearch(item: ExerciseListItem, search: ExerciseListSearch) {
  if (search.type && item.classification !== search.type) {
    return false;
  }

  if (search.equipment && !item.equipment.includes(search.equipment)) {
    return false;
  }

  switch (search.history) {
    case "done":
      return item.hasDone;
    case "not_done":
      return !item.hasDone;
    default:
      return true;
  }
}

function sortExerciseItems(a: ExerciseListItem, b: ExerciseListItem) {
  const byHaveDone = Number(b.hasDone) - Number(a.hasDone);

  if (byHaveDone !== 0) {
    return byHaveDone;
  }

  const byTotalSets = b.totalSets - a.totalSets;

  if (byTotalSets !== 0) {
    return byTotalSets;
  }

  const byTotalWorkouts = b.totalWorkouts - a.totalWorkouts;

  if (byTotalWorkouts !== 0) {
    return byTotalWorkouts;
  }

  const byLatestProgress =
    (b.progress.latestSessionMaxWeightLbs ?? -1) - (a.progress.latestSessionMaxWeightLbs ?? -1);

  if (byLatestProgress !== 0) {
    return byLatestProgress;
  }

  return a.displayName.localeCompare(b.displayName);
}

export function createExerciseRouteService(db: AppDatabase) {
  return {
    async loadExerciseList(search: ExerciseListSearch) {
      const [exerciseRows, setRows, workoutRows] = await Promise.all([
        db.select().from(workoutExercises),
        db.select().from(exerciseSets),
        db
          .select({ date: workouts.date, id: workouts.id, updatedAt: workouts.updatedAt })
          .from(workouts),
      ]);
      const aggregatesBySchemaId = buildExerciseHistoryBySchemaId(exerciseRows, setRows);
      const workoutsById = new Map(workoutRows.map((workout) => [workout.id, workout]));
      const items = EXERCISE_SCHEMAS.map((exerciseSchema) =>
        buildExerciseListItem(
          exerciseSchema,
          aggregatesBySchemaId.get(exerciseSchema.id),
          workoutsById,
        ),
      )
        .filter((item) => matchesExerciseSearch(item, search))
        .sort(sortExerciseItems);

      return exerciseListLoaderDataSchema.parse({
        filters: search,
        items,
      });
    },
  };
}
