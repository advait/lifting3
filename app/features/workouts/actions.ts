import { z } from "zod";

import { appInvalidateKeySchema, workoutEventTypeSchema } from "../app-events/schema.ts";
import { SET_KINDS } from "./interchange.ts";

export const WORKOUT_ROUTE_ACTIONS = [
  "delete_workout",
  "start_workout",
  "update_set_designation",
  "update_set_planned",
  "update_set_actuals",
  "confirm_set",
  "add_set",
  "remove_set",
  "remove_exercise",
  "reorder_exercise",
  "update_workout_notes",
  "update_exercise_notes",
  "finish_workout",
] as const;

const nonEmptyStringSchema = z.string().trim().min(1);
const nonNegativeIntegerSchema = z.int().nonnegative();
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const nullableTrimmedStringSchema = z.string().trim().min(1).nullable();
const setKindSchema = z.enum(SET_KINDS);
const workoutRouteActionSchema = z.enum(WORKOUT_ROUTE_ACTIONS);

const halfStepRpeSchema = z
  .number()
  .min(0)
  .max(10)
  .refine((value) => Number.isInteger(value * 2), {
    error: "RPE must be in 0.5 increments.",
  });

const setValuesPatchSchema = z.strictObject({
  weightLbs: z.number().nonnegative().nullable().optional(),
  reps: nonNegativeIntegerSchema.nullable().optional(),
  rpe: halfStepRpeSchema.nullable().optional(),
});

const nonEmptySetValuesPatchSchema = setValuesPatchSchema.superRefine((values, context) => {
  const hasDefinedField =
    values.weightLbs !== undefined || values.reps !== undefined || values.rpe !== undefined;

  if (!hasDefinedField) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one set field update is required.",
      path: [],
    });
  }
});

const notesPatchSchema = z
  .strictObject({
    userNotes: nullableTrimmedStringSchema.optional(),
    coachNotes: nullableTrimmedStringSchema.optional(),
  })
  .superRefine((notes, context) => {
    const hasDefinedField = notes.userNotes !== undefined || notes.coachNotes !== undefined;

    if (!hasDefinedField) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one notes field update is required.",
        path: [],
      });
    }
  });

const workoutActionBaseShape = {
  expectedVersion: nonNegativeIntegerSchema,
  workoutId: nonEmptyStringSchema,
} as const;

/** Defines the full write-side mutation vocabulary for workout routes, agents, and jobs. */
export const deleteWorkoutInputSchema = z.strictObject({
  action: z.literal("delete_workout"),
  ...workoutActionBaseShape,
});

export const startWorkoutInputSchema = z.strictObject({
  action: z.literal("start_workout"),
  ...workoutActionBaseShape,
  startedAt: isoDateTimeSchema.optional(),
});

export const updateSetActualsInputSchema = z.strictObject({
  action: z.literal("update_set_actuals"),
  ...workoutActionBaseShape,
  actual: nonEmptySetValuesPatchSchema,
  exerciseId: nonEmptyStringSchema,
  setId: nonEmptyStringSchema,
});

export const updateSetPlannedInputSchema = z.strictObject({
  action: z.literal("update_set_planned"),
  ...workoutActionBaseShape,
  exerciseId: nonEmptyStringSchema,
  planned: nonEmptySetValuesPatchSchema,
  setId: nonEmptyStringSchema,
});

export const updateSetDesignationInputSchema = z.strictObject({
  action: z.literal("update_set_designation"),
  ...workoutActionBaseShape,
  designation: setKindSchema,
  exerciseId: nonEmptyStringSchema,
  setId: nonEmptyStringSchema,
});

export const confirmSetInputSchema = z.strictObject({
  action: z.literal("confirm_set"),
  ...workoutActionBaseShape,
  actual: z.strictObject({
    reps: nonNegativeIntegerSchema.nullable().optional(),
    rpe: halfStepRpeSchema,
    weightLbs: z.number().nonnegative().nullable().optional(),
  }),
  exerciseId: nonEmptyStringSchema,
  setId: nonEmptyStringSchema,
});

export const addSetInputSchema = z.strictObject({
  action: z.literal("add_set"),
  ...workoutActionBaseShape,
  designation: setKindSchema.default("working"),
  exerciseId: nonEmptyStringSchema,
  insertAfterSetId: nonEmptyStringSchema.nullable().optional(),
  planned: setValuesPatchSchema.optional(),
});

export const removeSetInputSchema = z.strictObject({
  action: z.literal("remove_set"),
  ...workoutActionBaseShape,
  exerciseId: nonEmptyStringSchema,
  setId: nonEmptyStringSchema,
});

export const reorderExerciseInputSchema = z.strictObject({
  action: z.literal("reorder_exercise"),
  ...workoutActionBaseShape,
  exerciseId: nonEmptyStringSchema,
  targetIndex: nonNegativeIntegerSchema,
});

export const removeExerciseInputSchema = z.strictObject({
  action: z.literal("remove_exercise"),
  ...workoutActionBaseShape,
  exerciseId: nonEmptyStringSchema,
});

export const updateWorkoutNotesInputSchema = z.strictObject({
  action: z.literal("update_workout_notes"),
  ...workoutActionBaseShape,
  notes: notesPatchSchema,
});

export const updateExerciseNotesInputSchema = z.strictObject({
  action: z.literal("update_exercise_notes"),
  ...workoutActionBaseShape,
  exerciseId: nonEmptyStringSchema,
  notes: notesPatchSchema,
});

export const finishWorkoutInputSchema = z.strictObject({
  action: z.literal("finish_workout"),
  ...workoutActionBaseShape,
  completedAt: isoDateTimeSchema.optional(),
});

/** Unifies all write-side workout mutations behind one discriminated contract. */
export const workoutMutationInputSchema = z.discriminatedUnion("action", [
  deleteWorkoutInputSchema,
  startWorkoutInputSchema,
  updateSetDesignationInputSchema,
  updateSetPlannedInputSchema,
  updateSetActualsInputSchema,
  confirmSetInputSchema,
  addSetInputSchema,
  removeSetInputSchema,
  removeExerciseInputSchema,
  reorderExerciseInputSchema,
  updateWorkoutNotesInputSchema,
  updateExerciseNotesInputSchema,
  finishWorkoutInputSchema,
]);

/** Standardizes successful write responses so routes and fanout share one envelope shape. */
export const workoutMutationResultSchema = z.strictObject({
  action: workoutRouteActionSchema,
  eventId: nonEmptyStringSchema,
  eventType: workoutEventTypeSchema,
  invalidate: z.array(appInvalidateKeySchema).min(1),
  ok: z.boolean(),
  version: nonNegativeIntegerSchema,
  workoutId: nonEmptyStringSchema,
});

export type StartWorkoutInput = z.infer<typeof startWorkoutInputSchema>;
export type DeleteWorkoutInput = z.infer<typeof deleteWorkoutInputSchema>;
export type UpdateSetDesignationInput = z.infer<typeof updateSetDesignationInputSchema>;
export type UpdateSetPlannedInput = z.infer<typeof updateSetPlannedInputSchema>;
export type UpdateSetActualsInput = z.infer<typeof updateSetActualsInputSchema>;
export type ConfirmSetInput = z.infer<typeof confirmSetInputSchema>;
export type AddSetInput = z.infer<typeof addSetInputSchema>;
export type RemoveSetInput = z.infer<typeof removeSetInputSchema>;
export type RemoveExerciseInput = z.infer<typeof removeExerciseInputSchema>;
export type ReorderExerciseInput = z.infer<typeof reorderExerciseInputSchema>;
export type UpdateWorkoutNotesInput = z.infer<typeof updateWorkoutNotesInputSchema>;
export type UpdateExerciseNotesInput = z.infer<typeof updateExerciseNotesInputSchema>;
export type FinishWorkoutInput = z.infer<typeof finishWorkoutInputSchema>;
export type WorkoutMutationInput = z.infer<typeof workoutMutationInputSchema>;
export type WorkoutMutationResult = z.infer<typeof workoutMutationResultSchema>;
