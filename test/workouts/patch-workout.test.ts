import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";

import { EXERCISE_SCHEMA_IDS } from "../../app/features/exercises/schema";
import {
  createWorkoutAgentToolService,
  createWorkoutRouteService,
} from "../../app/features/workouts/d1-service.server";
import type { SetKind, SetStatus, WorkoutStatus } from "../../app/features/workouts/interchange";
import * as dbSchema from "../../app/lib/.server/db/schema";

const db = drizzle(env.DB, { schema: dbSchema });
const workoutToolService = createWorkoutAgentToolService(db);
const workoutRouteService = createWorkoutRouteService(db);

type ExerciseSchemaId = (typeof EXERCISE_SCHEMA_IDS)[number];
type ExerciseStatus = "planned" | "active" | "completed" | "skipped" | "replaced";
type WorkoutSource = "manual" | "imported" | "agent";
type SeedValues = {
  reps?: number | null;
  rpe?: number | null;
  weightLbs?: number | null;
};
type SeedSet = {
  actual?: SeedValues;
  completedAt?: string | null;
  designation?: SetKind;
  id: string;
  planned?: SeedValues;
  status?: SetStatus;
};
type SeedExercise = {
  coachNotes?: string | null;
  exerciseSchemaId: ExerciseSchemaId;
  id: string;
  sets: SeedSet[];
  status?: ExerciseStatus;
  userNotes?: string | null;
};
type SeedWorkout = {
  coachNotes?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  date: string;
  exercises: SeedExercise[];
  id: string;
  source?: WorkoutSource;
  startedAt?: string | null;
  status?: WorkoutStatus;
  title: string;
  updatedAt?: string;
  userNotes?: string | null;
  version?: number;
};

const DEFAULT_CREATED_AT = "2026-04-16T09:00:00.000Z";

function createStoredValues(values?: SeedValues) {
  return {
    reps: values?.reps ?? null,
    rpe: values?.rpe ?? null,
    weightLbs: values?.weightLbs ?? null,
  };
}

async function resetWorkoutTables() {
  await db.delete(dbSchema.exerciseSets);
  await db.delete(dbSchema.workoutExercises);
  await db.delete(dbSchema.workouts);
}

async function insertSeedWorkout(workout: SeedWorkout) {
  const workoutRow: typeof dbSchema.workouts.$inferInsert = {
    coachNotes: workout.coachNotes ?? null,
    completedAt: workout.completedAt ?? null,
    createdAt: workout.createdAt ?? DEFAULT_CREATED_AT,
    date: workout.date,
    id: workout.id,
    source: workout.source ?? "manual",
    startedAt: workout.startedAt ?? null,
    status: workout.status ?? "active",
    title: workout.title,
    updatedAt: workout.updatedAt ?? workout.createdAt ?? DEFAULT_CREATED_AT,
    userNotes: workout.userNotes ?? null,
    version: workout.version ?? 1,
  };
  const exerciseRows: (typeof dbSchema.workoutExercises.$inferInsert)[] = [];
  const setRows: (typeof dbSchema.exerciseSets.$inferInsert)[] = [];

  for (const [exerciseIndex, exercise] of workout.exercises.entries()) {
    exerciseRows.push({
      coachNotes: exercise.coachNotes ?? null,
      exerciseSchemaId: exercise.exerciseSchemaId,
      id: exercise.id,
      orderIndex: exerciseIndex,
      status: exercise.status ?? "planned",
      userNotes: exercise.userNotes ?? null,
      workoutId: workout.id,
    });

    for (const [setIndex, set] of exercise.sets.entries()) {
      const actual = createStoredValues(set.actual);
      const planned = createStoredValues(set.planned);

      setRows.push({
        actualReps: actual.reps,
        actualRpe: actual.rpe,
        actualWeightLbs: actual.weightLbs,
        completedAt: set.completedAt ?? null,
        designation: set.designation ?? "working",
        exerciseId: exercise.id,
        id: set.id,
        orderIndex: setIndex,
        plannedReps: planned.reps,
        plannedRpe: planned.rpe,
        plannedWeightLbs: planned.weightLbs,
        status: set.status ?? "tbd",
      });
    }
  }

  await db.insert(dbSchema.workouts).values(workoutRow);

  if (exerciseRows.length > 0) {
    await db.insert(dbSchema.workoutExercises).values(exerciseRows);
  }

  if (setRows.length > 0) {
    await db.insert(dbSchema.exerciseSets).values(setRows);
  }
}

beforeEach(async () => {
  await resetWorkoutTables();
});

describe("createWorkoutAgentToolService.patchWorkout", () => {
  it("preserves completed work when replacing an exercise mid-workout", async () => {
    await insertSeedWorkout({
      date: "2026-04-16T00:00:00.000Z",
      exercises: [
        {
          exerciseSchemaId: "bench_press_barbell",
          id: "exercise-bench",
          sets: [
            {
              actual: { reps: 5, rpe: 8.5, weightLbs: 225 },
              completedAt: "2026-04-16T09:20:00.000Z",
              id: "bench-set-1",
              planned: { reps: 5, rpe: 8, weightLbs: 225 },
              status: "done",
            },
            {
              id: "bench-set-2",
              planned: { reps: 5, rpe: 8, weightLbs: 225 },
            },
            {
              id: "bench-set-3",
              planned: { reps: 6, rpe: 7.5, weightLbs: 215 },
            },
          ],
          status: "active",
        },
        {
          exerciseSchemaId: "machine_row",
          id: "exercise-row",
          sets: [{ id: "row-set-1", planned: { reps: 12, rpe: 8, weightLbs: 110 } }],
        },
      ],
      id: "workout-replace",
      title: "Upper Body",
      version: 7,
    });

    const result = await workoutToolService.patchWorkout({
      expectedVersion: 7,
      ops: [
        {
          exerciseId: "exercise-bench",
          replacement: {
            exerciseSchemaId: "bench_press_dumbbell",
            setTemplates: [
              {
                count: 2,
                designation: "working",
                planned: {
                  reps: 8,
                  rpe: 7,
                  weightLbs: 70,
                },
              },
            ],
          },
          type: "replace_exercise",
        },
      ],
      reason: "Shoulder irritation",
      workoutId: "workout-replace",
    });

    expect(result).toMatchObject({
      ok: true,
      version: 8,
      workoutId: "workout-replace",
    });

    const detail = await workoutRouteService.loadWorkoutDetail({ workoutId: "workout-replace" });

    expect(detail.workout.version).toBe(8);
    expect(detail.exercises.map((exercise) => exercise.id)).toEqual([
      "exercise-bench",
      detail.exercises[1]?.id,
      "exercise-row",
    ]);
    expect(detail.exercises[0]).toMatchObject({
      exerciseSchemaId: "bench_press_barbell",
      status: "replaced",
    });
    expect(detail.exercises[0]?.sets.map((set) => set.status)).toEqual([
      "done",
      "skipped",
      "skipped",
    ]);
    expect(detail.exercises[0]?.sets[0]).toMatchObject({
      actual: { reps: 5, rpe: 8.5, weightLbs: 225 },
      status: "done",
    });
    expect(detail.exercises[1]).toMatchObject({
      exerciseSchemaId: "bench_press_dumbbell",
      status: "planned",
    });
    expect(detail.exercises[1]?.sets).toHaveLength(2);
    expect(detail.exercises[1]?.sets.every((set) => set.status === "tbd")).toBe(true);
    expect(detail.exercises[2]).toMatchObject({
      id: "exercise-row",
      orderIndex: 2,
    });
  });

  it("skips only remaining sets and appends the coach note", async () => {
    await insertSeedWorkout({
      date: "2026-04-16T00:00:00.000Z",
      exercises: [
        {
          coachNotes: "Original cue",
          exerciseSchemaId: "deadlift_barbell",
          id: "exercise-deadlift",
          sets: [
            {
              actual: { reps: 5, rpe: 8, weightLbs: 315 },
              completedAt: "2026-04-16T09:05:00.000Z",
              id: "deadlift-set-1",
              planned: { reps: 5, rpe: 8, weightLbs: 315 },
              status: "done",
            },
            {
              id: "deadlift-set-2",
              planned: { reps: 5, rpe: 8, weightLbs: 315 },
            },
            {
              id: "deadlift-set-3",
              planned: { reps: 5, rpe: 8, weightLbs: 305 },
            },
          ],
          status: "active",
        },
      ],
      id: "workout-skip",
      title: "Deadlift Day",
      version: 3,
    });

    const result = await workoutToolService.patchWorkout({
      expectedVersion: 3,
      ops: [
        {
          exerciseId: "exercise-deadlift",
          note: "Stop after the top set today.",
          type: "skip_remaining_sets",
        },
      ],
      reason: "Manage fatigue",
      workoutId: "workout-skip",
    });

    expect(result).toMatchObject({
      ok: true,
      version: 4,
      workoutId: "workout-skip",
    });

    const detail = await workoutRouteService.loadWorkoutDetail({ workoutId: "workout-skip" });
    const [exercise] = detail.exercises;

    expect(exercise?.status).toBe("completed");
    expect(exercise?.coachNotes).toBe("Original cue\nStop after the top set today.");
    expect(exercise?.sets.map((set) => set.status)).toEqual(["done", "skipped", "skipped"]);
    expect(exercise?.sets[0]?.actual.weightLbs).toBe(315);
    expect(exercise?.sets[1]?.actual).toEqual({
      reps: null,
      rpe: null,
      weightLbs: null,
    });
  });

  it("rejects retargeting a completed set", async () => {
    await insertSeedWorkout({
      date: "2026-04-16T00:00:00.000Z",
      exercises: [
        {
          exerciseSchemaId: "front_squat",
          id: "exercise-front-squat",
          sets: [
            {
              actual: { reps: 4, rpe: 8, weightLbs: 245 },
              completedAt: "2026-04-16T09:10:00.000Z",
              id: "front-squat-set-1",
              planned: { reps: 4, rpe: 8, weightLbs: 245 },
              status: "done",
            },
            {
              id: "front-squat-set-2",
              planned: { reps: 4, rpe: 8, weightLbs: 245 },
            },
          ],
          status: "active",
        },
      ],
      id: "workout-retarget",
      title: "Front Squat",
      version: 4,
    });

    const result = await workoutToolService.patchWorkout({
      expectedVersion: 4,
      ops: [
        {
          exerciseId: "exercise-front-squat",
          setUpdates: [
            {
              planned: {
                reps: 3,
                weightLbs: 255,
              },
              setId: "front-squat-set-1",
            },
          ],
          type: "update_exercise_targets",
        },
      ],
      reason: "Change plan",
      workoutId: "workout-retarget",
    });

    expect(result).toMatchObject({
      code: "MUTATION_ERROR",
      ok: false,
      workoutId: "workout-retarget",
    });

    const detail = await workoutRouteService.loadWorkoutDetail({ workoutId: "workout-retarget" });

    expect(detail.workout.version).toBe(4);
    expect(detail.exercises[0]?.sets[0]).toMatchObject({
      planned: { reps: 4, rpe: 8, weightLbs: 245 },
      status: "done",
    });
    expect(detail.exercises[0]?.sets[1]).toMatchObject({
      planned: { reps: 4, rpe: 8, weightLbs: 245 },
      status: "tbd",
    });
  });

  it("returns the current version when the expected version is stale", async () => {
    await insertSeedWorkout({
      date: "2026-04-16T00:00:00.000Z",
      exercises: [
        {
          exerciseSchemaId: "goblet_squat",
          id: "exercise-goblet",
          sets: [{ id: "goblet-set-1", planned: { reps: 10, rpe: 7, weightLbs: 80 } }],
        },
      ],
      id: "workout-conflict",
      title: "Accessory Day",
      version: 2,
    });

    const result = await workoutToolService.patchWorkout({
      expectedVersion: 1,
      ops: [
        {
          field: "coach",
          scope: "workout",
          text: "Swap if the rack is busy.",
          type: "add_note",
        },
      ],
      reason: "Stale client",
      workoutId: "workout-conflict",
    });

    expect(result).toEqual({
      code: "VERSION_MISMATCH",
      currentVersion: 2,
      message: "Version mismatch for workout-conflict: expected 1, got 2",
      ok: false,
      workoutId: "workout-conflict",
    });

    const detail = await workoutRouteService.loadWorkoutDetail({ workoutId: "workout-conflict" });

    expect(detail.workout.version).toBe(2);
    expect(detail.workout.coachNotes).toBeNull();
  });
});
