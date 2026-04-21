import { describe, expect, it } from "vite-plus/test";

import type { WorkoutDetailLoaderData } from "../../app/features/workouts/contracts";
import { renderGeneralCoachPrompt, renderWorkoutCoachPrompt } from "../../workers/coach/prompt";

const WORKOUT_DETAIL = {
  coachTarget: {
    kind: "workout",
    workoutId: "workout-1",
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
      restSeconds: 120,
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
            rpe: 8,
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
  loadedAt: "2026-04-21T10:00:00.000Z",
  progress: {
    confirmed: 0,
    total: 1,
    unconfirmed: 1,
  },
  workout: {
    coachNotes: "Keep the bar path tight.",
    completedAt: null,
    createdAt: "2026-04-21T09:50:00.000Z",
    date: "2026-04-21T00:00:00.000Z",
    id: "workout-1",
    source: "manual",
    startedAt: null,
    status: "planned",
    title: "Upper A",
    updatedAt: "2026-04-21T10:00:00.000Z",
    userNotes: null,
    version: 3,
  },
} satisfies WorkoutDetailLoaderData;

describe("coach prompt rendering", () => {
  it("renders the general coach prompt with escaped saved profile text", () => {
    const prompt = renderGeneralCoachPrompt({
      recentWorkouts: [
        {
          date: "2026-04-20T00:00:00.000Z",
          id: "workout-123",
          status: "completed",
          title: "Lower A",
          version: 7,
        },
      ],
      userProfile:
        "Goal: reach a 315 squat & stay pain-free\nConstraint: no overhead pressing <for now>",
    });

    expect(prompt).toContain("<UserProfile>");
    expect(prompt).toContain("315 squat &amp; stay pain-free");
    expect(prompt).toContain("&lt;for now&gt;");
    expect(prompt).toContain("update_exercise_targets");
    expect(prompt).toContain("workout-123");
  });

  it("renders the workout coach prompt from the structured workout snapshot", () => {
    const prompt = renderWorkoutCoachPrompt({
      userProfile: null,
      workoutDetail: WORKOUT_DETAIL,
    });

    expect(prompt).toContain("Workout: Upper A (workout-1)");
    expect(prompt).toContain("Version: 3");
    expect(prompt).toContain("Next open set: Bench Press (Barbell) -> 225 lb, 5 reps, RPE 8");
    expect(prompt).toContain("Patch reference:");
    expect(prompt).toContain("Bench Press (Barbell) [exercise-1]");
    expect(prompt).toContain("No saved user profile.");
  });
});
