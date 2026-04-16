import type { z } from "zod";

import {
  addSetInputSchema,
  confirmSetInputSchema,
  finishWorkoutInputSchema,
  removeSetInputSchema,
  reorderExerciseInputSchema,
  skipSetInputSchema,
  startWorkoutInputSchema,
  updateExerciseNotesInputSchema,
  updateSetActualsInputSchema,
  updateWorkoutNotesInputSchema,
  workoutMutationInputSchema,
} from "./actions.ts";

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : null;
}

function getOptionalNullableNumber(formData: FormData, key: string) {
  const value = getFormValue(formData, key);

  if (value == null) {
    return undefined;
  }

  if (value === "") {
    return null;
  }

  const parsedNumber = Number(value);

  return Number.isFinite(parsedNumber) ? parsedNumber : value;
}

function getOptionalString(formData: FormData, key: string) {
  const value = getFormValue(formData, key);

  if (value == null) {
    return undefined;
  }

  return value === "" ? null : value;
}

/**
 * Parses RR7 form submissions into the shared workout mutation union so the
 * route boundary matches the same contract used by the service layer.
 */
export function safeParseWorkoutMutationFormData(formData: FormData) {
  const action = getFormValue(formData, "action");
  const base = {
    expectedVersion: Number(getFormValue(formData, "expectedVersion")),
    workoutId: getFormValue(formData, "workoutId"),
  };

  switch (action) {
    case "start_workout":
      return startWorkoutInputSchema.safeParse({
        action,
        ...base,
        startedAt: getFormValue(formData, "startedAt") ?? undefined,
      });
    case "update_set_actuals":
      return updateSetActualsInputSchema.safeParse({
        action,
        ...base,
        actual: {
          reps: getOptionalNullableNumber(formData, "reps"),
          weightLbs: getOptionalNullableNumber(formData, "weightLbs"),
        },
        exerciseId: getFormValue(formData, "exerciseId"),
        setId: getFormValue(formData, "setId"),
      });
    case "confirm_set":
      return confirmSetInputSchema.safeParse({
        action,
        ...base,
        actual: {
          reps: getOptionalNullableNumber(formData, "reps"),
          rpe: getOptionalNullableNumber(formData, "rpe"),
          weightLbs: getOptionalNullableNumber(formData, "weightLbs"),
        },
        exerciseId: getFormValue(formData, "exerciseId"),
        setId: getFormValue(formData, "setId"),
      });
    case "skip_set":
      return skipSetInputSchema.safeParse({
        action,
        ...base,
        exerciseId: getFormValue(formData, "exerciseId"),
        setId: getFormValue(formData, "setId"),
      });
    case "add_set":
      return addSetInputSchema.safeParse({
        action,
        ...base,
        designation: getFormValue(formData, "designation") ?? undefined,
        exerciseId: getFormValue(formData, "exerciseId"),
        insertAfterSetId: getOptionalString(formData, "insertAfterSetId"),
        planned: {
          reps: getOptionalNullableNumber(formData, "reps"),
          weightLbs: getOptionalNullableNumber(formData, "weightLbs"),
        },
      });
    case "remove_set":
      return removeSetInputSchema.safeParse({
        action,
        ...base,
        exerciseId: getFormValue(formData, "exerciseId"),
        setId: getFormValue(formData, "setId"),
      });
    case "reorder_exercise":
      return reorderExerciseInputSchema.safeParse({
        action,
        ...base,
        exerciseId: getFormValue(formData, "exerciseId"),
        targetIndex: Number(getFormValue(formData, "targetIndex")),
      });
    case "update_workout_notes":
      return updateWorkoutNotesInputSchema.safeParse({
        action,
        ...base,
        notes: {
          coachNotes: getOptionalString(formData, "coachNotes"),
          userNotes: getOptionalString(formData, "userNotes"),
        },
      });
    case "update_exercise_notes":
      return updateExerciseNotesInputSchema.safeParse({
        action,
        ...base,
        exerciseId: getFormValue(formData, "exerciseId"),
        notes: {
          coachNotes: getOptionalString(formData, "coachNotes"),
          userNotes: getOptionalString(formData, "userNotes"),
        },
      });
    case "finish_workout":
      return finishWorkoutInputSchema.safeParse({
        action,
        ...base,
        completedAt: getFormValue(formData, "completedAt") ?? undefined,
      });
    default:
      return workoutMutationInputSchema.safeParse({
        action,
        ...base,
      });
  }
}

export function formatWorkoutMutationParseError(error: z.ZodError) {
  return error.issues.map((issue) => issue.message).join("; ");
}
