import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkoutDetailLoaderData } from "../../app/features/workouts/contracts";
import {
  applyOptimisticWorkoutDetail,
  getPendingWorkoutMutations,
} from "../../app/features/workouts/optimistic-detail";

const BASE_LOADED_AT = "2026-04-21T10:00:00.000Z";
const FIXED_NOW = "2026-04-21T10:05:00.000Z";

const BASE_WORKOUT_DETAIL = {
  agentTarget: {
    instanceName: "workout:workout-1",
    kind: "workout",
  },
  exercises: [
    {
      classification: "main_lift",
      coachNotes: null,
      displayName: "Bench Press (Barbell)",
      equipment: ["barbell"],
      exerciseSchemaId: "bench_press_barbell",
      exerciseSlug: "bench-press-barbell",
      id: "exercise-1",
      logging: {
        loadTracking: "weight_lbs",
        supportsReps: true,
        supportsRpe: true,
      },
      movementPattern: "horizontal_push",
      orderIndex: 0,
      restSeconds: 90,
      sets: [
        {
          actual: {
            rpe: null,
            weightLbs: null,
          },
          confirmedAt: null,
          designation: "working",
          id: "set-1",
          orderIndex: 0,
          planned: {
            rpe: null,
            weightLbs: 225,
          },
          previous: null,
          personalRecord: null,
          reps: 5,
        },
        {
          actual: {
            rpe: null,
            weightLbs: null,
          },
          confirmedAt: null,
          designation: "working",
          id: "set-2",
          orderIndex: 1,
          planned: {
            rpe: null,
            weightLbs: 225,
          },
          previous: null,
          personalRecord: null,
          reps: 5,
        },
      ],
      status: "planned",
      userNotes: null,
    },
  ],
  loadedAt: BASE_LOADED_AT,
  progress: {
    confirmed: 0,
    total: 2,
    unconfirmed: 2,
  },
  workout: {
    coachNotes: null,
    completedAt: null,
    createdAt: "2026-04-21T09:50:00.000Z",
    date: "2026-04-21T00:00:00.000Z",
    id: "workout-1",
    source: "manual",
    startedAt: null,
    status: "planned",
    title: "Upper A",
    updatedAt: BASE_LOADED_AT,
    userNotes: null,
    version: 1,
  },
} satisfies WorkoutDetailLoaderData;

function createLoaderData(): WorkoutDetailLoaderData {
  return structuredClone(BASE_WORKOUT_DETAIL);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("workout optimistic detail helpers", () => {
  it("filters pending submissions down to valid mutations for the active workout", () => {
    const validFormData = new FormData();

    validFormData.set("action", "add_set");
    validFormData.set("expectedVersion", "1");
    validFormData.set("exerciseId", "exercise-1");
    validFormData.set("reps", "8");
    validFormData.set("weightLbs", "205");
    validFormData.set("workoutId", "workout-1");

    const invalidFormData = new FormData();

    invalidFormData.set("action", "add_set");
    invalidFormData.set("expectedVersion", "1");
    invalidFormData.set("workoutId", "workout-1");

    const otherWorkoutFormData = new FormData();

    otherWorkoutFormData.set("action", "finish_workout");
    otherWorkoutFormData.set("expectedVersion", "3");
    otherWorkoutFormData.set("workoutId", "workout-2");

    const pendingMutations = getPendingWorkoutMutations(
      [
        {
          formData: validFormData,
          key: "fetcher:add-set",
        },
        {
          formData: invalidFormData,
          key: "fetcher:invalid",
        },
        {
          formData: otherWorkoutFormData,
          key: "navigation",
        },
      ],
      "workout-1",
    );

    expect(pendingMutations).toHaveLength(1);
    expect(pendingMutations[0]).toMatchObject({
      key: "fetcher:add-set",
      mutation: {
        action: "add_set",
        exerciseId: "exercise-1",
        planned: {
          weightLbs: 205,
        },
        reps: 8,
        workoutId: "workout-1",
      },
    });
  });

  it("applies optimistic exercise rest timer edits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));

    const optimisticDetail = applyOptimisticWorkoutDetail(createLoaderData(), [
      {
        key: "fetcher:update-rest-timer",
        mutation: {
          action: "update_exercise_rest_seconds",
          exerciseId: "exercise-1",
          expectedVersion: 1,
          restSeconds: 150,
          workoutId: "workout-1",
        },
      },
    ]);

    expect(optimisticDetail.exercises[0]?.restSeconds).toBe(150);
    expect(optimisticDetail.workout.updatedAt).toBe(FIXED_NOW);
    expect(optimisticDetail.workout.version).toBe(2);
  });

  it("projects live start and add-set mutations onto workout detail", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));

    const optimisticDetail = applyOptimisticWorkoutDetail(createLoaderData(), [
      {
        key: "navigation:start",
        mutation: {
          action: "start_workout",
          expectedVersion: 1,
          startedAt: "2026-04-21T10:01:00.000Z",
          workoutId: "workout-1",
        },
      },
      {
        key: "fetcher:add-set",
        mutation: {
          action: "add_set",
          designation: "working",
          exerciseId: "exercise-1",
          expectedVersion: 2,
          insertAfterSetId: "set-2",
          planned: {
            weightLbs: 205,
          },
          reps: 8,
          workoutId: "workout-1",
        },
      },
    ]);

    expect(optimisticDetail.workout.status).toBe("active");
    expect(optimisticDetail.workout.startedAt).toBe("2026-04-21T10:01:00.000Z");
    expect(optimisticDetail.workout.updatedAt).toBe(FIXED_NOW);
    expect(optimisticDetail.workout.version).toBe(3);
    expect(optimisticDetail.loadedAt).toBe(FIXED_NOW);
    expect(optimisticDetail.exercises[0]?.sets).toHaveLength(3);
    expect(optimisticDetail.exercises[0]?.sets[2]).toMatchObject({
      designation: "working",
      id: "optimistic-set:fetcher:add-set",
      orderIndex: 2,
      planned: {
        rpe: null,
        weightLbs: 205,
      },
      reps: 8,
    });
    expect(optimisticDetail.progress).toEqual({
      confirmed: 0,
      total: 3,
      unconfirmed: 3,
    });
  });

  it("does not apply invalid optimistic edits that would clear a confirmed set", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));

    const loaderData = createLoaderData();
    const confirmedSet = loaderData.exercises[0]?.sets[0];

    if (!confirmedSet) {
      throw new Error("Expected seed workout to include the first set.");
    }

    loaderData.workout.startedAt = "2026-04-21T10:01:00.000Z";
    loaderData.workout.status = "active";
    loaderData.exercises[0].status = "active";
    loaderData.progress = {
      confirmed: 1,
      total: 2,
      unconfirmed: 1,
    };
    confirmedSet.actual.weightLbs = 225;
    confirmedSet.confirmedAt = "2026-04-21T10:02:00.000Z";
    confirmedSet.reps = 5;

    const optimisticDetail = applyOptimisticWorkoutDetail(loaderData, [
      {
        key: "fetcher:clear-confirmed-set",
        mutation: {
          action: "update_set_actuals",
          actual: {
            weightLbs: null,
          },
          exerciseId: "exercise-1",
          expectedVersion: 1,
          reps: null,
          setId: "set-1",
          workoutId: "workout-1",
        },
      },
    ]);

    expect(optimisticDetail.exercises[0]?.sets[0]).toMatchObject({
      actual: {
        rpe: null,
        weightLbs: 225,
      },
      confirmedAt: "2026-04-21T10:02:00.000Z",
      reps: 5,
    });
    expect(optimisticDetail.workout.updatedAt).toBe(BASE_LOADED_AT);
    expect(optimisticDetail.workout.version).toBe(1);
    expect(optimisticDetail.loadedAt).toBe(BASE_LOADED_AT);
  });

  it("cascades optimistic logged-weight edits across matching future working sets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));

    const loaderData = createLoaderData();

    loaderData.workout.startedAt = "2026-04-21T10:01:00.000Z";
    loaderData.workout.status = "active";
    loaderData.exercises[0].status = "active";
    loaderData.exercises[0].sets = [
      {
        actual: {
          rpe: null,
          weightLbs: 225,
        },
        confirmedAt: "2026-04-21T10:02:00.000Z",
        designation: "working",
        id: "set-1",
        orderIndex: 0,
        planned: {
          rpe: null,
          weightLbs: 225,
        },
        previous: null,
        personalRecord: null,
        reps: 5,
      },
      {
        actual: {
          rpe: null,
          weightLbs: null,
        },
        confirmedAt: null,
        designation: "working",
        id: "set-2",
        orderIndex: 1,
        planned: {
          rpe: null,
          weightLbs: 225,
        },
        previous: null,
        personalRecord: null,
        reps: 5,
      },
      {
        actual: {
          rpe: null,
          weightLbs: null,
        },
        confirmedAt: null,
        designation: "working",
        id: "set-3",
        orderIndex: 2,
        planned: {
          rpe: null,
          weightLbs: 225,
        },
        previous: null,
        personalRecord: null,
        reps: 5,
      },
      {
        actual: {
          rpe: null,
          weightLbs: 225,
        },
        confirmedAt: "2026-04-21T10:09:00.000Z",
        designation: "working",
        id: "set-4",
        orderIndex: 3,
        planned: {
          rpe: null,
          weightLbs: 225,
        },
        previous: null,
        personalRecord: null,
        reps: 5,
      },
      {
        actual: {
          rpe: null,
          weightLbs: null,
        },
        confirmedAt: null,
        designation: "working",
        id: "set-5",
        orderIndex: 4,
        planned: {
          rpe: null,
          weightLbs: 225,
        },
        previous: null,
        personalRecord: null,
        reps: 5,
      },
    ];
    loaderData.progress = {
      confirmed: 2,
      total: 5,
      unconfirmed: 3,
    };

    const optimisticDetail = applyOptimisticWorkoutDetail(loaderData, [
      {
        key: "fetcher:update-set-actuals",
        mutation: {
          action: "update_set_actuals",
          actual: {
            weightLbs: 235,
          },
          exerciseId: "exercise-1",
          expectedVersion: 1,
          setId: "set-2",
          workoutId: "workout-1",
        },
      },
    ]);

    expect(optimisticDetail.exercises[0]?.sets.map((set) => set.actual.weightLbs)).toEqual([
      225,
      235,
      235,
      225,
      null,
    ]);
    expect(optimisticDetail.workout.updatedAt).toBe(FIXED_NOW);
    expect(optimisticDetail.workout.version).toBe(2);
    expect(optimisticDetail.loadedAt).toBe(FIXED_NOW);
  });
  it("cascades optimistic reps edits across matching future working sets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));

    const loaderData = createLoaderData();

    loaderData.workout.startedAt = "2026-04-21T10:01:00.000Z";
    loaderData.workout.status = "active";
    loaderData.exercises[0].status = "active";
    loaderData.exercises[0].sets = [
      {
        actual: {
          rpe: null,
          weightLbs: 225,
        },
        confirmedAt: "2026-04-21T10:02:00.000Z",
        designation: "working",
        id: "set-1",
        orderIndex: 0,
        planned: {
          rpe: null,
          weightLbs: 225,
        },
        previous: null,
        personalRecord: null,
        reps: 5,
      },
      {
        actual: {
          rpe: null,
          weightLbs: null,
        },
        confirmedAt: null,
        designation: "working",
        id: "set-2",
        orderIndex: 1,
        planned: {
          rpe: null,
          weightLbs: 225,
        },
        previous: null,
        personalRecord: null,
        reps: 5,
      },
      {
        actual: {
          rpe: null,
          weightLbs: null,
        },
        confirmedAt: null,
        designation: "working",
        id: "set-3",
        orderIndex: 2,
        planned: {
          rpe: null,
          weightLbs: 225,
        },
        previous: null,
        personalRecord: null,
        reps: 5,
      },
      {
        actual: {
          rpe: null,
          weightLbs: 225,
        },
        confirmedAt: "2026-04-21T10:09:00.000Z",
        designation: "working",
        id: "set-4",
        orderIndex: 3,
        planned: {
          rpe: null,
          weightLbs: 225,
        },
        previous: null,
        personalRecord: null,
        reps: 5,
      },
      {
        actual: {
          rpe: null,
          weightLbs: null,
        },
        confirmedAt: null,
        designation: "working",
        id: "set-5",
        orderIndex: 4,
        planned: {
          rpe: null,
          weightLbs: 225,
        },
        previous: null,
        personalRecord: null,
        reps: 5,
      },
    ];
    loaderData.progress = {
      confirmed: 2,
      total: 5,
      unconfirmed: 3,
    };

    const optimisticDetail = applyOptimisticWorkoutDetail(loaderData, [
      {
        key: "fetcher:update-set-actuals",
        mutation: {
          action: "update_set_actuals",
          exerciseId: "exercise-1",
          expectedVersion: 1,
          reps: 6,
          setId: "set-2",
          workoutId: "workout-1",
        },
      },
    ]);

    expect(optimisticDetail.exercises[0]?.sets.map((set) => set.reps)).toEqual([5, 6, 6, 5, 5]);
    expect(optimisticDetail.workout.updatedAt).toBe(FIXED_NOW);
    expect(optimisticDetail.workout.version).toBe(2);
    expect(optimisticDetail.loadedAt).toBe(FIXED_NOW);
  });
});
