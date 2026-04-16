import { z } from "zod";

import { EXERCISE_SCHEMA_IDS } from "../exercises/schema.ts";
import { SET_KINDS, WORKOUT_STATUSES } from "./interchange.ts";

const HISTORY_METRICS = [
  "top_set",
  "max_load",
  "reps_at_load",
  "e1rm",
  "volume",
  "frequency",
  "best_session",
] as const;
const NOTE_FIELDS = ["coach", "user"] as const;

const nonEmptyStringSchema = z.string().trim().min(1);
const nonNegativeIntegerSchema = z.int().nonnegative();
const positiveIntegerSchema = z.int().positive();
const nullableTrimmedStringSchema = z.string().trim().min(1).nullable();
const isoDateSchema = z.iso.date();
const exerciseSchemaIdSchema = z.enum(EXERCISE_SCHEMA_IDS);
const historyMetricSchema = z.enum(HISTORY_METRICS);
const noteFieldSchema = z.enum(NOTE_FIELDS);
const setKindSchema = z.enum(SET_KINDS);
const workoutStatusSchema = z.enum(WORKOUT_STATUSES);

const halfStepRpeSchema = z
  .number()
  .min(0)
  .max(10)
  .refine((value) => Number.isInteger(value * 2), {
    error: "RPE must be in 0.5 increments.",
  });

const setValuesSchema = z.strictObject({
  weightLbs: z.number().nonnegative().nullable().optional(),
  reps: nonNegativeIntegerSchema.nullable().optional(),
  rpe: halfStepRpeSchema.nullable().optional(),
});

const setValuesPatchSchema = setValuesSchema.superRefine((values, context) => {
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

export const exerciseSetTemplateSchema = z.strictObject({
  count: positiveIntegerSchema.default(1),
  designation: setKindSchema,
  planned: setValuesSchema.optional(),
});

export const workoutExercisePlanSchema = z.strictObject({
  coachNotes: nullableTrimmedStringSchema.optional(),
  exerciseSchemaId: exerciseSchemaIdSchema,
  setTemplates: z.array(exerciseSetTemplateSchema).min(1),
  userNotes: nullableTrimmedStringSchema.optional(),
});

export const createWorkoutToolInputSchema = z.strictObject({
  coachNotes: nullableTrimmedStringSchema.optional(),
  constraints: z.array(nonEmptyStringSchema).default([]),
  exercises: z.array(workoutExercisePlanSchema).optional(),
  intent: nonEmptyStringSchema,
  sourceWorkoutId: nonEmptyStringSchema.optional(),
  targetDate: isoDateSchema,
  title: nonEmptyStringSchema.optional(),
  userNotes: nullableTrimmedStringSchema.optional(),
});

const addExerciseOpSchema = z.strictObject({
  exercise: workoutExercisePlanSchema,
  targetIndex: nonNegativeIntegerSchema.optional(),
  type: z.literal("add_exercise"),
});

const replaceExerciseOpSchema = z.strictObject({
  exerciseId: nonEmptyStringSchema,
  replacement: workoutExercisePlanSchema,
  type: z.literal("replace_exercise"),
});

const skipExerciseOpSchema = z.strictObject({
  exerciseId: nonEmptyStringSchema,
  note: nonEmptyStringSchema.optional(),
  type: z.literal("skip_exercise"),
});

const reorderExerciseOpSchema = z.strictObject({
  exerciseId: nonEmptyStringSchema,
  targetIndex: nonNegativeIntegerSchema,
  type: z.literal("reorder_exercise"),
});

const updateExerciseTargetSchema = z
  .strictObject({
    designation: setKindSchema.optional(),
    planned: setValuesPatchSchema.optional(),
    setId: nonEmptyStringSchema,
  })
  .superRefine((target, context) => {
    if (target.designation === undefined && target.planned === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each set update requires a designation or planned-value change.",
        path: [],
      });
    }
  });

const updateExerciseTargetsOpSchema = z.strictObject({
  exerciseId: nonEmptyStringSchema,
  setUpdates: z.array(updateExerciseTargetSchema).min(1),
  type: z.literal("update_exercise_targets"),
});

const addSetOpSchema = z.strictObject({
  exerciseId: nonEmptyStringSchema,
  insertAfterSetId: nonEmptyStringSchema.nullable().optional(),
  template: exerciseSetTemplateSchema,
  type: z.literal("add_set"),
});

const skipRemainingSetsOpSchema = z.strictObject({
  exerciseId: nonEmptyStringSchema,
  note: nonEmptyStringSchema.optional(),
  type: z.literal("skip_remaining_sets"),
});

const addNoteOpSchema = z
  .strictObject({
    exerciseId: nonEmptyStringSchema.optional(),
    field: noteFieldSchema.default("coach"),
    scope: z.enum(["exercise", "workout"]),
    text: nonEmptyStringSchema,
    type: z.literal("add_note"),
  })
  .superRefine((note, context) => {
    if (note.scope === "exercise" && !note.exerciseId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exerciseId is required when adding an exercise note.",
        path: ["exerciseId"],
      });
    }
  });

export const patchWorkoutToolOpSchema = z.discriminatedUnion("type", [
  addExerciseOpSchema,
  replaceExerciseOpSchema,
  skipExerciseOpSchema,
  reorderExerciseOpSchema,
  updateExerciseTargetsOpSchema,
  addSetOpSchema,
  skipRemainingSetsOpSchema,
  addNoteOpSchema,
]);

export const patchWorkoutToolInputSchema = z.strictObject({
  expectedVersion: nonNegativeIntegerSchema,
  ops: z.array(patchWorkoutToolOpSchema).min(1),
  reason: nonEmptyStringSchema,
  workoutId: nonEmptyStringSchema,
});

const historyWindowSchema = z
  .strictObject({
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
  })
  .superRefine((window, context) => {
    if (
      window.dateFrom !== undefined &&
      window.dateTo !== undefined &&
      window.dateFrom > window.dateTo
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dateFrom must be on or before dateTo.",
        path: ["dateFrom"],
      });
    }
  });

export const queryHistoryToolInputSchema = z.strictObject({
  compareWindow: historyWindowSchema.optional(),
  filters: z
    .strictObject({
      dateFrom: isoDateSchema.optional(),
      dateTo: isoDateSchema.optional(),
      exerciseSchemaId: exerciseSchemaIdSchema.optional(),
      loadLbs: z.number().nonnegative().optional(),
      maxReps: nonNegativeIntegerSchema.optional(),
      minReps: nonNegativeIntegerSchema.optional(),
      status: z.array(workoutStatusSchema).default([]),
    })
    .superRefine((filters, context) => {
      if (
        filters.minReps !== undefined &&
        filters.maxReps !== undefined &&
        filters.minReps > filters.maxReps
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "minReps must be on or before maxReps.",
          path: ["minReps"],
        });
      }
    }),
  metric: historyMetricSchema,
});

export type ExerciseSetTemplateInput = z.infer<typeof exerciseSetTemplateSchema>;
export type WorkoutExercisePlanInput = z.infer<typeof workoutExercisePlanSchema>;
export type CreateWorkoutToolInput = z.infer<typeof createWorkoutToolInputSchema>;
export type PatchWorkoutToolInput = z.infer<typeof patchWorkoutToolInputSchema>;
export type PatchWorkoutToolOp = z.infer<typeof patchWorkoutToolOpSchema>;
export type QueryHistoryToolInput = z.infer<typeof queryHistoryToolInputSchema>;
