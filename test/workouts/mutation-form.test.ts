import { describe, expect, it } from "vite-plus/test";

import { safeParseWorkoutMutationFormData } from "../../app/features/workouts/mutation-form";

describe("safeParseWorkoutMutationFormData", () => {
  it("parses rest timer edits from m:ss inputs", () => {
    const formData = new FormData();

    formData.set("action", "update_exercise_rest_seconds");
    formData.set("exerciseId", "exercise-1");
    formData.set("expectedVersion", "3");
    formData.set("restSeconds", "2:30");
    formData.set("workoutId", "workout-1");

    const parsed = safeParseWorkoutMutationFormData(formData);

    expect(parsed.success).toBe(true);

    if (!parsed.success) {
      throw parsed.error;
    }

    expect(parsed.data).toMatchObject({
      action: "update_exercise_rest_seconds",
      exerciseId: "exercise-1",
      restSeconds: 150,
      workoutId: "workout-1",
    });
  });

  it("rejects malformed rest timer inputs", () => {
    const formData = new FormData();

    formData.set("action", "update_exercise_rest_seconds");
    formData.set("exerciseId", "exercise-1");
    formData.set("expectedVersion", "3");
    formData.set("restSeconds", "2:75");
    formData.set("workoutId", "workout-1");

    const parsed = safeParseWorkoutMutationFormData(formData);

    expect(parsed.success).toBe(false);
  });
});
