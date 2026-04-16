import { z } from "zod";

import {
  EXERCISE_CLASSIFICATIONS,
  EXERCISE_EQUIPMENT,
  EXERCISE_LOAD_TRACKING_MODES,
  EXERCISE_MOVEMENT_PATTERNS,
  EXERCISE_SCHEMA_IDS,
} from "./schema.ts";

const EXERCISE_HISTORY_FILTERS = ["all", "done", "not_done"] as const;

const nonEmptyStringSchema = z.string().trim().min(1);
const nonNegativeIntegerSchema = z.int().nonnegative();
const exerciseSchemaIdSchema = z.enum(EXERCISE_SCHEMA_IDS);
const exerciseHistoryFilterSchema = z.enum(EXERCISE_HISTORY_FILTERS);

const exerciseLoggingSchema = z.strictObject({
  loadTracking: z.enum(EXERCISE_LOAD_TRACKING_MODES),
  supportsReps: z.boolean(),
  supportsRpe: z.boolean(),
});

const exerciseListProgressSchema = z.strictObject({
  firstSessionMaxWeightLbs: z.number().nonnegative().nullable(),
  latestSessionMaxWeightLbs: z.number().nonnegative().nullable(),
});

export const exerciseListSearchSchema = z.strictObject({
  equipment: z.enum(EXERCISE_EQUIPMENT).optional(),
  history: exerciseHistoryFilterSchema.default("all"),
  type: z.enum(EXERCISE_CLASSIFICATIONS).optional(),
});

export const exerciseListItemSchema = z
  .strictObject({
    classification: z.enum(EXERCISE_CLASSIFICATIONS),
    displayName: nonEmptyStringSchema,
    equipment: z.array(z.enum(EXERCISE_EQUIPMENT)).min(1),
    exerciseSchemaId: exerciseSchemaIdSchema,
    exerciseSlug: nonEmptyStringSchema,
    hasDone: z.boolean(),
    logging: exerciseLoggingSchema,
    movementPattern: z.enum(EXERCISE_MOVEMENT_PATTERNS),
    progress: exerciseListProgressSchema,
    totalSets: nonNegativeIntegerSchema,
    totalWorkouts: nonNegativeIntegerSchema,
  })
  .superRefine((item, context) => {
    const hasWeightedProgress =
      item.progress.firstSessionMaxWeightLbs != null &&
      item.progress.latestSessionMaxWeightLbs != null;

    if (hasWeightedProgress && !item.hasDone) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Weighted progress requires hasDone to be true.",
        path: ["hasDone"],
      });
    }
  });

export const exerciseListLoaderDataSchema = z.strictObject({
  filters: exerciseListSearchSchema,
  items: z.array(exerciseListItemSchema),
});

export type ExerciseHistoryFilter = z.infer<typeof exerciseHistoryFilterSchema>;
export type ExerciseListSearch = z.infer<typeof exerciseListSearchSchema>;
export type ExerciseListItem = z.infer<typeof exerciseListItemSchema>;
export type ExerciseListLoaderData = z.infer<typeof exerciseListLoaderDataSchema>;
