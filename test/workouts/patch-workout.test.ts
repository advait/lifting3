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

async function insertSeedWorkouts(workouts: SeedWorkout[]) {
  for (const workout of workouts) {
    await insertSeedWorkout(workout);
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

describe("createWorkoutAgentToolService.createWorkout", () => {
  it("creates a planned workout from an explicit exercise plan", async () => {
    const result = await workoutToolService.createWorkout({
      coachNotes: "Stay submaximal.",
      constraints: ["knees cranky", "45 min cap"],
      exercises: [
        {
          coachNotes: "Move fast between warm-up sets.",
          exerciseSchemaId: "front_squat",
          setTemplates: [
            {
              count: 1,
              designation: "warmup",
              planned: { reps: 5, rpe: 6, weightLbs: 135 },
            },
            {
              count: 2,
              designation: "working",
              planned: { reps: 4, rpe: 7, weightLbs: 185 },
            },
          ],
          userNotes: "Heels elevated.",
        },
      ],
      intent: "Lower body deload",
      targetDate: "2026-04-20",
      userNotes: "Check how knees feel after warmups.",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.message);
    }

    const detail = await workoutRouteService.loadWorkoutDetail({ workoutId: result.workoutId });

    expect(detail.workout).toMatchObject({
      coachNotes:
        "Stay submaximal.\nPlanning intent: Lower body deload\nConstraints: knees cranky; 45 min cap",
      date: "2026-04-20T00:00:00.000Z",
      source: "agent",
      status: "planned",
      title: "Lower body deload",
      userNotes: "Check how knees feel after warmups.",
      version: 1,
    });
    expect(detail.exercises).toHaveLength(1);
    expect(detail.exercises[0]).toMatchObject({
      coachNotes: "Move fast between warm-up sets.",
      exerciseSchemaId: "front_squat",
      status: "planned",
      userNotes: "Heels elevated.",
    });
    expect(detail.exercises[0]?.sets.map((set) => set.designation)).toEqual([
      "warmup",
      "working",
      "working",
    ]);
    expect(detail.exercises[0]?.sets.every((set) => set.status === "tbd")).toBe(true);
    expect(detail.exercises[0]?.sets.map((set) => set.planned)).toEqual([
      { reps: 5, rpe: 6, weightLbs: 135 },
      { reps: 4, rpe: 7, weightLbs: 185 },
      { reps: 4, rpe: 7, weightLbs: 185 },
    ]);
  });

  it("clones a source workout into a new planned workout", async () => {
    await insertSeedWorkout({
      coachNotes: "Original workout notes",
      date: "2026-04-01T00:00:00.000Z",
      exercises: [
        {
          coachNotes: "Pause on the chest.",
          exerciseSchemaId: "bench_press_barbell",
          id: "source-exercise-bench",
          sets: [
            {
              actual: { reps: 5, rpe: 8, weightLbs: 225 },
              completedAt: "2026-04-01T09:05:00.000Z",
              id: "source-bench-set-1",
              planned: { reps: 5, rpe: 8, weightLbs: 225 },
              status: "done",
            },
            {
              id: "source-bench-set-2",
              planned: { reps: 6, rpe: 7.5, weightLbs: 215 },
              status: "skipped",
            },
          ],
          status: "completed",
          userNotes: "Use comp grip.",
        },
      ],
      id: "source-workout",
      status: "completed",
      title: "Bench Template",
      userNotes: "Source workout user notes",
      version: 5,
    });

    const result = await workoutToolService.createWorkout({
      constraints: [],
      intent: "Travel-friendly upper day",
      sourceWorkoutId: "source-workout",
      targetDate: "2026-04-22",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.message);
    }

    const sourceDetail = await workoutRouteService.loadWorkoutDetail({
      workoutId: "source-workout",
    });
    const clonedDetail = await workoutRouteService.loadWorkoutDetail({
      workoutId: result.workoutId,
    });

    expect(clonedDetail.workout).toMatchObject({
      coachNotes: "Planning intent: Travel-friendly upper day\nAdapted from: Bench Template",
      date: "2026-04-22T00:00:00.000Z",
      id: result.workoutId,
      source: "agent",
      status: "planned",
      title: "Travel-friendly upper day",
      version: 1,
    });
    expect(clonedDetail.exercises).toHaveLength(1);
    expect(clonedDetail.exercises[0]).toMatchObject({
      coachNotes: "Pause on the chest.",
      exerciseSchemaId: "bench_press_barbell",
      status: "planned",
      userNotes: "Use comp grip.",
    });
    expect(clonedDetail.exercises[0]?.id).not.toBe("source-exercise-bench");
    expect(clonedDetail.exercises[0]?.sets).toHaveLength(2);
    expect(clonedDetail.exercises[0]?.sets.every((set) => set.status === "tbd")).toBe(true);
    expect(clonedDetail.exercises[0]?.sets.every((set) => set.actual.weightLbs == null)).toBe(true);
    expect(clonedDetail.exercises[0]?.sets[0]?.id).not.toBe("source-bench-set-1");
    expect(clonedDetail.exercises[0]?.sets.map((set) => set.planned)).toEqual([
      { reps: 5, rpe: 8, weightLbs: 225 },
      { reps: 6, rpe: 7.5, weightLbs: 215 },
    ]);

    expect(sourceDetail.workout).toMatchObject({
      id: "source-workout",
      status: "completed",
      version: 5,
    });
    expect(sourceDetail.exercises[0]?.sets.map((set) => set.status)).toEqual(["done", "skipped"]);
    expect(sourceDetail.exercises[0]?.sets[0]?.actual.weightLbs).toBe(225);
  });

  it("returns a structured error for an unknown source workout", async () => {
    const result = await workoutToolService.createWorkout({
      constraints: [],
      intent: "Adapt a missing template",
      sourceWorkoutId: "does-not-exist",
      targetDate: "2026-04-24",
    });

    expect(result).toEqual({
      code: "UNKNOWN_SOURCE_WORKOUT",
      message: "Unknown workout: does-not-exist",
      ok: false,
      sourceWorkoutId: "does-not-exist",
    });
  });
});

describe("createWorkoutAgentToolService.queryHistory", () => {
  async function seedHistoryWorkouts() {
    await insertSeedWorkouts([
      {
        date: "2026-03-01T00:00:00.000Z",
        exercises: [
          {
            exerciseSchemaId: "bench_press_barbell",
            id: "bench-mar-exercise",
            sets: [
              {
                actual: { reps: 5, rpe: 8, weightLbs: 225 },
                completedAt: "2026-03-01T09:00:00.000Z",
                id: "bench-mar-set-225",
                planned: { reps: 5, rpe: 8, weightLbs: 225 },
                status: "done",
              },
            ],
            status: "completed",
          },
        ],
        id: "bench-mar",
        status: "completed",
        title: "March Bench",
      },
      {
        date: "2026-04-01T00:00:00.000Z",
        exercises: [
          {
            exerciseSchemaId: "bench_press_barbell",
            id: "bench-apr-1-exercise",
            sets: [
              {
                actual: { reps: 4, rpe: 8.5, weightLbs: 235 },
                completedAt: "2026-04-01T09:00:00.000Z",
                id: "bench-apr-1-top",
                planned: { reps: 4, rpe: 8, weightLbs: 235 },
                status: "done",
              },
              {
                actual: { reps: 6, rpe: 7.5, weightLbs: 225 },
                completedAt: "2026-04-01T09:08:00.000Z",
                id: "bench-apr-1-backoff",
                planned: { reps: 6, rpe: 7.5, weightLbs: 225 },
                status: "done",
              },
            ],
            status: "completed",
          },
        ],
        id: "bench-apr-1",
        status: "completed",
        title: "April Bench One",
      },
      {
        date: "2026-04-10T00:00:00.000Z",
        exercises: [
          {
            exerciseSchemaId: "bench_press_barbell",
            id: "bench-apr-2-exercise",
            sets: [
              {
                actual: { reps: 3, rpe: 9, weightLbs: 240 },
                completedAt: "2026-04-10T09:00:00.000Z",
                id: "bench-apr-2-top",
                planned: { reps: 3, rpe: 8.5, weightLbs: 240 },
                status: "done",
              },
              {
                actual: { reps: 8, rpe: 8, weightLbs: 225 },
                completedAt: "2026-04-10T09:10:00.000Z",
                id: "bench-apr-2-backoff",
                planned: { reps: 8, rpe: 8, weightLbs: 225 },
                status: "done",
              },
            ],
            status: "completed",
          },
        ],
        id: "bench-apr-2",
        status: "completed",
        title: "April Bench Two",
      },
      {
        date: "2026-04-15T00:00:00.000Z",
        exercises: [
          {
            exerciseSchemaId: "bench_press_barbell",
            id: "bench-canceled-exercise",
            sets: [
              {
                actual: { reps: 1, rpe: 10, weightLbs: 300 },
                completedAt: "2026-04-15T09:00:00.000Z",
                id: "bench-canceled-top",
                planned: { reps: 1, rpe: 9.5, weightLbs: 300 },
                status: "done",
              },
            ],
            status: "completed",
          },
        ],
        id: "bench-canceled",
        status: "canceled",
        title: "Canceled Bench",
      },
      {
        date: "2026-04-12T00:00:00.000Z",
        exercises: [
          {
            exerciseSchemaId: "deadlift_barbell",
            id: "deadlift-apr-exercise",
            sets: [
              {
                actual: { reps: 5, rpe: 8.5, weightLbs: 365 },
                completedAt: "2026-04-12T09:00:00.000Z",
                id: "deadlift-apr-top",
                planned: { reps: 5, rpe: 8, weightLbs: 365 },
                status: "done",
              },
            ],
            status: "completed",
          },
        ],
        id: "deadlift-apr",
        status: "completed",
        title: "April Deadlift",
      },
    ]);
  }

  it("returns session frequency with a compare-window delta", async () => {
    await seedHistoryWorkouts();

    const result = await workoutToolService.queryHistory({
      compareWindow: {
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
      },
      filters: {
        dateFrom: "2026-04-01",
        dateTo: "2026-04-30",
        exerciseSchemaId: "bench_press_barbell",
        status: ["completed"],
      },
      metric: "frequency",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.result).toMatchObject({
      sampleSize: 2,
      unit: "count",
      value: 2,
    });
    expect(result.result.sessions).toEqual([
      {
        date: "2026-04-10T00:00:00.000Z",
        title: "April Bench Two",
        value: 1,
        workoutId: "bench-apr-2",
        workoutStatus: "completed",
      },
      {
        date: "2026-04-01T00:00:00.000Z",
        title: "April Bench One",
        value: 1,
        workoutId: "bench-apr-1",
        workoutStatus: "completed",
      },
    ]);
    expect(result.compare).toEqual({
      delta: 1,
      sampleSize: 1,
      value: 1,
      window: {
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
      },
    });
  });

  it("aggregates reps_at_load and rejects missing load filters", async () => {
    await seedHistoryWorkouts();

    const invalidResult = await workoutToolService.queryHistory({
      filters: {
        exerciseSchemaId: "bench_press_barbell",
        status: ["completed"],
      },
      metric: "reps_at_load",
    });

    expect(invalidResult).toEqual({
      code: "INVALID_FILTERS",
      message: "reps_at_load requires filters.loadLbs.",
      ok: false,
    });

    const result = await workoutToolService.queryHistory({
      filters: {
        exerciseSchemaId: "bench_press_barbell",
        loadLbs: 225,
        status: ["completed"],
      },
      metric: "reps_at_load",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.details).toEqual({ loadLbs: 225 });
    expect(result.result).toMatchObject({
      sampleSize: 3,
      unit: "reps",
      value: 19,
    });
    expect(result.result.sessions).toEqual([
      {
        date: "2026-04-10T00:00:00.000Z",
        title: "April Bench Two",
        value: 8,
        workoutId: "bench-apr-2",
        workoutStatus: "completed",
      },
      {
        date: "2026-04-01T00:00:00.000Z",
        title: "April Bench One",
        value: 6,
        workoutId: "bench-apr-1",
        workoutStatus: "completed",
      },
      {
        date: "2026-03-01T00:00:00.000Z",
        title: "March Bench",
        value: 5,
        workoutId: "bench-mar",
        workoutStatus: "completed",
      },
    ]);
  });

  it("calculates filtered max load, top set, e1rm, and best session", async () => {
    await seedHistoryWorkouts();

    const maxLoadResult = await workoutToolService.queryHistory({
      filters: {
        exerciseSchemaId: "bench_press_barbell",
        status: ["completed"],
      },
      metric: "max_load",
    });
    const topSetResult = await workoutToolService.queryHistory({
      filters: {
        exerciseSchemaId: "bench_press_barbell",
        status: ["completed"],
      },
      metric: "top_set",
    });
    const e1rmResult = await workoutToolService.queryHistory({
      filters: {
        exerciseSchemaId: "bench_press_barbell",
        status: ["completed"],
      },
      metric: "e1rm",
    });
    const bestSessionResult = await workoutToolService.queryHistory({
      filters: {
        exerciseSchemaId: "bench_press_barbell",
        status: ["completed"],
      },
      metric: "best_session",
    });

    expect(maxLoadResult.ok).toBe(true);
    expect(topSetResult.ok).toBe(true);
    expect(e1rmResult.ok).toBe(true);
    expect(bestSessionResult.ok).toBe(true);

    if (!maxLoadResult.ok || !topSetResult.ok || !e1rmResult.ok || !bestSessionResult.ok) {
      throw new Error("Expected all history queries to succeed.");
    }

    expect(maxLoadResult.result).toMatchObject({
      sampleSize: 5,
      unit: "load_lbs",
      value: 240,
    });
    expect(maxLoadResult.result.sessions[0]).toEqual({
      date: "2026-04-10T00:00:00.000Z",
      title: "April Bench Two",
      value: 240,
      workoutId: "bench-apr-2",
      workoutStatus: "completed",
    });

    expect(topSetResult.details).toEqual({
      reps: 3,
      rpe: 9,
      setId: "bench-apr-2-top",
      workoutId: "bench-apr-2",
    });
    expect(topSetResult.result).toMatchObject({
      sampleSize: 5,
      unit: "load_lbs",
      value: "240 lb x 3",
    });

    expect(e1rmResult.result).toMatchObject({
      sampleSize: 5,
      unit: "e1rm_lbs",
      value: 285,
    });
    expect(e1rmResult.result.sessions[0]).toEqual({
      date: "2026-04-10T00:00:00.000Z",
      title: "April Bench Two",
      value: 285,
      workoutId: "bench-apr-2",
      workoutStatus: "completed",
    });

    expect(bestSessionResult.details).toEqual({
      metric: "volume",
      workoutId: "bench-apr-2",
    });
    expect(bestSessionResult.result).toMatchObject({
      sampleSize: 3,
      unit: "volume_lbs",
      value: "April Bench Two (2026-04-10)",
    });
  });
});
